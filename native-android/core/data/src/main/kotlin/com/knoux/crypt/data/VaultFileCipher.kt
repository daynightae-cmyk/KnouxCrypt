package com.knoux.crypt.data

import com.knoux.crypt.security.FileEnvelope
import com.knoux.crypt.security.TamperedFileException
import java.io.Closeable
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.io.RandomAccessFile
import java.security.GeneralSecurityException
import java.security.SecureRandom
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec

/**
 * Device-key file encryption. Only callable with a live [VaultAccess]; the
 * non-exportable Keystore root never leaves this module and is never used for
 * caller-chosen chunk nonces.
 *
 * New files are KNF2: a random per-file DEK is wrapped by the Keystore root with
 * KDK1 (Keystore-generated IV), and chunks use that exportable DEK. KNF1 legacy
 * device files remain readable with the root key. Passphrase KNF1 files are
 * unaffected.
 *
 * Revocation is checked on entry, for every chunk progress callback, for the
 * header/provider, and after the envelope finishes. Callers must write to a
 * temporary sink and discard it when a [VaultLockedException] propagates.
 */
class VaultFileCipher(
    private val session: SessionManager,
    private val random: SecureRandom = SecureRandom(),
) {
    companion object {
        private val CONTEXT = "knoux.file.device.v1".toByteArray(Charsets.UTF_8)
        private const val FILE_DEK_BYTES = 32

        /** KDK1 version namespace for per-file DEK wrapping; independent of vault DEKs. */
        private const val FILE_DEK_WRAP_VERSION = 1
    }

    private val envelope = FileEnvelope()
    private val wrapper = DataKeyWrapper()

    fun encrypt(
        access: VaultAccess,
        input: InputStream,
        output: OutputStream,
        plaintextLength: Long,
        context: ByteArray = CONTEXT,
        onProgress: (FileEnvelope.Progress) -> Unit = {},
    ) {
        session.requireValid(access)
        val root = session.key(access)
        val rawDek = ByteArray(FILE_DEK_BYTES).also(random::nextBytes)
        val fileKey = SecretKeySpec(rawDek, "AES")
        rawDek.fill(0)
        val wrapped = wrapper.wrap(root, FILE_DEK_WRAP_VERSION, fileKey)
        envelope.encryptWrappedDevice(
            input = input,
            output = output,
            fileKey = fileKey,
            wrappedFileKey = wrapped,
            context = context,
            plaintextLength = plaintextLength,
            onProgress = checkpoint(access, onProgress),
        )
        session.requireValid(access)
    }

    fun decrypt(
        access: VaultAccess,
        input: InputStream,
        output: OutputStream,
        context: ByteArray = CONTEXT,
        onProgress: (FileEnvelope.Progress) -> Unit = {},
    ): Long {
        session.requireValid(access)
        val length = envelope.decryptDevice(
            input = input,
            output = output,
            context = context,
            keyProvider = { header ->
                session.requireValid(access)
                keyForHeader(access, header)
            },
            onProgress = checkpoint(access, onProgress),
        )
        session.requireValid(access)
        return length
    }

    fun headerOf(input: InputStream): FileEnvelope.Header = envelope.readHeader(input)

    /**
     * Opens a random-access, chunk-authenticated reader for an encrypted media
     * file (TASK 05). No plaintext file or cache is created: only the requested
     * chunks are decrypted into a small in-memory LRU cache, and every read
     * re-validates the live capability. Used by MediaDataSource playback.
     */
    fun openRandomAccess(
        access: VaultAccess,
        file: File,
        context: ByteArray = CONTEXT,
    ): VaultRandomAccessReader {
        session.requireValid(access)
        require(context.size in 1..FileEnvelope.MAX_CONTEXT_BYTES) { "Context size out of bounds" }
        require(file.isFile) { "Encrypted media file is missing" }
        val header = file.inputStream().buffered().use { envelope.readHeader(it) }
        val key = try {
            keyForHeader(access, header)
        } catch (failure: GeneralSecurityException) {
            throw TamperedFileException("Media file key is unavailable", failure)
        }
        session.requireValid(access)
        return VaultRandomAccessReader(
            session = session,
            access = access,
            envelope = envelope,
            header = header,
            key = key,
            context = context.copyOf(),
            file = RandomAccessFile(file, "r"),
        )
    }

    private fun keyForHeader(access: VaultAccess, header: FileEnvelope.Header): SecretKey =
        when (header.keySource) {
            FileEnvelope.KeySource.DEVICE -> session.key(access) // KNF1 legacy
            FileEnvelope.KeySource.DEVICE_WRAPPED -> {
                val wrapped = header.wrappedFileKey
                    ?: throw TamperedFileException("KNF2 header has no wrapped file key")
                try {
                    wrapper.unwrap(session.key(access), FILE_DEK_WRAP_VERSION, wrapped)
                } catch (failure: GeneralSecurityException) {
                    throw TamperedFileException("Wrapped file key failed authentication", failure)
                } catch (failure: IllegalArgumentException) {
                    throw TamperedFileException("Wrapped file key is malformed", failure)
                }
            }
            else -> throw TamperedFileException("Unsupported device-file key source")
        }

    private fun checkpoint(
        access: VaultAccess,
        onProgress: (FileEnvelope.Progress) -> Unit,
    ): (FileEnvelope.Progress) -> Unit = { progress ->
        session.requireValid(access)
        onProgress(progress)
    }
}

/**
 * Chunk-authenticated, random-access reader over a KNF1/KNF2 container.
 *
 * Used for media playback so a decrypted copy never touches storage. Only the
 * chunks needed by the current read window are decrypted into a bounded LRU
 * cache; each read re-checks the live session capability. Any authentication
 * failure, lock or close makes further reads fail instead of returning bytes.
 */
class VaultRandomAccessReader internal constructor(
    private val session: SessionManager,
    private val access: VaultAccess,
    private val envelope: FileEnvelope,
    private val header: FileEnvelope.Header,
    private val key: SecretKey,
    private val context: ByteArray,
    private val file: RandomAccessFile,
) : Closeable {
    companion object {
        private const val CACHE_CHUNKS = 4
    }

    private val lock = Any()
    private val cache = object : LinkedHashMap<Int, ByteArray>(8, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Int, ByteArray>): Boolean {
            val evict = size > CACHE_CHUNKS
            if (evict) eldest.value.fill(0)
            return evict
        }
    }
    private var closed = false

    val plaintextLength: Long get() = header.plaintextLength

    /**
     * MediaDataSource-compatible read. Returns -1 at end of stream, 0 for a
     * zero-length request, or the number of bytes copied.
     */
    fun readAt(position: Long, target: ByteArray, offset: Int, size: Int): Int = synchronized(lock) {
        checkOpen()
        session.requireValid(access)
        if (position < 0) throw IOException("Negative media position")
        if (position >= plaintextLength) return -1
        if (size == 0) return 0
        if (size < 0 || offset < 0 || offset + size > target.size) {
            throw IndexOutOfBoundsException("Invalid media read window")
        }
        val wanted = minOf(size.toLong(), plaintextLength - position).toInt()
        var cursor = position
        var copied = 0
        while (copied < wanted) {
            val index = (cursor / header.chunkSize).toInt()
            val chunk = chunk(index)
            val within = (cursor % header.chunkSize).toInt()
            if (within >= chunk.size) throw IOException("Chunk boundary mismatch")
            val take = minOf(wanted - copied, chunk.size - within)
            System.arraycopy(chunk, within, target, offset + copied, take)
            copied += take
            cursor += take
        }
        copied
    }

    private fun chunk(index: Int): ByteArray {
        checkOpen()
        cache[index]?.let { return it }
        session.requireValid(access)
        val plainLength = envelope.chunkPlaintextLength(header, index)
        val cipherLength = plainLength + FileEnvelope.TAG_BYTES
        val encrypted = ByteArray(cipherLength)
        file.seek(envelope.chunkOffset(header, index))
        file.readFully(encrypted)
        val plain = envelope.decryptChunk(header, key, context, index, encrypted)
        encrypted.fill(0)
        cache[index] = plain
        session.requireValid(access)
        return plain
    }

    private fun checkOpen() {
        if (closed) throw IOException("Media reader is closed")
    }

    override fun close() {
        synchronized(lock) {
            if (closed) return
            closed = true
            cache.values.forEach { it.fill(0) }
            cache.clear()
            context.fill(0)
            runCatching { file.close() }
        }
    }
}
