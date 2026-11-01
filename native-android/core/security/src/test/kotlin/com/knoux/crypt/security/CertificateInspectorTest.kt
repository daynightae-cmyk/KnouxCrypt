package com.knoux.crypt.security

import java.security.MessageDigest
import java.security.cert.X509Certificate
import java.security.cert.TrustAnchor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Certificate Inspector tests (TASK 20) against a fixed test PKI.
 *
 * The certificates under `src/test/resources/certs` are real X.509 objects
 * generated once with the JDK's own keytool: a root CA, an ECDSA intermediate, a
 * leaf with DNS/IP/email SANs, a self-signed non-CA leaf, and an unrelated root
 * that never signed the leaf. Expiry is exercised by injecting the clock, so the
 * assertions do not rot when the calendar moves.
 */
class CertificateInspectorTest {

    private fun cert(name: String): X509Certificate {
        val bytes = javaClass.getResourceAsStream("/certs/$name.pem").use { stream ->
            requireNotNull(stream) { "missing test certificate $name" }.readBytes()
        }
        val outcome = CertificateInspector.parse(bytes)
        return (outcome as? CertificateInspector.ParseOutcome.Parsed)?.certificate
            ?: error("test certificate $name did not parse: $outcome")
    }

    private val root by lazy { cert("root") }
    private val intermediate by lazy { cert("inter") }
    private val leaf by lazy { cert("leaf") }
    private val selfSigned by lazy { cert("selfsigned") }
    private val otherRoot by lazy { cert("other-root") }
    private val orphanLeaf by lazy { cert("orphan-leaf") }

    @Test
    fun pemParsingReportsTheRealFieldsAndNothingInvented() {
        val view = (CertificateInspector.parseText(String(javaClass.getResourceAsStream("/certs/leaf.pem").readBytes())))
            as CertificateInspector.ParseOutcome.Parsed
        assertEquals(3, view.view.version)
        assertTrue(view.view.subject.contains("api.knox.example", ignoreCase = true))
        assertTrue(view.view.issuer.contains("Intermediate", ignoreCase = true))
        assertFalse(view.view.isCa)
        assertFalse(view.view.selfSigned)
        assertEquals("EC", view.view.publicKeyAlgorithm)
        assertEquals(256, view.view.publicKeyBits)
        assertEquals(0, view.view.serialHex.length % 2)
        assertTrue(view.view.serialHex.isNotEmpty())
        assertTrue(view.view.serialHex.all { it in "0123456789ABCDEF" })
        assertTrue(view.view.derBytes in 500..1500)
        assertTrue(view.view.signatureAlgorithm.uppercase().contains("ECDSA"))
    }

    @Test
    fun subjectAlternativeNamesKeepTheirTypes() {
        val view = CertificateInspector.viewOf(leaf)
        val kinds = view.subjectAlternativeNames.map { it.kind }.toSet()
        assertTrue("DNS missing: $kinds", "DNS" in kinds)
        assertTrue("IP missing: $kinds", "IP" in kinds)
        assertTrue("RFC822 missing: $kinds", "RFC822" in kinds)
        assertEquals(
            listOf("api.knox.example", "www.knox.example"),
            view.dnsNames.sorted(),
        )
        assertTrue(view.subjectAlternativeNames.any { it.value == "198.51.100.7" })
        assertTrue(view.subjectAlternativeNames.any { it.value == "ops@knox.example" })
    }

    @Test
    fun fingerprintIsTheSha256OfTheDerEncoding() {
        val view = CertificateInspector.viewOf(leaf)
        val expected = MessageDigest.getInstance("SHA-256").digest(leaf.encoded)
            .joinToString(":") { (it.toInt() and 0xff).toString(16).uppercase().padStart(2, '0') }
        assertEquals(expected, view.fingerprintSha256)
        assertEquals(95, view.fingerprintSha256.length)
        // DER and PEM of the same certificate must agree.
        val fromDer = CertificateInspector.parse(leaf.encoded)
        assertTrue(fromDer is CertificateInspector.ParseOutcome.Parsed)
        assertEquals(view.fingerprintSha256, (fromDer as CertificateInspector.ParseOutcome.Parsed).view.fingerprintSha256)
    }

    @Test
    fun caFlagsAndPathLengthAreReadFromTheCertificate() {
        assertTrue(CertificateInspector.viewOf(root).isCa)
        assertTrue(CertificateInspector.viewOf(intermediate).isCa)
        assertEquals(0, CertificateInspector.viewOf(intermediate).pathLengthConstraint)
        assertFalse(CertificateInspector.viewOf(selfSigned).isCa)
        assertTrue(CertificateInspector.viewOf(selfSigned).selfSigned)
        assertTrue(CertificateInspector.viewOf(root).selfSigned)
        assertTrue(CertificateInspector.viewOf(leaf).keyUsage.contains("digitalSignature"))
        assertTrue(CertificateInspector.viewOf(root).keyUsage.contains("keyCertSign"))
        assertTrue(CertificateInspector.viewOf(leaf).extendedKeyUsageOids.contains("1.3.6.1.5.5.7.3.1"))
        assertNotNull(CertificateInspector.viewOf(leaf).subjectKeyIdentifier)
        assertNotNull(CertificateInspector.viewOf(leaf).authorityKeyIdentifier)
        assertTrue(CertificateInspector.viewOf(leaf).criticalOids.contains("2.5.29.15"))
    }

    @Test
    fun validityIsJudgedAgainstTheSuppliedClockOnly() {
        val view = CertificateInspector.viewOf(leaf)
        val middle = (view.notBeforeMillis + view.notAfterMillis) / 2
        assertEquals(CertificateInspector.ValidityState.CURRENT, view.validityAt(middle))
        assertEquals(CertificateInspector.ValidityState.NOT_YET_VALID, view.validityAt(view.notBeforeMillis - 1))
        assertEquals(CertificateInspector.ValidityState.EXPIRED, view.validityAt(view.notAfterMillis + 1))
        assertEquals(CertificateInspector.ValidityState.EXPIRED, view.validityAt(System.currentTimeMillis() + 400L * 365 * 86400_000))
    }

    @Test
    fun hostnameMatchingFollowsTheLeftmostWildcardRule() {
        val view = CertificateInspector.viewOf(leaf)
        assertTrue(view.matchesHostname("api.knox.example"))
        assertTrue(view.matchesHostname("WWW.KNOX.EXAMPLE"))
        assertFalse(view.matchesHostname("knox.example"))
        assertFalse(view.matchesHostname("deep.api.knox.example"))
        assertFalse(view.matchesHostname("api.knox.example.evil.net"))
        assertFalse(view.matchesHostname("other.knox.example"))
        // A certificate with no SAN falls back to its CN, and says nothing else.
        assertTrue(CertificateInspector.viewOf(selfSigned).matchesHostname("self.knox.example"))
    }

    @Test
    fun signatureChecksAreIndependentOfTrust() {
        assertTrue(CertificateInspector.verifySignature(leaf, intermediate.publicKey))
        assertFalse(CertificateInspector.verifySignature(leaf, root.publicKey))
        assertFalse(CertificateInspector.verifySignature(leaf, otherRoot.publicKey))
        assertTrue(CertificateInspector.verifySignature(intermediate, root.publicKey))
    }

    @Test
    fun aChainIsTrustedOnlyAgainstTheNamedAnchor() {
        val now = (CertificateInspector.viewOf(leaf).notBeforeMillis +
            CertificateInspector.viewOf(leaf).notAfterMillis) / 2
        val outcome = CertificateInspector.validateChain(
            leaf = leaf,
            intermediates = listOf(intermediate),
            anchors = setOf(TrustAnchor(root, null)),
            nowMillis = now,
        )
        assertTrue("expected trusted, got $outcome", outcome is CertificateInspector.ChainOutcome.Trusted)
        outcome as CertificateInspector.ChainOutcome.Trusted
        assertEquals(2, outcome.depth)
        assertTrue(outcome.anchorSubject.contains("Root CA", ignoreCase = true))
        assertTrue(outcome.anchoredByUserChoice)
        assertEquals(2, outcome.subjects.size)
    }

    @Test
    fun unknownCaNoAnchorsAndSelfSignedAreNeverTrustedByDefault() {
        val now = System.currentTimeMillis()
        val unknown = CertificateInspector.validateChain(
            orphanLeaf, emptyList(), setOf(TrustAnchor(root, null)), now,
        )
        assertTrue(unknown is CertificateInspector.ChainOutcome.Failed)
        assertEquals(
            CertificateInspector.ChainFailure.UNKNOWN_ISSUER,
            (unknown as CertificateInspector.ChainOutcome.Failed).reason,
        )

        val none = CertificateInspector.validateChain(leaf, listOf(intermediate), emptySet(), now)
        assertEquals(CertificateInspector.ChainFailure.NO_ANCHORS, (none as CertificateInspector.ChainOutcome.Failed).reason)

        val selfSignedAlone = CertificateInspector.validateChain(selfSigned, emptyList(), emptySet(), now)
        assertEquals(
            CertificateInspector.ChainFailure.NO_ANCHORS,
            (selfSignedAlone as CertificateInspector.ChainOutcome.Failed).reason,
        )
    }

    @Test
    fun pinningASelfSignedCertificateIsReportedAsAUserChoice() {
        val now = System.currentTimeMillis()
        val outcome = CertificateInspector.validateChain(
            selfSigned, emptyList(), setOf(TrustAnchor(selfSigned, null)), now,
        )
        // A self-signed leaf is not a CA, so PKIX must still refuse it; pinning a
        // non-CA is only ever possible when the validator accepts it, and the
        // result must never be presented as a hierarchy trust decision either way.
        when (outcome) {
            is CertificateInspector.ChainOutcome.Trusted -> assertTrue(outcome.anchoredByUserChoice)
            is CertificateInspector.ChainOutcome.Failed -> assertTrue(
                outcome.reason == CertificateInspector.ChainFailure.NOT_A_CA_IN_PATH ||
                    outcome.reason == CertificateInspector.ChainFailure.UNKNOWN_ISSUER ||
                    outcome.reason == CertificateInspector.ChainFailure.POLICY,
            )
        }
    }

    @Test
    fun expiryAndDepthLimitsAreEnforcedByTheValidator() {
        val view = CertificateInspector.viewOf(leaf)
        val future = view.notAfterMillis + 86_400_000L
        val expired = CertificateInspector.validateChain(
            leaf, listOf(intermediate), setOf(TrustAnchor(root, null)), future,
        )
        assertTrue("expected an expiry failure, got $expired", expired is CertificateInspector.ChainOutcome.Failed)
        expired as CertificateInspector.ChainOutcome.Failed
        assertTrue(
            "unexpected reason ${expired.reason}",
            expired.reason == CertificateInspector.ChainFailure.EXPIRED ||
                expired.reason == CertificateInspector.ChainFailure.PATH_TOO_LONG ||
                expired.reason == CertificateInspector.ChainFailure.POLICY,
        )

        val flood = CertificateInspector.validateChain(
            leaf,
            intermediates = List(CertificateInspector.MAX_CHAIN_CERTS) { intermediate },
            anchors = setOf(TrustAnchor(root, null)),
            nowMillis = System.currentTimeMillis(),
        )
        assertEquals(
            CertificateInspector.ChainFailure.TOO_MANY_INPUTS,
            (flood as CertificateInspector.ChainOutcome.Failed).reason,
        )
    }

    @Test
    fun malformedOversizedAndBundledInputIsRejectedWithoutGuessing() {
        assertTrue(CertificateInspector.parse(ByteArray(0)) is CertificateInspector.ParseOutcome.Rejected)
        assertEquals(
            CertificateInspector.ParseFailure.EMPTY,
            (CertificateInspector.parse(ByteArray(0)) as CertificateInspector.ParseOutcome.Rejected).reason,
        )
        val huge = CertificateInspector.parse(ByteArray(CertificateInspector.MAX_INPUT_BYTES + 1) { 7 })
        assertEquals(
            CertificateInspector.ParseFailure.TOO_LARGE,
            (huge as CertificateInspector.ParseOutcome.Rejected).reason,
        )
        val garbage = CertificateInspector.parse("not a certificate at all".toByteArray())
        assertTrue(garbage is CertificateInspector.ParseOutcome.Rejected)
        val truncated = leaf.encoded.copyOfRange(0, 40)
        assertTrue(CertificateInspector.parse(truncated) is CertificateInspector.ParseOutcome.Rejected)
        // Two PEM blocks are a bundle, not one certificate.
        val bundle = String(javaClass.getResourceAsStream("/certs/root.pem").readBytes()) +
            String(javaClass.getResourceAsStream("/certs/inter.pem").readBytes())
        assertEquals(
            CertificateInspector.ParseFailure.NOT_A_CERTIFICATE,
            (CertificateInspector.parseText(bundle) as CertificateInspector.ParseOutcome.Rejected).reason,
        )
        // PEM with a body that is not valid DER.
        val fakePem = "-----BEGIN CERTIFICATE-----\n" +
            java.util.Base64.getEncoder().encodeToString(ByteArray(64) { 3 }) +
            "\n-----END CERTIFICATE-----\n"
        assertTrue(CertificateInspector.parseText(fakePem) is CertificateInspector.ParseOutcome.Rejected)
    }

    @Test
    fun thePlatformAnchorLookupIsSafeToCallAndOnlyReturnsRealAnchors() {
        val anchors = CertificateInspector.platformAnchors()
        // Emptiness is environment-dependent; what must hold is that whatever comes
        // back is usable and that the call never throws on this platform.
        anchors.forEach { anchor ->
            val certificate = anchor.trustedCert
            if (certificate != null) {
                assertEquals(certificate.subjectX500Principal, certificate.issuerX500Principal)
            }
        }
        assertTrue(CertificateInspector.MAX_TRUST_ANCHORS > 0)
    }
}
