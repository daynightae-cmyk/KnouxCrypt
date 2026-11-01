package com.knoux.crypt.ui

import android.app.Application
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.ArchiveRecordPayload
import com.knoux.crypt.data.ArchiveService
import com.knoux.crypt.data.VaultLockedException
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.KnouxTextField
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class ArchiveMode { CREATE, OPEN }
enum class ArchiveKeyChoice { DEVICE, PASSPHRASE }

data class QueuedFile(val uri: Uri, val name: String, val size: Long, val mimeType: String)

data class ArchiveUiState(
    val mode: ArchiveMode = ArchiveMode.CREATE,
    val unlocked: Boolean = false,
    val queued: List<QueuedFile> = emptyList(),
    val archiveName: String = "project_bundle.karc",
    val compressed: Boolean = true,
    val keyChoice: ArchiveKeyChoice = ArchiveKeyChoice.DEVICE,
    val busy: Boolean = false,
    val progress: Float = 0f,
    val created: ArchiveService.Created? = null,
    val entries: List<ArchiveService.EntryInfo> = emptyList(),
    val extracted: List<String> = emptyList(),
    val records: List<ArchiveRecordPayload> = emptyList(),
    val status: String? = null,
    val failed: Boolean = false,
)

class ArchiveViewModel(application: Application, private val container: AppContainer) : AndroidViewModel(application) {
    private val _state = MutableStateFlow(ArchiveUiState())
    val state: StateFlow<ArchiveUiState> = _state.asStateFlow()
    private var job: Job? = null
    private var passphrase: String = ""
    private var openUri: Uri? = null

    fun attach() {
        val access = container.session.currentAccess()
        _state.update { it.copy(unlocked = access != null) }
        if (access == null) {
            _state.update { it.copy(records = emptyList(), entries = emptyList(), created = null) }
            return
        }
        viewModelScope.launch {
            runCatching { container.archives.observeRecords(access).collect { rows ->
                _state.update { it.copy(records = rows) }
            } }
        }
    }

    fun setMode(mode: ArchiveMode) = _state.update { it.copy(mode = mode, status = null, failed = false) }
    fun setCompressed(compressed: Boolean) = _state.update { it.copy(compressed = compressed) }
    fun setKeyChoice(choice: ArchiveKeyChoice) = _state.update { it.copy(keyChoice = choice) }
    fun setName(name: String) = _state.update { it.copy(archiveName = name.take(80)) }
    fun setPassphrase(value: String) { passphrase = value.take(128) }
    fun clearStatus() = _state.update { it.copy(status = null, failed = false) }

    fun addFiles(uris: List<Uri>) {
        val app = getApplication<Application>()
        viewModelScope.launch {
            val added = withContext(Dispatchers.IO) {
                uris.mapNotNull { uri ->
                    val info = runCatching {
                        app.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
                            ?.use { cursor ->
                                if (!cursor.moveToFirst()) return@use null
                                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                                val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                                val name = if (nameIndex >= 0) cursor.getString(nameIndex) else null
                                val size = if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) cursor.getLong(sizeIndex) else null
                                name to size
                            }
                    }.getOrNull() ?: return@mapNotNull null
                    QueuedFile(
                        uri = uri,
                        name = info.first ?: "file",
                        size = info.second ?: 0L,
                        mimeType = app.contentResolver.getType(uri) ?: "application/octet-stream",
                    )
                }
            }
            _state.update { current ->
                val merged = (current.queued + added).distinctBy { it.uri }
                current.copy(
                    queued = merged,
                    status = if (added.isEmpty()) "no-files-read" else null,
                    failed = added.isEmpty(),
                    created = null,
                )
            }
        }
    }

    fun removeFile(uri: Uri) = _state.update { it.copy(queued = it.queued.filterNot { file -> file.uri == uri }, created = null) }

    fun clearQueue() = _state.update { it.copy(queued = emptyList(), created = null, status = null) }

    fun cancel() {
        job?.cancel()
        _state.update { it.copy(busy = false, progress = 0f, status = "cancelled", failed = false) }
    }

    fun createArchive(destination: Uri) {
        val access = container.session.currentAccess()
        val current = _state.value
        if (current.keyChoice == ArchiveKeyChoice.DEVICE && access == null) {
            _state.update { it.copy(status = "locked", failed = true) }
            return
        }
        if (current.queued.isEmpty()) {
            _state.update { it.copy(status = "empty-queue", failed = true) }
            return
        }
        if (current.keyChoice == ArchiveKeyChoice.PASSPHRASE && passphrase.isBlank()) {
            _state.update { it.copy(status = "passphrase-required", failed = true) }
            return
        }
        if (ArchiveService.sanitize(current.archiveName.removeSuffix(".karc")) == null) {
            _state.update { it.copy(status = "unsafe-archive-name", failed = true) }
            return
        }
        val app = getApplication<Application>()
        val items = current.queued.map { file ->
            ArchiveService.Item(
                name = file.name,
                length = file.size,
            ) {
                requireNotNull(app.contentResolver.openInputStream(file.uri)) { "the file could not be opened" }
            }
        }
        job?.cancel()
        job = viewModelScope.launch {
            _state.update { it.copy(busy = true, progress = 0f, status = null, failed = false, created = null) }
            val temp = File(app.cacheDir, "karc-out-${UUID.randomUUID()}.bin")
            val outcome = withContext(Dispatchers.IO) {
                runCatching {
                    FileOutputStream(temp).use { sink ->
                        if (current.keyChoice == ArchiveKeyChoice.DEVICE) {
                            container.archives.create(
                                access = requireNotNull(access),
                                items = items,
                                output = sink,
                                compressed = current.compressed,
                                onProgress = { progress -> _state.update { it.copy(progress = progress.fraction) } },
                            )
                        } else {
                            container.archives.createWithPassphrase(
                                passphrase = passphrase.toCharArray(),
                                items = items,
                                output = sink,
                                compressed = current.compressed,
                                onProgress = { progress -> _state.update { it.copy(progress = progress.fraction) } },
                            )
                        }
                    }
                }
            }
            val result = outcome.getOrNull()
            if (result is ArchiveService.Outcome.Success && temp.exists()) {
                val copied = withContext(Dispatchers.IO) {
                    runCatching {
                        app.contentResolver.openOutputStream(destination, "w").use { sink ->
                            requireNotNull(sink).use { output -> temp.inputStream().use { it.copyTo(output, 64 * 1024) } }
                        }
                    }.isSuccess
                }
                if (copied) {
                    if (current.keyChoice == ArchiveKeyChoice.DEVICE && access != null) {
                        container.archives.record(
                            access,
                            current.archiveName,
                            result.value,
                            keySource = "device-key",
                        )
                    }
                    _state.update {
                        it.copy(busy = false, progress = 1f, created = result.value, status = "created", failed = false)
                    }
                } else {
                    _state.update { it.copy(busy = false, status = "destination-unwritable", failed = true) }
                }
            } else {
                val failure = (result as? ArchiveService.Outcome.Failed)?.failure
                _state.update {
                    it.copy(
                        busy = false,
                        progress = 0f,
                        failed = true,
                        status = failure?.let { f -> failureKey(f) } ?: outcome.exceptionOrNull()?.let { e ->
                            if (e is VaultLockedException) "locked" else "io-failure"
                        } ?: "unknown-failure",
                    )
                }
            }
            runCatching { temp.delete() }
        }
    }

    private fun failureKey(failure: ArchiveService.ArchiveFailure): String = when (failure) {
        is ArchiveService.ArchiveFailure.Empty -> "empty-queue"
        is ArchiveService.ArchiveFailure.TooManyEntries -> "too-many-entries"
        is ArchiveService.ArchiveFailure.UnsafeName -> "unsafe-name"
        is ArchiveService.ArchiveFailure.DuplicateName -> "duplicate-name"
        is ArchiveService.ArchiveFailure.TooLarge -> "too-large"
        is ArchiveService.ArchiveFailure.Locked -> "locked"
        is ArchiveService.ArchiveFailure.NotAnArchive -> "not-an-archive"
        is ArchiveService.ArchiveFailure.Tampered -> "tampered"
        is ArchiveService.ArchiveFailure.Unsupported -> "unsupported"
    }

    fun openArchive(uri: Uri) {
        val access = container.session.currentAccess()
        if (access == null && _state.value.keyChoice == ArchiveKeyChoice.DEVICE) {
            _state.update { it.copy(status = "locked", failed = true) }
            return
        }
        openUri = uri
        val app = getApplication<Application>()
        viewModelScope.launch {
            _state.update { it.copy(busy = true, status = null, failed = false, entries = emptyList(), extracted = emptyList()) }
            val outcome = withContext(Dispatchers.IO) {
                runCatching {
                    app.contentResolver.openInputStream(uri).use { input ->
                        requireNotNull(input)
                        val opened = if (_state.value.keyChoice == ArchiveKeyChoice.DEVICE) {
                            container.archives.open(requireNotNull(access), input)
                        } else {
                            container.archives.openWithPassphrase(passphrase.toCharArray(), input)
                        }
                        opened.use { archive ->
                            when (val listed = container.archives.verifyDirectory(archive)) {
                                is ArchiveService.Outcome.Success -> listed.value
                                is ArchiveService.Outcome.Failed -> throw ArchiveOpenException(listed.failure)
                            }
                        }
                    }
                }
            }
            val entries = outcome.getOrNull()
            if (entries != null) {
                _state.update { it.copy(busy = false, entries = entries, progress = 1f, status = "listed") }
            } else {
                val error = outcome.exceptionOrNull()
                _state.update {
                    it.copy(
                        busy = false,
                        failed = true,
                        status = when {
                            error is ArchiveOpenException -> failureKey(error.failure)
                            error is VaultLockedException -> "locked"
                            error is com.knoux.crypt.security.TamperedFileException -> "tampered"
                            error is IOException -> "unreadable"
                            else -> "not-an-archive"
                        },
                    )
                }
            }
        }
    }

    /**
     * Extracts every entry into the chosen tree. Each file is verified into a
     * temporary file first and only then written, so a corrupted archive cannot
     * leave half-written documents at the destination.
     */
    fun extractAllToTree(treeUri: Uri) {
        val access = container.session.currentAccess()
        val uri = openUri ?: return
        val entries = _state.value.entries
        if (entries.isEmpty()) {
            _state.update { it.copy(status = "nothing-to-extract", failed = true) }
            return
        }
        if (_state.value.keyChoice == ArchiveKeyChoice.DEVICE && access == null) {
            _state.update { it.copy(status = "locked", failed = true) }
            return
        }
        val app = getApplication<Application>()
        viewModelScope.launch {
            _state.update { it.copy(busy = true, status = null, failed = false, extracted = emptyList()) }
            val written = mutableListOf<String>()
            val outcome = withContext(Dispatchers.IO) {
                runCatching {
                    app.contentResolver.openInputStream(uri).use { input ->
                        val opened = if (_state.value.keyChoice == ArchiveKeyChoice.DEVICE) {
                            container.archives.open(requireNotNull(access), requireNotNull(input))
                        } else {
                            container.archives.openWithPassphrase(passphrase.toCharArray(), requireNotNull(input))
                        }
                        opened.use { archive ->
                            val tree = treeDocumentUri(treeUri)
                            entries.forEach { entry ->
                                val temp = File(app.cacheDir, "karc-extract-${UUID.randomUUID()}.bin")
                                try {
                                    FileOutputStream(temp).use { sink ->
                                        when (val result = container.archives.extract(archive, entry.index, sink)) {
                                            is ArchiveService.Outcome.Success -> Unit
                                            is ArchiveService.Outcome.Failed -> throw ArchiveOpenException(result.failure)
                                        }
                                    }
                                    val created = DocumentsContract.createDocument(
                                        app.contentResolver,
                                        tree,
                                        entry.mimeTypeForName(),
                                        entry.name,
                                    )
                                    if (created == null) throw IOException("the destination refused ${entry.name}")
                                    app.contentResolver.openOutputStream(created, "w").use { sink ->
                                        requireNotNull(sink).use { output -> temp.inputStream().use { it.copyTo(output, 64 * 1024) } }
                                    }
                                    written += entry.name
                                } finally {
                                    runCatching { temp.delete() }
                                }
                            }
                        }
                    }
                }
            }
            _state.update {
                it.copy(
                    busy = false,
                    extracted = written,
                    failed = outcome.isFailure,
                    status = if (outcome.isSuccess) "extracted" else {
                        val error = outcome.exceptionOrNull()
                        when {
                            error is ArchiveOpenException -> failureKey(error.failure)
                            error is VaultLockedException -> "locked"
                            else -> "extract-failed"
                        }
                    },
                )
            }
        }
    }

    private fun ArchiveService.EntryInfo.mimeTypeForName(): String = when (name.substringAfterLast('.', "").lowercase()) {
        "txt", "md" -> "text/plain"
        "pdf" -> "application/pdf"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "mp4" -> "video/mp4"
        "zip", "karc" -> "application/octet-stream"
        else -> "application/octet-stream"
    }

    private class ArchiveOpenException(val failure: ArchiveService.ArchiveFailure) : IOException("archive open failed")
}

/** SAF tree URIs carry no document id; the tree root is the container document. */
private fun treeDocumentUri(treeUri: Uri): Uri = DocumentsContract.buildDocumentUriUsingTree(
    treeUri,
    DocumentsContract.getTreeDocumentId(treeUri),
)

/**
 * Encrypted Archive (TASK 21).
 *
 * The container is the same KNF2 envelope File Cipher already uses, and the
 * payload is a plain ZIP, so nothing here is a private format. The screen's job is
 * to make the safety decisions visible: encryption and the manifest are not
 * optional, names are checked before anything is written, and extraction verifies
 * each entry into a temporary file before the destination ever sees a byte.
 */
@Composable
fun EncryptedArchiveScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
) {
    val context = LocalContext.current
    val application = context.applicationContext as Application
    val viewModel: ArchiveViewModel = viewModel(
        factory = viewModelFactory { ArchiveViewModel(application, container) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    val unlocked by container.session.unlocked.collectAsStateWithLifecycle()
    var passphrase by remember { mutableStateOf("") }

    val addFiles = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        viewModel.addFiles(uris)
    }
    val saveArchive = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        if (uri != null) viewModel.createArchive(uri)
    }
    val openArchive = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) viewModel.openArchive(uri)
    }
    val extractTree = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) viewModel.extractAllToTree(uri)
    }

    LaunchedEffect(unlocked) { viewModel.attach() }
    LaunchedEffect(passphrase) { viewModel.setPassphrase(passphrase) }

    val totalBytes = state.queued.sumOf { it.size }
    val modeLabels = listOf(
        ArchiveMode.CREATE to tr("Create", "إنشاء"),
        ArchiveMode.OPEN to tr("Open", "فتح"),
    )

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Encrypted Archive", "أرشيف مشفر"), onBack)
        Spacer(Modifier.height(6.dp))
        Text(
            tr(
                "Bundle multiple files into one encrypted archive.",
                "اجمع عدة ملفات في أرشيف مشفر واحد.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Muted,
        )
        Spacer(Modifier.height(12.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            modeLabels.forEach { (mode, label) ->
                TextButton(onClick = { viewModel.setMode(mode) }) {
                    Text(
                        label,
                        color = if (state.mode == mode) KnouxColors.Text else KnouxColors.Faint,
                        fontSize = 13.sp,
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))

        if (state.mode == ArchiveMode.CREATE) {
            GlassCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            tr("%d files queued".format(state.queued.size), "%d ملفات في القائمة".format(state.queued.size)),
                            style = MaterialTheme.typography.bodyMedium,
                            color = KnouxColors.Text,
                        )
                        Text(
                            tr("Total size: %s".format(formatBytes(totalBytes)), "الحجم الكلي: %s".format(formatBytes(totalBytes))),
                            style = MaterialTheme.typography.labelSmall,
                            color = KnouxColors.Faint,
                        )
                    }
                    TextButton(onClick = { addFiles.launch(arrayOf("*/*")) }) {
                        Text(tr("Add", "إضافة"), color = KnouxColors.Violet, fontSize = 11.sp)
                    }
                    if (state.queued.isNotEmpty()) {
                        TextButton(onClick = { viewModel.clearQueue() }) {
                            Text(tr("Clear", "مسح"), color = KnouxColors.Alert, fontSize = 11.sp)
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                if (state.queued.isEmpty()) {
                    Text(
                        tr("No files queued yet.", "لا ملفات في القائمة بعد."),
                        style = MaterialTheme.typography.bodySmall,
                        color = KnouxColors.Faint,
                    )
                }
                state.queued.forEach { file ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(file.name, style = MaterialTheme.typography.bodyMedium, color = KnouxColors.Text)
                            Text(
                                "${formatBytes(file.size)} · ${file.mimeType}",
                                style = MaterialTheme.typography.labelSmall,
                                color = KnouxColors.Faint,
                            )
                        }
                        TextButton(onClick = { viewModel.removeFile(file.uri) }) {
                            Text(tr("Remove", "إزالة"), color = KnouxColors.Alert, fontSize = 11.sp)
                        }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))

            GlassCard(Modifier.fillMaxWidth()) {
                KnouxTextField(state.archiveName, { viewModel.setName(it) }, tr("Archive name", "اسم الأرشيف"))
            }
            Spacer(Modifier.height(10.dp))

            GlassCard(Modifier.fillMaxWidth()) {
                ArchiveToggleRow(
                    title = tr("Compression", "الضغط"),
                    subtitle = tr("Reduce file size (recommended)", "تقليل الحجم (مستحسن)"),
                    checked = state.compressed,
                    onToggle = { viewModel.setCompressed(it) },
                    enabled = true,
                )
                ArchiveToggleRow(
                    title = tr("Encryption required", "التشفير إلزامي"),
                    subtitle = tr(
                        "Always on. An archive that could be silently unencrypted would not be an encrypted archive.",
                        "دائمًا. أرشيف قد يبقى غير مشفر دون علمك ليس أرشيفًا مشفرًا.",
                    ),
                    checked = true,
                    onToggle = { },
                    enabled = false,
                )
                ArchiveToggleRow(
                    title = tr("Include file manifest", "تضمين قائمة الملفات"),
                    subtitle = tr(
                        "Always on. The manifest is what lets extraction verify sizes and digests before writing.",
                        "دائمًا. القائمة هي ما يتيح للفتح التحقق من الأحجام والبصمات قبل الكتابة.",
                    ),
                    checked = true,
                    onToggle = { },
                    enabled = false,
                )
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { viewModel.setKeyChoice(ArchiveKeyChoice.DEVICE) }) {
                        Text(
                            tr("Device key", "مفتاح الجهاز"),
                            color = if (state.keyChoice == ArchiveKeyChoice.DEVICE) KnouxColors.Text else KnouxColors.Faint,
                            fontSize = 12.sp,
                        )
                    }
                    TextButton(onClick = { viewModel.setKeyChoice(ArchiveKeyChoice.PASSPHRASE) }) {
                        Text(
                            tr("Passphrase", "عبارة مرور"),
                            color = if (state.keyChoice == ArchiveKeyChoice.PASSPHRASE) KnouxColors.Text else KnouxColors.Faint,
                            fontSize = 12.sp,
                        )
                    }
                }
                Text(
                    if (state.keyChoice == ArchiveKeyChoice.DEVICE) {
                        tr(
                            "Sealed with a per-file key wrapped by this device's Keystore root. Only this device can open it.",
                            "مغلف بمفتاح لكل ملف يلفه جذر مخزن المفاتيح في هذا الجهاز. هذا الجهاز وحده يستطيع الفتح.",
                        )
                    } else {
                        tr(
                            "Sealed with a PBKDF2 key from your passphrase. Portable, and only as strong as the passphrase.",
                            "مغلف بمفتاح PBKDF2 من عبارة مرورك. قابل للنقل، وقوته بقوة عبارة المرور.",
                        )
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
                if (state.keyChoice == ArchiveKeyChoice.PASSPHRASE) {
                    Spacer(Modifier.height(6.dp))
                    KnouxTextField(
                        passphrase,
                        { passphrase = it },
                        tr("Passphrase", "عبارة المرور"),
                    )
                }
            }
            Spacer(Modifier.height(10.dp))

            if (state.busy) {
                Text(
                    tr("Working… %d%%".format((state.progress * 100).toInt()), "جارٍ العمل… %d%%".format((state.progress * 100).toInt())),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Violet,
                )
                Spacer(Modifier.height(4.dp))
                KnouxGhostButton(tr("Cancel", "إلغاء"), { viewModel.cancel() })
                Spacer(Modifier.height(8.dp))
            }

            KnouxPrimaryButton(
                text = tr("Create Archive", "أنشئ الأرشيف"),
                onClick = { saveArchive.launch(state.archiveName.ifBlank { "archive.karc" }) },
                enabled = state.queued.isNotEmpty() && !state.busy &&
                    (state.keyChoice == ArchiveKeyChoice.PASSPHRASE || unlocked),
            )
            Spacer(Modifier.height(8.dp))
            if (!unlocked && state.keyChoice == ArchiveKeyChoice.DEVICE) {
                TextButton(onClick = onNeedUnlock) {
                    Text(tr("Unlock the vault to seal with the device key", "افتح الخزنة للتغليف بمفتاح الجهاز"), color = KnouxColors.Violet, fontSize = 11.sp)
                }
            }
        } else {
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Open an archive", "افتح أرشيفًا"))
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    KnouxGhostButton(tr("Choose .karc file", "اختر ملف ‎.karc"), { openArchive.launch(arrayOf("*/*")) }, Modifier.weight(1f))
                    KnouxGhostButton(
                        tr("Extract all to a folder", "استخرج الكل إلى مجلد"),
                        { extractTree.launch(null) },
                        Modifier.weight(1f),
                        enabled = state.entries.isNotEmpty() && !state.busy,
                    )
                }
                Spacer(Modifier.height(6.dp))
                if (state.keyChoice == ArchiveKeyChoice.PASSPHRASE) {
                    KnouxTextField(passphrase, { passphrase = it }, tr("Passphrase", "عبارة المرور"))
                }
                Text(
                    tr(
                        "Extraction writes new documents into the folder you pick. It never overwrites the files the archive was built from.",
                        "يستخرج الاستخراج مستندات جديدة في المجلد الذي تختاره، ولا يستبدل الملفات الأصلية التي بُني الأرشيف منها.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
            }
            Spacer(Modifier.height(10.dp))

            if (state.entries.isNotEmpty()) {
                GlassCard(Modifier.fillMaxWidth()) {
                    SectionLabel(tr("Contents", "المحتويات"))
                    Spacer(Modifier.height(6.dp))
                    state.entries.forEach { entry ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(entry.name, style = MaterialTheme.typography.bodyMedium, color = KnouxColors.Text)
                                Text(
                                    "${formatBytes(entry.size)} · ${entry.digestHex.take(16)}…",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = FontFamily.Monospace,
                                    color = KnouxColors.Faint,
                                )
                            }
                        }
                    }
                    if (state.extracted.isNotEmpty()) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            tr("%d files extracted".format(state.extracted.size), "استُخرج %d ملفًا".format(state.extracted.size)),
                            style = MaterialTheme.typography.labelSmall,
                            color = KnouxColors.Success,
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
            }

            if (state.records.isNotEmpty()) {
                GlassCard(Modifier.fillMaxWidth()) {
                    SectionLabel(tr("Archives you created", "الأرشيفات التي أنشأتها"))
                    Spacer(Modifier.height(6.dp))
                    state.records.take(8).forEach { record ->
                        InfoRow(
                            record.label,
                            "${record.entryCount} · ${formatBytes(record.plaintextBytes)} · ${record.keySource}",
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
            }
        }

        state.status?.let { key ->
            Spacer(Modifier.height(8.dp))
            StatusPill(
                text = statusText(key),
                tone = if (state.failed) KnouxColors.Alert else KnouxColors.Success,
            )
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun ArchiveToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onToggle: (Boolean) -> Unit,
    enabled: Boolean,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium, color = KnouxColors.Text)
            Text(subtitle, style = MaterialTheme.typography.labelSmall, color = if (enabled) KnouxColors.Faint else KnouxColors.Warn)
        }
        Switch(checked = checked, onCheckedChange = onToggle, enabled = enabled)
    }
}

@Composable
private fun statusText(key: String): String = when (key) {
    "created" -> tr("Archive created and saved where you chose.", "أُنشئ الأرشيف وحُفظت حيث اخترت.")
    "listed" -> tr("Archive opened. Every entry verified against its manifest.", "فُتح الأرشيف، وكل مدخل مطابق لقائمته.")
    "extracted" -> tr("Entries extracted and verified.", "استُخرجت المدخلات وتحققت.")
    "cancelled" -> tr("Cancelled. Nothing was written.", "أُلغيت، ولم يُكتب شيء.")
    "locked" -> tr("Unlock the vault to seal or open a device-key archive.", "افتح الخزنة لتغليف أو فتح أرشيف بمفتاح الجهاز.")
    "empty-queue" -> tr("Add at least one file first.", "أضف ملفًا واحدًا على الأقل.")
    "too-many-entries" -> tr("That is more entries than an archive may hold.", "هذا عدد مدخلات يتجاوز حد الأرشيف.")
    "unsafe-name" -> tr("A file name must be a single safe segment: no path, no '..', no control characters.", "يجب أن يكون اسم الملف مقطعًا واحدًا آمنًا: بلا مسار ولا '..' ولا محارف تحكم.")
    "duplicate-name" -> tr("Two files share the same name inside the archive.", "ملفان يتشاركان الاسم داخل الأرشيف.")
    "too-large" -> tr("A quota stopped this archive: a file is larger than the allowed limit.", "أوقف نطاقُ الحد هذا الأرشيف: أحد الملفات أكبر من المسموح.")
    "not-an-archive" -> tr("This file is not a KNOUX archive, or it was not built with this key type.", "هذا الملف ليس أرشيف KNOUX، أو لم يُبنَ بنوع المفتاح هذا.")
    "tampered" -> tr("The archive did not authenticate. Nothing was extracted.", "لم تثبت صحة الأرشيف، ولم يستخرج شيء.")
    "unsupported" -> tr("This container format is not supported.", "صيغة هذه الحزمة غير مدعومة.")
    "destination-unwritable" -> tr("The destination refused the archive. Your source files are untouched.", "رفضت الوجهة الأرشيف. ملفاتك الأصلية لم تُمس.")
    "unsafe-archive-name" -> tr("Choose a plain archive name without a path.", "اختر اسم أرشيف بسيطًا بلا مسار.")
    "passphrase-required" -> tr("Enter a passphrase for a portable archive.", "أدخل عبارة مرور للأرشيف القابل للنقل.")
    "nothing-to-extract" -> tr("Open an archive first.", "افتح أرشيفًا أولًا.")
    "no-files-read" -> tr("The selected files could not be read.", "تعذرت قراءة الملفات المحددة.")
    "unreadable" -> tr("The archive could not be read.", "تعذر قراءة الأرشيف.")
    "extract-failed" -> tr("Extraction failed partway. Files already written are verified ones.", "تعثر الاستخراج. الملفات المكتوبة بالفعل هي المتحقق منها.")
    "io-failure" -> tr("A storage error stopped the operation.", "خطأ تخزين أوقف العملية.")
    else -> tr("Ready.", "جاهز.")
}
