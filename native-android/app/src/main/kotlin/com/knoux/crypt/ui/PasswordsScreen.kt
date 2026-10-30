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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.PasswordPayload
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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class PasswordsViewModel(application: Application, private val container: AppContainer) : AndroidViewModel(application) {
    private val _records = MutableStateFlow<List<SecretRecord>>(emptyList())
    val records: StateFlow<List<SecretRecord>> = _records.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        viewModelScope.launch {
            container.session.unlocked.collect { unlocked ->
                if (!unlocked) {
                    // The session capability is gone; drop every decrypted payload
                    // held by this ViewModel instead of leaving it on screen.
                    _records.value = emptyList()
                    _error.value = null
                }
            }
        }
        val access = container.session.currentAccess()
        if (access != null) {
            viewModelScope.launch {
                try {
                    container.secrets.observe(access, SecretKinds.PASSWORD).collect { _records.value = it }
                } catch (_: VaultLockedException) {
                    _records.value = emptyList()
                }
            }
        }
    }

    fun save(id: String?, payload: PasswordPayload, onDone: () -> Unit) {
        val access = container.session.currentAccess()
        if (access == null) {
            _error.value = "The vault locked before saving."
            return
        }
        viewModelScope.launch {
            runCatching {
                container.secrets.save(access, SecretKinds.PASSWORD, id, SecretsJson.encodePassword(payload))
            }.onSuccess {
                _error.value = null
                onDone()
            }.onFailure { _error.value = it.message ?: "Could not save the password." }
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
                .onFailure { _error.value = it.message ?: "Could not delete the password." }
        }
    }

    fun payload(record: SecretRecord): PasswordPayload? = SecretsJson.decodePassword(record.payloadJson)
}

@Composable
fun PasswordsScreen(container: AppContainer, onBack: () -> Unit, onNeedUnlock: () -> Unit) {
    if (container.session.currentAccess() == null) {
        LockedScreen(tr("Passwords", "كلمات المرور"), onBack, onNeedUnlock)
        return
    }
    val application = LocalContext.current.applicationContext as Application
    val clipboard = LocalClipboardManager.current
    val viewModel: PasswordsViewModel = viewModel(
        factory = viewModelFactory { PasswordsViewModel(application, container) },
    )
    val records by viewModel.records.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()

    var editorOpen by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<SecretRecord?>(null) }
    var title by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var revealed by remember { mutableStateOf<Set<String>>(emptySet()) }
    var copiedId by remember { mutableStateOf<String?>(null) }
    var pendingDelete by remember { mutableStateOf<SecretRecord?>(null) }

    fun openNew() {
        editing = null
        title = ""
        username = ""
        password = ""
        url = ""
        notes = ""
        showPassword = false
        editorOpen = true
    }

    fun openEdit(record: SecretRecord) {
        val payload = viewModel.payload(record) ?: return
        editing = record
        title = payload.title
        username = payload.username
        password = payload.password
        url = payload.url
        notes = payload.notes
        showPassword = false
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
        BackHeader(tr("Passwords", "كلمات المرور"), onBack)
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "Each entry is sealed as a KNC1 record with AAD bound to its identity. Copy is manual; the clipboard is not auto-cleared yet.",
                "كل إدخال مختوم كسجل KNC1 مع ربط AAD بهويته. النسخ يدوي؛ لا تُمسح الحافظة تلقائيًا بعد.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(10.dp))
        KnouxGhostButton(tr("New password", "كلمة مرور جديدة"), ::openNew)
        Spacer(Modifier.height(10.dp))
        error?.let {
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }
        if (records.isEmpty()) {
            GlassCard(Modifier.fillMaxWidth()) {
                Text(tr("No encrypted passwords yet.", "لا توجد كلمات مرور مشفرة بعد."), style = MaterialTheme.typography.bodySmall)
            }
        }
        records.forEach { record ->
            val payload = viewModel.payload(record)
            val isRevealed = record.id in revealed
            GlassCard(Modifier.fillMaxWidth()) {
                Text(
                    payload?.title?.ifBlank { tr("Untitled", "بلا عنوان") } ?: tr("Unreadable record", "سجل غير قابل للقراءة"),
                    style = MaterialTheme.typography.titleMedium,
                )
                if (payload == null) {
                    Text(
                        tr("This record could not be decrypted with the current key.", "تعذر فك تشفير هذا السجل بالمفتاح الحالي."),
                        style = MaterialTheme.typography.bodySmall,
                        color = KnouxColors.Alert,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                } else {
                    if (payload.username.isNotBlank()) {
                        Text(payload.username, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 3.dp))
                    }
                    Text(
                        if (isRevealed) payload.password.ifBlank { "—" } else "•".repeat(payload.password.length.coerceIn(6, 18)),
                        style = MaterialTheme.typography.bodyLarge.copy(fontSize = 16.sp),
                        color = KnouxColors.Text,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                        TextButton(onClick = {
                            revealed = if (isRevealed) revealed - record.id else revealed + record.id
                        }) { Text(if (isRevealed) tr("Hide", "إخفاء") else tr("Reveal", "إظهار"), color = KnouxColors.Violet, fontSize = 11.sp) }
                        TextButton(onClick = {
                            clipboard.setText(AnnotatedString(payload.password))
                            copiedId = record.id
                        }) {
                            Text(
                                if (copiedId == record.id) tr("Copied", "تم النسخ") else tr("Copy", "نسخ"),
                                color = KnouxColors.Violet,
                                fontSize = 11.sp,
                            )
                        }
                        Spacer(Modifier.weight(1f))
                        TextButton(onClick = { openEdit(record) }) { Text(tr("Edit", "تعديل"), color = KnouxColors.Violet, fontSize = 11.sp) }
                        TextButton(onClick = { pendingDelete = record }) { Text(tr("Delete", "حذف"), color = KnouxColors.Alert, fontSize = 11.sp) }
                    }
                    if (copiedId == record.id) {
                        Text(
                            tr("Cleared manually? Clipboard contents persist until replaced.", "امسحها يدويًا؟ يبقى محتوى الحافظة حتى يُستبدل."),
                            style = MaterialTheme.typography.labelSmall,
                        )
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
            title = { Text(if (editing == null) tr("New password", "كلمة مرور جديدة") else tr("Edit password", "تعديل كلمة المرور")) },
            text = {
                Column {
                    KnouxTextField(title, { title = it }, tr("Title", "العنوان"), singleLine = true)
                    Spacer(Modifier.height(6.dp))
                    KnouxTextField(username, { username = it }, tr("Username", "اسم المستخدم"), singleLine = true)
                    Spacer(Modifier.height(6.dp))
                    KnouxTextField(
                        password, { password = it }, tr("Password", "كلمة المرور"), singleLine = true,
                        visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingContent = {
                            TextButton(onClick = { showPassword = !showPassword }) {
                                Text(if (showPassword) tr("Hide", "إخفاء") else tr("Show", "إظهار"), fontSize = 9.sp)
                            }
                        },
                    )
                    Spacer(Modifier.height(6.dp))
                    KnouxTextField(url, { url = it }, tr("URL (optional)", "الرابط (اختياري)"), singleLine = true)
                    Spacer(Modifier.height(6.dp))
                    KnouxTextField(notes, { notes = it }, tr("Notes (optional)", "ملاحظات (اختياري)"), singleLine = false, minLines = 2)
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.save(
                            editing?.id,
                            PasswordPayload(title.trim(), username.trim(), password, url.trim(), notes),
                        ) { editorOpen = false }
                    },
                    enabled = title.isNotBlank() && password.isNotBlank(),
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
            title = { Text(tr("Delete password?", "حذف كلمة المرور؟")) },
            text = { Text(tr("Deletes the encrypted record. This is not a provable physical shred.", "يحذف السجل المشفر. هذا ليس تمزيقًا ماديًا يمكن إثباته.")) },
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
