package com.knoux.crypt.security

import java.nio.ByteBuffer
import java.security.GeneralSecurityException
import java.nio.ByteOrder
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Small-record envelope only, NOT a large-file streaming format or backup.
 *
 * KNC1 (format version 1) is the original record format and remains readable.
 * KNC2 (format version 2) additionally authenticates the vault key version in
 * the header, so a record cannot be silently reinterpreted under another key
 * version. Both use AES-256-GCM and bind kind/id through caller AAD.
 */
class AuthenticatedEnvelope {
    companion object {
        const val MAX_PLAINTEXT_BYTES = 1024 * 1024
        private const val NONCE_BYTES = 12
        private const val TAG_BYTES = 16
        private const val HEADER_V1_BYTES = 10
        private const val HEADER_V2_BYTES = 14
        private const val FORMAT_V1 = 1
        private const val FORMAT_V2 = 2
        private const val ALG_AES_256_GCM = 1
        private val MAGIC = byteArrayOf(0x4b, 0x4e, 0x43, 0x31) // KNC1 family magic
    }

    /** Writes the original KNC1 format (key version 0 / legacy records). */
    fun encrypt(key: SecretKey, plaintext: ByteArray, associatedData: ByteArray): ByteArray =
        encryptInternal(key, plaintext, associatedData, FORMAT_V1, keyVersion = 0)

    /** Writes KNC2 with an authenticated positive key version. */
    fun encryptVersioned(
        key: SecretKey,
        plaintext: ByteArray,
        associatedData: ByteArray,
        keyVersion: Int,
    ): ByteArray {
        require(keyVersion > 0) { "Versioned records require a positive key version" }
        return encryptInternal(key, plaintext, associatedData, FORMAT_V2, keyVersion)
    }

    /** Opens either format and lets the caller hold the matching key. */
    fun decrypt(key: SecretKey, envelope: ByteArray, associatedData: ByteArray): ByteArray =
        decryptInternal(key, envelope, associatedData, expectedKeyVersion = null)

    /**
     * Opens a record and enforces that its authenticated key version matches the
     * row metadata. Legacy rows (0) must carry KNC1; DEK rows must carry KNC2.
     */
    fun decryptVersioned(
        key: SecretKey,
        envelope: ByteArray,
        associatedData: ByteArray,
        expectedKeyVersion: Int,
    ): ByteArray {
        require(expectedKeyVersion >= 0) { "Invalid expected key version" }
        return decryptInternal(key, envelope, associatedData, expectedKeyVersion)
    }

    private fun encryptInternal(
        key: SecretKey,
        plaintext: ByteArray,
        associatedData: ByteArray,
        format: Int,
        keyVersion: Int,
    ): ByteArray {
        require(plaintext.size <= MAX_PLAINTEXT_BYTES) { "Record too large" }
        require(associatedData.size in 1..4096) { "Context too large" }
        require(key.algorithm.equals("AES", ignoreCase = true)) { "AES key required" }
        key.encoded?.let { require(it.size == 32) { "AES-256 key required" } }
        // Keystore-backed keys requiring randomized encryption reject caller IVs.
        // Let the provider choose the IV for both software DEKs and root keys.
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val nonce = cipher.iv ?: throw GeneralSecurityException("Provider did not supply a GCM IV")
        require(nonce.size == NONCE_BYTES) { "Unexpected GCM IV length" }
        val header = if (format == FORMAT_V1) {
            ByteBuffer.allocate(HEADER_V1_BYTES).order(ByteOrder.BIG_ENDIAN)
                .put(MAGIC).put(FORMAT_V1.toByte()).put(ALG_AES_256_GCM.toByte())
                .putInt(plaintext.size).array()
        } else {
            ByteBuffer.allocate(HEADER_V2_BYTES).order(ByteOrder.BIG_ENDIAN)
                .put(MAGIC).put(FORMAT_V2.toByte()).put(ALG_AES_256_GCM.toByte())
                .putInt(keyVersion).putInt(plaintext.size).array()
        }
        cipher.updateAAD(header)
        cipher.updateAAD(associatedData)
        return header + nonce + cipher.doFinal(plaintext)
    }

    private fun decryptInternal(
        key: SecretKey,
        envelope: ByteArray,
        associatedData: ByteArray,
        expectedKeyVersion: Int?,
    ): ByteArray {
        require(associatedData.size in 1..4096) { "Context too large" }
        require(key.algorithm.equals("AES", ignoreCase = true)) { "AES key required" }
        key.encoded?.let { require(it.size == 32) { "AES-256 key required" } }
        require(envelope.size in (HEADER_V1_BYTES + NONCE_BYTES + TAG_BYTES)..
            (HEADER_V2_BYTES + NONCE_BYTES + TAG_BYTES + MAX_PLAINTEXT_BYTES)) { "Invalid record size" }
        val prefix = ByteBuffer.wrap(envelope, 0, 6).order(ByteOrder.BIG_ENDIAN)
        val magic = ByteArray(4).also(prefix::get)
        require(magic.contentEquals(MAGIC)) { "Unsupported record" }
        val format = prefix.get().toInt()
        require(prefix.get().toInt() == ALG_AES_256_GCM) { "Unsupported algorithm" }
        val headerBytes: Int
        val keyVersion: Int
        val length: Int
        when (format) {
            FORMAT_V1 -> {
                require(expectedKeyVersion == null || expectedKeyVersion == 0) { "Key version mismatch" }
                headerBytes = HEADER_V1_BYTES
                keyVersion = 0
                length = ByteBuffer.wrap(envelope, 6, 4).order(ByteOrder.BIG_ENDIAN).int
            }
            FORMAT_V2 -> {
                require(envelope.size >= HEADER_V2_BYTES + NONCE_BYTES + TAG_BYTES) { "Invalid record size" }
                val parsed = ByteBuffer.wrap(envelope, 6, 8).order(ByteOrder.BIG_ENDIAN)
                keyVersion = parsed.int
                length = parsed.int
                require(keyVersion > 0) { "Invalid key version" }
                require(expectedKeyVersion == null || expectedKeyVersion == keyVersion) { "Key version mismatch" }
                headerBytes = HEADER_V2_BYTES
            }
            else -> throw IllegalArgumentException("Unsupported record version")
        }
        require(length in 0..MAX_PLAINTEXT_BYTES &&
            envelope.size == headerBytes + NONCE_BYTES + TAG_BYTES + length) { "Invalid framing" }
        val header = envelope.copyOfRange(0, headerBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            key,
            GCMParameterSpec(TAG_BYTES * 8, envelope.copyOfRange(headerBytes, headerBytes + NONCE_BYTES)),
        )
        cipher.updateAAD(header)
        cipher.updateAAD(associatedData)
        // No plaintext returned before authentication succeeds. Errors propagate, no fallback.
        return cipher.doFinal(envelope, headerBytes + NONCE_BYTES, length + TAG_BYTES)
    }
}
