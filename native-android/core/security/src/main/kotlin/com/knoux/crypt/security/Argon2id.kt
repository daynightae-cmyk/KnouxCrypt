package com.knoux.crypt.security

import org.bouncycastle.crypto.generators.Argon2BytesGenerator
import org.bouncycastle.crypto.params.Argon2Parameters

/**
 * Validated Argon2id (RFC 9106) parameters.
 *
 * Defaults are above the OWASP 2023 minimum (19 MiB, t=2, p=1) but remain
 * acceptable on mid-range phones. A malicious envelope can request at most
 * [MAX_MEMORY_KIB] so opening a file cannot force unbounded allocation.
 */
data class Argon2idParameters(
    val memoryKib: Int = DEFAULT_MEMORY_KIB,
    val iterations: Int = DEFAULT_ITERATIONS,
    val parallelism: Int = DEFAULT_PARALLELISM,
) {
    init {
        require(memoryKib in MIN_MEMORY_KIB..MAX_MEMORY_KIB) {
            "Argon2id memory must be between $MIN_MEMORY_KIB and $MAX_MEMORY_KIB KiB"
        }
        require(iterations in 1..MAX_ITERATIONS) { "Argon2id iterations out of bounds" }
        require(parallelism in 1..MAX_PARALLELISM) { "Argon2id parallelism out of bounds" }
    }

    val estimatedWorkKib: Long get() = memoryKib.toLong() * iterations

    companion object {
        const val MIN_MEMORY_KIB = 8 * 1024
        const val MAX_MEMORY_KIB = 256 * 1024
        const val DEFAULT_MEMORY_KIB = 64 * 1024
        const val DEFAULT_ITERATIONS = 3
        const val DEFAULT_PARALLELISM = 2
        const val MAX_ITERATIONS = 10
        const val MAX_PARALLELISM = 4
        const val DERIVED_KEY_BYTES = 32

        val DEFAULT = Argon2idParameters()
        val OWASP_MINIMUM = Argon2idParameters(19 * 1024, 2, 1)
    }
}

/**
 * Argon2id KDF backed by Bouncy Castle's pure-Java implementation.
 *
 * This is not a custom primitive. The derived key is returned to the caller,
 * which must zero it after constructing the AES key. No derived material is
 * logged or persisted here. Not independently audited; see mission 37 evidence.
 */
object Argon2id {
    fun derive(
        passphrase: CharArray,
        salt: ByteArray,
        parameters: Argon2idParameters = Argon2idParameters.DEFAULT,
        outputBytes: Int = Argon2idParameters.DERIVED_KEY_BYTES,
    ): ByteArray {
        require(passphrase.isNotEmpty()) { "Empty passphrase" }
        require(salt.size in 8..64) { "Invalid Argon2id salt length" }
        require(outputBytes in 16..64) { "Invalid derived key length" }
        val builder = Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
            .withVersion(Argon2Parameters.ARGON2_VERSION_13)
            .withSalt(salt)
            .withIterations(parameters.iterations)
            .withMemoryAsKB(parameters.memoryKib)
            .withParallelism(parameters.parallelism)
        val generator = Argon2BytesGenerator()
        generator.init(builder.build())
        val output = ByteArray(outputBytes)
        generator.generateBytes(passphrase, output)
        return output
    }
}
