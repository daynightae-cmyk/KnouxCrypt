package com.knoux.crypt.data

import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

/**
 * Typed, privacy-safe security activity (TASK 39).
 *
 * Producers live at authoritative service boundaries (unlock, session lock, key
 * rotation, vault mutations, media operations, share). The values below are
 * stable storage codes, never user content. A detail string may carry a bounded
 * non-secret token such as a record kind or a count; it must never contain
 * secrets, ciphertext, keys, OTP seeds, file contents, full paths or credentials.
 */
enum class SecurityEventCategory(val code: String) {
    ACCESS("ACCESS"),
    KEY("KEY"),
    DATA("DATA"),
    PRIVACY("PRIVACY"),
    TRANSFER("TRANSFER"),
}

enum class SecurityEventSeverity(val code: String) {
    INFO("INFO"),
    NOTICE("NOTICE"),
    ALERT("ALERT"),
}

/** Fixed action catalog. Adding an action is an explicit, reviewable change. */
enum class SecurityEventAction(
    val category: SecurityEventCategory,
    val severity: SecurityEventSeverity,
) {
    UNLOCK_ENROLLED(SecurityEventCategory.ACCESS, SecurityEventSeverity.NOTICE),
    UNLOCK_SUCCEEDED(SecurityEventCategory.ACCESS, SecurityEventSeverity.INFO),
    UNLOCK_REJECTED(SecurityEventCategory.ACCESS, SecurityEventSeverity.ALERT),
    UNLOCK_FAILED(SecurityEventCategory.ACCESS, SecurityEventSeverity.ALERT),
    UNLOCK_CANCELLED(SecurityEventCategory.ACCESS, SecurityEventSeverity.INFO),
    UNLOCK_GATE_INVALIDATED(SecurityEventCategory.ACCESS, SecurityEventSeverity.ALERT),
    SESSION_LOCKED(SecurityEventCategory.ACCESS, SecurityEventSeverity.INFO),
    GATE_ROTATED(SecurityEventCategory.ACCESS, SecurityEventSeverity.NOTICE),
    GATE_ROTATION_FAILED(SecurityEventCategory.ACCESS, SecurityEventSeverity.ALERT),
    GATE_ROTATION_CANCELLED(SecurityEventCategory.ACCESS, SecurityEventSeverity.INFO),
    OWNER_REVERIFIED(SecurityEventCategory.ACCESS, SecurityEventSeverity.INFO),

    KEY_ROTATION_STARTED(SecurityEventCategory.KEY, SecurityEventSeverity.NOTICE),
    KEY_ROTATION_RESUMED(SecurityEventCategory.KEY, SecurityEventSeverity.NOTICE),
    KEY_ROTATION_COMPLETED(SecurityEventCategory.KEY, SecurityEventSeverity.NOTICE),
    KEY_ROTATION_CANCELLED(SecurityEventCategory.KEY, SecurityEventSeverity.INFO),
    KEY_ROTATION_FAILED(SecurityEventCategory.KEY, SecurityEventSeverity.ALERT),

    DATA_WRITTEN(SecurityEventCategory.DATA, SecurityEventSeverity.INFO),
    DATA_WRITE_FAILED(SecurityEventCategory.DATA, SecurityEventSeverity.ALERT),
    DATA_WRITE_CANCELLED(SecurityEventCategory.DATA, SecurityEventSeverity.INFO),
    DATA_DELETED(SecurityEventCategory.DATA, SecurityEventSeverity.NOTICE),
    DATA_DELETE_FAILED(SecurityEventCategory.DATA, SecurityEventSeverity.ALERT),
    DATA_DELETE_CANCELLED(SecurityEventCategory.DATA, SecurityEventSeverity.INFO),
    DATA_UNREADABLE(SecurityEventCategory.DATA, SecurityEventSeverity.ALERT),

    MEDIA_IMPORTED(SecurityEventCategory.DATA, SecurityEventSeverity.INFO),
    MEDIA_IMPORT_CANCELLED(SecurityEventCategory.DATA, SecurityEventSeverity.INFO),
    MEDIA_IMPORT_FAILED(SecurityEventCategory.DATA, SecurityEventSeverity.ALERT),
    MEDIA_DELETED(SecurityEventCategory.DATA, SecurityEventSeverity.NOTICE),
    MEDIA_EXPORTED(SecurityEventCategory.DATA, SecurityEventSeverity.NOTICE),
    MEDIA_EXPORT_FAILED(SecurityEventCategory.DATA, SecurityEventSeverity.ALERT),
    MEDIA_OPENED(SecurityEventCategory.DATA, SecurityEventSeverity.INFO),

    PRIVACY_SETTING_CHANGED(SecurityEventCategory.PRIVACY, SecurityEventSeverity.NOTICE),

    SHARE_SEALED(SecurityEventCategory.TRANSFER, SecurityEventSeverity.NOTICE),
    SHARE_OPENED(SecurityEventCategory.TRANSFER, SecurityEventSeverity.INFO),
    SHARE_FAILED(SecurityEventCategory.TRANSFER, SecurityEventSeverity.ALERT),
}

data class SecurityAuditEvent(
    val action: SecurityEventAction,
    val detail: String = "",
) {
    init {
        require(detail.length <= SecurityActivityPolicy.MAX_DETAIL_CHARS) {
            "Audit detail exceeds the privacy bound"
        }
    }

    val category: String get() = action.category.code
    val severity: String get() = action.severity.code
}

/** Implemented by the Room-backed repository; producers may use a no-op in tests. */
interface SecurityAuditSink {
    suspend fun record(event: SecurityAuditEvent)
}

object NoopSecurityAuditSink : SecurityAuditSink {
    override suspend fun record(event: SecurityAuditEvent) = Unit
}

/**
 * Audit must never fail the operation it describes. This wrapper also protects
 * the write from caller cancellation so a lock/cancel can still leave a truthful
 * outcome line when the operation itself completed.
 */
suspend fun SecurityAuditSink.recordSafely(event: SecurityAuditEvent) {
    withContext(NonCancellable) {
        runCatching { record(event) }
    }
}

/**
 * Intentional retention/privacy policy for the local timeline.
 *
 * - The timeline is non-secret and is visible while the vault is locked so the
 *   user can see session events (including a lock or a rejected unlock).
 * - Clearing is destructive and requires an unlocked vault capability.
 * - Retention is bounded: newest [MAX_RETAINED_EVENTS] within [RETENTION_DAYS].
 * - Details are bounded to [MAX_DETAIL_CHARS] and never carry user content.
 */
object SecurityActivityPolicy {
    const val MAX_RETAINED_EVENTS = 500
    const val RETENTION_DAYS = 90
    const val MAX_DETAIL_CHARS = 240
    const val VISIBLE_WHILE_LOCKED = true
    const val CLEAR_REQUIRES_UNLOCK = true

    fun retentionCutoff(nowMillis: Long = System.currentTimeMillis()): Long =
        nowMillis - RETENTION_DAYS * 24L * 60L * 60L * 1000L
}
