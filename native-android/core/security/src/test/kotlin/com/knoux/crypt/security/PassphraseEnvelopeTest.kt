package com.knoux.crypt.security

import java.security.GeneralSecurityException
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.fail
import org.junit.Test

class PassphraseEnvelopeTest {
    private val codec = PassphraseEnvelope()
    private val context = "knoux:text:v1".toByteArray()
    private val fast = Argon2idParameters(8 * 1024, 1, 1)
    private val legacyIterations = 1_000

    @Test
    fun argon2RoundTrip() {
        val message = "KNOUX secret text — نص سري".toByteArray()
        val sealed = codec.seal(message, "correct horse battery".toCharArray(), context, fast)
        assertArrayEquals(message, codec.open(sealed, "correct horse battery".toCharArray(), context))
    }

    @Test
    fun knp2RecordsTheArgon2idParameters() {
        val sealed = codec.seal("same".toByteArray(), "pw".toCharArray(), context, fast)
        assertEquals('K'.code, sealed[0].toInt())
        assertEquals('N'.code, sealed[1].toInt())
        assertEquals('P'.code, sealed[2].toInt())
        assertEquals('2'.code, sealed[3].toInt())
        assertEquals(2, sealed[4].toInt())
        assertEquals(2, sealed[5].toInt())
        assertEquals(fast.memoryKib, readInt(sealed, 6))
        assertEquals(fast.iterations, readInt(sealed, 10))
        assertEquals(fast.parallelism, readInt(sealed, 14))
        assertFalse(sealed.copyOfRange(18, 34).all { it == 0.toByte() })
    }

    @Test
    fun legacyKnp1RemainsReadable() {
        val message = "legacy envelope".toByteArray()
        val sealed = codec.sealLegacyPbkdf2(message, "pw".toCharArray(), context, legacyIterations)
        assertEquals('1'.code, sealed[3].toInt())
        // KNP1 records PBKDF2 iterations at bytes 6..9.
        assertEquals(legacyIterations, readInt(sealed, 6))
        assertArrayEquals(message, codec.open(sealed, "pw".toCharArray(), context))
    }

    @Test
    fun wrongPassphraseAndContextRejected() {
        val sealed = codec.seal("secret".toByteArray(), "alpha".toCharArray(), context, fast)
        rejected { codec.open(sealed, "beta".toCharArray(), context) }
        rejected { codec.open(sealed, "alpha".toCharArray(), "other".toByteArray()) }
    }

    @Test
    fun tamperingRejected() {
        val sealed = codec.seal("secret payload".toByteArray(), "alpha".toCharArray(), context, fast)
        for (index in listOf(0, 4, 5, 6, 10, 14, 20, 45, sealed.size - 1)) {
            val changed = sealed.clone()
            changed[index] = (changed[index].toInt() xor 1).toByte()
            rejected { codec.open(changed, "alpha".toCharArray(), context) }
        }
    }

    @Test
    fun craftedArgon2ParametersRejectedBeforeAllocation() {
        val sealed = codec.seal("secret".toByteArray(), "pw".toCharArray(), context, fast)
        val tooLarge = sealed.clone()
        writeInt(tooLarge, 6, 1_000_000_000)
        rejected { codec.open(tooLarge, "pw".toCharArray(), context) }
        val zeroMemory = sealed.clone()
        writeInt(zeroMemory, 6, 0)
        rejected { codec.open(zeroMemory, "pw".toCharArray(), context) }
    }

    @Test
    fun limitsEnforced() {
        rejected {
            codec.seal(
                ByteArray(PassphraseEnvelope.MAX_PLAINTEXT_BYTES + 1),
                "pw".toCharArray(),
                context,
                fast,
            )
        }
        rejected { codec.seal(byteArrayOf(1), "pw".toCharArray(), ByteArray(0), fast) }
        rejected { codec.seal(byteArrayOf(1), CharArray(0), context, fast) }
        rejected { Argon2idParameters(1, 1, 1) }
        rejected { Argon2idParameters(Argon2idParameters.MAX_MEMORY_KIB + 1, 1, 1) }
        rejected { Argon2idParameters(8 * 1024, 0, 1) }
        rejected { Argon2idParameters(8 * 1024, 1, 0) }
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

    private fun readInt(bytes: ByteArray, offset: Int): Int =
        ((bytes[offset].toInt() and 0xff) shl 24) or
            ((bytes[offset + 1].toInt() and 0xff) shl 16) or
            ((bytes[offset + 2].toInt() and 0xff) shl 8) or
            (bytes[offset + 3].toInt() and 0xff)

    private fun writeInt(bytes: ByteArray, offset: Int, value: Int) {
        bytes[offset] = (value ushr 24).toByte()
        bytes[offset + 1] = (value ushr 16).toByte()
        bytes[offset + 2] = (value ushr 8).toByte()
        bytes[offset + 3] = value.toByte()
    }

    private fun rejected(action: () -> Unit) {
        try {
            action()
            fail("Invalid input accepted")
        } catch (_: GeneralSecurityException) {
        } catch (_: IllegalArgumentException) {
        } catch (_: IllegalStateException) {
        }
    }
}
