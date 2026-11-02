package com.knoux.crypt.data

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotesEditorServiceTest {
    private fun service(vault: TestVault): NotesEditorService =
        NotesEditorService(
            vault.session,
            SecretRepository(vault.dao, vault.session, VaultKeyManager(vault.session, TestKeyRegistry())),
        )

    @Test
    fun legacyNoteJsonStillDecodesAndFirstCommitAddsEncryptedRevision() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val editor = service(vault)
        val id = editor.newNoteId()
        // Legacy shape: only title/body, as written by the original Notes screen.
        vault.repository.save(access, SecretKinds.NOTE, id, """{"title":"old title","body":"old body"}""")

        val snapshot = editor.open(access, id)
        assertEquals("old title", snapshot.note?.payload?.title)
        assertEquals("", snapshot.note?.payload?.category)
        assertTrue(snapshot.note?.payload?.revisions.orEmpty().isEmpty())

        val result = editor.commit(access, id, snapshot.note!!.updatedAt, "new title", "new body", "Work / Projects")
        assertTrue(result is NoteCommitResult.Committed)
        val reopened = editor.open(access, id).note!!
        assertEquals("new title", reopened.payload.title)
        assertEquals("Work / Projects", reopened.payload.category)
        assertEquals(1, reopened.payload.revisions.size)
        assertEquals("old title", reopened.payload.revisions.single().title)
        assertEquals("old body", reopened.payload.revisions.single().body)
    }

    @Test
    fun draftIsEncryptedAndRecoverableForANewNote() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val editor = service(vault)
        val id = editor.newNoteId()
        editor.saveDraft(access, id, "draft title", "draft body", "Ideas", baseUpdatedAt = 0)
        assertTrue(vault.dao.rows.value.none { String(it.envelope, Charsets.ISO_8859_1).contains("draft title") })

        val opened = editor.open(access, id)
        assertNull(opened.note)
        assertNotNull(opened.draft)
        assertEquals("draft body", opened.draft?.payload?.body)
        assertFalse(opened.conflict)

        val committed = editor.commit(access, id, 0, "draft title", "draft body", "Ideas")
        assertTrue(committed is NoteCommitResult.Committed)
        assertNull(editor.open(access, id).draft)
        assertTrue(editor.drafts(access).isEmpty())
    }

    @Test
    fun staleDraftIsDetectedAsConflictAndStaleCommitIsRefused() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val editor = service(vault)
        val id = editor.newNoteId()
        val created = editor.commit(access, id, 0, "base", "base body", "") as NoteCommitResult.Committed
        editor.saveDraft(access, id, "local edit", "local body", "", created.updatedAt)

        // Another writer updates the canonical note first (for example a restored
        // revision or a second editor boundary). This must not touch the draft.
        vault.repository.save(
            access,
            SecretKinds.NOTE,
            id,
            SecretsJson.encodeNote("remote edit", "remote body"),
        )

        val snapshot = editor.open(access, id)
        assertTrue(snapshot.conflict)
        assertEquals("remote edit", snapshot.note?.payload?.title)
        assertEquals("local edit", snapshot.draft?.payload?.title)

        val stale = editor.commit(access, id, created.updatedAt, "local edit", "local body", "")
        assertTrue(stale is NoteCommitResult.Conflict)
        assertEquals("remote edit", editor.open(access, id).note?.payload?.title)
    }

    @Test
    fun revisionHistoryIsBounded() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val editor = service(vault)
        val id = editor.newNoteId()
        var revision = 0L
        repeat(NoteRevisions.MAX_ENTRIES + 6) { index ->
            val result = editor.commit(access, id, revision, "title $index", "body $index", "")
            assertTrue(result is NoteCommitResult.Committed)
            revision = (result as NoteCommitResult.Committed).updatedAt
        }
        val history = editor.history(access, id)
        assertEquals(NoteRevisions.MAX_ENTRIES, history.size)
        assertEquals("title ${NoteRevisions.MAX_ENTRIES + 4}", history.first().title)
        assertEquals("title ${NoteRevisions.MAX_ENTRIES + 5}", editor.open(access, id).note?.payload?.title)
    }

    @Test
    fun deleteRemovesNoteAndDraft() = runBlocking {
        val vault = TestVault()
        vault.enroll()
        val access = vault.access()!!
        val editor = service(vault)
        val id = editor.newNoteId()
        editor.commit(access, id, 0, "delete me", "body", "")
        editor.saveDraft(access, id, "unsaved", "body", "", 0)
        editor.delete(access, id)
        assertNull(editor.open(access, id).note)
        assertNull(editor.open(access, id).draft)
    }
}