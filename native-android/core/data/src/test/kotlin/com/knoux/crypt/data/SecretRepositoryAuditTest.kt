package com.knoux.crypt.data

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Proves that real repository boundaries emit typed, privacy-safe outcomes. */
class SecretRepositoryAuditTest {
    private class CollectingSink : SecurityAuditSink {
        val events = mutableListOf<SecurityAuditEvent>()
        override suspend fun record(event: SecurityAuditEvent) { events += event }
    }

    private fun repository(vault: TestVault, sink: SecurityAuditSink): SecretRepository =
        SecretRepository(
            vault.dao,
            vault.session,
            VaultKeyManager(vault.session, TestKeyRegistry()),
            sink,
        )

    @Test
    fun saveEmitsOnlyNonSecretMetadata() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val sink = CollectingSink()
        val repo = repository(vault, sink)
        repo.save(vault.access()!!, SecretKinds.NOTE, null, """{"title":"top secret title","body":"payload"}""")
        val event = sink.events.single()
        assertEquals(SecurityEventAction.DATA_WRITTEN, event.action)
        assertTrue(event.detail.contains("kind=note"))
        assertFalse(event.detail.contains("top secret"))
        assertFalse(event.detail.contains("payload"))
    }

    @Test
    fun saveFailureEmitsFailureAndPropagates() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val sink = CollectingSink()
        val failingDao = object : SecretDao by vault.dao {
            override suspend fun upsert(entity: SecretEntity) = throw IllegalStateException("disk full")
        }
        val repo = SecretRepository(
            failingDao,
            vault.session,
            VaultKeyManager(vault.session, TestKeyRegistry()),
            sink,
        )
        val thrown = runCatching {
            repo.save(vault.access()!!, SecretKinds.PASSWORD, null, "{}")
        }.exceptionOrNull()
        assertTrue(thrown is IllegalStateException)
        assertEquals(SecurityEventAction.DATA_WRITE_FAILED, sink.events.single().action)
    }

    @Test
    fun checkedSaveDetectsStaleRevisionAndPreservesNewerRow() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val repo = repository(vault, NoopSecurityAuditSink)
        val access = vault.access()!!
        val id = repo.save(access, SecretKinds.NOTE, null, """{"title":"one","body":""}""")
        val firstRevision = repo.find(access, id)!!.updatedAt

        assertEquals(
            SaveOutcome.Saved,
            repo.saveIfUnchanged(access, SecretKinds.NOTE, id, firstRevision, """{"title":"two","body":""}"""),
        )
        val secondRevision = repo.find(access, id)!!.updatedAt
        assertTrue(secondRevision > firstRevision)

        val stale = repo.saveIfUnchanged(
            access,
            SecretKinds.NOTE,
            id,
            firstRevision,
            """{"title":"stale overwrite","body":""}""",
        )
        assertTrue(stale is SaveOutcome.Conflict)
        assertEquals(secondRevision, (stale as SaveOutcome.Conflict).currentUpdatedAt)
        assertEquals("two", SecretsJson.decodeNote(repo.find(access, id)!!.payloadJson)?.title)
    }

    @Test
    fun checkedSaveReportsMissingRecord() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val repo = repository(vault, NoopSecurityAuditSink)
        assertEquals(
            SaveOutcome.Missing,
            repo.saveIfUnchanged(vault.access()!!, SecretKinds.NOTE, "absent", 0L, "{}"),
        )
    }

    @Test
    fun deleteEmitsOutcomeWithoutRecordIdentity() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val sink = CollectingSink()
        val repo = repository(vault, sink)
        val access = vault.access()!!
        val id = repo.save(access, SecretKinds.NOTE, null, "{}")
        sink.events.clear()
        repo.delete(access, id)
        val event = sink.events.single()
        assertEquals(SecurityEventAction.DATA_DELETED, event.action)
        assertFalse(event.detail.contains(id))
    }
}
