package com.knoux.crypt.ui

import android.app.Application
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.AdvisorCheckId
import com.knoux.crypt.data.AdvisorFinding
import com.knoux.crypt.data.AdvisorReport
import com.knoux.crypt.data.AdvisorStatus
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Where a finding can actually be acted on. System targets are real intents. */
private enum class AdvisorAction { SYSTEM_SECURITY, SYSTEM_PATCH, SYSTEM_APP_PERMISSIONS, PRIVACY, RECOVERY, ROTATION, TIMELINE, NONE }

private fun actionFor(check: AdvisorCheckId): AdvisorAction = when (check) {
    AdvisorCheckId.DEVICE_LOCK_SCREEN -> AdvisorAction.SYSTEM_SECURITY
    AdvisorCheckId.ANDROID_PATCH_LEVEL -> AdvisorAction.SYSTEM_PATCH
    AdvisorCheckId.APP_PERMISSIONS -> AdvisorAction.SYSTEM_APP_PERMISSIONS
    AdvisorCheckId.ENCRYPTED_RECOVERY -> AdvisorAction.RECOVERY
    AdvisorCheckId.VAULT_AUTO_LOCK,
    AdvisorCheckId.SCREENSHOT_BLOCK,
    AdvisorCheckId.APP_SWITCH_MASK,
    AdvisorCheckId.CLIPBOARD_CLEAR,
    AdvisorCheckId.LOCK_ON_SCREEN_OFF,
    -> AdvisorAction.PRIVACY
    AdvisorCheckId.KEY_VERSION -> AdvisorAction.ROTATION
    AdvisorCheckId.UNREADABLE_RECORDS,
    AdvisorCheckId.RECENT_ALERTS,
    -> AdvisorAction.TIMELINE
    AdvisorCheckId.OFFLINE_BY_DESIGN -> AdvisorAction.NONE
}

@Composable
private fun titleFor(check: AdvisorCheckId): String = when (check) {
    AdvisorCheckId.DEVICE_LOCK_SCREEN -> tr("Protect device lock screen", "احمِ قفل شاشة الجهاز")
    AdvisorCheckId.ANDROID_PATCH_LEVEL -> tr("Review Android patch level", "راجع مستوى تصحيح أندرويد")
    AdvisorCheckId.APP_PERMISSIONS -> tr("Minimize application permissions", "قلّل صلاحيات التطبيق")
    AdvisorCheckId.ENCRYPTED_RECOVERY -> tr("Verify encrypted recovery", "تحقق من الاستعادة المشفر")
    AdvisorCheckId.VAULT_AUTO_LOCK -> tr("Vault auto-lock timeout", "مهلة قفل الخزنة")
    AdvisorCheckId.SCREENSHOT_BLOCK -> tr("Screenshot restriction", "تقييد لقطة الشاشة")
    AdvisorCheckId.APP_SWITCH_MASK -> tr("App-switch masking", "إخفاء المحتوى عند تبديل التطبيقات")
    AdvisorCheckId.CLIPBOARD_CLEAR -> tr("Clipboard clearing", "مسح الحافظة")
    AdvisorCheckId.LOCK_ON_SCREEN_OFF -> tr("Lock when the screen turns off", "القفل عند إطفاء الشاشة")
    AdvisorCheckId.KEY_VERSION -> tr("Vault key version", "إصدار مفتاح الخزنة")
    AdvisorCheckId.UNREADABLE_RECORDS -> tr("Undecryptable records", "سجلات غير قابلة للفك")
    AdvisorCheckId.RECENT_ALERTS -> tr("Recent security alerts", "تنبيهات أمنية حديثة")
    AdvisorCheckId.OFFLINE_BY_DESIGN -> tr("What this review does not do", "ما لا يفعله هذا الفحص")
}

@Composable
private fun subtitleFor(check: AdvisorCheckId): String = when (check) {
    AdvisorCheckId.DEVICE_LOCK_SCREEN ->
        tr("Use a strong screen lock (PIN, password or biometric).", "استخدم قفلًا قويًا (رمزًا أو كلمة مرور أو بيانات حيوية).")
    AdvisorCheckId.ANDROID_PATCH_LEVEL ->
        tr("Check if your device is up to date with the latest security patches.", "تحقق من تحديث جهازك بترقيعات الأمان الأخيرة.")
    AdvisorCheckId.APP_PERMISSIONS ->
        tr("Review app permissions and remove unnecessary access.", "راجع صلاحيات التطبيق وأزل الوصول غير الضروري.")
    AdvisorCheckId.ENCRYPTED_RECOVERY ->
        tr("Ensure recovery options are protected and not publicly accessible.", "تأكد أن خيارات الاستعادة محمية وليست متاحة للعامة.")
    AdvisorCheckId.VAULT_AUTO_LOCK ->
        tr("How long the vault stays open without activity.", "مدة بقاء الخزنة مفتوحة دون نشاط.")
    AdvisorCheckId.SCREENSHOT_BLOCK ->
        tr("Blocks screen capture while the app is visible.", "يمنع التقاط الشاشة أثناء ظهور التطبيق.")
    AdvisorCheckId.APP_SWITCH_MASK ->
        tr("Hides content in the recent-apps preview.", "يخفي المحتوى في معاينة التطبيقات الأخيرة.")
    AdvisorCheckId.CLIPBOARD_CLEAR ->
        tr("Clears copied secrets after a delay.", "يمسح المنسوخ السري بعد مدة.")
    AdvisorCheckId.LOCK_ON_SCREEN_OFF ->
        tr("Locks the vault when the display turns off.", "يقفل الخزنة عند إطفاء الشاشة.")
    AdvisorCheckId.KEY_VERSION ->
        tr("Records still sealed with the device root key.", "سجلات لا تزال محمية بمفتاح الجهاز الجذري.")
    AdvisorCheckId.UNREADABLE_RECORDS ->
        tr("Stored records whose ciphertext will not decrypt.", "سجلات محفوظة لا ينجح فك تشفيرها.")
    AdvisorCheckId.RECENT_ALERTS ->
        tr("Alerts from the local security timeline.", "تنبيهات من السجل الأمني المحلي.")
    AdvisorCheckId.OFFLINE_BY_DESIGN ->
        tr("No network call, no app scan, no intrusion claim.", "لا اتصال بالشبكة، لا فحص تطبيقات، لا ادعاء كشف تسلل.")
}

@Composable
private fun statusLabel(status: AdvisorStatus): String = when (status) {
    AdvisorStatus.NOT_CHECKED -> tr("Not checked", "لم يُفحص")
    AdvisorStatus.PASS -> tr("Protected", "محمي")
    AdvisorStatus.INFO -> tr("Reported", "مُبلَّغ")
    AdvisorStatus.ADVISORY -> tr("Consider tightening", "يُفضّل التشديد")
    AdvisorStatus.WARN -> tr("Needs attention", "يحتاج انتباهًا")
    AdvisorStatus.UNAVAILABLE -> tr("Cannot read", "لا يمكن القراءة")
}

private fun statusColor(status: AdvisorStatus): Color = when (status) {
    AdvisorStatus.PASS -> KnouxColors.Success
    AdvisorStatus.WARN -> KnouxColors.Alert
    AdvisorStatus.ADVISORY -> KnouxColors.Warn
    AdvisorStatus.UNAVAILABLE -> KnouxColors.Alert
    AdvisorStatus.NOT_CHECKED -> KnouxColors.Faint
    AdvisorStatus.INFO -> KnouxColors.Violet
}

class SecurityAdvisorViewModel(
    application: Application,
    private val container: AppContainer,
) : AndroidViewModel(application) {
    private val advisor = container.securityAdvisor

    private val _report = MutableStateFlow<AdvisorReport?>(null)
    val report: StateFlow<AdvisorReport?> = _report.asStateFlow()

    private val _running = MutableStateFlow(false)
    val running: StateFlow<Boolean> = _running.asStateFlow()

    private val _error = MutableStateFlow<BilingualText?>(null)
    val error: StateFlow<BilingualText?> = _error.asStateFlow()

    val unlocked: StateFlow<Boolean> = container.session.unlocked

    fun run() {
        if (_running.value) return
        _running.value = true
        _error.value = null
        viewModelScope.launch {
            val access = container.session.currentAccess()
            val outcome = runCatching { advisor.run(access) }
            _report.value = outcome.getOrNull()
            _error.value = outcome.exceptionOrNull()?.let {
                BilingualText(
                    "The review could not be completed: ${it.javaClass.simpleName}",
                    "تعذر إتمام الفحص: ${it.javaClass.simpleName}",
                )
            }
            _running.value = false
        }
    }

    fun dismiss(finding: AdvisorFinding) {
        viewModelScope.launch {
            advisor.dismiss(finding.check)
            _report.value = _report.value?.let { current ->
                current.copy(dismissed = current.dismissed + finding.check)
            }
        }
    }

    fun restoreAll() {
        viewModelScope.launch {
            _report.value?.dismissed?.toList()?.forEach { advisor.restore(it) }
            run()
        }
    }

    fun restore(check: AdvisorCheckId) {
        viewModelScope.launch {
            advisor.restore(check)
            _report.value = _report.value?.let { current ->
                current.copy(dismissed = current.dismissed - check)
            }
        }
    }
}

@Composable
fun SecurityAdvisorScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenRecovery: () -> Unit,
    onOpenRotation: () -> Unit,
    onOpenTimeline: () -> Unit,
) {
    val application = LocalContext.current.applicationContext as Application
    val viewModel: SecurityAdvisorViewModel = viewModel(
        factory = viewModelFactory { SecurityAdvisorViewModel(application, container) },
    )
    val report by viewModel.report.collectAsStateWithLifecycle()
    val running by viewModel.running.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val unlocked by viewModel.unlocked.collectAsStateWithLifecycle()

    val visible = report?.findings.orEmpty().filterNot { it.check in (report?.dismissed ?: emptySet()) }
    val hidden = report?.dismissed ?: emptySet()

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 18.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row {
                    Text("Knoux ", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Crypt",
                        style = MaterialTheme.typography.titleMedium,
                        color = KnouxColors.VioletSoft,
                    )
                }
                Text(
                    tr("PRIVATE ENCRYPTION SUITE", "حزمة التشفير الخاصة").uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    letterSpacing = 2.sp,
                    color = KnouxColors.Faint,
                )
            }
            RoundAction("⚙", tr("Open privacy center", "فتح مركز الخصوصية"), onOpenPrivacy)
        }
        Spacer(Modifier.height(8.dp))
        // Back lives on the title line, as in every other service screen here. The
        // reference's top row is the brand, so it is kept above rather than replaced.
        Row(verticalAlignment = Alignment.CenterVertically) {
            RoundAction("‹", tr("Back", "رجوع"), onBack)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    tr("Offline", "غير متصل"),
                    style = MaterialTheme.typography.headlineSmall,
                )
                Text(
                    tr("Security Advisor", "المستشار الأمني"),
                    style = MaterialTheme.typography.headlineSmall,
                    color = KnouxColors.VioletSoft,
                )
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(
            tr(
                "Check your device's local security settings and understand their protection limits.",
                "افحص إعدادات الأمان المحلية لجهازك وافهم حدود حمايتها.",
            ),
            style = MaterialTheme.typography.bodySmall,
            color = KnouxColors.Muted,
        )
        Spacer(Modifier.height(12.dp))

        error?.let {
            Text(tr(it.english, it.arabic), style = MaterialTheme.typography.bodySmall, color = KnouxColors.Alert)
            Spacer(Modifier.height(6.dp))
        }

        LazyColumn(
            Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item(key = "readiness") {
                ReadinessCard(report = report, running = running)
            }
            item(key = "checks-header") {
                ChecksHeader(visible.size, hidden.size, report?.dismissed?.isEmpty() ?: true, viewModel::restoreAll)
            }
            if (report == null && !running) {
                item(key = "idle") {
                    GlassCardTight(
                        tr(
                            "Nothing has been reviewed yet. Run the supported local checks to read the settings this app can actually see.",
                            "لم يُفحص شيء بعد. شغّل الفحوصات المحلية المدعومة لقراءة الإعدادات التي يمكن لهذا التطبيق رؤيتها فعلًا.",
                        ),
                    )
                }
            }
            if (running && report == null) {
                item(key = "loading") {
                    GlassCardTight(
                        tr("Reading local signals…", "يقرأ الإشارات المحلية…"),
                        busy = true,
                    )
                }
            }
            items(visible, key = { it.check.code }) { finding ->
                FindingRow(
                    finding = finding,
                    onOpen = { openFor(finding.check, application, onOpenPrivacy, onOpenRecovery, onOpenRotation, onOpenTimeline) },
                    onDismiss = { viewModel.dismiss(finding) },
                )
            }
            item(key = "disclaimer") {
                DisclaimerCard(
                    warnCount = report?.warningCount ?: 0,
                    advisoryCount = report?.advisoryCount ?: 0,
                    unavailableCount = report?.unavailableCount ?: 0,
                    passCount = report?.passCount ?: 0,
                    checked = report != null,
                )
            }
            item(key = "locked-note") {
                if (!unlocked) {
                    Text(
                        tr(
                            "The vault is locked, so the record and key-version rules report \"cannot read\" instead of guessing. Device, patch and setting rules still run.",
                            "الخزنة مقفلة، لذلك قواعد السجلات وإصدارات المفاتيح تُبلغ «لا يمكن القراءة» بدل التخمين. تبقى قواعد الجهاز والتصحيح والإعدادات تعمل.",
                        ),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Faint,
                    )
                }
            }
            item(key = "spacer") { Spacer(Modifier.height(10.dp)) }
        }

        KnouxPrimaryButton(
            text = if (running) {
                tr("Reading…", "يقرأ…")
            } else {
                tr("Run supported local checks", "شغّل الفحوصات المحلية المدعومة")
            },
            onClick = viewModel::run,
            enabled = !running,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "This review never contacts a server, never scans installed apps, and is not an intrusion-detection system.",
                "لا يتصل هذا الفحص بالخادم أبدًا، ولا يفحص التطبيقات المثبتة، وليس نظام كشف تسلل.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Faint,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(14.dp))
    }
}

@Composable
private fun RoundAction(symbol: String, description: String, onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(Color(0x99150B24))
            .border(1.dp, KnouxColors.Line, CircleShape)
            .clickable(onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Text(symbol, color = KnouxColors.Violet, fontSize = 18.sp)
    }
}

@Composable
private fun ReadinessCard(
    report: AdvisorReport?,
    running: Boolean,
) {
    val shape = RoundedCornerShape(20.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Brush.linearGradient(listOf(KnouxColors.CardTop, KnouxColors.CardBottom)))
            .border(1.dp, KnouxColors.Line, shape)
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // A native shield glyph stands in for the reference's glowing orb: the
            // brief forbids turning a mockup into a bitmap-based screen.
            GlyphTile("⛨", Modifier, KnouxColors.VioletSoft)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    tr("Local readiness review", "مراجعة الجاهزية المحلية"),
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    tr("Quick overview of key device protections.", "نظرة سريعة على أهم حمايات الجهاز."),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Tile(
                label = tr("Screen lock", "قفل الشاشة"),
                value = report?.readiness?.screenLock,
                modifier = Modifier.weight(1f),
            )
            Tile(
                label = tr("Patch state", "حالة التصحيح"),
                value = report?.readiness?.patchState,
                modifier = Modifier.weight(1f),
            )
            Tile(
                label = tr("Recovery", "الاستعادة"),
                value = report?.readiness?.recovery,
                modifier = Modifier.weight(1f),
            )
        }
        if (running && report == null) {
            Spacer(Modifier.height(8.dp))
            Text(
                tr("Reading…", "يقرأ…"),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Violet,
            )
        }
    }
}

@Composable
private fun Tile(
    label: String,
    value: AdvisorStatus?,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(14.dp)
    val tone = value?.let { statusColor(it) } ?: KnouxColors.Faint
    Column(
        modifier
            .clip(shape)
            .background(Color(0x66150B24))
            .border(1.dp, KnouxColors.Line, shape)
            .padding(horizontal = 8.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(30.dp)
                .clip(CircleShape)
                .background(KnouxColors.Sealed)
                .clearAndSetSemantics { },
            contentAlignment = Alignment.Center,
        ) {
            Text("◈", color = KnouxColors.Violet, fontSize = 13.sp)
        }
        Spacer(Modifier.height(6.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            if (value == null) "—" else "●",
            color = tone,
            fontSize = 12.sp,
            modifier = Modifier.clearAndSetSemantics { },
        )
        Spacer(Modifier.height(4.dp))
        Box(
            Modifier
                .clip(CircleShape)
                .background(Color(0x661B0D2B))
                .border(1.dp, tone.copy(alpha = 0.5f), CircleShape)
                .padding(horizontal = 7.dp, vertical = 3.dp),
        ) {
            Text(
                value?.let { statusLabel(it) } ?: tr("Pending", "قيد الانتظار"),
                fontSize = 8.sp,
                letterSpacing = 0.5.sp,
                color = tone,
                maxLines = 2,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun ChecksHeader(
    visibleCount: Int,
    hiddenCount: Int,
    nothingHidden: Boolean,
    onRestoreAll: () -> Unit,
) {
    val shape = RoundedCornerShape(20.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Brush.linearGradient(listOf(KnouxColors.CardTopAlt, KnouxColors.CardBottom)))
            .border(1.dp, KnouxColors.Violet.copy(alpha = 0.45f), shape)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GlyphTile("☑", Modifier)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(
                tr("Recommended checks", "الفحوصات الموصى بها"),
                style = MaterialTheme.typography.titleSmall,
            )
            Text(
                if (hiddenCount > 0) {
                    tr(
                        "$visibleCount shown, $hiddenCount dismissed.",
                        "يُعرض $visibleCount، وأُخفي $hiddenCount.",
                    )
                } else {
                    tr("Review important device security settings.", "راجع إعدادات أمان الجهاز المهمة.")
                },
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
        }
        if (!nothingHidden) {
            TextButton(onClick = onRestoreAll) {
                Text(tr("Show all", "عرض الكل"), color = KnouxColors.Violet)
            }
        }
    }
}

@Composable
private fun FindingRow(
    finding: AdvisorFinding,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(16.dp)
    val tone = statusColor(finding.status)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Color(0x66150B24))
            .border(1.dp, KnouxColors.Line, shape)
            .clickable(onClick = onOpen)
            .padding(horizontal = 12.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            GlyphTile(glyphFor(finding.check), Modifier, tone)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    titleFor(finding.check),
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    subtitleFor(finding.check),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
            }
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier
                    .clip(CircleShape)
                    .background(Color(0x661B0D2B))
                    .border(1.dp, tone.copy(alpha = 0.5f), CircleShape)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            ) {
                Text(
                    statusLabel(finding.status),
                    fontSize = 8.sp,
                    letterSpacing = 0.5.sp,
                    color = tone,
                    maxLines = 2,
                    textAlign = TextAlign.Center,
                )
            }
            if (actionFor(finding.check) != AdvisorAction.NONE) {
                Text("›", color = KnouxColors.Violet, fontSize = 18.sp, modifier = Modifier.padding(start = 6.dp))
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            finding.evidence.joinToString("  ·  "),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Muted,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                tr("Source: ${finding.source.code}", "المصدر: ${finding.source.code}"),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
                modifier = Modifier.weight(1f),
            )
            if (finding.check != AdvisorCheckId.OFFLINE_BY_DESIGN) {
                TextButton(onClick = { menu = true }) {
                    Text(tr("Dismiss", "إخفاء"), color = KnouxColors.Faint)
                }
            }
        }
    }
    if (menu) {
        AlertDialog(
            onDismissRequest = { menu = false },
            title = { Text(tr("Hide this check?", "إخفاء هذا الفحص؟")) },
            text = {
                Text(
                    tr(
                        "The finding stays in this review's data and its status is unchanged; it is only removed from the list. You can show all checks again.",
                        "يبقى الناتج ضمن بيانات هذا الفحص ولا تتغير حالته؛ يُزال من القائمة فقط. يمكنك عرض كل الفحوصات مجددًا.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    menu = false
                    onDismiss()
                }) {
                    Text(tr("Hide", "إخفاء"), color = KnouxColors.Warn)
                }
            },
            dismissButton = { TextButton(onClick = { menu = false }) { Text(tr("Cancel", "إلغاء")) } },
        )
    }
}

@Composable
private fun DisclaimerCard(
    warnCount: Int,
    advisoryCount: Int,
    unavailableCount: Int,
    passCount: Int,
    checked: Boolean,
) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Color(0x551B0D2B))
            .border(1.dp, KnouxColors.Line, shape)
            .padding(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text("!", color = KnouxColors.Warn, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.width(10.dp))
        Column {
            Text(
                tr(
                    "These checks are not an intrusion-detection system. No malware, spyware or harmful apps have been scanned. This tool only reviews local device settings that are accessible on your Android device.",
                    "هذه الفحوصات ليست نظام كشف تسلل. لم يتم فحص أي برمجيات خبيثة أو تجسس أو تطبيقات ضارة. تقتصر هذه الأداة على مراجعة إعدادات الجهاز المحلية المتاحة على جهاز أندرويد.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Muted,
            )
            if (checked) {
                Spacer(Modifier.height(4.dp))
                Text(
                    tr(
                        "$passCount protected · $advisoryCount to tighten · $warnCount need attention · $unavailableCount cannot be read",
                        "$passCount محمي · $advisoryCount تحتاج تشديدًا · $warnCount تحتاج انتباهًا · $unavailableCount لا يمكن قراءتها",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Violet,
                )
            }
        }
    }
}

@Composable
private fun GlassCardTight(message: String, busy: Boolean = false) {
    val shape = RoundedCornerShape(18.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Brush.linearGradient(listOf(KnouxColors.CardTop, KnouxColors.CardBottom)))
            .border(1.dp, KnouxColors.Line, shape)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (busy) {
            Text("◌", color = KnouxColors.Violet, fontSize = 16.sp)
            Spacer(Modifier.width(10.dp))
        }
        Text(message, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun GlyphTile(glyph: String, modifier: Modifier = Modifier, tint: Color = KnouxColors.Violet) {
    Box(
        modifier
            .size(38.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(KnouxColors.Sealed)
            .clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        Text(glyph, color = tint, fontSize = 15.sp)
    }
}

private fun glyphFor(check: AdvisorCheckId): String = when (check) {
    AdvisorCheckId.DEVICE_LOCK_SCREEN -> "🔒"
    AdvisorCheckId.ANDROID_PATCH_LEVEL -> "⚙"
    AdvisorCheckId.APP_PERMISSIONS -> "▦"
    AdvisorCheckId.ENCRYPTED_RECOVERY -> "↻"
    AdvisorCheckId.VAULT_AUTO_LOCK -> "◷"
    AdvisorCheckId.SCREENSHOT_BLOCK -> "⊘"
    AdvisorCheckId.APP_SWITCH_MASK -> "▤"
    AdvisorCheckId.CLIPBOARD_CLEAR -> "⧖"
    AdvisorCheckId.LOCK_ON_SCREEN_OFF -> "☾"
    AdvisorCheckId.KEY_VERSION -> "⚿"
    AdvisorCheckId.UNREADABLE_RECORDS -> "⚠"
    AdvisorCheckId.RECENT_ALERTS -> "!"
    AdvisorCheckId.OFFLINE_BY_DESIGN -> "⛨"
}

private fun openFor(
    check: AdvisorCheckId,
    application: Application,
    onOpenPrivacy: () -> Unit,
    onOpenRecovery: () -> Unit,
    onOpenRotation: () -> Unit,
    onOpenTimeline: () -> Unit,
) {
    fun launch(action: String, extras: Map<String, String> = emptyMap()): Boolean = runCatching {
        val intent = Intent(action).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            extras.forEach { (key, value) -> putExtra(key, value) }
        }
        application.startActivity(intent)
    }.isSuccess

    when (actionFor(check)) {
        AdvisorAction.PRIVACY -> onOpenPrivacy()
        AdvisorAction.RECOVERY -> onOpenRecovery()
        AdvisorAction.ROTATION -> onOpenRotation()
        AdvisorAction.TIMELINE -> onOpenTimeline()
        AdvisorAction.SYSTEM_SECURITY -> {
            if (!launch(Settings.ACTION_SECURITY_SETTINGS)) onOpenPrivacy()
        }
        AdvisorAction.SYSTEM_PATCH -> {
            if (!launch(Settings.ACTION_DEVICE_INFO_SETTINGS)) onOpenPrivacy()
        }
        AdvisorAction.SYSTEM_APP_PERMISSIONS -> {
            val opened = runCatching {
                application.startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.fromParts("package", application.packageName, null)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    },
                )
            }.isSuccess
            if (!opened) onOpenPrivacy()
        }
        AdvisorAction.NONE -> Unit
    }
}
