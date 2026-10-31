package com.knoux.crypt.data

import com.knoux.crypt.security.StrengthLevel
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * JVM boundary tests for the TASK 36 audit service. Plain AES keys stand in for
 * the Android Keystore, so these prove the domain rules — coverage, reuse
 * grouping, gap handling, revocation and non-leakage — and nothing about device
 * behaviour.
 */
class PasswordAuditTest {

    @Test
    fun auditClassifiesWeakReusedAndBlankSecrets() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        fixture.store(access, "a", "Mail", STRONG_ONE)
        fixture.store(access, "b", "Forum", "password")
        fixture.store(access, "c", "Shop", STRONG_ONE)
        fixture.store(access, "d", "Old", "")

        val report = fixture.service().audit(access)

        assertEquals(4, report.totalRecords)
        assertEquals(4, report.evaluated)
        assertEquals(0, report.unreadable)
        assertEquals(AuditOutcome.COMPLETED, report.outcome)
        assertEquals(1, report.blankSecrets)
        assertEquals(1, report.levelCounts[StrengthLevel.EMPTY])
        assertEquals(1, report.levelCounts[StrengthLevel.VERY_WEAK])
        assertEquals(2, report.levelCounts[StrengthLevel.EXCELLENT])

        // Same secret in two records -> exactly one reuse cluster of size two.
        assertEquals(1, report.reuseClusters.size)
        assertEquals(listOf("a", "c").sorted(), report.reuseClusters.first().recordIds.sorted())

        val weak = report.findings.associateBy { it.recordId }
        assertEquals(StrengthLevel.VERY_WEAK, weak.getValue("b").level)
        assertTrue(weak.getValue("d").recordId == "d")
        assertFalse(report.isClean)
    }

    @Test
    fun cleanVaultIsReportedCleanAndCarriesNoFindings() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        fixture.store(access, "a", "Mail", STRONG_ONE)
        fixture.store(access, "b", "VPN", STRONG_TWO)

        val report = fixture.service().audit(access)

        assertEquals(AuditOutcome.COMPLETED, report.outcome)
        assertTrue(report.findings.isEmpty())
        assertTrue(report.reuseClusters.isEmpty())
        assertTrue(report.isClean)
    }

    @Test
    fun unreadableRowsBecomeGapsAndNeverACleanBill() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        fixture.store(access, "a", "Mail", STRONG_ONE)
        fixture.store(access, "b", "Bank", STRONG_TWO)
        // Flip one ciphertext byte: the AEAD tag fails and the row is reported
        // as unreadable instead of being hidden or replaced with demo data.
        fixture.dao.rows.value = fixture.dao.rows.value.map { row ->
            if (row.id != "b") row
            else row.copy(envelope = row.envelope.copyOf().apply { this[lastIndex] = (this[lastIndex] + 1).toByte() })
        }

        val report = fixture.service().audit(access)

        assertEquals(2, report.totalRecords)
        assertEquals(1, report.evaluated)
        assertEquals(1, report.unreadable)
        assertEquals(AuditOutcome.COMPLETED_WITH_GAPS, report.outcome)
        assertFalse(report.isClean)
        assertEquals(0.5, report.coverageFraction, 0.0001)
    }

    @Test
    fun rowsVanishingMidScanAreCountedAsGaps() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        fixture.store(access, "a", "Mail", STRONG_ONE)
        fixture.store(access, "b", "Bank", STRONG_TWO)
        fixture.dao.missingIds += "b"

        val report = fixture.service().audit(access)

        assertEquals(1, report.unreadable)
        assertEquals(AuditOutcome.COMPLETED_WITH_GAPS, report.outcome)
    }

    @Test
    fun reportHoldsNoSecretMaterialAnywhere() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        val secrets = listOf("un1que-plaintext-AbC123xyz", "Tr0ub4dor&3!Qz", "password")
        secrets.forEachIndexed { index, value ->
            fixture.store(access, "r$index", "Site $index", value)
        }

        val report = fixture.service().audit(access)
        val rendered = report.toString() + report.findings.toString() + report.reuseClusters.toString() + report.levelCounts.toString()

        secrets.forEach { secret -> assertFalse("report leaked $secret", rendered.contains(secret)) }
        // Labels are expected; the grouping digest must not be carried either.
        assertTrue(rendered.contains("Site 2"))
        assertFalse(Regex("[0-9a-f]{64}").containsMatchIn(rendered))
    }

    @Test
    fun staleEntriesAreReportedWithTheirAge() = runBlocking {
        val now = 1_700_000_000_000L
        val fixture = Fixture(clock = { now })
        fixture.enroll()
        val access = fixture.access()!!
        fixture.store(access, "a", "Mail", STRONG_ONE)
        fixture.store(access, "b", "Legacy", STRONG_TWO)
        fixture.dao.rows.value = fixture.dao.rows.value.map {
            if (it.id == "b") it.copy(updatedAt = now - 400L * 24 * 60 * 60 * 1000) else it
        }

        val report = fixture.service().audit(access, staleAfterDays = 365)

        assertEquals(1, report.staleCount)
        val stale = report.findings.single { it.recordId == "b" }
        assertTrue(stale.isStale)
        assertEquals(400L, stale.ageDays)
        // A strong but abandoned credential still needs attention, so the
        // audit cannot be labelled clean.
        assertFalse(report.isClean)
    }

    @Test
    fun findingsAreCappedAndTruncationIsAdvertised() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        repeat(8) { index -> fixture.store(access, "w$index", "Site $index", "password$index") }

        val report = fixture.service().audit(access, maxFindings = 3)

        assertEquals(3, report.findings.size)
        assertTrue(report.findingsTruncated)
        assertEquals(8, report.evaluated)
    }

    @Test
    fun progressCoversEveryRecordInALargeVault() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        repeat(200) { index ->
            fixture.store(access, "v$index", "Site $index", "Str0ng!$index#Qz7W")
        }
        val progress = ArrayList<AuditProgress>()

        val report = fixture.service().audit(access, maxFindings = 1_000) { progress += it }

        assertEquals(200, report.totalRecords)
        assertEquals(200, report.evaluated)
        assertEquals(200, progress.size)
        assertEquals(AuditProgress(200, 200), progress.last())
    }

    @Test
    fun lockDuringScanPublishesNoReport() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        fixture.store(access, "a", "Mail", STRONG_ONE)
        fixture.store(access, "b", "Bank", "password")
        fixture.dao.blockFindForId = "b"

        var failure: Throwable? = null
        var published: PasswordAuditReport? = null
        val job = launch(Dispatchers.Default) {
            runCatching { fixture.service().audit(access) }
                .onSuccess { published = it }
                .onFailure { failure = it }
        }
        fixture.dao.findEntered.await()
        fixture.session.lock()
        fixture.dao.findRelease.complete(Unit)
        job.join()

        assertNotNull(failure)
        assertTrue(failure is VaultLockedException)
        assertNull(published)
    }

    @Test
    fun cancelledAuditPublishesNothing() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        fixture.store(access, "a", "Mail", STRONG_ONE)
        fixture.store(access, "b", "Bank", "password")
        fixture.dao.blockFindForId = "b"

        var published: PasswordAuditReport? = null
        val job = launch(Dispatchers.Default) {
            runCatching { fixture.service().audit(access) }.onSuccess { published = it }
        }
        fixture.dao.findEntered.await()
        job.cancelAndJoin()
        fixture.dao.findRelease.complete(Unit)

        assertNull(published)
    }

    @Test
    fun auditRefusesAStaleCapabilityBeforeReadingAnything() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val stale = fixture.access()!!
        fixture.store(stale, "a", "Mail", STRONG_ONE)
        fixture.session.lock()

        expect<VaultLockedException> { fixture.service().audit(stale) }
        assertTrue(fixture.dao.idsCalls == 0)
    }

    @Test
    fun otherSecretKindsAreNeverScoredAsPasswords() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        fixture.store(access, "p1", "Mail", STRONG_ONE)
        fixture.repository.save(
            access,
            SecretKinds.NOTE,
            "n1",
            SecretsJson.encodeNote("Shopping list", "milk"),
        )
        fixture.repository.save(
            access,
            SecretKinds.TOTP,
            "t1",
            SecretsJson.encodeTotp(TotpPayload("ACME", "me", "JBSWY3DPEHPK3PXP")),
        )

        val report = fixture.service().audit(access)

        assertEquals(1, report.totalRecords)
        assertEquals(1, report.evaluated)
        assertEquals(0, report.unreadable)
        assertEquals(0, report.blankSecrets)
        assertTrue(report.isClean)
    }

    private class FakeVaultKeys : VaultKeySource {
        private var master: SecretKey? = null
        override fun hasMasterKey(): Boolean = master != null
        override fun masterKey(): SecretKey = master
            ?: SecretKeySpec(ByteArray(32) { (it * 7 + 3).toByte() }, "AES").also { master = it }
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
        val missingIds = mutableSetOf<String>()
        var idsCalls = 0
        var blockFindForId: String? = null
        val findEntered = CompletableDeferred<Unit>()
        val findRelease = CompletableDeferred<Unit>()

        override fun observe(kind: String): Flow<List<SecretEntity>> = flow { emit(rows.value.filter { it.kind == kind }) }

        override suspend fun find(id: String): SecretEntity? {
            if (id == blockFindForId) {
                findEntered.complete(Unit)
                findRelease.await()
            }
            if (id in missingIds) return null
            return rows.value.firstOrNull { it.id == id }
        }

        override suspend fun upsert(entity: SecretEntity) {
            rows.value = rows.value.filterNot { it.id == entity.id } + entity
        }

        override suspend fun delete(id: String) { rows.value = rows.value.filterNot { it.id == id } }
        override fun count(kind: String): Flow<Int> = flow { emit(rows.value.count { it.kind == kind }) }
        override suspend fun all(): List<SecretEntity> = rows.value.sortedBy { it.updatedAt }
        override suspend fun ids(): List<String> {
            idsCalls++
            return rows.value.map { it.id }
        }
        override suspend fun insertAll(entities: List<SecretEntity>) { rows.value = rows.value + entities }
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

    private class Fixture(private val clock: () -> Long = System::currentTimeMillis) {
        val vault = FakeVaultKeys()
        val gates = FakeGateStore(vault)
        val tokens = FakeTokenStore()
        val session = SessionManager(vault)
        val manager = UnlockManager(gates, tokens, session)
        val dao = FakeDao()
        val registry = MemoryKeyRegistry()
        val keys = VaultKeyManager(session, registry)
        val repository = SecretRepository(dao, session, keys)

        fun service(): PasswordAuditService = PasswordAuditService(session, dao, repository, clock)

        fun access(): VaultAccess? = session.currentAccess()

        suspend fun enroll() {
            val cipher = manager.prepareSetupCipher()
            manager.completeSetup(cipher)
        }

        suspend fun store(access: VaultAccess, id: String, title: String, password: String) {
            repository.save(access, SecretKinds.PASSWORD, id, SecretsJson.encodePassword(PasswordPayload(title, "user", password)))
        }
    }

    private companion object {
        const val STRONG_ONE = "Xk9#mQ2\$vL7!pR4@tY8&"
        const val STRONG_TWO = "Zq2!wR7\$Km9#xT4@Vb6&yN1*"
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
