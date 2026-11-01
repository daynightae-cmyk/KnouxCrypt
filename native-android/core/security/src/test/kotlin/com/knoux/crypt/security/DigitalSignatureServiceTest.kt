package com.knoux.crypt.security

import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.spec.ECGenParameterSpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Known-answer and negative tests for the detached signature engine. */
class DigitalSignatureServiceTest {

    private fun keyPair(): KeyPair {
        val generator = KeyPairGenerator.getInstance("EC")
        generator.initialize(ECGenParameterSpec(DigitalSignatureService.CURVE))
        return generator.generateKeyPair()
    }

    @Test
    fun digestMatchesTheKnownSha256Vector() {
        assertEquals(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            DigitalSignatureService.digestHex("abc".toByteArray()),
        )
    }

    @Test
    fun aFreshSignatureVerifiesAgainstItsOwnKey() {
        val pair = keyPair()
        val content = "KNOUX signed content".toByteArray()
        val signature = DigitalSignatureService.sign(content, pair.private)
        assertEquals(
            DigitalSignatureService.Verdict.VALID,
            DigitalSignatureService.verify(content, pair.public, signature),
        )
    }

    @Test
    fun changedContentFailsAndReportsTheDigestMismatch() {
        val pair = keyPair()
        val signature = DigitalSignatureService.sign("original".toByteArray(), pair.private)
        val verdict = DigitalSignatureService.verify(
            content = "tampered".toByteArray(),
            publicKey = pair.public,
            signature = signature,
            expectedDigestHex = DigitalSignatureService.digestHex("original".toByteArray()),
        )
        assertEquals(DigitalSignatureService.Verdict.DIGEST_MISMATCH, verdict)
    }

    @Test
    fun aForeignKeyCannotVerifyTheSignature() {
        val signer = keyPair()
        val other = keyPair()
        val content = "payload".toByteArray()
        val signature = DigitalSignatureService.sign(content, signer.private)
        assertEquals(
            DigitalSignatureService.Verdict.INVALID_SIGNATURE,
            DigitalSignatureService.verify(content, other.public, signature),
        )
    }

    @Test
    fun malformedInputsAreReportedInsteadOfThrowing() {
        val pair = keyPair()
        assertEquals(
            DigitalSignatureService.Verdict.MALFORMED,
            DigitalSignatureService.verify("x".toByteArray(), pair.public, ByteArray(0)),
        )
        assertNull(DigitalSignatureService.publicKeyFromBase64("not-base64!!"))
        assertNull(DigitalSignatureService.signatureFromBase64("***"))
        assertNotNull(DigitalSignatureService.publicKeyFromBase64(DigitalSignatureService.publicKeyToBase64(pair.public)))
    }

    @Test
    fun rsaSignaturesAlsoVerifyAndAreReportedWithTheirAlgorithm() {
        val generator = KeyPairGenerator.getInstance("RSA")
        generator.initialize(2048)
        val pair = generator.generateKeyPair()
        val content = "rsa payload".toByteArray()
        val signature = DigitalSignatureService.sign(content, pair.private, DigitalSignatureService.ALGORITHM_RSA)
        assertEquals(
            DigitalSignatureService.Verdict.VALID,
            DigitalSignatureService.verify(
                content,
                pair.public,
                signature,
                algorithm = DigitalSignatureService.ALGORITHM_RSA,
            ),
        )
        assertEquals(
            DigitalSignatureService.ALGORITHM_RSA,
            DigitalSignatureService.algorithmFor(pair.public),
        )
        // An ECDSA request against an RSA key is refused as malformed rather
        // than reported as a plain signature failure.
        assertEquals(
            DigitalSignatureService.Verdict.MALFORMED,
            DigitalSignatureService.verify(content, pair.public, signature),
        )
        // Unsupported algorithms are refused outright.
        assertEquals(
            DigitalSignatureService.Verdict.MALFORMED,
            DigitalSignatureService.verify(content, pair.public, signature, algorithm = "MD5withRSA"),
        )
    }

    @Test
    fun publicKeyRoundTripsThroughBase64Spki() {
        val pair = keyPair()
        val encoded = DigitalSignatureService.publicKeyToBase64(pair.public)
        val decoded = DigitalSignatureService.publicKeyFromBase64(encoded)
        assertNotNull(decoded)
        assertEquals(pair.public, decoded)
        assertEquals(
            DigitalSignatureService.ALGORITHM_ECDSA,
            DigitalSignatureService.algorithmFor(pair.public),
        )
        assertFalse(encoded.contains(" "))
    }
}
