package com.knoux.crypt.data

import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first

/**
 * A local security review surface (TASK 34). This is NOT an intrusion-detection
 * system: it never scans installed apps, never inspects process or filesystem
 * activity, and makes no network connection. It reports only settings and
 * records this app can actually read, and says so when it cannot.
 */
enum class AdvisorCheckId(val code: String) {
    DEVICE_LOCK_SCREEN("device-lock-screen"),
    ANDROID_PATCH_LEVEL("android-patch-level"),
    APP_PERMISSIONS("app-permissions"),
    ENCRYPTED_RECOVERY("encrypted-recovery"),
    VAULT_AUTO_LOCK("vault-auto-lock"),
    SCREENSHOT_BLOCK("screenshot-block"),
    APP_SWITCH_MASK("app-switch-mask"),
    CLIPBOARD_CLEAR("clipboard-clear"),
    LOCK_ON_SCREEN_OFF("lock-on-screen-off"),
    KEY_VERSION("key-version"),
    UNREADABLE_RECORDS("unreadable-records"),
    RECENT_ALERTS("recent-alerts"),
    OFFLINE_BY_DESIGN("offline-by-design"),
}

enum class AdvisorStatus {
    /** Not yet evaluated in this session. */
    NOT_CHECKED,

    /** The observed state matches what the guidance recommends. */
    PASS,

    /** Informational only; there is no local basis for a judgement. */
    INFO,

    /** Workable, but a stricter setting is available. */
    ADVISORY,

    /** The observed state is weaker than the app's own documented policy. */
    WARN,

    /** The signal genuinely could not be read; never presented as a pass. */
    UNAVAILABLE,
}

/** Where a finding came from, so the user can verify it instead of trusting it. */
enum class AdvisorSource(val code: String) {
    ANDROID_KEYGUARD("Android KeyguardManager"),
    ANDROID_BUILD("Android build properties"),
    ANDROID_PACKAGE_MANAGER("Android PackageManager, this package only"),
    APP_SETTINGS("KNOUX Crypt settings, stored locally"),
    APP_UNLOCK_ENROLMENT("KNOUX Crypt unlock enrolment state"),
    APP_ROTATION_INVENTORY("KNOUX Crypt vault key inventory"),
    APP_VAULT_RECORDS("KNOUX Crypt encrypted record metadata"),
    APP_SECURITY_EVENTS("KNOUX Crypt local security timeline"),
    APP_BUILD("KNOUX Crypt build configuration"),
}

data class AdvisorFinding(
    val check: AdvisorCheckId,
    val status: AdvisorStatus,
    val source: AdvisorSource,
    /** Non-secret tokens such as `autoLockSeconds=300`. Never a secret, path or record title. */
    val evidence: List<String> = emptyList(),
) {
    init {
        evidence.forEach { token ->
            require(token.length <= 96) { "Evidence token is unreasonably long" }
            require(!token.contains("://")) { "Evidence must not carry a URL" }
        }
    }
}

/** The three summary tiles the reference shows above the check list. */
data class AdvisorReadiness(
    val screenLock: AdvisorStatus,
    val patchState: AdvisorStatus,
    val recovery: AdvisorStatus,
)

data class AdvisorReport(
    val findings: List<AdvisorFinding>,
    val readiness: AdvisorReadiness,
    val generatedAt: Long,
    val dismissed: Set<AdvisorCheckId>,
) {
    val warningCount: Int get() = findings.count { it.status == AdvisorStatus.WARN }
    val advisoryCount: Int get() = findings.count { it.status == AdvisorStatus.ADVISORY }
    val unavailableCount: Int get() = findings.count { it.status == AdvisorStatus.UNAVAILABLE }
    val passCount: Int get() = findings.count { it.status == AdvisorStatus.PASS }
}

/**
 * The only Android-facing seam the advisor needs. Implemented in the app module
 * against real framework APIs; replaced by a fake in JVM tests so the rule logic
 * is genuinely exercised rather than mocked away.
 */
interface DeviceSignals {
    /** Null when the platform cannot answer, which must surface as UNAVAILABLE. */
    fun isDeviceSecure(): Boolean?

    /** `Build.VERSION.SECURITY_PATCH`, or null when absent. */
    fun securityPatch(): String?

    /** Permissions this app declares; other packages are deliberately not enumerated. */
    fun declaredPermissions(): List<String>
}

/** Persisted dismissals. Non-secret check codes only, so plain preferences are correct here. */
interface AdvisorDismissalStore {
    suspend fun dismissed(): Set<String>
    suspend fun dismiss(check: AdvisorCheckId)
    suspend fun restore(check: AdvisorCheckId)
    suspend fun clearAll()
}

class AdvisorUnavailableException(message: String) : IOException(message)

/**
 * Deterministic local rules over signals this app can actually read.
 *
 * Every rule states its own source and evidence, and a signal that cannot be read
 * is reported as [AdvisorStatus.UNAVAILABLE] rather than guessed at or counted as
 * a pass. Nothing here contacts a server, reads another app, or touches secret
 * content: the vault-dependent rules use record metadata counts only and require
 * a live [VaultAccess], otherwise they report unavailable.
 */
class SecurityAdvisorService(
    private val signals: DeviceSignals,
    /** Supplied by the app module from the real DataStore-backed repository, so the
     *  rule logic stays testable on the JVM without a Context. */
    private val settings: suspend () -> AppSettings,
    private val unlock: UnlockManager,
    private val rotation: VaultKeyRotationManager,
    private val events: SecurityEventRepository,
    private val secrets: SecretRepository,
    private val dismissals: AdvisorDismissalStore,
    private val alertWindowMillis: Long = 7L * 24 * 60 * 60 * 1000,
) {
    suspend fun run(access: VaultAccess?, nowMillis: Long = System.currentTimeMillis()): AdvisorReport {
        val current = settings()
        val findings = buildList {
            add(deviceLockScreen())
            add(patchLevel())
            add(permissions())
            add(recovery())
            add(autoLock(current))
            add(screenshotBlock(current))
            add(appSwitchMask(current))
            add(clipboardClear(current))
            add(lockOnScreenOff(current))
            add(keyVersion(access))
            add(unreadableRecords(access))
            add(recentAlerts(nowMillis))
            add(offlineByDesign())
        }
        val dismissedCodes = dismissals.dismissed()
        val readiness = AdvisorReadiness(
            screenLock = findings.first { it.check == AdvisorCheckId.DEVICE_LOCK_SCREEN }.status,
            patchState = findings.first { it.check == AdvisorCheckId.ANDROID_PATCH_LEVEL }.status,
            recovery = findings.first { it.check == AdvisorCheckId.ENCRYPTED_RECOVERY }.status,
        )
        return AdvisorReport(
            findings = findings,
            readiness = readiness,
            generatedAt = nowMillis,
            dismissed = AdvisorCheckId.entries.filter { it.code in dismissedCodes }.toSet(),
        )
    }

    suspend fun dismiss(check: AdvisorCheckId) = dismissals.dismiss(check)

    suspend fun restore(check: AdvisorCheckId) = dismissals.restore(check)

    private fun deviceLockScreen(): AdvisorFinding {
        val secure = signals.isDeviceSecure()
        return AdvisorFinding(
            check = AdvisorCheckId.DEVICE_LOCK_SCREEN,
            status = when (secure) {
                true -> AdvisorStatus.PASS
                false -> AdvisorStatus.WARN
                null -> AdvisorStatus.UNAVAILABLE
            },
            source = AdvisorSource.ANDROID_KEYGUARD,
            evidence = when (secure) {
                null -> listOf("keyguard=unavailable")
                else -> listOf("keyguardSecure=$secure")
            },
        )
    }

    /**
     * The patch string is shown, not judged. Deciding whether a patch level is
     * current requires a reference list the app does not ship and cannot fetch
     * without a network call, so claiming currency would be an unsupported claim.
     */
    private fun patchLevel(): AdvisorFinding {
        val patch = signals.securityPatch()?.trim()?.takeIf { it.isNotEmpty() }
        return AdvisorFinding(
            check = AdvisorCheckId.ANDROID_PATCH_LEVEL,
            status = if (patch == null) AdvisorStatus.UNAVAILABLE else AdvisorStatus.INFO,
            source = AdvisorSource.ANDROID_BUILD,
            evidence = if (patch == null) {
                listOf("securityPatch=absent")
            } else {
                listOf("securityPatch=$patch", "judgedByApp=false", "needsExternalReference=true")
            },
        )
    }

    private fun permissions(): AdvisorFinding {
        val declared = signals.declaredPermissions().sorted()
        return AdvisorFinding(
            check = AdvisorCheckId.APP_PERMISSIONS,
            status = if (declared.isEmpty()) AdvisorStatus.UNAVAILABLE else AdvisorStatus.INFO,
            source = AdvisorSource.ANDROID_PACKAGE_MANAGER,
            evidence = buildList {
                add("declaredCount=${declared.size}")
                declared.forEach { add("declared=${it.substringAfterLast('.')}") }
                add("otherAppsEnumerated=false")
            }.take(8),
        )
    }

    private suspend fun recovery(): AdvisorFinding {
        val configured = runCatching { unlock.isConfigured() }.getOrNull()
        val reason = runCatching { unlock.recoveryReason() }.getOrNull()
        return AdvisorFinding(
            check = AdvisorCheckId.ENCRYPTED_RECOVERY,
            status = when {
                configured == null -> AdvisorStatus.UNAVAILABLE
                !configured -> AdvisorStatus.ADVISORY
                reason != null -> AdvisorStatus.WARN
                else -> AdvisorStatus.PASS
            },
            source = AdvisorSource.APP_UNLOCK_ENROLMENT,
            evidence = buildList {
                add("unlockEnrolled=$configured")
                // The reason is a fixed code from the unlock layer, never user content.
                add("recoveryReason=${reason?.take(32) ?: "none"}")
                add("backupTransferTested=false")
            },
        )
    }

    private fun autoLock(settings: AppSettings): AdvisorFinding {
        val seconds = settings.autoLockSeconds
        val status = when {
            seconds <= SessionPrivacyPolicy.DEFAULT_AUTO_LOCK_SECONDS -> AdvisorStatus.PASS
            seconds >= SessionPrivacyPolicy.AUTO_LOCK_CHOICES_SECONDS.max() -> AdvisorStatus.ADVISORY
            else -> AdvisorStatus.INFO
        }
        return AdvisorFinding(
            check = AdvisorCheckId.VAULT_AUTO_LOCK,
            status = status,
            source = AdvisorSource.APP_SETTINGS,
            evidence = listOf(
                "autoLockSeconds=$seconds",
                "default=${SessionPrivacyPolicy.DEFAULT_AUTO_LOCK_SECONDS}",
                "choices=${SessionPrivacyPolicy.AUTO_LOCK_CHOICES_SECONDS.joinToString("-")}",
            ),
        )
    }

    private fun screenshotBlock(settings: AppSettings): AdvisorFinding = AdvisorFinding(
        check = AdvisorCheckId.SCREENSHOT_BLOCK,
        status = if (settings.blockScreenshots) AdvisorStatus.PASS else AdvisorStatus.ADVISORY,
        source = AdvisorSource.APP_SETTINGS,
        evidence = listOf(
            "blockScreenshots=${settings.blockScreenshots}",
            "mechanism=FLAG_SECURE",
            "defeatsRootedOrScreenRecorder=false",
        ),
    )

    private fun appSwitchMask(settings: AppSettings): AdvisorFinding = AdvisorFinding(
        check = AdvisorCheckId.APP_SWITCH_MASK,
        status = if (settings.maskOnAppSwitch) AdvisorStatus.PASS else AdvisorStatus.ADVISORY,
        source = AdvisorSource.APP_SETTINGS,
        evidence = listOf("maskOnAppSwitch=${settings.maskOnAppSwitch}"),
    )

    private fun clipboardClear(settings: AppSettings): AdvisorFinding {
        val seconds = settings.clipboardClearSeconds
        return AdvisorFinding(
            check = AdvisorCheckId.CLIPBOARD_CLEAR,
            status = when {
                seconds == 0 -> AdvisorStatus.WARN
                seconds <= SessionPrivacyPolicy.DEFAULT_CLIPBOARD_SECONDS -> AdvisorStatus.PASS
                else -> AdvisorStatus.ADVISORY
            },
            source = AdvisorSource.APP_SETTINGS,
            evidence = listOf(
                "clipboardClearSeconds=$seconds",
                "neverClears=${seconds == 0}",
                "choices=${SessionPrivacyPolicy.CLIPBOARD_CHOICES_SECONDS.joinToString("-")}",
            ),
        )
    }

    private fun lockOnScreenOff(settings: AppSettings): AdvisorFinding = AdvisorFinding(
        check = AdvisorCheckId.LOCK_ON_SCREEN_OFF,
        status = if (settings.lockOnScreenOff) AdvisorStatus.PASS else AdvisorStatus.ADVISORY,
        source = AdvisorSource.APP_SETTINGS,
        evidence = listOf("lockOnScreenOff=${settings.lockOnScreenOff}"),
    )

    private suspend fun keyVersion(access: VaultAccess?): AdvisorFinding {
        if (access == null) {
            return AdvisorFinding(
                check = AdvisorCheckId.KEY_VERSION,
                status = AdvisorStatus.UNAVAILABLE,
                source = AdvisorSource.APP_ROTATION_INVENTORY,
                evidence = listOf("reason=vaultLocked"),
            )
        }
        val inventory = runCatching { rotation.inventory(access) }.getOrNull()
            ?: return AdvisorFinding(
                check = AdvisorCheckId.KEY_VERSION,
                status = AdvisorStatus.UNAVAILABLE,
                source = AdvisorSource.APP_ROTATION_INVENTORY,
                evidence = listOf("reason=inventoryFailed"),
            )
        val legacy = inventory.versionCounts[LEGACY_ROOT_KEY_VERSION] ?: 0
        val journalOpen = inventory.journal != null
        return AdvisorFinding(
            check = AdvisorCheckId.KEY_VERSION,
            status = when {
                journalOpen -> AdvisorStatus.WARN
                legacy > 0 -> AdvisorStatus.ADVISORY
                else -> AdvisorStatus.PASS
            },
            source = AdvisorSource.APP_ROTATION_INVENTORY,
            evidence = listOf(
                "activeVersion=${inventory.activeVersion}",
                "totalRecords=${inventory.totalRows}",
                "rootKeyRecords=$legacy",
                "rotationInProgress=$journalOpen",
            ),
        )
    }

    private suspend fun unreadableRecords(access: VaultAccess?): AdvisorFinding {
        if (access == null) {
            return AdvisorFinding(
                check = AdvisorCheckId.UNREADABLE_RECORDS,
                status = AdvisorStatus.UNAVAILABLE,
                source = AdvisorSource.APP_VAULT_RECORDS,
                evidence = listOf("reason=vaultLocked"),
            )
        }
        val counts = runCatching {
            SECRET_KINDS_COUNTED.flatMap { kind -> secrets.list(access, kind) }
        }.getOrNull()
            ?: return AdvisorFinding(
                check = AdvisorCheckId.UNREADABLE_RECORDS,
                status = AdvisorStatus.UNAVAILABLE,
                source = AdvisorSource.APP_VAULT_RECORDS,
                evidence = listOf("reason=listingFailed"),
            )
        val broken = counts.count { it.decryptionFailed }
        return AdvisorFinding(
            check = AdvisorCheckId.UNREADABLE_RECORDS,
            status = when {
                broken > 0 -> AdvisorStatus.WARN
                else -> AdvisorStatus.PASS
            },
            source = AdvisorSource.APP_VAULT_RECORDS,
            evidence = listOf("records=${counts.size}", "undecryptable=$broken"),
        )
    }

    private suspend fun recentAlerts(nowMillis: Long): AdvisorFinding {
        val rows = runCatching { events.observe().first() }.getOrNull()
            ?: return AdvisorFinding(
                check = AdvisorCheckId.RECENT_ALERTS,
                status = AdvisorStatus.UNAVAILABLE,
                source = AdvisorSource.APP_SECURITY_EVENTS,
                evidence = listOf("reason=timelineUnavailable"),
            )
        val cutoff = nowMillis - alertWindowMillis
        val alerts = rows.filter { it.severity == SecurityEventSeverity.ALERT.code && it.createdAt >= cutoff }
        return AdvisorFinding(
            check = AdvisorCheckId.RECENT_ALERTS,
            status = if (alerts.isEmpty()) AdvisorStatus.PASS else AdvisorStatus.INFO,
            source = AdvisorSource.APP_SECURITY_EVENTS,
            evidence = listOf(
                "windowDays=${alertWindowMillis / (24L * 60 * 60 * 1000)}",
                "alertCount=${alerts.size}",
                // Action codes only; the timeline already excludes secret content.
                "kinds=${alerts.map { it.action }.distinct().sorted().joinToString(",").take(80)}",
            ).filter { it.length <= 96 },
        )
    }

    private fun offlineByDesign(): AdvisorFinding = AdvisorFinding(
        check = AdvisorCheckId.OFFLINE_BY_DESIGN,
        status = AdvisorStatus.INFO,
        source = AdvisorSource.APP_BUILD,
        evidence = listOf(
            "networkUsed=false",
            "installedAppsScanned=false",
            "intrusionDetection=false",
            "malwareScan=false",
        ),
    )

    private companion object {
        const val LEGACY_ROOT_KEY_VERSION = 0
        val SECRET_KINDS_COUNTED = listOf(
            SecretKinds.NOTE,
            SecretKinds.PASSWORD,
            SecretKinds.TOTP,
            SecretKinds.MEDIA,
            SecretKinds.COLLECTION,
        )
    }
}
