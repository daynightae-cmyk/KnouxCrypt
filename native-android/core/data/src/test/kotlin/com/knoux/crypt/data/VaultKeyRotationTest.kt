package com.knoux.crypt.data

import com.knoux.crypt.security.Argon2idParameters
import com.knoux.crypt.security.FileEnvelope
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VaultKeyRotationTest {
    @Test
    fun mixedVersionReadsAndFullRotation() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = fixture.repository()
        val access = fixture.access()!!
        repo.save(access, SecretKinds.NOTE, "a", """{"title":"a","body":"one"}""")
        repo.save(access, SecretKinds.NOTE, "b", """{"title":"b","body":"two"}""")
        val auth = fixture.auth(access)
        val journal = fixture.rotation.prepare(access, auth)
        assertEquals(0, journal.sourceVersion)
        assertEquals(1, journal.targetVersion)

        // Migrate exactly one row: the vault must serve one legacy and one
        // versioned record from the same repository during migration.
        val first = fixture.rotation.migrateBatch(access, batchSize = 1)
        assertEquals(1, first.migratedRows)
        assertEquals(1, first.remainingRows)
        assertEquals(setOf(0, 1), fixture.dao.rows.value.map { it.keyVersion }.toSet())
        assertEquals("one", SecretsJson.decodeNote(repo.find(access, "a")!!.payloadJson)?.body)
        assertEquals("two", SecretsJson.decodeNote(repo.find(access, "b")!!.payloadJson)?.body)

        // Backup export must read both key versions during migration.
        val backup = VaultBackupManager(
            fixture.dao,
            fixture.session,
            fixture.keys,
            Argon2idParameters(8 * 1024, 1, 1),
        )
        val pass = "mixed-version-pass".toCharArray()
        val sealed = backup.export(access, pass)
        assertEquals(2, backup.preview(access, sealed, pass).total)

        while (true) {
            val progress = fixture.rotation.migrateBatch(access, batchSize = 1)
            if (progress.remainingRows == 0) break
        }
        val result = fixture.rotation.verifyAndCutover(access)
        assertEquals(0, result.sourceVersion)
        assertEquals(1, result.targetVersion)
        assertFalse(result.oldDataKeyRetired)
        assertTrue(result.rootKeyRetained)
        assertEquals(1, fixture.registry.active)
        assertEquals(setOf(1), fixture.dao.rows.value.map { it.keyVersion }.toSet())
        assertEquals("one", SecretsJson.decodeNote(repo.find(access, "a")!!.payloadJson)?.body)
    }

    @Test
    fun secondRotationRetiresTheOldDekButKeepsTheRoot() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = fixture.repository()
        val access = fixture.access()!!
        repo.save(access, SecretKinds.NOTE, "a", """{"title":"a","body":"x"}""")
        fixture.rotateAll(access)

        val auth = fixture.auth(access)
        val journal = fixture.rotation.prepare(access, auth)
        assertEquals(1, journal.sourceVersion)
        assertEquals(2, journal.targetVersion)
        while (true) {
            val progress = fixture.rotation.migrateBatch(access)
            if (progress.remainingRows == 0) break
        }
        val result = fixture.rotation.verifyAndCutover(access)
        assertTrue(result.oldDataKeyRetired)
        assertFalse(result.rootKeyRetained)
        assertFalse(fixture.registry.wrapped.containsKey(1))
        assertTrue(fixture.registry.wrapped.containsKey(2))
        assertEquals(2, fixture.registry.active)
        assertEquals("x", SecretsJson.decodeNote(repo.find(access, "a")!!.payloadJson)?.body)
    }

    @Test
    fun rotationRequiresFreshAndCorrectOwnerAuthorization() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        val repo = fixture.repository()
        repo.save(access, SecretKinds.NOTE, "a", """{"title":"a","body":"x"}""")

        expect<RotationNotAuthorizedException> {
            fixture.rotation.migrateBatch(access)
        }

        val expired = RotationAuthorization(
            access,
            issuedAt = System.currentTimeMillis() - RotationAuthorization.MAX_AGE_MS - 1,
        )
        expect<RotationNotAuthorizedException> { fixture.rotation.prepare(access, expired) }

        fixture.session.lock()
        fixture.unlock()
        val newAccess = fixture.access()!!
        val oldToken = RotationAuthorization(access)
        expect<RotationNotAuthorizedException> { fixture.rotation.prepare(newAccess, oldToken) }
        assertNull(fixture.registry.journal)
    }

    @Test
    fun lockDuringBatchWaitsForCommitAndJournalSurvivesForResume() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = fixture.repository()
        val access = fixture.access()!!
        repeat(3) { index ->
            repo.save(access, SecretKinds.NOTE, "n$index", """{"title":"t$index","body":"b$index"}""")
        }
        fixture.rotation.prepare(access, fixture.auth(access))
        fixture.dao.blockUpdate = true

        val batch = async { fixture.rotation.migrateBatch(access, batchSize = 1) }
        fixture.dao.updateEntered.await()
        val lock = async { fixture.session.lock() }
        assertNull(withTimeoutOrNull(100) { lock.await() })
        fixture.dao.updateRelease.complete(Unit)
        batch.await()
        lock.await()
        assertFalse(fixture.session.isUnlocked)
        assertNotNull(fixture.registry.journal)
        assertTrue(fixture.dao.rows.value.any { it.keyVersion == 1 })

        expect<VaultLockedException> { fixture.rotation.migrateBatch(access) }

        fixture.unlock()
        val newAccess = fixture.access()!!
        val resumed = fixture.rotation.prepare(newAccess, fixture.auth(newAccess))
        assertEquals(1, resumed.targetVersion)
        fixture.dao.blockUpdate = false
        while (true) {
            val progress = fixture.rotation.migrateBatch(newAccess)
            if (progress.remainingRows == 0) break
        }
        fixture.rotation.verifyAndCutover(newAccess)
        assertEquals(1, fixture.registry.active)
    }

    @Test
    fun rotationAuthorizationIsSingleUseAfterACompletedRotation() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        val token = fixture.auth(access)
        fixture.rotation.prepare(access, token)
        while (true) {
            val progress = fixture.rotation.migrateBatch(access)
            if (progress.remainingRows == 0) break
        }
        fixture.rotation.verifyAndCutover(access)
        expect<RotationNotAuthorizedException> { fixture.rotation.prepare(access, token) }
        assertNull(fixture.registry.journal)
    }

    @Test
    fun interruptionBeforeCutoverIsResumableByANewManager() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = fixture.repository()
        val access = fixture.access()!!
        repeat(2) { index ->
            repo.save(access, SecretKinds.NOTE, "n$index", """{"title":"t$index","body":"b$index"}""")
        }
        fixture.rotation.prepare(access, fixture.auth(access))
        fixture.rotation.migrateBatch(access, batchSize = 1)

        // A new manager instance models process restart: in-memory
        // authorization and caches are gone, durable journal/rows remain.
        val restarted = fixture.newManager()
        val resumed = restarted.prepare(access, fixture.auth(access))
        assertEquals(1, resumed.targetVersion)
        while (true) {
            val progress = restarted.migrateBatch(access)
            if (progress.remainingRows == 0) break
        }
        restarted.verifyAndCutover(access)
        assertEquals(1, fixture.registry.active)
        assertEquals("b0", SecretsJson.decodeNote(repo.find(access, "n0")!!.payloadJson)?.body)
        assertEquals("b1", SecretsJson.decodeNote(repo.find(access, "n1")!!.payloadJson)?.body)
    }

    @Test
    fun interruptionAfterCutoverBeforeCleanupIsResumable() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = fixture.repository()
        val access = fixture.access()!!
        repo.save(access, SecretKinds.NOTE, "a", """{"title":"a","body":"x"}""")
        fixture.rotateAll(access) // now source=1, active=1

        // Start a second rotation; fail only at source-DEK retirement after the
        // active version has already been switched.
        fixture.rotation.prepare(access, fixture.auth(access))
        fixture.registry.failRemove = true
        while (true) {
            val progress = fixture.rotation.migrateBatch(access)
            if (progress.remainingRows == 0) break
        }
        expect<VaultKeyInconsistentException> { fixture.rotation.verifyAndCutover(access) }
        assertEquals(2, fixture.registry.active)
        assertNotNull(fixture.registry.journal)

        fixture.registry.failRemove = false
        val restarted = fixture.newManager()
        val resumed = restarted.prepare(access, fixture.auth(access))
        assertEquals(2, resumed.targetVersion)
        restarted.verifyAndCutover(access)
        assertNull(fixture.registry.journal)
        assertFalse(fixture.registry.wrapped.containsKey(1))
        assertEquals("x", SecretsJson.decodeNote(repo.find(access, "a")!!.payloadJson)?.body)
    }

    @Test
    fun corruptRowAbortsTheBatchWithoutChangingRows() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = fixture.repository()
        val access = fixture.access()!!
        repo.save(access, SecretKinds.NOTE, "good", """{"title":"g","body":"g"}""")
        repo.save(access, SecretKinds.NOTE, "bad", """{"title":"b","body":"b"}""")
        fixture.dao.rows.value = fixture.dao.rows.value.map {
            if (it.id == "bad") it.copy(envelope = it.envelope.clone().also { b -> b[0] = (b[0].toInt() xor 1).toByte() })
            else it
        }
        fixture.rotation.prepare(access, fixture.auth(access))
        val before = fixture.dao.rows.value.map { Triple(it.id, it.keyVersion, it.envelope.toList()) }

        expect<RotationCorruptRecordException> { fixture.rotation.migrateBatch(access, batchSize = 8) }
        assertEquals(before, fixture.dao.rows.value.map { Triple(it.id, it.keyVersion, it.envelope.toList()) })
        assertNotNull(fixture.registry.journal)
    }

    @Test
    fun partialUpdateFailureRollsBackTheWholeBatch() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = fixture.repository()
        val access = fixture.access()!!
        repo.save(access, SecretKinds.NOTE, "a", """{"title":"a","body":"a"}""")
        repo.save(access, SecretKinds.NOTE, "b", """{"title":"b","body":"b"}""")
        fixture.rotation.prepare(access, fixture.auth(access))
        fixture.dao.failUpdateAfterOne = true

        expect<IllegalStateException> { fixture.rotation.migrateBatch(access, batchSize = 8) }
        assertEquals(setOf(0), fixture.dao.rows.value.map { it.keyVersion }.toSet())
        assertNotNull(fixture.registry.journal)
        assertTrue(fixture.registry.wrapped.containsKey(1))
    }

    @Test
    fun missingWrappedKeyAbortsWithoutChangingData() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = fixture.repository()
        val access = fixture.access()!!
        repo.save(access, SecretKinds.NOTE, "a", """{"title":"a","body":"x"}""")
        fixture.rotateAll(access)
        fixture.registry.wrapped.remove(1) // simulate a missing/invalidated DEK

        expect<MissingVaultKeyException> { fixture.rotation.prepare(access, fixture.auth(access)) }
        assertEquals(1, fixture.dao.rows.value.single().keyVersion)
        val unreadable = repo.find(access, "a")!!
        assertTrue(unreadable.decryptionFailed)
        assertTrue(unreadable.payloadJson.isEmpty())
    }

    @Test
    fun retirementIsRefusedWhileSourceRowsDependOnTheKey() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = fixture.repository()
        val access = fixture.access()!!
        repo.save(access, SecretKinds.NOTE, "a", """{"title":"a","body":"x"}""")
        fixture.rotateAll(access) // source 1 becomes active
        repo.save(access, SecretKinds.NOTE, "b", """{"title":"b","body":"y"}""")

        // Prepare a 1 -> 2 rotation and migrate only one of the two source rows.
        fixture.rotation.prepare(access, fixture.auth(access))
        fixture.rotation.migrateBatch(access, batchSize = 1)
        expect<RotationIncompleteException> { fixture.rotation.verifyAndCutover(access) }
        assertTrue(fixture.registry.wrapped.containsKey(1))
        assertEquals(1, fixture.registry.active)
        assertEquals(setOf(1, 2), fixture.dao.rows.value.map { it.keyVersion }.toSet())
    }

    @Test
    fun repeatedPrepareAndCleanCancelAreIdempotent() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        val auth = fixture.auth(access)
        val first = fixture.rotation.prepare(access, auth)
        val second = fixture.rotation.prepare(access, auth)
        assertEquals(first, second)
        assertEquals(1, fixture.registry.wrapped.size)

        val cancel = fixture.rotation.cancel(access)
        assertEquals(RotationCancelResult.CANCELLED_CLEAN, cancel)
        assertNull(fixture.registry.journal)
        assertFalse(fixture.registry.wrapped.containsKey(first.targetVersion))
        // A clean cancel allows a new preparation with a fresh target.
        val again = fixture.rotation.prepare(access, fixture.auth(access))
        assertEquals(1, again.targetVersion)
    }

    @Test
    fun cancelAfterPartialMigrationIsResumable() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repo = fixture.repository()
        val access = fixture.access()!!
        repo.save(access, SecretKinds.NOTE, "a", """{"title":"a","body":"a"}""")
        repo.save(access, SecretKinds.NOTE, "b", """{"title":"b","body":"b"}""")
        fixture.rotation.prepare(access, fixture.auth(access))
        fixture.rotation.migrateBatch(access, batchSize = 1)

        assertEquals(RotationCancelResult.CANCELLED_RESUMABLE, fixture.rotation.cancel(access))
        assertNotNull(fixture.registry.journal)
        assertEquals(setOf(0, 1), fixture.dao.rows.value.map { it.keyVersion }.toSet())

        val resumed = fixture.rotation.prepare(access, fixture.auth(access))
        assertEquals(1, resumed.targetVersion)
        while (true) {
            val progress = fixture.rotation.migrateBatch(access)
            if (progress.remainingRows == 0) break
        }
        fixture.rotation.verifyAndCutover(access)
        assertEquals(1, fixture.registry.active)
    }

    @Test
    fun deviceFilesUseKnf2WrappedFileDekAndSurviveRecordRotation() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        val cipher = VaultFileCipher(fixture.session)
        val plaintext = "portable device-key file".toByteArray()
        val sealed = ByteArrayOutputStream()
        cipher.encrypt(access, ByteArrayInputStream(plaintext), sealed, plaintext.size.toLong())
        val header = cipher.headerOf(ByteArrayInputStream(sealed.toByteArray()))
        assertEquals(2, header.version)
        assertEquals(FileEnvelope.KeySource.DEVICE_WRAPPED, header.keySource)
        assertNotNull(header.wrappedFileKey)

        fixture.rotateAll(access)
        val restored = ByteArrayOutputStream()
        cipher.decrypt(access, ByteArrayInputStream(sealed.toByteArray()), restored)
        assertTrue(restored.toByteArray().contentEquals(plaintext))
        assertEquals(1, fixture.registry.active)

        val truncated = sealed.toByteArray().copyOf(sealed.size() - 1)
        expect<Exception> {
            cipher.decrypt(access, ByteArrayInputStream(truncated), ByteArrayOutputStream())
        }
    }

    @Test
    fun legacyKnf1FileSurvivesTwoRotationsAndRootRetirementIsRejected() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        val rootBefore = fixture.vault.masterKey().encoded!!.copyOf()
        val plaintext = "legacy KNF1 across two rotations".toByteArray()
        val legacy = ByteArrayOutputStream()
        FileEnvelope(chunkSize = 1024).encrypt(
            ByteArrayInputStream(plaintext),
            legacy,
            fixture.vault.masterKey(),
            FileEnvelope.KeySource.DEVICE,
            "knoux.file.device.v1".toByteArray(),
            plaintext.size.toLong(),
        )

        fixture.rotateAll(access)
        fixture.rotateAll(access)
        assertEquals(2, fixture.registry.active)
        assertTrue(fixture.vault.masterKey().encoded!!.contentEquals(rootBefore))

        val restored = ByteArrayOutputStream()
        VaultFileCipher(fixture.session).decrypt(
            access,
            ByteArrayInputStream(legacy.toByteArray()),
            restored,
        )
        assertTrue(restored.toByteArray().contentEquals(plaintext))

        expect<IllegalArgumentException> { fixture.keys.retireDataKey(access, LEGACY_KEY_VERSION) }
        assertTrue(fixture.vault.masterKey().encoded!!.contentEquals(rootBefore))
    }

    @Test
    fun legacyKnf1DeviceFileStillDecryptsThroughProductionCipher() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        val plaintext = "legacy KNF1 device file".toByteArray()
        val legacy = ByteArrayOutputStream()
        FileEnvelope(chunkSize = 1024).encrypt(
            ByteArrayInputStream(plaintext),
            legacy,
            fixture.vault.masterKey(),
            FileEnvelope.KeySource.DEVICE,
            "knoux.file.device.v1".toByteArray(),
            plaintext.size.toLong(),
        )
        val header = VaultFileCipher(fixture.session).headerOf(ByteArrayInputStream(legacy.toByteArray()))
        assertEquals(1, header.version)
        val restored = ByteArrayOutputStream()
        VaultFileCipher(fixture.session).decrypt(
            access,
            ByteArrayInputStream(legacy.toByteArray()),
            restored,
        )
        assertTrue(restored.toByteArray().contentEquals(plaintext))
    }

    // ---------------------------------------------------------------------

    private class FakeVaultKeys : VaultKeySource {
        private var master: SecretKey? = null
        override fun hasMasterKey(): Boolean = master != null
        override fun masterKey(): SecretKey =
            master ?: SecretKeySpec(ByteArray(32) { (it * 9 + 7).toByte() }.also { b ->
                b[0] = (b[0].toInt() xor (System.nanoTime() and 0xff).toInt()).toByte()
            }, "AES").also { master = it }
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

    private class FakeRegistry : VaultKeyRegistry {
        var active = 0
        val wrapped = mutableMapOf<Int, ByteArray>()
        var journal: RotationJournal? = null
        var failRemove = false
        override suspend fun activeVersion(): Int = active
        override suspend fun setActiveVersion(version: Int) { active = version }
        override suspend fun wrappedKey(version: Int): ByteArray? = wrapped[version]?.copyOf()
        override suspend fun storeWrappedKey(version: Int, blob: ByteArray) { wrapped[version] = blob.copyOf() }
        override suspend fun removeWrappedKey(version: Int) {
            if (failRemove) throw VaultKeyInconsistentException("injected removal failure")
            wrapped.remove(version)
        }
        override suspend fun versions(): List<Int> = wrapped.keys.sorted()
        override suspend fun rotationJournal(): RotationJournal? = journal
        override suspend fun setRotationJournal(journal: RotationJournal?) { this.journal = journal }
    }

    private class FakeDao : SecretDao {
        val rows = MutableStateFlow<List<SecretEntity>>(emptyList())
        var blockUpdate = false
        var failUpdateAfterOne = false
        val updateEntered = CompletableDeferred<Unit>()
        val updateRelease = CompletableDeferred<Unit>()
        private var updates = 0

        override fun observe(kind: String): Flow<List<SecretEntity>> = flow { emit(rows.value.filter { it.kind == kind }) }
        override suspend fun find(id: String): SecretEntity? = rows.value.firstOrNull { it.id == id }
        override suspend fun upsert(entity: SecretEntity) {
            rows.value = rows.value.filterNot { it.id == entity.id } + entity
        }
        override suspend fun delete(id: String) { rows.value = rows.value.filterNot { it.id == id } }
        override fun count(kind: String): Flow<Int> = flow { emit(rows.value.count { it.kind == kind }) }
        override suspend fun all(): List<SecretEntity> = rows.value.sortedBy { it.updatedAt }
        override suspend fun ids(): List<String> = rows.value.map { it.id }
        override suspend fun insertAll(entities: List<SecretEntity>) {
            rows.value = rows.value + entities
        }
        override suspend fun pageByVersionAfter(version: Int, after: String, limit: Int): List<SecretEntity> =
            rows.value.filter { it.keyVersion == version && it.id > after }.sortedBy { it.id }.take(limit)
        override suspend fun countVersion(version: Int): Int = rows.value.count { it.keyVersion == version }
        override suspend fun updateEnvelope(id: String, envelope: ByteArray, keyVersion: Int) {
            if (blockUpdate) {
                updateEntered.complete(Unit)
                updateRelease.await()
            }
            updates += 1
            if (failUpdateAfterOne && updates > 1) throw IllegalStateException("injected update failure")
            rows.value = rows.value.map {
                if (it.id == id) it.copy(envelope = envelope, keyVersion = keyVersion) else it
            }
        }
        override suspend fun versionCounts(): List<VersionCount> =
            rows.value.groupingBy { it.keyVersion }.eachCount().map { VersionCount(it.key, it.value) }
    }

    private class FakeTransactions(private val dao: FakeDao) : TransactionRunner {
        override suspend fun <T> inTransaction(block: suspend () -> T): T {
            val snapshot = dao.rows.value
            try {
                return block()
            } catch (failure: Throwable) {
                dao.rows.value = snapshot
                throw failure
            }
        }
    }

    private class Fixture {
        val vault = FakeVaultKeys()
        val gates = FakeGateStore(vault)
        val tokens = FakeTokenStore()
        val session = SessionManager(vault)
        val manager = UnlockManager(gates, tokens, session)
        val registry = FakeRegistry()
        val keys = VaultKeyManager(session, registry)
        val dao = FakeDao()
        val transactions = FakeTransactions(dao)
        val rotation = VaultKeyRotationManager(session, keys, registry, dao, transactions, SecureRandom())

        fun repository() = SecretRepository(dao, session, keys)
        fun access(): VaultAccess? = session.currentAccess()
        fun auth(access: VaultAccess) = RotationAuthorization(access)
        fun newManager() = VaultKeyRotationManager(session, keys, registry, dao, transactions, SecureRandom())

        suspend fun enroll() {
            val cipher = manager.prepareSetupCipher()
            manager.completeSetup(cipher)
        }

        suspend fun unlock() {
            val cipher = manager.prepareUnlockCipher()
            manager.completeUnlock(cipher)
        }

        suspend fun rotateAll(access: VaultAccess) {
            rotation.prepare(access, auth(access))
            while (true) {
                val progress = rotation.migrateBatch(access)
                if (progress.remainingRows == 0) break
            }
            rotation.verifyAndCutover(access)
        }
    }

    private suspend inline fun <reified T : Throwable> expect(block: suspend () -> Unit) {
        try {
            block()
        } catch (failure: Throwable) {
            if (failure is T) return
            throw failure
        }
        throw AssertionError("Expected ${T::class.java.simpleName}")
    }
}
