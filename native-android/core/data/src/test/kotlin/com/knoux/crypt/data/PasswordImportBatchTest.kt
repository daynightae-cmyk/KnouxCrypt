package com.knoux.crypt.data

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Batch import semantics (TASK 11): one authorization boundary, one atomic
 * write, and no partial store when the batch fails.
 */
class PasswordImportBatchTest {

    @Test
    fun batchWritesEveryChosenAccountInOneCommit() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        val before = fixture.dao.rows.value.size

        val ids = fixture.repository.saveBatch(
            access,
            SecretKinds.TOTP,
            listOf(
                null to SecretsJson.encodeTotp(TotpPayload("Git", "dev@example.com", "JBSWY3DPEHPK3PXP")),
                null to SecretsJson.encodeTotp(TotpPayload("Mail", "user@example.com", "MZXW6YTBOI")),
                "fixed-id" to SecretsJson.encodeTotp(TotpPayload("Cloud", "cloud@example.com", "JBSWY3DPEHPK3PXQ")),
            ),
        )

        assertEquals(3, ids.size)
        assertEquals("fixed-id", ids.last())
        assertEquals(before + 3, fixture.dao.rows.value.size)
        val stored = fixture.repository.find(access, ids.first())
        assertTrue(SecretsJson.decodeTotp(stored!!.payloadJson)!!.secretBase32.isNotEmpty())
        // Stored envelopes must not leak the secrets.
        fixture.dao.rows.value.forEach { row ->
            val raw = String(row.envelope, Charsets.ISO_8859_1)
            assertFalse(raw.contains("JBSWY3DPEHPK3PXP"))
            assertFalse(raw.contains("MZXW6YTBOI"))
        }
    }

    @Test
    fun replacingADuplicateKeepsItsIdentity() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        val id = fixture.repository.save(
            access,
            SecretKinds.TOTP,
            "existing",
            SecretsJson.encodeTotp(TotpPayload("Mail", "old@example.com", "JBSWY3DPEHPK3PXP")),
        )

        fixture.repository.saveBatch(
            access,
            SecretKinds.TOTP,
            listOf(id to SecretsJson.encodeTotp(TotpPayload("Mail", "new@example.com", "MZXW6YTBOI"))),
        )

        val rows = fixture.dao.rows.value.filter { it.id == id }
        assertEquals(1, rows.size)
        val payload = SecretsJson.decodeTotp(fixture.repository.find(access, id)!!.payloadJson)!!
        assertEquals("new@example.com", payload.account)
        assertEquals("MZXW6YTBOI", payload.secretBase32)
    }

    @Test
    fun failedBatchLeavesTheVaultUnchanged() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        fixture.dao.failBatch = IllegalStateException("disk full")
        val before = fixture.dao.rows.value

        val failure = runCatching {
            fixture.repository.saveBatch(
                access,
                SecretKinds.TOTP,
                listOf(
                    null to SecretsJson.encodeTotp(TotpPayload("Git", "a@example.com", "JBSWY3DPEHPK3PXP")),
                    null to SecretsJson.encodeTotp(TotpPayload("Mail", "b@example.com", "MZXW6YTBOI")),
                ),
            )
        }.exceptionOrNull()

        assertTrue(failure is IllegalStateException)
        assertEquals(before, fixture.dao.rows.value)
    }

    @Test
    fun lockedCapabilityCannotImport() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        fixture.session.lock()

        val failure = runCatching {
            fixture.repository.saveBatch(
                access,
                SecretKinds.TOTP,
                listOf(null to SecretsJson.encodeTotp(TotpPayload("Git", "a@example.com", "JBSWY3DPEHPK3PXP"))),
            )
        }.exceptionOrNull()

        assertTrue(failure is VaultLockedException)
        assertNull(fixture.access())
        assertTrue(fixture.dao.rows.value.isEmpty())
    }

    private class FakeVaultKeys : VaultKeySource {
        private var master: SecretKey? = null
        override fun hasMasterKey(): Boolean = master != null
        override fun masterKey(): SecretKey = master
            ?: SecretKeySpec(ByteArray(32) { (it * 9 + 4).toByte() }, "AES").also { master = it }
        override fun masterKeySecurityLevel(): String? = "FAKE_SOFTWARE"
    }

    private class FakeGateStore(private val vault: FakeVaultKeys) : GateKeyStore {
        private val keys = mutableMapOf<GateSlot, SecretKey>()
        private val random = SecureRandom()
        override fun hasMasterKey(): Boolean = vault.hasMasterKey()
        override fun hasGate(slot: GateSlot): Boolean = keys.containsKey(slot)
        override fun createGateIfNeeded(slot: GateSlot) {
            keys.getOrPut(slot) { SecretKeySpec(ByteArray(32).also(random::nextBytes), "AES") }
        }
        override fun deleteGate(slot: GateSlot) { keys.remove(slot) }
        override fun newEncryptGate(slot: GateSlot): GateCipher {
            val key = keys[slot] ?: throw IllegalStateException("missing gate key")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key) }
            return GateCipher(GatePurpose.ENROLL, cipher)
        }
        override fun newDecryptGate(slot: GateSlot, iv: ByteArray): GateCipher {
            val key = keys[slot] ?: throw IllegalStateException("missing gate key")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
            }
            return GateCipher(GatePurpose.UNLOCK, cipher)
        }
        override fun isInvalidated(failure: Throwable): Boolean = false
    }

    private class FakeTokenStore : GateTokenStore {
        private val blobs = mutableMapOf<GateSlot, ByteArray>()
        private var active = GateSlot.PRIMARY
        private var recovery: String? = null
        override suspend fun activeSlot(): GateSlot = active
        override suspend fun setActiveSlot(slot: GateSlot) { active = slot }
        override suspend fun blob(slot: GateSlot): ByteArray? = blobs[slot]?.copyOf()
        override suspend fun writeBlob(slot: GateSlot, blob: ByteArray) { blobs[slot] = blob.copyOf() }
        override suspend fun clearBlob(slot: GateSlot) { blobs.remove(slot) }
        override suspend fun recoveryReason(): String? = recovery
        override suspend fun setRecoveryReason(reason: String?) { recovery = reason }
    }

    private class FakeDao : SecretDao {
        val rows = MutableStateFlow<List<SecretEntity>>(emptyList())
        var failBatch: Exception? = null

        override fun observe(kind: String): Flow<List<SecretEntity>> = flow { emit(rows.value.filter { it.kind == kind }) }
        override suspend fun find(id: String): SecretEntity? = rows.value.firstOrNull { it.id == id }
        override suspend fun upsert(entity: SecretEntity) {
            rows.value = rows.value.filterNot { it.id == entity.id } + entity
        }
        /** Mirrors Room's transactional collection upsert: apply all or nothing. */
        override suspend fun upsertAll(entities: List<SecretEntity>) {
            failBatch?.let { throw it }
            var staged = rows.value
            entities.forEach { entity -> staged = staged.filterNot { it.id == entity.id } + entity }
            rows.value = staged
        }
        override suspend fun delete(id: String) { rows.value = rows.value.filterNot { it.id == id } }
        override fun count(kind: String): Flow<Int> = flow { emit(rows.value.count { it.kind == kind }) }
        override suspend fun all(): List<SecretEntity> = rows.value.sortedBy { it.updatedAt }
        override suspend fun ids(): List<String> = rows.value.map { it.id }
        override suspend fun insertAll(entities: List<SecretEntity>) {
            val existing = rows.value.map { it.id }.toSet()
            if (entities.any { it.id in existing }) throw IllegalStateException("UNIQUE constraint failed")
            rows.value = rows.value + entities
        }
        override suspend fun pageByVersionAfter(version: Int, after: String, limit: Int): List<SecretEntity> =
            rows.value.filter { it.keyVersion == version && it.id > after }.sortedBy { it.id }.take(limit)
        override suspend fun countVersion(version: Int): Int = rows.value.count { it.keyVersion == version }
        override suspend fun updateEnvelope(id: String, envelope: ByteArray, keyVersion: Int) {
            rows.value = rows.value.map { if (it.id == id) it.copy(envelope = envelope, keyVersion = keyVersion) else it }
        }
        override suspend fun versionCounts(): List<VersionCount> =
            rows.value.groupingBy { it.keyVersion }.eachCount().map { VersionCount(it.key, it.value) }
    }

    private class MemoryRegistry : VaultKeyRegistry {
        private var active = 0
        override suspend fun activeVersion(): Int = active
        override suspend fun setActiveVersion(version: Int) { active = version }
        override suspend fun wrappedKey(version: Int): ByteArray? = null
        override suspend fun storeWrappedKey(version: Int, blob: ByteArray) = Unit
        override suspend fun removeWrappedKey(version: Int) = Unit
        override suspend fun versions(): List<Int> = listOf(active)
        override suspend fun rotationJournal(): RotationJournal? = null
        override suspend fun setRotationJournal(journal: RotationJournal?) = Unit
    }

    private class Fixture {
        val vault = FakeVaultKeys()
        val tokens = FakeTokenStore()
        val session = SessionManager(vault)
        val manager = UnlockManager(FakeGateStore(vault), tokens, session)
        val dao = FakeDao()
        val repository = SecretRepository(dao, session, VaultKeyManager(session, MemoryRegistry()))

        fun access(): VaultAccess? = session.currentAccess()

        suspend fun enroll() {
            manager.completeSetup(manager.prepareSetupCipher())
        }
    }
}
