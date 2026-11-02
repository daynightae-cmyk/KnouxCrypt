package com.knoux.crypt.data

import kotlinx.serialization.Serializable

/**
 * A previous committed note body. Revisions are stored inside the same KNC2
 * ciphertext as the note itself; nothing is written to a plaintext cache.
 */
@Serializable
data class NoteRevision(
    val savedAt: Long,
    val title: String,
    val body: String,
    val category: String = "",
)

object NoteRevisions {
    /** Bounded so an autosaving editor cannot grow a record indefinitely. */
    const val MAX_ENTRIES = 20
}

/**
 * Encrypted autosave state for the Notes editor (TASK 07).
 *
 * Drafts are separate vault records (`note_draft`), never plaintext files or
 * Compose saved state. [baseUpdatedAt] is the note revision the draft was based
 * on, so a reopened draft can detect that the canonical note changed elsewhere.
 */
@Serializable
data class NoteDraftPayload(
    val noteId: String,
    val title: String,
    val body: String,
    val category: String = "",
    val baseUpdatedAt: Long,
    val savedAt: Long,
)

object NoteDraftIds {
    fun forNote(noteId: String): String = "knoux.note-draft.$noteId"
}