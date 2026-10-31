package com.knoux.crypt.security

import kotlin.math.ln

/**
 * Offline, deterministic password strength estimation (KNOuX strength model v1).
 *
 * The model is a bounded local heuristic over character variety and structural
 * patterns. It is deliberately transparent: [StrengthMetric] reports the pool
 * size, the raw and penalty-adjusted entropy estimate, the flags that produced
 * the result and the capped level, so the UI can explain every judgement.
 *
 * Explicit limits, which the UI must repeat rather than hide:
 *  - This is NOT a breach check. [COMMON_WORDS] is a small, auditable list of
 *    widely published weak secrets; it has no coverage of real leaked
 *    credential corpora, and nothing is ever sent anywhere to find out.
 *  - Entropy is estimated from the observed character classes, not from a
 *    model of how the user produced the value, so it over-estimates dictionary
 *    passphrases and under-estimates memorised nonsense.
 *  - A high score means "not weak by these local rules". It never means the
 *    account, the site or the credential is safe.
 *
 * The evaluator is pure: it keeps no reference to the input, and nothing it
 * returns contains the password. Callers must not log the input.
 */
enum class StrengthLevel { EMPTY, VERY_WEAK, WEAK, FAIR, STRONG, EXCELLENT }

/** Machine-readable reasons. The UI owns the human wording for each one. */
enum class StrengthFlag {
    BLANK,
    VERY_SHORT,
    SHORT,
    LOW_CHARSET,
    REPEATED_RUN,
    SEQUENTIAL_RUN,
    KEYBOARD_RUN,
    YEAR_LIKE,
    SYMBOL_ONLY,
    REPEATED_UNIT,
    COMMON_WORD,
    COMMON_WORD_WRAPPED,
    NON_ASCII,
}

data class StrengthMetric(
    val length: Int,
    val poolSize: Int,
    val rawEntropyBits: Double,
    val effectiveEntropyBits: Double,
    val level: StrengthLevel,
    /** [StrengthLevel.ordinal] so a report can sort without re-evaluating. */
    val score: Int,
    val flags: Set<StrengthFlag>,
)

object PasswordStrength {
    /** Bump when thresholds, factors or the common list change. */
    const val MODEL_VERSION = 1

    const val LOWER_POOL = 26
    const val UPPER_POOL = 26
    const val DIGIT_POOL = 10

    /** ASCII printable, non-alphanumeric (33..47, 58..64, 91..96, 123..126). */
    const val SYMBOL_POOL = 32

    /** Bounded, conservative allowance for unicode characters. */
    const val NON_ASCII_POOL = 64

    /** Level boundaries in penalty-adjusted bits. */
    const val VERY_WEAK_BELOW = 28.0
    const val WEAK_BELOW = 40.0
    const val FAIR_BELOW = 56.0
    const val STRONG_BELOW = 72.0

    /** Structural pattern scans stop past this length; entropy still applies. */
    const val MAX_PATTERN_SCAN_LENGTH = 256

    private const val MIN_LEVEL_ORDINAL = 1 // EMPTY is reserved for the empty string

    // Multiplicative penalties. Applied to raw entropy before classification.
    const val FACTOR_REPEATED = 0.55
    const val FACTOR_SEQUENTIAL = 0.70
    const val FACTOR_KEYBOARD = 0.60
    const val FACTOR_YEAR = 0.85
    const val FACTOR_REPEATED_UNIT = 0.50
    const val FACTOR_COMMON_WORD = 0.10
    const val FACTOR_COMMON_WORD_WRAPPED = 0.30

    /**
     * Small, published, auditable set of notoriously weak secrets. Coverage is
     * intentionally limited; it is a pattern guard, not a leak database.
     */
    val COMMON_WORDS: Set<String> = setOf(
        "password", "passwort", "passw0rd", "p@ssw0rd", "welcome", "letmein",
        "admin", "administrator", "root", "login", "abc123", "abcd1234",
        "123456", "1234567", "12345678", "123456789", "1234567890", "111111",
        "000000", "qwerty", "qwertyuiop", "azerty", "asdfgh", "zxcvbn",
        "iloveyou", "princess", "sunshine", "football", "baseball", "basketball",
        "monkey", "dragon", "shadow", "michael", "master", "trustno1",
        "batman", "superman", "hello", "charlie", "donald", "secret",
        "soccer", "hockey", "ranger", "little", "access", "blabla",
    )

    private val KEYBOARD_ROWS = listOf("qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890")

    fun evaluate(password: String): StrengthMetric {
        if (password.isEmpty()) {
            return StrengthMetric(
                length = 0,
                poolSize = 0,
                rawEntropyBits = 0.0,
                effectiveEntropyBits = 0.0,
                level = StrengthLevel.EMPTY,
                score = StrengthLevel.EMPTY.ordinal,
                flags = setOf(StrengthFlag.BLANK),
            )
        }

        val (pool, classCount) = observedClasses(password)
        val raw = password.length * ln(pool.toDouble()) / ln(2.0)
        val flags = linkedSetOf<StrengthFlag>()
        var factor = 1.0

        when {
            password.length <= 4 -> flags += StrengthFlag.VERY_SHORT
            password.length <= 7 -> flags += StrengthFlag.SHORT
        }
        if (classCount <= 1) flags += StrengthFlag.LOW_CHARSET
        if (hasRepeatedRun(password)) {
            flags += StrengthFlag.REPEATED_RUN
            factor *= FACTOR_REPEATED
        }
        if (hasSequentialRun(password)) {
            flags += StrengthFlag.SEQUENTIAL_RUN
            factor *= FACTOR_SEQUENTIAL
        }
        if (hasKeyboardRun(password)) {
            flags += StrengthFlag.KEYBOARD_RUN
            factor *= FACTOR_KEYBOARD
        }
        if (hasYearLikeRun(password)) {
            flags += StrengthFlag.YEAR_LIKE
            factor *= FACTOR_YEAR
        }

        val lowered = password.lowercase()
        when {
            lowered in COMMON_WORDS -> {
                flags += StrengthFlag.COMMON_WORD
                factor *= FACTOR_COMMON_WORD
            }
            wrappedCommonWord(lowered) != null -> {
                flags += StrengthFlag.COMMON_WORD_WRAPPED
                factor *= FACTOR_COMMON_WORD_WRAPPED
            }
        }
        if (lowered !in COMMON_WORDS) {
            // "passwordpassword" is a known secret wearing a longer coat.
            repeatedUnit(lowered)?.let { unit ->
                when {
                    unit in COMMON_WORDS -> {
                        flags += StrengthFlag.COMMON_WORD
                        factor *= FACTOR_COMMON_WORD
                    }
                    unit.length >= 3 -> {
                        flags += StrengthFlag.REPEATED_UNIT
                        factor *= FACTOR_REPEATED_UNIT
                    }
                }
            }
        }
        if (password.none { it.isLetterOrDigit() }) flags += StrengthFlag.SYMBOL_ONLY
        if (password.any { it.code > 127 }) flags += StrengthFlag.NON_ASCII

        val effective = raw * factor
        val level = classify(effective, flags)
        return StrengthMetric(
            length = password.length,
            poolSize = pool,
            rawEntropyBits = raw,
            effectiveEntropyBits = effective,
            level = level,
            score = level.ordinal,
            flags = flags.toSet(),
        )
    }

    /** Character-class pool actually observed in [password]; never below 2. */
    fun poolSize(password: String): Int = observedClasses(password).first

    /** Observed pool size plus the number of distinct character classes used. */
    private fun observedClasses(password: String): Pair<Int, Int> {
        var lower = false
        var upper = false
        var digit = false
        var symbol = false
        var space = false
        var nonAscii = false
        for (char in password) {
            when {
                char in 'a'..'z' -> lower = true
                char in 'A'..'Z' -> upper = true
                char in '0'..'9' -> digit = true
                char == ' ' -> space = true
                char.code in 33..126 || char.code < 32 -> symbol = true
                else -> nonAscii = true
            }
        }
        var pool = 0
        var classes = 0
        if (lower) { pool += LOWER_POOL; classes++ }
        if (upper) { pool += UPPER_POOL; classes++ }
        if (digit) { pool += DIGIT_POOL; classes++ }
        if (symbol) { pool += SYMBOL_POOL; classes++ }
        if (space) { pool += 1; classes++ }
        if (nonAscii) { pool += NON_ASCII_POOL; classes++ }
        return pool.coerceAtLeast(2) to classes
    }

    private fun classify(effectiveBits: Double, flags: Set<StrengthFlag>): StrengthLevel {
        var ordinal = when {
            effectiveBits < VERY_WEAK_BELOW -> 1
            effectiveBits < WEAK_BELOW -> 2
            effectiveBits < FAIR_BELOW -> 3
            effectiveBits < STRONG_BELOW -> 4
            else -> 5
        }
        // Deterministic caps: a known-weak structure cannot be rescued by length.
        if (StrengthFlag.VERY_SHORT in flags) ordinal = minOf(ordinal, 1)
        if (StrengthFlag.SHORT in flags) ordinal = minOf(ordinal, 2)
        if (StrengthFlag.COMMON_WORD in flags) ordinal = minOf(ordinal, 1)
        if (StrengthFlag.REPEATED_RUN in flags || StrengthFlag.KEYBOARD_RUN in flags) {
            ordinal = minOf(ordinal, 2)
        }
        return StrengthLevel.entries[ordinal]
    }

    private fun hasRepeatedRun(password: String): Boolean {
        var run = 1
        for (index in 1 until password.length) {
            run = if (password[index] == password[index - 1]) run + 1 else 1
            if (run >= 3) return true
        }
        return false
    }

    /** Four or more ascending or descending code points, e.g. "abcd" or "9876". */
    private fun hasSequentialRun(password: String): Boolean {
        if (password.length < 4) return false
        var ascending = 1
        var descending = 1
        for (index in 1 until password.length) {
            val current = password[index]
            val previous = password[index - 1]
            if (!current.isLetterOrDigit() || !previous.isLetterOrDigit()) {
                ascending = 1
                descending = 1
                continue
            }
            val step = current.code - previous.code
            ascending = if (step == 1) ascending + 1 else 1
            descending = if (step == -1) descending + 1 else 1
            if (ascending >= 4 || descending >= 4) return true
        }
        return false
    }

    private fun hasKeyboardRun(password: String): Boolean {
        if (password.length < 4) return false
        val lowered = password.lowercase()
        val reversed = lowered.reversed()
        return KEYBOARD_ROWS.any { row ->
            (4..row.length).any { size ->
                (0..row.length - size).any { start ->
                    val fragment = row.substring(start, start + size)
                    fragment in lowered || fragment in reversed
                }
            }
        }
    }

    /** A four-to-eight digit run that looks like a year, e.g. "1985" or "202601". */
    private fun hasYearLikeRun(password: String): Boolean {
        var index = 0
        while (index < password.length) {
            if (!password[index].isDigit()) {
                index++
                continue
            }
            var end = index
            while (end < password.length && password[end].isDigit()) end++
            val run = password.substring(index, end)
            if (run.length in 4..8 && (run.startsWith("19") || run.startsWith("20"))) return true
            index = end
        }
        return false
    }

    /**
     * Returns the smallest repeating unit when the whole value is that unit
     * repeated, e.g. "abcabc" -> "abc". Bounded to [MAX_PATTERN_SCAN_LENGTH] so
     * an absurdly long value cannot make the scan quadratic on purpose.
     */
    private fun repeatedUnit(lowered: String): String? {
        val length = lowered.length
        if (length == 0 || length > MAX_PATTERN_SCAN_LENGTH) return null
        for (unit in 1..length / 2) {
            if (length % unit != 0) continue
            var matches = true
            for (index in unit until length) {
                if (lowered[index] != lowered[index % unit]) {
                    matches = false
                    break
                }
            }
            if (matches) return lowered.substring(0, unit)
        }
        return null
    }

    /**
     * Returns the common word inside [lowered] when the value is that word with
     * only digit or punctuation affixes around it, e.g. "Password1", "welcome!!".
     */
    private fun wrappedCommonWord(lowered: String): String? {
        val affixes = "-_!?.@#*&+=~.,'\"(){}[]<>/\\ "
        var start = 0
        var end = lowered.length
        while (start < end && (lowered[start].isDigit() || lowered[start] in affixes)) start++
        while (end > start && (lowered[end - 1].isDigit() || lowered[end - 1] in affixes)) end--
        val core = lowered.substring(start, end)
        if (core.length < 4 || core == lowered) return null
        return core.takeIf { it in COMMON_WORDS }
    }
}
