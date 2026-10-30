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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun HashIntegrityScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    var fileName by remember { mutableStateOf<String?>(null) }
    var size by remember { mutableStateOf<Long?>(null) }
    var hash by remember { mutableStateOf<String?>(null) }
    var expected by remember { mutableStateOf("") }
    var progress by remember { mutableFloatStateOf(0f) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var copied by remember { mutableStateOf(false) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        busy = true
        error = null
        hash = null
        progress = 0f
        scope.launch {
            try {
                val resolver = context.contentResolver
                var name: String? = null
                var length = -1L
                runCatching {
                    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
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
                        }
                    } ?: throw java.io.IOException("Cannot read the file")
                }
                hash = Hashing.toHex(digest)
                progress = 1f
            } catch (failure: Exception) {
                error = failure.message ?: "Hashing failed."
            } finally {
                busy = false
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Hash & Integrity", "التجزئة والسلامة"), onBack)
        Spacer(Modifier.height(8.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("SHA-256", "SHA-256"))
            Spacer(Modifier.height(6.dp))
            Text(
                fileName ?: tr("No file selected", "لم يتم اختيار ملف"),
                style = MaterialTheme.typography.bodyMedium,
            )
            size?.let { Text("$it bytes", style = MaterialTheme.typography.labelSmall) }
            Spacer(Modifier.height(10.dp))
            KnouxGhostButton(tr("Choose file to hash", "اختيار ملف للتجزئة"), { picker.launch(arrayOf("*/*")) }, enabled = !busy)
            if (busy) {
                Spacer(Modifier.height(8.dp))
                LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
            }
        }
        Spacer(Modifier.height(10.dp))
        error?.let {
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }
        hash?.let { digest ->
            GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Success.copy(alpha = 0.4f)) {
                SectionLabel(tr("Digest", "البصمة"))
                Spacer(Modifier.height(6.dp))
                Text(digest, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Text)
                Spacer(Modifier.height(8.dp))
                Row {
                    TextButton(onClick = {
                        clipboard.setText(AnnotatedString(digest))
                        copied = true
                    }) { Text(if (copied) tr("Copied", "تم النسخ") else tr("Copy digest", "نسخ البصمة"), color = KnouxColors.Violet) }
                }
            }
            Spacer(Modifier.height(10.dp))
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Compare", "مقارنة"))
                Spacer(Modifier.height(6.dp))
                KnouxTextField(
                    value = expected,
                    onValueChange = { expected = it },
                    label = tr("Expected SHA-256", "بصمة SHA-256 المتوقعة"),
                    singleLine = true,
                )
                if (expected.isNotBlank()) {
                    val match = expected.trim().equals(digest, ignoreCase = true)
                    Text(
                        if (match) tr("Match: the digest is identical.", "تطابق: البصمة متطابقة.")
                        else tr("Mismatch: the digest differs.", "اختلاف: البصمة مختلفة."),
                        color = if (match) KnouxColors.Success else KnouxColors.Alert,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(
            tr(
                "Hashing proves integrity, not confidentiality. This screen reads the selected document through SAF and performs no encryption.",
                "التجزئة تثبت السلامة وليس السرية. تقرأ هذه الشاشة المستند المحدد عبر SAF ولا تنفذ تشفيرًا.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(24.dp))
    }
}
