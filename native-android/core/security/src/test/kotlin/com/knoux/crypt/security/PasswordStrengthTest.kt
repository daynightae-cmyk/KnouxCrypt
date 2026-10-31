package com.knoux.crypt.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Known-answer vectors for the offline strength model. These pin the documented
 * v1 rules: observed-class pools, penalty factors, threshold bands and the
 * structural caps. They are heuristic contracts, not cryptographic proofs, and
 * they say nothing about real-world leak coverage.
 */
class PasswordStrengthTest {

    @Test
    fun emptySecretIsBlankAndLowestLevel() {
        val metric = PasswordStrength.evaluate("")
        assertEquals(StrengthLevel.EMPTY, metric.level)
        assertEquals(0, metric.score)
        assertEquals(0, metric.poolSize)
        assertEquals(0.0, metric.rawEntropyBits, 0.0)
        assertEquals(setOf(StrengthFlag.BLANK), metric.flags)
    }

    @Test
    fun observedPoolMatchesDocumentedClassSizes() {
        assertEquals(26, PasswordStrength.poolSize("abc"))
        assertEquals(26, PasswordStrength.poolSize("ABC"))
        assertEquals(10, PasswordStrength.poolSize("123"))
        assertEquals(32, PasswordStrength.poolSize("!@#"))
        assertEquals(26 + 10, PasswordStrength.poolSize("a1"))
        assertEquals(26 + 26 + 10 + 32, PasswordStrength.poolSize("aA1!"))
        assertEquals(26 + 26 + 10 + 32 + 1, PasswordStrength.poolSize("aA1! "))
        assertEquals(PasswordStrength.NON_ASCII_POOL, PasswordStrength.poolSize("كلمة"))
        assertEquals(26 + PasswordStrength.NON_ASCII_POOL, PasswordStrength.poolSize("aك"))
        // A control character is still ASCII variety, never treated as unicode.
        assertEquals(32, PasswordStrength.poolSize("\t"))
    }

    @Test
    fun knownAnswerWeakVectors() {
        data class Case(val value: String, val level: StrengthLevel, val flag: StrengthFlag)
        listOf(
            Case("password", StrengthLevel.VERY_WEAK, StrengthFlag.COMMON_WORD),
            Case("Password1", StrengthLevel.VERY_WEAK, StrengthFlag.COMMON_WORD_WRAPPED),
            Case("qwerty123", StrengthLevel.VERY_WEAK, StrengthFlag.KEYBOARD_RUN),
            Case("aaaaaaaaaa", StrengthLevel.VERY_WEAK, StrengthFlag.REPEATED_RUN),
            Case("19850112", StrengthLevel.VERY_WEAK, StrengthFlag.YEAR_LIKE),
            Case("abcdefghijkl", StrengthLevel.WEAK, StrengthFlag.SEQUENTIAL_RUN),
            Case("Zk4trWm9Zk4trWm9", StrengthLevel.FAIR, StrengthFlag.REPEATED_UNIT),
        ).forEach { case ->
            val metric = PasswordStrength.evaluate(case.value)
            assertEquals("level for ${case.value}", case.level, metric.level)
            assertTrue("${case.value} should carry ${case.flag}", case.flag in metric.flags)
        }
    }

    @Test
    fun knownAnswerMidAndStrongVectors() {
        // 8 characters from the 62-class pool: 8 * log2(62) = 47.6336 bits -> FAIR.
        val fair = PasswordStrength.evaluate("Zk4trWm9")
        assertEquals(47.6336, fair.rawEntropyBits, 0.01)
        assertEquals(47.6336, fair.effectiveEntropyBits, 0.01)
        assertEquals(StrengthLevel.FAIR, fair.level)
        assertEquals(3, fair.score)
        assertEquals(emptySet<StrengthFlag>(), fair.flags)

        // 20 characters from the 94-class pool: 20 * log2(94) = 131.09 bits.
        val excellent = PasswordStrength.evaluate("Xk9#mQ2\$vL7!pR4@tY8&")
        assertEquals(131.0918, excellent.rawEntropyBits, 0.01)
        assertEquals(StrengthLevel.EXCELLENT, excellent.level)
        assertEquals(5, excellent.score)

        // A long lowercase passphrase has no structural weakness in this model.
        val passphrase = PasswordStrength.evaluate("correcthorsebattery")
        assertEquals(StrengthLevel.EXCELLENT, passphrase.level)
        assertEquals(setOf(StrengthFlag.LOW_CHARSET), passphrase.flags)
    }

    @Test
    fun veryShortSecretsAreCappedButEightMixedCharactersRecover() {
        assertTrue(StrengthFlag.VERY_SHORT in PasswordStrength.evaluate("aA1!").flags)
        assertEquals(StrengthLevel.VERY_WEAK, PasswordStrength.evaluate("aA1!").level)
        assertEquals(StrengthLevel.VERY_WEAK, PasswordStrength.evaluate("Ab1!").level)
        val eight = PasswordStrength.evaluate("aA1!bB2@")
        assertEquals(StrengthLevel.FAIR, eight.level)
        assertFalse(StrengthFlag.SHORT in eight.flags)
        // Seven characters can never be reported above WEAK.
        assertTrue(PasswordStrength.evaluate("aA1!aA!").level.ordinal <= StrengthLevel.WEAK.ordinal)
    }

    @Test
    fun repeatedCommonWordCannotBeRescuedByLength() {
        val long = PasswordStrength.evaluate("passwordpasswordpassword")
        assertTrue(StrengthFlag.COMMON_WORD in long.flags)
        assertEquals(StrengthLevel.VERY_WEAK, long.level)
        assertTrue(long.rawEntropyBits > PasswordStrength.VERY_WEAK_BELOW)
    }

    @Test
    fun entropyAndScoreGrowMonotonicallyWithLength() {
        var previousBits = -1.0
        var previousScore = -1
        val alphabet = "Zk4trWm9Qm7!xT2#Vb6\$yR1@"
        for (length in 4..20) {
            val metric = PasswordStrength.evaluate(alphabet.substring(0, length))
            assertTrue("entropy shrank at length $length", metric.rawEntropyBits >= previousBits)
            assertTrue("score dropped at length $length", metric.score >= previousScore)
            previousBits = metric.rawEntropyBits
            previousScore = metric.score
        }
    }

    @Test
    fun metricsNeverRetainTheSecretItself() {
        listOf("unique-plaintext-abc123xyz", "Zk4trWm9", "Tr0ub4dor&3", "k9!Qw4zX").forEach { secret ->
            val metric = PasswordStrength.evaluate(secret)
            assertFalse("metric leaked the secret", metric.toString().contains(secret))
            assertFalse(metric.flags.any { it.name.contains(secret) })
        }
    }

    @Test
    fun evaluationIsDeterministicAndModelVersioned() {
        assertEquals(1, PasswordStrength.MODEL_VERSION)
        assertEquals(PasswordStrength.evaluate("Zk4trWm9!"), PasswordStrength.evaluate("Zk4trWm9!"))
        assertEquals(StrengthLevel.STRONG, PasswordStrength.evaluate("Zk4trWm9!").level)
    }

    @Test
    fun commonWordListIsBoundedAndAuditable() {
        assertTrue(PasswordStrength.COMMON_WORDS.size in 32..128)
        PasswordStrength.COMMON_WORDS.forEach { word ->
            assertEquals(word, word.lowercase())
            assertTrue(word.length <= 14)
            assertFalse(word.isBlank())
        }
        assertTrue("password" in PasswordStrength.COMMON_WORDS)
        assertTrue("123456" in PasswordStrength.COMMON_WORDS)
    }

    @Test
    fun patternScanStopsBeyondTheDocumentedBound() {
        val inside = "abc".repeat(85) // 255 characters, within the bound
        val beyond = "abc".repeat(90) // 270 characters, past the bound
        assertEquals(255, inside.length)
        assertEquals(270, beyond.length)
        assertTrue(inside.length <= PasswordStrength.MAX_PATTERN_SCAN_LENGTH)
        assertTrue(beyond.length > PasswordStrength.MAX_PATTERN_SCAN_LENGTH)
        assertTrue(StrengthFlag.REPEATED_UNIT in PasswordStrength.evaluate(inside).flags)
        // Past the bound the periodic check is skipped. This is a documented
        // degradation of the heuristic, not a failure.
        assertFalse(StrengthFlag.REPEATED_UNIT in PasswordStrength.evaluate(beyond).flags)
    }

    @Test
    fun nonAsciiSecretsUseTheBoundedPoolAndAreFlagged() {
        val arabic = PasswordStrength.evaluate("كلمةسرطويلةجداهنا")
        assertTrue(StrengthFlag.NON_ASCII in arabic.flags)
        assertTrue(StrengthFlag.LOW_CHARSET in arabic.flags)
        assertEquals(PasswordStrength.NON_ASCII_POOL, arabic.poolSize)
        // The model over-estimates single-class dictionary text; that limit is
        // documented, and it must still never report EMPTY for real input.
        assertTrue(arabic.score >= StrengthLevel.STRONG.ordinal)
    }
}
