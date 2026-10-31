package com.knoux.crypt.ui

import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxTextField
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.security.Hashing
import com.knoux.crypt.tr
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class VerificationReport(
    val fileName: String,
    val size: Long?,
    val digest: String,
    val expected: String,
    val match: Boolean,
    val recordedAt: Long,
)

/**
 * Streaming file integrity inspector. A match means the selected file equals the
 * user-provided reference digest; it does not authenticate where either came from.
 * History is in-memory for this screen only and is never persisted.
 */
@Composable
fun HashIntegrityScreen(onBack: () -> Unit, isFileIntegrityRoute: Boolean = false) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    val digestPattern = remember { Regex("^[0-9a-f]{64}$") }
    val formatter = remember { SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()) }
    var fileName by remember { mutableStateOf<String?>(null) }
    var size by remember { mutableStateOf<Long?>(null) }
    var hash by remember { mutableStateOf<String?>(null) }
    var expected by remember { mutableStateOf("") }
    var progress by remember { mutableFloatStateOf(0f) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var cancelled by remember { mutableStateOf(false) }
    var copied by remember { mutableStateOf(false) }
    var hashJob by remember { mutableStateOf<Job?>(null) }
    val history = remember { mutableStateListOf<VerificationReport>() }

    fun cancelHash() {
        hashJob?.cancel()
        hashJob = null
        busy = false
        progress = 0f
        hash = null
        cancelled = true
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        hashJob?.cancel()
        busy = true
        error = null
        cancelled = false
        hash = null
        progress = 0f
        copied = false
        expected = ""
        hashJob = scope.launch {
            try {
                val resolver = context.contentResolver
                var name: String? = null
                var length = -1L
                runCatching {
                    resolver.query(
                        uri,
                        arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
                        null,
                        null,
                        null,
                    )?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                            if (nameIndex >= 0) name = cursor.getString(nameIndex)
                            if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) length = cursor.getLong(sizeIndex)
                        }
                    }
                }
                fileName = name ?: "selected file"
                size = length.takeIf { it >= 0 }
                val digest = withContext(Dispatchers.IO) {
                    resolver.openInputStream(uri)?.use { input ->
                        Hashing.sha256(input, length) { processed ->
                            if (length > 0) progress = (processed.toDouble() / length).toFloat().coerceIn(0f, 1f)
                            if (length < 0) progress = 0f
                        }
                    } ?: throw java.io.IOException("Cannot read the file")
                }
                hash = Hashing.toHex(digest)
                progress = 1f
            } catch (_: CancellationException) {
                hash = null
                progress = 0f
                cancelled = true
            } catch (failure: Exception) {
                error = failure.message ?: "Hashing failed; no digest was retained."
                hash = null
            } finally {
                busy = false
                hashJob = null
            }
        }
    }

    val normalizedExpected = expected.trim().lowercase(Locale.ROOT)
    val expectedSyntaxValid = normalizedExpected.isEmpty() || digestPattern.matches(normalizedExpected)
    val hasComparison = hash != null && digestPattern.matches(normalizedExpected)
    val matches = hasComparison && normalizedExpected == hash

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(
            if (isFileIntegrityRoute) tr("File Integrity", "سلامة الملف")
            else tr("Hash & Integrity", "التجزئة والسلامة"),
            onBack,
        )
        Spacer(Modifier.height(8.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("SHA-256 · streaming", "SHA-256 · تدفق"))
            Spacer(Modifier.height(6.dp))
            Text(
                fileName ?: tr("No file selected", "لم يتم اختيار ملف"),
                style = MaterialTheme.typography.bodyMedium,
            )
            size?.let { Text("$it bytes", style = MaterialTheme.typography.labelSmall) }
            Spacer(Modifier.height(10.dp))
            KnouxGhostButton(
                tr("Choose file to hash", "اختيار ملف للتجزئة"),
                { picker.launch(arrayOf("*/*")) },
                enabled = !busy,
            )
            if (busy) {
                Spacer(Modifier.height(8.dp))
                LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(6.dp))
                KnouxGhostButton(
                    tr("Cancel hashing", "إلغاء التجزئة"),
                    ::cancelHash,
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        error?.let {
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }
        if (cancelled) {
            Text(
                tr("Hashing cancelled; no digest was retained.", "أُلغيت التجزئة؛ لم تُحتفظ أي بصمة."),
                color = KnouxColors.Warn,
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.height(8.dp))
        }
        hash?.let { digest ->
            GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Success.copy(alpha = 0.4f)) {
                SectionLabel(tr("Digest", "البصمة"))
                Spacer(Modifier.height(6.dp))
                Text(digest, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Text)
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = {
                    clipboard.setText(AnnotatedString(digest))
                    copied = true
                }) {
                    Text(
                        if (copied) tr("Copied", "تم النسخ") else tr("Copy digest", "نسخ البصمة"),
                        color = KnouxColors.Violet,
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Compare with a trusted reference", "قارن بمرجع موثوق"))
                Spacer(Modifier.height(6.dp))
                KnouxTextField(
                    value = expected,
                    onValueChange = { expected = it },
                    label = tr("Expected SHA-256 (64 hex chars)", "بصمة SHA-256 المتوقعة (64 حرفًا)"),
                    singleLine = true,
                )
                if (!expectedSyntaxValid) {
                    Text(
                        tr("Expected value must be exactly 64 hex characters.", "يجب أن تكون القيمة 64 حرفًا سداسيًا بالضبط."),
                        color = KnouxColors.Alert,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                } else if (hasComparison) {
                    Text(
                        if (matches) {
                            tr("MATCH: the file digest equals the reference.", "تطابق: بصمة الملف تساوي المرجع.")
                        } else {
                            tr("MISMATCH: the file digest differs from the reference.", "اختلاف: بصمة الملف تخالف المرجع.")
                        },
                        color = if (matches) KnouxColors.Success else KnouxColors.Alert,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                    Spacer(Modifier.height(8.dp))
                    KnouxGhostButton(
                        tr("Record verification evidence", "تسجيل دليل التحقق"),
                        {
                            if (history.size >= 5) history.removeAt(0)
                            history.add(
                                VerificationReport(
                                    fileName = fileName ?: "selected file",
                                    size = size,
                                    digest = digest,
                                    expected = normalizedExpected,
                                    match = matches,
                                    recordedAt = System.currentTimeMillis(),
                                ),
                            )
                        },
                    )
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        if (history.isNotEmpty()) {
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Verification evidence · memory only", "أدلة التحقق · في الذاكرة فقط"))
                Spacer(Modifier.height(6.dp))
                history.asReversed().forEach { report ->
                    val reportText = buildString {
                        appendLine("KNOUX file integrity report")
                        appendLine("File: ${report.fileName}")
                        report.size?.let { appendLine("Size: $it bytes") }
                        appendLine("SHA-256: ${report.digest}")
                        appendLine("Expected: ${report.expected}")
                        appendLine("Result: ${if (report.match) "MATCH" else "MISMATCH"}")
                        appendLine("Recorded: ${formatter.format(Date(report.recordedAt))}")
                    }
                    Text(
                        "${if (report.match) "MATCH" else "MISMATCH"} · ${report.fileName} · ${formatter.format(Date(report.recordedAt))}",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (report.match) KnouxColors.Success else KnouxColors.Alert,
                    )
                    TextButton(onClick = { clipboard.setText(AnnotatedString(reportText)) }) {
                        Text(tr("Copy report", "نسخ التقرير"), color = KnouxColors.Violet)
                    }
                    Spacer(Modifier.height(2.dp))
                }
                TextButton(onClick = { history.clear() }) {
                    Text(tr("Clear evidence list", "مسح قائمة الأدلة"), color = KnouxColors.Muted)
                }
            }
            Spacer(Modifier.height(10.dp))
        }
        Text(
            tr(
                "The hash is streamed through SAF and is never uploaded. A match proves equality to the reference you supplied, not the authenticity or safety of the file. Evidence history is not persisted. Very large files are supported by streaming but were not soak-tested here.",
                "تُحسب البصمة بتدفق عبر SAF ولا تُرفع. التطابق يثبت المساواة بالمرجع الذي أدخلته، وليس أصالة الملف أو سلامته. لا يُحفظ سجل الأدلة. الملفات الكبيرة مدعومة بالتدفق لكنها لم تُختبر هنا.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(24.dp))
    }
}
