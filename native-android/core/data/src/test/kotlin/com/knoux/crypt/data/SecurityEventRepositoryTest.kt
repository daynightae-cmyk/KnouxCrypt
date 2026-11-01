package com.knoux.crypt.data

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SecurityEventRepositoryTest {
    private class FakeDao : SecurityEventDao {
        private val rows = mutableListOf<SecurityEventEntity>()
        override suspend fun all(): List<SecurityEventEntity> = rows.sortedByDescending { it.createdAt }
        override suspend fun byCategory(category: String): List<SecurityEventEntity> =
            rows.filter { it.category == category }.sortedByDescending { it.createdAt }
        override suspend fun count(): Int = rows.size
        override suspend fun insert(entity: SecurityEventEntity) { rows += entity }
        override suspend fun clear() { rows.clear() }
        override suspend fun clearOlderThan(before: Long) { rows.removeAll { it.createdAt < before } }
        override suspend fun recent(limit: Int): List<SecurityEventEntity> = all().take(limit)
    }

    @Test
    fun recordsAndFiltersEvents() = runBlocking {
        val repo = SecurityEventRepository(FakeDao())
        repo.record("access", "UNLOCK", "ok", "INFO")
        repo.record("privacy", "LOCK", "manual", "INFO")
        assertEquals(2, repo.count())
        assertEquals(1, repo.list("ACCESS").size)
        assertEquals(2, repo.list("ALL").size)
        repo.clear()
        assertEquals(0, repo.count())
    }

    @Test
    fun normalizesCategoryAndAction() = runBlocking {
        val repo = SecurityEventRepository(FakeDao())
        val id = repo.record("  ", "", "", "")
        assertTrue(id.isNotBlank())
        val event = repo.list().first()
        assertEquals("GENERAL", event.category)
        assertEquals("EVENT", event.action)
        assertEquals("INFO", event.severity)
    }
}
