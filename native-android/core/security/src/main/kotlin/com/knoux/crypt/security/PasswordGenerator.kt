package com.knoux.crypt.security

import java.security.SecureRandom

/**
 * Local password material built from [SecureRandom].
 *
 * The pool is exactly the classes the user selected; each selected class is
 * guaranteed to appear at least once, and characters are drawn with bounded
 * rejection so the distribution stays uniform (no modulo bias). Nothing leaves
 * the process and nothing is persisted by this function. It makes no hardware
 * RNG claim: the platform provider decides what backs `SecureRandom`.
 */
object PasswordGenerator {
    const val MIN_LENGTH = 8
    const val MAX_LENGTH = 64

    const val LOWER = "abcdefghijklmnopqrstuvwxyz"
    const val UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    const val DIGITS = "0123456789"
    const val SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?/"

    data class Options(
        val length: Int = 20,
        val lower: Boolean = true,
        val upper: Boolean = true,
        val digits: Boolean = true,
        val symbols: Boolean = true,
    ) {
        val valid: Boolean get() = length in MIN_LENGTH..MAX_LENGTH && anyClass
        val anyClass: Boolean get() = lower || upper || digits || symbols
    }

    class NoCharacterClassException :
        IllegalArgumentException("Select at least one character class")

    fun generate(options: Options, random: SecureRandom = SecureRandom()): String {
        if (!options.anyClass) throw NoCharacterClassException()
        val length = options.length.coerceIn(MIN_LENGTH, MAX_LENGTH)
        val pools = buildList {
            if (options.lower) add(LOWER)
            if (options.upper) add(UPPER)
            if (options.digits) add(DIGITS)
            if (options.symbols) add(SYMBOLS)
        }
        val combined = pools.joinToString("")

        // One guaranteed character per selected class, then fill the rest from
        // the combined pool; positions are shuffled with Fisher-Yates.
        val chars = CharArray(length)
        pools.forEachIndexed { index, pool -> chars[index] = draw(pool, random) }
        for (index in pools.size until length) chars[index] = draw(combined, random)
        for (index in length - 1 downTo 1) {
            val swap = random.nextInt(index + 1)
            val temp = chars[index]
            chars[index] = chars[swap]
            chars[swap] = temp
        }
        return String(chars)
    }

    /** Uniform draw over [pool] using ints below the largest exact multiple. */
    private fun draw(pool: String, random: SecureRandom): Char {
        val bound = pool.length
        val limit = Int.MAX_VALUE - (Int.MAX_VALUE % bound)
        while (true) {
            val value = random.nextInt(Int.MAX_VALUE)
            if (value < limit) return pool[value % bound]
        }
    }
}
