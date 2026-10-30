package com.knoux.crypt.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.knoux.crypt.AppContainer
import com.knoux.crypt.BuildConfig
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxTab
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.tr
import kotlinx.coroutines.launch

@Composable
fun AccountScreen(
    container: AppContainer,
    onTab: (KnouxTab) -> Unit,
    onPrivacy: () -> Unit,
    onResetUnlock: () -> Unit,
    onLock: () -> Unit,
) {
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = com.knoux.crypt.data.AppSettings())
    val unlocked by container.session.unlocked.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var showReset by remember { mutableStateOf(false) }
    var configured by remember { mutableStateOf<Boolean?>(null) }
    val keyLevel = remember(unlocked) { container.session.keySecurityLevel() }

    LaunchedEffect(unlocked) {
        configured = runCatching { container.unlockManager.isConfigured() }.getOrDefault(false)
    }

    TabScreen(selected = KnouxTab.ACCOUNT, onTab = onTab) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = ScreenHorizontalPadding)
                .padding(bottom = 100.dp),
        ) {
            Spacer(Modifier.height(8.dp))
            Text(tr("Account", "الحساب"), style = MaterialTheme.typography.headlineMedium)
            Text(tr("Local security and preferences", "الأمان المحلي والتفضيلات"), style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(14.dp))

            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Session", "الجلسة"))
                Spacer(Modifier.height(6.dp))
                InfoRow(
                    tr("Mode", "الوضع"),
                    if (unlocked) tr("Unlocked", "مفتوحة") else tr("Guest / locked", "زائر / مقفل"),
                )
                InfoRow(tr("Data key", "مفتاح البيانات"), keyLevel ?: tr("Not provisioned", "غير مهيأ"))
                InfoRow(tr("Key storage", "تخزين المفاتيح"), "Android Keystore")
                InfoRow(tr("Screen capture", "لقطة الشاشة"), "FLAG_SECURE")
                InfoRow(tr("Network capability", "قدرة الشبكة"), tr("None requested", "لا توجد"))
                if (unlocked) {
                    Spacer(Modifier.height(8.dp))
                    KnouxGhostButton(tr("Lock now", "اقفل الآن"), onLock)
                }
            }
            Spacer(Modifier.height(10.dp))

            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Language", "اللغة"))
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    LanguageChoice("English", settings.language == "en", Modifier.weight(1f)) {
                        scope.launch { container.settings.setLanguage("en") }
                    }
                    LanguageChoice("العربية", settings.language == "ar", Modifier.weight(1f)) {
                        scope.launch { container.settings.setLanguage("ar") }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))

            GlassCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        SectionLabel(tr("Reduced motion", "تقليل الحركة"))
                        Spacer(Modifier.height(4.dp))
                        Text(
                            tr(
                                "Stops the rain and ambient loops. Content remains complete.",
                                "يوقف المطر والخلفيات المتحركة. يبقى المحتوى كاملًا.",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Switch(
                        checked = settings.reducedMotion,
                        onCheckedChange = { enabled -> scope.launch { container.settings.setReducedMotion(enabled) } },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = KnouxColors.Text,
                            checkedTrackColor = KnouxColors.VioletDeep,
                            uncheckedThumbColor = KnouxColors.Muted,
                            uncheckedTrackColor = KnouxColors.Raised,
                        ),
                    )
                }
            }
            Spacer(Modifier.height(10.dp))

            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Secure unlock", "الفتح الآمن"))
                Spacer(Modifier.height(6.dp))
                InfoRow(
                    tr("Gate", "البوابة"),
                    when {
                        configured == true -> tr("Configured", "معدّة")
                        configured == false -> tr("Not configured", "غير معدّة")
                        else -> tr("Checking…", "جارٍ الفحص…")
                    },
                )
                InfoRow(tr("Biometric strength", "قوة البصمة"), tr("Strong only", "القوية فقط"))
                InfoRow(tr("Data key binding", "ارتباط مفتاح البيانات"), tr("Session gate · not per-use", "بوابة جلسة · ليست لكل استخدام"))
                if (unlocked) {
                    Spacer(Modifier.height(6.dp))
                    TextButton(onClick = { showReset = true }) {
                        Text(tr("Reset secure unlock gate", "إعادة إعداد بوابة الفتح"), color = KnouxColors.Warn, fontSize = 12.sp)
                    }
                }
            }
            Spacer(Modifier.height(10.dp))

            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Build", "البناء"))
                Spacer(Modifier.height(6.dp))
                InfoRow(tr("Version", "الإصدار"), BuildConfig.VERSION_NAME)
                InfoRow(tr("Stack", "التقنيات"), "Kotlin · Compose · Material 3")
                InfoRow(tr("Verification", "التحقق"), tr("Device tests pending", "اختبارات الجهاز معلقة"))
            }
            Spacer(Modifier.height(12.dp))
            KnouxGhostButton(tr("Open Privacy Center", "فتح مركز الخصوصية"), onPrivacy)
            Spacer(Modifier.height(12.dp))
            Text(
                tr(
                    "PR #15 visuals are an accepted implementation baseline, not pixel-perfect or security-certified. Keystore, biometrics and file flows require independent device evidence.",
                    "بصريات PR #15 هي خط أساس تنفيذي مقبول، وليست مطابقة كاملة أو شهادة أمنية. تحتاج مسارات Keystore والبصمة والملفات أدلة مستقلة على الجهاز.",
                ),
                style = MaterialTheme.typography.labelSmall,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
            )
        }
    }

    if (showReset) {
        AlertDialog(
            onDismissRequest = { showReset = false },
            title = { Text(tr("Reset secure unlock gate?", "إعادة إعداد بوابة الفتح؟")) },
            text = {
                Text(
                    tr(
                        "Deletes only the unlock key and token. Encrypted vault records are kept. You will re-enroll biometric authorization.",
                        "يحذف مفتاح الفتح ورمزه فقط. تبقى سجلات الخزنة المشفرة. ستعيد تسجيل تفويض البصمة.",
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showReset = false
                    onResetUnlock()
                }) { Text(tr("Reset", "إعادة"), color = KnouxColors.Alert) }
            },
            dismissButton = {
                TextButton(onClick = { showReset = false }) { Text(tr("Cancel", "إلغاء")) }
            },
        )
    }
}

@Composable
private fun LanguageChoice(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Text(
        label,
        textAlign = TextAlign.Center,
        style = MaterialTheme.typography.labelLarge.copy(fontSize = 12.sp),
        color = if (selected) KnouxColors.Text else KnouxColors.Muted,
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) KnouxColors.VioletDeep.copy(alpha = 0.55f) else KnouxColors.Raised)
            .clickable(role = Role.RadioButton, onClick = onClick)
            .padding(vertical = 10.dp),
    )
}
