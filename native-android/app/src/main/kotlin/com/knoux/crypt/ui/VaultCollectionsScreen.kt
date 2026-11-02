package com.knoux.crypt.ui

import android.app.Application
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.CollectionFailure
import com.knoux.crypt.data.CollectionRejectedException
import com.knoux.crypt.data.VaultCollection
import com.knoux.crypt.data.VaultCollectionSummary
import com.knoux.crypt.data.VaultLockedException
import com.knoux.crypt.data.VaultMediaItem
import com.knoux.crypt.data.VaultMediaType
import com.knoux.crypt.data.VaultCollectionsService
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.LocalReducedMotion
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StagHero
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class CollectionEditorState(val collection: VaultCollection, val label: String)

class VaultCollectionsViewModel(
    application: Application,
    private val container: AppContainer,
) : AndroidViewModel(application) {
    private val collections = container.vaultCollections
    private val media = container.shadowVault

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()
    private val _typeFilter = MutableStateFlow<VaultMediaType?>(null)
    val typeFilter: StateFlow<VaultMediaType?> = _typeFilter.asStateFlow()
    private val _summaries = MutableStateFlow<List<VaultCollectionSummary>>(emptyList())
    val summaries: StateFlow<List<VaultCollectionSummary>> = _summaries.asStateFlow()

    val filtered: StateFlow<List<VaultCollectionSummary>> =
        combine(_summaries, _query, _typeFilter) { rows, query, type ->
            val needle = query.trim().lowercase()
            rows.filter { summary ->
                (needle.isEmpty() || summary.collection.label.lowercase().contains(needle)) &&
                    (type == null || summary.types.contains(type))
            }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _unreadableCount = MutableStateFlow(0)
    val unreadableCount: StateFlow<Int> = _unreadableCount.asStateFlow()
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()
    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice.asStateFlow()

    private val _collectionsCache = MutableStateFlow<List<VaultCollection>>(emptyList())
    private val _itemsCache = MutableStateFlow<List<VaultMediaItem>>(emptyList())

    init {
        viewModelScope.launch {
            container.session.unlocked.collectLatest { unlocked ->
                if (!unlocked) {
                    _collectionsCache.value = emptyList()
                    _itemsCache.value = emptyList()
                    recompute()
                    _error.value = null
                    _notice.value = null
                    return@collectLatest
                }
                val access = container.session.currentAccess() ?: return@collectLatest
                launch {
                    try {
                        collections.observeCollections(access).collect { rows ->
                            _collectionsCache.value = rows
                            _unreadableCount.value = rows.count { !it.readable }
                            recompute()
                        }
                    } catch (_: VaultLockedException) {
                        recompute()
                    }
                }
                try {
                    media.observe(access).collect { rows ->
                        _itemsCache.value = rows.filter { it.readable }
                        recompute()
                    }
                } catch (_: VaultLockedException) {
                    recompute()
                }
            }
        }
    }

    private fun recompute() {
        _summaries.value = collections.summaries(
            _collectionsCache.value.filter { it.readable },
            _itemsCache.value,
        )
    }

    fun setQuery(value: String) { _query.value = value }

    fun setTypeFilter(value: VaultMediaType?) { _typeFilter.value = value }

    fun create(label: String) {
        val access = container.session.currentAccess() ?: return lockedError()
        viewModelScope.launch {
            _busy.value = true
            runCatching { collections.create(access, label) }
                .onSuccess { _notice.value = "Collection created." }
                .onFailure { _error.value = message(it) }
            _busy.value = false
        }
    }

    fun rename(collection: VaultCollection, label: String) {
        val access = container.session.currentAccess() ?: return lockedError()
        viewModelScope.launch {
            _busy.value = true
            runCatching { collections.rename(access, collection.id, label, collection.updatedAt) }
                .onSuccess { _notice.value = "Collection renamed." }
                .onFailure { _error.value = message(it) }
            _busy.value = false
        }
    }

    /** Clears membership first, so a failure keeps the collection instead of orphaning items. */
    fun delete(summary: VaultCollectionSummary) {
        val access = container.session.currentAccess() ?: return lockedError()
        viewModelScope.launch {
            _busy.value = true
            runCatching { collections.delete(access, summary.collection.id, _itemsCache.value) }
                .onSuccess { cleared ->
                    _notice.value = if (cleared > 0) {
                        "Collection deleted. $cleared item(s) were kept and moved to uncategorized."
                    } else {
                        "Empty collection deleted. No media was removed."
                    }
                }
                .onFailure { _error.value = message(it) }
            _busy.value = false
        }
    }

    fun consumeError() { _error.value = null }
    fun consumeNotice() { _notice.value = null }

    private fun lockedError() { _error.value = "The vault is locked." }

    private fun message(failure: Throwable): String = when {
        failure is CollectionRejectedException -> when (failure.failure) {
            CollectionFailure.DUPLICATE_NAME -> "A collection with that name already exists."
            CollectionFailure.EMPTY_NAME -> "Enter a collection name."
            CollectionFailure.NAME_TOO_LONG -> "The name must be at most ${VaultCollectionsService.MAX_LABEL_CHARS} characters."
            CollectionFailure.COLLECTION_NOT_FOUND -> "That collection no longer exists."
            CollectionFailure.MEDIA_NOT_FOUND -> "An item in the collection disappeared; nothing was deleted."
            CollectionFailure.MEDIA_UNREADABLE -> "An item's encrypted metadata is unreadable; the collection was kept."
            CollectionFailure.STALE_REVISION -> "The collection changed while you were editing. Try again."
            CollectionFailure.LIMIT_REACHED -> "The collection limit has been reached."
        }
        failure is VaultLockedException -> "The vault locked during the operation."
        else -> failure.message ?: "The collection operation failed."
    }
}

@Composable
fun VaultCollectionsScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
    onOpenCollection: (String) -> Unit,
    onOpenVault: () -> Unit,
) {
    val unlocked by container.session.unlocked.collectAsStateWithLifecycle()
    if (!unlocked) {
        LockedScreen(tr("Vault Collections", "مجموعات الخزنة"), onBack, onNeedUnlock)
        return
    }
    val application = LocalContext.current.applicationContext as Application
    val viewModel: VaultCollectionsViewModel = viewModel(
        factory = viewModelFactory { VaultCollectionsViewModel(application, container) },
    )
    val rows by viewModel.filtered.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val typeFilter by viewModel.typeFilter.collectAsStateWithLifecycle()
    val unreadable by viewModel.unreadableCount.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val notice by viewModel.notice.collectAsStateWithLifecycle()
    val reduced = LocalReducedMotion.current

    var showCreate by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<CollectionEditorState?>(null) }
    var pendingDelete by remember { mutableStateOf<VaultCollectionSummary?>(null) }

    LaunchedEffect(notice) {
        if (notice != null) {
            kotlinx.coroutines.delay(6_000)
            viewModel.consumeNotice()
        }
    }
    LaunchedEffect(error) {
        if (error != null) {
            kotlinx.coroutines.delay(8_000)
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
            tr("Vault Collections", "مجموعات الخزنة"),
            onBack,
            actions = { StagHero(Modifier.size(46.dp), animated = !reduced) },
        )
        Text(
            tr("Private Vault ", "خزنة خاصة "),
            style = MaterialTheme.typography.headlineMedium,
        )
        Text(
            tr("Collections", "المجموعات"),
            style = MaterialTheme.typography.headlineMedium,
            color = KnouxColors.Violet,
        )
        Text(
            tr("ORGANIZE. PROTECT. ACCESS ANYWHERE.", "نظّم. احمِ. وصول من أي مكان."),
            style = MaterialTheme.typography.labelSmall,
            letterSpacing = 2.sp,
        )
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            CollectionActionCard(
                title = tr("Create Collection", "إنشاء مجموعة"),
                subtitle = tr("New encrypted folder", "مجلد مشفر جديد"),
                plus = true,
                modifier = Modifier.weight(1f),
                onClick = { showCreate = true },
            )
            CollectionActionCard(
                title = tr("Import Encrypted", "استيراد مشفر"),
                subtitle = tr("Add files & folders", "أضف ملفات ومجلدات"),
                plus = false,
                modifier = Modifier.weight(1f),
                onClick = onOpenVault,
            )
        }
        Spacer(Modifier.height(12.dp))
        BasicTextField(
            value = query,
            onValueChange = viewModel::setQuery,
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = KnouxColors.Text),
            cursorBrush = SolidColor(KnouxColors.Violet),
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0x5513091F))
                .border(1.dp, KnouxColors.Line, RoundedCornerShape(12.dp))
                .padding(horizontal = 12.dp, vertical = 10.dp),
            decorationBox = { inner ->
                Box {
                    if (query.isEmpty()) {
                        Text(
                            tr("Search collections", "ابحث في المجموعات"),
                            style = MaterialTheme.typography.bodyLarge,
                            color = KnouxColors.Faint,
                        )
                    }
                    inner()
                }
            },
        )
        Spacer(Modifier.height(8.dp))
        CollectionTypeFilter(typeFilter, viewModel::setTypeFilter)
        Spacer(Modifier.height(8.dp))
        error?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Alert)
            Spacer(Modifier.height(6.dp))
        }
        notice?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Success)
            Spacer(Modifier.height(6.dp))
        }
        if (unreadable > 0) {
            Text(
                tr(
                    "$unreadable collection record(s) could not be decrypted and are not listed. Nothing was replaced.",
                    "${unreadable} سجل مجموعة تعذر فك تشفيره ولا يُعرض. لم يستبدل شيء.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Alert,
            )
            Spacer(Modifier.height(6.dp))
        }
        LazyColumn(
            Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (rows.isEmpty()) {
                item(key = "empty") {
                    GlassCard(Modifier.fillMaxWidth()) {
                        Text(
                            if (query.isNotBlank() || typeFilter != null) {
                                tr(
                                    "No collections match this filter.",
                                    "لا توجد مجموعات تطابق هذا التصفية.",
                                )
                            } else {
                                tr(
                                    "No collections yet. Create one, then move encrypted vault items into it from the Shadow Vault.",
                                    "لا توجد مجموعات بعد. أنشئ واحدة ثم انقل عناصر الخزنة المشفرة إليها من الخزنة الظلية.",
                                )
                            },
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
            items(rows, key = { it.collection.id }) { summary ->
                CollectionCard(
                    summary = summary,
                    reducedMotion = reduced,
                    onOpen = { onOpenCollection(summary.collection.id) },
                    onRename = { editing = CollectionEditorState(summary.collection, summary.collection.label) },
                    onDelete = { pendingDelete = summary },
                )
            }
            item(key = "footer") {
                Text(
                    tr(
                        "Collection names and membership live inside encrypted vault records. Deleting a collection never deletes its media.",
                        "أسماء المجموعات وعضويتها موجودة داخل سجلات خزنة مشفرة. حذف مجموعة لا يحذف وسائطها أبدًا.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                    modifier = Modifier.padding(top = 6.dp),
                )
                Spacer(Modifier.height(14.dp))
            }
        }
    }

    if (showCreate) {
        CollectionNameDialog(
            title = tr("New collection", "مجموعة جديدة"),
            initial = "",
            busy = busy,
            onConfirm = { label ->
                showCreate = false
                viewModel.create(label)
            },
            onDismiss = { showCreate = false },
        )
    }

    editing?.let { state ->
        CollectionNameDialog(
            title = tr("Rename collection", "إعادة تسمية المجموعة"),
            initial = state.label,
            busy = busy,
            onConfirm = { label ->
                editing = null
                viewModel.rename(state.collection, label)
            },
            onDismiss = { editing = null },
        )
    }

    pendingDelete?.let { summary ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(tr("Delete this collection?", "حذف هذه المجموعة؟")) },
            text = {
                Text(
                    tr(
                        "Removes only the collection record. ${summary.itemCount} encrypted item(s) stay in the vault and move to uncategorized. This cannot be undone inside the app.",
                        "يزيل سجل المجموعة فقط. ${summary.itemCount} عنصرًا مشفرًا يبقى في الخزنة وينتقل إلى بلا تصنيف. لا يمكن التراجع داخل التطبيق.",
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = null
                    viewModel.delete(summary)
                }) { Text(tr("Delete collection", "حذف المجموعة"), color = KnouxColors.Alert) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text(tr("Cancel", "إلغاء")) }
            },
        )
    }
}

@Composable
private fun CollectionActionCard(
    title: String,
    subtitle: String,
    plus: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(16.dp)
    Column(
        modifier
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(KnouxColors.VioletDeep.copy(alpha = 0.42f), KnouxColors.CardBottom),
                ),
            )
            .border(1.dp, KnouxColors.Line, shape)
            .clickable(onClick = onClick)
            .padding(12.dp),
    ) {
        Box(
            Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(KnouxColors.Violet.copy(alpha = 0.24f)),
            contentAlignment = Alignment.Center,
        ) {
            if (plus) {
                Canvas(Modifier.size(18.dp)) {
                    val stroke = size.minDimension * 0.16f
                    drawLine(KnouxColors.Violet, Offset(size.width * 0.5f, 0f), Offset(size.width * 0.5f, size.height), stroke)
                    drawLine(KnouxColors.Violet, Offset(0f, size.height * 0.5f), Offset(size.width, size.height * 0.5f), stroke)
                }
            } else {
                Canvas(Modifier.size(18.dp)) {
                    val stroke = size.minDimension * 0.12f
                    drawArc(
                        KnouxColors.Violet,
                        startAngle = 20f,
                        sweepAngle = 140f,
                        useCenter = false,
                        topLeft = Offset(0f, size.height * 0.28f),
                        size = Size(size.width, size.height * 0.72f),
                        style = androidx.compose.ui.graphics.drawscope.Stroke(width = stroke),
                    )
                    drawLine(
                        KnouxColors.Violet,
                        Offset(size.width * 0.5f, size.height * 0.78f),
                        Offset(size.width * 0.5f, 0f),
                        stroke,
                        cap = androidx.compose.ui.graphics.StrokeCap.Round,
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(subtitle, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Muted)
    }
}

@Composable
private fun CollectionCard(
    summary: VaultCollectionSummary,
    reducedMotion: Boolean,
    onOpen: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
) {
    val shape = RoundedCornerShape(18.dp)
    var menuOpen by remember { mutableStateOf(false) }
    val press = remember { Animatable(1f) }
    LaunchedEffect(summary.itemCount) {
        if (!reducedMotion) {
            press.snapTo(1f)
            press.animateTo(1.035f, tween(160, easing = FastOutSlowInEasing))
            press.animateTo(1f, tween(220, easing = FastOutSlowInEasing))
        }
    }
    val description = tr(
        "${summary.collection.label}, ${summary.itemCount} items, encrypted",
        "${summary.collection.label}، ${summary.itemCount} عنصرًا، مشفر",
    )
    val actionsDescription = tr("Collection actions", "إجراءات المجموعة")
    Row(
        Modifier
            .fillMaxWidth()
            .scale(press.value)
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(KnouxColors.CardTop, KnouxColors.CardBottom),
                ),
            )
            .border(1.dp, KnouxColors.Line, shape)
            .semantics { contentDescription = description }
            .clickable(onClick = onOpen)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CollectionGlyph(Modifier.size(52.dp), layers = (summary.itemCount.coerceAtMost(3) + 1))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                summary.collection.label,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                tr(
                    "${summary.itemCount} items · ${formatBytes(summary.encryptedBytes)}",
                    "${summary.itemCount} عنصرًا · ${formatBytes(summary.encryptedBytes)}",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Muted,
            )
            if (summary.types.isNotEmpty()) {
                Row(
                    Modifier.padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    summary.types.forEach { type ->
                        Text(
                            collectionTypeLabel(type),
                            fontSize = 8.sp,
                            color = KnouxColors.Violet,
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(KnouxColors.Raised)
                                .padding(horizontal = 7.dp, vertical = 2.dp),
                        )
                    }
                }
            }
        }
        StatusPill(tr("Encrypted", "مشفر"), tone = KnouxColors.Success)
        Text(
            "⋮",
            fontSize = 18.sp,
            color = KnouxColors.Text,
            modifier = Modifier
                .padding(start = 6.dp)
                .clip(CircleShape)
                .clickable { menuOpen = true }
                .semantics { contentDescription = actionsDescription }
                .padding(horizontal = 4.dp),
        )
    }

    if (menuOpen) {
        AlertDialog(
            onDismissRequest = { menuOpen = false },
            title = { Text(summary.collection.label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            text = {
                Column {
                    TextButton(onClick = { menuOpen = false; onOpen() }, modifier = Modifier.fillMaxWidth()) {
                        Text(tr("Open", "فتح"), color = KnouxColors.Violet, modifier = Modifier.fillMaxWidth())
                    }
                    TextButton(onClick = { menuOpen = false; onRename() }, modifier = Modifier.fillMaxWidth()) {
                        Text(tr("Rename", "إعادة تسمية"), modifier = Modifier.fillMaxWidth())
                    }
                    TextButton(onClick = { menuOpen = false; onDelete() }, modifier = Modifier.fillMaxWidth()) {
                        Text(tr("Delete collection", "حذف المجموعة"), color = KnouxColors.Alert, modifier = Modifier.fillMaxWidth())
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { menuOpen = false }) { Text(tr("Close", "إغلاق")) }
            },
        )
    }
}

@Composable
private fun CollectionNameDialog(
    title: String,
    initial: String,
    busy: Boolean,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var value by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                com.knoux.crypt.design.KnouxTextField(
                    value = value,
                    onValueChange = { value = it },
                    label = tr("Collection name", "اسم المجموعة"),
                    singleLine = true,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    tr(
                        "The name is encrypted with the collection record. It is never written to the audit timeline or to a plaintext file.",
                        "الاسم مشفر مع سجل المجموعة، ولا يُكتب أبدًا في سجل التدقيق أو في ملف نصي.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(value.trim()) }, enabled = value.isNotBlank() && !busy) {
                Text(if (busy) tr("Saving…", "جارٍ الحفظ…") else tr("Save", "حفظ"), color = KnouxColors.Violet)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("Cancel", "إلغاء")) } },
    )
}

@Composable
private fun CollectionTypeFilter(selected: VaultMediaType?, onSelect: (VaultMediaType?) -> Unit) {
    Row(
        Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        FilterChip(tr("All", "الكل"), selected == null) { onSelect(null) }
        VaultMediaType.entries.forEach { type ->
            FilterChip(collectionTypeLabel(type), selected == type) { onSelect(type) }
        }
    }
}

@Composable
private fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label,
        fontSize = 11.sp,
        color = if (selected) KnouxColors.Text else KnouxColors.Muted,
        modifier = Modifier
            .clip(CircleShape)
            .background(if (selected) KnouxColors.VioletDeep.copy(alpha = 0.65f) else KnouxColors.Raised)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

@Composable
private fun collectionTypeLabel(type: VaultMediaType): String = when (type) {
    VaultMediaType.PHOTO -> tr("Photos", "صور")
    VaultMediaType.VIDEO -> tr("Videos", "فيديو")
    VaultMediaType.AUDIO -> tr("Audio", "صوت")
    VaultMediaType.FILE -> tr("Files", "ملفات")
}

/** Sealed folder stack; deeper layers appear as the collection fills up. */
@Composable
private fun CollectionGlyph(modifier: Modifier = Modifier, layers: Int = 2) {
    Canvas(modifier) {
        val tint = KnouxColors.Violet
        val bodyWidth = size.width * 0.72f
        val bodyHeight = size.height * 0.56f
        val left = (size.width - bodyWidth) / 2f
        repeat(layers.coerceIn(1, 4)) { index ->
            val offset = index * size.height * 0.06f
            drawRoundRect(
                tint.copy(alpha = 0.22f + index * 0.18f),
                topLeft = Offset(left + offset * 0.4f, size.height * 0.22f - offset),
                size = Size(bodyWidth, bodyHeight),
                cornerRadius = CornerRadius(size.width * 0.08f),
            )
        }
        drawRoundRect(
            tint.copy(alpha = 0.34f),
            topLeft = Offset(left, size.height * 0.34f),
            size = Size(bodyWidth, bodyHeight),
            cornerRadius = CornerRadius(size.width * 0.08f),
        )
        val lockSize = size.width * 0.24f
        val lockLeft = (size.width - lockSize) / 2f
        drawRoundRect(
            Color(0xFFEFE2FF),
            topLeft = Offset(lockLeft, size.height * 0.5f),
            size = Size(lockSize, lockSize * 0.72f),
            cornerRadius = CornerRadius(lockSize * 0.18f),
        )
        drawArc(
            Color(0xFFEFE2FF),
            startAngle = 180f,
            sweepAngle = 180f,
            useCenter = false,
            topLeft = Offset(lockLeft + lockSize * 0.16f, size.height * 0.5f - lockSize * 0.42f),
            size = Size(lockSize * 0.68f, lockSize * 0.72f),
            style = androidx.compose.ui.graphics.drawscope.Stroke(width = lockSize * 0.16f),
        )
    }
}