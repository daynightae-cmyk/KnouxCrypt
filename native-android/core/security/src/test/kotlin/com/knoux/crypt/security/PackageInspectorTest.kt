package com.knoux.crypt.security

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import javax.crypto.spec.SecretKeySpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PackageInspectorTest {
    private val inspector = PackageInspector()
    private val context = "knoux:package:test".toByteArray()
    private val fileKey = SecretKeySpec(ByteArray(32) { it.toByte() }, "AES")

    @Test
    fun inspectsKnf1PassphraseHeaderWithoutAClaimOfAuthenticity() {
        val params = FileEnvelope.KdfParams(1_000, ByteArray(16) { 3 })
        val key = KeyDerivation.forEnvelope("pass".toCharArray(), params)
        val secret = "unique-plaintext-xyz"
        val out = ByteArrayOutputStream()
        FileEnvelope(chunkSize = 1024).encrypt(
            ByteArrayInputStream(secret.toByteArray()),
            out,
            key,
            FileEnvelope.KeySource.PASSPHRASE,
            context,
            secret.toByteArray().size.toLong(),
            params,
        )
        val report = inspector.inspect(out.toByteArray())
        assertEquals(PackageFormat.KNF1, report.format)
        assertEquals(PackageStructuralState.VALID_HEADER, report.state)
        assertEquals("PASSPHRASE", report.keySource)
        assertEquals("PBKDF2-HMAC-SHA256", report.kdf)
        assertEquals(1_000, report.iterations)
        assertEquals(secret.toByteArray().size.toLong(), report.plaintextLength)
        assertFalse(report.authenticated)
        assertFalse(report.notes.joinToString().contains(secret))
    }

    @Test
    fun inspectsKnf2WrappedHeaderAndChunkMetadata() {
        val wrapped = ByteArray(69) { (it + 1).toByte() }
        val out = ByteArrayOutputStream()
        FileEnvelope(chunkSize = 2048).encryptWrappedDevice(
            ByteArrayInputStream(ByteArray(4096)),
            out,
            fileKey,
            wrapped,
            context,
            4096,
        )
        val report = inspector.inspect(out.toByteArray())
        assertEquals(PackageFormat.KNF2, report.format)
        assertEquals("DEVICE_WRAPPED", report.keySource)
        assertEquals(wrapped.size, report.wrappedKeyBytes)
        assertEquals(2048, report.chunkSize)
        assertEquals(4096L, report.plaintextLength)
        assertNotNull(report.headerBytes)
        assertFalse(report.authenticated)
    }

    @Test
    fun inspectsKnp1AndKnp2Parameters() {
        val codec = PassphraseEnvelope()
        val legacy = codec.sealLegacyPbkdf2("legacy".toByteArray(), "pw".toCharArray(), context, 2_000)
        val legacyReport = inspector.inspect(legacy)
        assertEquals(PackageFormat.KNP1, legacyReport.format)
        assertEquals("PBKDF2-HMAC-SHA256", legacyReport.kdf)
        assertEquals(2_000, legacyReport.iterations)

        val modern = codec.seal(
            "modern".toByteArray(),
            "pw".toCharArray(),
            context,
            Argon2idParameters(8 * 1024, 1, 1),
        )
        val modernReport = inspector.inspect(modern)
        assertEquals(PackageFormat.KNP2, modernReport.format)
        assertEquals("Argon2id", modernReport.kdf)
        assertEquals(8 * 1024, modernReport.memoryKib)
        assertEquals(1, modernReport.iterations)
        assertEquals(1, modernReport.parallelism)
        assertFalse(modernReport.authenticated)
    }

    @Test
    fun malformedAndTruncatedHeadersAreReportedWithoutKeys() {
        val unknown = inspector.inspect("NOPE".toByteArray())
        assertEquals(PackageFormat.UNKNOWN, unknown.format)
        assertEquals(PackageStructuralState.UNSUPPORTED, unknown.state)

        val truncated = inspector.inspect(byteArrayOf(0x4b, 0x4e, 0x46, 0x31, 1, 1))
        assertEquals(PackageFormat.KNF1, truncated.format)
        assertEquals(PackageStructuralState.TRUNCATED, truncated.state)

        val wrapped = ByteArray(69) { it.toByte() }
        val out = ByteArrayOutputStream()
        FileEnvelope().encryptWrappedDevice(
            ByteArrayInputStream(ByteArray(1)), out, fileKey, wrapped, context, 1,
        )
        val forged = out.toByteArray().clone()
        // KNF2 wrapped length is the int after magic/version/alg/source.
        forged[7] = 0x7f
        forged[8] = 0x7f
        forged[9] = 0x7f
        forged[10] = 0x7f
        val forgedReport = inspector.inspect(forged)
        assertEquals(PackageFormat.KNF2, forgedReport.format)
        assertTrue(
            forgedReport.state == PackageStructuralState.UNSUPPORTED ||
                forgedReport.state == PackageStructuralState.MALFORMED,
        )

        val hugeKnp = ByteArray(64) { 0 }
        // Valid KNP2 magic with absurd Argon2 memory in the header.
        val buffer = ByteBuffer.wrap(hugeKnp).order(ByteOrder.BIG_ENDIAN)
            .put(byteArrayOf(0x4b, 0x4e, 0x50, 0x32))
            .put(2).put(2).putInt(1_000_000_000).putInt(1).putInt(1)
        assertNotNull(buffer)
        val hugeReport = inspector.inspect(hugeKnp)
        assertEquals(PackageFormat.KNP2, hugeReport.format)
        assertEquals(PackageStructuralState.MALFORMED, hugeReport.state)
    }
}
