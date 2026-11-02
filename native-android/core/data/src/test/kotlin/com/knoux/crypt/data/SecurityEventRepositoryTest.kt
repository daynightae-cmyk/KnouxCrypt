package com.knoux.crypt.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SecurityEventRepositoryTest {
    private class FakeDao : SecurityEventDao {
        // SharedFlow (not StateFlow) so two rapid inserts are delivered in order
        // instead of being conflated into the latest value.
        val rows = MutableSharedFlow<List<SecurityEventEntity>>(replay = 1, extraBufferCapacity = 64)

        init {
            rows.tryEmit(emptyList())
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

        override suspend fun clear() { publish(emptyList()) }

        override suspend fun clearOlderThan(before: Long) {
            publish(rows.replayCache.last().filterNot { it.createdAt < before })
        }

        override suspend fun trimToMostRecent(keep: Int) {
            publish(all().take(keep))
        }

        override suspend fun recent(limit: Int): List<SecurityEventEntity> = all().take(limit)

        /** Emits only real changes so duplicate no-op trims cannot confuse a collector. */
        private suspend fun publish(list: List<SecurityEventEntity>) {
            val next = sorted(list)
            if (next != rows.replayCache.last()) rows.emit(next)
        }

        private fun sorted(list: List<SecurityEventEntity>): List<SecurityEventEntity> =
            list.sortedWith(compareByDescending<SecurityEventEntity> { it.createdAt }.thenByDescending { it.id })
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

    @Test
    fun typedProducerWritesStableCodes() = runBlocking {
        val repo = SecurityEventRepository(FakeDao())
        repo.record(SecurityAuditEvent(SecurityEventAction.UNLOCK_SUCCEEDED))
        val event = repo.list().first()
        assertEquals("ACCESS", event.category)
        assertEquals("UNLOCK_SUCCEEDED", event.action)
        assertEquals("INFO", event.severity)
    }

    @Test
    fun observationIsLiveAndReactsToInserts() = runBlocking {
        val dao = FakeDao()
        val repo = SecurityEventRepository(dao)
        val emissions = mutableListOf<Int>()
        val collector = launch {
            repo.observe("ALL").take(3).collect { emissions += it.size }
        }
        // Wait until the Room-style flow is actually subscribed before inserting,
        // so this test proves observation instead of racing a cold flow.
        withTimeout(5_000) {
            dao.rows.subscriptionCount.first { it > 0 }
        }
        repo.record(SecurityAuditEvent(SecurityEventAction.UNLOCK_SUCCEEDED))
        repo.record(SecurityAuditEvent(SecurityEventAction.SESSION_LOCKED))
        collector.join()
        assertEquals(listOf(0, 1, 2), emissions)
    }

    @Test
    fun retentionTrimsToPolicyBound() = runBlocking {
        val repo = SecurityEventRepository(FakeDao())
        val base = System.currentTimeMillis()
        repeat(SecurityActivityPolicy.MAX_RETAINED_EVENTS + 7) { index ->
            repo.record(
                category = "ACCESS",
                action = "EVENT_$index",
                now = base + index,
            )
        }
        assertEquals(SecurityActivityPolicy.MAX_RETAINED_EVENTS, repo.count())
        val newest = repo.list().first()
        assertEquals("EVENT_${SecurityActivityPolicy.MAX_RETAINED_EVENTS + 6}", newest.action)
    }

    @Test
    fun detailsAreBoundedAndPolicyIsExplicit() = runBlocking {
        val repo = SecurityEventRepository(FakeDao())
        repo.record("access", "LONG", "x".repeat(10_000), "INFO")
        assertEquals(SecurityActivityPolicy.MAX_DETAIL_CHARS, repo.list().first().detail.length)
        assertTrue(SecurityActivityPolicy.VISIBLE_WHILE_LOCKED)
        assertTrue(SecurityActivityPolicy.CLEAR_REQUIRES_UNLOCK)
        assertTrue(SecurityActivityPolicy.retentionCutoff() < System.currentTimeMillis())
    }
}
