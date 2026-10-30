package com.knoux.crypt.security

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Small-record envelope only, NOT a large-file streaming format or backup. */
class AuthenticatedEnvelope(private val random: SecureRandom = SecureRandom()) {
    companion object {
        const val MAX_PLAINTEXT_BYTES = 1024 * 1024
        private const val NONCE_BYTES = 12
        private const val TAG_BYTES = 16
        private const val HEADER_BYTES = 10
        // KNC1 + version 1 + algorithm 1 + 32-bit plaintext length (big endian).
        private val MAGIC = byteArrayOf(0x4b, 0x4e, 0x43, 0x31)
    }
    fun encrypt(key: SecretKey, plaintext: ByteArray, associatedData: ByteArray): ByteArray {
        require(plaintext.size <= MAX_PLAINTEXT_BYTES) { "Record too large" }
        require(associatedData.size in 1..4096) { "Context too large" }
        require(key.algorithm.equals("AES", ignoreCase = true)) { "AES key required" }
        // Caller must supply a 256-bit AES key; nonexportable keys cannot be inspected here.
        key.encoded?.let { require(it.size == 32) { "AES-256 key required" } }
        val nonce = ByteArray(NONCE_BYTES).also { random.nextBytes(it) }
        val header = ByteBuffer.allocate(HEADER_BYTES).order(ByteOrder.BIG_ENDIAN)
            .put(MAGIC).put(1.toByte()).put(1.toByte()).putInt(plaintext.size).array()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BYTES * 8, nonce))
        cipher.updateAAD(header)
        cipher.updateAAD(associatedData)
        return header + nonce + cipher.doFinal(plaintext)
    }
    fun decrypt(key: SecretKey, envelope: ByteArray, associatedData: ByteArray): ByteArray {
        require(associatedData.size in 1..4096) { "Context too large" }
        require(key.algorithm.equals("AES", ignoreCase = true)) { "AES key required" }
        key.encoded?.let { require(it.size == 32) { "AES-256 key required" } }
        require(envelope.size in (HEADER_BYTES + NONCE_BYTES + TAG_BYTES)..(HEADER_BYTES + NONCE_BYTES + TAG_BYTES + MAX_PLAINTEXT_BYTES)) { "Invalid record size" }
        val header = envelope.copyOfRange(0, HEADER_BYTES)
        val parsed = ByteBuffer.wrap(header).order(ByteOrder.BIG_ENDIAN)
        val magic = ByteArray(4)
        parsed.get(magic)
        require(magic.contentEquals(MAGIC)) { "Unsupported record" }
        require(parsed.get() == 1.toByte() && parsed.get() == 1.toByte()) { "Unsupported version or algorithm" }
        val length = parsed.int
        require(length in 0..MAX_PLAINTEXT_BYTES && envelope.size == HEADER_BYTES + NONCE_BYTES + TAG_BYTES + length) { "Invalid framing" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BYTES * 8, envelope.copyOfRange(HEADER_BYTES, HEADER_BYTES + NONCE_BYTES)))
        cipher.updateAAD(header)
        cipher.updateAAD(associatedData)
        // No plaintext returned before authentication succeeds. Errors propagate, no fallback.
        return cipher.doFinal(envelope, HEADER_BYTES + NONCE_BYTES, length + TAG_BYTES)
    }
}
