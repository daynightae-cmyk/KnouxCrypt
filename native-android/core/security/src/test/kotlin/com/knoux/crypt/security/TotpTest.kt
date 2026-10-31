package com.knoux.crypt.security

import java.io.ByteArrayInputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class TotpTest {
    private val rfcSecret = "12345678901234567890".toByteArray()

    @Test
    fun rfc6238Sha1Vectors() {
        val vectors = mapOf(
            59L to "94287082",
            1_111_111_109L to "07081804",
            1_111_111_111L to "14050471",
            1_234_567_890L to "89005924",
            2_000_000_000L to "69279037",
            20_000_000_000L to "65353130",
        )
        for ((time, expected) in vectors) {
            assertEquals("t=$time", expected, Totp.generate(rfcSecret, time, digits = 8))
        }
    }

    @Test
    fun defaultSixDigitsAndPeriod() {
        val code = Totp.generate(rfcSecret, 59)
        assertEquals(6, code.length)
        assertTrue(code.all(Char::isDigit))
        assertEquals(1, Totp.remainingSeconds(59_000))
        assertEquals(30, Totp.remainingSeconds(30_000))
        assertEquals(15, Totp.remainingSeconds(15_000))
    }

    @Test
    fun differentAlgorithmsProduceDifferentCodes() {
        val sha1 = Totp.generate(rfcSecret, 59, digits = 8, algorithm = Totp.Algorithm.SHA1)
        val sha256 = Totp.generate(rfcSecret, 59, digits = 8, algorithm = Totp.Algorithm.SHA256)
        assertNotEquals(sha1, sha256)
    }

    @Test
    fun base32RoundTripAndRfcAlphabet() {
        val hello = "foobar".toByteArray()
        assertEquals("MZXW6YTBOI", Base32.encode(hello))
        assertArrayEquals(hello, Base32.decode("MZXW6YTBOI"))
        assertArrayEquals(hello, Base32.decode("mzxw 6ytb oi======"))
        assertArrayEquals(hello, Base32.decode("MZXW-6YTB-OI"))
        val secret = Base32.decode("JBSWY3DPEHPK3PXP")
        assertEquals("JBSWY3DPEHPK3PXP", Base32.encode(secret))
    }

    @Test
    fun invalidInputsRejected() {
        try { Totp.generate(ByteArray(0), 0); fail() } catch (_: IllegalArgumentException) {}
        try { Totp.generate(rfcSecret, -1); fail() } catch (_: IllegalArgumentException) {}
        try { Totp.generate(rfcSecret, 0, digits = 5); fail() } catch (_: IllegalArgumentException) {}
        try { Base32.decode("INVALID!"); fail() } catch (_: IllegalArgumentException) {}
        try { Base32.decode(""); fail() } catch (_: IllegalArgumentException) {}
    }

    @Test
    fun hashingKnownAnswersAndHmac() {
        val digest = Hashing.sha256("abc".toByteArray())
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", Hashing.toHex(digest))
        val streamed = Hashing.sha256(ByteArrayInputStream("abc".toByteArray()), 3)
        assertArrayEquals(digest, streamed)
        assertTrue(Hashing.constantTimeEquals(digest, digest))
        assertFalse(Hashing.constantTimeEquals(digest, Hashing.sha256("abd".toByteArray())))
        val hmac = Hashing.hmacSha256("key".toByteArray(), "The quick brown fox jumps over the lazy dog".toByteArray())
        assertEquals("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8", Hashing.toHex(hmac))
        try { Hashing.sha256(ByteArrayInputStream(byteArrayOf(1, 2)), 3); fail() } catch (_: java.io.IOException) {}
    }

    @Test
    fun secureRandomSizesAndWords() {
        assertNotEquals(SecureRandomSource.hex(16), SecureRandomSource.hex(16))
        assertEquals(32, SecureRandomSource.hex(16).length)
        assertTrue(SecureRandomSource.base64(24).isNotEmpty())
        val phrase = SecureRandomSource.words(listOf("a", "b", "c"), 4)
        assertEquals(4, phrase.split("-").size)
        try { SecureRandomSource.bytes(0); fail() } catch (_: IllegalArgumentException) {}
    }
}
