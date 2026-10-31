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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.security.Hashing
import com.knoux.crypt.security.PackageInspector
import com.knoux.crypt.security.PackageReport
import com.knoux.crypt.security.PackageStructuralState
import com.knoux.crypt.tr
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Header-only inspector for KNF1/KNF2/KNP1/KNP2. It never derives a key or
 * decrypts, so a structurally valid header is not an authenticity claim.
 */
@Composable
fun PackageInspectorScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val inspector = remember { PackageInspector() }
    var fileName by remember { mutableStateOf<String?>(null) }
    var fileSize by remember { mutableStateOf<Long?>(null) }
    var report by remember { mutableStateOf<PackageReport?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var truncatedRead by remember { mutableStateOf(false) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        busy = true
        error = null
        report = null
        scope.launch {
            try {
                val resolver = context.contentResolver
                var name: String? = null
                var size = -1L
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
                            if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
                        }
                    }
                }
                fileName = name ?: "selected package"
                fileSize = size.takeIf { it >= 0 }
                val bytes = withContext(Dispatchers.IO) {
                    val buffer = ByteArray(PackageInspector.MAX_INSPECT_BYTES)
                    resolver.openInputStream(uri)?.use { input ->
                        var total = 0
                        var read: Int
                        while (total < buffer.size) {
                            read = input.read(buffer, total, buffer.size - total)
                            if (read < 0) break
                            total += read
                        }
                        buffer.copyOf(total)
                    } ?: throw java.io.IOException("Cannot read the selected package")
                }
                truncatedRead = size < 0 || size > PackageInspector.MAX_INSPECT_BYTES
                report = withContext(Dispatchers.Default) { inspector.inspect(bytes) }
            } catch (failure: Exception) {
                error = failure.message ?: "Package inspection failed."
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
        BackHeader(tr("Package Inspector", "فاحص الحزم"), onBack)
        Spacer(Modifier.height(8.dp))
        Row {
            report?.let {
                StatusPill(
                    text = when (it.state) {
                        PackageStructuralState.VALID_HEADER -> tr("Header valid", "ترويسة صالحة")
                        PackageStructuralState.TRUNCATED -> tr("Truncated", "مقتطعة")
                        PackageStructuralState.MALFORMED -> tr("Malformed", "تالفة")
                        PackageStructuralState.UNSUPPORTED -> tr("Unsupported", "غير مدعومة")
                    },
                    tone = when (it.state) {
                        PackageStructuralState.VALID_HEADER -> KnouxColors.Success
                        PackageStructuralState.TRUNCATED, PackageStructuralState.MALFORMED -> KnouxColors.Alert
                        PackageStructuralState.UNSUPPORTED -> KnouxColors.Warn
                    },
                )
                Spacer(Modifier.height(0.dp))
            }
            StatusPill(tr("No key used", "دون مفتاح"), tone = KnouxColors.Warn)
        }
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "Reads bounded KNF1/KNF2/KNP1/KNP2 headers without deriving a key or decrypting. Structural validity is not authentication; AEAD tags are not verified here.",
                "تقرأ ترويسات KNF1/KNF2/KNP1/KNP2 المحدودة دون اشتقاق مفتاح أو فك تشفير. صلاحية البنية ليست مصادقة؛ لا يتم التحقق من وسوم AEAD هنا.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(10.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Package", "الحزمة"))
            Spacer(Modifier.height(6.dp))
            Text(
                fileName ?: tr("No package selected", "لم يتم اختيار حزمة"),
                style = MaterialTheme.typography.bodyMedium,
            )
            fileSize?.let { Text("$it bytes", style = MaterialTheme.typography.labelSmall) }
            Spacer(Modifier.height(8.dp))
            KnouxGhostButton(
                tr("Choose package to inspect", "اختيار حزمة للفحص"),
                { picker.launch(arrayOf("*/*")) },
                enabled = !busy,
            )
            if (truncatedRead) {
                Text(
                    tr(
                        "Only the first ${PackageInspector.MAX_INSPECT_BYTES} bytes were inspected.",
                        "تم فحص أول ${PackageInspector.MAX_INSPECT_BYTES} بايت فقط.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        error?.let {
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }
        report?.let { r ->
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Header metadata", "بيانات الترويسة"))
                Spacer(Modifier.height(6.dp))
                InfoRow(tr("Format", "الصيغة"), r.format.name)
                r.version?.let { InfoRow(tr("Version", "الإصدار"), it.toString()) }
                r.keySource?.let { InfoRow(tr("Key source", "مصدر المفتاح"), it) }
                r.kdf?.let { InfoRow(tr("KDF", "اشتقاق المفتاح"), it) }
                r.memoryKib?.let { InfoRow(tr("Memory", "الذاكرة"), "$it KiB") }
                r.iterations?.let { InfoRow(tr("Iterations", "التكرارات"), it.toString()) }
                r.parallelism?.let { InfoRow(tr("Parallelism", "التوازي"), it.toString()) }
                r.wrappedKeyBytes?.let { InfoRow(tr("Wrapped file key", "مفتاح ملف ملفوف"), "$it bytes") }
                r.chunkSize?.let { InfoRow(tr("Chunk size", "حجم القطعة"), "$it bytes") }
                r.plaintextLength?.let { InfoRow(tr("Declared plaintext", "النص المعلن"), "$it bytes") }
                r.headerBytes?.let { InfoRow(tr("Header bytes", "بايتات الترويسة"), it.toString()) }
                r.payloadBytes?.let { InfoRow(tr("Payload bytes read", "بايتات الحمولة المقروءة"), it.toString()) }
                r.salt?.let { InfoRow(tr("Salt", "الملح"), Hashing.toHex(it)) }
                r.nonce?.let { InfoRow(tr("Nonce", "الـnonce"), Hashing.toHex(it)) }
                Text(
                    tr(
                        "Authenticated: no. A key/passphrase is required to authenticate the payload.",
                        "مصادق عليها: لا. يلزم مفتاح/عبارة مرور لمصادقة الحمولة.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = KnouxColors.Warn,
                    modifier = Modifier.padding(top = 6.dp),
                )
                r.notes.forEach { note ->
                    Text(note, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Faint)
                }
            }
            Spacer(Modifier.height(10.dp))
        }
        Text(
            tr(
                "This tool cannot prove a package is safe, trusted or compatible with a future version. It does not decrypt or repair ciphertext.",
                "لا تستطيع هذه الأداة إثبات أن الحزمة آمنة أو موثوقة أو متوافقة مع إصدار مستقبلي. لا تفك التشفير ولا تصلح النص المشفر.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(24.dp))
    }
}
