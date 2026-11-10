package com.knoux.crypt.ui

import android.content.Context
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.knoux.crypt.AppContainer
import com.knoux.crypt.autofill.AutofillStatus
import com.knoux.crypt.data.SecretKinds
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun AutofillScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
    onOpenPasswords: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val unlocked by container.session.unlocked.collectAsStateWithLifecycle()

    var supported by remember { mutableStateOf(AutofillStatus.isSupported(context)) }
    var selected by remember { mutableStateOf(AutofillStatus.isSelected(context)) }
    var recordCount by remember { mutableStateOf<Int?>(null) }
    var message by remember { mutableStateOf<String?>(null) }

    val unavailableMessage = tr(
        "Android autofill settings are unavailable on this device.",
        "إعدادات الملء التلقائي في أندرويد غير متاحة على هذا الجهاز.",
    )

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                supported = AutofillStatus.isSupported(context)
                selected = AutofillStatus.isSelected(context)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(unlocked) {
        val access = container.session.currentAccess()
        recordCount = if (access == null) null else withContext(Dispatchers.IO) {
            runCatching { container.secrets.list(access, SecretKinds.PASSWORD).size }.getOrNull()
        }
    }

    val statusText = when {
        !supported -> tr("Not supported on this device", "غير مدعوم على هذا الجهاز")
        selected -> tr("Selected as the autofill service", "محددة كخدمة الملء التلقائي")
        else -> tr("Not selected in Android settings", "غير محددة في إعدادات أندرويد")
    }
    val statusTone = when {
        !supported -> KnouxColors.Alert
        selected -> KnouxColors.Success
        else -> KnouxColors.Warn
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = ScreenHorizontalPadding),
    ) {
        BackHeader(tr("Autofill", "الملء التلقائي"), onBack)
        Spacer(Modifier.height(8.dp))
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            StatusPill(text = statusText, tone = statusTone)
        }
        Spacer(Modifier.height(12.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Android autofill service", "خدمة أندرويد للملء التلقائي"))
            Spacer(Modifier.height(6.dp))
            InfoRow(tr("Service", "الخدمة"), "KNOUX Crypt Autofill")
            InfoRow(
                tr("System setting", "إعداد النظام"),
                if (selected) tr("Enabled", "مفعّلة") else tr("Disabled", "معطّلة"),
            )
            InfoRow(
                tr("Vault session", "جلسة الخزنة"),
                if (unlocked) tr("Unlocked — suggestions available", "مفتوحة — الاقتراحات متاحة")
                else tr("Locked — no suggestions", "مقفلة — لا اقتراحات"),
            )
            InfoRow(
                tr("Saved credentials", "بيانات الاعتماد المحفوظة"),
                recordCount?.toString() ?: tr("Locked", "مقفلة"),
            )
            InfoRow(
                tr("Fill sources", "مصادر الملء"),
                tr("Web domains and android:// package URLs", "نطاقات الويب وروابط حزم android://"),
            )
            InfoRow(
                tr("Auto-save", "الحفظ التلقائي"),
                tr("Never — onSaveRequest stores nothing", "أبدًا — onSaveRequest لا يخزن أي شيء"),
            )
            InfoRow(
                tr("Network", "الشبكة"),
                tr("No INTERNET permission", "لا يوجد إذن إنترنت"),
            )
            Spacer(Modifier.height(10.dp))
            KnouxPrimaryButton(
                text = tr("Open autofill settings", "فتح إعدادات الملء التلقائي"),
                onClick = {
                    val intent = AutofillStatus.settingsIntent(context)
                    val opened = runCatching { context.startActivity(intent) }.isSuccess
                    if (!opened) {
                        message = unavailableMessage
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            )
            if (!unlocked) {
                Spacer(Modifier.height(8.dp))
                KnouxGhostButton(
                    text = tr("Unlock vault to offer suggestions", "افتح الخزنة لتقديم الاقتراحات"),
                    onClick = onNeedUnlock,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Spacer(Modifier.height(8.dp))
            KnouxGhostButton(
                text = tr("Open Password Manager", "فتح مدير كلمات المرور"),
                onClick = onOpenPasswords,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        Spacer(Modifier.height(10.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("How it works", "كيف يعمل"))
            Spacer(Modifier.height(6.dp))
            Text(
                tr(
                    "KNOUX Crypt registers a real Android AutofillService. When a form is focused, Android asks this app for suggestions. Credentials are decrypted only while the vault session is unlocked; a locked or freshly started process offers nothing.",
                    "يسجّل KNOUX Crypt خدمة AutofillService حقيقية في أندرويد. عندما يُركز نموذج، يطلب أندرويد من هذا التطبيق الاقتراحات. تُفكّك بيانات الاعتماد فقط أثناء فتح جلسة الخزنة؛ عملية مقفلة أو مُشغَّلة حديثًا لا تقدم أي شيء.",
                ),
                style = MaterialTheme.typography.bodySmall,
                color = KnouxColors.Text,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                tr(
                    "Web forms match the saved URL host. A leading www. is ignored; subdomains are not. Native apps match only credentials whose URL is android://<package>, so a package name cannot silently claim a website credential.",
                    "نماذج الويب تطابق مضيف URL المحفوظ. يُتجاهل www. في البداية؛ النطاقات الفرعية لا تُطابَق. التطبيقات الأصلية تطابق فقط بيانات الاعتماد التي URL الخاص بها android://<package>، لذا لا يمكن لاسم حزمة أن يدّعي بيانات اعتماد موقع بخفاء.",
                ),
                style = MaterialTheme.typography.bodySmall,
                color = KnouxColors.Text,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                tr(
                    "The system supplies the field structure and web domain; this app does not inspect other apps. No credential is captured or saved from the form, and the service has no network access.",
                    "يُوفّر النظام بنية الحقول ونطاق الويب؛ هذا التطبيق لا يفحص تطبيقات أخرى. لا تُلتقط أو تُحفظ أي بيانات اعتماد من النموذج، والخدمة لا تملك وصولاً إلى الشبكة.",
                ),
                style = MaterialTheme.typography.bodySmall,
                color = KnouxColors.Text,
            )
        }

        Spacer(Modifier.height(10.dp))
        GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Warn.copy(alpha = 0.4f)) {
            SectionLabel(tr("Runtime status", "حالة التشغيل"))
            Spacer(Modifier.height(6.dp))
            Text(
                tr(
                    "Compiled and unit-tested on the development machine, but not run on a physical device or emulator. Enable the service in Android settings, then open a supported form while the vault is unlocked to test suggestions.",
                    "مُجمَّع ومختبَر وحدويًا على جهاز التطوير، لكنه لم يُشغَّل على جهاز فعلي أو محاكي. فعّل الخدمة في إعدادات أندرويد، ثم افتح نموذجًا مدعومًا أثناء فتح الخزنة لاختبار الاقتراحات.",
                ),
                style = MaterialTheme.typography.bodySmall,
                color = KnouxColors.Warn,
            )
        }

        message?.let { msg ->
            Spacer(Modifier.height(10.dp))
            Text(msg, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Alert)
        }

        Spacer(Modifier.height(16.dp))
    }
}
