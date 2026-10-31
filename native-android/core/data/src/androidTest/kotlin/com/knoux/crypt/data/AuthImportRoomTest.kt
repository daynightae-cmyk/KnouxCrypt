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
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented checks for the TASK 11 import commit path: one Room transaction
 * writes every chosen account, and the stored envelopes contain no Base32
 * secret. Compiled and executed on the itel S686LN; the software key source
 * keeps the test free of biometric prompts.
 */
@RunWith(AndroidJUnit4::class)
class AuthImportRoomTest {

    private class SoftwareKeySource : VaultKeySource {
        private var master: SecretKey? = null
        override fun hasMasterKey(): Boolean = master != null
        override fun masterKey(): SecretKey = master
            ?: SecretKeySpec(ByteArray(32) { (it * 13 + 2).toByte() }, "AES").also { master = it }
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
    fun importedBatchIsAtomicEncryptedAndReadable() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, KnouxDatabase::class.java).build()
        try {
            val session = SessionManager(SoftwareKeySource())
            val dao = database.secrets()
            val repository = SecretRepository(dao, session, VaultKeyManager(session, MemoryRegistry()))
            val gate = Cipher.getInstance("AES/GCM/NoPadding")
                .apply { init(Cipher.ENCRYPT_MODE, SecretKeySpec(ByteArray(32) { 6 }, "AES")) }
            session.authorizeEnrollment(GateCipher(GatePurpose.ENROLL, gate))
            val access = session.currentAccess() ?: error("the vault did not open")

            val ids = repository.saveBatch(
                access,
                SecretKinds.TOTP,
                listOf(
                    null to SecretsJson.encodeTotp(TotpPayload("Git", "dev@example.com", "JBSWY3DPEHPK3PXP")),
                    null to SecretsJson.encodeTotp(
                        TotpPayload("Mail", "user@example.com", "MZXW6YTBOI", algorithm = "SHA256", digits = 8),
                    ),
                    "picked" to SecretsJson.encodeTotp(TotpPayload("Cloud", "cloud@example.com", "JBSWY3DPEHPK3PXQ")),
                ),
            )

            assertEquals(3, ids.size)
            assertEquals(3, dao.countVersion(0))
            assertEquals("picked", ids.last())

            val mail = secretsPayload(repository, access, ids[1])
            assertEquals("SHA256", mail.algorithm)
            assertEquals(8, mail.digits)

            dao.all().forEach { row ->
                val raw = String(row.envelope, Charsets.ISO_8859_1)
                assertFalse(raw.contains("JBSWY3DPEHPK3PXP"))
                assertFalse(raw.contains("MZXW6YTBOI"))
                assertFalse(raw.contains("dev@example.com"))
            }

            // Locked capability must refuse the next batch and leave rows as-is.
            session.lock()
            val before = dao.all().size
            val rejected = runCatching {
                repository.saveBatch(
                    access,
                    SecretKinds.TOTP,
                    listOf(null to SecretsJson.encodeTotp(TotpPayload("Late", "late@example.com", "JBSWY3DPEHPK3PXQ"))),
                )
            }.exceptionOrNull()
            assertTrue(rejected is VaultLockedException)
            assertEquals(before, dao.all().size)
        } finally {
            database.close()
        }
    }

    private suspend fun secretsPayload(
        repository: SecretRepository,
        access: VaultAccess,
        id: String,
    ): TotpPayload {
        val record = repository.find(access, id) ?: error("missing row $id")
        return SecretsJson.decodeTotp(record.payloadJson) ?: error("unreadable payload $id")
    }
}
