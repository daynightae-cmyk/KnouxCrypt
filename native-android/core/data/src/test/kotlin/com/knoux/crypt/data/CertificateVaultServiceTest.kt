package com.knoux.crypt.data

import com.knoux.crypt.security.CertificateInspector
import java.security.cert.X509Certificate
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Certificate vault service tests (TASK 20) over the same fixed test PKI used by
 * the inspector, so import, anchoring and assessment are exercised against real
 * X.509 objects rather than stand-ins.
 */
class CertificateVaultServiceTest {

    private fun certResource(name: String): ByteArray =
        javaClass.getResourceAsStream("/certs/$name.pem").use { stream ->
            requireNotNull(stream) { "missing test certificate $name" }.readBytes()
        }

    private fun parsed(name: String): X509Certificate {
        val outcome = CertificateInspector.parse(certResource(name))
        return (outcome as? CertificateInspector.ParseOutcome.Parsed)?.certificate
            ?: error("$name did not parse: $outcome")
    }

    private fun leafValidity(): Long {
        val view = CertificateInspector.viewOf(parsed("leaf"))
        return (view.notBeforeMillis + view.notAfterMillis) / 2
    }

    @Test
    fun importStoresTheOriginalDerAndRejectsDuplicates() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val service = CertificateVaultService(vault.session, vault.repository)

        val outcome = service.import(access, "Server cert", certResource("leaf"))
        assertTrue("import failed: $outcome", outcome is CertificateImportOutcome.Imported)
        val id = (outcome as CertificateImportOutcome.Imported).id
        assertEquals("api.knox.example", commonName(outcome.view.subject))

        val stored = service.observe(access).first()
        assertEquals(1, stored.size)
        assertEquals(outcome.view.fingerprintSha256, stored.first().fingerprint)
        assertFalse("a stored certificate must not be marked as an anchor by default", stored.first().isAnchor)

        val again = service.import(access, "Same cert", certResource("leaf"))
        assertTrue(again is CertificateImportOutcome.AlreadyStored)
        assertEquals(1, service.observe(access).first().size)

        // The stored row is ciphertext: neither the DER nor its base64 appears.
        val row = vault.dao.rows.value.first { it.id == id }
        val raw = String(row.envelope, Charsets.ISO_8859_1)
        assertFalse(raw.contains(java.util.Base64.getEncoder().encodeToString(parsed("leaf").encoded).take(32)))
        assertFalse(raw.contains("api.knox.example"))

        // Re-reading the stored DER reproduces the same certificate.
        val reread = service.certificateOf(access, id)
        assertNotNull(reread)
        assertArrayEqualsTo(parsed("leaf").encoded, reread!!.encoded)
    }

    @Test
    fun malformedInputIsRejectedWithItsReason() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val service = CertificateVaultService(vault.session, vault.repository)

        val garbage = service.import(access, "junk", "definitely not a certificate".toByteArray())
        assertTrue(garbage is CertificateImportOutcome.Rejected)
        assertEquals(
            CertificateInspector.ParseFailure.NOT_A_CERTIFICATE,
            (garbage as CertificateImportOutcome.Rejected).reason,
        )
        val truncated = service.import(access, "junk", parsed("leaf").encoded.copyOfRange(0, 25))
        assertTrue(truncated is CertificateImportOutcome.Rejected)
        assertEquals(0, service.observe(access).first().size)
    }

    @Test
    fun trustFollowsTheChosenPolicyAndNeverAppearsByItself() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val service = CertificateVaultService(vault.session, vault.repository)
        service.import(access, "Leaf", certResource("leaf"))
        service.import(access, "Intermediate", certResource("inter"))
        val rootId = (service.import(access, "Root", certResource("root")) as CertificateImportOutcome.Imported).id
        val leaf = service.observe(access).first().first { it.label == "Leaf" }

        // No anchors at all: nothing is trusted.
        val none = service.assess(access, parsed("leaf"), TrustPolicy.None, leafValidity(), null)
        assertTrue(none.chain is CertificateInspector.ChainOutcome.Failed)
        assertEquals(
            CertificateInspector.ChainFailure.NO_ANCHORS,
            (none.chain as CertificateInspector.ChainOutcome.Failed).reason,
        )
        assertEquals(CertificateInspector.ValidityState.CURRENT, none.validity)
        assertEquals(true, none.signatureFromIssuer)
        assertFalse(none.revocationChecked)

        // Anchors that exist but did not issue this chain.
        service.import(access, "Other root", certResource("other-root"))
        assertTrue(service.setAnchor(access, rootId, false))
        val unanchored = service.assess(access, parsed("leaf"), TrustPolicy.StoredAnchors, leafValidity(), null)
        assertEquals(
            CertificateInspector.ChainFailure.NO_ANCHORS,
            (unanchored.chain as CertificateInspector.ChainOutcome.Failed).reason,
        )

        // Marking the real root as an anchor is what makes the chain trusted.
        assertTrue(service.setAnchor(access, rootId, true))
        val trusted = service.assess(access, parsed("leaf"), TrustPolicy.StoredAnchors, leafValidity(), null)
        assertTrue("expected trusted, got ${trusted.chain}", trusted.chain is CertificateInspector.ChainOutcome.Trusted)
        val chain = trusted.chain as CertificateInspector.ChainOutcome.Trusted
        assertEquals(2, chain.depth)
        assertTrue(chain.anchorSubject.contains("Root CA", ignoreCase = true))
        // The anchor itself is not part of the path, so leaf + intermediate.
        assertEquals(2, chain.subjects.size)

        // The platform store on this machine does not know the test root.
        val platform = service.assess(access, parsed("leaf"), TrustPolicy.PlatformStore, leafValidity(), null)
        assertTrue(platform.chain is CertificateInspector.ChainOutcome.Failed)
        assertEquals(
            CertificateInspector.ChainFailure.UNKNOWN_ISSUER,
            (platform.chain as CertificateInspector.ChainOutcome.Failed).reason,
        )
        assertFalse(leaf.isAnchor)
    }

    @Test
    fun identityValidityAndExpiryAreReportedSeparately() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val service = CertificateVaultService(vault.session, vault.repository)
        val rootId = (service.import(access, "Root", certResource("root")) as CertificateImportOutcome.Imported).id
        service.import(access, "Inter", certResource("inter"))
        service.import(access, "Leaf", certResource("leaf"))
        service.setAnchor(access, rootId, true)
        val view = CertificateInspector.viewOf(parsed("leaf"))

        val good = service.assess(access, parsed("leaf"), TrustPolicy.StoredAnchors, leafValidity(), "api.knox.example")
        assertEquals(true, good.hostnameMatches)
        assertEquals(CertificateInspector.ValidityState.CURRENT, good.validity)
        assertTrue(good.chain is CertificateInspector.ChainOutcome.Trusted)

        val wrongHost = service.assess(access, parsed("leaf"), TrustPolicy.StoredAnchors, leafValidity(), "evil.example")
        assertEquals(false, wrongHost.hostnameMatches)
        // Same chain, same trust — identity is a separate answer.
        assertTrue(wrongHost.chain is CertificateInspector.ChainOutcome.Trusted)

        val expired = service.assess(
            access, parsed("leaf"), TrustPolicy.StoredAnchors,
            view.notAfterMillis + 86_400_000L, "api.knox.example",
        )
        assertEquals(CertificateInspector.ValidityState.EXPIRED, expired.validity)
        assertTrue(
            "an expired chain must not be reported as trusted, got ${expired.chain}",
            expired.chain is CertificateInspector.ChainOutcome.Failed,
        )

        val notYet = service.assess(
            access, parsed("leaf"), TrustPolicy.StoredAnchors,
            view.notBeforeMillis - 86_400_000L, null,
        )
        assertEquals(CertificateInspector.ValidityState.NOT_YET_VALID, notYet.validity)
        assertEquals(null, notYet.hostnameMatches)
    }

    @Test
    fun selfSignedCertificatesAreNeverTrustedWithoutAnExplicitAnchor() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val service = CertificateVaultService(vault.session, vault.repository)
        service.import(access, "Self", certResource("selfsigned"))

        val unanchored = service.assess(access, parsed("selfsigned"), TrustPolicy.None, System.currentTimeMillis(), null)
        assertEquals(
            CertificateInspector.ChainFailure.NO_ANCHORS,
            (unanchored.chain as CertificateInspector.ChainOutcome.Failed).reason,
        )
        assertTrue(unanchored.view.selfSigned)
        assertFalse(unanchored.view.isCa)
    }

    @Test
    fun lockedVaultCannotImportOrAssess() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val service = CertificateVaultService(vault.session, vault.repository)
        vault.session.lock()
        val failure = runCatching { service.import(access, "x", certResource("leaf")) }.exceptionOrNull()
        assertTrue(failure is VaultLockedException)
        assertTrue(runCatching { service.assess(access, parsed("leaf"), TrustPolicy.None, 1L, null) }.exceptionOrNull() is VaultLockedException)
    }

    @Test
    fun renamingAndDeletingKeepTheStoreConsistent() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val service = CertificateVaultService(vault.session, vault.repository)
        val id = (service.import(access, "Leaf", certResource("leaf")) as CertificateImportOutcome.Imported).id
        assertTrue(service.rename(access, id, "Production cert"))
        assertEquals("Production cert", service.observe(access).first().single().label)
        assertFalse(service.rename(access, id, "   "))
        assertFalse(service.setAnchor(access, "not-a-real-id", true))
        service.delete(access, id)
        assertTrue(service.observe(access).first().isEmpty())
    }

    private fun commonName(dn: String): String =
        dn.split(',').firstOrNull { it.trim().startsWith("CN=", ignoreCase = true) }
            ?.substringAfter('=')?.trim().orEmpty()

    private fun assertArrayEqualsTo(expected: ByteArray, actual: ByteArray) {
        assertEquals(expected.size, actual.size)
        assertTrue(expected.contentEquals(actual))
    }
}
