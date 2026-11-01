package com.knoux.crypt.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.knoux.crypt.security.DigitalSignatureService
import com.knoux.crypt.security.SignaturePackage
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented Signature Studio check (TASK 38).
 *
 * On the itel S686LN the AndroidKeyStore has no EC or RSA support, so the studio
 * signs with the encrypted software key and must keep saying so. This runs the
 * whole KSG1/KSA1 path through the real Room database and the real signing
 * service, and asserts that rewriting the metadata block breaks the signature on
 * the device as well as on the host.
 */
@RunWith(AndroidJUnit4::class)
class SignatureStudioDeviceTest {

    private class SoftwareKeySource : VaultKeySource {
        private var master: javax.crypto.SecretKey? = null
        override fun hasMasterKey(): Boolean = master != null
        override fun masterKey(): javax.crypto.SecretKey = master
            ?: javax.crypto.spec.SecretKeySpec(ByteArray(32) { (it * 11 + 3).toByte() }, "AES").also { master = it }
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

    @Test
    fun signaturePackagesRoundTripOnThisDevice() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, KnouxDatabase::class.java).build()
        try {
            val session = SessionManager(SoftwareKeySource())
            val dao = database.secrets()
            val repository = SecretRepository(dao, session, VaultKeyManager(session, MemoryRegistry()))
            val gate = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(javax.crypto.Cipher.ENCRYPT_MODE, javax.crypto.spec.SecretKeySpec(ByteArray(32) { 21 }, "AES"))
            }
            session.authorizeEnrollment(GateCipher(GatePurpose.ENROLL, gate))
            val access = session.currentAccess() ?: error("the vault did not open")

            val signing = SigningService(KeystoreManager(), repository, session)
            val studio = SignatureStudio(signing, repository, session)
            val content = "board resolution 2026-11-01".toByteArray()

            val detached = studio.sign(content, "resolution.txt", "Board", attached = false)
            assertTrue("detached signing failed: $detached", detached is SignatureStudio.SignOutcome.Sealed)
            val pack = (detached as SignatureStudio.SignOutcome.Sealed).produced
            assertTrue(
                "unexpected key origin ${pack.origin}",
                pack.origin == SigningKeyOrigin.KEYSTORE || pack.origin == SigningKeyOrigin.VAULT_SOFTWARE,
            )
            assertEquals("KSG1", String(pack.bytes, 0, 4, Charsets.US_ASCII))

            val verified = studio.verify(pack.bytes, content)
            assertTrue("verification failed: $verified", verified is SignatureStudio.VerifyOutcome.Reported)
            val report = (verified as SignatureStudio.VerifyOutcome.Reported).report
            assertEquals(DigitalSignatureService.Verdict.VALID, report.verdict)
            assertFalse(report.signerRecognised)
            assertEquals(content.size.toLong(), report.actualSize)

            // Rewriting the metadata must invalidate the signature on this device too.
            val edited = pack.bytes.copyOf().also { it[it.size - 4] = (it[it.size - 4].toInt() xor 0x10).toByte() }
            when (val result = studio.verify(edited, content)) {
                is SignatureStudio.VerifyOutcome.Failed -> Unit
                is SignatureStudio.VerifyOutcome.Reported -> assertFalse(
                    "rewritten metadata still produced a valid signature",
                    result.report.signatureValid,
                )
            }

            // Attached packages carry their content and verify from it.
            val attached = studio.sign(content, "resolution.txt", "Board", attached = true)
            attached as SignatureStudio.SignOutcome.Sealed
            assertEquals("KSA1", String(attached.produced.bytes, 0, 4, Charsets.US_ASCII))
            val attachedReport = (studio.verify(attached.produced.bytes, null) as SignatureStudio.VerifyOutcome.Reported).report
            assertEquals(DigitalSignatureService.Verdict.VALID, attachedReport.verdict)
            assertTrue(attachedReport.attached)

            // Remembering the signer turns a valid signature into a recognised one.
            val key = SignaturePackage.decode(pack.bytes).publicKey()
            assertNotNull(key)
            studio.rememberSignerKey(access, "This device", key!!)
            val again = (studio.verify(pack.bytes, content) as SignatureStudio.VerifyOutcome.Reported).report
            assertTrue("the stored key was not recognised", again.signerRecognised)
            assertEquals("This device", again.recognisedAs)

            // Receipts are stored, encrypted, and never hold the document.
            val receipts = studio.observeStoredSignatures(access).first()
            assertEquals(2, receipts.size)
            val rawAll = dao.all().joinToString("|") { String(it.envelope, Charsets.ISO_8859_1) }
            assertFalse(rawAll.contains("board resolution"))
            assertFalse(rawAll.contains("resolution.txt"))
        } finally {
            database.close()
        }
    }
}
