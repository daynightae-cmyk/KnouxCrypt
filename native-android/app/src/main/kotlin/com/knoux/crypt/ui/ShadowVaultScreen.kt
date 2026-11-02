package com.knoux.crypt.ui

import android.app.Application
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.ShadowVaultService
import com.knoux.crypt.data.VaultLockedException
import com.knoux.crypt.data.VaultMediaItem
import com.knoux.crypt.data.VaultMediaTooLargeException
import com.knoux.crypt.data.VaultMediaType
import com.knoux.crypt.data.VaultMediaUnavailableException
import com.knoux.crypt.data.VaultUsage
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.LocalReducedMotion
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StagHero
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.media.MediaImportException
import com.knoux.crypt.media.MediaImporter
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext

enum class VaultCategory(val code: String) {
    PHOTOS("photo"),
    VIDEOS("video"),
    AUDIO("audio"),
    FILES("file"),
}

data class VaultImportProgress(
    val fileName: String,
    val index: Int,
    val total: Int,
    val fraction: Float,
)

data class VaultImportFailure(val message: String, val retryable: Boolean)

data class VaultViewerState(
    val item: VaultMediaItem,
    val loading: Boolean = false,
    val error: String? = null,
)

class ShadowVaultViewModel(
    application: Application,
    private val container: AppContainer,
) : AndroidViewModel(application) {
    private val service: ShadowVaultService = container.shadowVault
    private val importer = MediaImporter(application)

    val unlocked: StateFlow<Boolean> = container.session.unlocked
    private val _items = MutableStateFlow<List<VaultMediaItem>>(emptyList())
    val items: StateFlow<List<VaultMediaItem>> = _items.asStateFlow()
    private val _category = MutableStateFlow(VaultCategory.PHOTOS)
    val category: StateFlow<VaultCategory> = _category.asStateFlow()
    val filtered: StateFlow<List<VaultMediaItem>> = combine(_items, _category) { rows, selected ->
        rows.filter { it.type.code == selected.code }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _usage = MutableStateFlow(VaultUsage(0, 0, 0, emptyMap()))
    val usage: StateFlow<VaultUsage> = _usage.asStateFlow()
    private val _thumbs = MutableStateFlow<Map<String, Bitmap>>(emptyMap())
    val thumbs: StateFlow<Map<String, Bitmap>> = _thumbs.asStateFlow()
    private val _importProgress = MutableStateFlow<VaultImportProgress?>(null)
    val importProgress: StateFlow<VaultImportProgress?> = _importProgress.asStateFlow()
    private val _importFailure = MutableStateFlow<VaultImportFailure?>(null)
    val importFailure: StateFlow<VaultImportFailure?> = _importFailure.asStateFlow()
    private val _viewer = MutableStateFlow<VaultViewerState?>(null)
    val viewer: StateFlow<VaultViewerState?> = _viewer.asStateFlow()
    private val _viewerImage = MutableStateFlow<Bitmap?>(null)
    val viewerImage: StateFlow<Bitmap?> = _viewerImage.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()
    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice.asStateFlow()

    private var importJob: Job? = null
    private var thumbnailJob: Job? = null
    private var pendingRetry: List<Uri> = emptyList()

    init {
        viewModelScope.launch {
            container.session.unlocked.collectLatest { isUnlocked ->
                if (!isUnlocked) {
                    clearSensitiveState()
                    return@collectLatest
                }
                val access = container.session.currentAccess() ?: return@collectLatest
                try {
                    service.observe(access).collect { rows ->
                        _items.value = rows
                        recomputeUsage(rows)
                        refreshThumbnails(access, rows)
                    }
                } catch (_: VaultLockedException) {
                    clearSensitiveState()
                } catch (failure: Throwable) {
                    _error.value = failure.message ?: "Could not load the encrypted vault."
                }
            }
        }
    }

    fun setCategory(value: VaultCategory) {
        _category.value = value
    }

    fun importUris(uris: List<Uri>) {
        if (uris.isEmpty()) return
        val access = container.session.currentAccess()
        if (access == null) {
            _error.value = "The vault locked before the import started."
            return
        }
        importJob?.cancel()
        pendingRetry = emptyList()
        importJob = viewModelScope.launch {
            _importFailure.value = null
            _error.value = null
            var imported = 0
            var lastFailure: String? = null
            val failed = mutableListOf<Uri>()
            for ((index, uri) in uris.withIndex()) {
                ensureActive()
                val prepared = try {
                    _importProgress.value = VaultImportProgress("…", index + 1, uris.size, 0f)
                    withContext(Dispatchers.IO) { importer.prepare(uri) }
                } catch (failure: CancellationException) {
                    throw failure
                } catch (failure: Throwable) {
                    failed += uri
                    lastFailure = importMessage(failure)
                    continue
                }
                try {
                    _importProgress.value = VaultImportProgress(
                        prepared.displayName,
                        index + 1,
                        uris.size,
                        0f,
                    )
                    val input = withContext(Dispatchers.IO) { importer.openStream(prepared.uri) }
                    input.use { stream ->
                        service.import(
                            access = access,
                            input = stream,
                            displayName = prepared.displayName,
                            mimeType = prepared.mimeType,
                            type = prepared.type,
                            sizeBytes = prepared.sizeBytes,
                            thumbnailJpeg = prepared.thumbnailJpeg,
                            width = prepared.width,
                            height = prepared.height,
                            durationMs = prepared.durationMs,
                            rotationDegrees = prepared.rotationDegrees,
                            onProgress = { progress ->
                                _importProgress.value = VaultImportProgress(
                                    prepared.displayName,
                                    index + 1,
                                    uris.size,
                                    progress.fraction,
                                )
                            },
                        )
                    }
                    imported += 1
                } catch (failure: CancellationException) {
                    throw failure
                } catch (failure: Throwable) {
                    failed += uri
                    lastFailure = importMessage(failure)
                }
            }
            _importProgress.value = null
            if (failed.isNotEmpty()) {
                pendingRetry = failed
                _importFailure.value = VaultImportFailure(
                    message = lastFailure ?: "Some items could not be imported.",
                    retryable = true,
                )
            } else if (imported > 0) {
                _notice.value = "Imported $imported item(s) into the encrypted vault."
            }
        }
    }

    fun retryFailed() {
        val retry = pendingRetry
        if (retry.isEmpty()) return
        importUris(retry)
    }

    fun dismissImportFailure() {
        _importFailure.value = null
        pendingRetry = emptyList()
    }

    fun cancelImport() {
        importJob?.cancel()
        importJob = null
        _importProgress.value = null
        _notice.value = "Import cancelled. Partial ciphertext was removed."
    }

    fun openViewer(item: VaultMediaItem) {
        if (!item.readable) {
            _error.value = "This record could not be decrypted with the current key. It was not replaced."
            return
        }
        _viewer.value = VaultViewerState(item)
        if (item.type == VaultMediaType.PHOTO) loadImage(item)
    }

    fun closeViewer() {
        _viewer.value = null
        // Drop the reference; do not recycle a bitmap Compose may still draw in
        // the current frame. GC reclaims it after the dialog leaves composition.
        _viewerImage.value = null
    }

    fun delete(item: VaultMediaItem) {
        val access = container.session.currentAccess() ?: run {
            _error.value = "The vault locked before deletion."
            return
        }
        viewModelScope.launch {
            runCatching { service.delete(access, item.id) }
                .onSuccess {
                    if (_viewer.value?.item?.id == item.id) closeViewer()
                    _notice.value = "Encrypted record deleted. This is logical deletion, not a provable physical erase."
                }
                .onFailure { _error.value = it.message ?: "Could not delete the media record." }
        }
    }

    fun export(item: VaultMediaItem, destination: Uri) {
        val access = container.session.currentAccess() ?: run {
            _error.value = "The vault locked before export."
            return
        }
        viewModelScope.launch {
            try {
                val written = withContext(Dispatchers.IO) {
                    getApplication<Application>().contentResolver
                        .openOutputStream(destination, "wt")
                        ?.use { output -> service.export(access, item.id, output) }
                        ?: throw IOException("The destination could not be opened for writing")
                }
                _notice.value = "Exported $written bytes as a decrypted copy. The destination is outside the vault."
            } catch (failure: CancellationException) {
                throw failure
            } catch (failure: Throwable) {
                _error.value = "Export failed: ${failure.message ?: "unknown error"}"
            }
        }
    }

    fun consumeError() {
        _error.value = null
    }

    fun consumeNotice() {
        _notice.value = null
    }

    private fun loadImage(item: VaultMediaItem) {
        val access = container.session.currentAccess() ?: return
        _viewer.value = _viewer.value?.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                val bytes = service.readImage(access, item.id)
                val bitmap = withContext(Dispatchers.Default) {
                    decodeBounded(bytes, item.payload?.rotationDegrees ?: 0)
                }
                bytes.fill(0)
                if (bitmap == null) {
                    _viewer.value = _viewer.value?.copy(
                        loading = false,
                        error = "The image could not be decoded.",
                    )
                    return@launch
                }
                _viewerImage.value = bitmap
                _viewer.value = _viewer.value?.copy(loading = false)
            } catch (failure: VaultMediaTooLargeException) {
                _viewer.value = _viewer.value?.copy(
                    loading = false,
                    error = "This image is too large for an in-memory secure preview.",
                )
            } catch (failure: Throwable) {
                _viewer.value = _viewer.value?.copy(
                    loading = false,
                    error = failure.message ?: "The image could not be opened.",
                )
            }
        }
    }

    private fun decodeBounded(bytes: ByteArray, rotationDegrees: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (bounds.outWidth / sample > 2048 || bounds.outHeight / sample > 2048) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return null
        if (rotationDegrees == 0) return decoded
        val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
        val rotated = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        if (rotated !== decoded) decoded.recycle()
        return rotated
    }

    private fun recomputeUsage(rows: List<VaultMediaItem>) {
        val payloads = rows.mapNotNull { it.payload }
        val byType = VaultMediaType.entries.associateWith { type ->
            payloads.filter { it.mediaType == type.code }.sumOf { it.containerBytes + it.thumbnailBytes }
        }
        _usage.value = VaultUsage(
            itemCount = rows.size,
            unreadableCount = rows.count { it.payload == null },
            encryptedBytes = byType.values.sum(),
            byType = byType,
        )
    }

    private fun refreshThumbnails(access: com.knoux.crypt.data.VaultAccess, rows: List<VaultMediaItem>) {
        val known = _thumbs.value
        val pending = rows.filter { item ->
            item.readable && item.payload?.hasThumbnail == true && !known.containsKey(item.id)
        }
        if (pending.isEmpty()) return
        thumbnailJob?.cancel()
        thumbnailJob = viewModelScope.launch {
            val gate = Semaphore(3)
            pending.forEach { item ->
                launch {
                    gate.withPermit {
                        val bytes = runCatching { service.thumbnail(access, item.id) }.getOrNull()
                        if (bytes != null) {
                            val bitmap = withContext(Dispatchers.Default) {
                                runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size) }.getOrNull()
                            }
                            bytes.fill(0)
                            if (bitmap != null) withContext(Dispatchers.Main) { storeThumbnail(item.id, bitmap) }
                        }
                    }
                }
            }
        }
    }

    private fun storeThumbnail(id: String, bitmap: Bitmap) {
        if (!container.session.isUnlocked) return
        val next = _thumbs.value.toMutableMap()
        if (next.size >= MAX_CACHED_THUMBNAILS) {
            next.keys.firstOrNull()?.let(next::remove)
        }
        next[id] = bitmap
        _thumbs.value = next
    }

    private fun clearSensitiveState() {
        thumbnailJob?.cancel()
        _items.value = emptyList()
        _usage.value = VaultUsage(0, 0, 0, emptyMap())
        _thumbs.value = emptyMap()
        _importProgress.value = null
        _importFailure.value = null
        closeViewer()
        _error.value = null
        _notice.value = null
    }

    private fun importMessage(failure: Throwable): String = when (failure) {
        is VaultLockedException -> "The vault locked during import. Nothing was committed."
        is VaultMediaTooLargeException -> "The thumbnail exceeded the secure preview limit."
        is VaultMediaUnavailableException -> failure.message ?: "The encrypted media is unavailable."
        is MediaImportException -> failure.message ?: "The selected item could not be read."
        is SecurityException -> "The picker permission was revoked before the import completed."
        is IOException -> failure.message ?: "The item could not be read or encrypted."
        else -> failure.message ?: "The import failed."
    }

    override fun onCleared() {
        importJob?.cancel()
        thumbnailJob?.cancel()
        clearSensitiveState()
        super.onCleared()
    }

    private companion object {
        const val MAX_CACHED_THUMBNAILS = 48
    }
}

@Composable
fun ShadowVaultScreen(container: AppContainer, onBack: () -> Unit, onNeedUnlock: () -> Unit) {
    val unlocked by container.session.unlocked.collectAsStateWithLifecycle()
    if (!unlocked) {
        LockedScreen(tr("Shadow Vault", "الخزنة الظلية"), onBack, onNeedUnlock)
        return
    }
    val application = LocalContext.current.applicationContext as Application
    val viewModel: ShadowVaultViewModel = viewModel(
        factory = viewModelFactory { ShadowVaultViewModel(application, container) },
    )
    val items by viewModel.filtered.collectAsStateWithLifecycle()
    val category by viewModel.category.collectAsStateWithLifecycle()
    val usage by viewModel.usage.collectAsStateWithLifecycle()
    val thumbs by viewModel.thumbs.collectAsStateWithLifecycle()
    val importProgress by viewModel.importProgress.collectAsStateWithLifecycle()
    val importFailure by viewModel.importFailure.collectAsStateWithLifecycle()
    val viewer by viewModel.viewer.collectAsStateWithLifecycle()
    val viewerImage by viewModel.viewerImage.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val notice by viewModel.notice.collectAsStateWithLifecycle()
    val reduced = LocalReducedMotion.current

    var showImportOptions by remember { mutableStateOf(false) }
    var details by remember { mutableStateOf<VaultMediaItem?>(null) }
    var pendingDelete by remember { mutableStateOf<VaultMediaItem?>(null) }
    var pendingExport by remember { mutableStateOf<VaultMediaItem?>(null) }
    var pendingExportConfirm by remember { mutableStateOf<VaultMediaItem?>(null) }

    val pickVisual = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(),
    ) { uris -> if (uris.isNotEmpty()) viewModel.importUris(uris) }
    val pickAudio = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris -> if (uris.isNotEmpty()) viewModel.importUris(uris) }
    val pickFiles = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris -> if (uris.isNotEmpty()) viewModel.importUris(uris) }
    val createDocument = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("*/*"),
    ) { destination ->
        val target = pendingExport
        pendingExport = null
        if (destination != null && target != null) viewModel.export(target, destination)
    }

    LaunchedEffect(notice) {
        if (notice != null) {
            kotlinx.coroutines.delay(5_000)
            viewModel.consumeNotice()
        }
    }
    LaunchedEffect(error) {
        if (error != null) {
            kotlinx.coroutines.delay(7_000)
            viewModel.consumeError()
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(
            tr("Shadow Vault", "الخزنة الظلية"),
            onBack,
            actions = { StagHero(Modifier.size(46.dp), animated = !reduced) },
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                tr("YOUR SECRETS. YOUR SPACE.", "أسرارك. مساحتك."),
                style = MaterialTheme.typography.labelSmall,
                letterSpacing = 2.sp,
                modifier = Modifier.weight(1f),
            )
            StatusPill(
                tr("Local only", "محلي فقط"),
                tone = KnouxColors.Success,
            )
        }
        Spacer(Modifier.height(10.dp))
        VaultCategoryTabs(category, viewModel::setCategory)
        Spacer(Modifier.height(10.dp))
        error?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Alert)
            Spacer(Modifier.height(6.dp))
        }
        notice?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Success)
            Spacer(Modifier.height(6.dp))
        }
        Box(Modifier.weight(1f)) {
            if (items.isEmpty()) {
                GlassCard(Modifier.fillMaxWidth()) {
                    Text(
                        tr(
                            "No encrypted items in this category yet. Import photos, videos, audio or files; they are encrypted before they reach disk.",
                            "لا توجد عناصر مشفرة في هذه الفئة بعد. استورد الصور أو الفيديو أو الصوت أو الملفات؛ تُشفَّر قبل وصولها إلى القرص.",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        tr(
                            "Original files are not removed from your device automatically.",
                            "لا تُزال ملفاتك الأصلية من جهازك تلقائيًا.",
                        ),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Faint,
                    )
                }
            } else {
                LazyVerticalStaggeredGrid(
                    columns = StaggeredGridCells.Fixed(2),
                    modifier = Modifier.fillMaxSize(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalItemSpacing = 8.dp,
                    contentPadding = PaddingValues(bottom = 8.dp),
                ) {
                    items(items, key = { it.id }) { item ->
                        VaultTile(
                            item = item,
                            thumbnail = thumbs[item.id],
                            reducedMotion = reduced,
                            onOpen = { viewModel.openViewer(item) },
                            onDetails = { details = item },
                        )
                    }
                }
            }
        }
        importProgress?.let { progress ->
            Spacer(Modifier.height(8.dp))
            GlassCard(Modifier.fillMaxWidth(), contentPadding = PaddingValues(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "${progress.index}/${progress.total} · ${progress.fileName}",
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Violet,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = viewModel::cancelImport) {
                        Text(tr("Cancel", "إلغاء"), color = KnouxColors.Alert)
                    }
                }
                LinearProgressIndicator(
                    progress = { progress.fraction },
                    modifier = Modifier.fillMaxWidth(),
                    color = KnouxColors.Violet,
                    trackColor = KnouxColors.Raised,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    tr(
                        "Encrypting into app-private storage. No plaintext copy is written.",
                        "جارٍ التشفير إلى التخزين الخاص بالتطبيق. لا تُكتب نسخة نصية.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
            }
        }
        importFailure?.let { failure ->
            Spacer(Modifier.height(8.dp))
            GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Alert.copy(alpha = 0.5f)) {
                Text(failure.message, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Alert)
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (failure.retryable) {
                        TextButton(onClick = viewModel::retryFailed) {
                            Text(tr("Retry", "إعادة المحاولة"), color = KnouxColors.Violet)
                        }
                    }
                    TextButton(onClick = viewModel::dismissImportFailure) {
                        Text(tr("Dismiss", "تجاهل"))
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        VaultUsageCard(usage)
        Spacer(Modifier.height(8.dp))
        KnouxPrimaryButton(tr("Import securely", "استيراد آمن"), { showImportOptions = true })
        Spacer(Modifier.height(6.dp))
        Text(
            tr(
                "Imported files are encrypted with the device vault key. Original files are not automatically removed from your device.",
                "تُشفَّر الملفات المستوردة بمفتاح الخزنة على الجهاز. لا تُزال الملفات الأصلية تلقائيًا من جهازك.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Faint,
        )
        Spacer(Modifier.height(10.dp))
    }

    if (showImportOptions) {
        AlertDialog(
            onDismissRequest = { showImportOptions = false },
            title = { Text(tr("Import into Shadow Vault", "استيراد إلى الخزنة الظلية")) },
            text = {
                Column {
                    Text(
                        tr(
                            "Use the system picker. The app requests no broad storage permission and reads only the items you choose.",
                            "استخدم منتقي النظام. لا يطلب التطبيق إذن تخزين واسعًا ويقرأ فقط العناصر التي تختارها.",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(Modifier.height(8.dp))
                    ImportOption(tr("Photos & videos", "الصور والفيديو")) {
                        showImportOptions = false
                        pickVisual.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo),
                        )
                    }
                    ImportOption(tr("Audio", "الصوت")) {
                        showImportOptions = false
                        pickAudio.launch(arrayOf("audio/*"))
                    }
                    ImportOption(tr("Any file", "أي ملف")) {
                        showImportOptions = false
                        pickFiles.launch(arrayOf("*/*"))
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showImportOptions = false }) { Text(tr("Cancel", "إلغاء")) }
            },
        )
    }

    details?.let { item ->
        VaultDetailsDialog(
            item = item,
            onDismiss = { details = null },
            onOpen = { details = null; viewModel.openViewer(item) },
            onExport = { details = null; pendingExportConfirm = item },
            onDelete = { details = null; pendingDelete = item },
        )
    }

    pendingExportConfirm?.let { item ->
        AlertDialog(
            onDismissRequest = { pendingExportConfirm = null },
            title = { Text(tr("Export a decrypted copy?", "تصدير نسخة مفكوكة التشفير؟")) },
            text = {
                Text(
                    tr(
                        "The selected media will be written as plaintext to the destination you choose outside the encrypted vault. Anyone with access to that file can read it. This cannot be undone from inside KNOUX.",
                        "ستُكتب الوسائط المحددة كنص صريح في الوجهة التي تختارها خارج الخزنة المشفرة. يمكن لأي شخص يصل إلى ذلك الملف قراءته. لا يمكن التراجع عن ذلك من داخل KNOUX.",
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    pendingExportConfirm = null
                    pendingExport = item
                    createDocument.launch(item.payload?.displayName ?: "vault-export.bin")
                }) { Text(tr("Choose destination", "اختر الوجهة"), color = KnouxColors.Violet) }
            },
            dismissButton = {
                TextButton(onClick = { pendingExportConfirm = null }) { Text(tr("Cancel", "إلغاء")) }
            },
        )
    }

    pendingDelete?.let { item ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(tr("Delete encrypted media?", "حذف الوسائط المشفرة؟")) },
            text = {
                Text(
                    tr(
                        "Removes the encrypted record and its encrypted files from app storage. This is logical deletion; it is not a provable physical erase, and it cannot be undone inside the app.",
                        "يزيل السجل المشفر وملفاته المشفرة من تخزين التطبيق. هذا حذف منطقي وليس تمزيقًا ماديًا يمكن إثباته، ولا يمكن التراجع عنه داخل التطبيق.",
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = null
                    viewModel.delete(item)
                }) { Text(tr("Delete", "حذف"), color = KnouxColors.Alert) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text(tr("Cancel", "إلغاء")) }
            },
        )
    }

    viewer?.let { state ->
        VaultViewerDialog(
            state = state,
            image = viewerImage,
            container = container,
            onClose = viewModel::closeViewer,
        )
    }
}

@Composable
private fun ImportOption(label: String, onClick: () -> Unit) {
    TextButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Text(label, color = KnouxColors.Violet, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun VaultCategoryTabs(selected: VaultCategory, onSelect: (VaultCategory) -> Unit) {
    Row(
        Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        VaultCategory.entries.forEach { option ->
            val active = option == selected
            Text(
                categoryLabel(option),
                fontSize = 12.sp,
                color = if (active) KnouxColors.Text else KnouxColors.Muted,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(if (active) KnouxColors.VioletDeep.copy(alpha = 0.7f) else KnouxColors.Raised)
                    .border(1.dp, if (active) KnouxColors.LineHot else KnouxColors.Line, CircleShape)
                    .clickable { onSelect(option) }
                    .padding(horizontal = 14.dp, vertical = 7.dp),
                fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
            )
        }
    }
}

@Composable
private fun mediaTypeLabel(type: VaultMediaType): String = when (type) {
    VaultMediaType.PHOTO -> tr("Photo", "صورة")
    VaultMediaType.VIDEO -> tr("Video", "فيديو")
    VaultMediaType.AUDIO -> tr("Audio", "صوت")
    VaultMediaType.FILE -> tr("File", "ملف")
}

@Composable
private fun categoryLabel(category: VaultCategory): String = when (category) {
    VaultCategory.PHOTOS -> tr("Photos", "الصور")
    VaultCategory.VIDEOS -> tr("Videos", "الفيديو")
    VaultCategory.AUDIO -> tr("Audio", "الصوت")
    VaultCategory.FILES -> tr("Files", "الملفات")
}

@Composable
private fun VaultUsageCard(usage: VaultUsage) {
    GlassCard(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionLabel(tr("Encrypted Vault", "الخزنة المشفرة"))
            Spacer(Modifier.weight(1f))
            Text(
                tr(
                    "${usage.itemCount} items · ${formatBytes(usage.encryptedBytes)}",
                    "${usage.itemCount} عنصرًا · ${formatBytes(usage.encryptedBytes)}",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Muted,
            )
        }
        Spacer(Modifier.height(8.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .height(7.dp)
                .clip(CircleShape)
                .background(KnouxColors.Raised),
        ) {
            if (usage.encryptedBytes > 0) {
                VaultMediaType.entries.forEach { type ->
                    val bytes = usage.byType[type] ?: 0L
                    if (bytes > 0) {
                        Box(
                            Modifier
                                .weight(bytes.toFloat())
                                .fillMaxSize()
                                .background(typeColor(type)),
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            tr(
                "${formatBytes(usage.byType[VaultMediaType.PHOTO] ?: 0L)} photos · " +
                    "${formatBytes(usage.byType[VaultMediaType.VIDEO] ?: 0L)} video · " +
                    "${formatBytes(usage.byType[VaultMediaType.AUDIO] ?: 0L)} audio · " +
                    "${formatBytes(usage.byType[VaultMediaType.FILE] ?: 0L)} files",
                "${formatBytes(usage.byType[VaultMediaType.PHOTO] ?: 0L)} صور · " +
                    "${formatBytes(usage.byType[VaultMediaType.VIDEO] ?: 0L)} فيديو · " +
                    "${formatBytes(usage.byType[VaultMediaType.AUDIO] ?: 0L)} صوت · " +
                    "${formatBytes(usage.byType[VaultMediaType.FILE] ?: 0L)} ملفات",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Faint,
        )
        if (usage.unreadableCount > 0) {
            Spacer(Modifier.height(4.dp))
            Text(
                tr(
                    "${usage.unreadableCount} record(s) could not be decrypted and are shown only as unreadable entries.",
                    "${usage.unreadableCount} سجلًا تعذر فك تشفيره ويظهر كسجل غير قابل للقراءة فقط.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Alert,
            )
        }
    }
}

@Composable
private fun typeColor(type: VaultMediaType): Color = when (type) {
    VaultMediaType.PHOTO -> KnouxColors.Violet
    VaultMediaType.VIDEO -> KnouxColors.VioletSoft
    VaultMediaType.AUDIO -> KnouxColors.Success
    VaultMediaType.FILE -> KnouxColors.Warn
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun VaultTile(
    item: VaultMediaItem,
    thumbnail: Bitmap?,
    reducedMotion: Boolean,
    onOpen: () -> Unit,
    onDetails: () -> Unit,
) {
    val shape = RoundedCornerShape(18.dp)
    val typeLabel = mediaTypeLabel(item.type)
    val tileDescription = tr(
        "$typeLabel item, protected by the encrypted vault",
        "عنصر $typeLabel محمي بالخزنة المشفرة",
    )
    val ratio = if (item.type == VaultMediaType.PHOTO || item.type == VaultMediaType.VIDEO) {
        item.aspectRatio.coerceIn(0.68f, 1.4f)
    } else {
        1f
    }
    val shutter = remember { Animatable(if (reducedMotion) 0f else 1f) }
    LaunchedEffect(item.id, reducedMotion) {
        if (!reducedMotion) {
            shutter.snapTo(1f)
            kotlinx.coroutines.delay((item.id.hashCode().toLong() and 0x7F))
            shutter.animateTo(0f, tween(650, easing = FastOutSlowInEasing))
        }
    }
    Box(
        Modifier
            .fillMaxWidth()
            .aspectRatio(ratio)
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(
                        typeColor(item.type).copy(alpha = 0.28f),
                        KnouxColors.Sealed,
                        KnouxColors.CardBottom,
                    ),
                ),
            )
            .border(1.dp, KnouxColors.Line, shape)
            .semantics(mergeDescendants = true) {
                contentDescription = tileDescription
            }
            .combinedClickable(onClick = onOpen, onLongClick = onDetails),
    ) {
        if (thumbnail != null) {
            Image(
                bitmap = thumbnail.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxSize()
                    .blur(if (item.type == VaultMediaType.VIDEO) 14.dp else 7.dp),
            )
        } else {
            MediaGlyph(item.type, Modifier.align(Alignment.Center).size(54.dp))
        }
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(
                            KnouxColors.VioletDeep.copy(alpha = 0.08f),
                            KnouxColors.Obsidian.copy(alpha = 0.55f),
                            KnouxColors.Obsidian.copy(alpha = 0.9f),
                        ),
                    ),
                ),
        )
        Box(
            Modifier
                .fillMaxSize()
                .graphicsLayer {
                    scaleY = shutter.value
                    transformOrigin = TransformOrigin(0.5f, 0f)
                }
                .background(
                    Brush.verticalGradient(
                        listOf(KnouxColors.VioletDeep.copy(alpha = 0.55f), Color.Transparent),
                    ),
                ),
        )
        Box(
            Modifier
                .align(Alignment.Center)
                .size(38.dp)
                .clip(CircleShape)
                .background(Color(0xAA0B061A))
                .border(1.dp, KnouxColors.LineHot.copy(alpha = 0.6f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            LockGlyph(Modifier.size(20.dp), tint = KnouxColors.Violet)
        }
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .padding(9.dp),
        ) {
            Text(
                typeLabel,
                style = MaterialTheme.typography.labelSmall,
                color = typeColor(item.type),
                letterSpacing = 1.sp,
            )
            Text(
                item.payload?.let { formatBytes(it.sizeBytes) } ?: tr("Unreadable", "غير قابل للقراءة"),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Muted,
            )
        }
        Text(
            "⋮",
            fontSize = 18.sp,
            color = KnouxColors.Text,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .clip(CircleShape)
                .clickable(onClick = onDetails)
                .padding(horizontal = 9.dp, vertical = 2.dp),
        )
    }
}

@Composable
private fun VaultDetailsDialog(
    item: VaultMediaItem,
    onDismiss: () -> Unit,
    onOpen: () -> Unit,
    onExport: () -> Unit,
    onDelete: () -> Unit,
) {
    val formatter = remember { SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()) }
    val payload = item.payload
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                payload?.displayName ?: tr("Unreadable record", "سجل غير قابل للقراءة"),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        },
        text = {
            Column {
                DetailRow(tr("Type", "النوع"), mediaTypeLabel(item.type))
                DetailRow(tr("MIME", "نوع MIME"), payload?.mimeType ?: "—")
                DetailRow(
                    tr("Plaintext size", "حجم النص الأصلي"),
                    payload?.let { formatBytes(it.sizeBytes) } ?: "—",
                )
                DetailRow(
                    tr("Encrypted size", "الحجم المشفر"),
                    payload?.let { formatBytes(it.containerBytes + it.thumbnailBytes) } ?: "—",
                )
                if ((payload?.width ?: 0) > 0 && (payload?.height ?: 0) > 0) {
                    DetailRow(tr("Dimensions", "الأبعاد"), "${payload!!.width} × ${payload.height}")
                }
                if ((payload?.durationMs ?: 0L) > 0) {
                    DetailRow(tr("Duration", "المدة"), formatDuration(payload!!.durationMs))
                }
                DetailRow(
                    tr("Imported", "تاريخ الاستيراد"),
                    payload?.let { formatter.format(Date(it.importedAt)) } ?: "—",
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    tr(
                        "The grid shows an encrypted, blurred thumbnail. The full media is decrypted only in a secure viewer or when you export it after confirmation.",
                        "يعرض الشبكة صورة مصغرة مشفرة ومموهة. تُفك شفرة الوسائط الكاملة فقط في العارض الآمن أو عند تصديرها بعد التأكيد.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
            }
        },
        confirmButton = {
            if (item.readable) {
                TextButton(onClick = onOpen) { Text(tr("Open securely", "فتح آمن"), color = KnouxColors.Violet) }
            }
        },
        dismissButton = {
            Row {
                if (item.readable) {
                    TextButton(onClick = onExport) { Text(tr("Export", "تصدير"), color = KnouxColors.Warn) }
                }
                TextButton(onClick = onDelete) { Text(tr("Delete", "حذف"), color = KnouxColors.Alert) }
                TextButton(onClick = onDismiss) { Text(tr("Close", "إغلاق")) }
            }
        },
    )
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Text(label, style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.weight(1f))
        Text(
            value,
            style = MaterialTheme.typography.bodySmall,
            color = KnouxColors.Text,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun VaultViewerDialog(
    state: VaultViewerState,
    image: Bitmap?,
    container: AppContainer,
    onClose: () -> Unit,
) {
    val item = state.item
    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0xFA05030A))
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(14.dp),
        ) {
            Column(Modifier.fillMaxSize()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            item.payload?.displayName ?: tr("Encrypted media", "وسائط مشفرة"),
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            tr("Authenticated stream · in memory", "بث موثق · في الذاكرة"),
                            style = MaterialTheme.typography.labelSmall,
                            color = KnouxColors.Violet,
                        )
                    }
                    TextButton(onClick = onClose) { Text(tr("Close", "إغلاق")) }
                }
                Spacer(Modifier.height(10.dp))
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    when (item.type) {
                        VaultMediaType.PHOTO -> {
                            when {
                                state.error != null -> ViewerMessage(state.error!!, onClose)
                                image != null -> ZoomableImage(image)
                                else -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    CircularProgressIndicator(color = KnouxColors.Violet)
                                }
                            }
                        }

                        VaultMediaType.VIDEO -> SecureMediaPlayer(
                            item = item,
                            container = container,
                            video = true,
                            onClose = onClose,
                        )

                        VaultMediaType.AUDIO -> SecureMediaPlayer(
                            item = item,
                            container = container,
                            video = false,
                            onClose = onClose,
                        )

                        VaultMediaType.FILE -> ViewerMessage(
                            tr(
                                "No in-app preview is available for this file type. Export a decrypted copy after confirmation if you need to open it elsewhere.",
                                "لا يتوفر عرض داخل التطبيق لهذا النوع من الملفات. صدّر نسخة مفكوكة التشفير بعد التأكيد إذا احتجت لفتحها في مكان آخر.",
                            ),
                            onClose,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ViewerMessage(message: String, onClose: () -> Unit) {
    Column(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        LockGlyph(Modifier.size(44.dp), tint = KnouxColors.Violet)
        Spacer(Modifier.height(12.dp))
        Text(message, style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(8.dp))
        KnouxGhostButton(tr("Back to vault", "العودة إلى الخزنة"), onClose, Modifier.width(220.dp))
    }
}

@Composable
private fun ZoomableImage(bitmap: Bitmap) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { androidx.compose.runtime.mutableStateOf(Offset.Zero) }
    Box(
        Modifier
            .fillMaxSize()
            .clip(RoundedCornerShape(14.dp))
            .background(Color.Black),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            bitmap = bitmap.asImageBitmap(),
            contentDescription = tr("Decrypted image", "صورة مفكوكة التشفير"),
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        scale = (scale * zoom).coerceIn(1f, 6f)
                        offset = if (scale <= 1f) Offset.Zero else offset + pan
                    }
                }
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationX = offset.x
                    translationY = offset.y
                },
        )
    }
}

@Composable
private fun MediaGlyph(type: VaultMediaType, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val tint = when (type) {
            VaultMediaType.PHOTO -> KnouxColors.Violet
            VaultMediaType.VIDEO -> KnouxColors.VioletSoft
            VaultMediaType.AUDIO -> KnouxColors.Success
            VaultMediaType.FILE -> KnouxColors.Warn
        }
        val stroke = size.minDimension * 0.07f
        when (type) {
            VaultMediaType.PHOTO -> {
                drawCircle(tint.copy(alpha = 0.28f), radius = size.minDimension * 0.36f)
                drawCircle(tint, radius = size.minDimension * 0.1f, center = Offset(size.width * 0.66f, size.height * 0.33f))
                val path = androidx.compose.ui.graphics.Path().apply {
                    moveTo(size.width * 0.12f, size.height * 0.78f)
                    lineTo(size.width * 0.4f, size.height * 0.44f)
                    lineTo(size.width * 0.58f, size.height * 0.66f)
                    lineTo(size.width * 0.72f, size.height * 0.52f)
                    lineTo(size.width * 0.9f, size.height * 0.78f)
                    close()
                }
                drawPath(path, brush = Brush.verticalGradient(listOf(tint, tint.copy(alpha = 0.4f))))
            }

            VaultMediaType.VIDEO -> {
                drawCircle(tint.copy(alpha = 0.2f), radius = size.minDimension * 0.4f)
                val path = androidx.compose.ui.graphics.Path().apply {
                    moveTo(size.width * 0.38f, size.height * 0.28f)
                    lineTo(size.width * 0.38f, size.height * 0.72f)
                    lineTo(size.width * 0.74f, size.height * 0.5f)
                    close()
                }
                drawPath(path, tint)
            }

            VaultMediaType.AUDIO -> {
                val heights = listOf(0.3f, 0.62f, 0.44f, 0.82f, 0.5f)
                heights.forEachIndexed { index, value ->
                    val x = size.width * (0.16f + index * 0.17f)
                    drawLine(
                        tint,
                        start = Offset(x, size.height * (0.5f - value / 2f)),
                        end = Offset(x, size.height * (0.5f + value / 2f)),
                        strokeWidth = stroke,
                        cap = androidx.compose.ui.graphics.StrokeCap.Round,
                    )
                }
            }

            VaultMediaType.FILE -> {
                val left = size.width * 0.24f
                val top = size.height * 0.12f
                val width = size.width * 0.52f
                val height = size.height * 0.76f
                drawRoundRect(
                    tint.copy(alpha = 0.28f),
                    topLeft = Offset(left, top),
                    size = Size(width, height),
                    cornerRadius = CornerRadius(size.width * 0.06f),
                )
                drawRoundRect(
                    tint,
                    topLeft = Offset(left, top),
                    size = Size(width, height),
                    cornerRadius = CornerRadius(size.width * 0.06f),
                    style = Stroke(width = stroke),
                )
                repeat(3) { line ->
                    val y = top + height * (0.34f + line * 0.16f)
                    drawLine(
                        tint,
                        start = Offset(left + width * 0.16f, y),
                        end = Offset(left + width * 0.84f, y),
                        strokeWidth = stroke * 0.7f,
                        cap = androidx.compose.ui.graphics.StrokeCap.Round,
                    )
                }
            }
        }
    }
}

@Composable
private fun LockGlyph(modifier: Modifier = Modifier, tint: Color = KnouxColors.Violet) {
    Canvas(modifier) {
        val bodyWidth = size.width * 0.66f
        val bodyHeight = size.height * 0.48f
        val left = (size.width - bodyWidth) / 2f
        val top = size.height * 0.45f
        drawRoundRect(
            tint,
            topLeft = Offset(left, top),
            size = Size(bodyWidth, bodyHeight),
            cornerRadius = CornerRadius(size.width * 0.1f),
        )
        drawArc(
            tint,
            startAngle = 180f,
            sweepAngle = 180f,
            useCenter = false,
            topLeft = Offset(size.width * 0.27f, size.height * 0.12f),
            size = Size(size.width * 0.46f, size.height * 0.58f),
            style = Stroke(width = size.width * 0.09f, cap = androidx.compose.ui.graphics.StrokeCap.Round),
        )
        drawCircle(
            KnouxColors.Obsidian,
            radius = size.width * 0.07f,
            center = Offset(size.width * 0.5f, top + bodyHeight * 0.42f),
        )
    }
}