package com.knoux.crypt.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.knoux.crypt.AppContainer
import com.knoux.crypt.ClipboardClearOutcome
import com.knoux.crypt.ClipboardExposure
import com.knoux.crypt.ClipboardLeasePolicy
import com.knoux.crypt.ClipboardLeaseState
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.delay

/**
 * Clipboard exposure guard. It shows metadata only, never the clipboard value.
 * Ownership is a same-process value match; after process death or external
 * replacement the value is foreign and is never cleared silently.
 */
@Composable
fun ClipboardGuardScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenSecureClipboard: () -> Unit,
) {
    val unlocked by container.session.unlocked.collectAsStateWithLifecycle()
    val formatter = remember { SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()) }
    val clearMessages = mapOf(
        ClipboardClearOutcome.CLEARED to tr("Clipboard cleared.", "تم مسح الحافظة."),
        ClipboardClearOutcome.NOTHING to tr("Clipboard is already empty.", "الحافظة فارغة بالفعل."),
        ClipboardClearOutcome.NOT_OWNED to tr(
            "The current clipboard is not the KNOUX-managed value; nothing was cleared.",
            "الحافظة الحالية ليست القيمة التي تديرها KNOUX؛ لم يُمسح شيء.",
        ),
        ClipboardClearOutcome.UNAVAILABLE to tr(
            "Clipboard access is unavailable right now.",
            "الوصول إلى الحافظة غير متاح الآن.",
        ),
    )
    var exposure by remember { mutableStateOf(container.clipboard.exposure()) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var message by remember { mutableStateOf<String?>(null) }
    var showExplicitClear by remember { mutableStateOf(false) }

    fun refresh() {
        exposure = container.clipboard.exposure()
        now = System.currentTimeMillis()
    }

    fun clearManaged() {
        message = clearMessages.getValue(container.clipboard.clearIfOwned())
        refresh()
    }

    fun clearExplicit() {
        message = clearMessages.getValue(container.clipboard.clearCurrentExplicit())
        refresh()
    }

    LaunchedEffect(unlocked) { refresh() }
    LaunchedEffect(exposure.state, exposure.expiresAtMillis, unlocked) {
        while (exposure.state == ClipboardLeaseState.MANAGED || exposure.state == ClipboardLeaseState.EXPIRED) {
            delay(1000L)
            now = System.currentTimeMillis()
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Clipboard Guard", "حارس الحافظة"), onBack)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            when (exposure.state) {
                ClipboardLeaseState.MANAGED -> StatusPill(tr("Managed", "مُدارة"), tone = KnouxColors.Success)
                ClipboardLeaseState.EXPIRED -> StatusPill(tr("Expired", "منتهية"), tone = KnouxColors.Warn)
                ClipboardLeaseState.FOREIGN -> StatusPill(tr("External text", "نص خارجي"), tone = KnouxColors.Warn)
                ClipboardLeaseState.EMPTY -> StatusPill(tr("Empty", "فارغة"), tone = KnouxColors.Muted)
                ClipboardLeaseState.UNAVAILABLE -> StatusPill(tr("Restricted", "مقيّدة"), tone = KnouxColors.Alert)
            }
            Spacer(Modifier.width(6.dp))
            Text(
                if (unlocked) tr("Vault unlocked", "الخزنة مفتوحة") else tr("Guest / locked", "زائر / مقفل"),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Muted,
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "This screen inspects clipboard metadata only; it never displays the copied content. Other apps and the OS may read the clipboard.",
                "تفحص هذه الشاشة بيانات الحافظة الوصفية فقط؛ ولا تعرض المحتوى المنسوخ أبدًا. قد تقرأ تطبيقات أخرى والنظام محتوى الحافظة.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(12.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Exposure", "التعرض"))
            Spacer(Modifier.height(6.dp))
            when (exposure.state) {
                ClipboardLeaseState.MANAGED, ClipboardLeaseState.EXPIRED -> {
                    InfoRow(tr("Ownership", "الملكية"), tr("This process · exact value match", "هذه العملية · تطابق قيمة تام"))
                    InfoRow(tr("Label", "التسمية"), exposure.label ?: "—")
                    InfoRow(tr("Characters", "الأحرف"), exposure.charCount?.toString() ?: "—")
                    exposure.copiedAtMillis?.let {
                        InfoRow(tr("Copied at", "وُنسخ في"), formatter.format(Date(it)))
                    }
                    exposure.expiresAtMillis?.let { expiry ->
                        val remaining = ((expiry - now) / 1000L).coerceAtLeast(0L)
                        InfoRow(
                            tr("Expiry", "الانتهاء"),
                            if (remaining > 0) tr("${remaining}s remaining", "متبقٍ ${remaining} ثانية")
                            else tr("Expired — clear now", "منتهية — امسح الآن"),
                        )
                    }
                    if (exposure.expiresAtMillis == null) {
                        InfoRow(tr("Timeout", "المهلة"), tr("Off", "متوقفة"))
                    }
                }
                ClipboardLeaseState.FOREIGN -> Text(
                    tr(
                        "Clipboard contains text set by another app or a previous process. KNOUX cannot prove ownership, so it will not clear it silently. Use the explicit clear action if you want it removed.",
                        "تحتوي الحافظة على نص من تطبيق آخر أو عملية سابقة. لا تستطيع KNOUX إثبات الملكية، لذلك لن تمسحه بصمت. استخدم إجراء المسح الصريح إذا أردت إزالته.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                )
                ClipboardLeaseState.EMPTY -> Text(
                    tr("Clipboard has no text.", "لا تحتوي الحافظة على نص."),
                    style = MaterialTheme.typography.bodySmall,
                )
                ClipboardLeaseState.UNAVAILABLE -> Text(
                    tr(
                        "Clipboard access is restricted or unavailable. Android may limit clipboard reads to the foreground; this is a platform policy, not a KNOUX bug.",
                        "الوصول إلى الحافظة مقيّد أو غير متاح. قد يحدّ أندرويد من قراءة الحافظة إلى التطبيق في المقدمة؛ هذه سياسة منصة وليست خطأ KNOUX.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = KnouxColors.Warn,
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        message?.let {
            Text(it, color = KnouxColors.Success, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }
        KnouxGhostButton(tr("Refresh exposure", "تحديث التعرض"), ::refresh)
        Spacer(Modifier.height(8.dp))
        KnouxGhostButton(
            tr("Clear KNOUX-managed value", "مسح القيمة التي تديرها KNOUX"),
            ::clearManaged,
            enabled = exposure.owned,
        )
        Spacer(Modifier.height(8.dp))
        KnouxGhostButton(
            tr("Clear current clipboard (explicit)", "مسح الحافظة الحالية (صريح)"),
            { showExplicitClear = true },
            enabled = ClipboardLeasePolicy.canExplicitClear(exposure.state),
        )
        Spacer(Modifier.height(6.dp))
        Text(
            tr(
                "Managed copies come from Passwords, Key Forge and Key Derivation. This guard never copies content itself.",
                "تأتي النسخ المُدارة من كلمات المرور ومصنع المفاتيح واشتقاق المفاتيح. لا ينسخ هذا الحارس أي محتوى بنفسه.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Faint,
        )
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = onOpenSecureClipboard) {
                Text(tr("Copy under lease", "النسخ ضمن عقد"), color = KnouxColors.Violet)
            }
            TextButton(onClick = onOpenPrivacy) {
                Text(tr("Clipboard policy", "سياسة الحافظة"), color = KnouxColors.Violet)
            }
        }
        Spacer(Modifier.height(10.dp))
        GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Warn.copy(alpha = 0.4f)) {
            SectionLabel(tr("Limits", "الحدود"))
            Text(
                tr(
                    "Auto-clear and lock-clear are best effort: only a same-process exact match is cleared. Android may retain clipboard data after process death, other apps may read it, and vendor clipboard managers can behave differently. There is no guaranteed global erasure.",
                    "المسح التلقائي والمسح عند القفل بأفضل جهد: تُمسح فقط القيمة المطابقة في نفس العملية. قد يحتفظ أندرويد ببيانات الحافظة بعد إنهاء العملية، وقد تقرأها تطبيقات أخرى، وقد تختلف مديرو الحافظة حسب الشركة. لا يوجد ضمان محو شامل.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
        }
        Spacer(Modifier.height(24.dp))
    }

    if (showExplicitClear) {
        AlertDialog(
            onDismissRequest = { showExplicitClear = false },
            title = { Text(tr("Clear current clipboard?", "مسح الحافظة الحالية؟")) },
            text = {
                Text(
                    tr(
                        "This explicitly clears whatever text is currently in the clipboard, including text KNOUX does not own. The action cannot be undone.",
                        "يمسح هذا صراحةً أي نص موجود حاليًا في الحافظة، بما في ذلك نص لا تملكه KNOUX. لا يمكن التراجع عن الإجراء.",
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showExplicitClear = false
                    clearExplicit()
                }) { Text(tr("Clear anyway", "امسح على أي حال"), color = KnouxColors.Alert) }
            },
            dismissButton = {
                TextButton(onClick = { showExplicitClear = false }) { Text(tr("Cancel", "إلغاء")) }
            },
        )
    }
}
