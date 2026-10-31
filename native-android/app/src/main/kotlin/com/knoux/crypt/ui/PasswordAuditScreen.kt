package com.knoux.crypt.ui

import android.app.Application
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.AuditOutcome
import com.knoux.crypt.data.AuditProgress
import com.knoux.crypt.data.PasswordAuditFinding
import com.knoux.crypt.data.PasswordAuditReport
import com.knoux.crypt.data.VaultLockedException
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.DividerLine
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.security.PasswordStrength
import com.knoux.crypt.security.StrengthFlag
import com.knoux.crypt.security.StrengthLevel
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class AuditRunStatus { IDLE, RUNNING, COMPLETED, COMPLETED_WITH_GAPS, STOPPED_LOCKED, STOPPED_CANCELLED, FAILED }

data class PasswordAuditUiState(
    val status: AuditRunStatus = AuditRunStatus.IDLE,
    val progress: AuditProgress? = null,
    val report: PasswordAuditReport? = null,
    val detail: String? = null,
)

/**
 * Holds only derived audit data. Every decrypted label is dropped when the
 * session locks, and the service itself never returns a secret value.
 */
class PasswordAuditViewModel(
    application: Application,
    private val container: AppContainer,
) : AndroidViewModel(application) {
    private val _state = MutableStateFlow(PasswordAuditUiState())
    val state: StateFlow<PasswordAuditUiState> = _state.asStateFlow()
    private var job: Job? = null

    init {
        viewModelScope.launch {
            container.session.unlocked.collect { unlocked ->
                if (!unlocked) _state.value = PasswordAuditUiState(status = AuditRunStatus.STOPPED_LOCKED)
            }
        }
    }

    fun run() {
        if (_state.value.status == AuditRunStatus.RUNNING) return
        val access = container.session.currentAccess()
        if (access == null) {
            _state.value = PasswordAuditUiState(status = AuditRunStatus.STOPPED_LOCKED)
            return
        }
        _state.value = PasswordAuditUiState(status = AuditRunStatus.RUNNING, progress = AuditProgress(0, 0))
        job = viewModelScope.launch {
            try {
                val report = container.passwordAudit.audit(access) { progress ->
                    _state.value = _state.value.copy(progress = progress)
                }
                _state.value = PasswordAuditUiState(
                    status = if (report.outcome == AuditOutcome.COMPLETED) {
                        AuditRunStatus.COMPLETED
                    } else {
                        AuditRunStatus.COMPLETED_WITH_GAPS
                    },
                    report = report,
                )
            } catch (locked: VaultLockedException) {
                // A revoked session publishes nothing: no partial "safe" label.
                _state.value = PasswordAuditUiState(status = AuditRunStatus.STOPPED_LOCKED)
            } catch (cancellation: CancellationException) {
                _state.value = PasswordAuditUiState(status = AuditRunStatus.STOPPED_CANCELLED)
                throw cancellation
            } catch (failure: Exception) {
                _state.value = PasswordAuditUiState(
                    status = AuditRunStatus.FAILED,
                    detail = failure.message ?: "The audit could not complete.",
                )
            }
        }
    }

    fun cancel() {
        job?.cancel()
        if (_state.value.status == AuditRunStatus.RUNNING) {
            _state.value = PasswordAuditUiState(status = AuditRunStatus.STOPPED_CANCELLED)
        }
    }
}

@Composable
fun PasswordAuditScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
    onOpenPasswords: () -> Unit,
) {
    if (container.session.currentAccess() == null) {
        LockedScreen(tr("Password Audit", "تدقيق كلمات المرور"), onBack, onNeedUnlock)
        return
    }
    val application = LocalContext.current.applicationContext as Application
    val viewModel: PasswordAuditViewModel = viewModel(
        factory = viewModelFactory { PasswordAuditViewModel(application, container) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showStaleNote by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Password Audit", "تدقيق كلمات المرور"), onBack)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            when (state.status) {
                AuditRunStatus.IDLE -> StatusPill(tr("Not run", "لم يُنفَّذ"), tone = KnouxColors.Muted)
                AuditRunStatus.RUNNING -> StatusPill(tr("Scanning", "جارٍ الفحص"), tone = KnouxColors.Violet)
                AuditRunStatus.COMPLETED -> StatusPill(tr("Completed", "مكتمل"), tone = KnouxColors.Success)
                AuditRunStatus.COMPLETED_WITH_GAPS -> StatusPill(tr("Completed with gaps", "مكتمل مع فجوات"), tone = KnouxColors.Warn)
                AuditRunStatus.STOPPED_LOCKED -> StatusPill(tr("Stopped: locked", "متوقف: مقفل"), tone = KnouxColors.Alert)
                AuditRunStatus.STOPPED_CANCELLED -> StatusPill(tr("Cancelled", "ألغيت"), tone = KnouxColors.Warn)
                AuditRunStatus.FAILED -> StatusPill(tr("Failed", "فشل"), tone = KnouxColors.Alert)
            }
            Spacer(Modifier.width(6.dp))
            Text(
                tr("Offline · local vault only", "دون اتصال · الخزنة المحلية فقط"),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Muted,
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "The audit reads your stored password records through the live session, scores them with the offline model v${PasswordStrength.MODEL_VERSION}, and keeps the results in memory. Nothing is uploaded, and no password value or grouping digest is persisted.",
                "يقرأ التدقيق سجلات كلمات المرور المخزنة عبر الجلسة النشطة ويقيّمها بالنموذج دون الاتصال v${PasswordStrength.MODEL_VERSION} ويُبقي النتائج في الذاكرة. لا يُرفع أي شيء، ولا يُخزَّن أي قيمة كلمة مرور أو بصمة تجميع.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(12.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KnouxGhostButton(
                tr("Run audit", "تشغيل التدقيق"),
                { viewModel.run() },
                enabled = state.status != AuditRunStatus.RUNNING,
            )
            KnouxGhostButton(tr("Cancel", "إلغاء"), { viewModel.cancel() }, enabled = state.status == AuditRunStatus.RUNNING)
        }
        if (state.status == AuditRunStatus.RUNNING) {
            Spacer(Modifier.height(10.dp))
            val progress = state.progress
            val fraction = progress?.let { if (it.total <= 0) 0f else (it.scanned.toFloat() / it.total).coerceIn(0f, 1f) } ?: 0f
            LinearProgressIndicator(progress = { fraction }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(4.dp))
            Text(
                progress?.let { tr("Record ${it.scanned} of ${it.total}", "السجل ${it.scanned} من ${it.total}") }
                    ?: tr("Preparing", "جارٍ التحضير"),
                style = MaterialTheme.typography.labelSmall,
            )
        }
        Spacer(Modifier.height(10.dp))
        state.detail?.let {
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }
        when (state.status) {
            AuditRunStatus.STOPPED_LOCKED -> AuditNotice(
                tr(
                    "The vault locked while the audit was running. No report was published and no partial result is shown, so nothing here can be read as \"all clear\".",
                    "أُقفلت الخزنة أثناء التدقيق. لم تُنشر أي تقرير ولم تُعرض نتيجة جزئية، لذلك لا يمكن تفسير أي شيء هنا على أنه «كل شيء سليم».",
                ),
            )
            AuditRunStatus.STOPPED_CANCELLED -> AuditNotice(
                tr(
                    "The audit was cancelled before it finished. No report was published.",
                    "أُلغي التدقيق قبل اكتماله. لم يُنشر أي تقرير.",
                ),
            )
            else -> Unit
        }

        val report = state.report
        if (report != null) {
            GlassCard(
                Modifier.fillMaxWidth(),
                borderColor = if (report.isClean) KnouxColors.Success.copy(alpha = 0.4f) else KnouxColors.Warn.copy(alpha = 0.4f),
            ) {
                SectionLabel(tr("Coverage", "التغطية"))
                Spacer(Modifier.height(6.dp))
                InfoRow(tr("Password records", "سجلات كلمات المرور"), report.totalRecords.toString())
                InfoRow(tr("Evaluated", "قُيِّم"), report.evaluated.toString())
                InfoRow(
                    tr("Not readable", "غير قابل للقراءة"),
                    if (report.unreadable == 0) tr("none", "لا شيء") else report.unreadable.toString(),
                )
                InfoRow(tr("Blank secrets", "أسرار فارغة"), report.blankSecrets.toString())
                InfoRow(tr("Older than a year", "أقدم من عام"), report.staleCount.toString())
                Spacer(Modifier.height(6.dp))
                Text(
                    when {
                        report.isClean -> tr(
                            "No weak, reused, blank, stale or unreadable entry was found. This is a statement about the stored values only — it is not proof that any account is safe.",
                            "لم يُعثر على أي مدخل ضعيف أو معاد استخدامه أو فارغ أو قديم أو غير قابل للقراءة. هذه عبارة عن القيم المخزنة فقط، وليست دليلًا على أمان أي حساب.",
                        )
                        report.outcome == AuditOutcome.COMPLETED_WITH_GAPS -> tr(
                            "Some records could not be decrypted, so duplicate detection and coverage are partial. Do not treat this as clean.",
                            "تعذر فك تشفير بعض السجلات، لذلك يبقى كشف التكرار والتغطية جزئيًا. لا تعتبر النتيجة سليمة.",
                        )
                        else -> tr(
                            "Entries need attention. Fix them in Passwords and re-run the audit.",
                            "تحتاج بعض المدخلات إلى معالجة. أصلحها في كلمات المرور ثم أعد التدقيق.",
                        )
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = if (report.isClean) KnouxColors.Success else KnouxColors.Warn,
                )
            }
            Spacer(Modifier.height(10.dp))

            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Distribution", "التوزيع"))
                Spacer(Modifier.height(6.dp))
                StrengthLevel.entries.reversed().forEach { level ->
                    val count = report.levelCounts[level] ?: 0
                    if (count > 0) {
                        InfoRow(levelLabel(level), count.toString())
                    }
                }
            }
            Spacer(Modifier.height(10.dp))

            if (report.reuseClusters.isNotEmpty()) {
                GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Alert.copy(alpha = 0.4f)) {
                    SectionLabel(tr("Reused secrets", "أسرار معاد استخدامها"))
                    Spacer(Modifier.height(6.dp))
                    Text(
                        tr(
                            "These entries hold the same value. Grouping used a digest that was discarded when the scan finished; no digest or value is stored.",
                            "تحتوي هذه المدخلات على القيمة نفسها. استُخدمت بصمة تجميع جُردلت عند انتهاء الفحص؛ ولا تُخزَّن أي بصمة أو قيمة.",
                        ),
                        style = MaterialTheme.typography.labelSmall,
                    )
                    Spacer(Modifier.height(6.dp))
                    report.reuseClusters.forEach { cluster ->
                        Text(
                            tr("${cluster.recordIds.size} entries", "${cluster.recordIds.size} مدخلات") + " · " + cluster.labels.joinToString(", "),
                            style = MaterialTheme.typography.bodySmall,
                            color = KnouxColors.Alert,
                            modifier = Modifier.padding(bottom = 4.dp),
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
            }

            if (report.findings.isNotEmpty()) {
                GlassCard(Modifier.fillMaxWidth()) {
                    SectionLabel(tr("Findings", "النتائج"))
                    Spacer(Modifier.height(6.dp))
                    report.findings.forEach { finding ->
                        FindingRow(finding)
                        DividerLine()
                    }
                    if (report.findingsTruncated) {
                        Text(
                            tr(
                                "Only the weakest findings are listed; the counts above cover the whole vault.",
                                "تُدرج أضعف النتائج فقط؛ أما العددان أعلاه فيغطي الخزنة بالكامل.",
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            color = KnouxColors.Faint,
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
            }

            if (report.staleCount > 0 && !showStaleNote) {
                TextButton(onClick = { showStaleNote = true }) {
                    Text(tr("Why age matters", "لماذا يهم العمر"), color = KnouxColors.Violet, fontSize = 11.sp)
                }
            }
            if (showStaleNote) {
                AuditNotice(
                    tr(
                        "Age is a prompt, not a verdict: KNOUX cannot know whether a site breached its database, so an unchanged credential older than a year is listed for review rather than declared compromised.",
                        "العمر تذكير وليس حكمًا: لا تستطيع KNOUX معرفة ما إذا تم اختراق قاعدة بيانات موقع ما، لذلك يُدرج أي اعتماد لم يتغيّر منذ أكثر من عام للمراجعة بدلًا من إعلان اختراقه.",
                    ),
                )
            }

            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onOpenPasswords) {
                    Text(tr("Fix in Passwords", "الإصلاح في كلمات المرور"), color = KnouxColors.Violet, fontSize = 11.sp)
                }
                TextButton(onClick = { viewModel.run() }) {
                    Text(tr("Re-run audit", "إعادة التدقيق"), color = KnouxColors.Violet, fontSize = 11.sp)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Limits", "الحدود"))
            Text(
                tr(
                    "Strength is a local heuristic: character variety, length and repeated or keyboard patterns. It is not a breach-database check, it cannot see credentials already exposed elsewhere, and a strong score never means an account is safe. Only what this vault stores is audited; records outside it are invisible to this screen.",
                    "القوة استنتاج محلي: تنوع الأحرف والطول والأنماط المتكررة أو لوحة المفاتيح. هذا ليس فحصًا لقواعد بيانات التسريبات، ولا يرى الاعتمادات المكشوفة في مكان آخر، والدرجة العالية لا تعني أبدًا أن الحساب آمن. يُدقق ما تخزنه هذه الخزنة فقط؛ والسجلات خارجها غير مرئية لهذه الشاشة.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun AuditNotice(text: String) {
    Spacer(Modifier.height(8.dp))
    GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Warn.copy(alpha = 0.4f)) {
        Text(text, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Warn)
    }
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun FindingRow(finding: PasswordAuditFinding) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                finding.label.ifBlank { tr("Untitled", "بلا عنوان") },
                style = MaterialTheme.typography.bodyMedium,
                color = KnouxColors.Text,
            )
            Spacer(Modifier.width(6.dp))
            StatusPill(levelLabel(finding.level), tone = levelColor(finding.level))
        }
        val reasons = reasonLabels(finding)
        Text(
            reasons.joinToString(" · "),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Muted,
        )
    }
}

@Composable
private fun reasonLabels(finding: PasswordAuditFinding): List<String> {
    val reasons = ArrayList<String>()
    if (finding.reused) reasons += tr("same value elsewhere", "القيمة نفسها في مدخل آخر")
    if (finding.isStale) reasons += tr("unchanged for ${finding.ageDays} days", "لم تتغيّر منذ ${finding.ageDays} يومًا")
    finding.flags.forEach { flag ->
        when (flag) {
            StrengthFlag.BLANK -> reasons += tr("empty password", "كلمة مرور فارغة")
            StrengthFlag.VERY_SHORT -> reasons += tr("very short", "قصيرة جدًا")
            StrengthFlag.SHORT -> reasons += tr("short", "قصيرة")
            StrengthFlag.LOW_CHARSET -> reasons += tr("single character class", "فئة أحرف واحدة")
            StrengthFlag.REPEATED_RUN -> reasons += tr("repeated characters", "أحرف مكررة متتالية")
            StrengthFlag.SEQUENTIAL_RUN -> reasons += tr("alphabetical or numeric run", "تتابع أبجدي أو رقمي")
            StrengthFlag.KEYBOARD_RUN -> reasons += tr("keyboard row", "نمط لوحة مفاتيح")
            StrengthFlag.YEAR_LIKE -> reasons += tr("year-like digits", "أرقام تشبه سنة")
            StrengthFlag.SYMBOL_ONLY -> reasons += tr("symbols only", "رموز فقط")
            StrengthFlag.REPEATED_UNIT -> reasons += tr("repeated fragment", "مقطع مكرر")
            StrengthFlag.COMMON_WORD -> reasons += tr("known weak secret", "سر ضعيف معروف")
            StrengthFlag.COMMON_WORD_WRAPPED -> reasons += tr("known weak secret with affixes", "سر ضعيف معروف مع إضافات")
            StrengthFlag.NON_ASCII -> reasons += tr("non-ASCII characters", "أحرف غير ASCII")
        }
    }
    if (reasons.isEmpty()) reasons += tr("below the local threshold", "أقل من الحد المحلي")
    return reasons
}
