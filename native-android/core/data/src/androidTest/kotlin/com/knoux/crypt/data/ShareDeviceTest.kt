package com.knoux.crypt.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.knoux.crypt.security.RecipientKey
import com.knoux.crypt.security.ShareKeyPair
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented Secure Share check on the real device (TASK 16).
 *
 * The point of running on hardware is that the X25519/HKDF path and the AES-GCM
 * provider are the platform's own, and the persistence is a real Room database.
 * This asserts a full seal → store → open cycle, that a different identity cannot
 * open the package, and that neither the plaintext nor any key material appears
 * in the stored rows.
 */
@RunWith(AndroidJUnit4::class)
class ShareDeviceTest {

    private class SoftwareKeySource : VaultKeySource {
        private var master: SecretKey? = null
        override fun hasMasterKey(): Boolean = master != null
        override fun masterKey(): SecretKey = master
            ?: SecretKeySpec(ByteArray(32) { (it * 23 + 9).toByte() }, "AES").also { master = it }
        override fun masterKeySecurityLevel(): String? = "FAKE_SOFTWARE"
    }

    private class MemoryRegistry : VaultKeyRegistry {
        override suspend fun activeVersion(): Int = 0
        override suspend fun setActiveVersion(version: Int) = Unit
        override suspend fun wrappedKey(version: Int): ByteArray? = null
        override suspend fun storeWrappedKey(version: Int, blob: ByteArray) = Unit
        override suspend fun removeWrappedKey(version: Int) = Unit
        override suspend fun versions(): List<Int> = emptyList()
        override suspend fun rotationJournal(): RotationJournal? = null
        override suspend fun setRotationJournal(journal: RotationJournal?) = Unit
    }

    @Test
    fun sealingAndOpeningWorksOnThisDeviceAndNothingLeaksIntoStorage() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, KnouxDatabase::class.java).build()
        try {
            val session = SessionManager(SoftwareKeySource())
            val dao = database.secrets()
            val repository = SecretRepository(dao, session, VaultKeyManager(session, MemoryRegistry()))
            val gate = Cipher.getInstance("AES/GCM/NoPadding")
                .apply { init(Cipher.ENCRYPT_MODE, SecretKeySpec(ByteArray(32) { 12 }, "AES")) }
            session.authorizeEnrollment(GateCipher(GatePurpose.ENROLL, gate))
            val access = session.currentAccess() ?: error("the vault did not open")

            val service = ShareService(session, repository)
            val identity = service.identity(access)
            assertEquals(ShareService.ORIGIN_VAULT_SOFTWARE, identity.origin)
            assertTrue(identity.fingerprint.startsWith("SHA256:"))

            // A recipient that is really another key pair, verified out of band.
            val recipient = ShareKeyPair.generate()
            val added = service.addRecipient(access, "Device peer", recipient.public.uriFor("Device peer"))
            assertTrue("recipient was not added: $added", added is AddRecipientOutcome.Added)
            added as AddRecipientOutcome.Added
            assertTrue(service.confirmRecipient(access, added.id, recipient.fingerprint))

            val plaintext = ByteArray(20_000) { (it % 251).toByte() }
            val packageBytes = ByteArrayOutputStream()
            val sealed = service.seal(
                access = access,
                input = ByteArrayInputStream(plaintext),
                output = packageBytes,
                recipientIds = listOf(added.id),
                fileName = "device check.bin",
                mimeType = "application/octet-stream",
                note = "instrumented",
                senderLabel = "itel",
                plaintextLength = plaintext.size.toLong(),
                expiresAt = System.currentTimeMillis() + 600_000L,
            )
            assertTrue("sealing failed: $sealed", sealed is SealOutcome.Sealed)
            sealed as SealOutcome.Sealed
            assertEquals(packageBytes.size().toLong(), sealed.packageBytes)
            assertEquals(2, sealed.recipientCount)

            // The intended holder can open it through the service, using the
            // sender copy that sealing adds automatically.
            val ownBytes = ByteArrayOutputStream()
            val own = service.open(
                access,
                ByteArrayInputStream(packageBytes.toByteArray()),
                ownBytes,
            )
            assertTrue("the sender copy did not open: $own", own is ReceiveOutcome.Opened)
            own as ReceiveOutcome.Opened
            assertEquals("device check.bin", own.fileName)
            assertEquals("instrumented", own.note)
            assertEquals(plaintext.size.toLong(), own.bytes)
            assertTrue(expectedMatches(plaintext, ownBytes.toByteArray()))

            // A stranger cannot open it, and nothing is written for them.
            val stranger = ShareKeyPair.generate()
            val strangerOut = ByteArrayOutputStream()
            val strangerResult = com.knoux.crypt.security.SecureSharePackage().open(
                ByteArrayInputStream(packageBytes.toByteArray()),
                strangerOut,
                stranger,
                System.currentTimeMillis(),
            )
            assertEquals(
                com.knoux.crypt.security.SecureSharePackage.Verdict.RECIPIENT_MISMATCH,
                strangerResult.verdict,
            )
            assertEquals(0, strangerOut.size())

            // Nothing sensitive sits in the stored rows.
            val rawAll = dao.all().joinToString("|") { String(it.envelope, Charsets.ISO_8859_1) }
            assertFalse(rawAll.contains("device check.bin"))
            assertFalse(rawAll.contains("instrumented"))
            assertFalse(rawAll.contains(plaintext.joinToString("") { (it.toInt() and 0xff).toString(16) }.take(64)))
            val identityRow = dao.find(ShareService.IDENTITY_RECORD_ID)
            assertNotNull(identityRow)
            assertFalse(
                String(identityRow!!.envelope, Charsets.ISO_8859_1).contains(identity.privatePkcs8Base64),
            )
            // The public key of the recipient is stored, and its URI form parses back.
            val roundTrip = RecipientKey.fromUri(recipient.public.uriFor("Device peer"))
            assertNotNull(roundTrip)
            assertEquals(recipient.fingerprint, roundTrip!!.first.fingerprint)
        } finally {
            database.close()
        }
    }

    private fun expectedMatches(expected: ByteArray, actual: ByteArray): Boolean =
        expected.size == actual.size && expected.contentEquals(actual)
}
