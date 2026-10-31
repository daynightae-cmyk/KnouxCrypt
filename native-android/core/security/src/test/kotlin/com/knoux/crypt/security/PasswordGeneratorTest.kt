package com.knoux.crypt.security

import java.security.SecureRandom
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Contract tests for the local credential generator. A deterministic
 * [SecureRandom] stand-in is used so the guarantees below are checked instead
 * of sampled.
 */
class PasswordGeneratorTest {

    private class FakeRandom(seed: Long) : SecureRandom() {
        private var state = seed
        override fun nextInt(bound: Int): Int {
            require(bound > 0)
            // Linear congruential generator; good enough to be reproducible.
            state = (state * 63_641_362_238_467_930_05L + 1_442_695_040_888_963_407L)
            // Unsigned shift, so the value stays non-negative like the real API.
            return ((state ushr 1) % bound).toInt()
        }
    }

    @Test
    fun lengthAndSelectedClassesAreHonoured() {
        val value = PasswordGenerator.generate(
            PasswordGenerator.Options(length = 24, lower = false),
            FakeRandom(7L),
        )
        assertEquals(24, value.length)
        val pool = PasswordGenerator.UPPER + PasswordGenerator.DIGITS + PasswordGenerator.SYMBOLS
        assertTrue(value.all { it in pool })
        assertTrue(value.any { it in PasswordGenerator.UPPER })
        assertTrue(value.any { it in PasswordGenerator.DIGITS })
        assertTrue(value.any { it in PasswordGenerator.SYMBOLS })
        assertTrue(value.none { it in PasswordGenerator.LOWER })
    }

    @Test
    fun everySelectedClassAppearsAtLeastOnce() {
        repeat(40) { index ->
            val value = PasswordGenerator.generate(
                PasswordGenerator.Options(length = 8),
                FakeRandom(index * 97L + 13L),
            )
            assertTrue("missing lower in $value", value.any { it in PasswordGenerator.LOWER })
            assertTrue("missing upper in $value", value.any { it in PasswordGenerator.UPPER })
            assertTrue("missing digit in $value", value.any { it in PasswordGenerator.DIGITS })
            assertTrue("missing symbol in $value", value.any { it in PasswordGenerator.SYMBOLS })
        }
    }

    @Test
    fun singleClassGenerationStaysInsideThatClass() {
        val value = PasswordGenerator.generate(
            PasswordGenerator.Options(length = 12, lower = false, upper = false, digits = false, symbols = true),
            FakeRandom(3L),
        )
        assertTrue(value.all { it in PasswordGenerator.SYMBOLS })
    }

    @Test
    fun lengthIsClampedToTheDocumentedRange() {
        assertEquals(
            PasswordGenerator.MIN_LENGTH,
            PasswordGenerator.generate(PasswordGenerator.Options(length = 2), FakeRandom(1L)).length,
        )
        assertEquals(
            PasswordGenerator.MAX_LENGTH,
            PasswordGenerator.generate(PasswordGenerator.Options(length = 999), FakeRandom(1L)).length,
        )
    }

    @Test
    fun noSelectedClassIsRejectedNotSilentlySubstituted() {
        val failure = runCatching {
            PasswordGenerator.generate(
                PasswordGenerator.Options(length = 16, lower = false, upper = false, digits = false, symbols = false),
                FakeRandom(1L),
            )
        }.exceptionOrNull()
        assertTrue(failure is PasswordGenerator.NoCharacterClassException)
    }

    @Test
    fun sameRandomStateProducesTheSameValueAndDifferentStateDoesNot() {
        val options = PasswordGenerator.Options(length = 20)
        assertEquals(
            PasswordGenerator.generate(options, FakeRandom(99L)),
            PasswordGenerator.generate(options, FakeRandom(99L)),
        )
        assertNotEquals(
            PasswordGenerator.generate(options, FakeRandom(99L)),
            PasswordGenerator.generate(options, FakeRandom(100L)),
        )
    }

    @Test
    fun distributionCoversThePoolRatherThanAFewPositions() {
        val distinct = (0 until 200)
            .flatMap { PasswordGenerator.generate(PasswordGenerator.Options(length = 10), FakeRandom(it * 31L + 5L)).toList() }
            .toSet()
        assertTrue("only ${distinct.size} distinct characters produced", distinct.size >= 30)
    }
}
