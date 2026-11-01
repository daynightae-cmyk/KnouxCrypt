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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.CleanResult
import com.knoux.crypt.data.Inventory
import com.knoux.crypt.data.MetadataFailure
import com.knoux.crypt.data.MetadataGroup
import com.knoux.crypt.data.MetadataCleaner
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import java.io.File
import java.io.FileOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class CleanerUiState(
    val fileName: String = "",
    val fileSize: Long? = null,
    val sourcePath: String = "",
    val inventory: Inventory? = null,
    val selected: Set<MetadataGroup> = setOf(MetadataGroup.GPS, MetadataGroup.CAMERA_MODEL, MetadataGroup.TIMESTAMPS),
    val busy: Boolean = false,
    val result: CleanResult? = null,
    val status: String? = null,
    val failed: Boolean = false,
    val previewOpen: Boolean = false,
)

class MetadataCleanerViewModel(application: Application, private val container: AppContainer) :
    AndroidViewModel(application) {
    private val _state = MutableStateFlow(CleanerUiState())
    val state: StateFlow<CleanerUiState> = _state.asStateFlow()
    private var sourceUri: Uri? = null

    fun toggle(group: MetadataGroup) = _state.update {
        it.copy(selected = if (group in it.selected) it.selected - group else it.selected + group)
    }

    fun setPreview(open: Boolean) = _state.update { it.copy(previewOpen = open) }

    fun pick(uri: Uri) {
        val app = getApplication<Application>()
        sourceUri = uri
        viewModelScope.launch {
            _state.update { it.copy(busy = true, status = null, failed = false, result = null, inventory = null) }
            val info = withContext(Dispatchers.IO) {
                val name = runCatching {
                    app.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
                        ?.use { cursor ->
                            if (!cursor.moveToFirst()) return@use null to null
                            val ni = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                            val si = cursor.getColumnIndex(OpenableColumns.SIZE)
                            (if (ni >= 0) cursor.getString(ni) else null) to
                                (if (si >= 0 && !cursor.isNull(si)) cursor.getLong(si) else null)
                        }
                }.getOrNull()
                val mime = app.contentResolver.getType(uri)
                val read = runCatching {
                    app.contentResolver.openInputStream(uri)?.use { container.metadataCleaner.inspect(it, mime) }
                }
                Triple(name?.first ?: "image", name?.second, read.getOrNull() to read.exceptionOrNull())
            }
            _state.update { current ->
                val inventory = info.third.first
                when {
                    inventory != null -> current.copy(
                        busy = false,
                        fileName = info.first,
                        fileSize = info.second,
                        sourcePath = uri.toString().take(60),
                        inventory = inventory,
                        failed = !inventory.writable,
                        status = if (inventory.writable) null else "read-only-format",
                    )

                    else -> current.copy(
                        busy = false,
                        fileName = info.first,
                        fileSize = info.second,
                        failed = true,
                        status = "unreadable",
                    )
                }
            }
        }
    }

    fun clean(destination: Uri) {
        val app = getApplication<Application>()
        val uri = sourceUri
        val inventory = _state.value.inventory
        if (uri == null || inventory == null || !inventory.writable) {
            _state.update { it.copy(failed = true, status = "nothing-to-clean") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(busy = true, status = null, failed = false) }
            val temp = File(app.cacheDir, "meta-out-${System.nanoTime()}.jpg")
            val outcome = withContext(Dispatchers.IO) {
                try {
                    runCatching {
                        val input = requireNotNull(app.contentResolver.openInputStream(uri))
                        val result = FileOutputStream(temp).use { sink ->
                            container.metadataCleaner.clean(
                                input = input,
                                output = sink,
                                cacheDir = app.cacheDir,
                                groupsToRemove = _state.value.selected,
                                mimeHint = app.contentResolver.getType(uri),
                            )
                        }
                        val copied = runCatching {
                            val out = requireNotNull(app.contentResolver.openOutputStream(destination, "w"))
                            temp.inputStream().use { source -> source.copyTo(out, 64 * 1024) }
                        }.isSuccess
                        Pair(result, copied)
                    }
                } finally {
                    runCatching { if (temp.exists()) temp.delete() }
                }
            }
            val pair = outcome.getOrNull()
            _state.update {
                when {
                    pair == null -> it.copy(busy = false, failed = true, status = "clean-failed")
                    !pair.second -> it.copy(busy = false, failed = true, status = "destination-unwritable", result = pair.first)
                    else -> it.copy(busy = false, result = pair.first, status = "cleaned", failed = false)
                }
            }
        }
    }

    /** Marks the failure kind without leaking platform exception text into the UI. */
}

@Composable
fun MetadataCleanerScreen(container: AppContainer, onBack: () -> Unit) {
    val context = LocalContext.current
    val application = context.applicationContext as Application
    val viewModel: MetadataCleanerViewModel = viewModel(
        factory = viewModelFactory { MetadataCleanerViewModel(application, container) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) viewModel.pick(uri) }
    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("image/jpeg")) { uri -> if (uri != null) viewModel.clean(uri) }

    val groupLabels = mapOf(
            MetadataGroup.TECHNICAL to (tr("EXIF data", "بيانات EXIF") to tr("Camera settings, exposure, technical info", "إعدادات الكاميرا والتعريض والمعلومات التقنية")),
            MetadataGroup.GPS to (tr("GPS location", "موقع GPS") to tr("Latitude, longitude, altitude", "خط العرض والطول والارتفاع")),
            MetadataGroup.CAMERA_MODEL to (tr("Camera model", "طراز الكاميرا") to tr("Device make and model information", "معلومات الشركة والطراز")),
            MetadataGroup.AUTHOR to (tr("Author information", "معلومات المؤلف") to tr("Creator, artist, organization", "المنشئ والفنان والجهة")),
            MetadataGroup.TIMESTAMPS to (tr("Timestamps", "الطوابع الزمنية") to tr("Date created, modified, taken", "تاريخ الإنشاء والتعديل والأخذ")),
            MetadataGroup.COMMENTS to (tr("Comments & notes", "التعليقات والملاحظات") to tr("User comments and annotations", "تعليقات المستخدم والشروحات")),
            MetadataGroup.OTHER to (tr("Other blocks", "كتل أخرى") to tr("Anything the platform exposes separately", "كل ما يكشفه النظام بشكل منفصل")),
        )

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Metadata Cleaner", "منظف البيانات الوصفية"), onBack)
        Spacer(Modifier.height(6.dp))
        Text(
            tr("Remove hidden metadata and create a clean copy of your file.", "أزل البيانات الوصفية المخفية وأنشئ نسخة نظيفة من ملفك."),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Muted,
        )
        Spacer(Modifier.height(12.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        state.fileName.ifBlank { tr("No file selected", "لم يُختر ملف") },
                        style = MaterialTheme.typography.bodyMedium,
                        color = KnouxColors.Text,
                    )
                    Text(
                        listOfNotNull(
                            state.fileSize?.let { formatBytes(it) },
                            state.inventory?.let { "${it.width} × ${it.height}" },
                            state.sourcePath.ifBlank { null }?.take(24),
                        ).joinToString(" · ").ifBlank { tr("Pick an image from the document picker", "اختر صورة من منتقي المستندات") },
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Faint,
                    )
                }
                StatusPill(
                    text = state.inventory?.format?.uppercase() ?: "—",
                    tone = if (state.inventory?.writable == true) KnouxColors.Success else KnouxColors.Warn,
                )
            }
            Spacer(Modifier.height(8.dp))
            KnouxGhostButton(tr("Choose file", "اختر ملفًا"), { pick.launch(arrayOf("image/*")) }, Modifier.fillMaxWidth())
        }
        Spacer(Modifier.height(10.dp))

        val inventory = state.inventory
        if (inventory != null) {
            GlassCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(tr("Detected metadata", "البيانات الوصفية المكتشفة"), style = MaterialTheme.typography.bodyMedium, color = KnouxColors.Text)
                        Text(
                            tr("Select which metadata to remove.", "اختر ما تُزيله من البيانات الوصفية."),
                            style = MaterialTheme.typography.labelSmall,
                            color = KnouxColors.Faint,
                        )
                    }
                    Text(
                        tr("%d categories found".format(inventory.groups.size), "%d تصنيفات".format(inventory.groups.size)),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Violet,
                    )
                }
                Spacer(Modifier.height(6.dp))
                MetadataGroup.values().forEach { group ->
                    val labelPair = groupLabels.getValue(group)
                    val count = inventory.count(group)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(labelPair.first, style = MaterialTheme.typography.bodyMedium, color = if (count > 0) KnouxColors.Text else KnouxColors.Faint)
                            Text(labelPair.second, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Faint)
                        }
                        if (count > 0) {
                            Text(
                                tr("%d items".format(count), "%d عنصر".format(count)),
                                style = MaterialTheme.typography.labelSmall,
                                color = KnouxColors.Muted,
                            )
                        }
                        Switch(
                            checked = group in state.selected && count > 0,
                            onCheckedChange = { viewModel.toggle(group) },
                            enabled = count > 0 && inventory.writable,
                        )
                    }
                }
                if (!inventory.writable) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        tr(
                            "Android's ExifInterface cannot rewrite %s. The file can be listed but not cleaned, and no clean copy will be claimed."
                                .format(inventory.format),
                            "لا يستطيع ExifInterface في أندرويد إعادة كتابة %s. يمكن سرد الملف لكن لا تنظيفه، ولن يُدعى وجود نسخة نظيفة.",
                        ),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Alert,
                    )
                }
                if (state.previewOpen) {
                    Spacer(Modifier.height(6.dp))
                    inventory.items.forEach { item ->
                        Text(
                            "${item.label}: ${item.value.take(60)}",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = FontFamily.Monospace,
                            color = KnouxColors.Muted,
                        )
                    }
                }
                Spacer(Modifier.height(4.dp))
                TextButton(onClick = { viewModel.setPreview(!state.previewOpen) }) {
                    Text(
                        if (state.previewOpen) tr("Hide all tags", "أخفِ كل الوسوم") else tr("Preview metadata", "معاينة البيانات"),
                        color = KnouxColors.Violet,
                        fontSize = 11.sp,
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
        }

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Clean copy output", "مخرجات النسخة النظيفة"))
            Spacer(Modifier.height(4.dp))
            val result = state.result
            if (result == null) {
                Text(
                    tr("No clean copy generated yet.", "لم أُنشأ نسخة نظيفة بعد."),
                    style = MaterialTheme.typography.bodySmall,
                    color = KnouxColors.Text,
                )
                Text(
                    tr("The original file remains unchanged.", "الملف الأصلي لم يتغير."),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
            } else {
                InfoRow(tr("Removed", "أُزيل"), result.removed.size.toString())
                InfoRow(tr("Kept", "بقي"), result.kept.size.toString())
                InfoRow(tr("Output size", "حجم المخرج"), formatBytes(result.outputBytes))
                result.notes.forEach {
                    Text(it, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Faint)
                }
            }
        }
        Spacer(Modifier.height(10.dp))

        KnouxPrimaryButton(
            text = tr("Create Clean Copy", "أنشئ نسخة نظيفة"),
            onClick = { save.launch((state.fileName.substringBeforeLast('.') + "-clean.jpg").ifBlank { "clean.jpg" }) },
            enabled = inventory?.writable == true && state.selected.isNotEmpty() && !state.busy,
        )
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KnouxGhostButton(
                tr("Preview Metadata", "معاينة البيانات"),
                { viewModel.setPreview(true) },
                Modifier.weight(1f),
                enabled = inventory != null,
            )
            KnouxGhostButton(tr("Choose Destination", "اختر الوجهة"), { save.launch("clean.jpg") }, Modifier.weight(1f), enabled = inventory?.writable == true)
        }
        state.status?.let {
            Spacer(Modifier.height(8.dp))
            Text(
                when (it) {
                    "cleaned" -> tr("Clean copy written to the file you chose. The original was only read.", "كُتبت النسخة النظيفة حيث اخترت. الأصلي قُرئ فقط.")
                    "destination-unwritable" -> tr("The destination refused the copy. The original is untouched.", "رفضت الوجهة النسخة. الأصل لم يُمس.")
                    "read-only-format" -> tr("This format can be inspected but not rewritten here.", "يمكن فحص هذه الصيغة لكن لا إعادة كتابتها هنا.")
                    "unsupported" -> tr("This format is not supported for metadata work.", "هذه الصيغة غير مدعومة لأعمال البيانات الوصفية.")
                    "unreadable" -> tr("The file could not be read as an image.", "تعذرت قراءة الملف كصورة.")
                    "nothing-to-clean" -> tr("Nothing is selected, or the format cannot be rewritten.", "لم يُختر شيء، أو أن الصيغة غير قابلة لإعادة الكتابة.")
                    "clean-failed" -> tr("Cleaning failed. No output was produced.", "فشلت العملية. لم يُنتج أي مخرج.")
                    else -> it
                },
                style = MaterialTheme.typography.labelSmall,
                color = if (state.failed) KnouxColors.Alert else KnouxColors.Violet,
            )
        }
        Spacer(Modifier.height(12.dp))
        Surface(
            Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.medium,
            color = androidx.compose.ui.graphics.Color(0x26FFB86B),
            border = androidx.compose.foundation.BorderStroke(1.dp, KnouxColors.Warn),
        ) {
            Text(
                tr(
                    "Not claimed: XMP blocks, ICC profiles, embedded thumbnails, GPS inside video, and document metadata in PDF or Office files are not inspected or removed. A clean copy is a new file; the original is never modified.",
                    "غير مدّعى: كتل XMP وملفات ICC والمصغرات المضمّنة وGPS داخل الفيديو وبيانات المستندات في PDF أو أوفيس لا تفحص ولا تُزال. النسخة النظيفة ملف جديد، ولا يُعدَّل الأصلي أبدًا.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Warn,
                modifier = Modifier.padding(12.dp),
            )
        }
        Spacer(Modifier.height(24.dp))
    }
}
