package com.knoux.crypt.security

import java.security.GeneralSecurityException
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class PassphraseEnvelopeTest {
    private val codec = PassphraseEnvelope()
    private val context = "knoux:text:v1".toByteArray()
    private val iterations = 1_000

    @Test
    fun roundTrip() {
        val message = "KNOUX secret text — نص سري".toByteArray()
        val sealed = codec.seal(message, "correct horse battery".toCharArray(), context, iterations)
        assertArrayEquals(message, codec.open(sealed, "correct horse battery".toCharArray(), context))
    }

    @Test
    fun outputVariesAndRecordsIterations() {
        val first = codec.seal("same".toByteArray(), "pw".toCharArray(), context, iterations)
        val second = codec.seal("same".toByteArray(), "pw".toCharArray(), context, iterations)
        assertFalse(first.contentEquals(second))
        // Bytes 6..9 are the big-endian iteration count.
        val recorded = ((first[6].toInt() and 0xff) shl 24) or ((first[7].toInt() and 0xff) shl 16) or
            ((first[8].toInt() and 0xff) shl 8) or (first[9].toInt() and 0xff)
        assertEquals(iterations, recorded)
    }

    @Test
    fun wrongPassphraseAndContextRejected() {
        val sealed = codec.seal("secret".toByteArray(), "alpha".toCharArray(), context, iterations)
        rejected { codec.open(sealed, "beta".toCharArray(), context) }
        rejected { codec.open(sealed, "alpha".toCharArray(), "other".toByteArray()) }
    }

    @Test
    fun tamperingRejected() {
        val sealed = codec.seal("secret payload".toByteArray(), "alpha".toCharArray(), context, iterations)
        for (index in listOf(0, 4, 5, 6, 10, 30, 43, sealed.size - 1)) {
            val changed = sealed.clone()
            changed[index] = (changed[index].toInt() xor 1).toByte()
            rejected { codec.open(changed, "alpha".toCharArray(), context) }
        }
    }

    @Test
    fun limitsEnforced() {
        rejected { codec.seal(ByteArray(PassphraseEnvelope.MAX_PLAINTEXT_BYTES + 1), "pw".toCharArray(), context, iterations) }
        rejected { codec.seal(byteArrayOf(1), "pw".toCharArray(), ByteArray(0), iterations) }
        rejected { codec.seal(byteArrayOf(1), "pw".toCharArray(), context, 10) }
        rejected { codec.seal(byteArrayOf(1), CharArray(0), context, iterations) }
    }

    @Test
    fun kdfIsDeterministicAndSaltSensitive() {
        val salt = ByteArray(16) { it.toByte() }
        val first = KeyDerivation.pbkdf2("pass".toCharArray(), salt, 2_000, 32)
        val second = KeyDerivation.pbkdf2("pass".toCharArray(), salt, 2_000, 32)
        val other = KeyDerivation.pbkdf2("pass".toCharArray(), salt.map { (it + 1).toByte() }.toByteArray(), 2_000, 32)
        assertArrayEquals(first, second)
        assertFalse(first.contentEquals(other))
        assertEquals(32, first.size)
    }

    private fun rejected(action: () -> Unit) {
        try {
            action()
            fail("Invalid input accepted")
        } catch (_: GeneralSecurityException) {
        } catch (_: IllegalArgumentException) {
        }
    }
}
