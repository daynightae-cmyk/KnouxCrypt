package com.knoux.crypt.ui

import android.app.Application
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.NoteCommitResult
import com.knoux.crypt.data.NoteDocument
import com.knoux.crypt.data.NoteDraftDocument
import com.knoux.crypt.data.NoteDraftPayload
import com.knoux.crypt.data.NoteOpenSnapshot
import com.knoux.crypt.data.NotePayload
import com.knoux.crypt.data.NoteRevision
import com.knoux.crypt.data.NotesEditorService
import com.knoux.crypt.data.SecretKinds
import com.knoux.crypt.data.SecretRecord
import com.knoux.crypt.data.SecretsJson
import com.knoux.crypt.data.VaultLockedException
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.LocalReducedMotion
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StagHero
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

enum class AutosaveStatus { IDLE, SAVING, SAVED, FAILED, LOCKED }

data class NotesEditorState(
    val noteId: String,
    val isNew: Boolean,
    val title: String,
    val body: String,
    val category: String,
    val baseUpdatedAt: Long,
    val revisions: List<NoteRevision>,
    val dirty: Boolean,
    val autosave: AutosaveStatus,
    val autosaveAt: Long?,
    val recoveredDraft: Boolean,
    val conflictDraft: NoteDraftPayload?,
    val canUndo: Boolean,
    val canRedo: Boolean,
)

data class NoteConflictState(val currentUpdatedAt: Long)

private data class NoteContent(val title: String, val body: String, val category: String)

private fun NotesEditorState.content(): NoteContent = NoteContent(title, body, category)

class NotesViewModel(
    application: Application,
    private val container: AppContainer,
) : AndroidViewModel(application) {
    private val secrets = container.secrets
    private val editorService = NotesEditorService(container.session, secrets)

    private val _notes = MutableStateFlow<List<SecretRecord>>(emptyList())
    val notes: StateFlow<List<SecretRecord>> = _notes.asStateFlow()
    private val _drafts = MutableStateFlow<List<NoteDraftDocument>>(emptyList())
    val drafts: StateFlow<List<NoteDraftDocument>> = _drafts.asStateFlow()
    private val _editor = MutableStateFlow<NotesEditorState?>(null)
    val editor: StateFlow<NotesEditorState?> = _editor.asStateFlow()
    private val _loadingEditor = MutableStateFlow(false)
    val loadingEditor: StateFlow<Boolean> = _loadingEditor.asStateFlow()
    private val _saving = MutableStateFlow(false)
    val saving: StateFlow<Boolean> = _saving.asStateFlow()
    private val _conflict = MutableStateFlow<NoteConflictState?>(null)
    val conflict: StateFlow<NoteConflictState?> = _conflict.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()
    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice.asStateFlow()

    private val undoStack = ArrayDeque<NoteContent>()
    private val redoStack = ArrayDeque<NoteContent>()
    private var lastUndoAt = 0L
    private var autosaveJob: Job? = null
    private var loadJob: Job? = null
    private val editorMutex = Mutex()

    init {
        viewModelScope.launch {
            container.session.unlocked.collectLatest { unlocked ->
                if (!unlocked) {
                    clearSensitiveState()
                    return@collectLatest
                }
                val access = container.session.currentAccess() ?: return@collectLatest
                try {
                    secrets.observe(access, SecretKinds.NOTE).collect { rows ->
                        _notes.value = rows
                        refreshDrafts(access)
                    }
                } catch (_: VaultLockedException) {
                    clearSensitiveState()
                } catch (failure: Throwable) {
                    _error.value = failure.message ?: "Could not load encrypted notes."
                }
            }
        }
    }

    fun payload(record: SecretRecord): NotePayload? = SecretsJson.decodeNote(record.payloadJson)

    fun openEditor(noteId: String?) {
        val access = container.session.currentAccess() ?: run {
            _error.value = "The vault is locked."
            return
        }
        loadJob?.cancel()
        if (noteId == null) {
            val id = editorService.newNoteId()
            resetEditor(
                NotesEditorState(
                    noteId = id,
                    isNew = true,
                    title = "",
                    body = "",
                    category = "",
                    baseUpdatedAt = 0,
                    revisions = emptyList(),
                    dirty = false,
                    autosave = AutosaveStatus.IDLE,
                    autosaveAt = null,
                    recoveredDraft = false,
                    conflictDraft = null,
                    canUndo = false,
                    canRedo = false,
                ),
            )
            return
        }
        _loadingEditor.value = true
        loadJob = viewModelScope.launch {
            try {
                _loadingEditor.value = true
                val snapshot = editorService.open(access, noteId)
                resetEditor(buildEditorState(access, snapshot))
            } catch (failure: Throwable) {
                _error.value = failure.message ?: "Could not open the encrypted note."
            } finally {
                _loadingEditor.value = false
            }
        }
    }

    private suspend fun buildEditorState(access: com.knoux.crypt.data.VaultAccess, snapshot: NoteOpenSnapshot): NotesEditorState {
        val note = snapshot.note
        val draft = snapshot.draft
        val base = note?.updatedAt ?: 0L
        val revisions = note?.payload?.revisions.orEmpty()
        if (note == null) {
            return if (draft != null) {
                NotesEditorState(
                    noteId = snapshot.noteId,
                    isNew = true,
                    title = draft.payload.title,
                    body = draft.payload.body,
                    category = draft.payload.category,
                    baseUpdatedAt = 0,
                    revisions = emptyList(),
                    dirty = true,
                    autosave = AutosaveStatus.SAVED,
                    autosaveAt = draft.payload.savedAt,
                    recoveredDraft = true,
                    conflictDraft = null,
                    canUndo = false,
                    canRedo = false,
                )
            } else {
                NotesEditorState(
                    noteId = snapshot.noteId,
                    isNew = true,
                    title = "",
                    body = "",
                    category = "",
                    baseUpdatedAt = 0,
                    revisions = emptyList(),
                    dirty = false,
                    autosave = AutosaveStatus.IDLE,
                    autosaveAt = null,
                    recoveredDraft = false,
                    conflictDraft = null,
                    canUndo = false,
                    canRedo = false,
                )
            }
        }
        val current = NotesEditorState(
            noteId = snapshot.noteId,
            isNew = false,
            title = note.payload.title,
            body = note.payload.body,
            category = note.payload.category,
            baseUpdatedAt = base,
            revisions = revisions,
            dirty = false,
            autosave = AutosaveStatus.IDLE,
            autosaveAt = null,
            recoveredDraft = false,
            conflictDraft = if (snapshot.conflict) draft?.payload else null,
            canUndo = false,
            canRedo = false,
        )
        if (draft == null || snapshot.conflict) return current
        val sameContent = draft.payload.title == note.payload.title &&
            draft.payload.body == note.payload.body &&
            draft.payload.category == note.payload.category
        if (sameContent) {
            runCatching { editorService.discardDraft(access, snapshot.noteId) }
            return current
        }
        return current.copy(
            title = draft.payload.title,
            body = draft.payload.body,
            category = draft.payload.category,
            dirty = true,
            autosave = AutosaveStatus.SAVED,
            autosaveAt = draft.payload.savedAt,
            recoveredDraft = true,
        )
    }

    fun updateTitle(value: String) {
        val current = _editor.value ?: return
        if (value == current.title) return
        pushUndo(current.content())
        _editor.value = current.copy(
            title = value,
            dirty = true,
            autosave = AutosaveStatus.SAVING,
            recoveredDraft = false,
        )
        scheduleAutosave()
    }

    fun updateBody(value: String) {
        val current = _editor.value ?: return
        if (value == current.body) return
        pushUndo(current.content())
        _editor.value = current.copy(
            body = value,
            dirty = true,
            autosave = AutosaveStatus.SAVING,
            recoveredDraft = false,
        )
        scheduleAutosave()
    }

    fun updateCategory(value: String) {
        val current = _editor.value ?: return
        if (value == current.category) return
        pushUndo(current.content())
        _editor.value = current.copy(category = value, dirty = true, autosave = AutosaveStatus.SAVING)
        scheduleAutosave()
    }

    fun undo() {
        val current = _editor.value ?: return
        val previous = undoStack.removeLastOrNull() ?: return
        redoStack.addLast(current.content())
        _editor.value = current.copy(
            title = previous.title,
            body = previous.body,
            category = previous.category,
            dirty = true,
            autosave = AutosaveStatus.SAVING,
            canUndo = undoStack.isNotEmpty(),
            canRedo = true,
            recoveredDraft = false,
        )
        scheduleAutosave()
    }

    fun redo() {
        val current = _editor.value ?: return
        val next = redoStack.removeLastOrNull() ?: return
        undoStack.addLast(current.content())
        _editor.value = current.copy(
            title = next.title,
            body = next.body,
            category = next.category,
            dirty = true,
            autosave = AutosaveStatus.SAVING,
            canUndo = true,
            canRedo = redoStack.isNotEmpty(),
            recoveredDraft = false,
        )
        scheduleAutosave()
    }

    fun restoreRevision(revision: NoteRevision) {
        val current = _editor.value ?: return
        pushUndo(current.content())
        _editor.value = current.copy(
            title = revision.title,
            body = revision.body,
            category = revision.category,
            dirty = true,
            autosave = AutosaveStatus.SAVING,
            canUndo = true,
            recoveredDraft = false,
        )
        scheduleAutosave()
        _notice.value = "A previous encrypted revision was loaded into the editor. Save to keep it."
    }

    fun commit() {
        val state = _editor.value ?: return
        val access = container.session.currentAccess() ?: run {
            _error.value = "The vault locked before saving."
            return
        }
        autosaveJob?.cancel()
        viewModelScope.launch {
            _saving.value = true
            try {
                val result = editorMutex.withLock {
                    editorService.commit(
                        access,
                        state.noteId,
                        state.baseUpdatedAt,
                        state.title,
                        state.body,
                        state.category,
                    )
                }
                handleCommitResult(result, state)
            } catch (failure: CancellationException) {
                throw failure
            } catch (failure: Throwable) {
                _error.value = failure.message ?: "The note could not be saved."
            } finally {
                _saving.value = false
            }
        }
    }

    fun resolveConflictOverwrite() {
        val state = _editor.value ?: return
        val access = container.session.currentAccess() ?: run {
            _error.value = "The vault locked before saving."
            return
        }
        viewModelScope.launch {
            _saving.value = true
            try {
                val latest = secrets.find(access, state.noteId)
                val result = editorMutex.withLock {
                    editorService.commit(
                        access,
                        state.noteId,
                        latest?.updatedAt ?: 0L,
                        state.title,
                        state.body,
                        state.category,
                    )
                }
                _conflict.value = null
                handleCommitResult(result, state)
            } catch (failure: CancellationException) {
                throw failure
            } catch (failure: Throwable) {
                _error.value = failure.message ?: "The note could not be saved."
            } finally {
                _saving.value = false
            }
        }
    }

    private fun handleCommitResult(result: NoteCommitResult, submitted: NotesEditorState) {
        when (result) {
            is NoteCommitResult.Committed -> {
                val current = _editor.value
                if (current != null && current.noteId == submitted.noteId) {
                    val stillSame = current.title == submitted.title &&
                        current.body == submitted.body &&
                        current.category == submitted.category
                    _editor.value = current.copy(
                        isNew = false,
                        baseUpdatedAt = result.updatedAt,
                        revisions = result.payload.revisions,
                        dirty = !stillSame,
                        autosave = AutosaveStatus.SAVED,
                        autosaveAt = System.currentTimeMillis(),
                        recoveredDraft = false,
                        conflictDraft = null,
                    )
                    if (!stillSame) scheduleAutosave()
                }
                _notice.value = "Note saved as an encrypted vault record."
            }

            is NoteCommitResult.Conflict -> _conflict.value = NoteConflictState(result.currentUpdatedAt)
            is NoteCommitResult.Rejected -> _error.value = result.message
        }
    }

    fun reloadLatest() {
        val state = _editor.value ?: return
        val access = container.session.currentAccess() ?: return
        _conflict.value = null
        _editor.value = null
        viewModelScope.launch {
            runCatching { editorService.discardDraft(access, state.noteId) }
            openEditor(state.noteId)
        }
    }

    fun reviewConflictDraft() {
        val state = _editor.value ?: return
        val draft = state.conflictDraft ?: return
        pushUndo(state.content())
        _editor.value = state.copy(
            title = draft.title,
            body = draft.body,
            category = draft.category,
            dirty = true,
            autosave = AutosaveStatus.SAVING,
            recoveredDraft = true,
            conflictDraft = null,
            canUndo = true,
        )
        scheduleAutosave()
    }

    fun discardConflictDraft() {
        val state = _editor.value ?: return
        val access = container.session.currentAccess() ?: return
        _editor.value = state.copy(conflictDraft = null)
        viewModelScope.launch {
            runCatching { editorService.discardDraft(access, state.noteId) }
            refreshDrafts(access)
        }
    }

    fun discardRecoveredDraft() {
        val state = _editor.value ?: return
        val access = container.session.currentAccess() ?: return
        viewModelScope.launch {
            runCatching { editorService.discardDraft(access, state.noteId) }
            val snapshot = runCatching { editorService.open(access, state.noteId) }.getOrNull()
            if (snapshot?.note != null) {
                resetEditor(buildEditorState(access, snapshot.copy(draft = null, conflict = false)))
            } else {
                val current = _editor.value
                if (current?.noteId == state.noteId) {
                    _editor.value = current.copy(
                        title = "",
                        body = "",
                        category = "",
                        dirty = false,
                        autosave = AutosaveStatus.IDLE,
                        autosaveAt = null,
                        recoveredDraft = false,
                        conflictDraft = null,
                    )
                }
            }
            refreshDrafts(access)
        }
    }

    fun saveNow() {
        commit()
    }

    fun flushDraft() {
        val state = _editor.value ?: return
        if (!state.dirty) return
        autosaveJob?.cancel()
        viewModelScope.launch { persistDraft() }
    }

    fun closeEditor(discardDraft: Boolean = false) {
        autosaveJob?.cancel()
        val state = _editor.value
        val access = container.session.currentAccess()
        _editor.value = null
        _conflict.value = null
        undoStack.clear()
        redoStack.clear()
        if (state != null && access != null) {
            viewModelScope.launch {
                if (discardDraft) {
                    runCatching { editorService.discardDraft(access, state.noteId) }
                }
                refreshDrafts(access)
            }
        }
    }

    /**
     * Persists the current encrypted draft before the UI leaves the editor, so
     * a navigation pop cannot cancel the write by clearing this ViewModel first.
     */
    fun closeEditorKeepingDraft(onClosed: () -> Unit) {
        autosaveJob?.cancel()
        val state = _editor.value
        val access = container.session.currentAccess()
        if (state == null) {
            onClosed()
            return
        }
        viewModelScope.launch {
            if (state.dirty) {
                try {
                    persistDraft()
                } catch (_: CancellationException) {
                    // The vault locked; the last completed encrypted autosave remains.
                }
            }
            _editor.value = null
            _conflict.value = null
            undoStack.clear()
            redoStack.clear()
            if (access != null) refreshDrafts(access)
            onClosed()
        }
    }

    fun dismissConflictDialog() {
        _conflict.value = null
    }

    /** Deletes the encrypted draft before navigating, for the explicit "discard" path. */
    fun closeEditorDiscardingDraft(onClosed: () -> Unit) {
        autosaveJob?.cancel()
        val state = _editor.value
        val access = container.session.currentAccess()
        if (state == null || access == null) {
            closeEditor()
            onClosed()
            return
        }
        viewModelScope.launch {
            runCatching { editorService.discardDraft(access, state.noteId) }
            _editor.value = null
            _conflict.value = null
            undoStack.clear()
            redoStack.clear()
            refreshDrafts(access)
            onClosed()
        }
    }

    fun openDraft(draft: NoteDraftDocument) {
        val access = container.session.currentAccess() ?: run {
            _error.value = "The vault is locked."
            return
        }
        loadJob?.cancel()
        _loadingEditor.value = true
        loadJob = viewModelScope.launch {
            try {
                val snapshot = runCatching { editorService.open(access, draft.payload.noteId) }.getOrNull()
                if (snapshot != null) {
                    resetEditor(buildEditorState(access, snapshot))
                } else {
                    // The original note is unreadable. Preserve the encrypted
                    // draft under a new identity instead of discarding content.
                    val copyId = editorService.newNoteId()
                    val copied = editorService.saveDraft(
                        access,
                        copyId,
                        draft.payload.title,
                        draft.payload.body,
                        draft.payload.category,
                        baseUpdatedAt = 0,
                    )
                    runCatching { editorService.discardDraft(access, draft.payload.noteId) }
                    resetEditor(
                        NotesEditorState(
                            noteId = copyId,
                            isNew = true,
                            title = draft.payload.title,
                            body = draft.payload.body,
                            category = draft.payload.category,
                            baseUpdatedAt = 0,
                            revisions = emptyList(),
                            dirty = true,
                            autosave = AutosaveStatus.SAVED,
                            autosaveAt = copied.payload.savedAt,
                            recoveredDraft = true,
                            conflictDraft = null,
                            canUndo = false,
                            canRedo = false,
                        ),
                    )
                    _notice.value = "The original note was unreadable, so the encrypted draft was recovered as a new note."
                    refreshDrafts(access)
                }
            } catch (failure: Throwable) {
                _error.value = failure.message ?: "Could not recover the encrypted draft."
            } finally {
                _loadingEditor.value = false
            }
        }
    }

    fun discardDraftFromList(draft: NoteDraftDocument) {
        val access = container.session.currentAccess() ?: return
        viewModelScope.launch {
            runCatching { editorService.discardDraft(access, draft.payload.noteId) }
            refreshDrafts(access)
        }
    }

    fun delete(record: SecretRecord) {
        val access = container.session.currentAccess() ?: return
        viewModelScope.launch {
            runCatching { editorService.delete(access, record.id) }
                .onSuccess {
                    _notice.value = "Encrypted note deleted. This is logical deletion, not a provable physical erase."
                    refreshDrafts(access)
                }
                .onFailure { _error.value = it.message ?: "Could not delete the note." }
        }
    }

    fun consumeError() { _error.value = null }
    fun consumeNotice() { _notice.value = null }

    private fun scheduleAutosave() {
        autosaveJob?.cancel()
        autosaveJob = viewModelScope.launch {
            delay(800)
            persistDraft()
        }
    }

    private suspend fun persistDraft() {
        val access = container.session.currentAccess()
        val state = _editor.value ?: return
        if (access == null) {
            _editor.value = state.copy(autosave = AutosaveStatus.LOCKED)
            return
        }
        editorMutex.withLock {
            val current = _editor.value ?: return
            _editor.value = current.copy(autosave = AutosaveStatus.SAVING)
            try {
                val draft = editorService.saveDraft(
                    access,
                    current.noteId,
                    current.title,
                    current.body,
                    current.category,
                    current.baseUpdatedAt,
                )
                val latest = _editor.value
                if (latest != null && latest.noteId == current.noteId) {
                    _editor.value = latest.copy(
                        autosave = AutosaveStatus.SAVED,
                        autosaveAt = draft.payload.savedAt,
                    )
                }
            } catch (failure: CancellationException) {
                throw failure
            } catch (failure: Throwable) {
                val latest = _editor.value
                if (latest != null && latest.noteId == current.noteId) {
                    _editor.value = latest.copy(
                        autosave = if (container.session.currentAccess() == null) {
                            AutosaveStatus.LOCKED
                        } else {
                            AutosaveStatus.FAILED
                        },
                    )
                }
            }
        }
    }

    private fun pushUndo(previous: NoteContent) {
        val now = android.os.SystemClock.uptimeMillis()
        if (now - lastUndoAt > 450 || undoStack.isEmpty()) {
            undoStack.addLast(previous)
            while (undoStack.size > 50) undoStack.removeFirst()
        }
        lastUndoAt = now
        redoStack.clear()
        val current = _editor.value
        if (current != null) {
            _editor.value = current.copy(
                canUndo = undoStack.isNotEmpty(),
                canRedo = false,
            )
        }
    }

    private fun resetEditor(state: NotesEditorState) {
        undoStack.clear()
        redoStack.clear()
        lastUndoAt = 0L
        _editor.value = state.copy(canUndo = false, canRedo = false)
        _conflict.value = null
    }

    private suspend fun refreshDrafts(access: com.knoux.crypt.data.VaultAccess) {
        val drafts = runCatching { editorService.drafts(access) }.getOrNull() ?: return
        val noteStates = _notes.value.associateBy { it.id }
        // Readable notes handle their own draft inside the editor. Missing or
        // unreadable notes must stay recoverable from the list.
        _drafts.value = drafts.filter { draft ->
            noteStates[draft.payload.noteId]?.decryptionFailed != false
        }
    }

    private fun clearSensitiveState() {
        autosaveJob?.cancel()
        loadJob?.cancel()
        _notes.value = emptyList()
        _drafts.value = emptyList()
        _editor.value = null
        _loadingEditor.value = false
        _saving.value = false
        _conflict.value = null
        _error.value = null
        _notice.value = null
        undoStack.clear()
        redoStack.clear()
    }

    override fun onCleared() {
        autosaveJob?.cancel()
        loadJob?.cancel()
        super.onCleared()
    }
}

@Composable
fun NotesScreen(container: AppContainer, onBack: () -> Unit, onNeedUnlock: () -> Unit) {
    val unlocked by container.session.unlocked.collectAsStateWithLifecycle()
    if (!unlocked) {
        LockedScreen(tr("Secure Notes", "ملاحظات آمنة"), onBack, onNeedUnlock)
        return
    }
    val application = LocalContext.current.applicationContext as Application
    val viewModel: NotesViewModel = viewModel(
        factory = viewModelFactory { NotesViewModel(application, container) },
    )
    val notes by viewModel.notes.collectAsStateWithLifecycle()
    val drafts by viewModel.drafts.collectAsStateWithLifecycle()
    val editor by viewModel.editor.collectAsStateWithLifecycle()
    val loadingEditor by viewModel.loadingEditor.collectAsStateWithLifecycle()
    val conflict by viewModel.conflict.collectAsStateWithLifecycle()
    val saving by viewModel.saving.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val notice by viewModel.notice.collectAsStateWithLifecycle()

    LaunchedEffect(error) {
        if (error != null) {
            delay(7_000)
            viewModel.consumeError()
        }
    }
    LaunchedEffect(notice) {
        if (notice != null) {
            delay(5_000)
            viewModel.consumeNotice()
        }
    }

    val activeEditor = editor
    if (activeEditor != null) {
        NotesEditorPane(
            container = container,
            viewModel = viewModel,
            state = activeEditor,
            saving = saving,
            onBack = onBack,
        )
        conflict?.let {
            NoteConflictDialog(
                onOverwrite = viewModel::resolveConflictOverwrite,
                onReload = viewModel::reloadLatest,
                onDismiss = viewModel::dismissConflictDialog,
            )
        }
        return
    }

    var pendingDelete by remember { mutableStateOf<SecretRecord?>(null) }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Secure Notes", "ملاحظات آمنة"), onBack)
        Spacer(Modifier.height(6.dp))
        Text(
            tr(
                "Notes are stored as encrypted KNC records. Autosave writes an encrypted draft; no plaintext draft, cache or SavedStateHandle copy is kept.",
                "تُخزَّن الملاحظات كسجلات KNC مشفرة. يكتب الحفظ التلقائي مسودة مشفرة؛ لا تُحفظ مسودة نصية أو نسخة في الكاش أو SavedStateHandle.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(8.dp))
        KnouxGhostButton(tr("New note", "ملاحظة جديدة"), { viewModel.openEditor(null) })
        Spacer(Modifier.height(8.dp))
        error?.let {
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(6.dp))
        }
        notice?.let {
            Text(it, color = KnouxColors.Success, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(6.dp))
        }
        if (loadingEditor) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), color = KnouxColors.Violet, strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
                Text(tr("Opening encrypted note…", "جارٍ فتح الملاحظة المشفرة…"), style = MaterialTheme.typography.labelSmall)
            }
            Spacer(Modifier.height(6.dp))
        }

        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (drafts.isNotEmpty()) {
                item(key = "drafts") {
                    GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Warn.copy(alpha = 0.5f)) {
                        SectionLabel(tr("Encrypted drafts", "مسودات مشفرة"))
                        Spacer(Modifier.height(4.dp))
                        Text(
                            tr(
                                "Autosaved drafts whose note is not in the list. Recover or discard them explicitly.",
                                "مسودات محفوظة تلقائيًا لا تظهر ملاحظاتها في القائمة. استعدها أو تجاهلها صراحةً.",
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            color = KnouxColors.Faint,
                        )
                        drafts.forEach { draft ->
                            Spacer(Modifier.height(6.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        draft.payload.title.ifBlank { tr("Untitled draft", "مسودة بلا عنوان") },
                                        style = MaterialTheme.typography.titleSmall,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        formatNoteTime(draft.payload.savedAt),
                                        style = MaterialTheme.typography.labelSmall,
                                    )
                                }
                                TextButton(onClick = { viewModel.openDraft(draft) }) {
                                    Text(tr("Recover", "استعادة"), color = KnouxColors.Violet)
                                }
                                TextButton(onClick = { viewModel.discardDraftFromList(draft) }) {
                                    Text(tr("Discard", "تجاهل"), color = KnouxColors.Alert)
                                }
                            }
                        }
                    }
                }
            }
            if (notes.isEmpty()) {
                item(key = "empty") {
                    GlassCard(Modifier.fillMaxWidth()) {
                        Text(
                            tr("No encrypted notes yet. Create the first one.", "لا توجد ملاحظات مشفرة بعد. أنشئ الأولى."),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
            items(notes, key = { it.id }) { record ->
                val payload = viewModel.payload(record)
                GlassCard(Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            payload?.title?.ifBlank { tr("Untitled", "بلا عنوان") }
                                ?: tr("Unreadable record", "سجل غير قابل للقراءة"),
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.weight(1f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        val revisionCount = payload?.revisions?.size ?: 0
                        if (revisionCount > 0) {
                            Text(
                                tr("$revisionCount versions", "$revisionCount إصدارات"),
                                style = MaterialTheme.typography.labelSmall,
                                color = KnouxColors.Violet,
                            )
                        }
                    }
                    if (payload == null) {
                        Text(
                            tr(
                                "This record could not be decrypted with the current key. It was not replaced or deleted.",
                                "تعذر فك تشفير هذا السجل بالمفتاح الحالي. لم يتم استبداله أو حذفه.",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = KnouxColors.Alert,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    } else {
                        if (payload.category.isNotBlank()) {
                            Text(
                                payload.category,
                                style = MaterialTheme.typography.labelSmall,
                                color = KnouxColors.Violet,
                                modifier = Modifier.padding(top = 2.dp),
                            )
                        }
                        Text(
                            payload.body,
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 4,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                        Text(
                            formatNoteTime(record.updatedAt),
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.weight(1f),
                        )
                        if (payload != null) {
                            TextButton(onClick = { viewModel.openEditor(record.id) }) {
                                Text(tr("Edit", "تعديل"), color = KnouxColors.Violet, fontSize = 11.sp)
                            }
                        }
                        TextButton(onClick = { pendingDelete = record }) {
                            Text(tr("Delete", "حذف"), color = KnouxColors.Alert, fontSize = 11.sp)
                        }
                    }
                }
            }
            item(key = "footer") { Spacer(Modifier.height(18.dp)) }
        }
    }

    pendingDelete?.let { record ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(tr("Delete note?", "حذف الملاحظة؟")) },
            text = {
                Text(
                    tr(
                        "Deletes the encrypted note and any encrypted draft from this device. Deletion is not a provable physical shred.",
                        "يحذف الملاحظة المشفرة وأي مسودة مشفرة من هذا الجهاز. الحذف ليس تمزيقًا ماديًا يمكن إثباته.",
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = null
                    viewModel.delete(record)
                }) { Text(tr("Delete", "حذف"), color = KnouxColors.Alert) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text(tr("Cancel", "إلغاء")) }
            },
        )
    }
}

@Composable
private fun NotesEditorPane(
    container: AppContainer,
    viewModel: NotesViewModel,
    state: NotesEditorState,
    saving: Boolean,
    onBack: () -> Unit,
) {
    val reduced = LocalReducedMotion.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var showHistory by remember { mutableStateOf(false) }
    var showCategories by remember { mutableStateOf(false) }
    var showLeave by remember { mutableStateOf(false) }
    val titleFocus = remember { FocusRequester() }
    val fold = remember { Animatable(if (reduced) 1f else 0f) }

    DisposableEffect(lifecycleOwner, state.noteId) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) viewModel.flushDraft()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(state.noteId) {
        if (!reduced) fold.animateTo(1f, tween(420, easing = FastOutSlowInEasing))
        if (state.isNew && state.title.isBlank()) runCatching { titleFocus.requestFocus() }
    }
    BackHandler {
        if (state.dirty) {
            viewModel.flushDraft()
            showLeave = true
        } else {
            viewModel.closeEditor()
            onBack()
        }
    }

    var titleValue by remember(state.noteId) {
        mutableStateOf(TextFieldValue(state.title, TextRange(state.title.length)))
    }
    var bodyValue by remember(state.noteId) {
        mutableStateOf(TextFieldValue(state.body, TextRange(state.body.length)))
    }
    LaunchedEffect(state.title) {
        if (titleValue.text != state.title) {
            titleValue = TextFieldValue(state.title, TextRange(state.title.length))
        }
    }
    LaunchedEffect(state.body) {
        if (bodyValue.text != state.body) {
            bodyValue = TextFieldValue(state.body, TextRange(state.body.length))
        }
    }

    fun updateBodyText(value: TextFieldValue) {
        bodyValue = value
        viewModel.updateBody(value.text)
    }

    fun wrapSelection(prefix: String, suffix: String) {
        val text = bodyValue.text
        val start = bodyValue.selection.min.coerceIn(0, text.length)
        val end = bodyValue.selection.max.coerceIn(start, text.length)
        val selected = text.substring(start, end)
        val replacement = prefix + selected + suffix
        val newText = text.substring(0, start) + replacement + text.substring(end)
        val cursor = if (selected.isEmpty()) start + prefix.length else start + replacement.length
        updateBodyText(TextFieldValue(newText, TextRange(cursor)))
    }

    fun prefixCurrentLine(prefix: String) {
        val text = bodyValue.text
        val start = bodyValue.selection.min.coerceIn(0, text.length)
        val lineStart = text.lastIndexOf('\n', (start - 1).coerceAtLeast(0)).let {
            if (it < 0) 0 else it + 1
        }
        val lineEnd = text.indexOf('\n', start).let { if (it < 0) text.length else it }
        val line = text.substring(lineStart, lineEnd)
        val newLine = if (line.startsWith(prefix)) line.removePrefix(prefix) else prefix + line
        val newText = text.substring(0, lineStart) + newLine + text.substring(lineEnd)
        val cursor = (start + (newLine.length - line.length)).coerceIn(0, newText.length)
        updateBodyText(TextFieldValue(newText, TextRange(cursor)))
    }

    val selectionStart = bodyValue.selection.min.coerceIn(0, bodyValue.text.length)
    val selectionEnd = bodyValue.selection.max.coerceIn(selectionStart, bodyValue.text.length)
    val boldActive = selectionStart >= 2 && selectionEnd + 2 <= bodyValue.text.length &&
        bodyValue.text.substring(selectionStart - 2, selectionStart) == "**" &&
        bodyValue.text.substring(selectionEnd, selectionEnd + 2) == "**"
    val italicActive = selectionStart >= 1 && selectionEnd + 1 <= bodyValue.text.length &&
        bodyValue.text[selectionStart - 1] == '_' &&
        bodyValue.text[selectionEnd] == '_'

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .graphicsLayer {
                alpha = fold.value
                rotationX = (1f - fold.value) * -9f
                transformOrigin = TransformOrigin(0.5f, 0f)
            }
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(
            tr("Notes Editor", "محرر الملاحظات"),
            {
                if (state.dirty) {
                    viewModel.flushDraft()
                    showLeave = true
                } else {
                    viewModel.closeEditor()
                    onBack()
                }
            },
            actions = {
                TextButton(onClick = { showHistory = true }) {
                    Text(tr("History", "السجل"), color = KnouxColors.Violet, fontSize = 12.sp)
                }
                StagHero(Modifier.size(38.dp), animated = !reduced)
            },
        )
        if (state.recoveredDraft) {
            GlassCard(
                Modifier.fillMaxWidth(),
                borderColor = KnouxColors.Violet.copy(alpha = 0.5f),
                contentPadding = PaddingValues(10.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        tr(
                            "Recovered from an encrypted autosave draft.",
                            "استُعيدت من مسودة حفظ تلقائي مشفرة.",
                        ),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Violet,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = viewModel::discardRecoveredDraft) {
                        Text(tr("Discard draft", "تجاهل المسودة"), color = KnouxColors.Alert, fontSize = 11.sp)
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
        }
        state.conflictDraft?.let { draft ->
            GlassCard(
                Modifier.fillMaxWidth(),
                borderColor = KnouxColors.Warn.copy(alpha = 0.6f),
                contentPadding = PaddingValues(10.dp),
            ) {
                Text(
                    tr(
                        "An older encrypted draft exists. The note changed after that draft was based.",
                        "توجد مسودة مشفرة أقدم. تغيّرت الملاحظة بعد أن بُنيت تلك المسودة.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Warn,
                )
                Row {
                    TextButton(onClick = viewModel::reviewConflictDraft) {
                        Text(tr("Review draft", "مراجعة المسودة"), color = KnouxColors.Violet)
                    }
                    TextButton(onClick = viewModel::discardConflictDraft) {
                        Text(tr("Discard", "تجاهل"), color = KnouxColors.Alert)
                    }
                }
                Text(
                    draft.title.ifBlank { tr("Untitled draft", "مسودة بلا عنوان") },
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
            }
            Spacer(Modifier.height(6.dp))
        }
        BasicTextField(
            value = titleValue,
            onValueChange = {
                val truncated = it.text.take(NotesEditorService.MAX_TITLE_CHARS)
                titleValue = it.copy(
                    text = truncated,
                    selection = TextRange(it.selection.start.coerceAtMost(truncated.length)),
                )
                viewModel.updateTitle(truncated)
            },
            singleLine = true,
            textStyle = MaterialTheme.typography.headlineMedium.copy(color = KnouxColors.Text),
            cursorBrush = SolidColor(KnouxColors.Violet),
            keyboardOptions = KeyboardOptions.Default,
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(titleFocus),
            decorationBox = { inner ->
                Box {
                    if (titleValue.text.isEmpty()) {
                        Text(
                            tr("Project title", "عنوان المشروع"),
                            style = MaterialTheme.typography.headlineMedium,
                            color = KnouxColors.Faint,
                        )
                    }
                    inner()
                }
            },
        )
        Spacer(Modifier.height(6.dp))
        FormatToolbar(
            boldActive = boldActive,
            italicActive = italicActive,
            onBold = { wrapSelection("**", "**") },
            onItalic = { wrapSelection("_", "_") },
            onUnderline = { wrapSelection("__", "__") },
            onCode = { wrapSelection("`", "`") },
            onBullet = { prefixCurrentLine("- ") },
            onNumbered = { prefixCurrentLine("1. ") },
            onQuote = { prefixCurrentLine("> ") },
            onChecklist = { prefixCurrentLine("- [ ] ") },
            onUndo = viewModel::undo,
            onRedo = viewModel::redo,
            canUndo = state.canUndo,
            canRedo = state.canRedo,
        )
        Spacer(Modifier.height(6.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .weight(1f)
                .clip(RoundedCornerShape(14.dp))
                .background(Color(0x5513091F))
                .border(1.dp, KnouxColors.Line, RoundedCornerShape(14.dp))
                .padding(12.dp),
        ) {
            BasicTextField(
                value = bodyValue,
                onValueChange = { updateBodyText(it) },
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = KnouxColors.Text),
                cursorBrush = SolidColor(KnouxColors.Violet),
                visualTransformation = remember { MarkdownVisualTransformation(KnouxColors.Violet) },
                modifier = Modifier.fillMaxSize(),
                decorationBox = { inner ->
                    Box {
                        if (bodyValue.text.isEmpty()) {
                            Text(
                                tr(
                                    "Write freely. Markdown-style headings, lists and checkboxes are styled locally.",
                                    "اكتب بحرية. تُنسَّق العناوين والقوائم ومربعات الاختيار محليًا.",
                                ),
                                style = MaterialTheme.typography.bodyLarge,
                                color = KnouxColors.Faint,
                            )
                        }
                        inner()
                    }
                },
            )
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                state.category.ifBlank { tr("Uncategorized", "بلا تصنيف") },
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Violet,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(KnouxColors.Raised)
                    .border(1.dp, KnouxColors.Line, CircleShape)
                    .clickable { showCategories = true }
                    .padding(horizontal = 10.dp, vertical = 5.dp),
            )
            Spacer(Modifier.width(8.dp))
            StatusPill(
                tr("Encrypted", "مشفر"),
                tone = KnouxColors.Success,
            )
            Spacer(Modifier.weight(1f))
            Text(
                when (state.autosave) {
                    AutosaveStatus.SAVING -> tr("Encrypting draft…", "جارٍ تشفير المسودة…")
                    AutosaveStatus.SAVED -> tr(
                        "Draft encrypted ${state.autosaveAt?.let(::formatNoteTime) ?: ""}",
                        "المسودة مشفرة ${state.autosaveAt?.let(::formatNoteTime) ?: ""}",
                    )
                    AutosaveStatus.FAILED -> tr("Draft autosave failed", "فشل حفظ المسودة")
                    AutosaveStatus.LOCKED -> tr("Vault locked", "الخزنة مقفلة")
                    AutosaveStatus.IDLE -> if (state.dirty) {
                        tr("Unsaved changes", "تغييرات غير محفوظة")
                    } else {
                        tr("Saved", "محفوظ")
                    }
                },
                style = MaterialTheme.typography.labelSmall,
                color = when {
                    state.autosave == AutosaveStatus.FAILED || state.autosave == AutosaveStatus.LOCKED -> KnouxColors.Alert
                    state.dirty -> KnouxColors.Warn
                    else -> KnouxColors.Success
                },
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(
            tr(
                "All note content and the bounded revision history are encrypted inside the vault record. Markdown formatting is local display only.",
                "كل محتوى الملاحظة وسجل الإصدارات المحدود مشفران داخل سجل الخزنة. تنسيق Markdown للعرض المحلي فقط.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Faint,
        )
        Spacer(Modifier.height(6.dp))
        KnouxPrimaryButton(
            if (saving) tr("Saving…", "جارٍ الحفظ…") else tr(
                if (state.dirty) "Save note" else "Saved",
                if (state.dirty) "حفظ الملاحظة" else "تم الحفظ",
            ),
            viewModel::commit,
            enabled = !saving && state.dirty,
        )
        Spacer(Modifier.height(10.dp))
    }

    if (showHistory) {
        val revisions = state.revisions
        AlertDialog(
            onDismissRequest = { showHistory = false },
            title = { Text(tr("Encrypted version history", "سجل الإصدارات المشفر")) },
            text = {
                Column(
                    Modifier
                        .heightIn(max = 420.dp)
                        .verticalScroll(rememberScrollState()),
                ) {
                    if (revisions.isEmpty()) {
                        Text(
                            tr(
                                "No previous versions yet. A revision is added on each successful save, up to 20.",
                                "لا توجد إصدارات سابقة بعد. يُضاف إصدار عند كل حفظ ناجح، حتى 20.",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    } else {
                        revisions.forEachIndexed { index, revision ->
                            GlassCard(
                                Modifier.fillMaxWidth(),
                                alt = true,
                                contentPadding = PaddingValues(10.dp),
                            ) {
                                Text(
                                    revision.title.ifBlank { tr("Untitled", "بلا عنوان") },
                                    style = MaterialTheme.typography.titleSmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    formatNoteTime(revision.savedAt),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = KnouxColors.Violet,
                                )
                                Text(
                                    revision.body,
                                    style = MaterialTheme.typography.bodySmall,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                TextButton(onClick = {
                                    viewModel.restoreRevision(revision)
                                    showHistory = false
                                }) {
                                    Text(tr("Load revision $index", "تحميل الإصدار $index"), color = KnouxColors.Violet, fontSize = 11.sp)
                                }
                            }
                            Spacer(Modifier.height(6.dp))
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showHistory = false }) { Text(tr("Close", "إغلاق")) }
            },
        )
    }

    if (showCategories) {
        AlertDialog(
            onDismissRequest = { showCategories = false },
            title = { Text(tr("Note category", "تصنيف الملاحظة")) },
            text = {
                Column {
                    NoteCategories.forEach { category ->
                        TextButton(onClick = {
                            viewModel.updateCategory(category)
                            showCategories = false
                        }, modifier = Modifier.fillMaxWidth()) {
                            Text(
                                category.ifBlank { tr("Uncategorized", "بلا تصنيف") },
                                color = if (category == state.category) KnouxColors.Violet else KnouxColors.Text,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showCategories = false }) { Text(tr("Cancel", "إلغاء")) }
            },
        )
    }

    if (showLeave) {
        AlertDialog(
            onDismissRequest = { showLeave = false },
            title = { Text(tr("Leave the editor?", "مغادرة المحرر؟")) },
            text = {
                Text(
                    tr(
                        "Your current text is being written to an encrypted draft. You can recover it from Secure Notes or discard it now.",
                        "يُكتب نصك الحالي في مسودة مشفرة. يمكنك استعادتها من الملاحظات الآمنة أو تجاهلها الآن.",
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showLeave = false
                    viewModel.closeEditorKeepingDraft(onBack)
                }) { Text(tr("Keep draft & leave", "احتفظ بالمسودة واخرج"), color = KnouxColors.Violet) }
            },
            dismissButton = {
                Row {
                    TextButton(onClick = { showLeave = false }) { Text(tr("Stay", "ابقَ")) }
                    TextButton(onClick = {
                        showLeave = false
                        viewModel.closeEditorDiscardingDraft(onBack)
                    }) { Text(tr("Discard & leave", "تجاهل واخرج"), color = KnouxColors.Alert) }
                }
            },
        )
    }
}

@Composable
private fun FormatToolbar(
    boldActive: Boolean,
    italicActive: Boolean,
    onBold: () -> Unit,
    onItalic: () -> Unit,
    onUnderline: () -> Unit,
    onCode: () -> Unit,
    onBullet: () -> Unit,
    onNumbered: () -> Unit,
    onQuote: () -> Unit,
    onChecklist: () -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    canUndo: Boolean,
    canRedo: Boolean,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        FormatButton("B", tr("Bold", "عريض"), boldActive, true, onBold)
        FormatButton("I", tr("Italic", "مائل"), italicActive, true, onItalic)
        FormatButton("U", tr("Underline", "تسطير"), false, true, onUnderline)
        FormatButton("•", tr("Bullet list", "قائمة نقطية"), false, true, onBullet)
        FormatButton("1.", tr("Numbered list", "قائمة مرقمة"), false, true, onNumbered)
        FormatButton("❝", tr("Quote", "اقتباس"), false, true, onQuote)
        FormatButton("☑", tr("Checklist", "قائمة مهام"), false, true, onChecklist)
        FormatButton("</>", tr("Inline code", "رمز مضمن"), false, true, onCode)
        FormatButton("↶", tr("Undo", "تراجع"), false, canUndo, onUndo)
        FormatButton("↷", tr("Redo", "إعادة"), false, canRedo, onRedo)
    }
}

@Composable
private fun FormatButton(
    label: String,
    description: String,
    active: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier
                .clip(RoundedCornerShape(9.dp))
                .background(if (active) KnouxColors.VioletDeep.copy(alpha = 0.55f) else KnouxColors.Raised)
                .border(1.dp, if (active) KnouxColors.LineHot else KnouxColors.Line, RoundedCornerShape(9.dp))
                .clickable(enabled = enabled, onClick = onClick)
                .padding(horizontal = 10.dp, vertical = 6.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                label,
                fontSize = 12.sp,
                color = when {
                    !enabled -> KnouxColors.Faint
                    active -> KnouxColors.Text
                    else -> KnouxColors.Muted
                },
                fontWeight = FontWeight.SemiBold,
            )
        }
        if (active) {
            Box(
                Modifier
                    .padding(top = 2.dp)
                    .width(22.dp)
                    .height(1.dp)
                    .background(KnouxColors.Violet),
            )
        }
        Text(description, fontSize = 7.sp, color = KnouxColors.Faint)
    }
}

@Composable
private fun NoteConflictDialog(
    onOverwrite: () -> Unit,
    onReload: () -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties()) {
        GlassCard(Modifier.fillMaxWidth()) {
            Text(
                tr("The note changed elsewhere", "تغيّرت الملاحظة في مكان آخر"),
                style = MaterialTheme.typography.titleMedium,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                tr(
                    "This note was updated after you opened it. Choose explicitly: overwrite the newer revision with your encrypted draft, reload the latest note, or cancel and keep editing.",
                    "حُدِّثت هذه الملاحظة بعد فتحها. اختر صراحةً: استبدال الإصدار الأحدث بمسودتك المشفرة، أو إعادة تحميل الأحدث، أو الإلغاء ومتابعة التحرير.",
                ),
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.height(10.dp))
            KnouxGhostButton(tr("Overwrite with my version", "استبدال بنسختي"), onOverwrite)
            Spacer(Modifier.height(6.dp))
            KnouxGhostButton(tr("Reload latest and discard my draft", "إعادة تحميل الأحدث وتجاهل مسودتي"), onReload)
            Spacer(Modifier.height(6.dp))
            KnouxGhostButton(tr("Cancel", "إلغاء"), onDismiss)
        }
    }
}

private val NoteCategories = listOf("", "Work / Projects", "Personal", "Ideas", "Archive")

private fun formatNoteTime(millis: Long): String =
    if (millis <= 0L) "—" else DateFormat
        .getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT)
        .format(Date(millis))

/**
 * Local-only display styling for Markdown-like text. The stored bytes remain the
 * user's exact text; markers are hidden where they would only add noise.
 */
private class MarkdownVisualTransformation(private val accent: Color) : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val spans = mutableListOf<AnnotatedString.Range<SpanStyle>>()
        fun add(start: Int, end: Int, style: SpanStyle) {
            if (start in 0..end && end <= text.length) spans += AnnotatedString.Range(style, start, end)
        }
        val raw = text.text

        Regex("(?m)^#{1,3} .*$").findAll(raw).forEach { match ->
            add(match.range.first, match.range.last + 1, SpanStyle(color = accent, fontWeight = FontWeight.Bold))
        }
        Regex("\\*\\*([^*\\n]+)\\*\\*").findAll(raw).forEach { match ->
            add(match.range.first, match.range.first + 2, SpanStyle(color = Color.Transparent))
            add(match.range.first + 2, match.range.last - 1, SpanStyle(fontWeight = FontWeight.Bold))
            add(match.range.last - 1, match.range.last + 1, SpanStyle(color = Color.Transparent))
        }
        Regex("__([^_\\n]+)__").findAll(raw).forEach { match ->
            add(match.range.first, match.range.first + 2, SpanStyle(color = Color.Transparent))
            add(match.range.first + 2, match.range.last - 1, SpanStyle(textDecoration = TextDecoration.Underline))
            add(match.range.last - 1, match.range.last + 1, SpanStyle(color = Color.Transparent))
        }
        Regex("(?<!_)_([^_\\n]+)_(?!_)").findAll(raw).forEach { match ->
            add(match.range.first, match.range.first + 1, SpanStyle(color = Color.Transparent))
            add(match.range.first + 1, match.range.last, SpanStyle(fontStyle = FontStyle.Italic))
            add(match.range.last, match.range.last + 1, SpanStyle(color = Color.Transparent))
        }
        Regex("`([^`\\n]+)`").findAll(raw).forEach { match ->
            add(match.range.first, match.range.first + 1, SpanStyle(color = Color.Transparent))
            add(
                match.range.first + 1,
                match.range.last,
                SpanStyle(fontFamily = FontFamily.Monospace, color = accent),
            )
            add(match.range.last, match.range.last + 1, SpanStyle(color = Color.Transparent))
        }
        Regex("(?m)^> .*$").findAll(raw).forEach { match ->
            add(match.range.first, match.range.first + 2, SpanStyle(color = accent, fontWeight = FontWeight.SemiBold))
        }
        Regex("(?m)^- \\[[ xX]\\]").findAll(raw).forEach { match ->
            val checked = raw.substring(match.range.first + 3, match.range.last + 1).contains('x', ignoreCase = true)
            add(
                match.range.first,
                match.range.last + 1,
                SpanStyle(
                    color = if (checked) KnouxColors.Success else KnouxColors.Warn,
                    fontWeight = FontWeight.SemiBold,
                ),
            )
        }
        Regex("(?m)^(?:- |\\d+\\. )").findAll(raw).forEach { match ->
            add(match.range.first, match.range.last + 1, SpanStyle(color = accent))
        }
        return TransformedText(
            AnnotatedString(raw, spanStyles = spans),
            OffsetMapping.Identity,
        )
    }
}