package com.knoux.crypt.ui

import android.app.Application
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.NotePayload
import com.knoux.crypt.data.SecretKinds
import com.knoux.crypt.data.SecretRecord
import com.knoux.crypt.data.SecretsJson
import com.knoux.crypt.data.VaultLockedException
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxTextField
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class NotesViewModel(application: Application, private val container: AppContainer) : AndroidViewModel(application) {
    private val _notes = MutableStateFlow<List<SecretRecord>>(emptyList())
    val notes: StateFlow<List<SecretRecord>> = _notes.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        viewModelScope.launch {
            container.session.unlocked.collect { unlocked ->
                if (!unlocked) {
                    // The session capability is gone; drop every decrypted payload
                    // held by this ViewModel instead of leaving it on screen.
                    _notes.value = emptyList()
                    _error.value = null
                }
            }
        }
        val access = container.session.currentAccess()
        if (access != null) {
            viewModelScope.launch {
                try {
                    container.secrets.observe(access, SecretKinds.NOTE).collect { _notes.value = it }
                } catch (_: VaultLockedException) {
                    _notes.value = emptyList()
                }
            }
        }
    }

    fun save(id: String?, title: String, body: String, onDone: () -> Unit) {
        val access = container.session.currentAccess()
        if (access == null) {
            _error.value = "The vault locked before saving."
            return
        }
        viewModelScope.launch {
            runCatching {
                container.secrets.save(access, SecretKinds.NOTE, id, SecretsJson.encodeNote(title, body))
            }.onSuccess {
                _error.value = null
                onDone()
            }.onFailure {
                _error.value = it.message ?: "Could not save the note."
            }
        }
    }

    fun delete(record: SecretRecord, onDone: () -> Unit) {
        val access = container.session.currentAccess()
        if (access == null) {
            _error.value = "The vault locked before deleting."
            return
        }
        viewModelScope.launch {
            runCatching { container.secrets.delete(access, record.id) }
                .onSuccess { onDone() }
                .onFailure { _error.value = it.message ?: "Could not delete the note." }
        }
    }

    fun payload(record: SecretRecord): NotePayload? = SecretsJson.decodeNote(record.payloadJson)
}

@Composable
fun NotesScreen(container: AppContainer, onBack: () -> Unit, onNeedUnlock: () -> Unit) {
    if (container.session.currentAccess() == null) {
        LockedScreen(tr("Secure Notes", "ملاحظات آمنة"), onBack, onNeedUnlock)
        return
    }
    val application = LocalContext.current.applicationContext as Application
    val viewModel: NotesViewModel = viewModel(
        factory = viewModelFactory { NotesViewModel(application, container) },
    )
    val notes by viewModel.notes.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()

    var editorOpen by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<SecretRecord?>(null) }
    var title by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    var pendingDelete by remember { mutableStateOf<SecretRecord?>(null) }
    val formatter = remember { SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()) }

    fun openNew() {
        editing = null
        title = ""
        body = ""
        editorOpen = true
    }

    fun openEdit(record: SecretRecord) {
        val payload = viewModel.payload(record)
        if (payload == null) {
            return
        }
        editing = record
        title = payload.title
        body = payload.body
        editorOpen = true
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Secure Notes", "ملاحظات آمنة"), onBack)
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "Titles and bodies are encrypted as one KNC1 record before Room stores the ciphertext. Metadata stays minimal.",
                "تُشفّر العناوين والنصوص كسجل KNC1 واحد قبل أن يخزن Room النص المشفر. تبقى البيانات الوصفية في حدها الأدنى.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(10.dp))
        KnouxGhostButton(tr("New note", "ملاحظة جديدة"), ::openNew)
        Spacer(Modifier.height(10.dp))
        error?.let {
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }
        if (notes.isEmpty()) {
            GlassCard(Modifier.fillMaxWidth()) {
                Text(
                    tr("No encrypted notes yet. Create the first one.", "لا توجد ملاحظات مشفرة بعد. أنشئ الأولى."),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        notes.forEach { record ->
            val payload = viewModel.payload(record)
            GlassCard(Modifier.fillMaxWidth()) {
                Text(
                    payload?.title?.ifBlank { tr("Untitled", "بلا عنوان") } ?: tr("Unreadable record", "سجل غير قابل للقراءة"),
                    style = MaterialTheme.typography.titleMedium,
                )
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
                    Text(
                        payload.body,
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                    Text(
                        formatter.format(Date(record.updatedAt)),
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.weight(1f),
                    )
                    if (payload != null) {
                        TextButton(onClick = { openEdit(record) }) {
                            Text(tr("Edit", "تعديل"), color = KnouxColors.Violet, fontSize = 11.sp)
                        }
                    }
                    TextButton(onClick = { pendingDelete = record }) {
                        Text(tr("Delete", "حذف"), color = KnouxColors.Alert, fontSize = 11.sp)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        Spacer(Modifier.height(24.dp))
    }

    if (editorOpen) {
        AlertDialog(
            onDismissRequest = { editorOpen = false },
            title = { Text(if (editing == null) tr("New secure note", "ملاحظة آمنة جديدة") else tr("Edit secure note", "تعديل ملاحظة آمنة")) },
            text = {
                Column {
                    KnouxTextField(title, { title = it }, tr("Title", "العنوان"), singleLine = true)
                    Spacer(Modifier.height(8.dp))
                    KnouxTextField(body, { body = it }, tr("Body", "النص"), singleLine = false, minLines = 5)
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.save(editing?.id, title.trim(), body) { editorOpen = false }
                    },
                    enabled = title.isNotBlank() || body.isNotBlank(),
                ) { Text(tr("Save", "حفظ"), color = KnouxColors.Violet) }
            },
            dismissButton = {
                TextButton(onClick = { editorOpen = false }) { Text(tr("Cancel", "إلغاء")) }
            },
        )
    }

    pendingDelete?.let { record ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(tr("Delete note?", "حذف الملاحظة؟")) },
            text = {
                Text(
                    tr(
                        "Deletes the encrypted record from this device. Deletion is not a provable physical shred.",
                        "يحذف السجل المشفر من هذا الجهاز. الحذف ليس تمزيقًا ماديًا يمكن إثباته.",
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = null
                    viewModel.delete(record) {}
                }) { Text(tr("Delete", "حذف"), color = KnouxColors.Alert) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text(tr("Cancel", "إلغاء")) }
            },
        )
    }
}
