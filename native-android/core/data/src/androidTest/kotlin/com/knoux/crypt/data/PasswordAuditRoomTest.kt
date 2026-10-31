package com.knoux.crypt.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented audit check against a real Room database. It proves the DAO
 * paths the JVM fakes cannot: the `ids()` scan, per-row `find`, and AEAD
 * decryption of rows that went through the real SQLite layer.
 *
 * The vault key here is a software key so the test can run without a biometric
 * session; real Keystore, BiometricPrompt and timing behaviour still need the
 * device checklist. COMPILED BUT NOT RUN — no device was attached.
 */
@RunWith(AndroidJUnit4::class)
class PasswordAuditRoomTest {

    private class SoftwareKeySource : VaultKeySource {
        private var master: SecretKey? = null
        override fun hasMasterKey(): Boolean = master != null
        override fun masterKey(): SecretKey = master
            ?: SecretKeySpec(ByteArray(32) { (it * 5 + 1).toByte() }, "AES").also { master = it }
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
    fun auditScansRealRoomRowsAndDetectsReuseWeaknessAndGaps() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, KnouxDatabase::class.java).build()
        try {
            val source = SoftwareKeySource()
            val session = SessionManager(source)
            val dao = database.secrets()
            val keys = VaultKeyManager(session, MemoryRegistry())
            val repository = SecretRepository(dao, session, keys)

            val gate = Cipher.getInstance("AES/GCM/NoPadding")
                .apply { init(Cipher.ENCRYPT_MODE, SecretKeySpec(ByteArray(32) { 9 }, "AES")) }
            session.authorizeEnrollment(GateCipher(GatePurpose.ENROLL, gate))
            val access = session.currentAccess() ?: error("the vault did not open")

            repository.save(
                access,
                SecretKinds.PASSWORD,
                "mail",
                SecretsJson.encodePassword(PasswordPayload("Mail", "me", STRONG)),
            )
            repository.save(
                access,
                SecretKinds.PASSWORD,
                "forum",
                SecretsJson.encodePassword(PasswordPayload("Forum", "me", STRONG)),
            )
            repository.save(
                access,
                SecretKinds.PASSWORD,
                "bank",
                SecretsJson.encodePassword(PasswordPayload("Bank", "me", "password")),
            )
            repository.save(
                access,
                SecretKinds.PASSWORD,
                "blank",
                SecretsJson.encodePassword(PasswordPayload("Blank", "me", "")),
            )
            repository.save(access, SecretKinds.NOTE, "note", SecretsJson.encodeNote("ignored", "body"))

            val report = PasswordAuditService(session, dao, repository).audit(access)

            assertEquals(4, report.totalRecords)
            assertEquals(4, report.evaluated)
            assertEquals(0, report.unreadable)
            assertEquals(AuditOutcome.COMPLETED, report.outcome)
            assertEquals(1, report.reuseClusters.size)
            assertEquals(listOf("forum", "mail"), report.reuseClusters.first().recordIds.sorted())
            assertEquals(1, report.blankSecrets)
            assertTrue(report.findings.any { it.recordId == "bank" })
            assertFalse(report.isClean)
            // The report must not carry the secret value.
            assertFalse(report.toString().contains(STRONG))

            session.lock()
            try {
                PasswordAuditService(session, dao, repository).audit(access)
                fail("a stale capability must not audit the vault")
            } catch (expected: VaultLockedException) {
                // The audit stopped before reading any row.
            }
        } finally {
            database.close()
        }
    }

    private companion object {
        const val STRONG = "Room!audit#vector9Qz"
    }
}
