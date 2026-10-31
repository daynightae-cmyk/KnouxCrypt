package com.knoux.crypt.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.getValue
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
import com.knoux.crypt.UiSound
import com.knoux.crypt.data.AppSettings
import com.knoux.crypt.data.SessionPrivacyPolicy
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr
import kotlinx.coroutines.launch

@Composable
fun PrivacyScreen(container: AppContainer, onBack: () -> Unit, onLock: () -> Unit) {
    val unlocked by container.session.unlocked.collectAsStateWithLifecycle()
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    val keyLevel = remember(unlocked) { container.session.keySecurityLevel() }
    val scope = rememberCoroutineScope()
    val clipboardOffLabel = tr("Off", "إيقاف")

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
            InfoRow(
                tr("Screen capture", "لقطة الشاشة"),
                if (settings.blockScreenshots) "FLAG_SECURE" else tr("Allowed by user", "مسموحة بواسطة المستخدم"),
            )
            InfoRow(tr("Network permission", "إذن الشبكة"), tr("Not requested", "غير مطلوب"))
            InfoRow(tr("Analytics / crash SDK", "تحليلات / SDK أعطال"), tr("None", "لا يوجد"))
            InfoRow(tr("Android backup", "نسخ أندرويد"), tr("Disabled", "معطّل"))
        }
        Spacer(Modifier.height(10.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Session privacy", "خصوصية الجلسة"))
            Spacer(Modifier.height(6.dp))
            Text(
                tr("Auto-lock after background", "القفل التلقائي بعد الخلفية"),
                style = MaterialTheme.typography.labelLarge,
                color = KnouxColors.Muted,
            )
            Spacer(Modifier.height(6.dp))
            ChoiceRow(
                options = SessionPrivacyPolicy.AUTO_LOCK_CHOICES_SECONDS,
                selected = settings.autoLockSeconds,
                format = { if (it >= 60) "${it / 60}m" else "${it}s" },
                onSelect = { seconds -> scope.launch { container.settings.setAutoLockSeconds(seconds) } },
            )
            Spacer(Modifier.height(10.dp))
            PrivacySwitch(
                title = tr("Lock when the screen turns off", "القفل عند إطفاء الشاشة"),
                description = tr(
                    "An ACTION_SCREEN_OFF broadcast revokes the session immediately.",
                    "يُلغي بث ACTION_SCREEN_OFF الجلسة فورًا.",
                ),
                checked = settings.lockOnScreenOff,
                onChange = { enabled -> scope.launch { container.settings.setLockOnScreenOff(enabled) } },
            )
            Spacer(Modifier.height(10.dp))
            Text(
                tr("Clipboard auto-clear", "المسح التلقائي للحافظة"),
                style = MaterialTheme.typography.labelLarge,
                color = KnouxColors.Muted,
            )
            Spacer(Modifier.height(6.dp))
            ChoiceRow(
                options = SessionPrivacyPolicy.CLIPBOARD_CHOICES_SECONDS,
                selected = settings.clipboardClearSeconds,
                format = { if (it == 0) clipboardOffLabel else "${it}s" },
                onSelect = { seconds -> scope.launch { container.settings.setClipboardClearSeconds(seconds) } },
            )
            Spacer(Modifier.height(6.dp))
            Text(
                tr(
                    "Only values copied through KNOUX sensitive-copy controls are cleared, and only if unchanged. The clipboard is also cleared on every vault lock. Android may retain data after process death.",
                    "تُمسح فقط القيم المنسوخة عبر أدوات النسخ الحساس في KNOUX، وفقط إن لم تتغير. تُمسح الحافظة أيضًا عند كل قفل للخزنة. قد يحتفظ أندرويد بالبيانات بعد إنهاء العملية.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
            Spacer(Modifier.height(10.dp))
            PrivacySwitch(
                title = tr("Block screenshots and recents capture", "حجب لقطات الشاشة وآخر التطبيقات"),
                description = tr(
                    "Uses FLAG_SECURE. Turning this off removes the platform guarantee and allows screenshots.",
                    "يستخدم FLAG_SECURE. إيقافه يزيل ضمان المنصة ويسمح بلقطات الشاشة.",
                ),
                checked = settings.blockScreenshots,
                onChange = { enabled -> scope.launch { container.settings.setBlockScreenshots(enabled) } },
            )
            Spacer(Modifier.height(10.dp))
            PrivacySwitch(
                title = tr("Cover content on app switch", "تغطية المحتوى عند تبديل التطبيقات"),
                description = tr(
                    "Best-effort Compose cover on pause. FLAG_SECURE remains the stronger guarantee.",
                    "تغطية Compose بأفضل جهد عند الإيقاف المؤقت. يبقى FLAG_SECURE الضمان الأقوى.",
                ),
                checked = settings.maskOnAppSwitch,
                onChange = { enabled -> scope.launch { container.settings.setMaskOnAppSwitch(enabled) } },
            )
            if (!settings.blockScreenshots) {
                Spacer(Modifier.height(6.dp))
                Text(
                    tr(
                        "Warning: with screenshots enabled, OS recents and screen capture can expose vault content.",
                        "تحذير: عند تمكين لقطات الشاشة، قد تعرض قائمة التطبيقات أو أدوات الالتقاط محتوى الخزنة.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = KnouxColors.Warn,
                )
            }
        }
        Spacer(Modifier.height(10.dp))

        AudioControlsCard(container, settings)
        Spacer(Modifier.height(10.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Data at rest", "البيانات المخزنة"))
            Spacer(Modifier.height(6.dp))
            Text(
                tr(
                    "Vault rows are KNC1 legacy or KNC2 version-authenticated envelopes in Room; device-key files are KNF2 (wrapped per-file DEK) with legacy KNF1 readable; passphrase files are KNF1/PBKDF2; text envelopes are KNP2/Argon2id with KNP1 readable. AES-256-GCM authenticates every record, and the record identity is bound as AAD.",
                    "سجلات الخزنة عبارة عن حاويات KNC1 قديمة أو KNC2 موثقة بالإصدار في Room؛ ملفات مفتاح الجهاز KNF2 (مفتاح بيانات ملفوف لكل ملف) مع بقاء KNF1 القديم مقروءًا؛ ملفات عبارة المرور KNF1/PBKDF2؛ مظاريف النص KNP2/Argon2id مع بقاء KNP1 مقروءًا. يوثّق AES-256-GCM كل سجل، وترتبط هوية السجل كـ AAD.",
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
                    "The data key is Keystore-protected but not auth-bound per use, so decryption relies on the in-app session capability. Versioned data-key rotation is implemented but the Keystore root is retained for KNF1 device-key files and external files are not migrated. Passphrase file containers still use KNF1/PBKDF2; new device-key files use KNF2. Lost-gate recovery, autofill and cross-device pairing are not implemented.",
                    "مفتاح البيانات محمي بـ Keystore لكنه غير مرتبط بمصادقة لكل استخدام، لذا يعتمد فك التشفير على صلاحية الجلسة داخل التطبيق. تدوير مفاتيح البيانات بالإصدارات منفذ لكن جذر Keystore محتفظ به لملفات KNF1 بمفتاح الجهاز ولا تُرحَّل الملفات الخارجية. ما زالت ملفات عبارة المرور KNF1/PBKDF2؛ تستخدم ملفات مفتاح الجهاز الجديدة KNF2. استعادة البوابة المفقودة والملء التلقائي والاقتران بين الأجهزة غير منفذة.",
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
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun ChoiceRow(
    options: List<Int>,
    selected: Int,
    format: (Int) -> String,
    onSelect: (Int) -> Unit,
) {
    Row(
        Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        options.forEach { option ->
            val active = option == selected
            Text(
                format(option),
                fontSize = 12.sp,
                color = if (active) KnouxColors.Text else KnouxColors.Muted,
                modifier = Modifier
                    .clip(RoundedCornerShape(9.dp))
                    .background(if (active) KnouxColors.VioletDeep.copy(alpha = 0.65f) else KnouxColors.Raised)
                    .clickable(role = Role.RadioButton) { onSelect(option) }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
    }
}

@Composable
private fun PrivacySwitch(
    title: String,
    description: String,
    checked: Boolean,
    onChange: (Boolean) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = KnouxColors.Text)
            Spacer(Modifier.height(2.dp))
            Text(description, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Faint)
        }
        Spacer(Modifier.width(10.dp))
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = KnouxColors.Text,
                checkedTrackColor = KnouxColors.VioletDeep,
                uncheckedThumbColor = KnouxColors.Muted,
                uncheckedTrackColor = KnouxColors.Raised,
            ),
        )
    }
}

@Composable
private fun AudioControlsCard(container: AppContainer, settings: com.knoux.crypt.data.AppSettings) {
    val scope = rememberCoroutineScope()
    var ambient by remember(settings.ambientVolume) { mutableFloatStateOf(settings.ambientVolume) }
    var interfaceVolume by remember(settings.uiVolume) { mutableFloatStateOf(settings.uiVolume) }
    GlassCard(Modifier.fillMaxWidth()) {
        SectionLabel(tr("Cinematic audio", "الصوت السينمائي"))
        Spacer(Modifier.height(4.dp))
        Text(
            tr(
                "Original locally synthesized ambience and interface sounds. Off until you enable it, so startup stays silent.",
                "أجواء وأصوات واجهة أصلية مركّبة محليًا. معطّلة حتى تفعّلها، لذلك يبقى بدء التشغيل صامتًا.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Faint,
        )
        Spacer(Modifier.height(6.dp))
        PrivacySwitch(
            title = tr("Master audio", "الصوت الرئيسي"),
            description = tr(
                "Starts the ambient bed and allows interface sounds while the app is visible.",
                "يشغّل الخلفية الصوتية ويسمح بأصوات الواجهة أثناء ظهور التطبيق.",
            ),
            checked = settings.audioEnabled,
            onChange = { enabled -> scope.launch { container.settings.setAudioEnabled(enabled) } },
        )
        Spacer(Modifier.height(6.dp))
        Text(
            tr("Ambient volume: %d%%", "مستوى الخلفية: %d%%").format((ambient * 100).toInt()),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Muted,
        )
        Slider(
            value = ambient,
            onValueChange = { ambient = it },
            onValueChangeFinished = { scope.launch { container.settings.setAmbientVolume(ambient) } },
            enabled = settings.audioEnabled,
            colors = SliderDefaults.colors(thumbColor = KnouxColors.Violet, activeTrackColor = KnouxColors.VioletDeep),
        )
        PrivacySwitch(
            title = tr("Interface sounds", "أصوات الواجهة"),
            description = tr(
                "Short confirmations after successful actions only; nothing plays for cancelled or failed operations.",
                "تأكيدات قصيرة بعد الإجراءات الناجحة فقط؛ لا شيء يُشغّل عند الإلغاء أو الفشل.",
            ),
            checked = settings.uiSoundsEnabled,
            onChange = { enabled -> scope.launch { container.settings.setUiSoundsEnabled(enabled) } },
        )
        Spacer(Modifier.height(4.dp))
        Text(
            tr("Interface volume: %d%%", "مستوى الواجهة: %d%%").format((interfaceVolume * 100).toInt()),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Muted,
        )
        Slider(
            value = interfaceVolume,
            onValueChange = { interfaceVolume = it },
            onValueChangeFinished = { scope.launch { container.settings.setUiVolume(interfaceVolume) } },
            enabled = settings.audioEnabled && settings.uiSoundsEnabled,
            colors = SliderDefaults.colors(thumbColor = KnouxColors.Violet, activeTrackColor = KnouxColors.VioletDeep),
        )
        KnouxGhostButton(
            tr("Preview confirmation sound", "معاينة صوت التأكيد"),
            { container.audio.play(UiSound.CONFIRM) },
            enabled = settings.audioEnabled,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            tr(
                "The preview is a sound check only; it does not unlock, decrypt or confirm any operation.",
                "المعاينة فحص للصوت فقط؛ لا تفتح الخزنة ولا تفك تشفيرًا ولا تؤكد أي عملية.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Faint,
        )
    }
}
