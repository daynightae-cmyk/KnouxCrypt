package com.knoux.crypt.ui

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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.knoux.crypt.AppContainer
import com.knoux.crypt.ClipboardExposure
import com.knoux.crypt.ClipboardLeaseState
import com.knoux.crypt.data.AppSettings
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * TASK 44 action screen: stages a value in screen memory, copies it under the
 * existing managed-lease policy, then clears the staged field. It never claims
 * guaranteed clipboard erasure and never displays clipboard content.
 */
@Composable
fun SecureClipboardScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onOpenGuard: () -> Unit,
    onOpenPrivacy: () -> Unit,
) {
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    val scope = rememberCoroutineScope()
    var value by remember { mutableStateOf("") }
    var showValue by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var exposure by remember { mutableStateOf(container.clipboard.exposure()) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }

    fun refresh() {
        exposure = container.clipboard.exposure()
        now = System.currentTimeMillis()
    }

    val copiedMessage = tr(
        "Value copied under a managed lease. The staged field was cleared; use Clipboard Guard for exposure status.",
        "تم نسخ القيمة ضمن عقد إدارة. تم مسح الحقل المؤقت؛ استخدم حارس الحافظة لحالة التعرض.",
    )
    val copyFailed = tr(
        "Copy failed; no managed lease was created.",
        "فشل النسخ؛ لم يُنشأ عقد إدارة.",
    )
    val emptyValue = tr("Enter a value first.", "أدخل قيمة أولاً.")

    fun copy() {
        if (busy) return
        if (value.isEmpty()) {
            error = emptyValue
            return
        }
        busy = true
        error = null
        message = null
        val staged = value
        scope.launch {
            try {
                container.clipboard.copySensitive(staged, "KNOUX secure clipboard")
                if (value == staged) {
                    value = ""
                    showValue = false
                }
                message = copiedMessage
            } catch (_: Exception) {
                error = copyFailed
            } finally {
                busy = false
                refresh()
            }
        }
    }

    LaunchedEffect(exposure.state, exposure.expiresAtMillis) {
        while (exposure.state == ClipboardLeaseState.MANAGED || exposure.state == ClipboardLeaseState.EXPIRED) {
            delay(1000L)
            now = System.currentTimeMillis()
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Secure Clipboard", "حافظة آمنة"), onBack)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            when (exposure.state) {
                ClipboardLeaseState.MANAGED -> StatusPill(tr("Managed", "مُدارة"), tone = KnouxColors.Success)
                ClipboardLeaseState.EXPIRED -> StatusPill(tr("Expired", "منتهية"), tone = KnouxColors.Warn)
                ClipboardLeaseState.FOREIGN -> StatusPill(tr("External", "خارجية"), tone = KnouxColors.Warn)
                ClipboardLeaseState.EMPTY -> StatusPill(tr("Empty", "فارغة"), tone = KnouxColors.Muted)
                ClipboardLeaseState.UNAVAILABLE -> StatusPill(tr("Restricted", "مقيّدة"), tone = KnouxColors.Alert)
            }
            Spacer(Modifier.width(6.dp))
            Text(
                tr("Managed-copy action", "إجراء نسخ مُدار"),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Muted,
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "Copy a value under the existing clipboard lease. This is not guaranteed erasure: other apps and the OS may read the clipboard, and the value may survive process death.",
                "انسخ قيمة ضمن عقد الحافظة الحالي. هذا ليس محوًا مضمونًا: قد تقرأ تطبيقات أخرى والنظام الحافظة، وقد تبقى القيمة بعد إنهاء العملية.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(10.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Value · held in screen memory", "القيمة · في ذاكرة الشاشة"))
            Spacer(Modifier.height(6.dp))
            KnouxTextField(
                value = value,
                onValueChange = { value = it; error = null; message = null },
                label = tr("Value to copy (not stored)", "القيمة للنسخ (غير مخزنة)"),
                singleLine = true,
                visualTransformation = if (showValue) VisualTransformation.None else PasswordVisualTransformation(),
                trailingContent = {
                    TextButton(onClick = { showValue = !showValue }) {
                        Text(
                            if (showValue) tr("Hide", "إخفاء") else tr("Show", "إظهار"),
                            color = KnouxColors.Violet,
                            fontSize = 11.sp,
                        )
                    }
                },
            )
            Spacer(Modifier.height(4.dp))
            Text(
                tr(
                    "The value is cleared from the field after a successful copy. It is never persisted or logged.",
                    "تُمسح القيمة من الحقل بعد النسخ الناجح. لا تُحفظ أو تُسجل أبدًا.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
        }
        Spacer(Modifier.height(10.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Lease policy", "سياسة العقد"))
            InfoRow(
                tr("Timeout", "المهلة"),
                if (settings.clipboardClearSeconds == 0) tr("Off", "متوقفة") else "${settings.clipboardClearSeconds}s",
            )
            InfoRow(tr("Clear on lock", "المسح عند القفل"), tr("Yes · managed value only", "نعم · القيمة المُدارة فقط"))
            InfoRow(tr("Ownership", "الملكية"), tr("Exact same-process value match", "تطابق تام داخل العملية نفسها"))
            InfoRow(tr("OS guarantee", "ضمان النظام"), tr("None", "لا يوجد"))
        }
        Spacer(Modifier.height(12.dp))
        KnouxPrimaryButton(
            if (busy) tr("Copying…", "جارٍ النسخ…") else tr("Copy under managed lease", "انسخ ضمن عقد إدارة"),
            ::copy,
            enabled = !busy && value.isNotEmpty(),
        )
        error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
        }
        message?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = KnouxColors.Success, style = MaterialTheme.typography.bodySmall)
        }
        if (exposure.state == ClipboardLeaseState.MANAGED || exposure.state == ClipboardLeaseState.EXPIRED) {
            Spacer(Modifier.height(10.dp))
            GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Violet.copy(alpha = 0.4f)) {
                SectionLabel(tr("Active managed lease", "عقد إدارة نشط"))
                Spacer(Modifier.height(6.dp))
                Text(
                    tr(
                        "${exposure.label ?: "KNOUX"} · ${exposure.charCount ?: 0} chars",
                        "${exposure.label ?: "KNOUX"} · ${exposure.charCount ?: 0} حرفًا",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                )
                exposure.expiresAtMillis?.let { expiry ->
                    val remaining = ((expiry - now) / 1000L).coerceAtLeast(0L)
                    Text(
                        if (remaining > 0) tr("${remaining}s remaining", "متبقٍ ${remaining} ثانية")
                        else tr("Expired — open Clipboard Guard to clear", "منتهية — افتح حارس الحافظة للمسح"),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (remaining > 0) KnouxColors.Muted else KnouxColors.Warn,
                    )
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Row {
            TextButton(onClick = onOpenGuard) {
                Text(tr("Open Clipboard Guard", "فتح حارس الحافظة"), color = KnouxColors.Violet)
            }
            TextButton(onClick = onOpenPrivacy) {
                Text(tr("Clipboard settings", "إعدادات الحافظة"), color = KnouxColors.Violet)
            }
        }
        Spacer(Modifier.height(10.dp))
        KnouxGhostButton(
            tr("Clear staged value", "مسح القيمة المؤقتة"),
            { value = ""; showValue = false; message = null; error = null },
            enabled = value.isNotEmpty() && !busy,
        )
        Spacer(Modifier.height(24.dp))
    }
}
