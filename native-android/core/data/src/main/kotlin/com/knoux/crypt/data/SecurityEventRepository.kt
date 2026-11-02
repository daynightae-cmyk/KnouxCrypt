package com.knoux.crypt.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.util.UUID

/**
 * Local, non-secret security activity store (TASK 39).
 *
 * [observe] is backed by the DAO's Room Flow, so the timeline updates when a
 * producer writes an event or the user clears the store. It is not a one-shot
 * query disguised as a Flow.
 */
class SecurityEventRepository(private val dao: SecurityEventDao) : SecurityAuditSink {

    fun observe(category: String? = null): Flow<List<SecurityEvent>> {
        val rows = if (category.isNullOrBlank() || category.equals("ALL", ignoreCase = true)) {
            dao.observeAll()
        } else {
            dao.observeByCategory(category.trim().uppercase())
        }
        return rows
            .map { list -> list.map { it.toDomain() } }
            .flowOn(Dispatchers.IO)
    }

    suspend fun recent(limit: Int = 100): List<SecurityEvent> = withContext(Dispatchers.IO) {
        dao.recent(limit).map { it.toDomain() }
    }

    suspend fun list(category: String? = null): List<SecurityEvent> = withContext(Dispatchers.IO) {
        val rows = if (category.isNullOrBlank() || category.equals("ALL", ignoreCase = true)) {
            dao.all()
        } else {
            dao.byCategory(category.trim().uppercase())
        }
        rows.map { it.toDomain() }
    }

    /** Typed producer entry point. Enforces the retention bound after every write. */
    override suspend fun record(event: SecurityAuditEvent) {
        record(
            category = event.category,
            action = event.action.name,
            detail = event.detail,
            severity = event.severity,
        )
    }

    suspend fun record(
        category: String,
        action: String,
        detail: String = "",
        severity: String = "INFO",
        now: Long = System.currentTimeMillis(),
    ): String = withContext(Dispatchers.IO) {
        val id = UUID.randomUUID().toString()
        dao.insert(
            SecurityEventEntity(
                id = id,
                category = category.trim().uppercase().take(32).ifBlank { "GENERAL" },
                action = action.trim().take(80).ifBlank { "EVENT" },
                detail = detail.trim().take(SecurityActivityPolicy.MAX_DETAIL_CHARS),
                severity = severity.trim().uppercase().take(16).ifBlank { "INFO" },
                createdAt = now,
            ),
        )
        // Retention is enforced on append, not only on screen open. A failed trim
        // must not hide the event that was just recorded.
        runCatching { dao.clearOlderThan(SecurityActivityPolicy.retentionCutoff(now)) }
        runCatching { dao.trimToMostRecent(SecurityActivityPolicy.MAX_RETAINED_EVENTS) }
        id
    }

    suspend fun count(): Int = withContext(Dispatchers.IO) { dao.count() }

    /** Destructive and irreversible; callers must confirm and require an unlocked vault. */
    suspend fun clear() = withContext(Dispatchers.IO) { dao.clear() }

    suspend fun clearOlderThan(before: Long) = withContext(Dispatchers.IO) { dao.clearOlderThan(before) }
}
