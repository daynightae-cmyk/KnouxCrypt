package com.knoux.crypt.security

import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.SecureRandom
import java.security.spec.ECGenParameterSpec
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import javax.crypto.spec.SecretKeySpec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Known-answer and rejection tests for the Secure Share key layer (TASK 16).
 *
 * The X25519 and HKDF vectors come straight from RFC 7748 and RFC 5869, so a
 * passing suite means the primitives agree with the published specifications and
 * not merely with themselves.
 */
class RecipientKeysTest {

    private fun hexToBytes(value: String): ByteArray =
        ByteArray(value.length / 2) { value.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

    private fun ByteArray.toHex(): String =
        joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }

    @Test
    fun x25519AgreementMatchesRfc7748() {
        val alicePrivate = hexToBytes("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a")
        val alicePublic = hexToBytes("8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a")
        val bobPrivate = hexToBytes("5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb")
        val bobPublic = hexToBytes("de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f")
        val expectedShared = hexToBytes("4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742")

        val alice = ShareKeyPair.fromPkcs8(x25519Pkcs8(alicePrivate))
        val bob = ShareKeyPair.fromPkcs8(x25519Pkcs8(bobPrivate))

        // The public half derived from the RFC scalar is the RFC public key.
        assertArrayEquals(alicePublic, alice.public.parameters.encoded)
        assertArrayEquals(bobPublic, bob.public.parameters.encoded)

        assertArrayEquals(expectedShared, alice.sharedSecret(bob.public))
        assertArrayEquals(expectedShared, bob.sharedSecret(alice.public))
    }

    @Test
    fun hkdfMatchesRfc5869AppendixA1() {
        // RFC 5869 A.1: SHA-256, 22 octets of 0x0b, salt 000102…0c, info f0f1…f9, L=42.
        val ikm = ByteArray(22) { 0x0b }
        val salt = hexToBytes("000102030405060708090a0b0c")
        val info = hexToBytes("f0f1f2f3f4f5f6f7f8f9")
        assertEquals(
            "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
            ShareKdf.hkdfSha256(ikm, salt, info, length = 42).toHex(),
        )
    }

    @Test
    fun hkdfAgreesWithAnIndependentImplementationOfTheSpecification() {
        // Extract-then-expand written directly from RFC 5869 sections 2.2/2.3 with
        // nothing but javax.crypto.Mac, so the library path is checked against a
        // second, unrelated implementation rather than against itself.
        val ikm = ByteArray(22) { 0x0b }
        val salt = hexToBytes("000102030405060708090a0b0c")
        val info = hexToBytes("f0f1f2f3f4f5f6f7f8f9")
        val mac = javax.crypto.Mac.getInstance("HmacSHA256")
        mac.init(javax.crypto.spec.SecretKeySpec(salt, "HmacSHA256"))
        val prk = mac.doFinal(ikm)
        assertEquals(
            "077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5",
            prk.toHex(),
        )
        mac.init(javax.crypto.spec.SecretKeySpec(prk, "HmacSHA256"))
        val first = mac.doFinal(info + byteArrayOf(1))
        mac.init(javax.crypto.spec.SecretKeySpec(prk, "HmacSHA256"))
        val second = mac.doFinal(first + info + byteArrayOf(2))
        assertEquals((first + second).copyOf(42).toHex(), ShareKdf.hkdfSha256(ikm, salt, info, 42).toHex())
    }

    @Test
    fun hkdfContextStringsNeverCollide() {
        val keyId = ByteArray(8) { 1 }
        val a = ShareKdf.hkdfSha256(ByteArray(32) { 2 }, ByteArray(32) { 3 }, ShareKdf.kekInfo(0, keyId))
        val b = ShareKdf.hkdfSha256(ByteArray(32) { 2 }, ByteArray(32) { 3 }, ShareKdf.kekInfo(1, keyId))
        val c = ShareKdf.hkdfSha256(ByteArray(32) { 2 }, ByteArray(32) { 3 }, ShareKdf.payloadContext("aa"))
        assertNotEquals(a.toList(), b.toList())
        assertNotEquals(a.toList(), c.toList())
    }

    @Test
    fun spkiAndPkcs8RoundTripAndAreReadableByThePlatform() {
        val pair = ShareKeyPair.generate(SecureRandom())
        val parsed = ShareKeyPair.fromPkcs8(pair.pkcs8)
        assertArrayEquals(pair.public.spki, parsed.public.spki)
        assertEquals(pair.fingerprint, parsed.fingerprint)
        assertArrayEquals(pair.sharedSecret(parsed.public), parsed.sharedSecret(pair.public))

        // An independent implementation — the JDK's own XDH key factory — must
        // accept our encodings, which proves we did not invent a private format.
        val factory = KeyFactory.getInstance("XDH")
        val jdkPublic = factory.generatePublic(X509EncodedKeySpec(pair.public.spki))
        assertEquals("XDH", jdkPublic.algorithm)
        assertArrayEquals(
            pair.public.spki,
            jdkPublic.encoded,
        )
    }

    @Test
    fun recipientKeyRejectsASigningKeyInsteadOfAssumingItCanEncrypt() {
        val ec = KeyPairGenerator.getInstance("EC")
        ec.initialize(ECGenParameterSpec("secp256r1"))
        val signingSpki = ec.generateKeyPair().public.encoded

        try {
            RecipientKey.fromSpki(signingSpki)
            fail("An EC signing key must not be accepted as a share recipient")
        } catch (expected: KeyKindRejectedException) {
            assertTrue(expected.message!!.contains("X25519"))
        }
    }

    @Test
    fun recipientKeyRejectsMalformedEncodings() {
        val cases = listOf(
            ByteArray(0),
            ByteArray(32),
            x25519Spki(ByteArray(31)),
            x25519Spki(ByteArray(33)),
        )
        cases.forEach { spki ->
            try {
                RecipientKey.fromSpki(spki)
                fail("Accepted a malformed public key encoding")
            } catch (expected: KeyKindRejectedException) {
                assertTrue(expected.message!!.isNotBlank())
            }
        }
    }

    @Test
    fun keyIdIsAStableShortSelectorDerivedFromThePublicKey() {
        val pair = ShareKeyPair.generate()
        val again = RecipientKey.fromBase64(pair.public.spkiBase64)
        assertEquals(16, pair.public.keyIdHex.length)
        assertArrayEquals(pair.public.keyId, again.keyId)
        assertEquals(pair.fingerprint, again.fingerprint)
        assertEquals("SHA256:", pair.fingerprint.take(7))
        assertNotEquals(pair.public.keyIdHex, ShareKeyPair.generate().public.keyIdHex)
    }

    @Test
    fun versionTwoUriCarriesTheAlgorithmAndRoundTrips() {
        val pair = ShareKeyPair.generate()
        val uri = pair.public.uriFor("Rana's phone")
        assertTrue(uri.startsWith("knouxkey:v2:x25519:"))
        assertTrue(uri.endsWith("#Rana's phone"))

        val (key, label) = requireNotNull(RecipientKey.fromUri(uri))
        assertArrayEquals(pair.public.spki, key.spki)
        assertEquals("Rana's phone", label)
    }

    @Test
    fun versionOneSigningUriIsRefusedForSharing() {
        val signingUri = KeyFingerprint.uriFor("KNOUX signing key", Base64.getEncoder().encodeToString(ByteArray(91) { 7 }))
        try {
            RecipientKey.fromUri(signingUri)
            fail("A knouxkey:v1 signing URI must never be imported as an encryption recipient")
        } catch (expected: KeyKindRejectedException) {
            assertTrue(expected.message!!.contains("signing key"))
        }
        // Unrelated text is simply not a KNOUX key URI.
        assertNull(RecipientKey.fromUri("otpauth://totp/Example:alice"))
    }

    @Test
    fun generatedKeysAreDistinctAndPrivateBytesStayOutOfThePublicEncoding() {
        val first = ShareKeyPair.generate()
        val second = ShareKeyPair.generate()
        assertNotEquals(first.fingerprint, second.fingerprint)
        assertEquals(RecipientKey.RAW_KEY_BYTES, first.public.parameters.encoded.size)
        // SPKI is 32 key bytes plus a fixed DER prologue; it cannot hold the scalar.
        assertTrue(first.public.spki.size < 48)
        assertTrue(first.pkcs8.size > first.public.spki.size)
    }

    @Test
    fun agreementWithAForeignPublicKeyIsStillThirtyTwoBytesAndDeterministic() {
        val pair = ShareKeyPair.generate()
        val peer = ShareKeyPair.generate().public
        val secret = pair.sharedSecret(peer)
        assertEquals(32, secret.size)
        assertArrayEquals(secret, pair.sharedSecret(RecipientKey.fromBase64(peer.spkiBase64)))
        // Sanity: the secret is usable as an AES-256 key material source.
        SecretKeySpec(ShareKdf.hkdfSha256(secret, ByteArray(32), ByteArray(16)), "AES").also {
            assertEquals(32, it.encoded!!.size)
        }
    }
}
