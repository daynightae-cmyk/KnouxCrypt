package com.knoux.crypt.security

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Portable passphrase envelope for small secrets (text, tokens, backup wrappers).
 *
 * - KNP2 (new): Argon2id v1.3 + AES-256-GCM, parameters authenticated in the header.
 * - KNP1 (legacy, read-only for new code): PBKDF2-HMAC-SHA256 + AES-256-GCM, still
 *   accepted so existing ciphertext remains readable. New seals never downgrade.
 *
 * No custom cryptography. Argon2id is provided by Bouncy Castle's pure-Java
 * implementation and is not independently audited in this project.
 */
class PassphraseEnvelope(private val random: SecureRandom = SecureRandom()) {
    companion object {
        const val MAX_PLAINTEXT_BYTES = 1024 * 1024
        const val MAX_CONTEXT_BYTES = 4096
        const val MIN_PRODUCTION_ITERATIONS = 310_000
        const val SALT_BYTES = 16
        const val NONCE_BYTES = 12
        const val TAG_BYTES = 16

        private const val VERSION_1 = 1
        private const val VERSION_2 = 2
        private const val KDF_PBKDF2_SHA256 = 1
        private const val KDF_ARGON2ID = 2
        private const val HEADER_V1_BYTES = 4 + 1 + 1 + 4 + SALT_BYTES + NONCE_BYTES
        private const val HEADER_V2_BYTES = 4 + 1 + 1 + 4 + 4 + 4 + SALT_BYTES + NONCE_BYTES
        private val MAGIC_V1 = byteArrayOf(0x4b, 0x4e, 0x50, 0x31) // KNP1
        private val MAGIC_V2 = byteArrayOf(0x4b, 0x4e, 0x50, 0x32) // KNP2
        private const val MIN_ENVELOPE_BYTES = HEADER_V1_BYTES + TAG_BYTES
        private const val MAX_ENVELOPE_BYTES = HEADER_V2_BYTES + TAG_BYTES + MAX_PLAINTEXT_BYTES
    }

    /** Non-secret KNP header metadata; authenticity is not checked without the passphrase. */
    data class HeaderInfo(
        val version: Int,
        val kdf: Int,
        val memoryKib: Int?,
        val iterations: Int?,
        val parallelism: Int?,
        val salt: ByteArray,
        val nonce: ByteArray,
        val headerBytes: Int,
        val payloadBytes: Int,
    )

    /**
     * Parses and bounds-checks a KNP header without deriving a key or touching
     * ciphertext tags. A structurally valid header does not prove authenticity.
     */
    fun inspect(envelope: ByteArray): HeaderInfo {
        require(envelope.size >= MIN_ENVELOPE_BYTES) { "Invalid envelope size" }
        val magic = envelope.copyOfRange(0, 4)
        val headerBytes: Int
        val info: HeaderInfo
        when {
            magic.contentEquals(MAGIC_V1) -> {
                require(envelope.size >= HEADER_V1_BYTES + TAG_BYTES) { "Truncated KNP1" }
                val buffer = ByteBuffer.wrap(envelope).order(ByteOrder.BIG_ENDIAN)
                buffer.position(4)
                require(buffer.get().toInt() == VERSION_1) { "Unsupported KNP1 version" }
                require(buffer.get().toInt() == KDF_PBKDF2_SHA256) { "Unsupported KNP1 KDF" }
                val iterations = buffer.int
                require(iterations in 1_000..10_000_000) { "Invalid KDF iterations" }
                val salt = ByteArray(SALT_BYTES).also(buffer::get)
                val nonce = ByteArray(NONCE_BYTES).also(buffer::get)
                headerBytes = HEADER_V1_BYTES
                info = HeaderInfo(
                    version = VERSION_1,
                    kdf = KDF_PBKDF2_SHA256,
                    memoryKib = null,
                    iterations = iterations,
                    parallelism = null,
                    salt = salt,
                    nonce = nonce,
                    headerBytes = headerBytes,
                    payloadBytes = envelope.size - headerBytes,
                )
            }
            magic.contentEquals(MAGIC_V2) -> {
                require(envelope.size >= HEADER_V2_BYTES + TAG_BYTES) { "Truncated KNP2" }
                val buffer = ByteBuffer.wrap(envelope).order(ByteOrder.BIG_ENDIAN)
                buffer.position(4)
                require(buffer.get().toInt() == VERSION_2) { "Unsupported KNP2 version" }
                require(buffer.get().toInt() == KDF_ARGON2ID) { "Unsupported KNP2 KDF" }
                val memoryKib = buffer.int
                val iterations = buffer.int
                val parallelism = buffer.int
                val parameters = runCatching {
                    Argon2idParameters(memoryKib, iterations, parallelism)
                }.getOrElse { throw IllegalArgumentException("Invalid Argon2id parameters in envelope") }
                val salt = ByteArray(SALT_BYTES).also(buffer::get)
                val nonce = ByteArray(NONCE_BYTES).also(buffer::get)
                headerBytes = HEADER_V2_BYTES
                info = HeaderInfo(
                    version = VERSION_2,
                    kdf = KDF_ARGON2ID,
                    memoryKib = parameters.memoryKib,
                    iterations = parameters.iterations,
                    parallelism = parameters.parallelism,
                    salt = salt,
                    nonce = nonce,
                    headerBytes = headerBytes,
                    payloadBytes = envelope.size - headerBytes,
                )
            }
            else -> throw IllegalArgumentException("Not a KNP envelope")
        }
        return info
    }

    /** Seals with KNP2 / Argon2id. This is the only path used for new ciphertext. */
    fun seal(
        plaintext: ByteArray,
        passphrase: CharArray,
        context: ByteArray,
        parameters: Argon2idParameters = Argon2idParameters.DEFAULT,
    ): ByteArray {
        require(plaintext.size <= MAX_PLAINTEXT_BYTES) { "Plaintext too large" }
        require(context.size in 1..MAX_CONTEXT_BYTES) { "Context size out of bounds" }
        require(passphrase.isNotEmpty()) { "Empty passphrase" }
        val salt = ByteArray(SALT_BYTES).also(random::nextBytes)
        val nonce = ByteArray(NONCE_BYTES).also(random::nextBytes)
        val derived = Argon2id.derive(passphrase, salt, parameters)
        try {
            val header = ByteBuffer.allocate(HEADER_V2_BYTES).order(ByteOrder.BIG_ENDIAN)
                .put(MAGIC_V2)
                .put(VERSION_2.toByte())
                .put(KDF_ARGON2ID.toByte())
                .putInt(parameters.memoryKib)
                .putInt(parameters.iterations)
                .putInt(parameters.parallelism)
                .put(salt)
                .put(nonce)
                .array()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.ENCRYPT_MODE,
                SecretKeySpec(derived, "AES"),
                GCMParameterSpec(TAG_BYTES * 8, nonce),
            )
            cipher.updateAAD(header)
            cipher.updateAAD(context)
            return header + cipher.doFinal(plaintext)
        } finally {
            derived.fill(0)
        }
    }

    /**
     * Retained only to produce/read KNP1 compatibility vectors and to keep
     * existing data readable. New callers must use [seal].
     */
    fun sealLegacyPbkdf2(
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
            val header = ByteBuffer.allocate(HEADER_V1_BYTES).order(ByteOrder.BIG_ENDIAN)
                .put(MAGIC_V1)
                .put(VERSION_1.toByte())
                .put(KDF_PBKDF2_SHA256.toByte())
                .putInt(iterations)
                .put(salt)
                .put(nonce)
                .array()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.ENCRYPT_MODE,
                SecretKeySpec(derived, "AES"),
                GCMParameterSpec(TAG_BYTES * 8, nonce),
            )
            cipher.updateAAD(header)
            cipher.updateAAD(context)
            return header + cipher.doFinal(plaintext)
        } finally {
            derived.fill(0)
        }
    }

    /** Opens KNP2 (Argon2id) and legacy KNP1 (PBKDF2) envelopes. */
    fun open(envelope: ByteArray, passphrase: CharArray, context: ByteArray): ByteArray {
        require(context.size in 1..MAX_CONTEXT_BYTES) { "Context size out of bounds" }
        require(passphrase.isNotEmpty()) { "Empty passphrase" }
        require(envelope.size in MIN_ENVELOPE_BYTES..MAX_ENVELOPE_BYTES) { "Invalid envelope size" }
        val magic = envelope.copyOfRange(0, 4)
        return when {
            magic.contentEquals(MAGIC_V1) -> openV1(envelope, passphrase, context)
            magic.contentEquals(MAGIC_V2) -> openV2(envelope, passphrase, context)
            else -> throw IllegalArgumentException("Not a KNP envelope")
        }
    }

    private fun openV1(envelope: ByteArray, passphrase: CharArray, context: ByteArray): ByteArray {
        val header = envelope.copyOfRange(0, HEADER_V1_BYTES)
        val buffer = ByteBuffer.wrap(header).order(ByteOrder.BIG_ENDIAN)
        buffer.position(4)
        require(buffer.get().toInt() == VERSION_1) { "Unsupported KNP1 version" }
        require(buffer.get().toInt() == KDF_PBKDF2_SHA256) { "Unsupported KNP1 KDF" }
        val iterations = buffer.int
        require(iterations in 1_000..10_000_000) { "Invalid KDF iterations" }
        val salt = ByteArray(SALT_BYTES).also(buffer::get)
        val nonce = ByteArray(NONCE_BYTES).also(buffer::get)
        val derived = KeyDerivation.pbkdf2(passphrase, salt, iterations, 32)
        try {
            return decrypt(envelope, header, derived, nonce, context)
        } finally {
            derived.fill(0)
        }
    }

    private fun openV2(envelope: ByteArray, passphrase: CharArray, context: ByteArray): ByteArray {
        val header = envelope.copyOfRange(0, HEADER_V2_BYTES)
        val buffer = ByteBuffer.wrap(header).order(ByteOrder.BIG_ENDIAN)
        buffer.position(4)
        require(buffer.get().toInt() == VERSION_2) { "Unsupported KNP2 version" }
        require(buffer.get().toInt() == KDF_ARGON2ID) { "Unsupported KNP2 KDF" }
        val memoryKib = buffer.int
        val iterations = buffer.int
        val parallelism = buffer.int
        // Validate before deriving so a crafted header cannot force an
        // unbounded allocation. Parameters are also authenticated as AAD.
        val parameters = runCatching { Argon2idParameters(memoryKib, iterations, parallelism) }
            .getOrElse { throw IllegalArgumentException("Invalid Argon2id parameters in envelope") }
        val salt = ByteArray(SALT_BYTES).also(buffer::get)
        val nonce = ByteArray(NONCE_BYTES).also(buffer::get)
        val derived = try {
            Argon2id.derive(passphrase, salt, parameters)
        } catch (failure: OutOfMemoryError) {
            throw IllegalStateException("Not enough memory for the recorded Argon2id cost", failure)
        }
        try {
            return decrypt(envelope, header, derived, nonce, context)
        } finally {
            derived.fill(0)
        }
    }

    private fun decrypt(
        envelope: ByteArray,
        header: ByteArray,
        derived: ByteArray,
        nonce: ByteArray,
        context: ByteArray,
    ): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(derived, "AES"),
            GCMParameterSpec(TAG_BYTES * 8, nonce),
        )
        cipher.updateAAD(header)
        cipher.updateAAD(context)
        return cipher.doFinal(envelope, header.size, envelope.size - header.size)
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

    /** Derives a 32-byte data key from a passphrase and a recorded KNF1 KDF header. */
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
