package com.knoux.crypt.data

import com.knoux.crypt.security.Argon2idParameters
import com.knoux.crypt.security.PassphraseEnvelope
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class VaultBackupTest {
    private val fast = Argon2idParameters(8 * 1024, 1, 1)
    private val pass = "correct horse battery staple".toCharArray()

    @Test
    fun backupRestoresIntoAFreshVaultWithItsOwnKey() = runBlocking {
        val source = Fixture()
        source.enroll()
        val repo = SecretRepository(source.dao, source.session, source.keys)
        val access = source.access()!!
        repo.save(access, SecretKinds.NOTE, "note-1", """{"title":"plan","body":"secret note"}""")
        repo.save(access, SecretKinds.PASSWORD, "pw-1", """{"title":"mail","username":"u","password":"p"}""")
        repo.save(access, SecretKinds.TOTP, "totp-1", """{"issuer":"i","account":"a","secretBase32":"JBSWY3DPEHPK3PXP"}""")

        val sealed = source.backup.export(access, pass)
        val preview = source.backup.preview(access, sealed, pass)
        assertEquals(3, preview.total)
        assertEquals(3, preview.conflicts) // restoring into the same vault conflicts

        val target = Fixture()
        target.enroll()
        val targetPreview = target.backup.preview(target.access()!!, sealed, pass)
        assertEquals(3, targetPreview.total)
        assertEquals(0, targetPreview.conflicts)
        val restored = target.backup.restore(target.access()!!, sealed, pass)
        assertEquals(3, restored)
        val targetRepo = SecretRepository(target.dao, target.session, target.keys)
        val note = targetRepo.find(target.access()!!, "note-1")!!
        assertTrue(SecretsJson.decodeNote(note.payloadJson)?.body == "secret note")
        val password = targetRepo.find(target.access()!!, "pw-1")!!
        assertTrue(SecretsJson.decodePassword(password.payloadJson)?.title == "mail")
        val totp = targetRepo.find(target.access()!!, "totp-1")!!
        assertTrue(SecretsJson.decodeTotp(totp.payloadJson)?.issuer == "i")
        // The source ciphertext was never copied: the target has its own keystore key.
        assertFalse(source.dao.rows.value.single { it.id == "note-1" }.envelope
            .contentEquals(target.dao.rows.value.single { it.id == "note-1" }.envelope))
    }

    @Test
    fun selectedSectionsOnly() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = SecretRepository(fixture.dao, fixture.session, fixture.keys)
        val access = fixture.access()!!
        repo.save(access, SecretKinds.NOTE, "n", """{"title":"n","body":"b"}""")
        repo.save(access, SecretKinds.PASSWORD, "p", """{"title":"p"}""")

        val sealed = fixture.backup.export(access, pass, setOf(SecretKinds.NOTE))
        val preview = fixture.backup.preview(access, sealed, pass, setOf(SecretKinds.NOTE))
        assertEquals(1, preview.total)
        assertEquals(mapOf(SecretKinds.NOTE to 1), preview.counts)
    }

    @Test
    fun wrongPassphraseAndTamperingAreRejected() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = SecretRepository(fixture.dao, fixture.session, fixture.keys)
        val access = fixture.access()!!
        repo.save(access, SecretKinds.NOTE, "n", """{"title":"n","body":"b"}""")
        val sealed = fixture.backup.export(access, pass)

        expect<BackupInvalidException> {
            fixture.backup.preview(access, sealed, "wrong".toCharArray())
        }
        val tampered = sealed.clone()
        tampered[tampered.size - 1] = (tampered[tampered.size - 1].toInt() xor 1).toByte()
        expect<BackupInvalidException> { fixture.backup.preview(access, tampered, pass) }
        expect<BackupInvalidException> { fixture.backup.restore(access, tampered, pass) }
    }

    @Test
    fun backupCannotBeOpenedAsTextCiphertext() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = SecretRepository(fixture.dao, fixture.session, fixture.keys)
        val access = fixture.access()!!
        repo.save(access, SecretKinds.NOTE, "n", """{"title":"n","body":"b"}""")
        val sealed = fixture.backup.export(access, pass)
        expect<java.security.GeneralSecurityException> {
            PassphraseEnvelope().open(sealed, pass, "knoux.text.v1".toByteArray())
        }
    }

    @Test
    fun conflictingRestoreWritesNothing() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = SecretRepository(fixture.dao, fixture.session, fixture.keys)
        val access = fixture.access()!!
        repo.save(access, SecretKinds.NOTE, "n", """{"title":"n","body":"b"}""")
        val sealed = fixture.backup.export(access, pass)

        val preview = fixture.backup.preview(access, sealed, pass)
        assertEquals(1, preview.conflicts)
        val before = fixture.dao.rows.value.toList()
        expect<BackupConflictException> { fixture.backup.restore(access, sealed, pass) }
        assertEquals(before.size, fixture.dao.rows.value.size)
        assertEquals(before.single().envelope.toList(), fixture.dao.rows.value.single().envelope.toList())
    }

    @Test
    fun exportFailsWholeWhenAnyRowIsUnreadable() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = SecretRepository(fixture.dao, fixture.session, fixture.keys)
        val access = fixture.access()!!
        repo.save(access, SecretKinds.NOTE, "good", """{"title":"g","body":"b"}""")
        repo.save(access, SecretKinds.NOTE, "bad", """{"title":"x","body":"y"}""")
        fixture.dao.rows.value = fixture.dao.rows.value.map {
            if (it.id == "bad") it.copy(envelope = it.envelope.clone().also { b -> b[0] = (b[0].toInt() xor 1).toByte() })
            else it
        }

        expect<BackupUnreadableRecordException> { fixture.backup.export(access, pass) }
    }

    @Test
    fun lockedCapabilityCannotExportPreviewOrRestore() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = SecretRepository(fixture.dao, fixture.session, fixture.keys)
        val access = fixture.access()!!
        repo.save(access, SecretKinds.NOTE, "n", """{"title":"n","body":"b"}""")
        val sealed = fixture.backup.export(access, pass)
        fixture.session.lock()

        expect<VaultLockedException> { fixture.backup.export(access, pass) }
        expect<VaultLockedException> { fixture.backup.preview(access, sealed, pass) }
        expect<VaultLockedException> { fixture.backup.restore(access, sealed, pass) }
    }

    @Test
    fun restoreMutationWaitsForRevocationAndCannotCommitAfterLock() = runBlocking {
        val source = Fixture()
        source.enroll()
        val sourceRepo = SecretRepository(source.dao, source.session, source.keys)
        val sourceAccess = source.access()!!
        sourceRepo.save(sourceAccess, SecretKinds.NOTE, "n", """{"title":"n","body":"b"}""")
        val sealed = source.backup.export(sourceAccess, pass)

        val target = Fixture()
        target.enroll()
        val targetAccess = target.access()!!
        target.dao.blockInsert = true
        val restore = async { target.backup.restore(targetAccess, sealed, pass) }
        target.dao.insertEntered.await()
        val lock = async { target.session.lock() }
        assertNull(withTimeoutOrNull(100) { lock.await() })
        target.dao.insertRelease.complete(Unit)
        assertEquals(1, restore.await())
        lock.await()
        assertFalse(target.session.isUnlocked)
        assertEquals(1, target.dao.rows.value.size)
        expect<VaultLockedException> { target.backup.restore(targetAccess, sealed, pass) }
        assertEquals(1, target.dao.rows.value.size)
    }

    @Test
    fun unsupportedKindAndVersionAreRejected() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        val envelope = PassphraseEnvelope()
        val context = "knoux.backup.v1".toByteArray()

        val unknownKind = """{"format":"KNOUX-BACKUP","version":1,"createdAt":1,"records":[{"id":"x","kind":"media","payload":"{}","updatedAt":1}]}"""
        val sealedKind = envelope.seal(unknownKind.toByteArray(), pass, context, fast)
        expect<BackupUnsupportedKindException> { fixture.backup.preview(access, sealedKind, pass) }

        val badVersion = """{"format":"KNOUX-BACKUP","version":2,"createdAt":1,"records":[]}"""
        val sealedVersion = envelope.seal(badVersion.toByteArray(), pass, context, fast)
        expect<BackupInvalidException> { fixture.backup.preview(access, sealedVersion, pass) }

        val duplicate = """{"format":"KNOUX-BACKUP","version":1,"createdAt":1,"records":[{"id":"x","kind":"note","payload":"{}","updatedAt":1},{"id":"x","kind":"note","payload":"{}","updatedAt":1}]}"""
        val sealedDuplicate = envelope.seal(duplicate.toByteArray(), pass, context, fast)
        expect<BackupInvalidException> { fixture.backup.preview(access, sealedDuplicate, pass) }
    }

    @Test
    fun oversizedPlaintextIsRefused() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = SecretRepository(fixture.dao, fixture.session, fixture.keys)
        val access = fixture.access()!!
        val chunk = "x".repeat(400 * 1024)
        repeat(3) { index ->
            repo.save(access, SecretKinds.NOTE, "big-$index", """{"title":"b","body":"$chunk"}""")
        }
        expect<BackupTooLargeException> { fixture.backup.export(access, pass) }
    }

    private class FakeInvalidated : Exception("fake invalidation")

    private class FakeVaultKeys : VaultKeySource {
        private var master: SecretKey? = null
        override fun hasMasterKey(): Boolean = master != null
        override fun masterKey(): SecretKey =
            master ?: SecretKeySpec(ByteArray(32) { (it * 11 + 5).toByte() }.also { b -> b[0] = (b[0].toInt() xor (System.nanoTime() and 0xff).toInt()).toByte() }, "AES").also { master = it }
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
            val key = keys[slot] ?: throw IllegalStateException("missing")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key) }
            return GateCipher(GatePurpose.ENROLL, cipher)
        }
        override fun newDecryptGate(slot: GateSlot, iv: ByteArray): GateCipher {
            val key = keys[slot] ?: throw IllegalStateException("missing")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
            }
            return GateCipher(GatePurpose.UNLOCK, cipher)
        }
        override fun isInvalidated(failure: Throwable): Boolean = failure is FakeInvalidated
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
        override fun observe(kind: String): Flow<List<SecretEntity>> = flow { emit(rows.value.filter { it.kind == kind }) }
        override suspend fun find(id: String): SecretEntity? = rows.value.firstOrNull { it.id == id }
        override suspend fun upsert(entity: SecretEntity) {
            rows.value = rows.value.filterNot { it.id == entity.id } + entity
        }
        override suspend fun delete(id: String) { rows.value = rows.value.filterNot { it.id == id } }
        override fun count(kind: String): Flow<Int> = flow { emit(rows.value.count { it.kind == kind }) }
        override suspend fun all(): List<SecretEntity> = rows.value.sortedBy { it.updatedAt }
        override suspend fun ids(): List<String> = rows.value.map { it.id }
        var blockInsert = false
        val insertEntered = CompletableDeferred<Unit>()
        val insertRelease = CompletableDeferred<Unit>()
        override suspend fun insertAll(entities: List<SecretEntity>) {
            if (blockInsert) {
                insertEntered.complete(Unit)
                insertRelease.await()
            }
            val existing = rows.value.map { it.id }.toSet()
            if (entities.any { it.id in existing }) throw IllegalStateException("UNIQUE constraint failed: secrets.id")
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

    private class MemoryKeyRegistry : VaultKeyRegistry {
        var active = 0
        val wrapped = mutableMapOf<Int, ByteArray>()
        var journal: RotationJournal? = null
        override suspend fun activeVersion(): Int = active
        override suspend fun setActiveVersion(version: Int) { active = version }
        override suspend fun wrappedKey(version: Int): ByteArray? = wrapped[version]?.copyOf()
        override suspend fun storeWrappedKey(version: Int, blob: ByteArray) { wrapped[version] = blob.copyOf() }
        override suspend fun removeWrappedKey(version: Int) { wrapped.remove(version) }
        override suspend fun versions(): List<Int> = wrapped.keys.sorted()
        override suspend fun rotationJournal(): RotationJournal? = journal
        override suspend fun setRotationJournal(journal: RotationJournal?) { this.journal = journal }
    }

    private class Fixture {
        val vault = FakeVaultKeys()
        val gates = FakeGateStore(vault)
        val tokens = FakeTokenStore()
        val session = SessionManager(vault)
        val manager = UnlockManager(gates, tokens, session)
        val dao = FakeDao()
        val registry = MemoryKeyRegistry()
        val keys = VaultKeyManager(session, registry)
        val backup = VaultBackupManager(dao, session, keys, Argon2idParameters(8 * 1024, 1, 1))

        fun access(): VaultAccess? = session.currentAccess()

        suspend fun enroll() {
            val cipher = manager.prepareSetupCipher()
            manager.completeSetup(cipher)
        }
    }

    private suspend inline fun <reified T : Throwable> expect(block: suspend () -> Unit) {
        try {
            block()
        } catch (failure: Throwable) {
            if (failure is T) return
            throw failure
        }
        fail("Expected ${T::class.java.simpleName}")
    }
}
