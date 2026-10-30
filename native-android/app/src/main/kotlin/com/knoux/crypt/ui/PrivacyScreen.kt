package com.knoux.crypt.ui

import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.knoux.crypt.AppContainer
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr

@Composable
fun PrivacyScreen(container: AppContainer, onBack: () -> Unit, onLock: () -> Unit) {
    val unlocked by container.session.unlocked.collectAsStateWithLifecycle()
    val keyLevel = remember(unlocked) { container.session.keySecurityLevel() }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Privacy Center", "مركز الخصوصية"), onBack)
        Spacer(Modifier.height(8.dp))
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            StatusPill(
                text = if (unlocked) tr("Session authorized", "الجلسة مصرّحة") else tr("Guest / locked", "زائر / مقفل"),
                tone = if (unlocked) KnouxColors.Success else KnouxColors.Warn,
            )
        }
        Spacer(Modifier.height(12.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("This device", "هذا الجهاز"))
            Spacer(Modifier.height(6.dp))
            InfoRow(tr("Session", "الجلسة"), if (unlocked) tr("Unlocked", "مفتوحة") else tr("Locked", "مقفلة"))
            InfoRow(tr("Data key protection", "حماية مفتاح البيانات"), keyLevel ?: tr("Not provisioned", "غير مهيأ"))
            InfoRow(tr("Unlock key", "مفتاح الفتح"), tr("Per-use biometric", "بصمة لكل استخدام"))
            InfoRow(tr("Screen capture", "لقطة الشاشة"), "FLAG_SECURE")
            InfoRow(tr("Network permission", "إذن الشبكة"), tr("Not requested", "غير مطلوب"))
            InfoRow(tr("Analytics / crash SDK", "تحليلات / SDK أعطال"), tr("None", "لا يوجد"))
            InfoRow(tr("Android backup", "نسخ أندرويد"), tr("Disabled", "معطّل"))
        }
        Spacer(Modifier.height(10.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Data at rest", "البيانات المخزنة"))
            Spacer(Modifier.height(6.dp))
            Text(
                tr(
                    "Vault rows are KNC1 envelopes in Room; file containers are KNF1; text envelopes are KNP1. AES-256-GCM authenticates every record, and the record identity is bound as AAD.",
                    "سجلات الخزنة عبارة عن حاويات KNC1 في Room؛ حاويات الملفات KNF1؛ مظاريف النص KNP1. يوثّق AES-256-GCM كل سجل، وترتبط هوية السجل كـ AAD.",
                ),
                style = MaterialTheme.typography.bodySmall,
            )
        }
        Spacer(Modifier.height(10.dp))
        GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Warn.copy(alpha = 0.4f)) {
            SectionLabel(tr("Known limits", "حدود معروفة"))
            Spacer(Modifier.height(6.dp))
            Text(
                tr(
                    "The data key is Keystore-protected but not auth-bound per use, so decryption relies on the in-app session capability. PBKDF2 is used for portable text; Argon2id, recovery export, secure clipboard, autofill and cross-device pairing are not implemented.",
                    "مفتاح البيانات محمي بـ Keystore لكنه غير مرتبط بمصادقة لكل استخدام، لذا يعتمد فك التشفير على صلاحية الجلسة داخل التطبيق. يُستخدم PBKDF2 للنص المحمول؛ Argon2id وتصدير الاستعادة والحافظة الآمنة والملء التلقائي والاقتران بين الأجهزة غير منفذة.",
                ),
                style = MaterialTheme.typography.bodySmall,
                color = KnouxColors.Text,
            )
        }
        Spacer(Modifier.height(10.dp))
        if (unlocked) {
            KnouxGhostButton(tr("Lock session now", "اقفل الجلسة الآن"), onLock)
        }
        Spacer(Modifier.height(10.dp))
        Text(
            tr(
                "Rooted or compromised devices can weaken platform guarantees. This screen reports implemented behavior, not an audit certificate.",
                "قد تُضعف الأجهزة المخترقة أو ذات الروت ضمانات المنصة. تعرض هذه الشاشة السلوك المنفذ، وليس شهادة تدقيق.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(24.dp))
    }
}
