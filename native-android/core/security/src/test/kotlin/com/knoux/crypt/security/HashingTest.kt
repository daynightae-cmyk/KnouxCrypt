package com.knoux.crypt.security

import java.io.ByteArrayInputStream
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class HashingTest {
    @Test
    fun knownAnswerVectorsForStreamingSha256AndSha512() {
        val abc = "abc".toByteArray()
        assertEquals(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            Hashing.toHex(Hashing.sha256(ByteArrayInputStream(abc), abc.size.toLong())),
        )
        assertEquals(
            "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a" +
                "2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
            Hashing.toHex(Hashing.sha512(ByteArrayInputStream(abc), abc.size.toLong())),
        )
        assertEquals(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            Hashing.toHex(Hashing.sha256(abc)),
        )
    }

    @Test
    fun streamingProgressAndSizeMismatch() {
        val data = ByteArray(200_000) { (it * 13).toByte() }
        var last = 0L
        val digest = Hashing.sha256(ByteArrayInputStream(data), data.size.toLong()) { processed ->
            assertTrue(processed >= last)
            last = processed
        }
        assertEquals(data.size.toLong(), last)
        assertEquals(32, digest.size)
        try {
            Hashing.sha256(ByteArrayInputStream(data), data.size.toLong() + 1)
            fail("Declared-size mismatch accepted")
        } catch (_: IOException) {
        }
    }

    @Test
    fun constantTimeEqualityIsValueCorrect() {
        assertTrue(Hashing.constantTimeEquals(byteArrayOf(1, 2, 3), byteArrayOf(1, 2, 3)))
        assertFalse(Hashing.constantTimeEquals(byteArrayOf(1, 2, 3), byteArrayOf(1, 2, 4)))
        assertFalse(Hashing.constantTimeEquals(byteArrayOf(1), byteArrayOf(1, 2)))
    }
}
