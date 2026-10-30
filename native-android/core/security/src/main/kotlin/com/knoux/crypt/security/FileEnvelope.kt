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
 * Versioned, authenticated, chunked file container (KNF1).
 *
 * Layout: fixed header + one AES-256-GCM ciphertext+tag per plaintext chunk.
 * The header, chunk index and final-chunk flag are authenticated as AAD, so
 * reordering, truncation, extension and cross-file chunk substitution fail.
 *
 * Nonces: a random 96-bit per-file base nonce with the 32-bit chunk counter
 * XORed into the final four bytes.  This is unique per chunk for one file and
 * unpredictable across files.  It is NOT a general-purpose key-commitment or
 * password format; callers derive/pass the data key explicitly.
 *
 * This format is implemented and unit-tested on the JVM. It is NOT yet
 * security-reviewed or device-verified; do not advertise it as audited.
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
        private val MAGIC = byteArrayOf(0x4b, 0x4e, 0x46, 0x31) // KNF1
        private const val VERSION = 1
        private const val ALG_AES_256_GCM = 1
        private const val KDF_NONE = 0
        private const val KDF_PBKDF2_SHA256 = 1
    }

    init {
        require(chunkSize in 1024..MAX_CHUNK_SIZE) { "Chunk size out of bounds" }
    }

    enum class KeySource(val id: Int) {
        DEVICE(1),
        PASSPHRASE(2),
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
    )

    data class Progress(val processedBytes: Long, val totalBytes: Long) {
        val fraction: Float
            get() = if (totalBytes <= 0L) 1f else (processedBytes.toDouble() / totalBytes).toFloat().coerceIn(0f, 1f)
    }

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

        val totalChunks = chunkCount(plaintextLength)
        val baseNonce = ByteArray(NONCE_BYTES).also(random::nextBytes)
        val header = buildHeader(keySource, kdfParams, baseNonce, plaintextLength)
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
     * Decrypts a KNF1 stream. [keyProvider] receives the authenticated header so a
     * passphrase caller can derive the key from the recorded KDF parameters.
     * Writes plaintext only after each chunk authenticates. Callers must write to
     * a temporary sink and discard it if this throws, because previously verified
     * chunks may already have been emitted.
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
        val raw = ByteArray(HEADER_BYTES)
        if (readFully(input, raw, HEADER_BYTES) != HEADER_BYTES) throw EOFException("Missing KNF1 header")
        val buffer = ByteBuffer.wrap(raw).order(ByteOrder.BIG_ENDIAN)
        val magic = ByteArray(4).also(buffer::get)
        if (!magic.contentEquals(MAGIC)) throw UnsupportedContainerException("Not a KNF1 container")
        val version = buffer.get().toInt() and 0xff
        if (version != VERSION) throw UnsupportedContainerException("Unsupported KNF1 version $version")
        if ((buffer.get().toInt() and 0xff) != ALG_AES_256_GCM) throw UnsupportedContainerException("Unsupported algorithm")
        val source = (buffer.get().toInt() and 0xff)
        val keySource = KeySource.entries.firstOrNull { it.id == source }
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
        return Header(version, keySource, kdf, params, storedChunkSize, length, nonce, raw)
    }

    private fun buildHeader(
        keySource: KeySource,
        kdfParams: KdfParams?,
        baseNonce: ByteArray,
        length: Long,
    ): ByteArray = ByteBuffer.allocate(HEADER_BYTES).order(ByteOrder.BIG_ENDIAN)
        .put(MAGIC)
        .put(VERSION.toByte())
        .put(ALG_AES_256_GCM.toByte())
        .put(keySource.id.toByte())
        .put(if (kdfParams == null) KDF_NONE.toByte() else KDF_PBKDF2_SHA256.toByte())
        .putInt(kdfParams?.iterations ?: 0)
        .put(kdfParams?.salt ?: ByteArray(SALT_BYTES))
        .put(baseNonce)
        .putInt(chunkSize)
        .putLong(length)
        .array()

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
        for (i in 0 until 4) nonce[NONCE_BYTES - 4 + i] = (nonce[NONCE_BYTES - 4 + i].toInt() xor counter[i].toInt()).toByte()
        return nonce
    }

    private fun updateChunkAad(cipher: Cipher, index: Int, isLast: Boolean) {
        cipher.updateAAD(ByteBuffer.allocate(5).order(ByteOrder.BIG_ENDIAN).putInt(index).put(if (isLast) 1 else 0).array())
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
