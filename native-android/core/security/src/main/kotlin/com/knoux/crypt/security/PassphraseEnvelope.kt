package com.knoux.crypt.security

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Portable passphrase envelope for small secrets (text, tokens, notes payloads).
 * KNP1: versioned header + PBKDF2-HMAC-SHA256 + AES-256-GCM.
 *
 * PBKDF2 is used as the platform-provided KDF for this initial implementation.
 * It is NOT memory-hard. Mission 37 (Argon2id) remains open; do not describe
 * this format as Argon2id or as audited.
 */
class PassphraseEnvelope(private val random: SecureRandom = SecureRandom()) {
    companion object {
        const val MAX_PLAINTEXT_BYTES = 1024 * 1024
        const val MAX_CONTEXT_BYTES = 4096
        const val MIN_PRODUCTION_ITERATIONS = 310_000
        const val SALT_BYTES = 16
        const val NONCE_BYTES = 12
        const val TAG_BYTES = 16
        private const val HEADER_BYTES = 4 + 1 + 1 + 4 + SALT_BYTES + NONCE_BYTES
        private val MAGIC = byteArrayOf(0x4b, 0x4e, 0x50, 0x31) // KNP1
    }

    fun seal(
        plaintext: ByteArray,
        passphrase: CharArray,
        context: ByteArray,
        iterations: Int = MIN_PRODUCTION_ITERATIONS,
    ): ByteArray {
        require(plaintext.size <= MAX_PLAINTEXT_BYTES) { "Plaintext too large" }
        require(context.size in 1..MAX_CONTEXT_BYTES) { "Context size out of bounds" }
        require(iterations in 1_000..10_000_000) { "Iteration count out of bounds" }
        require(passphrase.isNotEmpty()) { "Empty passphrase" }
        val salt = ByteArray(SALT_BYTES).also(random::nextBytes)
        val nonce = ByteArray(NONCE_BYTES).also(random::nextBytes)
        val derived = KeyDerivation.pbkdf2(passphrase, salt, iterations, 32)
        try {
            val key = SecretKeySpec(derived, "AES")
            val header = ByteBuffer.allocate(HEADER_BYTES).order(ByteOrder.BIG_ENDIAN)
                .put(MAGIC)
                .put(1.toByte())
                .put(1.toByte())
                .putInt(iterations)
                .put(salt)
                .put(nonce)
                .array()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BYTES * 8, nonce))
            cipher.updateAAD(header)
            cipher.updateAAD(context)
            return header + cipher.doFinal(plaintext)
        } finally {
            derived.fill(0)
        }
    }

    fun open(envelope: ByteArray, passphrase: CharArray, context: ByteArray): ByteArray {
        require(context.size in 1..MAX_CONTEXT_BYTES) { "Context size out of bounds" }
        require(passphrase.isNotEmpty()) { "Empty passphrase" }
        require(envelope.size in (HEADER_BYTES + TAG_BYTES)..(HEADER_BYTES + TAG_BYTES + MAX_PLAINTEXT_BYTES)) {
            "Invalid envelope size"
        }
        val header = envelope.copyOfRange(0, HEADER_BYTES)
        val buffer = ByteBuffer.wrap(header).order(ByteOrder.BIG_ENDIAN)
        val magic = ByteArray(4).also(buffer::get)
        require(magic.contentEquals(MAGIC)) { "Not a KNP1 envelope" }
        require(buffer.get().toInt() == 1 && buffer.get().toInt() == 1) { "Unsupported KNP1 version" }
        val iterations = buffer.int
        require(iterations in 1_000..10_000_000) { "Invalid KDF iterations" }
        val salt = ByteArray(SALT_BYTES).also(buffer::get)
        val nonce = ByteArray(NONCE_BYTES).also(buffer::get)
        val derived = KeyDerivation.pbkdf2(passphrase, salt, iterations, 32)
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                SecretKeySpec(derived, "AES"),
                GCMParameterSpec(TAG_BYTES * 8, nonce),
            )
            cipher.updateAAD(header)
            cipher.updateAAD(context)
            return cipher.doFinal(envelope, HEADER_BYTES, envelope.size - HEADER_BYTES)
        } finally {
            derived.fill(0)
        }
    }
}

object KeyDerivation {
    fun pbkdf2(passphrase: CharArray, salt: ByteArray, iterations: Int, lengthBytes: Int = 32): ByteArray {
        require(passphrase.isNotEmpty()) { "Empty passphrase" }
        require(salt.size >= 8) { "Salt too short" }
        require(iterations >= 1) { "Invalid iteration count" }
        require(lengthBytes in 16..64) { "Invalid derived length" }
        val spec = javax.crypto.spec.PBEKeySpec(passphrase, salt, iterations, lengthBytes * 8)
        return try {
            javax.crypto.SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                .generateSecret(spec)
                .encoded
        } finally {
            spec.clearPassword()
        }
    }

    /** Derives a 32-byte data key from a passphrase and a recorded KDF header. */
    fun forEnvelope(passphrase: CharArray, params: FileEnvelope.KdfParams): SecretKey {
        require(params.iterations > 0) { "Invalid KDF parameters" }
        val derived = pbkdf2(passphrase, params.salt, params.iterations, 32)
        return try {
            SecretKeySpec(derived, "AES")
        } finally {
            derived.fill(0)
        }
    }
}
