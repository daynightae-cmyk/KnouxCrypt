package com.knoux.crypt.security

import java.security.KeyPairGenerator
import java.security.spec.ECGenParameterSpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Known-answer and property tests for the public-key fingerprint format. */
class KeyFingerprintTest {

    @Test
    fun fingerprintMatchesTheKnownVector() {
        assertEquals(
            "SHA256:A5BYxvLAy0ksUzsKTRTvd8wPeKvMztUofYShogEc-4E",
            KeyFingerprint.ofSpki(byteArrayOf(1, 2, 3)),
        )
        assertEquals(
            "SHA256:pWN5flo_O-_V32J50OZM0ysLearrpZy6u6eGutaH54I",
            KeyFingerprint.ofSpki("knoux-public-key".toByteArray()),
        )
    }

    @Test
    fun fingerprintIsPrefixedAndUrlSafe() {
        val fingerprint = KeyFingerprint.ofSpki(byteArrayOf(9, 9, 9))
        assertTrue(fingerprint.startsWith(KeyFingerprint.PREFIX))
        val body = fingerprint.removePrefix(KeyFingerprint.PREFIX)
        assertTrue(body.none { it == '+' || it == '/' || it == '=' })
        assertEquals(43, body.length)
    }

    @Test
    fun matchingIgnoresCaseAndSurroundingSpaceOnly() {
        val fingerprint = KeyFingerprint.ofSpki(byteArrayOf(1, 2, 3))
        assertTrue(KeyFingerprint.matches(fingerprint, fingerprint.lowercase()))
        assertTrue(KeyFingerprint.matches(" $fingerprint ", fingerprint))
        assertFalse(KeyFingerprint.matches(fingerprint, fingerprint.dropLast(1) + "X"))
        assertFalse(KeyFingerprint.matches(fingerprint, ""))
    }

    @Test
    fun publicKeyFingerprintMatchesItsSpkiFingerprint() {
        val generator = KeyPairGenerator.getInstance("EC")
        generator.initialize(ECGenParameterSpec(DigitalSignatureService.CURVE))
        val pair = generator.generateKeyPair()
        assertEquals(
            KeyFingerprint.ofSpki(pair.public.encoded),
            KeyFingerprint.of(pair.public),
        )
    }

    @Test
    fun uriCarriesTheKeyAndItsLabel() {
        val uri = KeyFingerprint.uriFor("KNOUX signing key", "BASE64KEY")
        assertTrue(uri.startsWith("knouxkey:v1:BASE64KEY"))
        assertTrue(uri.endsWith("#KNOUX signing key"))
        assertFalse(KeyFingerprint.uriFor("", "BASE64KEY").contains("#"))
    }
}
