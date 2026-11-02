package com.knoux.crypt.data

import java.util.UUID

data class NoteDocument(
    val recordId: String,
    val payload: NotePayload,
    val updatedAt: Long,
)

data class NoteDraftDocument(
    val recordId: String,
    val payload: NoteDraftPayload,
    val updatedAt: Long,
)

/**
 * What the editor opens. [conflict] means a draft exists but the canonical note
 * changed after that draft was based; the caller must not silently overwrite it.
 */
data class NoteOpenSnapshot(
    val noteId: String,
    val note: NoteDocument?,
    val draft: NoteDraftDocument?,
    val conflict: Boolean,
)

sealed interface NoteCommitResult {
    data class Committed(
        val noteId: String,
        val updatedAt: Long,
        val payload: NotePayload,
    ) : NoteCommitResult

    data class Conflict(val currentUpdatedAt: Long) : NoteCommitResult
    data class Rejected(val message: String) : NoteCommitResult
}

class NoteUnreadableException(message: String) : Exception(message)

/**
 * Encrypted notes editor service (TASK 07).
 *
 * Existing note records are KNC1/KNC2 `NotePayload` JSON. New fields (category,
 * revisions) have defaults, so old records decode unchanged. Autosave writes a
 * separate `note_draft` vault record; no plaintext file, DataStore entry or
 * Compose saved state contains note content. Commits use the note row timestamp
 * as an optimistic revision token and append the previous committed body to the
 * bounded encrypted revision history.
 */
class NotesEditorService(
    private val session: SessionManager,
    private val secrets: SecretRepository,
) {
    companion object {
        const val MAX_TITLE_CHARS = 300
        const val MAX_BODY_CHARS = 1_000_000
    }

    fun newNoteId(): String = UUID.randomUUID().toString()

    fun draftRecordId(noteId: String): String = NoteDraftIds.forNote(noteId)

    suspend fun open(access: VaultAccess, noteId: String): NoteOpenSnapshot {
        session.requireValid(access)
        val record = secrets.find(access, noteId)
        val note = when {
            record == null -> null
            record.kind != SecretKinds.NOTE -> null
            record.decryptionFailed -> throw NoteUnreadableException(
                "The note could not be decrypted with the current key",
            )
            else -> {
                val payload = SecretsJson.decodeNote(record.payloadJson)
                    ?: throw NoteUnreadableException("The note payload is malformed")
                NoteDocument(record.id, payload, record.updatedAt)
            }
        }
        val draftRecord = secrets.find(access, draftRecordId(noteId))
        val draft = draftRecord?.takeIf { it.kind == SecretKinds.NOTE_DRAFT && !it.decryptionFailed }
            ?.let { SecretsJson.decodeDraft(it.payloadJson) }
            ?.let { NoteDraftDocument(draftRecord.id, it, draftRecord.updatedAt) }
        val conflict = note != null && draft != null && draft.payload.baseUpdatedAt != note.updatedAt
        return NoteOpenSnapshot(noteId, note, draft, conflict)
    }

    suspend fun saveDraft(
        access: VaultAccess,
        noteId: String,
        title: String,
        body: String,
        category: String,
        baseUpdatedAt: Long,
    ): NoteDraftDocument {
        session.requireValid(access)
        require(title.length <= MAX_TITLE_CHARS) { "The note title is too long" }
        require(body.length <= MAX_BODY_CHARS) { "The note body is too large" }
        val now = System.currentTimeMillis()
        val payload = NoteDraftPayload(
            noteId = noteId,
            title = title,
            body = body,
            category = category.take(80),
            baseUpdatedAt = baseUpdatedAt,
            savedAt = now,
        )
        val recordId = draftRecordId(noteId)
        secrets.save(access, SecretKinds.NOTE_DRAFT, recordId, SecretsJson.encodeDraft(payload))
        return NoteDraftDocument(recordId, payload, now)
    }

    suspend fun discardDraft(access: VaultAccess, noteId: String) {
        session.requireValid(access)
        secrets.delete(access, draftRecordId(noteId))
    }

    suspend fun drafts(access: VaultAccess): List<NoteDraftDocument> = secrets
        .list(access, SecretKinds.NOTE_DRAFT)
        .mapNotNull { record ->
            if (record.decryptionFailed) return@mapNotNull null
            SecretsJson.decodeDraft(record.payloadJson)?.let {
                NoteDraftDocument(record.id, it, record.updatedAt)
            }
        }
        .sortedByDescending { it.payload.savedAt }

    suspend fun history(access: VaultAccess, noteId: String): List<NoteRevision> {
        session.requireValid(access)
        val record = secrets.find(access, noteId) ?: return emptyList()
        if (record.kind != SecretKinds.NOTE || record.decryptionFailed) return emptyList()
        return SecretsJson.decodeNote(record.payloadJson)?.revisions.orEmpty()
    }

    /**
     * Commits with optimistic concurrency. A stale [expectedUpdatedAt] returns
     * [NoteCommitResult.Conflict] and leaves both the note and draft untouched.
     */
    suspend fun commit(
        access: VaultAccess,
        noteId: String,
        expectedUpdatedAt: Long,
        title: String,
        body: String,
        category: String,
    ): NoteCommitResult {
        session.requireValid(access)
        if (title.length > MAX_TITLE_CHARS) {
            return NoteCommitResult.Rejected("The title exceeds $MAX_TITLE_CHARS characters")
        }
        if (body.length > MAX_BODY_CHARS) {
            return NoteCommitResult.Rejected("The note body is too large")
        }
        val current = secrets.find(access, noteId)
        if (current != null) {
            if (current.kind != SecretKinds.NOTE) {
                return NoteCommitResult.Rejected("This record is not a note")
            }
            if (current.decryptionFailed) {
                return NoteCommitResult.Rejected("The existing note is unreadable and was not overwritten")
            }
            if (current.updatedAt != expectedUpdatedAt) {
                return NoteCommitResult.Conflict(current.updatedAt)
            }
        } else if (expectedUpdatedAt != 0L) {
            return NoteCommitResult.Rejected("The note no longer exists; reopen the draft before saving")
        }
        val previous = current?.let { SecretsJson.decodeNote(it.payloadJson) }
        val revisions = if (current != null && previous != null) {
            (listOf(
                NoteRevision(
                    savedAt = current.updatedAt,
                    title = previous.title,
                    body = previous.body,
                    category = previous.category,
                ),
            ) + previous.revisions).take(NoteRevisions.MAX_ENTRIES)
        } else {
            emptyList()
        }
        val payload = NotePayload(
            title = title,
            body = body,
            category = category.take(80),
            revisions = revisions,
        )
        return when (
            val outcome = secrets.saveIfUnchanged(
                access = access,
                kind = SecretKinds.NOTE,
                id = noteId,
                expectedUpdatedAt = expectedUpdatedAt,
                payloadJson = SecretsJson.encodeNote(payload),
                allowCreate = true,
            )
        ) {
            SaveOutcome.Saved -> {
                discardDraft(access, noteId)
                val updatedAt = secrets.find(access, noteId)?.updatedAt ?: System.currentTimeMillis()
                NoteCommitResult.Committed(noteId, updatedAt, payload)
            }

            is SaveOutcome.Conflict -> NoteCommitResult.Conflict(outcome.currentUpdatedAt)
            SaveOutcome.Missing -> NoteCommitResult.Rejected("The note no longer exists")
        }
    }

    suspend fun delete(access: VaultAccess, noteId: String) {
        session.requireValid(access)
        secrets.delete(access, noteId)
        discardDraft(access, noteId)
    }
}