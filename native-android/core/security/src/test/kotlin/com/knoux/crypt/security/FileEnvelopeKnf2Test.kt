package com.knoux.crypt.security

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.EOFException
import java.security.GeneralSecurityException
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class FileEnvelopeKnf2Test {
    private val fileKey = SecretKeySpec(ByteArray(32) { (it * 3 + 1).toByte() }, "AES")
    private val otherKey = SecretKeySpec(ByteArray(32) { (it * 7 + 2).toByte() }, "AES")
    private val context = "knoux:file:device:v1".toByteArray()
    private val wrapped = ByteArray(69) { (it + 5).toByte() }

    private fun sealWrapped(
        data: ByteArray,
        key: SecretKey = fileKey,
        wrappedKey: ByteArray = wrapped,
        context: ByteArray = this.context,
    ): ByteArray {
        val out = ByteArrayOutputStream()
        FileEnvelope(chunkSize = 1024).encryptWrappedDevice(
            ByteArrayInputStream(data),
            out,
            key,
            wrappedKey,
            context,
            data.size.toLong(),
        )
        return out.toByteArray()
    }

    private fun openWrapped(
        envelope: ByteArray,
        key: SecretKey = fileKey,
        context: ByteArray = this.context,
    ): ByteArray {
        val out = ByteArrayOutputStream()
        FileEnvelope(chunkSize = 1024).decryptDevice(
            ByteArrayInputStream(envelope),
            out,
            context,
            keyProvider = { key },
        )
        return out.toByteArray()
    }

    @Test
    fun knf2RoundTripAndAuthenticatedHeader() {
        val sizes = listOf(0, 1, 1024, 1025, 3 * 1024 + 9)
        for (size in sizes) {
            val data = ByteArray(size) { (it * 17 % 251).toByte() }
            val envelope = sealWrapped(data)
            val header = FileEnvelope().readHeader(ByteArrayInputStream(envelope))
            assertEquals(2, header.version)
            assertEquals(FileEnvelope.KeySource.DEVICE_WRAPPED, header.keySource)
            assertNotNull(header.wrappedFileKey)
            assertArrayEquals(wrapped, header.wrappedFileKey)
            assertArrayEquals(data, openWrapped(envelope))
        }
        assertEquals(
            wrapped.size + 4 + 1 + 1 + 1 + 4 + 12 + 4 + 8,
            FileEnvelope().readHeader(ByteArrayInputStream(sealWrapped(ByteArray(1)))).raw.size,
        )
    }

    @Test
    fun wrongFileKeyAndHeaderTamperingRejected() {
        val envelope = sealWrapped(ByteArray(2000) { it.toByte() })
        rejected { openWrapped(envelope, otherKey) }

        val tamperedWrapped = envelope.clone()
        // The wrapped key starts at offset 11 in KNF2.
        tamperedWrapped[12] = (tamperedWrapped[12].toInt() xor 1).toByte()
        rejected { openWrapped(tamperedWrapped) }

        val tamperedChunk = envelope.clone()
        tamperedChunk[tamperedChunk.size - 1] = (tamperedChunk[tamperedChunk.size - 1].toInt() xor 1).toByte()
        rejected { openWrapped(tamperedChunk) }
    }

    @Test
    fun interruptedWritesAreRejected() {
        val full = sealWrapped(ByteArray(4096) { it.toByte() })
        for (cut in listOf(full.size - 1, full.size / 2, 20)) {
            rejected { openWrapped(full.copyOf(cut)) }
        }
    }

    @Test
    fun legacyKnf1DeviceFileStillDecryptsThroughDevicePath() {
        val data = ByteArray(2048) { (it * 5).toByte() }
        val legacy = ByteArrayOutputStream()
        FileEnvelope(chunkSize = 1024).encrypt(
            ByteArrayInputStream(data),
            legacy,
            fileKey,
            FileEnvelope.KeySource.DEVICE,
            context,
            data.size.toLong(),
        )
        val header = FileEnvelope().readHeader(ByteArrayInputStream(legacy.toByteArray()))
        assertEquals(1, header.version)
        assertEquals(FileEnvelope.KeySource.DEVICE, header.keySource)
        val restored = ByteArrayOutputStream()
        FileEnvelope(chunkSize = 1024).decryptDevice(
            ByteArrayInputStream(legacy.toByteArray()),
            restored,
            context,
            keyProvider = { fileKey },
        )
        assertArrayEquals(data, restored.toByteArray())
    }

    @Test
    fun nonExportableKeyCannotUseLegacyKnf1Encryption() {
        val opaque = object : SecretKey {
            override fun getAlgorithm(): String = "AES"
            override fun getFormat(): String? = null
            override fun getEncoded(): ByteArray? = null
        }
        try {
            FileEnvelope().encrypt(
                ByteArrayInputStream(ByteArray(1)),
                ByteArrayOutputStream(),
                opaque,
                FileEnvelope.KeySource.DEVICE,
                context,
                1,
            )
            fail("Non-exportable Keystore-style key was accepted for caller-IV KNF1")
        } catch (_: UnsupportedContainerException) {
        }
        assertTrue(true)
    }

    private fun rejected(action: () -> Unit) {
        try {
            action()
            fail("Unauthenticated, truncated or malformed KNF2 container accepted")
        } catch (_: GeneralSecurityException) {
        } catch (_: EOFException) {
        } catch (_: UnsupportedContainerException) {
        } catch (_: IllegalArgumentException) {
        }
    }
}
