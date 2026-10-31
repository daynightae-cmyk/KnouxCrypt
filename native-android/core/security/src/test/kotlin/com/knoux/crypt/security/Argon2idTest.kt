package com.knoux.crypt.security

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.fail
import org.junit.Test

class Argon2idTest {
    /**
     * Published argon2 reference vector (Argon2id v=19, m=65536, t=2, p=1,
     * password "password", salt "somesalt", 32-byte tag).
     */
    @Test
    fun matchesPublishedArgon2idVector() {
        val derived = Argon2id.derive(
            "password".toCharArray(),
            "somesalt".toByteArray(Charsets.UTF_8),
            Argon2idParameters(65_536, 2, 1),
        )
        assertEquals(
            "09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7",
            derived.joinToString("") { "%02x".format(it) },
        )
    }

    @Test
    fun kdfIsDeterministicAndParameterSensitive() {
        val salt = ByteArray(16) { it.toByte() }
        val params = Argon2idParameters(8 * 1024, 1, 1)
        val first = Argon2id.derive("secret".toCharArray(), salt, params)
        val second = Argon2id.derive("secret".toCharArray(), salt, params)
        val otherSalt = Argon2id.derive("secret".toCharArray(), salt.map { (it + 1).toByte() }.toByteArray(), params)
        val otherTime = Argon2id.derive("secret".toCharArray(), salt, Argon2idParameters(8 * 1024, 2, 1))
        assertArrayEquals(first, second)
        assertFalse(first.contentEquals(otherSalt))
        assertFalse(first.contentEquals(otherTime))
        assertEquals(32, first.size)
    }

    @Test
    fun boundsAndLengthsAreEnforced() {
        rejected { Argon2id.derive(CharArray(0), ByteArray(16)) }
        rejected { Argon2id.derive("pw".toCharArray(), ByteArray(7)) }
        rejected { Argon2id.derive("pw".toCharArray(), ByteArray(16), outputBytes = 8) }
        rejected { Argon2idParameters(memoryKib = 1024, iterations = 1, parallelism = 1) }
        rejected { Argon2idParameters(memoryKib = 8 * 1024, iterations = 11, parallelism = 1) }
        rejected { Argon2idParameters(memoryKib = 8 * 1024, iterations = 1, parallelism = 5) }
    }

    private fun rejected(action: () -> Unit) {
        try {
            action()
            fail("Invalid input accepted")
        } catch (_: IllegalArgumentException) {
        }
    }
}
