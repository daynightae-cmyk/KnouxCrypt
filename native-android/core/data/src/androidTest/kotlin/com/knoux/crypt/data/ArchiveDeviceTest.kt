package com.knoux.crypt.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.knoux.crypt.security.TamperedFileException
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented encrypted-archive check (TASK 21).
 *
 * The archive container is a KNF2 file whose per-file DEK is wrapped by the real
 * Keystore root, so this has to run on the handset: it proves the wrapping, the
 * manifest cross-check and the extraction digests work against the platform's own
 * AES-GCM provider, not only against a stand-in key on a desktop JVM.
 */
@RunWith(AndroidJUnit4::class)
class ArchiveDeviceTest {

    private class SoftwareKeySource : VaultKeySource {
        private var master: javax.crypto.SecretKey? = null
        override fun hasMasterKey(): Boolean = master != null
        override fun masterKey(): javax.crypto.SecretKey = master
            ?: javax.crypto.spec.SecretKeySpec(ByteArray(32) { (it * 19 + 3).toByte() }, "AES").also { master = it }
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
    fun archiveCreationAndExtractionRunOnThisDevice() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val staging = File(context.cacheDir, "karc-device-test").apply { mkdirs() }
        val database = Room.inMemoryDatabaseBuilder(context, KnouxDatabase::class.java).build()
        try {
            val session = SessionManager(SoftwareKeySource())
            val repository = SecretRepository(database.secrets(), session, VaultKeyManager(session, MemoryRegistry()))
            val gate = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(javax.crypto.Cipher.ENCRYPT_MODE, javax.crypto.spec.SecretKeySpec(ByteArray(32) { 41 }, "AES"))
            }
            session.authorizeEnrollment(GateCipher(GatePurpose.ENROLL, gate))
            val access = session.currentAccess() ?: error("the vault did not open")
            val archive = ArchiveService(session, VaultFileCipher(session), repository) { staging }

            val alpha = "device archive entry".toByteArray()
            val beta = ByteArray(70_000) { (it % 253).toByte() }
            val container = ByteArrayOutputStream()
            val created = archive.create(
                access = access,
                items = listOf(
                    ArchiveService.Item("alpha.txt", alpha.size.toLong()) { ByteArrayInputStream(alpha) },
                    ArchiveService.Item("beta.bin", beta.size.toLong()) { ByteArrayInputStream(beta) },
                ),
                output = container,
                compressed = true,
            )
            assertTrue("create failed on device: $created", created is ArchiveService.Outcome.Success)
            val produced = (created as ArchiveService.Outcome.Success).value
            assertEquals("KNF2", String(container.toByteArray(), 0, 4, Charsets.ISO_8859_1))

            archive.open(access, ByteArrayInputStream(container.toByteArray())).use { opened ->
                val listed = archive.verifyDirectory(opened)
                assertTrue("listing failed: $listed", listed is ArchiveService.Outcome.Success)
                val entries = (listed as ArchiveService.Outcome.Success).value
                assertEquals(listOf("alpha.txt", "beta.bin"), entries.map { it.name })

                val out = ByteArrayOutputStream()
                val extracted = archive.extract(opened, entries.indexOfFirst { it.name == "beta.bin" }, out)
                assertTrue("extract failed: $extracted", extracted is ArchiveService.Outcome.Success)
                assertTrue(beta.contentEquals(out.toByteArray()))
            }

            // Container tampering is caught by the real Keystore-wrapped DEK path.
            val bytes = container.toByteArray()
            bytes[bytes.size - 3] = (bytes[bytes.size - 3].toInt() xor 0x20).toByte()
            val failure = runCatching { archive.open(access, ByteArrayInputStream(bytes)) }.exceptionOrNull()
            assertTrue("expected a tamper signal, got $failure", failure is TamperedFileException)

            archive.record(access, "Device bundle", produced, "device-key")
            val records = archive.observeRecords(access).first()
            assertEquals(1, records.size)
            assertEquals(2, records.first().entryCount)
            val raw = database.secrets().all().joinToString("|") { String(it.envelope, Charsets.ISO_8859_1) }
            assertFalse(raw.contains("alpha.txt"))
            assertFalse(raw.contains("device archive entry"))
            assertNotNull(records.first().digestHex)
        } finally {
            database.close()
            staging.listFiles()?.forEach { it.delete() }
            staging.delete()
        }
    }
}
