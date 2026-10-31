package com.knoux.crypt.ui

import android.app.Application
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.BackupConflictException
import com.knoux.crypt.data.BackupInvalidException
import com.knoux.crypt.data.BackupTooLargeException
import com.knoux.crypt.data.BackupUnreadableRecordException
import com.knoux.crypt.data.BackupUnsupportedKindException
import com.knoux.crypt.data.SecretKinds
import com.knoux.crypt.data.VaultBackupManager
import com.knoux.crypt.data.VaultLockedException
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.KnouxTextField
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class RecoveryViewModel(
    application: Application,
    private val container: AppContainer,
) : AndroidViewModel(application) {
    data class UiState(
        val busy: Boolean = false,
        val error: String? = null,
        val message: String? = null,
        val preview: VaultBackupManager.Preview? = null,
        val selectedName: String? = null,
        val restored: Int? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    fun clearFeedback() = _state.update { it.copy(error = null, message = null) }

    fun resetPreview() = _state.update {
        it.copy(preview = null, restored = null, error = null, message = null)
    }

    fun export(uri: Uri, passphrase: String, confirmation: String, kinds: Set<String>) {
        if (_state.value.busy) return
        val access = container.session.currentAccess()
        if (access == null) {
            _state.update { it.copy(error = "Unlock the vault before creating a backup.") }
            return
        }
        if (passphrase.isBlank()) {
            _state.update { it.copy(error = "Enter a recovery passphrase.") }
            return
        }
        if (passphrase != confirmation) {
            _state.update { it.copy(error = "The recovery passphrases do not match.") }
            return
        }
        if (kinds.isEmpty()) {
            _state.update { it.copy(error = "Select at least one section.") }
            return
        }
        val pass = passphrase.toCharArray()
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = null, message = null, restored = null) }
            var temp: File? = null
            try {
                val sealed = withContext(Dispatchers.IO) {
                    container.backups.export(access, pass, kinds)
                }
                withContext(Dispatchers.IO) {
                    val resolver = getApplication<Application>().contentResolver
                    temp = File(getApplication<Application>().cacheDir, "knoux-backup-${System.nanoTime()}.tmp")
                    temp!!.writeBytes(sealed)
                    try {
                        resolver.openOutputStream(uri, "wt")?.use { out ->
                            temp!!.inputStream().use { it.copyTo(out, 64 * 1024) }
                        } ?: throw IOException("Cannot open the selected backup file")
                    } catch (failure: Exception) {
                        runCatching { resolver.delete(uri, null, null) }
                        throw failure
                    }
                }
                _state.update {
                    it.copy(
                        busy = false,
                        message = "Encrypted backup written (${sealed.size} bytes). Store the passphrase separately; it is not saved.",
                    )
                }
            } catch (failure: OutOfMemoryError) {
                _state.update {
                    it.copy(busy = false, error = "Not enough memory for Argon2id. Nothing was written.")
                }
            } catch (failure: Exception) {
                _state.update { it.copy(busy = false, error = describe(failure)) }
            } finally {
                pass.fill('\u0000')
                temp?.delete()
            }
        }
    }

    fun readPreview(uri: Uri, passphrase: String, kinds: Set<String>) {
        if (_state.value.busy) return
        val access = container.session.currentAccess()
        if (access == null) {
            _state.update { it.copy(error = "Unlock the vault before inspecting a backup.") }
            return
        }
        if (passphrase.isBlank()) {
            _state.update { it.copy(error = "Enter the backup passphrase.") }
            return
        }
        val pass = passphrase.toCharArray()
        viewModelScope.launch {
            _state.update {
                it.copy(busy = true, error = null, message = null, preview = null, restored = null, selectedName = uri.lastPathSegment)
            }
            try {
                val bytes = withContext(Dispatchers.IO) { readSealed(uri) }
                val preview = withContext(Dispatchers.IO) {
                    container.backups.preview(access, bytes, pass, kinds)
                }
                _state.update { it.copy(busy = false, preview = preview) }
            } catch (failure: Exception) {
                _state.update { it.copy(busy = false, error = describe(failure), preview = null) }
            } finally {
                pass.fill('\u0000')
            }
        }
    }

    fun restore(uri: Uri, passphrase: String, kinds: Set<String>) {
        if (_state.value.busy) return
        val access = container.session.currentAccess()
        if (access == null) {
            _state.update { it.copy(error = "Unlock the vault before restoring a backup.") }
            return
        }
        if (passphrase.isBlank()) {
            _state.update { it.copy(error = "Enter the backup passphrase.") }
            return
        }
        val pass = passphrase.toCharArray()
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = null, message = null) }
            try {
                val bytes = withContext(Dispatchers.IO) { readSealed(uri) }
                val restored = withContext(Dispatchers.IO) {
                    container.backups.restore(access, bytes, pass, kinds)
                }
                _state.update {
                    it.copy(
                        busy = false,
                        preview = null,
                        restored = restored,
                        message = "$restored record(s) restored. Existing records were not overwritten.",
                    )
                }
            } catch (failure: Exception) {
                _state.update { it.copy(busy = false, error = describe(failure)) }
            } finally {
                pass.fill('\u0000')
            }
        }
    }

    private fun readSealed(uri: Uri): ByteArray {
        val resolver = getApplication<Application>().contentResolver
        return resolver.openInputStream(uri)?.use { input ->
            val out = ByteArrayOutputStream()
            val buffer = ByteArray(64 * 1024)
            var total = 0
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                if (total > VaultBackupManager.MAX_BACKUP_BYTES) {
                    throw BackupTooLargeException("Backup file is larger than this build accepts")
                }
                out.write(buffer, 0, read)
            }
            out.toByteArray()
        } ?: throw IOException("Cannot open the selected backup file")
    }

    private fun describe(failure: Exception): String = when (failure) {
        is VaultLockedException -> "The vault locked; the operation was cancelled."
        is BackupConflictException ->
            "Nothing was imported: ${failure.conflicts} record(s) already exist. This version never overwrites."
        is BackupInvalidException -> failure.message ?: "The backup is invalid."
        is BackupTooLargeException -> failure.message ?: "The backup is too large for this build."
        is BackupUnsupportedKindException -> failure.message ?: "The backup contains an unsupported record type."
        is BackupUnreadableRecordException -> failure.message ?: "A vault record could not be decrypted."
        is IOException -> failure.message ?: "File access failed."
        else -> failure.message ?: "The operation failed."
    }
}

@Composable
fun RecoveryScreen(container: AppContainer, onBack: () -> Unit, onNeedUnlock: () -> Unit) {
    if (container.session.currentAccess() == null) {
        LockedScreen(tr("Recovery", "الاستعادة"), onBack, onNeedUnlock)
        return
    }
    val application = LocalContext.current.applicationContext as Application
    val viewModel: RecoveryViewModel = viewModel(
        factory = viewModelFactory { RecoveryViewModel(application, container) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()

    var mode by remember { mutableStateOf(RecoveryMode.EXPORT) }
    var exportNotes by remember { mutableStateOf(true) }
    var exportPasswords by remember { mutableStateOf(true) }
    var exportTotp by remember { mutableStateOf(true) }
    var passphrase by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    var restorePassphrase by remember { mutableStateOf("") }
    var showPassphrase by remember { mutableStateOf(false) }
    var pickedUri by remember { mutableStateOf<Uri?>(null) }
    var localError by remember { mutableStateOf<String?>(null) }
    val localMissingPassphrase = tr("Enter a recovery passphrase.", "أدخل عبارة استعادة.")
    val localMismatch = tr("The passphrases do not match.", "عبارتا المرور غير متطابقتين.")
    val localNoSections = tr("Select at least one section.", "اختر قسمًا واحدًا على الأقل.")
    val localChooseFile = tr("Choose a backup file first.", "اختر ملف نسخة أولًا.")

    val kinds = remember(exportNotes, exportPasswords, exportTotp) {
        buildSet {
            if (exportNotes) add(SecretKinds.NOTE)
            if (exportPasswords) add(SecretKinds.PASSWORD)
            if (exportTotp) add(SecretKinds.TOTP)
        }
    }
    val suggestedName = remember {
        "knoux-backup-${SimpleDateFormat("yyyyMMdd-HHmm", Locale.US).format(Date())}.knb"
    }

    val exportPicker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        if (uri != null) {
            localError = null
            viewModel.export(uri, passphrase, confirmation, kinds)
        }
    }
    val importPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            pickedUri = uri
            localError = null
            restorePassphrase = ""
            viewModel.resetPreview()
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Recovery", "الاستعادة"), onBack)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            StatusPill(tr("Encrypted KNP2", "مشفر KNP2"), tone = KnouxColors.Success)
            Spacer(Modifier.width(6.dp))
            StatusPill(tr("No gate recovery", "دون استعادة البوابة"), tone = KnouxColors.Warn)
        }
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "Create or restore an encrypted data backup. The backup holds typed vault records only; it does not include the Keystore key, media/files, or the biometric gate.",
                "أنشئ أو استعد نسخة بيانات مشفرة. تحتوي النسخة على سجلات الخزنة المكتوبة فقط؛ ولا تشمل مفتاح Keystore أو الوسائط/الملفات أو بوابة البصمة.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(12.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ModeChip(tr("Export backup", "تصدير نسخة"), mode == RecoveryMode.EXPORT, Modifier.weight(1f)) {
                mode = RecoveryMode.EXPORT
                localError = null
            }
            ModeChip(tr("Restore backup", "استعادة نسخة"), mode == RecoveryMode.IMPORT, Modifier.weight(1f)) {
                mode = RecoveryMode.IMPORT
                localError = null
                viewModel.resetPreview()
            }
        }
        Spacer(Modifier.height(12.dp))

        if (mode == RecoveryMode.EXPORT) {
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Sections", "الأقسام"))
                SectionToggle(tr("Secure notes", "ملاحظات آمنة"), exportNotes) { exportNotes = it }
                SectionToggle(tr("Passwords", "كلمات المرور"), exportPasswords) { exportPasswords = it }
                SectionToggle(tr("Authenticator entries", "حسابات المصادقة"), exportTotp) { exportTotp = it }
                if (kinds.isEmpty()) {
                    Text(
                        tr("Select at least one section.", "اختر قسمًا واحدًا على الأقل."),
                        color = KnouxColors.Alert,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Recovery passphrase", "عبارة استعادة المرور"))
                Spacer(Modifier.height(8.dp))
                KnouxTextField(
                    passphrase,
                    { passphrase = it; localError = null },
                    tr("Passphrase (not stored)", "عبارة المرور (غير مخزنة)"),
                    visualTransformation = if (showPassphrase) VisualTransformation.None else PasswordVisualTransformation(),
                )
                Spacer(Modifier.height(8.dp))
                KnouxTextField(
                    confirmation,
                    { confirmation = it; localError = null },
                    tr("Confirm passphrase", "تأكيد عبارة المرور"),
                    visualTransformation = if (showPassphrase) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingContent = {
                        TextButton(onClick = { showPassphrase = !showPassphrase }) {
                            Text(
                                if (showPassphrase) tr("Hide", "إخفاء") else tr("Show", "إظهار"),
                                color = KnouxColors.Violet,
                                fontSize = 11.sp,
                            )
                        }
                    },
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    tr(
                        "Use a long unique passphrase and keep it somewhere other than the backup file. Losing both makes the backup unreadable.",
                        "استخدم عبارة مرور طويلة وفريدة واحفظها في مكان آخر غير ملف النسخة. فقدان الاثنين يجعل النسخة غير قابلة للقراءة.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
            }
            Spacer(Modifier.height(12.dp))
            KnouxPrimaryButton(
                tr("Create encrypted backup", "إنشاء نسخة مشفرة"),
                {
                    localError = when {
                        passphrase.isBlank() -> localMissingPassphrase
                        passphrase != confirmation -> localMismatch
                        kinds.isEmpty() -> localNoSections
                        else -> null
                    }
                    if (localError == null) exportPicker.launch(suggestedName)
                },
                enabled = !state.busy,
            )
        } else {
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Sections to restore", "أقسام الاستعادة"))
                SectionToggle(tr("Secure notes", "ملاحظات آمنة"), exportNotes) { exportNotes = it; viewModel.resetPreview() }
                SectionToggle(tr("Passwords", "كلمات المرور"), exportPasswords) { exportPasswords = it; viewModel.resetPreview() }
                SectionToggle(tr("Authenticator entries", "حسابات المصادقة"), exportTotp) { exportTotp = it; viewModel.resetPreview() }
            }
            Spacer(Modifier.height(10.dp))
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Backup file", "ملف النسخة"))
                Spacer(Modifier.height(6.dp))
                Text(
                    pickedUri?.lastPathSegment ?: tr("No file selected", "لم يتم اختيار ملف"),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (pickedUri == null) KnouxColors.Muted else KnouxColors.Text,
                )
                Spacer(Modifier.height(8.dp))
                KnouxGhostButton(
                    tr("Choose backup file", "اختيار ملف النسخة"),
                    { importPicker.launch(arrayOf("application/octet-stream", "application/*")) },
                    enabled = !state.busy,
                )
            }
            Spacer(Modifier.height(10.dp))
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Backup passphrase", "عبارة مرور النسخة"))
                Spacer(Modifier.height(8.dp))
                KnouxTextField(
                    restorePassphrase,
                    { restorePassphrase = it; viewModel.resetPreview(); localError = null },
                    tr("Enter the passphrase used for this backup", "أدخل عبارة المرور المستخدمة لهذه النسخة"),
                    visualTransformation = if (showPassphrase) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingContent = {
                        TextButton(onClick = { showPassphrase = !showPassphrase }) {
                            Text(
                                if (showPassphrase) tr("Hide", "إخفاء") else tr("Show", "إظهار"),
                                color = KnouxColors.Violet,
                                fontSize = 11.sp,
                            )
                        }
                    },
                )
            }
            Spacer(Modifier.height(12.dp))
            val uri = pickedUri
            KnouxGhostButton(
                tr("Preview contents", "معاينة المحتوى"),
                {
                    if (uri == null) {
                        localError = localChooseFile
                    } else {
                        viewModel.readPreview(uri, restorePassphrase, kinds)
                    }
                },
                enabled = !state.busy && uri != null && restorePassphrase.isNotBlank(),
            )
            state.preview?.let { preview ->
                Spacer(Modifier.height(10.dp))
                GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Violet.copy(alpha = 0.45f)) {
                    SectionLabel(tr("Restore preview", "معاينة الاستعادة"))
                    Spacer(Modifier.height(6.dp))
                    Text(
                        tr("${preview.total} record(s) in this backup", "${preview.total} سجل في هذه النسخة"),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    preview.counts.forEach { (kind, count) ->
                        val label = when (kind) {
                            SecretKinds.NOTE -> tr("notes", "ملاحظات")
                            SecretKinds.PASSWORD -> tr("passwords", "كلمات المرور")
                            SecretKinds.TOTP -> tr("authenticator", "المصادقة")
                            else -> kind
                        }
                        Text(
                            "$label: $count",
                            style = MaterialTheme.typography.labelSmall,
                            color = KnouxColors.Muted,
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    if (preview.conflicts > 0) {
                        Text(
                            tr(
                                "${preview.conflicts} record(s) already exist. Nothing will be overwritten; this version refuses the import.",
                                "${preview.conflicts} سجل موجود بالفعل. لن تتم الكتابة فوقه؛ يرفض هذا الإصدار الاستيراد.",
                            ),
                            color = KnouxColors.Alert,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    } else {
                        Text(
                            tr("No conflicting records. Restore is allowed.", "لا توجد سجلات متعارضة. يُسمح بالاستعادة."),
                            color = KnouxColors.Success,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                KnouxPrimaryButton(
                    tr("Restore into this vault", "استعادة إلى هذه الخزنة"),
                    { viewModel.restore(uri!!, restorePassphrase, kinds) },
                    enabled = !state.busy && preview.conflicts == 0 && preview.total > 0,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                tr(
                    "On a new device: install the app, set up a new unlock gate, unlock, then restore this file. The old gate and Keystore master key are not recoverable; data is restored into the new vault.",
                    "على جهاز جديد: ثبّت التطبيق، أعدّ بوابة فتح جديدة، افتح الخزنة، ثم استعد هذا الملف. لا يمكن استعادة البوابة القديمة أو مفتاح Keystore الرئيسي؛ تُستعاد البيانات إلى الخزنة الجديدة.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
        }

        localError?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
        }
        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = viewModel::clearFeedback) {
                Text(tr("Dismiss", "إغلاق"), color = KnouxColors.Violet)
            }
        }
        state.message?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = KnouxColors.Success, style = MaterialTheme.typography.bodySmall)
        }
        if (state.busy) {
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = KnouxColors.Violet)
                Spacer(Modifier.width(8.dp))
                Text(
                    tr("Working with Argon2id and vault rows…", "جارٍ العمل مع Argon2id وسجلات الخزنة…"),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Warn.copy(alpha = 0.4f)) {
            SectionLabel(tr("Scope & limitations", "النطاق والقيود"))
            Text(
                tr(
                    "Restores notes, passwords and authenticator entries into a vault created on this device. It does not back up portable files/media or rotate keys, and it is not a biometric-gate recovery or escrow service. Backup format v1; imports never overwrite existing records.",
                    "يستعيد الملاحظات وكلمات المرور وحسابات المصادقة إلى خزنة أُنشئت على هذا الجهاز. لا ينسخ الملفات/الوسائط المحمولة ولا يدوّر المفاتيح، وليس خدمة استعادة بوابة بصمة أو ضمانًا خارجيًا. صيغة النسخة v1؛ لا يستبدل الاستيراد أي سجل موجود.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
        }
        Spacer(Modifier.height(24.dp))
    }
}

private enum class RecoveryMode { EXPORT, IMPORT }

@Composable
private fun ModeChip(label: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Text(
        label,
        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        style = MaterialTheme.typography.labelLarge.copy(fontSize = 12.sp),
        color = if (selected) KnouxColors.Text else KnouxColors.Muted,
        modifier = modifier
            .clip(RoundedCornerShape(11.dp))
            .background(if (selected) KnouxColors.VioletDeep.copy(alpha = 0.65f) else KnouxColors.Raised)
            .clickable(role = Role.Tab, onClick = onClick)
            .padding(vertical = 11.dp),
    )
}

@Composable
private fun SectionToggle(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .toggleable(value = checked, role = Role.Checkbox, onValueChange = onChange)
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = null,
            colors = CheckboxDefaults.colors(
                checkedColor = KnouxColors.Violet,
                uncheckedColor = KnouxColors.LineHot,
                checkmarkColor = KnouxColors.Text,
            ),
        )
        Text(label, style = MaterialTheme.typography.bodySmall)
    }
}
