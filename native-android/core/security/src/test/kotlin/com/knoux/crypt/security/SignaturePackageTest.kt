package com.knoux.crypt.security

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Framing tests for the KSG1/KSA1 signature packages (TASK 38).
 *
 * Every length in the container comes from the file, so the tests aim at the
 * parser rather than at the happy path: a truncated, contradictory or
 * exaggerated field must be refused without allocating what it claims.
 */
class SignaturePackageTest {

    private val keyPair = java.security.KeyPairGenerator.getInstance("EC")
        .apply { initialize(java.security.spec.ECGenParameterSpec(DigitalSignatureService.CURVE)) }
        .generateKeyPair()

    private val signature = DigitalSignatureService.sign(
        "the signed bytes".toByteArray(),
        keyPair.private,
        DigitalSignatureService.ALGORITHM_ECDSA,
    )

    private val meta = """{"fileName":"minutes.txt"}""".toByteArray()

    @Test
    fun detachedPackagesRoundTripWithoutContent() {
        val bytes = SignaturePackage.encode(
            attached = false,
            algorithm = DigitalSignatureService.ALGORITHM_ECDSA,
            publicKeySpki = keyPair.public.encoded,
            signature = signature,
            metadata = meta,
        )
        assertEquals("KSG1", String(bytes, 0, 4, Charsets.US_ASCII))
        val decoded = SignaturePackage.decode(bytes)
        assertFalse(decoded.attached)
        assertNull(decoded.content)
        assertEquals(DigitalSignatureService.ALGORITHM_ECDSA, decoded.algorithm)
        assertArrayEquals(signature, decoded.signature)
        assertArrayEquals(keyPair.public.encoded, decoded.publicKeySpki)
        assertArrayEquals(meta, decoded.metadata)
        assertNotNull(decoded.publicKey())
        assertTrue(SignaturePackage.looksLike(bytes))
    }

    @Test
    fun attachedPackagesCarryTheirContentVerbatim() {
        val content = ByteArray(4096) { (it % 250).toByte() }
        val bytes = SignaturePackage.encode(
            attached = true,
            algorithm = DigitalSignatureService.ALGORITHM_ECDSA,
            publicKeySpki = keyPair.public.encoded,
            signature = signature,
            metadata = meta,
            content = content,
        )
        assertEquals("KSA1", String(bytes, 0, 4, Charsets.US_ASCII))
        val decoded = SignaturePackage.decode(bytes)
        assertTrue(decoded.attached)
        assertArrayEquals(content, decoded.content)
    }

    @Test
    fun rsaPackagesSurviveTheSameFraming() {
        val rsa = java.security.KeyPairGenerator.getInstance("RSA")
            .apply { initialize(DigitalSignatureService.RSA_KEY_SIZE) }
            .generateKeyPair()
        val rsaSignature = DigitalSignatureService.sign(
            "rsa bytes".toByteArray(),
            rsa.private,
            DigitalSignatureService.ALGORITHM_RSA,
        )
        val bytes = SignaturePackage.encode(
            attached = false,
            algorithm = DigitalSignatureService.ALGORITHM_RSA,
            publicKeySpki = rsa.public.encoded,
            signature = rsaSignature,
            metadata = meta,
        )
        val decoded = SignaturePackage.decode(bytes)
        assertEquals(DigitalSignatureService.ALGORITHM_RSA, decoded.algorithm)
        assertEquals(
            DigitalSignatureService.Verdict.VALID,
            DigitalSignatureService.verify("rsa bytes".toByteArray(), decoded.publicKey()!!, decoded.signature, decoded.algorithm),
        )
    }

    @Test
    fun unsupportedVersionAlgorithmAndDigestModeAreRefused() {
        val base = SignaturePackage.encode(
            attached = false,
            algorithm = DigitalSignatureService.ALGORITHM_ECDSA,
            publicKeySpki = keyPair.public.encoded,
            signature = signature,
            metadata = meta,
        )
        listOf(
            4 to 2, // version
            5 to 9, // algorithm id
            6 to 7, // digest mode
        ).forEach { (index, value) ->
            val mutated = base.copyOf().also { it[index] = value.toByte() }
            try {
                SignaturePackage.decode(mutated)
                fail("accepted a mutated byte at offset $index")
            } catch (expected: SignaturePackage.UnsupportedPackageException) {
                assertTrue(expected.message!!.isNotBlank())
            }
        }
    }

    @Test
    fun kindAndMagicMustAgree() {
        val detached = SignaturePackage.encode(
            attached = false,
            algorithm = DigitalSignatureService.ALGORITHM_ECDSA,
            publicKeySpki = keyPair.public.encoded,
            signature = signature,
            metadata = meta,
        )
        // Flip the content-kind byte so a detached magic claims to be attached.
        val contradictory = detached.copyOf().also { it[7] = SignaturePackage.KIND_ATTACHED.toByte() }
        try {
            SignaturePackage.decode(contradictory)
            fail("accepted a package whose kind contradicts its magic")
        } catch (expected: SignaturePackage.MalformedPackageException) {
            assertTrue(expected.message!!.contains("contradicts"))
        }
    }

    @Test
    fun foreignAndTruncatedInputsAreNotPackages() {
        val bytes = SignaturePackage.encode(
            attached = true,
            algorithm = DigitalSignatureService.ALGORITHM_ECDSA,
            publicKeySpki = keyPair.public.encoded,
            signature = signature,
            metadata = meta,
            content = ByteArray(64),
        )
        assertFalse(SignaturePackage.looksLike("KSR1 share package".toByteArray()))
        assertFalse(SignaturePackage.looksLike(ByteArray(3)))
        try {
            SignaturePackage.decode(ByteArray(2))
            fail("accepted a two-byte package")
        } catch (expected: SignaturePackage.MalformedPackageException) {
            assertTrue(expected.message!!.contains("truncated"))
        }
        // Truncating inside each declared field must be caught, not allocated.
        listOf(20, 40, 60, 90, 120).forEach { cut ->
            if (cut >= bytes.size) return@forEach
            try {
                SignaturePackage.decode(bytes.copyOfRange(0, cut))
                fail("accepted a package truncated to $cut bytes")
            } catch (expected: SignaturePackage.MalformedPackageException) {
                assertTrue(expected.message!!.isNotBlank())
            }
        }
    }

    @Test
    fun exaggeratedFieldLengthsAreRefusedBeforeAllocation() {
        val bytes = SignaturePackage.encode(
            attached = false,
            algorithm = DigitalSignatureService.ALGORITHM_ECDSA,
            publicKeySpki = keyPair.public.encoded,
            signature = signature,
            metadata = meta,
        )
        // Claim a public key of 4000 bytes; the file is nowhere near that long.
        val lying = bytes.copyOf()
        lying[8] = 0x0f.toByte()
        lying[9] = 0xa0.toByte()
        try {
            SignaturePackage.decode(lying)
            fail("accepted an implausible public-key length")
        } catch (expected: SignaturePackage.MalformedPackageException) {
            assertTrue(expected.message!!.contains("truncated"))
        }
        // Claim 65535 bytes, beyond any field this format allows.
        val absurd = bytes.copyOf()
        absurd[8] = 0xff.toByte()
        absurd[9] = 0xff.toByte()
        try {
            SignaturePackage.decode(absurd)
            fail("accepted an out-of-range public-key length")
        } catch (expected: SignaturePackage.MalformedPackageException) {
            assertTrue(expected.message!!.contains("out of range"))
        }
    }

    @Test
    fun detachedPackagesRejectTrailingBytes() {
        val bytes = SignaturePackage.encode(
            attached = false,
            algorithm = DigitalSignatureService.ALGORITHM_ECDSA,
            publicKeySpki = keyPair.public.encoded,
            signature = signature,
            metadata = meta,
        )
        try {
            SignaturePackage.decode(bytes + byteArrayOf(0, 1, 2))
            fail("accepted trailing bytes on a detached package")
        } catch (expected: SignaturePackage.MalformedPackageException) {
            assertTrue(expected.message!!.contains("trailing"))
        }
    }

    @Test
    fun encodingRejectsInputsItCannotRepresent() {
        try {
            SignaturePackage.encode(
                attached = false,
                algorithm = "MD5withRSA",
                publicKeySpki = keyPair.public.encoded,
                signature = signature,
                metadata = meta,
            )
            fail("encoded an unsupported algorithm")
        } catch (expected: SignaturePackage.UnsupportedPackageException) {
            assertTrue(expected.message!!.contains("MD5withRSA"))
        }
        try {
            SignaturePackage.encode(
                attached = true,
                algorithm = DigitalSignatureService.ALGORITHM_ECDSA,
                publicKeySpki = keyPair.public.encoded,
                signature = signature,
                metadata = meta,
                content = null,
            )
            fail("encoded an attached package with no content")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message!!.contains("content"))
        }
        try {
            SignaturePackage.encode(
                attached = false,
                algorithm = DigitalSignatureService.ALGORITHM_ECDSA,
                publicKeySpki = keyPair.public.encoded,
                signature = signature,
                metadata = ByteArray(SignaturePackage.MAX_METADATA_BYTES + 1),
            )
            fail("encoded oversized metadata")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message!!.contains("Metadata"))
        }
    }

    @Test
    fun anUnusableEmbeddedKeyIsReportedRatherThanThrown() {
        val bytes = SignaturePackage.encode(
            attached = false,
            algorithm = DigitalSignatureService.ALGORITHM_ECDSA,
            publicKeySpki = keyPair.public.encoded,
            signature = signature,
            metadata = meta,
        )
        // Replace the SPKI with bytes that parse as a well-formed field but no key.
        val decoded = SignaturePackage.decode(bytes)
        val broken = decoded.copy(publicKeySpki = ByteArray(8) { 7 })
        assertNull(broken.publicKey())
    }
}
