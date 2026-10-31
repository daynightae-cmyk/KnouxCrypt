package com.knoux.crypt.ui

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AccessError
import com.knoux.crypt.AccessErrors
import com.knoux.crypt.AppContainer
import com.knoux.crypt.SecurityMessage
import com.knoux.crypt.data.RotationAuthorization
import com.knoux.crypt.data.RotationIncompleteException
import com.knoux.crypt.data.RotationInventory
import com.knoux.crypt.data.RotationPhases
import com.knoux.crypt.data.RotationProgress
import com.knoux.crypt.data.RotationResult
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.yield

class VaultKeyRotationViewModel(
    application: Application,
    private val container: AppContainer,
) : AndroidViewModel(application) {
    data class UiState(
        val inventory: RotationInventory? = null,
        val busy: Boolean = false,
        val progress: RotationProgress? = null,
        val result: RotationResult? = null,
        val error: SecurityMessage? = null,
        val cancelledResumable: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()
    private var job: Job? = null

    init {
        viewModelScope.launch {
            container.rotationAuthBroker.authorization.collect { incoming ->
                if (incoming != null) {
                    val authorization = container.rotationAuthBroker.consume()
                    if (authorization != null) start(authorization)
                }
            }
        }
        viewModelScope.launch {
            container.rotationAuthBroker.error.collect { message ->
                if (message != null) {
                    _state.update { it.copy(error = message, busy = false) }
                    container.rotationAuthBroker.clearError()
                }
            }
        }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            val access = container.session.currentAccess() ?: return@launch
            runCatching { container.keyRotation.inventory(access) }
                .onSuccess { inventory -> _state.update { it.copy(inventory = inventory) } }
                .onFailure { failure -> _state.update { it.copy(error = describe(failure)) } }
        }
    }

    fun cancel() {
        val access = container.session.currentAccess()
        job?.cancel()
        job = null
        viewModelScope.launch {
            if (access != null) {
                when (runCatching { container.keyRotation.cancel(access) }.getOrNull()) {
                    null -> Unit
                    com.knoux.crypt.data.RotationCancelResult.CANCELLED_RESUMABLE ->
                        _state.update { it.copy(cancelledResumable = true) }
                    com.knoux.crypt.data.RotationCancelResult.CANCELLED_CLEAN ->
                        _state.update { it.copy(cancelledResumable = false, progress = null) }
                }
            }
            container.rotationAuthBroker.cancelRequest()
            _state.update { it.copy(busy = false) }
            refresh()
        }
    }

    private fun start(authorization: RotationAuthorization) {
        if (job?.isActive == true) return
        val access = container.session.currentAccess()
        if (access == null) {
            _state.update { it.copy(error = SecurityMessage(AccessError.NOT_UNLOCKED), busy = false) }
            return
        }
        job = viewModelScope.launch {
            _state.update { it.copy(busy = true, error = null, result = null, cancelledResumable = false) }
            try {
                container.keyRotation.prepare(access, authorization)
                refreshInventoryDirect(access)
                var cutoverAttempts = 0
                while (true) {
                    var progress = container.keyRotation.migrateBatch(access)
                    _state.update { it.copy(progress = progress) }
                    while (progress.remainingRows > 0) {
                        yield()
                        progress = container.keyRotation.migrateBatch(access)
                        _state.update { it.copy(progress = progress) }
                    }
                    try {
                        val result = container.keyRotation.verifyAndCutover(access)
                        _state.update { it.copy(result = result, busy = false, progress = null) }
                        break
                    } catch (incomplete: RotationIncompleteException) {
                        // New rows were written under the old active version while
                        // migrating; migrate them too, with a bounded retry.
                        if (++cutoverAttempts > 3) throw incomplete
                    }
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                _state.update { it.copy(error = describe(failure), busy = false) }
            } finally {
                container.rotationAuthBroker.cancelRequest()
                val current = container.session.currentAccess()
                if (current != null) refreshInventoryDirect(current)
            }
        }
    }

    private suspend fun refreshInventoryDirect(access: com.knoux.crypt.data.VaultAccess) {
        runCatching { container.keyRotation.inventory(access) }
            .onSuccess { inventory -> _state.update { it.copy(inventory = inventory) } }
    }

    private fun describe(failure: Throwable): SecurityMessage =
        AccessErrors.fromFailure(failure, rotationContext = true)
}

@Composable
fun VaultKeyRotationScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
    onRequestRotationAuth: () -> Unit,
) {
    if (container.session.currentAccess() == null) {
        LockedScreen(tr("Vault Key Rotation", "تدوير مفتاح الخزنة"), onBack, onNeedUnlock)
        return
    }
    val application = androidx.compose.ui.platform.LocalContext.current.applicationContext as Application
    val viewModel: VaultKeyRotationViewModel = viewModel(
        factory = viewModelFactory { VaultKeyRotationViewModel(application, container) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    val requesting by container.rotationAuthBroker.requesting.collectAsStateWithLifecycle()
    val inventory = state.inventory
    val journal = inventory?.journal
    val busy = state.busy || requesting
    val progress = state.progress
    var rootAcknowledged by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Vault Key Rotation", "تدوير مفتاح الخزنة"), onBack)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            StatusPill(tr("Versioned keys", "مفاتيح بإصدارات"), tone = KnouxColors.Violet)
            Spacer(Modifier.width(6.dp))
            StatusPill(tr("Root retained", "الجذر محفوظ"), tone = KnouxColors.Warn)
        }
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "Vault records are encrypted with a random data key wrapped by the non-exportable Android Keystore root. Rotation re-encrypts every record to a new data-key version, verifies it, then retires the old data key. The Keystore root itself is never replaced.",
                "تُشفَّر سجلات الخزنة بمفتاح بيانات عشوائي ملفوف بمفتاح جذر Android Keystore غير القابل للتصدير. يعيد التدوير تشفير كل سجل إلى إصدار مفتاح جديد، ويتحقق منه، ثم يتقاعد المفتاح القديم. لا يُستبدل مفتاح الجذر نفسه أبدًا.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(12.dp))

        inventory?.let { current ->
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Encrypted data inventory", "جرد البيانات المشفرة"))
                Spacer(Modifier.height(6.dp))
                Text(
                    tr(
                        "Active key version: ${versionLabel(current.activeVersion)}",
                        "إصدار المفتاح النشط: ${versionLabel(current.activeVersion)}",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    tr("Records: ${current.totalRows}", "السجلات: ${current.totalRows}"),
                    style = MaterialTheme.typography.bodySmall,
                )
                current.versionCounts.toSortedMap().forEach { (version, count) ->
                    Text(
                        "v$version: $count",
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Muted,
                    )
                }
                if (current.storedKeyVersions.isNotEmpty()) {
                    Text(
                        tr(
                            "Wrapped data keys: ${current.storedKeyVersions.joinToString { "v$it" }}",
                            "مفاتيح البيانات الملفوفة: ${current.storedKeyVersions.joinToString { "v$it" }}",
                        ),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Faint,
                    )
                }
                val currentJournal = current.journal
                if (currentJournal != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        tr(
                            "Interrupted rotation: v${currentJournal.sourceVersion} → v${currentJournal.targetVersion} (${currentJournal.phase})",
                            "تدوير متوقف: v${currentJournal.sourceVersion} → v${currentJournal.targetVersion} (${currentJournal.phase})",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = KnouxColors.Warn,
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
        }

        state.result?.let { result ->
            GlassCard(
                Modifier.fillMaxWidth(),
                borderColor = KnouxColors.Success.copy(alpha = 0.45f),
            ) {
                SectionLabel(tr("Rotation complete", "اكتمل التدوير"))
                Spacer(Modifier.height(6.dp))
                Text(
                    tr(
                        "v${result.sourceVersion} → v${result.targetVersion} · ${result.migratedRows} verified record(s)",
                        "v${result.sourceVersion} → v${result.targetVersion} · ${result.migratedRows} سجل تم التحقق منه",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    if (result.rootKeyRetained) {
                        tr(
                            "The legacy root key is retained because KNF1 device-key files and version-0 compatibility may depend on it. No key-retirement claim is made.",
                            "تم الاحتفاظ بمفتاح الجذر القديم لأن ملفات KNF1 بمفتاح الجهاز وتوافق الإصدار 0 قد تعتمد عليه. لا يُقدَّم أي ادعاء بتقاعد المفتاح.",
                        )
                    } else {
                        tr(
                            "The previous wrapped data key was retired after zero dependent records remained. The Keystore root remains.",
                            "تم تقاعد مفتاح البيانات السابق بعد ألا تبقى أي سجلات تعتمد عليه. يبقى جذر Keystore.",
                        )
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
            }
            Spacer(Modifier.height(10.dp))
        }

        if (state.result == null) {
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(
                    if (journal != null) tr("Resume rotation", "استئناف التدوير")
                    else tr("Start rotation", "بدء التدوير"),
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    if (journal != null) {
                        tr(
                            "A durable journal exists. Verify with biometrics to resume from the authoritative row versions; no record is discarded.",
                            "يوجد سجل تدوير دائم. تحقق بالبصمة للاستئناف اعتمادًا على إصدارات السجلات؛ لا يُحذف أي سجل.",
                        )
                    } else {
                        tr(
                            "This requires a fresh biometric verification even though the vault is unlocked. It does not change your unlock gate.",
                            "يتطلب تحققًا حيويًا جديدًا رغم أن الخزنة مفتوحة. لا يغيّر بوابة الفتح.",
                        )
                    },
                    style = MaterialTheme.typography.labelSmall,
                )
                Spacer(Modifier.height(8.dp))
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { rootAcknowledged = !rootAcknowledged },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(
                        checked = rootAcknowledged,
                        onCheckedChange = null,
                        colors = CheckboxDefaults.colors(
                            checkedColor = KnouxColors.Violet,
                            uncheckedColor = KnouxColors.LineHot,
                            checkmarkColor = KnouxColors.Text,
                        ),
                    )
                    Text(
                        tr(
                            "I understand the Keystore root key is retained for external KNF1 device-key files and no automatic file migration is offered.",
                            "أفهم أنه سيُحتفظ بمفتاح جذر Keystore لملفات KNF1 الخارجية بمفتاح الجهاز ولا يوجد ترحيل تلقائي للملفات.",
                        ),
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
                Spacer(Modifier.height(8.dp))
                KnouxPrimaryButton(
                    if (journal != null) tr("Verify & resume rotation", "تحقق واستأنف التدوير")
                    else tr("Verify & rotate data key", "تحقق ودوّر مفتاح البيانات"),
                    onRequestRotationAuth,
                    enabled = !busy && inventory != null && rootAcknowledged,
                )
                if (busy) {
                    Spacer(Modifier.height(10.dp))
                    LinearProgressIndicator(Modifier.fillMaxWidth(), color = KnouxColors.VioletDeep)
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = KnouxColors.Violet)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            if (progress != null) {
                                tr(
                                    "Migrating ${progress.migratedRows}/${progress.totalRows} records · ${progress.phase}",
                                    "جارٍ ترحيل ${progress.migratedRows}/${progress.totalRows} سجل · ${progress.phase}",
                                )
                            } else {
                                tr("Waiting for owner verification…", "بانتظار تحقق المالك…")
                            },
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    if (state.busy) {
                        Spacer(Modifier.height(6.dp))
                        KnouxGhostButton(
                            tr("Cancel and keep a resumable journal", "إلغاء مع الاحتفاظ بسجل قابل للاستئناف"),
                            viewModel::cancel,
                        )
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
        }

        if (state.cancelledResumable) {
            Text(
                tr(
                    "Cancelled after migration started. The journal and both keys are retained; resume when ready.",
                    "أُلغي بعد بدء الترحيل. تم الاحتفاظ بالسجل والمفتاحين؛ استأنف عندما تكون جاهزًا.",
                ),
                style = MaterialTheme.typography.bodySmall,
                color = KnouxColors.Warn,
            )
            Spacer(Modifier.height(8.dp))
        }
        state.error?.let { failure ->
            Text(
                tr(failure.error.labelEn, failure.error.labelAr),
                color = KnouxColors.Alert,
                style = MaterialTheme.typography.bodySmall,
            )
            failure.detail?.let { detail ->
                Text(
                    detail,
                    color = KnouxColors.Faint,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            Spacer(Modifier.height(6.dp))
        }

        GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Warn.copy(alpha = 0.4f)) {
            SectionLabel(tr("Safety boundaries", "حدود الأمان"))
            Text(
                tr(
                    "• The Keystore root alias is never deleted, renamed or regenerated. KNF1 device-key files remain readable.\n• External SAF files cannot be enumerated; they keep using the root key and are never silently abandoned.\n• Cancellation after migration is resumable, not a rollback. Old wrapped data keys are removed only after zero rows depend on them and every target row authenticates.\n• This has not been device-verified or independently audited.",
                    "• لا يُحذف اسم مفتاح جذر Keystore أو يُعاد تسميته أو توليده. تبقى ملفات KNF1 بمفتاح الجهاز قابلة للقراءة.\n• لا يمكن حصر ملفات SAF الخارجية؛ تبقى تستخدم مفتاح الجذر ولا تُهمل بصمت.\n• الإلغاء بعد الترحيل قابل للاستئناف وليس تراجعًا. تُحذف مفاتيح البيانات القديمة فقط بعد ألا تعتمد عليها أي سجلات وبعد مصادقة كل سجل هدف.\n• لم يتم التحقق على جهاز أو تدقيق أمني مستقل.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = viewModel::refresh, enabled = !busy) {
                Text(tr("Refresh inventory", "تحديث الجرد"), color = KnouxColors.Violet)
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

private fun versionLabel(version: Int): String =
    if (version == 0) "v0 (legacy root key)" else "v$version (wrapped data key)"
