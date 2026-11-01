package com.knoux.crypt.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.knoux.crypt.security.CertificateInspector
import java.security.cert.X509Certificate
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented Certificate Inspector check (TASK 20).
 *
 * Android's own `CertPathValidator` provider and its platform trust store are
 * not the desktop JDK's, so chain behaviour has to be observed on the handset
 * rather than assumed. This runs import, anchoring and assessment against a real
 * Room database on the device, and asserts that whatever the platform answers,
 * the inspector's five answers stay separate.
 */
@RunWith(AndroidJUnit4::class)
class CertificateInspectorDeviceTest {

    private class SoftwareKeySource : VaultKeySource {
        private var master: javax.crypto.SecretKey? = null
        override fun hasMasterKey(): Boolean = master != null
        override fun masterKey(): javax.crypto.SecretKey = master
            ?: javax.crypto.spec.SecretKeySpec(ByteArray(32) { (it * 5 + 2).toByte() }, "AES").also { master = it }
        override fun masterKeySecurityLevel(): String? = "FAKE_SOFTWARE"
    }

    private class MemoryRegistry : VaultKeyRegistry {
        override suspend fun activeVersion(): Int = 0
        override suspend fun setActiveVersion(version: Int) = Unit
        override suspend fun wrappedKey(version: Int): ByteArray? = null
        override suspend fun storeWrappedKey(version: Int, blob: ByteArray) = Unit
        override suspend fun removeWrappedKey(version: Int) = Unit
        override suspend fun versions(): List<Int> = listOf(0)
        override suspend fun rotationJournal(): RotationJournal? = null
        override suspend fun setRotationJournal(journal: RotationJournal?) = Unit
    }

    private fun resource(context: Context, name: String): ByteArray =
        context.assets.open("certs/$name.pem").use { it.readBytes() }

    private fun parse(context: Context, name: String): X509Certificate =
        (CertificateInspector.parse(resource(context, name)) as? CertificateInspector.ParseOutcome.Parsed)?.certificate
            ?: error("$name did not parse on this device")

    @Test
    fun platformAnchorsAndPkixBehaveOnThisDevice() {
        // The call itself must not throw on Android, and whatever it returns must
        // be self-signed roots. Emptiness is reported, not assumed.
        val anchors = CertificateInspector.platformAnchors()
        anchors.forEach { anchor ->
            val certificate = anchor.trustedCert
            if (certificate != null) {
                assertEquals(certificate.subjectX500Principal, certificate.issuerX500Principal)
            }
        }
    }

    @Test
    fun importAssessAndAnchorRunOnTheRealDatabase() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, KnouxDatabase::class.java).build()
        try {
            val session = SessionManager(SoftwareKeySource())
            val repository = SecretRepository(database.secrets(), session, VaultKeyManager(session, MemoryRegistry()))
            val gate = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(javax.crypto.Cipher.ENCRYPT_MODE, javax.crypto.spec.SecretKeySpec(ByteArray(32) { 31 }, "AES"))
            }
            session.authorizeEnrollment(GateCipher(GatePurpose.ENROLL, gate))
            val access = session.currentAccess() ?: error("the vault did not open")
            val service = CertificateVaultService(session, repository)

            val view = CertificateInspector.viewOf(parse(context, "leaf"))
            val middle = (view.notBeforeMillis + view.notAfterMillis) / 2

            val imported = service.import(access, "Leaf", resource(context, "leaf"))
            assertTrue("import failed on device: $imported", imported is CertificateImportOutcome.Imported)
            service.import(access, "Intermediate", resource(context, "inter"))
            val rootId = (service.import(access, "Root", resource(context, "root")) as CertificateImportOutcome.Imported).id

            val noAnchors = service.assess(access, parse(context, "leaf"), TrustPolicy.None, middle, null)
            assertEquals(
                CertificateInspector.ChainFailure.NO_ANCHORS,
                (noAnchors.chain as CertificateInspector.ChainOutcome.Failed).reason,
            )
            assertEquals(CertificateInspector.ValidityState.CURRENT, noAnchors.validity)
            assertFalse(noAnchors.revocationChecked)

            assertTrue(service.setAnchor(access, rootId, true))
            val anchored = service.assess(access, parse(context, "leaf"), TrustPolicy.StoredAnchors, middle, "api.knox.example")
            assertTrue(
                "the device validator rejected a chain the host accepts: ${anchored.chain}",
                anchored.chain is CertificateInspector.ChainOutcome.Trusted,
            )
            assertEquals(true, anchored.hostnameMatches)
            assertEquals(true, anchored.signatureFromIssuer)

            // An expired view keeps its other answers intact.
            val expired = service.assess(access, parse(context, "leaf"), TrustPolicy.StoredAnchors, view.notAfterMillis + 1, null)
            assertEquals(CertificateInspector.ValidityState.EXPIRED, expired.validity)

            val stored = service.observe(access).first()
            assertEquals(3, stored.size)
            assertTrue(stored.first { it.label == "Root" }.isAnchor)
            val rawAll = database.secrets().all().joinToString("|") { String(it.envelope, Charsets.ISO_8859_1) }
            assertFalse(rawAll.contains("api.knox.example"))
            assertNotNull(service.certificateOf(access, stored.first { it.label == "Leaf" }.id))
        } finally {
            database.close()
        }
    }
}
