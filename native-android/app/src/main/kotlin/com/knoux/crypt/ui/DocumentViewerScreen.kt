package com.knoux.crypt.ui

import android.app.Application
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.DocumentDescriptor
import com.knoux.crypt.data.DocumentFailure
import com.knoux.crypt.data.DocumentMode
import com.knoux.crypt.data.DocumentRejectedException
import com.knoux.crypt.data.DocumentViewerPolicy
import com.knoux.crypt.data.DocumentViewerService
import com.knoux.crypt.data.VaultLockedException
import com.knoux.crypt.data.VaultMediaItem
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * A message produced outside composition, so the ViewModel never has to call a
 * composable translator. The screen localizes it at draw time.
 */
data class BilingualText(val english: String, val arabic: String)

/** Everything the viewer UI needs to draw one truthful state. */
data class DocumentViewerState(
    val descriptor: DocumentDescriptor? = null,
    val collectionLabel: String? = null,
    val loading: Boolean = false,
    val opened: Boolean = false,
    val text: String? = null,
    val page: Int = 0,
    val pageCount: Int = 0,
    val pageBitmap: Bitmap? = null,
    val message: BilingualText? = null,
    val secondsRemaining: Int = DocumentViewerPolicy.IDLE_CLEAR_SECONDS,
)

/**
 * TASK 30 viewer state machine.
 *
 * Plaintext lifetime is owned here: text is held only in this process, a PDF
 * lease is created only through the service, and both are dropped on close, on
 * lock, on process death and after the idle countdown.
 */
class DocumentViewerViewModel(
    application: Application,
    private val container: AppContainer,
    private val recordId: String,
) : AndroidViewModel(application) {
    private val viewer: DocumentViewerService = container.documentViewer
    private val vault = container.shadowVault

    private val _state = MutableStateFlow(DocumentViewerState())
    val state: StateFlow<DocumentViewerState> = _state.asStateFlow()
    val unlocked: StateFlow<Boolean> = container.session.unlocked

    private var renderer: PdfRenderer? = null
    private var descriptorHandle: ParcelFileDescriptor? = null
    private var lease: File? = null
    private var idleJob: Job? = null

    /** True only when a real open operation is in flight, so the UI never fakes progress. */
    private var openJob: Job? = null

    init {
        viewModelScope.launch {
            container.session.unlocked.collectLatest { isUnlocked ->
                if (!isUnlocked) {
                    releaseAll(
                        BilingualText(
                            "The vault locked, so the decrypted copy was released.",
                            "أُقفلت الخزنة، لذلك أُطلقت النسخة المفكوكة.",
                        ),
                    )
                }
            }
        }
    }

    fun load() {
        if (openJob?.isActive == true) return
        val access = container.session.currentAccess() ?: return
        openJob = viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, message = null)
            val descriptor = runCatching {
                vault.observe(access).first().firstOrNull { it.id == recordId }
                    ?.let { DocumentViewerPolicy.descriptor(it) }
            }.getOrNull()
            if (descriptor == null) {
                _state.value = _state.value.copy(
                    loading = false,
                    descriptor = null,
                    message = BilingualText(
                        "This item is not an openable document, is larger than the viewer limit, or its encrypted metadata could not be read.",
                        "هذا العنصر ليس مستندًا قابلًا للفتح، أو أنه يتجاوز حد العارض، أو تعذر قراءة بياناته الوصفية المشفرة.",
                    ),
                )
                return@launch
            }
            _state.value = _state.value.copy(
                loading = false,
                descriptor = descriptor,
                collectionLabel = descriptor.collectionId.takeIf { it.isNotBlank() }?.let { id ->
                    runCatching { container.vaultCollections.list(access).firstOrNull { it.id == id }?.label }
                        .getOrNull()
                },
            )
            open(descriptor, access)
        }
    }

    private suspend fun open(descriptor: DocumentDescriptor, access: com.knoux.crypt.data.VaultAccess) {
        _state.value = _state.value.copy(loading = true, message = null)
        val result = runCatching {
            when (descriptor.mode) {
                DocumentMode.TEXT -> viewer.readText(access, descriptor) to null
                DocumentMode.PDF -> null to viewer.openPdfLease(access, descriptor)
                DocumentMode.UNSUPPORTED -> throw DocumentRejectedException(DocumentFailure.UNSUPPORTED_TYPE)
            }
        }
        result.onSuccess { (decoded, staged) ->
            if (decoded != null) {
                _state.value = _state.value.copy(
                    loading = false,
                    opened = true,
                    text = decoded,
                    page = 0,
                    pageCount = 0,
                    pageBitmap = null,
                )
                startIdleTimer()
            } else if (staged != null) {
                lease = staged
                val pages = runCatching { attachRenderer(staged) }
                pages.onSuccess { count ->
                    _state.value = _state.value.copy(
                        loading = false,
                        opened = true,
                        text = null,
                        pageCount = count,
                        page = 0,
                    )
                    renderPage(0)
                    startIdleTimer()
                }.onFailure { failure ->
                    viewer.closeLease(descriptor.recordId)
                    lease = null
                    _state.value = _state.value.copy(
                        loading = false,
                        opened = false,
                        message = BilingualText(
                            "The document decrypted but the platform could not render it. It may be corrupt or password-protected; the original is untouched. (${failure.javaClass.simpleName})",
                            "فُك تشفير المستند لكن لم يتمكن النظام من عرضه. قد يكون تالفًا أو محميًا بكلمة مرور؛ الملف الأصلي لم يتغير. (${failure.javaClass.simpleName})",
                        ),
                    )
                }
            }
        }.onFailure { failure ->
            _state.value = _state.value.copy(
                loading = false,
                opened = false,
                message = describe(failure),
            )
        }
    }

    private fun attachRenderer(file: File): Int {
        val handle = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        descriptorHandle = handle
        renderer = PdfRenderer(handle)
        return renderer?.pageCount ?: 0
    }

    fun renderPage(index: Int) {
        val active = renderer ?: return
        if (index < 0 || index >= active.pageCount) return
        if (_state.value.pageBitmap != null) {
            _state.value = _state.value.copy(page = index)
        }
        viewModelScope.launch(Dispatchers.IO) {
            val bitmap = runCatching { renderActivePage(active, index) }
            bitmap.onSuccess { image ->
                if (container.session.currentAccess() == null) {
                    return@onSuccess
                }
                _state.value = _state.value.copy(
                    loading = false,
                    page = index,
                    pageCount = active.pageCount,
                    pageBitmap = image,
                )
                startIdleTimer()
            }.onFailure {
                _state.value = _state.value.copy(
                    loading = false,
                    message = BilingualText(
                        "This page could not be rendered.",
                        "تعذر عرض هذه الصفحة.",
                    ),
                )
            }
        }
    }

    private fun renderActivePage(active: PdfRenderer, index: Int): Bitmap =
        active.openPage(index).use { page ->
            val scale = DocumentViewerPolicy.MAX_PAGE_WIDTH.toFloat() / maxOf(page.width, 1)
            val factor = scale.coerceIn(1f, 3f)
            val bitmap = Bitmap.createBitmap(
                (page.width * factor).toInt().coerceAtLeast(1),
                (page.height * factor).toInt().coerceAtLeast(1),
                Bitmap.Config.ARGB_8888,
            )
            // White page background: PdfRenderer leaves transparent pixels.
            bitmap.eraseColor(android.graphics.Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            bitmap
        }

    fun goToPage(index: Int) {
        if (!_state.value.opened) return
        renderPage(index.coerceIn(0, (_state.value.pageCount - 1).coerceAtLeast(0)))
    }

    /** Manual release: the user can drop the decrypted copy without leaving the screen. */
    fun releaseNow() = releaseAll(
        BilingualText(
            "The decrypted copy was cleared. Reopen to view it again.",
            "مُسحت النسخة المفكوكة. أعد الفتح لمشاهدتها مجددًا.",
        ),
    )

    private fun releaseAll(message: BilingualText?) {
        idleJob?.cancel()
        idleJob = null
        openJob?.cancel()
        openJob = null
        runCatching { renderer?.close() }
        renderer = null
        runCatching { descriptorHandle?.close() }
        descriptorHandle = null
        val record = _state.value.descriptor?.recordId
        if (record != null) viewer.closeLease(record)
        lease = null
        _state.value = _state.value.copy(
            loading = false,
            opened = false,
            text = null,
            pageBitmap = null,
            page = 0,
            pageCount = 0,
            message = message ?: _state.value.message,
            secondsRemaining = DocumentViewerPolicy.IDLE_CLEAR_SECONDS,
        )
    }

    private fun startIdleTimer() {
        idleJob?.cancel()
        idleJob = viewModelScope.launch {
            var remaining = DocumentViewerPolicy.IDLE_CLEAR_SECONDS
            while (remaining > 0) {
                _state.value = _state.value.copy(secondsRemaining = remaining)
                delay(1_000)
                remaining -= 1
            }
            _state.value = _state.value.copy(secondsRemaining = 0)
            releaseAll(
                BilingualText(
                    "The decrypted copy was cleared automatically after ${DocumentViewerPolicy.IDLE_CLEAR_SECONDS} seconds of inactivity.",
                    "مُسحت النسخة المفكوكة تلقائيًا بعد ${DocumentViewerPolicy.IDLE_CLEAR_SECONDS} ثانية من عدم النشاط.",
                ),
            )
        }
    }

    /** Any real interaction pushes the auto-clear back out. */
    fun keepAlive() {
        if (_state.value.opened) startIdleTimer()
    }

    /**
     * Safe handoff. Writes a decrypted copy only to a destination the user chose
     * through the Storage Access Framework, using the existing vault export.
     */
    fun exportTo(target: android.net.Uri, onResult: (BilingualText) -> Unit) {
        val access = container.session.currentAccess() ?: run {
            onResult(BilingualText("The vault is locked.", "الخزنة مقفلة."))
            return
        }
        viewModelScope.launch {
            val outcome = runCatching {
                getApplication<Application>().contentResolver.openOutputStream(target)?.use { stream ->
                    vault.export(access, recordId, stream)
                } ?: throw DocumentRejectedException(DocumentFailure.LEASE_WRITE_FAILED)
            }
            onResult(
                outcome.fold(
                    onSuccess = { bytes ->
                        BilingualText(
                            "Exported $bytes bytes to the location you chose.",
                            "صُدِّر $bytes بايت إلى الموقع الذي اخترته.",
                        )
                    },
                    onFailure = { failure ->
                        val reason = describe(failure)
                        BilingualText(
                            "Export failed: ${reason.english}",
                            "فشل التصدير: ${reason.arabic}",
                        )
                    },
                ),
            )
        }
    }

    private fun describe(failure: Throwable): BilingualText = when {
        failure is DocumentRejectedException -> when (failure.failure) {
            DocumentFailure.TOO_LARGE -> BilingualText(
                "The document is larger than the viewer limit, so nothing was decrypted.",
                "المستند أكبر من حد العارض، لذلك لم يُفك تشفير أي شيء.",
            )
            DocumentFailure.MISSING -> BilingualText(
                "The encrypted file is missing. The original was not recreated.",
                "الملف المشفر مفقود. لم يُنشأ الأصل مجددًا.",
            )
            DocumentFailure.UNREADABLE -> BilingualText(
                "The encrypted container failed authentication, so no content is shown.",
                "فشل التحقق من الحاوية المشفرة، لذلك لا يُعرض أي محتوى.",
            )
            DocumentFailure.UNSUPPORTED_TYPE -> BilingualText(
                "This document type is not supported by the protected viewer.",
                "نوع المستند هذا لا يدعمه العارض المحمي.",
            )
            DocumentFailure.LEASE_WRITE_FAILED -> BilingualText(
                "The temporary private copy could not be staged, so nothing is displayed.",
                "تعذر تجهيز النسخة المؤقتة الخاصة، لذلك لا يُعرض شيء.",
            )
            DocumentFailure.RENDER_UNAVAILABLE -> BilingualText(
                "This device cannot render the document.",
                "لا يستطيع هذا الجهاز عرض المستند.",
            )
        }
        failure is VaultLockedException -> BilingualText(
            "The vault locked during the operation, so no content was returned.",
            "أُقفلت الخزنة أثناء العملية، لذلك لم يُرجع أي محتوى.",
        )
        else -> BilingualText(
            "The document could not be opened: ${failure.javaClass.simpleName}",
            "تعذر فتح المستند: ${failure.javaClass.simpleName}",
        )
    }

    override fun onCleared() {
        releaseAll(null)
        super.onCleared()
    }
}

@Composable
fun DocumentViewerScreen(
    container: AppContainer,
    recordId: String,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
    onOpenVault: () -> Unit,
    onOpenPrivacy: () -> Unit,
) {
    val application = LocalContext.current.applicationContext as Application
    val viewModel: DocumentViewerViewModel = viewModel(
        key = recordId,
        factory = viewModelFactory { DocumentViewerViewModel(application, container, recordId) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    val unlocked by viewModel.unlocked.collectAsStateWithLifecycle()
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = null)

    LaunchedEffect(unlocked, recordId) { if (unlocked) viewModel.load() }
    LaunchedEffect(unlocked) { if (!unlocked) viewModel.releaseNow() }

    var showMenu by remember { mutableStateOf(false) }
    var pendingExport by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<BilingualText?>(null) }
    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument(state.descriptor?.mimeType ?: "application/octet-stream"),
    ) { destination ->
        if (destination != null) {
            viewModel.exportTo(destination) { message -> notice = message }
        }
    }

    DisposableEffect(recordId) {
        onDispose { viewModel.releaseNow() }
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(
            tr("Document Viewer", "عارض المستندات"),
            onBack,
            actions = {
                Box {
                    TextButton(onClick = { showMenu = true }) {
                        Text(tr("⋯", "⋯"), color = KnouxColors.Violet, fontSize = 20.sp)
                    }
                    DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
                        DropdownMenuItem(
                            text = { Text(tr("Export a copy", "تصدير نسخة")) },
                            enabled = state.descriptor != null && unlocked,
                            onClick = {
                                showMenu = false
                                pendingExport = true
                            },
                        )
                        DropdownMenuItem(
                            text = { Text(tr("Clear decrypted copy", "مسح النسخة المفكوكة")) },
                            enabled = state.opened,
                            onClick = {
                                showMenu = false
                                viewModel.releaseNow()
                            },
                        )
                        DropdownMenuItem(
                            text = { Text(tr("Back to vault", "العودة إلى الخزنة")) },
                            onClick = {
                                showMenu = false
                                onOpenVault()
                            },
                        )
                    }
                }
            },
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                tr("SECURE. PRIVATE. IN YOUR CONTROL.", "آمن. خاص. تحت سيطرتك."),
                style = MaterialTheme.typography.labelSmall,
                letterSpacing = 2.sp,
                modifier = Modifier.weight(1f),
            )
            StatusPill(
                text = if (unlocked) tr("Unlocked", "مفتوح") else tr("Locked", "مقفل"),
                tone = if (unlocked) KnouxColors.Success else KnouxColors.Alert,
            )
        }
        Spacer(Modifier.height(10.dp))

        state.descriptor?.let { descriptor ->
            DocumentCard(
                descriptor = descriptor,
                collectionLabel = state.collectionLabel,
            )
            Spacer(Modifier.height(12.dp))
        }

        notice?.let {
            Text(tr(it.english, it.arabic), style = MaterialTheme.typography.bodySmall, color = KnouxColors.Success)
            Spacer(Modifier.height(6.dp))
        }
        state.message?.let {
            Text(tr(it.english, it.arabic), style = MaterialTheme.typography.bodySmall, color = KnouxColors.Alert)
            Spacer(Modifier.height(6.dp))
        }

        PreviewPanel(
            state = state,
            unlocked = unlocked,
            onAuthenticate = onNeedUnlock,
            onPageChange = viewModel::goToPage,
            onInteract = viewModel::keepAlive,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.height(12.dp))

        SectionLabel(tr("Protection in this session", "الحماية في هذه الجلسة"))
        Spacer(Modifier.height(8.dp))
        settings?.let { current ->
            ProtectionRow(
                icon = "◷",
                title = tr("Session timeout", "مهلة الجلسة"),
                subtitle = tr("Auto-lock after a period of inactivity", "قفل تلقائي بعد فترة من عدم النشاط"),
                value = formatSeconds(current.autoLockSeconds),
                onClick = onOpenPrivacy,
            )
            Spacer(Modifier.height(8.dp))
            ProtectionRow(
                icon = "",
                title = tr("Screenshot restriction", "تقييد لقطة الشاشة"),
                subtitle = tr("Prevent screenshots while viewing", "منع لقطات الشاشة أثناء العرض"),
                value = if (current.blockScreenshots) {
                    tr("Enabled", "مُفعّل")
                } else {
                    tr("Disabled", "معطّل")
                },
                onClick = onOpenPrivacy,
            )
            Spacer(Modifier.height(8.dp))
            ProtectionRow(
                icon = "⧖",
                title = tr("Temporary plaintext handling", "معالجة النص المؤقت"),
                subtitle = tr("Auto-clear decrypted content from memory", "مسح المحتوى المفكك من الذاكرة تلقائيًا"),
                value = if (state.opened) {
                    tr(
                        "Clears in ${state.secondsRemaining} s",
                        "يُمسح بعد ${state.secondsRemaining} ثانية",
                    )
                } else {
                    tr("${DocumentViewerPolicy.IDLE_CLEAR_SECONDS} seconds", "${DocumentViewerPolicy.IDLE_CLEAR_SECONDS} ثانية")
                },
                onClick = { viewModel.releaseNow() },
            )
            Spacer(Modifier.height(12.dp))
        }

        if (!unlocked) {
            KnouxPrimaryButton(
                text = tr("Authenticate to preview", "المصادقة للمعاينة"),
                onClick = onNeedUnlock,
            )
        } else if (state.opened) {
            KnouxPrimaryButton(
                text = tr("Clear decrypted copy now", "مسح النسخة المفكوكة الآن"),
                onClick = { viewModel.releaseNow() },
            )
        } else {
            KnouxPrimaryButton(
                text = tr("Open decrypted copy", "فتح النسخة المفكوكة"),
                onClick = { viewModel.load() },
                enabled = state.descriptor != null && !state.loading,
            )
        }
        Spacer(Modifier.height(10.dp))
        Text(
            tr(
                "Text documents are decrypted in memory only. A PDF needs a private temporary copy for the Android renderer; it is deleted when you close the viewer, when the vault locks, and after " +
                    DocumentViewerPolicy.IDLE_CLEAR_SECONDS + " idle seconds. Exporting writes plaintext only where you choose.",
                "تُفك شفرة المستندات النصية في الذاكرة فقط. يحتاج ملف PDF نسخة مؤقتة خاصة لأداة العرض في أندرويد؛ تُمسح عند إغلاق العارض أو عند قفل الخزنة أو بعد " +
                    DocumentViewerPolicy.IDLE_CLEAR_SECONDS + " ثانية من الخمول. يكتب التصدير النص الصريح في الموقع الذي تختاره فقط.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Faint,
        )
        Spacer(Modifier.height(16.dp))
    }

    if (pendingExport) {
        AlertDialog(
            onDismissRequest = { pendingExport = false },
            title = { Text(tr("Export a decrypted copy?", "تصدير نسخة مفكوكة التشفير؟")) },
            text = {
                Text(
                    tr(
                        "The chosen location is outside the vault. Whatever you write there is no longer protected by this app, and the system may keep a copy.",
                        "الموقع المختار خارج الخزنة. أي شيء تكتبه هناك لم يعد محميًا بهذا التطبيق، وقد يحتفظ النظام بنسخة.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    pendingExport = false
                    exportLauncher.launch(
                        state.descriptor?.displayName?.takeIf { it.isNotBlank() } ?: "document",
                    )
                }) {
                    Text(tr("Choose location", "اختيار الموقع"), color = KnouxColors.Warn)
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingExport = false }) { Text(tr("Cancel", "إلغاء")) }
            },
        )
    }
}

@Composable
private fun DocumentCard(
    descriptor: DocumentDescriptor,
    collectionLabel: String?,
) {
    val shape = RoundedCornerShape(18.dp)
    GlassCard(
        Modifier
            .fillMaxWidth()
            .border(1.dp, KnouxColors.Violet.copy(alpha = 0.5f), shape),
        borderColor = KnouxColors.Violet.copy(alpha = 0.5f),
        contentPadding = PaddingValues(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(KnouxColors.Violet.copy(alpha = 0.35f), KnouxColors.Sealed),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (descriptor.mode == DocumentMode.PDF) "PDF" else "TXT",
                    fontSize = 11.sp,
                    letterSpacing = 1.sp,
                    color = KnouxColors.Violet,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    descriptor.displayName,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        formatBytes(descriptor.sizeBytes),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Muted,
                    )
                    Text("  •  ", style = MaterialTheme.typography.labelSmall, color = KnouxColors.Faint)
                    Text(
                        tr("Encrypted at rest", "مشفّر أثناء التخزين"),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Violet,
                    )
                }
                Text(
                    descriptor.mimeType,
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (!collectionLabel.isNullOrBlank()) {
                StatusPill(collectionLabel, tone = KnouxColors.Warn)
            }
        }
    }
}

@Composable
private fun PreviewPanel(
    state: DocumentViewerState,
    unlocked: Boolean,
    onAuthenticate: () -> Unit,
    onPageChange: (Int) -> Unit,
    onInteract: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(20.dp)
    Box(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Brush.linearGradient(listOf(Color(0x99241038), Color(0xFF0B0618))))
            .border(1.dp, KnouxColors.Line, shape),
    ) {
        when {
            !unlocked || state.descriptor == null -> LockedPreview(state.message, onAuthenticate)
            state.loading -> Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = KnouxColors.Violet, strokeWidth = 2.dp)
                    Spacer(Modifier.height(10.dp))
                    Text(
                        tr("Decrypting in a protected session…", "يُفك التشفير في جلسة محمية…"),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Muted,
                    )
                }
            }
            state.opened && state.text != null -> TextBody(state.text)
            state.opened && state.pageCount > 0 -> PdfBody(state, onPageChange, onInteract)
            else -> IdlePreview(state.message)
        }
    }
}

@Composable
private fun LockedPreview(message: BilingualText?, onAuthenticate: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier.size(96.dp).clip(CircleShape)
                .background(Brush.radialGradient(listOf(KnouxColors.Violet.copy(alpha = 0.5f), Color.Transparent))),
            contentAlignment = Alignment.Center,
        ) {
            Text("🔒", fontSize = 30.sp)
        }
        Spacer(Modifier.height(12.dp))
        Row {
            Text(
                tr("Preview is ", "المعاينة "),
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                tr("locked", "مقفلة"),
                style = MaterialTheme.typography.titleMedium,
                color = KnouxColors.Violet,
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(
            message?.let { tr(it.english, it.arabic) } ?: tr(
                "Authenticate to securely decrypt and view this document.",
                "صادق لتفكيك تشفير هذا المستند وعرضه بأمان.",
            ),
            style = MaterialTheme.typography.bodySmall,
            color = KnouxColors.Muted,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(12.dp))
        TextButton(onClick = onAuthenticate) {
            Text(tr("Authenticate", "المصادقة"), color = KnouxColors.Violet)
        }
    }
}

@Composable
private fun IdlePreview(message: BilingualText?) {
    Column(
        Modifier.fillMaxSize().padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            tr("No decrypted copy is held", "لا توجد نسخة مفكوكة محفوظة"),
            style = MaterialTheme.typography.titleSmall,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            message?.let { tr(it.english, it.arabic) } ?: tr(
                "Nothing is decrypted until you open the document, and the copy is released as soon as you leave.",
                "لا يُفك تشفير شيء حتى تفتح المستند، وتُطلق النسخة بمجرد مغادرتك.",
            ),
            style = MaterialTheme.typography.bodySmall,
            color = KnouxColors.Muted,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun TextBody(text: String) {
    var size by remember { mutableStateOf(14f) }
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                tr("Text is decrypted in memory only and cannot be copied from here.", "يُفك تشفير النص في الذاكرة فقط ولا يمكن نسخه من هنا."),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = { size = (size - 2f).coerceAtLeast(11f) }) {
                Text("A−", color = KnouxColors.Violet)
            }
            TextButton(onClick = { size = (size + 2f).coerceAtMost(28f) }) {
                Text("A+", color = KnouxColors.Violet)
            }
        }
        Box(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 14.dp, vertical = 8.dp),
        ) {
            Text(
                text,
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontFamily = FontFamily.Monospace,
                    fontSize = size.sp,
                ),
            )
        }
    }
}

@Composable
private fun PdfBody(
    state: DocumentViewerState,
    onPageChange: (Int) -> Unit,
    onInteract: () -> Unit,
) {
    val pageAnnouncement = tr(
        "Page ${state.page + 1} of ${state.pageCount}",
        "صفحة ${state.page + 1} من ${state.pageCount}",
    )
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f).fillMaxWidth().padding(8.dp)) {
            val bitmap = state.pageBitmap
            if (bitmap != null) {
                ZoomableImage(bitmap, onInteract = onInteract)
            } else {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        tr("Rendering page…", "جارٍ عرض الصفحة…"),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Muted,
                    )
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(
                onClick = { onPageChange(state.page - 1) },
                enabled = state.page > 0,
            ) {
                Text(tr("‹ Prev", "› السابق"), color = KnouxColors.Violet)
            }
            Text(
                tr("Page ${state.page + 1} of ${state.pageCount}", "صفحة ${state.page + 1} من ${state.pageCount}"),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Muted,
                modifier = Modifier.weight(1f).semantics {
                    contentDescription = pageAnnouncement
                },
                textAlign = TextAlign.Center,
            )
            TextButton(
                onClick = { onPageChange(state.page + 1) },
                enabled = state.page < state.pageCount - 1,
            ) {
                Text(tr("Next ›", "‹ التالي"), color = KnouxColors.Violet)
            }
        }
    }
}

@Composable
private fun ProtectionRow(
    icon: String,
    title: String,
    subtitle: String,
    value: String,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Color(0x66150B24))
            .border(1.dp, KnouxColors.Line, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(36.dp).clip(CircleShape).background(KnouxColors.Sealed),
            contentAlignment = Alignment.Center,
        ) {
            Text(icon, color = KnouxColors.Violet, fontSize = 16.sp)
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium)
            Text(subtitle, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Faint)
        }
        Text(value, style = MaterialTheme.typography.labelMedium, color = KnouxColors.Violet, maxLines = 1)
        Text("  ›", color = KnouxColors.Violet, fontSize = 18.sp)
    }
}

private fun formatSeconds(seconds: Int): String = when {
    seconds % 3_600 == 0 && seconds >= 3_600 -> "${seconds / 3_600} h"
    seconds % 60 == 0 && seconds >= 60 -> "${seconds / 60} min"
    else -> "$seconds s"
}

/** Lists every vault item the protected viewer can actually open. */
class DocumentLibraryViewModel(
    application: Application,
    private val container: AppContainer,
) : AndroidViewModel(application) {
    private val _documents = MutableStateFlow<List<DocumentDescriptor>>(emptyList())
    val documents: StateFlow<List<DocumentDescriptor>> = _documents.asStateFlow()
    private val _unreadable = MutableStateFlow(0)
    val unreadable: StateFlow<Int> = _unreadable.asStateFlow()
    val unlocked: StateFlow<Boolean> = container.session.unlocked

    init {
        viewModelScope.launch {
            container.session.unlocked.collectLatest { isUnlocked ->
                if (!isUnlocked) {
                    _documents.value = emptyList()
                    _unreadable.value = 0
                    return@collectLatest
                }
                val access = container.session.currentAccess() ?: return@collectLatest
                runCatching {
                    container.shadowVault.observe(access).collect { rows ->
                        _documents.value = DocumentViewerPolicy.descriptors(rows)
                        _unreadable.value = rows.count { !it.readable }
                    }
                }
            }
        }
    }
}

@Composable
fun DocumentLibraryScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
    onOpenDocument: (String) -> Unit,
) {
    val application = LocalContext.current.applicationContext as Application
    val viewModel: DocumentLibraryViewModel = viewModel(
        factory = viewModelFactory { DocumentLibraryViewModel(application, container) },
    )
    val documents by viewModel.documents.collectAsStateWithLifecycle()
    val unreadable by viewModel.unreadable.collectAsStateWithLifecycle()
    val unlocked by viewModel.unlocked.collectAsStateWithLifecycle()

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Document Viewer", "عارض المستندات"), onBack)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                tr("SECURE. PRIVATE. IN YOUR CONTROL.", "آمن. خاص. تحت سيطرتك."),
                style = MaterialTheme.typography.labelSmall,
                letterSpacing = 2.sp,
                modifier = Modifier.weight(1f),
            )
            StatusPill(
                text = if (unlocked) tr("Unlocked", "مفتوح") else tr("Locked", "مقفل"),
                tone = if (unlocked) KnouxColors.Success else KnouxColors.Alert,
            )
        }
        Spacer(Modifier.height(12.dp))
        if (!unlocked) {
            GlassCard(Modifier.fillMaxWidth()) {
                Text(
                    tr(
                        "Authenticate to list the documents your vault can open.",
                        "صادق لعرض المستندات التي يمكن لخزنتك فتحها.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(Modifier.height(8.dp))
                KnouxPrimaryButton(
                    text = tr("Authenticate", "المصادقة"),
                    onClick = onNeedUnlock,
                )
            }
            return@Column
        }
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (documents.isEmpty()) {
                item(key = "empty") {
                    GlassCard(Modifier.fillMaxWidth()) {
                        Text(
                            tr(
                                "No openable documents yet. Import a PDF or a text file into the Shadow Vault first.",
                                "لا توجد مستندات قابلة للفتح بعد. استورد PDF أو ملف نصيًا إلى الخزنة الظلية أولًا.",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
            items(documents, key = { it.recordId }) { descriptor ->
                LibraryRow(descriptor) { onOpenDocument(descriptor.recordId) }
            }
            if (unreadable > 0) {
                item(key = "unreadable") {
                    Text(
                        tr(
                            "$unreadable vault record(s) could not be decrypted and are not listed.",
                            "${unreadable} سجل من الخزنة تعذر فك تشفيره ولا يُعرض.",
                        ),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Alert,
                    )
                }
            }
            item(key = "note") {
                Text(
                    tr(
                        "Only PDF and plain-text types are offered. Larger documents stay encrypted and are never staged.",
                        "يُعرض نوع PDF والنص العادي فقط. المستندات الأكبر تبقى مشفرة ولا تُجهَّز أبدًا.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
    }
}

@Composable
private fun LibraryRow(descriptor: DocumentDescriptor, onClick: () -> Unit) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Color(0x66150B24))
            .border(1.dp, KnouxColors.Line, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(11.dp)).background(KnouxColors.Sealed),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                if (descriptor.mode == DocumentMode.PDF) "PDF" else "TXT",
                fontSize = 10.sp,
                letterSpacing = 1.sp,
                color = KnouxColors.Violet,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
            )
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(descriptor.displayName, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "${formatBytes(descriptor.sizeBytes)}  •  ${descriptor.mimeType}",
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text("›", color = KnouxColors.Violet, fontSize = 20.sp)
    }
}
