package com.knoux.crypt.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.UUID

class SecurityEventRepository(private val dao: SecurityEventDao) {
    fun observe(category: String? = null): Flow<List<SecurityEvent>> = flow {
        val rows = if (category.isNullOrBlank() || category == "ALL") dao.all() else dao.byCategory(category)
        emit(rows.map { it.toDomain() })
    }.flowOn(Dispatchers.IO)

    suspend fun recent(limit: Int = 100): List<SecurityEvent> = withContext(Dispatchers.IO) {
        dao.recent(limit).map { it.toDomain() }
    }

    suspend fun list(category: String? = null): List<SecurityEvent> = withContext(Dispatchers.IO) {
        val rows = if (category.isNullOrBlank() || category.equals("ALL", ignoreCase = true)) {
            dao.all()
        } else {
            dao.byCategory(category)
        }
        rows.map { it.toDomain() }
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
                detail = detail.trim().take(240),
                severity = severity.trim().uppercase().take(16).ifBlank { "INFO" },
                createdAt = now,
            ),
        )
        id
    }

    suspend fun count(): Int = withContext(Dispatchers.IO) { dao.count() }

    suspend fun clear() = withContext(Dispatchers.IO) { dao.clear() }

    suspend fun clearOlderThan(before: Long) = withContext(Dispatchers.IO) { dao.clearOlderThan(before) }
}
