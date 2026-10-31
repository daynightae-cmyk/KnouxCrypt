package com.knoux.crypt.security

import java.io.EOFException
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.GeneralSecurityException
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Versioned, authenticated, chunked file container.
 *
 * KNF1 (legacy, still readable): fixed header + AES-256-GCM chunks. Passphrase
 * files use a PBKDF2-derived software key. Device-key KNF1 files were encrypted
 * directly with the Keystore root and a caller-chosen base nonce; that is not
 * safe for Android Keystore randomized-encryption keys, so new device files are
 * never written as KNF1. KNF1 decryption is retained for existing files.
 *
 * KNF2 (new device-key format): the header carries a per-file DEK wrapped by the
 * non-exportable Keystore root (KDK1). Chunks are encrypted with the exportable
 * per-file DEK using a random 96-bit base nonce and a 32-bit chunk counter XORed
 * into the final four bytes. The Keystore key is never used for chunk nonces.
 *
 * The header, chunk index and final-chunk flag are authenticated as AAD.
 * Implemented and JVM-tested; NOT independently audited or device-verified.
 */
class FileEnvelope(
    private val random: SecureRandom = SecureRandom(),
    private val chunkSize: Int = DEFAULT_CHUNK_SIZE,
) {
    companion object {
        const val DEFAULT_CHUNK_SIZE = 64 * 1024
        const val MAX_CHUNK_SIZE = 1024 * 1024
        const val MAX_CONTEXT_BYTES = 4096
        const val TAG_BYTES = 16
        const val NONCE_BYTES = 12
        const val SALT_BYTES = 16
        const val HEADER_BYTES = 4 + 1 + 1 + 1 + 1 + 4 + SALT_BYTES + NONCE_BYTES + 4 + 8
        const val MAX_WRAPPED_FILE_KEY_BYTES = 256

        private val MAGIC_V1 = byteArrayOf(0x4b, 0x4e, 0x46, 0x31) // KNF1
        private val MAGIC_V2 = byteArrayOf(0x4b, 0x4e, 0x46, 0x32) // KNF2
        private const val VERSION_V1 = 1
        private const val VERSION_V2 = 2
        private const val ALG_AES_256_GCM = 1
        private const val KDF_NONE = 0
        private const val KDF_PBKDF2_SHA256 = 1
        private const val KNF2_PREFIX_BYTES = 4 + 1 + 1 + 1 + 4
        private const val KNF2_TAIL_BYTES = NONCE_BYTES + 4 + 8
    }

    init {
        require(chunkSize in 1024..MAX_CHUNK_SIZE) { "Chunk size out of bounds" }
    }

    enum class KeySource(val id: Int) {
        DEVICE(1),
        PASSPHRASE(2),
        DEVICE_WRAPPED(3),
    }

    data class KdfParams(val iterations: Int, val salt: ByteArray) {
        init {
            require(iterations >= 0) { "Invalid iteration count" }
            require(salt.size == SALT_BYTES) { "Invalid salt length" }
        }

        override fun equals(other: Any?): Boolean =
            other is KdfParams && iterations == other.iterations && salt.contentEquals(other.salt)

        override fun hashCode(): Int = 31 * iterations + salt.contentHashCode()
    }

    data class Header(
        val version: Int,
        val keySource: KeySource,
        val kdf: Int,
        val kdfParams: KdfParams?,
        val chunkSize: Int,
        val plaintextLength: Long,
        internal val baseNonce: ByteArray,
        internal val raw: ByteArray,
        /** KNF2: per-file DEK wrapped by the Keystore root (KDK1). */
        val wrappedFileKey: ByteArray? = null,
    )

    data class Progress(val processedBytes: Long, val totalBytes: Long) {
        val fraction: Float
            get() = if (totalBytes <= 0L) 1f else (processedBytes.toDouble() / totalBytes).toFloat().coerceIn(0f, 1f)
    }

    /**
     * Writes legacy KNF1. Device-source callers must supply an exportable
     * software key; non-exportable Keystore keys are rejected because they
     * cannot accept a caller-provided GCM nonce.
     */
    fun encrypt(
        input: InputStream,
        output: OutputStream,
        key: SecretKey,
        keySource: KeySource,
        context: ByteArray,
        plaintextLength: Long,
        kdfParams: KdfParams? = null,
        onProgress: (Progress) -> Unit = {},
    ): Long {
        requireAes256(key)
        require(context.size in 1..MAX_CONTEXT_BYTES) { "Context size out of bounds" }
        require(plaintextLength >= 0) { "Plaintext length required" }
        require(keySource == KeySource.DEVICE || kdfParams != null) { "Passphrase key requires KDF parameters" }
        require(keySource == KeySource.DEVICE || kdfParams!!.iterations > 0) { "Invalid KDF parameters" }
        if (keySource == KeySource.DEVICE && key.encoded == null) {
            throw UnsupportedContainerException(
                "Device-key file encryption requires the wrapped per-file DEK (KNF2)",
            )
        }
        val baseNonce = ByteArray(NONCE_BYTES).also(random::nextBytes)
        val header = buildKnf1Header(keySource, kdfParams, baseNonce, plaintextLength)
        return writeChunks(input, output, key, header, baseNonce, context, plaintextLength, onProgress)
    }

    /**
     * Writes KNF2 for device-key files. [fileKey] is an exportable random DEK;
     * [wrappedFileKey] is that DEK encrypted by the Keystore root (KDK1) and is
     * authenticated as part of the header. Never reuse the same fileKey.
     */
    fun encryptWrappedDevice(
        input: InputStream,
        output: OutputStream,
        fileKey: SecretKey,
        wrappedFileKey: ByteArray,
        context: ByteArray,
        plaintextLength: Long,
        onProgress: (Progress) -> Unit = {},
    ): Long {
        requireAes256(fileKey)
        require(fileKey.encoded != null) { "KNF2 requires an exportable per-file DEK" }
        require(wrappedFileKey.isNotEmpty() && wrappedFileKey.size <= MAX_WRAPPED_FILE_KEY_BYTES) {
            "Invalid wrapped file key length"
        }
        require(context.size in 1..MAX_CONTEXT_BYTES) { "Context size out of bounds" }
        require(plaintextLength >= 0) { "Plaintext length required" }
        val baseNonce = ByteArray(NONCE_BYTES).also(random::nextBytes)
        val header = buildKnf2Header(wrappedFileKey, baseNonce, plaintextLength)
        return writeChunks(input, output, fileKey, header, baseNonce, context, plaintextLength, onProgress)
    }

    private fun writeChunks(
        input: InputStream,
        output: OutputStream,
        key: SecretKey,
        header: ByteArray,
        baseNonce: ByteArray,
        context: ByteArray,
        plaintextLength: Long,
        onProgress: (Progress) -> Unit,
    ): Long {
        val totalChunks = chunkCount(plaintextLength)
        output.write(header)
        val baseAad = header + context
        var processed = 0L
        val buffer = ByteArray(chunkSize)
        for (index in 0 until totalChunks) {
            val remaining = plaintextLength - processed
            val expected = if (remaining > chunkSize) chunkSize else remaining.toInt()
            val read = readFully(input, buffer, expected)
            if (read != expected) throw EOFException("Input shorter than declared length")
            val isLast = index == totalChunks - 1
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BYTES * 8, nonceFor(baseNonce, index)))
            cipher.updateAAD(baseAad)
            updateChunkAad(cipher, index, isLast)
            output.write(cipher.doFinal(buffer, 0, expected))
            processed += expected
            onProgress(Progress(processed, plaintextLength))
        }
        if (input.read() != -1) throw IOException("Input exceeds declared length")
        output.flush()
        return plaintextLength
    }

    /**
     * Decrypts a KNF1/KNF2 stream with an explicit expected key source.
     * [keyProvider] receives the authenticated header. Writes plaintext only
     * after each chunk authenticates; callers must use a temporary sink.
     */
    fun decrypt(
        input: InputStream,
        output: OutputStream,
        expectedKeySource: KeySource,
        context: ByteArray,
        keyProvider: (Header) -> SecretKey,
        onProgress: (Progress) -> Unit = {},
    ): Long {
        require(context.size in 1..MAX_CONTEXT_BYTES) { "Context size out of bounds" }
        val header = readHeader(input)
        require(header.keySource == expectedKeySource) { "Key source mismatch" }
        val key = keyProvider(header)
        requireAes256(key)
        return decryptChunks(input, output, header, key, context, onProgress)
    }

    /**
     * Device-file decryption that accepts KNF1 DEVICE legacy files and KNF2
     * DEVICE_WRAPPED files. For KNF2 the provider must unwrap the header's
     * wrapped per-file DEK; for KNF1 it returns the legacy root key.
     */
    fun decryptDevice(
        input: InputStream,
        output: OutputStream,
        context: ByteArray,
        keyProvider: (Header) -> SecretKey,
        onProgress: (Progress) -> Unit = {},
    ): Long {
        require(context.size in 1..MAX_CONTEXT_BYTES) { "Context size out of bounds" }
        val header = readHeader(input)
        require(header.keySource == KeySource.DEVICE || header.keySource == KeySource.DEVICE_WRAPPED) {
            "Not a device-key file"
        }
        val key = keyProvider(header)
        requireAes256(key)
        return decryptChunks(input, output, header, key, context, onProgress)
    }

    private fun decryptChunks(
        input: InputStream,
        output: OutputStream,
        header: Header,
        key: SecretKey,
        context: ByteArray,
        onProgress: (Progress) -> Unit,
    ): Long {
        val totalChunks = chunkCount(header.plaintextLength)
        val baseAad = header.raw + context
        var processed = 0L
        for (index in 0 until totalChunks) {
            val remaining = header.plaintextLength - processed
            val plainChunk = if (remaining > header.chunkSize) header.chunkSize else remaining.toInt()
            val cipherLength = plainChunk + TAG_BYTES
            val encrypted = ByteArray(cipherLength)
            val read = readFully(input, encrypted, cipherLength)
            if (read != cipherLength) throw EOFException("Ciphertext truncated")
            val isLast = index == totalChunks - 1
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                key,
                GCMParameterSpec(TAG_BYTES * 8, nonceFor(header.baseNonce, index)),
            )
            cipher.updateAAD(baseAad)
            updateChunkAad(cipher, index, isLast)
            val plain = try {
                cipher.doFinal(encrypted)
            } catch (failure: GeneralSecurityException) {
                throw TamperedFileException("Chunk $index failed authentication", failure)
            }
            if (plain.size != plainChunk) throw TamperedFileException("Chunk $index length mismatch")
            output.write(plain)
            processed += plain.size
            onProgress(Progress(processed, header.plaintextLength))
        }
        if (input.read() != -1) throw TamperedFileException("Trailing bytes after final chunk")
        output.flush()
        return header.plaintextLength
    }

    fun readHeader(input: InputStream): Header {
        val magic = ByteArray(4)
        if (readFully(input, magic, 4) != 4) throw EOFException("Missing KNF header")
        return when {
            magic.contentEquals(MAGIC_V1) -> readKnf1Header(input, magic)
            magic.contentEquals(MAGIC_V2) -> readKnf2Header(input, magic)
            else -> throw UnsupportedContainerException("Not a KNF container")
        }
    }

    private fun readKnf1Header(input: InputStream, magic: ByteArray): Header {
        val rest = ByteArray(HEADER_BYTES - 4)
        if (readFully(input, rest, rest.size) != rest.size) throw EOFException("Missing KNF1 header")
        val buffer = ByteBuffer.wrap(rest).order(ByteOrder.BIG_ENDIAN)
        val version = buffer.get().toInt() and 0xff
        if (version != VERSION_V1) throw UnsupportedContainerException("Unsupported KNF1 version $version")
        if ((buffer.get().toInt() and 0xff) != ALG_AES_256_GCM) throw UnsupportedContainerException("Unsupported algorithm")
        val source = (buffer.get().toInt() and 0xff)
        val keySource = KeySource.entries.firstOrNull { it.id == source && it != KeySource.DEVICE_WRAPPED }
            ?: throw UnsupportedContainerException("Unknown key source $source")
        val kdf = buffer.get().toInt() and 0xff
        val iterations = buffer.int
        val salt = ByteArray(SALT_BYTES).also(buffer::get)
        val nonce = ByteArray(NONCE_BYTES).also(buffer::get)
        val storedChunkSize = buffer.int
        val length = buffer.long
        if (length < 0) throw UnsupportedContainerException("Unknown plaintext length")
        if (storedChunkSize !in 1024..MAX_CHUNK_SIZE) throw UnsupportedContainerException("Chunk size out of bounds")
        val params = when {
            kdf == KDF_NONE && iterations == 0 -> null
            kdf == KDF_PBKDF2_SHA256 && iterations in 1..10_000_000 -> KdfParams(iterations, salt)
            else -> throw UnsupportedContainerException("Unsupported KDF")
        }
        if (keySource == KeySource.PASSPHRASE && params == null) {
            throw UnsupportedContainerException("Passphrase container without KDF")
        }
        val raw = magic + rest
        return Header(version, keySource, kdf, params, storedChunkSize, length, nonce, raw)
    }

    private fun readKnf2Header(input: InputStream, magic: ByteArray): Header {
        val prefix = ByteArray(KNF2_PREFIX_BYTES - 4)
        if (readFully(input, prefix, prefix.size) != prefix.size) throw EOFException("Missing KNF2 header")
        val buffer = ByteBuffer.wrap(prefix).order(ByteOrder.BIG_ENDIAN)
        val version = buffer.get().toInt() and 0xff
        if (version != VERSION_V2) throw UnsupportedContainerException("Unsupported KNF2 version $version")
        if ((buffer.get().toInt() and 0xff) != ALG_AES_256_GCM) throw UnsupportedContainerException("Unsupported algorithm")
        val source = buffer.get().toInt() and 0xff
        if (source != KeySource.DEVICE_WRAPPED.id) throw UnsupportedContainerException("KNF2 requires a wrapped file key")
        val wrappedLength = buffer.int
        if (wrappedLength !in 1..MAX_WRAPPED_FILE_KEY_BYTES) {
            throw UnsupportedContainerException("Invalid wrapped file-key length")
        }
        val wrapped = ByteArray(wrappedLength)
        if (readFully(input, wrapped, wrappedLength) != wrappedLength) throw EOFException("Missing wrapped file key")
        val tail = ByteArray(KNF2_TAIL_BYTES)
        if (readFully(input, tail, tail.size) != tail.size) throw EOFException("Missing KNF2 tail")
        val tailBuffer = ByteBuffer.wrap(tail).order(ByteOrder.BIG_ENDIAN)
        val nonce = ByteArray(NONCE_BYTES).also(tailBuffer::get)
        val storedChunkSize = tailBuffer.int
        val length = tailBuffer.long
        if (length < 0) throw UnsupportedContainerException("Unknown plaintext length")
        if (storedChunkSize !in 1024..MAX_CHUNK_SIZE) throw UnsupportedContainerException("Chunk size out of bounds")
        val raw = magic + prefix + wrapped + tail
        return Header(
            version = version,
            keySource = KeySource.DEVICE_WRAPPED,
            kdf = KDF_NONE,
            kdfParams = null,
            chunkSize = storedChunkSize,
            plaintextLength = length,
            baseNonce = nonce,
            raw = raw,
            wrappedFileKey = wrapped,
        )
    }

    private fun buildKnf1Header(
        keySource: KeySource,
        kdfParams: KdfParams?,
        baseNonce: ByteArray,
        length: Long,
    ): ByteArray = ByteBuffer.allocate(HEADER_BYTES).order(ByteOrder.BIG_ENDIAN)
        .put(MAGIC_V1)
        .put(VERSION_V1.toByte())
        .put(ALG_AES_256_GCM.toByte())
        .put(keySource.id.toByte())
        .put(if (kdfParams == null) KDF_NONE.toByte() else KDF_PBKDF2_SHA256.toByte())
        .putInt(kdfParams?.iterations ?: 0)
        .put(kdfParams?.salt ?: ByteArray(SALT_BYTES))
        .put(baseNonce)
        .putInt(chunkSize)
        .putLong(length)
        .array()

    private fun buildKnf2Header(
        wrappedFileKey: ByteArray,
        baseNonce: ByteArray,
        length: Long,
    ): ByteArray {
        val prefix = ByteBuffer.allocate(KNF2_PREFIX_BYTES).order(ByteOrder.BIG_ENDIAN)
            .put(MAGIC_V2)
            .put(VERSION_V2.toByte())
            .put(ALG_AES_256_GCM.toByte())
            .put(KeySource.DEVICE_WRAPPED.id.toByte())
            .putInt(wrappedFileKey.size)
            .array()
        val tail = ByteBuffer.allocate(KNF2_TAIL_BYTES).order(ByteOrder.BIG_ENDIAN)
            .put(baseNonce)
            .putInt(chunkSize)
            .putLong(length)
            .array()
        return prefix + wrappedFileKey + tail
    }

    private fun chunkCount(length: Long): Int {
        // An empty plaintext still gets one authenticated (tag-only) chunk so the
        // header itself is covered by an AEAD tag.
        if (length == 0L) return 1
        val count = ((length - 1) / chunkSize) + 1
        if (count > Int.MAX_VALUE) throw UnsupportedContainerException("Too many chunks")
        return count.toInt()
    }

    private fun nonceFor(base: ByteArray, index: Int): ByteArray {
        val nonce = base.copyOf()
        val counter = ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(index).array()
        for (i in 0 until 4) {
            nonce[NONCE_BYTES - 4 + i] =
                (nonce[NONCE_BYTES - 4 + i].toInt() xor counter[i].toInt()).toByte()
        }
        return nonce
    }

    private fun updateChunkAad(cipher: Cipher, index: Int, isLast: Boolean) {
        cipher.updateAAD(
            ByteBuffer.allocate(5)
                .order(ByteOrder.BIG_ENDIAN)
                .putInt(index)
                .put(if (isLast) 1 else 0)
                .array(),
        )
    }

    private fun requireAes256(key: SecretKey) {
        require(key.algorithm.equals("AES", ignoreCase = true)) { "AES key required" }
        key.encoded?.let { require(it.size == 32) { "AES-256 key required" } }
    }

    private fun readFully(input: InputStream, buffer: ByteArray, length: Int): Int {
        var total = 0
        while (total < length) {
            val read = input.read(buffer, total, length - total)
            if (read < 0) break
            if (read == 0) continue
            total += read
        }
        return total
    }
}

open class ContainerException(message: String, cause: Throwable? = null) : IOException(message, cause)
class UnsupportedContainerException(message: String, cause: Throwable? = null) : ContainerException(message, cause)
class TamperedFileException(message: String, cause: Throwable? = null) : GeneralSecurityException(message, cause)
