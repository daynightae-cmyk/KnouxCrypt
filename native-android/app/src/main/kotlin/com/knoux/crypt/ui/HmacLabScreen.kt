package com.knoux.crypt.ui

import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.KnouxTextField
import com.knoux.crypt.HmacJobGate
import com.knoux.crypt.HmacStreamer
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.security.Hashing
import com.knoux.crypt.tr
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private enum class HmacMode { TEXT, FILE }

/**
 * HMAC-SHA-256 generation/verification for text and streamed files. The key is
 * entered locally, never persisted or logged. A matching tag proves knowledge of
 * the key and message integrity, not a signer identity or source authenticity.
 */
@Composable
fun HmacLabScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    val tagPattern = remember { Regex("^[0-9a-f]{64}$") }
    var mode by remember { mutableStateOf(HmacMode.TEXT) }
    var key by remember { mutableStateOf("") }
    var showKey by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    var fileName by remember { mutableStateOf<String?>(null) }
    var fileSize by remember { mutableStateOf<Long?>(null) }
    var fileUri by remember { mutableStateOf<android.net.Uri?>(null) }
    var tagHex by remember { mutableStateOf<String?>(null) }
    var tagBytes by remember { mutableStateOf<ByteArray?>(null) }
    var expected by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var progress by remember { mutableFloatStateOf(0f) }
    var error by remember { mutableStateOf<String?>(null) }
    var copied by remember { mutableStateOf(false) }
    var job by remember { mutableStateOf<Job?>(null) }
    val jobGate = remember { HmacJobGate() }
    val keyRequired = tr("Enter a secret key first.", "أدخل مفتاحًا سريًا أولاً.")
    val fileRequired = tr("Choose a file first.", "اختر ملفًا أولاً.")
    val messageTooLarge = tr(
        "Text message is larger than 1 MiB. Use file mode for large inputs.",
        "الرسالة النصية أكبر من 1 ميبيبايت. استخدم وضع الملف للمدخلات الكبيرة.",
    )

    fun invalidateWork() {
        jobGate.invalidate()
        job?.cancel()
        job = null
        busy = false
        progress = 0f
        tagHex = null
        tagBytes = null
        copied = false
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        invalidateWork()
        var name: String? = null
        var size = -1L
        runCatching {
            context.contentResolver.query(
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
        fileUri = uri
        fileName = name ?: "selected file"
        fileSize = size.takeIf { it >= 0 }
        tagHex = null
        tagBytes = null
        expected = ""
        error = null
    }

    fun compute() {
        if (busy) return
        if (key.isEmpty()) {
            error = keyRequired
            return
        }
        if (mode == HmacMode.FILE && fileUri == null) {
            error = fileRequired
            return
        }
        if (mode == HmacMode.TEXT && message.toByteArray(Charsets.UTF_8).size > 1024 * 1024) {
            error = messageTooLarge
            return
        }
        error = null
        copied = false
        tagHex = null
        tagBytes = null
        progress = 0f
        busy = true
        job?.cancel()
        val requestId = jobGate.issue()
        val runMode = mode
        val runMessage = message
        val runUri = fileUri
        val runLength = fileSize ?: -1L
        val keyBytes = key.toByteArray(Charsets.UTF_8)
        job = scope.launch {
            val self = currentCoroutineContext()[Job]
            try {
                val result = if (runMode == HmacMode.TEXT) {
                    withContext(Dispatchers.Default) {
                        Hashing.hmacSha256(keyBytes, runMessage.toByteArray(Charsets.UTF_8))
                    }
                } else {
                    val uri = runUri ?: throw IllegalStateException("No file selected")
                    withContext(Dispatchers.IO) {
                        val input = context.contentResolver.openInputStream(uri)
                            ?: throw java.io.IOException("Cannot read the selected file")
                        input.use { stream ->
                            HmacStreamer.compute(keyBytes, stream, runLength) { processed ->
                                if (jobGate.isCurrent(requestId) && runLength > 0) {
                                    progress = (processed.toDouble() / runLength).toFloat().coerceIn(0f, 1f)
                                }
                            }
                        }
                    }
                }
                self?.ensureActive()
                if (!jobGate.isCurrent(requestId)) return@launch
                tagBytes = result
                tagHex = Hashing.toHex(result)
                progress = 1f
            } catch (_: CancellationException) {
                if (jobGate.isCurrent(requestId)) {
                    tagHex = null
                    tagBytes = null
                    progress = 0f
                }
            } catch (failure: Exception) {
                if (self?.isActive == false) return@launch
                if (!jobGate.isCurrent(requestId)) return@launch
                error = failure.message ?: "HMAC computation failed; no tag was retained."
                tagHex = null
                tagBytes = null
            } finally {
                keyBytes.fill(0)
                if (jobGate.isCurrent(requestId)) {
                    busy = false
                    job = null
                }
            }
        }
    }

    fun cancel() {
        invalidateWork()
    }

    val normalizedExpected = expected.trim().lowercase(Locale.ROOT)
    val expectedValid = normalizedExpected.isEmpty() || tagPattern.matches(normalizedExpected)
    val expectedBytes = if (tagPattern.matches(normalizedExpected)) {
        runCatching { normalizedExpected.chunked(2).map { it.toInt(16).toByte() }.toByteArray() }.getOrNull()
    } else {
        null
    }
    val matches = tagBytes != null && expectedBytes != null &&
        Hashing.constantTimeEquals(tagBytes!!, expectedBytes)

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("HMAC Authenticity Lab", "مختبر أصالة HMAC"), onBack)
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "HMAC-SHA-256 proves knowledge of the key and the integrity of the message. It is not a digital signature, certificate identity, or proof of who created the message.",
                "يثبت HMAC-SHA-256 معرفة المفتاح وسلامة الرسالة. وهو ليس توقيعًا رقميًا أو هوية شهادة أو دليلاً على من أنشأ الرسالة.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
            ModeChip(tr("Text", "نص"), mode == HmacMode.TEXT, Modifier.weight(1f)) {
                invalidateWork()
                mode = HmacMode.TEXT
                expected = ""
                error = null
            }
            ModeChip(tr("File", "ملف"), mode == HmacMode.FILE, Modifier.weight(1f)) {
                invalidateWork()
                mode = HmacMode.FILE
                expected = ""
                error = null
            }
        }
        Spacer(Modifier.height(10.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Secret key · local only", "المفتاح السري · محلي فقط"))
            Spacer(Modifier.height(6.dp))
            KnouxTextField(
                value = key,
                onValueChange = { invalidateWork(); key = it; error = null },
                label = tr("HMAC key (UTF-8 bytes)", "مفتاح HMAC (بايتات UTF-8)"),
                visualTransformation = if (showKey) VisualTransformation.None else PasswordVisualTransformation(),
                trailingContent = {
                    TextButton(onClick = { showKey = !showKey }) {
                        Text(
                            if (showKey) tr("Hide", "إخفاء") else tr("Show", "إظهار"),
                            color = KnouxColors.Violet,
                            fontSize = 11.sp,
                        )
                    }
                },
            )
            Spacer(Modifier.height(4.dp))
            Text(
                tr(
                    "The key is held in screen memory, not saved or logged. The byte representation is UTF-8; there is no key-file import in this build.",
                    "المفتاح في ذاكرة الشاشة، ولا يُحفظ أو يُسجل. تمثيل البايتات UTF-8؛ لا يوجد استيراد لملف مفتاح في هذا البناء.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
            TextButton(onClick = {
                invalidateWork()
                key = ""
                showKey = false
                expected = ""
            }) {
                Text(tr("Clear key and results", "مسح المفتاح والنتائج"), color = KnouxColors.Muted)
            }
        }
        Spacer(Modifier.height(10.dp))
        if (mode == HmacMode.TEXT) {
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Message", "الرسالة"))
                Spacer(Modifier.height(6.dp))
                KnouxTextField(
                    value = message,
                    onValueChange = { invalidateWork(); message = it; error = null },
                    label = tr("Message (empty is allowed)", "الرسالة (الفراغ مسموح)"),
                    singleLine = false,
                    minLines = 4,
                )
            }
        } else {
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("File", "الملف"))
                Spacer(Modifier.height(6.dp))
                Text(
                    fileName ?: tr("No file selected", "لم يتم اختيار ملف"),
                    style = MaterialTheme.typography.bodyMedium,
                )
                fileSize?.let { Text("$it bytes", style = MaterialTheme.typography.labelSmall) }
                Spacer(Modifier.height(8.dp))
                KnouxGhostButton(
                    tr("Choose file", "اختيار ملف"),
                    { picker.launch(arrayOf("*/*")) },
                    enabled = !busy,
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        KnouxPrimaryButton(
            if (busy) tr("Computing…", "جارٍ الحساب…") else tr("Compute HMAC-SHA-256", "حساب HMAC-SHA-256"),
            ::compute,
            enabled = !busy,
        )
        if (busy) {
            Spacer(Modifier.height(8.dp))
            LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(6.dp))
            KnouxGhostButton(tr("Cancel computation", "إلغاء الحساب"), ::cancel)
        }
        error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
        }
        tagHex?.let { tag ->
            Spacer(Modifier.height(10.dp))
            GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Success.copy(alpha = 0.4f)) {
                SectionLabel(tr("HMAC-SHA-256 tag", "وسم HMAC-SHA-256"))
                Spacer(Modifier.height(6.dp))
                Text(tag, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Text)
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = {
                    clipboard.setText(AnnotatedString(tag))
                    copied = true
                }) {
                    Text(
                        if (copied) tr("Copied", "تم النسخ") else tr("Copy tag", "نسخ الوسم"),
                        color = KnouxColors.Violet,
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Verify a tag", "التحقق من وسم"))
                Spacer(Modifier.height(6.dp))
                KnouxTextField(
                    value = expected,
                    onValueChange = { expected = it },
                    label = tr("Expected tag (64 hex chars)", "الوسم المتوقع (64 حرفًا)"),
                    singleLine = true,
                )
                if (!expectedValid) {
                    Text(
                        tr("Expected tag must be exactly 64 hex characters.", "يجب أن يكون الوسم 64 حرفًا سداسيًا بالضبط."),
                        color = KnouxColors.Alert,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                } else if (expectedBytes != null) {
                    Text(
                        if (matches) {
                            tr("MATCH: the tag is valid for this key and message.", "تطابق: الوسم صالح لهذا المفتاح والرسالة.")
                        } else {
                            tr("MISMATCH: wrong key, message or tag.", "اختلاف: مفتاح أو رسالة أو وسم خاطئ.")
                        },
                        color = if (matches) KnouxColors.Success else KnouxColors.Alert,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                    Text(
                        tr(
                            "Constant-time comparison is used. A match does not identify the sender or make the message safe.",
                            "تُستخدم مقارنة بزمن ثابت. التطابق لا يحدد المرسل ولا يجعل الرسالة آمنة.",
                        ),
                        color = KnouxColors.Warn,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(
            tr(
                "Tags are copyable because they are not secret; the key is never copied or persisted by this screen. Sharing a tag does not share the key.",
                "يمكن نسخ الوسوم لأنها ليست سرية؛ لا ينسخ هذا المختبر المفتاح أو يحفظه. مشاركة الوسم لا تعني مشاركة المفتاح.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(24.dp))
    }
}

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
            .padding(vertical = 10.dp),
    )
}
