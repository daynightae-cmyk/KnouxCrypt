package com.knoux.crypt.security

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.EOFException
import java.security.GeneralSecurityException
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class FileEnvelopeTest {
    private val key: SecretKey = SecretKeySpec(ByteArray(32) { it.toByte() }, "AES")
    private val context = "knoux:file:test".toByteArray()

    private fun seal(
        data: ByteArray,
        key: SecretKey = this.key,
        keySource: FileEnvelope.KeySource = FileEnvelope.KeySource.DEVICE,
        kdf: FileEnvelope.KdfParams? = null,
        context: ByteArray = this.context,
    ): ByteArray {
        val out = ByteArrayOutputStream()
        FileEnvelope(chunkSize = 1024).encrypt(
            ByteArrayInputStream(data), out, key, keySource, context, data.size.toLong(), kdf,
        )
        return out.toByteArray()
    }

    private fun open(
        envelope: ByteArray,
        key: SecretKey = this.key,
        expected: FileEnvelope.KeySource = FileEnvelope.KeySource.DEVICE,
        context: ByteArray = this.context,
    ): ByteArray {
        val out = ByteArrayOutputStream()
        FileEnvelope(chunkSize = 1024).decrypt(
            ByteArrayInputStream(envelope), out, expected, context,
            keyProvider = { key },
        )
        return out.toByteArray()
    }

    @Test
    fun roundTripAcrossBoundaries() {
        val sizes = listOf(0, 1, 1023, 1024, 1025, 2048, 3 * 1024 + 7)
        for (size in sizes) {
            val data = ByteArray(size) { (it * 31 % 251).toByte() }
            assertArrayEquals("size=$size", data, open(seal(data)))
        }
    }

    @Test
    fun emptyFileStillCarriesAuthenticationTag() {
        val envelope = seal(ByteArray(0))
        assertEquals(FileEnvelope.HEADER_BYTES + FileEnvelope.TAG_BYTES, envelope.size)
        assertArrayEquals(ByteArray(0), open(envelope))
    }

    @Test
    fun headerRecordsKdfAndKeySource() {
        val params = FileEnvelope.KdfParams(1_000, ByteArray(16) { (it + 3).toByte() })
        val passphrase = "correct horse".toCharArray()
        val derived = KeyDerivation.forEnvelope(passphrase, params)
        val data = "portable".toByteArray()
        val envelope = seal(data, derived, FileEnvelope.KeySource.PASSPHRASE, params)
        val header = FileEnvelope().readHeader(ByteArrayInputStream(envelope))
        assertEquals(FileEnvelope.KeySource.PASSPHRASE, header.keySource)
        assertEquals(params, header.kdfParams)
        assertEquals(data.size.toLong(), header.plaintextLength)
        val out = ByteArrayOutputStream()
        FileEnvelope(chunkSize = 1024).decrypt(
            ByteArrayInputStream(envelope), out, FileEnvelope.KeySource.PASSPHRASE, context,
            keyProvider = { parsed -> KeyDerivation.forEnvelope(passphrase, parsed.kdfParams!!) },
        )
        assertArrayEquals(data, out.toByteArray())
    }

    @Test
    fun uniqueBaseNoncePerEncryption() {
        val first = seal(ByteArray(10) { 1 })
        val second = seal(ByteArray(10) { 1 })
        assertFalse(first.copyOfRange(20, 32).contentEquals(second.copyOfRange(20, 32)))
        assertNotEquals(first.toList(), second.toList())
    }

    @Test
    fun tamperingAnyChunkOrHeaderFails() {
        val data = ByteArray(2_500) { (it % 97).toByte() }
        val envelope = seal(data)
        val indices = listOf(
            0, 4, 5, 6, 7, 8, 9, 11, 20, 31, 40, 48,
            FileEnvelope.HEADER_BYTES,
            FileEnvelope.HEADER_BYTES + 500,
            FileEnvelope.HEADER_BYTES + 1024 + FileEnvelope.TAG_BYTES + 3,
            envelope.size - 1,
        )
        for (index in indices) {
            val changed = envelope.clone()
            changed[index] = (changed[index].toInt() xor 0x01).toByte()
            rejected { open(changed) }
        }
    }

    @Test
    fun truncationAndTrailingBytesFail() {
        val envelope = seal(ByteArray(1_100) { 7 })
        val lengths = listOf(0, 10, FileEnvelope.HEADER_BYTES - 1, FileEnvelope.HEADER_BYTES + 1, envelope.size - 1)
        for (length in lengths) rejected { open(envelope.copyOf(length)) }
        rejected { open(envelope + byteArrayOf(0)) }
    }

    @Test
    fun reorderedChunksFail() {
        val chunk = 1024
        val data = ByteArray(chunk * 2) { (it % 250).toByte() }
        val envelope = seal(data)
        val firstStart = FileEnvelope.HEADER_BYTES
        val firstEnd = firstStart + chunk + FileEnvelope.TAG_BYTES
        val secondStart = firstEnd
        val secondEnd = secondStart + chunk + FileEnvelope.TAG_BYTES
        val swapped = envelope.copyOfRange(0, firstStart) +
            envelope.copyOfRange(secondStart, secondEnd) +
            envelope.copyOfRange(firstStart, firstEnd) +
            envelope.copyOfRange(secondEnd, envelope.size)
        rejected { open(swapped) }
    }

    @Test
    fun wrongKeyContextAndKeySourceFail() {
        val envelope = seal(ByteArray(50) { 3 })
        rejected { open(envelope, SecretKeySpec(ByteArray(32) { 9 }, "AES")) }
        rejected { open(envelope, context = "other".toByteArray()) }
        rejected { open(envelope, expected = FileEnvelope.KeySource.PASSPHRASE) }
    }

    @Test
    fun wrongContextSizeRejected() {
        rejected { seal(byteArrayOf(1), context = ByteArray(0)) }
        rejected { seal(byteArrayOf(1), context = ByteArray(FileEnvelope.MAX_CONTEXT_BYTES + 1)) }
    }

    @Test
    fun passphraseContainerRequiresKdf() {
        try {
            seal(byteArrayOf(1), key, FileEnvelope.KeySource.PASSPHRASE, null)
            fail("Passphrase container accepted without KDF")
        } catch (_: IllegalArgumentException) {
        }
    }

    @Test
    fun progressIsMonotonicAndComplete() {
        val data = ByteArray(4_321) { it.toByte() }
        val events = mutableListOf<FileEnvelope.Progress>()
        val out = ByteArrayOutputStream()
        FileEnvelope(chunkSize = 1024).encrypt(
            ByteArrayInputStream(data), out, key, FileEnvelope.KeySource.DEVICE, context, data.size.toLong(),
        ) { events += it }
        assertTrue(events.isNotEmpty())
        assertEquals(data.size.toLong(), events.last().processedBytes)
        assertEquals(1f, events.last().fraction)
        assertTrue(events.zipWithNext().all { (a, b) -> a.processedBytes <= b.processedBytes })
    }

    @Test
    fun declaredLengthMismatchRejected() {
        val out = ByteArrayOutputStream()
        try {
            FileEnvelope(chunkSize = 1024).encrypt(
                ByteArrayInputStream(ByteArray(10)), out, key, FileEnvelope.KeySource.DEVICE, context, 20,
            )
            fail("Short input accepted")
        } catch (_: EOFException) {
        }
        val out2 = ByteArrayOutputStream()
        try {
            FileEnvelope(chunkSize = 1024).encrypt(
                ByteArrayInputStream(ByteArray(20)), out2, key, FileEnvelope.KeySource.DEVICE, context, 10,
            )
            fail("Extra input accepted")
        } catch (_: java.io.IOException) {
        }
    }

    @Test
    fun garbageHeaderRejected() {
        try {
            FileEnvelope().readHeader(ByteArrayInputStream(ByteArray(200) { 1 }))
            fail("Garbage header accepted")
        } catch (_: UnsupportedContainerException) {
        }
    }

    private fun rejected(action: () -> Unit) {
        try {
            action()
            fail("Unauthenticated or malformed container accepted")
        } catch (_: GeneralSecurityException) {
        } catch (_: UnsupportedContainerException) {
        } catch (_: EOFException) {
        } catch (_: IllegalArgumentException) {
        }
    }
}
