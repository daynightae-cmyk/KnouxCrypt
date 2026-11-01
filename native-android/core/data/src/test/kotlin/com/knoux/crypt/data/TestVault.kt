package com.knoux.crypt.data

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow

/**
 * Shared in-memory vault harness for the `:core:data` JVM tests.
 *
 * It stands in for the Keystore and Room only; the session capability, the
 * revocation gate and the envelope codecs are the real ones. The existing test
 * classes carry their own copies from before this file existed.
 */
internal open class TestVaultKeySource : VaultKeySource {
    private var master: SecretKey? = null
    override fun hasMasterKey(): Boolean = master != null
    override fun masterKey(): SecretKey = master
        ?: SecretKeySpec(ByteArray(32) { (it * 13 + 7).toByte() }, "AES").also { master = it }
    override fun masterKeySecurityLevel(): String? = "TEST_SOFTWARE"
}

internal class TestGateKeyStore(private val vault: TestVaultKeySource) : GateKeyStore {
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

internal class TestGateTokens : GateTokenStore {
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

internal class TestSecretDao : SecretDao {
    val rows = MutableStateFlow<List<SecretEntity>>(emptyList())

    override fun observe(kind: String): Flow<List<SecretEntity>> = flow { emit(rows.value.filter { it.kind == kind }) }
    override suspend fun find(id: String): SecretEntity? = rows.value.firstOrNull { it.id == id }
    override suspend fun upsert(entity: SecretEntity) {
        rows.value = rows.value.filterNot { it.id == entity.id } + entity
    }

    override suspend fun upsertAll(entities: List<SecretEntity>) {
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
        rows.value = rows.value.map {
            if (it.id == id) it.copy(envelope = envelope, keyVersion = keyVersion) else it
        }
    }

    override suspend fun versionCounts(): List<VersionCount> =
        rows.value.groupingBy { it.keyVersion }.eachCount().map { VersionCount(it.key, it.value) }
}

internal class TestKeyRegistry : VaultKeyRegistry {
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

/** Wires the harness into a live session and repository. */
internal class TestVault {
    val vault = TestVaultKeySource()
    val session = SessionManager(vault)
    val unlockManager = UnlockManager(TestGateKeyStore(vault), TestGateTokens(), session)
    val dao = TestSecretDao()
    val repository = SecretRepository(dao, session, VaultKeyManager(session, TestKeyRegistry()))

    fun access(): VaultAccess? = session.currentAccess()

    suspend fun enroll() {
        unlockManager.completeSetup(unlockManager.prepareSetupCipher())
    }
}
