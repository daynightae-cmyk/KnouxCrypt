package com.knoux.crypt.data

import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JVM proof that the offline advisor's rules read real signals, tier them against
 * the app's own documented policy choices, and refuse to guess when a signal is
 * not available. No Android framework class is required: the framework seam is
 * [DeviceSignals] and every repository here is the real implementation over the
 * shared in-memory harness.
 */
class SecurityAdvisorServiceTest {
    private val vault = TestVault()

    private class FakeSignals(
        var secure: Boolean? = true,
        var patch: String? = "2026-10-05",
        var permissions: List<String> = listOf(
            "android.permission.CAMERA",
            "android.permission.USE_BIOMETRIC",
        ),
    ) : DeviceSignals {
        override fun isDeviceSecure(): Boolean? = secure
        override fun securityPatch(): String? = patch
        override fun declaredPermissions(): List<String> = permissions
    }

    private class FakeDismissals : AdvisorDismissalStore {
        val codes = mutableSetOf<String>()
        override suspend fun dismissed(): Set<String> = codes.toSet()
        override suspend fun dismiss(check: AdvisorCheckId) { codes += check.code }
        override suspend fun restore(check: AdvisorCheckId) { codes -= check.code }
        override suspend fun clearAll() { codes.clear() }
    }

    private class FakeEventDao : SecurityEventDao {
        val rows = MutableSharedFlow<List<SecurityEventEntity>>(replay = 1, extraBufferCapacity = 64)
        init { rows.tryEmit(emptyList()) }

        private fun sorted(list: List<SecurityEventEntity>) =
            list.sortedWith(compareByDescending<SecurityEventEntity> { it.createdAt }.thenByDescending { it.id })

        private suspend fun publish(list: List<SecurityEventEntity>) {
            val next = sorted(list)
            if (next != rows.replayCache.last()) rows.emit(next)
        }

        override suspend fun all(): List<SecurityEventEntity> = sorted(rows.replayCache.last())
        override suspend fun byCategory(category: String): List<SecurityEventEntity> =
            all().filter { it.category == category }

        override fun observeAll(): Flow<List<SecurityEventEntity>> = rows.map(::sorted)
        override fun observeByCategory(category: String): Flow<List<SecurityEventEntity>> =
            observeAll().map { list -> list.filter { it.category == category } }

        override suspend fun count(): Int = rows.replayCache.last().size
        override suspend fun insert(entity: SecurityEventEntity) {
            publish(rows.replayCache.last().filterNot { it.id == entity.id } + entity)
        }

        suspend fun addEvent(action: SecurityEventAction, detail: String, createdAt: Long) {
            insert(SecurityEventEntity(UUID.randomUUID().toString(), action.category.code, action.name, detail, action.severity.code, createdAt))
        }

        override suspend fun clear() { publish(emptyList()) }
        override suspend fun clearOlderThan(before: Long) {
            publish(rows.replayCache.last().filterNot { it.createdAt < before })
        }

        override suspend fun trimToMostRecent(keep: Int) { publish(all().take(keep)) }
        override suspend fun recent(limit: Int) = all().take(limit)
    }

    private class DirectRegistry : VaultKeyRegistry {
        var active = 0
        val wrapped = mutableMapOf<Int, ByteArray>()
        var journal: RotationJournal? = null
        override suspend fun activeVersion(): Int = active
        override suspend fun setActiveVersion(version: Int) { active = version }
        override suspend fun wrappedKey(version: Int): ByteArray? = wrapped[version]
        override suspend fun storeWrappedKey(version: Int, blob: ByteArray) { wrapped[version] = blob }
        override suspend fun removeWrappedKey(version: Int) { wrapped.remove(version) }
        override suspend fun versions(): List<Int> = wrapped.keys.sorted()
        override suspend fun rotationJournal(): RotationJournal? = journal
        override suspend fun setRotationJournal(journal: RotationJournal?) { this.journal = journal }
    }

    private class InlineTransactions : TransactionRunner {
        override suspend fun <T> inTransaction(block: suspend () -> T): T = block()
    }

    private fun settings(
        autoLock: Int = 30,
        clipboard: Int = 60,
        screenshots: Boolean = true,
        mask: Boolean = true,
        screenOff: Boolean = true,
    ): suspend () -> AppSettings = {
        AppSettings(
            autoLockSeconds = autoLock,
            lockOnScreenOff = screenOff,
            clipboardClearSeconds = clipboard,
            blockScreenshots = screenshots,
            maskOnAppSwitch = mask,
        )
    }

    /** Inner so the rules run against the same real session and repository the rest of the suite uses. */
    private inner class Harness(
        signals: DeviceSignals = FakeSignals(),
        provider: suspend () -> AppSettings = settings(),
    ) {
        private val registry = DirectRegistry()
        val eventDao = FakeEventDao()
        private val events = SecurityEventRepository(eventDao)
        private val dismissals = FakeDismissals()
        val rotation = VaultKeyRotationManager(
            session = vault.session,
            keys = VaultKeyManager(vault.session, registry),
            registry = registry,
            dao = vault.dao,
            transactions = InlineTransactions(),
        )
        val service = SecurityAdvisorService(
            signals = signals,
            settings = provider,
            unlock = vault.unlockManager,
            rotation = rotation,
            events = events,
            secrets = vault.repository,
            dismissals = dismissals,
        )
        val dismissStore = dismissals
        val eventLog = events
        val keyRegistry = registry
    }

    private fun harnessWith(unlock: UnlockManager): SecurityAdvisorService {
        val source = TestVault()
        return SecurityAdvisorService(
            signals = FakeSignals(),
            settings = settings(),
            unlock = unlock,
            rotation = VaultKeyRotationManager(
                session = source.session,
                keys = VaultKeyManager(source.session, DirectRegistry()),
                registry = DirectRegistry(),
                dao = source.dao,
                transactions = InlineTransactions(),
            ),
            events = SecurityEventRepository(FakeEventDao()),
            secrets = source.repository,
            dismissals = FakeDismissals(),
        )
    }

    /** Builds an advisor over an arbitrary session, so enrolment state is genuinely separate. */
    private fun harnessFor(source: TestVault): SecurityAdvisorService = SecurityAdvisorService(
        signals = FakeSignals(),
        settings = settings(),
        unlock = source.unlockManager,
        rotation = VaultKeyRotationManager(
            session = source.session,
            keys = VaultKeyManager(source.session, DirectRegistry()),
            registry = DirectRegistry(),
            dao = source.dao,
            transactions = InlineTransactions(),
        ),
        events = SecurityEventRepository(FakeEventDao()),
        secrets = source.repository,
        dismissals = FakeDismissals(),
    )

    private fun Harness.finding(check: AdvisorCheckId): AdvisorFinding =
        runBlocking { service.run(vault.access()).findings.first { it.check == check } }

    private fun SecurityAdvisorService.finding(access: VaultAccess?, check: AdvisorCheckId): AdvisorFinding =
        runBlocking { run(access).findings.first { it.check == check } }

    @Test
    fun deviceLockScreenNeverReportsUnavailableAsAPass() = runBlocking {
        val secure = Harness(FakeSignals(secure = true))
        assertEquals(AdvisorStatus.PASS, secure.finding(AdvisorCheckId.DEVICE_LOCK_SCREEN).status)

        val insecure = Harness(FakeSignals(secure = false))
        assertEquals(AdvisorStatus.WARN, insecure.finding(AdvisorCheckId.DEVICE_LOCK_SCREEN).status)

        val unknown = Harness(FakeSignals(secure = null))
        val finding = unknown.finding(AdvisorCheckId.DEVICE_LOCK_SCREEN)
        assertEquals(AdvisorStatus.UNAVAILABLE, finding.status)
        assertEquals(listOf("keyguard=unavailable"), finding.evidence)
        // An unreadable signal must never inflate the pass count.
        val report = unknown.service.run(vault.access())
        assertEquals(0, report.findings.count { it.status == AdvisorStatus.PASS && it.check == AdvisorCheckId.DEVICE_LOCK_SCREEN })
        assertTrue(report.unavailableCount > 0)
    }

    @Test
    fun patchLevelIsReportedNotJudged() = runBlocking {
        val finding = Harness().finding(AdvisorCheckId.ANDROID_PATCH_LEVEL)
        assertEquals(AdvisorStatus.INFO, finding.status)
        assertTrue(finding.evidence.contains("securityPatch=2026-10-05"))
        assertTrue(finding.evidence.contains("judgedByApp=false"))
        assertTrue(finding.evidence.contains("needsExternalReference=true"))

        val absent = Harness(FakeSignals(patch = "  ")).finding(AdvisorCheckId.ANDROID_PATCH_LEVEL)
        assertEquals(AdvisorStatus.UNAVAILABLE, absent.status)
        assertEquals(listOf("securityPatch=absent"), absent.evidence)
    }

    @Test
    fun permissionsCoverOnlyThisAppAndSaySo() = runBlocking {
        val finding = Harness().finding(AdvisorCheckId.APP_PERMISSIONS)
        assertEquals(AdvisorStatus.INFO, finding.status)
        assertEquals(AdvisorSource.ANDROID_PACKAGE_MANAGER, finding.source)
        assertTrue(finding.evidence.contains("declaredCount=2"))
        assertTrue(finding.evidence.contains("otherAppsEnumerated=false"))
        assertTrue(finding.evidence.none { it.contains("://") })

        val none = Harness(FakeSignals(permissions = emptyList())).finding(AdvisorCheckId.APP_PERMISSIONS)
        assertEquals(AdvisorStatus.UNAVAILABLE, none.status)
    }

    @Test
    fun recoverySeparatesNotEnrolledEnrolledAndInvalidated() = runBlocking {
        // Independent gate/token stores, because enrolment is real state, not a stub.
        val fresh = TestVault()
        val none = harnessFor(fresh)
        assertEquals(AdvisorStatus.ADVISORY, none.finding(null, AdvisorCheckId.ENCRYPTED_RECOVERY).status)
        assertTrue(none.finding(null, AdvisorCheckId.ENCRYPTED_RECOVERY).evidence.contains("unlockEnrolled=false"))

        fresh.enroll()
        val enrolled = harnessFor(fresh)
        assertEquals(AdvisorStatus.PASS, enrolled.finding(null, AdvisorCheckId.ENCRYPTED_RECOVERY).status)
        assertTrue(enrolled.finding(null, AdvisorCheckId.ENCRYPTED_RECOVERY).evidence.contains("backupTransferTested=false"))

        // An invalidated gate is a warning carrying the fixed reason code, never user content.
        val keys = TestVaultKeySource()
        val tokens = TestGateTokens()
        val damaged = UnlockManager(TestGateKeyStore(keys), tokens, SessionManager(keys))
        damaged.completeSetup(damaged.prepareSetupCipher())
        tokens.setRecoveryReason("KEY_INVALIDATED")
        val finding = harnessWith(damaged).finding(null, AdvisorCheckId.ENCRYPTED_RECOVERY)
        assertEquals(AdvisorStatus.WARN, finding.status)
        assertTrue(finding.evidence.contains("recoveryReason=KEY_INVALIDATED"))
    }

    @Test
    fun autoLockTiersFollowTheRealChoiceSet() = runBlocking {
        assertEquals(
            AdvisorStatus.PASS,
            Harness(provider = settings(autoLock = 15)).finding(AdvisorCheckId.VAULT_AUTO_LOCK).status,
        )
        assertEquals(
            AdvisorStatus.PASS,
            Harness(provider = settings(autoLock = 30)).finding(AdvisorCheckId.VAULT_AUTO_LOCK).status,
        )
        assertEquals(
            AdvisorStatus.INFO,
            Harness(provider = settings(autoLock = 60)).finding(AdvisorCheckId.VAULT_AUTO_LOCK).status,
        )
        val loosest = Harness(provider = settings(autoLock = 300)).finding(AdvisorCheckId.VAULT_AUTO_LOCK)
        assertEquals(AdvisorStatus.ADVISORY, loosest.status)
        assertTrue(loosest.evidence.contains("autoLockSeconds=300"))
        assertTrue(loosest.evidence.any { it.startsWith("choices=15-30-60-300") })
    }

    @Test
    fun clipboardThatNeverClearsIsAWarnNotAPass() = runBlocking {
        val never = Harness(provider = settings(clipboard = 0)).finding(AdvisorCheckId.CLIPBOARD_CLEAR)
        assertEquals(AdvisorStatus.WARN, never.status)
        assertTrue(never.evidence.contains("neverClears=true"))

        val quick = Harness(provider = settings(clipboard = 30)).finding(AdvisorCheckId.CLIPBOARD_CLEAR)
        assertEquals(AdvisorStatus.PASS, quick.status)

        val slow = Harness(provider = settings(clipboard = 120)).finding(AdvisorCheckId.CLIPBOARD_CLEAR)
        assertEquals(AdvisorStatus.ADVISORY, slow.status)
    }

    @Test
    fun screenshotBlockStatesItsOwnLimitation() = runBlocking {
        val finding = Harness(provider = settings(screenshots = false)).finding(AdvisorCheckId.SCREENSHOT_BLOCK)
        assertEquals(AdvisorStatus.ADVISORY, finding.status)
        assertTrue(finding.evidence.contains("mechanism=FLAG_SECURE"))
        assertTrue(finding.evidence.contains("defeatsRootedOrScreenRecorder=false"))

        val on = Harness().finding(AdvisorCheckId.SCREENSHOT_BLOCK)
        assertEquals(AdvisorStatus.PASS, on.status)
        // Masking and screen-off are separate real settings, both read from the same source.
        assertEquals(
            AdvisorStatus.ADVISORY,
            Harness(provider = settings(mask = false)).finding(AdvisorCheckId.APP_SWITCH_MASK).status,
        )
        assertEquals(
            AdvisorStatus.ADVISORY,
            Harness(provider = settings(screenOff = false)).finding(AdvisorCheckId.LOCK_ON_SCREEN_OFF).status,
        )
    }

    @Test
    fun vaultDependentRulesRefuseToGuessWhileLocked() = runBlocking {
        val harness = Harness()
        val report = harness.service.run(access = null)
        val key = report.findings.first { it.check == AdvisorCheckId.KEY_VERSION }
        val unreadable = report.findings.first { it.check == AdvisorCheckId.UNREADABLE_RECORDS }
        assertEquals(AdvisorStatus.UNAVAILABLE, key.status)
        assertEquals(AdvisorStatus.UNAVAILABLE, unreadable.status)
        assertEquals(listOf("reason=vaultLocked"), key.evidence)
        assertEquals(listOf("reason=vaultLocked"), unreadable.evidence)
        // The device and settings rules still run with no vault session at all.
        assertTrue(report.findings.any { it.status == AdvisorStatus.PASS })
        assertFalse(report.findings.isEmpty())
    }

    @Test
    fun keyVersionReportsRootKeyRecordsAndNeverCallsThemRotated() = runBlocking {
        runBlocking { vault.enroll() }
        val harness = Harness()
        val access = vault.access() ?: error("vault is locked")
        vault.repository.save(access, SecretKinds.NOTE, "n1", """{"title":"a","body":"b"}""")

        // A new vault writes under the device root key (version 0) until a rotation
        // runs, so this is an advisory with the count, not a pass.
        var finding = harness.finding(AdvisorCheckId.KEY_VERSION)
        assertEquals(AdvisorStatus.ADVISORY, finding.status)
        assertTrue(finding.evidence.contains("rootKeyRecords=1"))
        assertTrue(finding.evidence.contains("activeVersion=0"))
        assertTrue(finding.evidence.contains("totalRecords=1"))

        // Simulate a completed rotation: the row now lives under a wrapped data key.
        vault.dao.rows.value = vault.dao.rows.value.map { it.copy(keyVersion = 1) }
        finding = harness.finding(AdvisorCheckId.KEY_VERSION)
        assertEquals(AdvisorStatus.PASS, finding.status)
        assertTrue(finding.evidence.contains("rootKeyRecords=0"))

        // A half-finished rotation is a warning, not a pass, and says why.
        harness.keyRegistry.journal = RotationJournal(
            sourceVersion = 0,
            targetVersion = 1,
            phase = "migrating",
            createdAt = 1,
            updatedAt = 1,
            totalRows = 1,
        )
        finding = harness.finding(AdvisorCheckId.KEY_VERSION)
        assertEquals(AdvisorStatus.WARN, finding.status)
        assertTrue(finding.evidence.contains("rotationInProgress=true"))
    }

    @Test
    fun unreadableRecordsWarnOnlyWhenARecordActuallyFailsToDecrypt() = runBlocking {
        runBlocking { vault.enroll() }
        val harness = Harness()
        val access = vault.access() ?: error("vault is locked")
        vault.repository.save(access, SecretKinds.NOTE, "ok", """{"title":"a","body":"b"}""")
        assertEquals(AdvisorStatus.PASS, harness.finding(AdvisorCheckId.UNREADABLE_RECORDS).status)

        // AAD binds identity, so a copied row is genuinely undecryptable.
        val row = vault.dao.rows.value.first { it.id == "ok" }
        vault.dao.rows.value = vault.dao.rows.value + row.copy(id = "broken")
        val finding = harness.finding(AdvisorCheckId.UNREADABLE_RECORDS)
        assertEquals(AdvisorStatus.WARN, finding.status)
        assertTrue(finding.evidence.contains("undecryptable=1"))
        assertEquals(2, finding.evidence.first { it.startsWith("records=") }.substringAfter('=').toInt())
    }

    @Test
    fun recentAlertsCountOnlyAlertsInsideTheWindowAndCarryCodesOnly() = runBlocking {
        val harness = Harness()
        val now = System.currentTimeMillis()
        harness.eventDao.addEvent(SecurityEventAction.UNLOCK_REJECTED, "attempts=2", now)
        harness.eventDao.addEvent(SecurityEventAction.UNLOCK_SUCCEEDED, "slot=primary", now)
        // An alert outside the seven-day window must not be counted.
        harness.eventDao.addEvent(SecurityEventAction.UNLOCK_FAILED, "attempts=9", now - 40L * 24 * 60 * 60 * 1000)
        val report = harness.service.run(access = null, nowMillis = now)
        val finding = report.findings.first { it.check == AdvisorCheckId.RECENT_ALERTS }
        assertEquals(AdvisorStatus.INFO, finding.status)
        assertTrue(finding.evidence.any { it == "alertCount=1" })
        assertTrue(finding.evidence.any { it.startsWith("kinds=UNLOCK_REJECTED") })
        assertFalse(finding.evidence.joinToString().contains("slot=primary"))
    }

    @Test
    fun everyReportStatesWhatItDoesNotDo() = runBlocking {
        val report = Harness().service.run(access = null)
        val offline = report.findings.first { it.check == AdvisorCheckId.OFFLINE_BY_DESIGN }
        assertEquals(AdvisorStatus.INFO, offline.status)
        assertTrue(offline.evidence.containsAll(listOf("networkUsed=false", "installedAppsScanned=false", "intrusionDetection=false", "malwareScan=false")))
        // Exactly one finding per declared check, and each names a real source.
        assertEquals(AdvisorCheckId.entries.size, report.findings.size)
        assertEquals(report.findings.size, report.findings.map { it.check }.distinct().size)
        assertTrue(report.findings.all { it.source.code.isNotBlank() })
    }

    @Test
    fun readinessTilesMirrorTheirUnderlyingFindings() = runBlocking {
        val harness = Harness(FakeSignals(secure = false, patch = null))
        val report = harness.service.run(access = null)
        assertEquals(AdvisorStatus.WARN, report.readiness.screenLock)
        assertEquals(AdvisorStatus.UNAVAILABLE, report.readiness.patchState)
        assertEquals(
            report.findings.first { it.check == AdvisorCheckId.ENCRYPTED_RECOVERY }.status,
            report.readiness.recovery,
        )
    }

    @Test
    fun dismissalIsPersistentStateAndCanBeReversed() = runBlocking {
        val harness = Harness()
        harness.dismissStore.dismiss(AdvisorCheckId.ANDROID_PATCH_LEVEL)
        val report = harness.service.run(access = null)
        assertTrue(report.dismissed.contains(AdvisorCheckId.ANDROID_PATCH_LEVEL))
        // A dismissal hides the row; it never rewrites the finding's status.
        assertEquals(
            AdvisorStatus.INFO,
            report.findings.first { it.check == AdvisorCheckId.ANDROID_PATCH_LEVEL }.status,
        )
        harness.service.restore(AdvisorCheckId.ANDROID_PATCH_LEVEL)
        val restored = harness.service.run(access = null)
        assertFalse(restored.dismissed.contains(AdvisorCheckId.ANDROID_PATCH_LEVEL))
        assertEquals(0, restored.dismissed.size)
    }

    @Test
    fun evidenceTokensAreBoundedAndRejectUrls() {
        runCatching {
            AdvisorFinding(
                check = AdvisorCheckId.VAULT_AUTO_LOCK,
                status = AdvisorStatus.INFO,
                source = AdvisorSource.APP_SETTINGS,
                evidence = listOf("x".repeat(200)),
            )
        }.onSuccess { error("An unbounded evidence token must be rejected") }

        runCatching {
            AdvisorFinding(
                check = AdvisorCheckId.APP_PERMISSIONS,
                status = AdvisorStatus.INFO,
                source = AdvisorSource.APP_SETTINGS,
                evidence = listOf("url=https://example.com/telemetry"),
            )
        }.onSuccess { error("A URL-bearing evidence token must be rejected") }

        assertNotNull(
            AdvisorFinding(
                check = AdvisorCheckId.APP_PERMISSIONS,
                status = AdvisorStatus.INFO,
                source = AdvisorSource.APP_SETTINGS,
                evidence = listOf("declaredCount=3"),
            ),
        )
    }

    @Test
    fun noFindingEverCarriesSecretBearingText() = runBlocking {
        runBlocking { vault.enroll() }
        val harness = Harness()
        val access = vault.access() ?: error("vault is locked")
        vault.repository.save(
            access,
            SecretKinds.PASSWORD,
            "p1",
            """{"title":"bank-master-password","username":"someone","password":"Sup3rS3cretValue","url":"https://private.example"}""",
        )
        val report = harness.service.run(access)
        val all = buildString {
            report.findings.forEach { append(it.check.code).append('|').appendAll(it.evidence) }
        }
        listOf("Sup3rS3cretValue", "bank-master-password", "someone", "https://private.example").forEach {
            assertFalse("Evidence leaked \"$it\"", all.contains(it))
        }
        assertFalse(all.contains("/"))
    }

    private fun StringBuilder.appendAll(values: List<String>) {
        values.forEach { append(it).append(';') }
    }
}
