package com.knoux.crypt.ui

import android.app.Application
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.VaultLockedException
import com.knoux.crypt.viewModelFactory
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.KnouxTextField
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.security.FileEnvelope
import com.knoux.crypt.security.KeyDerivation
import com.knoux.crypt.tr
import java.io.File
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.SecretKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class FileMode { ENCRYPT, DECRYPT }

data class FileCipherUiState(
    val mode: FileMode = FileMode.ENCRYPT,
    val useDeviceKey: Boolean = true,
    val inputUri: Uri? = null,
    val inputName: String? = null,
    val inputSize: Long? = null,
    val busy: Boolean = false,
    val progress: Float = 0f,
    val status: String? = null,
    val error: String? = null,
)

class FileCipherViewModel(application: Application, private val container: AppContainer) : AndroidViewModel(application) {
    private val _state = MutableStateFlow(FileCipherUiState())
    val state: StateFlow<FileCipherUiState> = _state.asStateFlow()
    private var job: Job? = null
    private val random = SecureRandom()

    fun setMode(mode: FileMode) = _state.update { it.copy(mode = mode, status = null, error = null) }
    fun setUseDeviceKey(device: Boolean) = _state.update { it.copy(useDeviceKey = device, error = null) }

    fun selectInput(uri: Uri) {
        viewModelScope.launch {
            val resolver = getApplication<Application>().contentResolver
            var name: String? = null
            var size: Long? = null
            runCatching {
                resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                        if (nameIndex >= 0) name = cursor.getString(nameIndex)
                        if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
                    }
                }
            }
            _state.update { it.copy(inputUri = uri, inputName = name ?: "selected file", inputSize = size, status = null, error = null) }
        }
    }

    fun suggestedOutputName(): String {
        val current = _state.value
        val base = current.inputName?.substringBeforeLast('.')?.ifBlank { "knoux-file" } ?: "knoux-file"
        return if (current.mode == FileMode.ENCRYPT) "$base.knx" else "$base.decrypted"
    }

    fun start(outputUri: Uri, passphrase: String) {
        val current = _state.value
        val inputUri = current.inputUri ?: return
        if (inputUri == outputUri) {
            _state.update { it.copy(error = "Choose a different output file; the input is never overwritten.") }
            return
        }
        if (!current.useDeviceKey && passphrase.isBlank()) {
            _state.update { it.copy(error = "Enter a passphrase for portable mode.") }
            return
        }
        val access = if (current.useDeviceKey) container.session.currentAccess() else null
        if (current.useDeviceKey && access == null) {
            _state.update { it.copy(error = "Unlock the vault before using the device key.") }
            return
        }
        val deviceAccess = access
        val pass = passphrase.toCharArray()
        job = viewModelScope.launch {
            _state.update { it.copy(busy = true, progress = 0f, error = null, status = null) }
            val app = getApplication<Application>()
            val resolver = app.contentResolver
            var tempIn: File? = null
            var tempOut: File? = null
            try {
                withContext(Dispatchers.IO) {
                    tempIn = File(app.cacheDir, "knx-in-${UUID.randomUUID()}.tmp")
                    val source = resolver.openInputStream(inputUri)
                        ?: throw IOException("Cannot open the input file")
                    source.use { input -> tempIn!!.outputStream().use { input.copyTo(it, 64 * 1024) } }
                    val length = tempIn!!.length()
                    tempOut = File(app.cacheDir, "knx-out-${UUID.randomUUID()}.tmp")
                    val envelope = FileEnvelope()
                    tempIn!!.inputStream().use { input ->
                        tempOut!!.outputStream().use { output ->
                            if (current.mode == FileMode.ENCRYPT) {
                                if (current.useDeviceKey) {
                                    container.vaultFiles.encrypt(
                                        deviceAccess!!, input, output, length,
                                    ) { progress -> _state.update { it.copy(progress = progress.fraction) } }
                                } else {
                                    val salt = ByteArray(16).also(random::nextBytes)
                                    val kdf = FileEnvelope.KdfParams(310_000, salt)
                                    val key = KeyDerivation.forEnvelope(pass, kdf)
                                    envelope.encrypt(
                                        input, output, key, FileEnvelope.KeySource.PASSPHRASE,
                                        CONTEXT, length, kdf,
                                    ) { progress -> _state.update { it.copy(progress = progress.fraction) } }
                                }
                            } else {
                                if (current.useDeviceKey) {
                                    container.vaultFiles.decrypt(
                                        deviceAccess!!, input, output,
                                    ) { progress -> _state.update { it.copy(progress = progress.fraction) } }
                                } else {
                                    envelope.decrypt(
                                        input, output, FileEnvelope.KeySource.PASSPHRASE, CONTEXT,
                                        keyProvider = { header ->
                                            KeyDerivation.forEnvelope(pass, requireNotNull(header.kdfParams))
                                        },
                                    ) { progress -> _state.update { it.copy(progress = progress.fraction) } }
                                }
                            }
                        }
                    }
                    resolver.openOutputStream(outputUri, "wt")?.use { out ->
                        tempOut!!.inputStream().use { it.copyTo(out, 64 * 1024) }
                    } ?: throw IOException("Cannot open the output file")
                }
                _state.update {
                    it.copy(
                        busy = false,
                        progress = 1f,
                        status = if (current.mode == FileMode.ENCRYPT) {
                            "Encrypted copy written. The original file was not modified."
                        } else {
                            "Decrypted copy written. The sealed source was not modified."
                        },
                    )
                }
            } catch (failure: Exception) {
                runCatching { resolver.delete(outputUri, null, null) }
                val message = when {
                    failure is VaultLockedException -> "The vault locked during the operation. No output was kept."
                    failure is GeneralSecurityException -> "Authentication failed: wrong key/passphrase or a corrupted container."
                    failure is IOException -> failure.message ?: "File operation failed."
                    else -> failure.message ?: "Operation failed."
                }
                _state.update { it.copy(busy = false, error = message) }
            } finally {
                pass.fill('\u0000')
                tempIn?.delete()
                tempOut?.delete()
            }
        }
    }

    fun cancel() {
        job?.cancel()
        job = null
        _state.update { it.copy(busy = false, error = "Operation cancelled; no output was kept.") }
    }

    companion object {
        private val CONTEXT = "knoux.file.v1".toByteArray(Charsets.UTF_8)
    }
}

@Composable
fun FileCipherScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
) {
    val context = LocalContext.current
    val application = context.applicationContext as Application
    val viewModel: FileCipherViewModel = viewModel(
        factory = viewModelFactory { FileCipherViewModel(application, container) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    var passphrase by remember { mutableStateOf("") }
    var showPassphrase by remember { mutableStateOf(false) }
    var pendingName by remember { mutableStateOf(viewModel.suggestedOutputName()) }

    val inputPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) viewModel.selectInput(uri)
    }
    val outputPicker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        if (uri != null) viewModel.start(uri, passphrase)
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Encrypt Files", "تشفير الملفات"), onBack)
        Spacer(Modifier.height(8.dp))

        val modes = listOf(
            FileMode.ENCRYPT to (tr("Encrypt", "تشفير")),
            FileMode.DECRYPT to (tr("Decrypt", "فك التشفير")),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            modes.forEach { (mode, label) ->
                TextButton(
                    onClick = { viewModel.setMode(mode) },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        label,
                        color = if (state.mode == mode) KnouxColors.Text else KnouxColors.Muted,
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
            }
        }

        GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Line) {
            SectionLabel(tr("Input file", "ملف الإدخال"))
            Spacer(Modifier.height(6.dp))
            Text(
                state.inputName ?: tr("No file selected", "لم يتم اختيار ملف"),
                style = MaterialTheme.typography.bodyMedium,
                color = if (state.inputName == null) KnouxColors.Muted else KnouxColors.Text,
            )
            state.inputSize?.let { Text("$it bytes", style = MaterialTheme.typography.labelSmall) }
            Spacer(Modifier.height(10.dp))
            KnouxGhostButton(tr("Choose input file", "اختيار ملف الإدخال"), { inputPicker.launch(arrayOf("*/*")) }, enabled = !state.busy)
        }
        Spacer(Modifier.height(10.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Key source", "مصدر المفتاح"))
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = { viewModel.setUseDeviceKey(true) }, modifier = Modifier.weight(1f)) {
                    Text(
                        tr("Device key", "مفتاح الجهاز"),
                        color = if (state.useDeviceKey) KnouxColors.Text else KnouxColors.Muted,
                        fontSize = 12.sp,
                    )
                }
                TextButton(onClick = { viewModel.setUseDeviceKey(false) }, modifier = Modifier.weight(1f)) {
                    Text(
                        tr("Passphrase", "عبارة المرور"),
                        color = if (!state.useDeviceKey) KnouxColors.Text else KnouxColors.Muted,
                        fontSize = 12.sp,
                    )
                }
            }
            if (state.useDeviceKey) {
                Text(
                    tr(
                        "Uses the non-exportable Android Keystore data key. The output is tied to this device and requires an unlocked session.",
                        "يستخدم مفتاح بيانات غير قابل للتصدير من Android Keystore. الملف الناتج مرتبط بهذا الجهاز ويتطلب جلسة مفتوحة.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                )
                if (!container.session.isUnlocked) {
                    Spacer(Modifier.height(6.dp))
                    KnouxPrimaryButton(tr("Unlock required", "الفتح مطلوب"), onNeedUnlock)
                }
            } else {
                Spacer(Modifier.height(8.dp))
                KnouxTextField(
                    value = passphrase,
                    onValueChange = { passphrase = it },
                    label = tr("Passphrase", "عبارة المرور"),
                    singleLine = true,
                    visualTransformation = if (showPassphrase) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingContent = {
                        TextButton(onClick = { showPassphrase = !showPassphrase }) {
                            Text(if (showPassphrase) tr("Hide", "إخفاء") else tr("Show", "إظهار"), fontSize = 10.sp)
                        }
                    },
                )
                Text(
                    tr(
                        "Device-key files use KNF2: a random per-file DEK is wrapped by the Keystore root with a provider-generated IV, then chunks use that DEK. Legacy KNF1 device files remain readable. Passphrase files still use KNF1/PBKDF2; Argon2id covers KNP2 text.",
                        "تستخدم ملفات مفتاح الجهاز KNF2: يُلف مفتاح بيانات عشوائي لكل ملف بمفتاح جذر Keystore باستخدام IV يولده المزوّد، ثم تستخدم القطع ذلك المفتاح. تبقى ملفات KNF1 القديمة بمفتاح الجهاز قابلة للقراءة. ما زالت ملفات عبارة المرور تستخدم KNF1/PBKDF2؛ ويغطي Argon2id نص KNP2.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
        Spacer(Modifier.height(10.dp))

        val readyToStart = state.inputUri != null && !state.busy &&
            (state.useDeviceKey || passphrase.isNotBlank())
        KnouxPrimaryButton(
            text = if (state.mode == FileMode.ENCRYPT) {
                tr("Choose output & encrypt", "اختيار الخرج والتشفير")
            } else {
                tr("Choose output & decrypt", "اختيار الخرج وفك التشفير")
            },
            onClick = {
                pendingName = viewModel.suggestedOutputName()
                outputPicker.launch(pendingName)
            },
            enabled = readyToStart,
        )
        if (state.busy) {
            Spacer(Modifier.height(10.dp))
            LinearProgressIndicator(progress = { state.progress }, modifier = Modifier.fillMaxWidth())
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.width(14.dp).height(14.dp), strokeWidth = 2.dp, color = KnouxColors.Violet)
                Spacer(Modifier.width(8.dp))
                Text(
                    tr("Processing", "جارٍ المعالجة") + " ${(state.progress * 100).toInt()}%",
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(Modifier.width(8.dp))
                TextButton(onClick = viewModel::cancel) { Text(tr("Cancel", "إلغاء"), color = KnouxColors.Alert) }
            }
        }
        state.status?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = KnouxColors.Success, style = MaterialTheme.typography.bodySmall)
        }
        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(12.dp))
        Text(
            tr(
                "The source file is preserved; only a new output document is written. SAF grants access per document and no broad storage permission is requested.",
                "يُحفظ الملف المصدر؛ يُكتب مستند خرج جديد فقط. يمنح SAF وصولًا لكل مستند ولا يُطلب إذن تخزين واسع.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(24.dp))
    }
}
