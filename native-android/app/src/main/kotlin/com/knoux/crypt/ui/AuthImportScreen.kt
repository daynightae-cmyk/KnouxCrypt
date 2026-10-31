package com.knoux.crypt.ui

import android.Manifest
import android.app.Application
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.SecretKinds
import com.knoux.crypt.data.SecretsJson
import com.knoux.crypt.data.TotpPayload
import com.knoux.crypt.data.VaultLockedException
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.KnouxTextField
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.security.ImportedOtpAccount
import com.knoux.crypt.security.MigrationBatch
import com.knoux.crypt.security.OtpAlgorithm
import com.knoux.crypt.security.OtpAuthParser
import com.knoux.crypt.security.OtpInvalidReason
import com.knoux.crypt.security.OtpParseResult
import com.knoux.crypt.security.OtpUnsupportedReason
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** What to do with an account that already exists in the vault. */
enum class DuplicateDecision { CREATE, REPLACE, SKIP }

data class PendingAccount(
    val account: ImportedOtpAccount,
    val existingId: String?,
    val existingLabel: String?,
    val decision: DuplicateDecision,
) {
    val isDuplicate: Boolean get() = existingId != null
    val willImport: Boolean get() = decision != DuplicateDecision.SKIP
}

enum class ImportStatus { IDLE, PARSING, PREVIEW, IMPORTING, DONE, FAILED }

sealed interface ImportMessage {
    data class Unsupported(val reason: OtpUnsupportedReason, val detail: String? = null) : ImportMessage
    data class Invalid(val reason: OtpInvalidReason, val detail: String? = null) : ImportMessage
    data class Locked(val detail: String? = null) : ImportMessage
    data class Failed(val detail: String) : ImportMessage
    object CameraDenied : ImportMessage
    object NoCamera : ImportMessage
    object QrUnreadable : ImportMessage
}

data class AuthImportState(
    val status: ImportStatus = ImportStatus.IDLE,
    val pending: List<PendingAccount> = emptyList(),
    val message: ImportMessage? = null,
    val migrationExpected: Int = 0,
    val migrationReceived: Int = 0,
    val importedCount: Int = 0,
    val skippedDuplicates: Int = 0,
)

/**
 * TASK 11 import flow. Parsing happens in `:core:security`; this ViewModel only
 * holds a short-lived preview (which necessarily contains secrets), resolves
 * duplicates against the encrypted vault, and commits the chosen accounts in one
 * repository batch. Everything is cleared when the session locks, and a cancel
 * or lock before the commit leaves the vault unchanged.
 */
class AuthImportViewModel(
    application: Application,
    private val container: AppContainer,
) : AndroidViewModel(application) {
    private val _state = MutableStateFlow(AuthImportState())
    val state: StateFlow<AuthImportState> = _state.asStateFlow()

    /** batchId -> pageIndex -> accounts, for multi-page migration QR codes. */
    private val migrationPages = HashMap<Int, MutableMap<Int, List<ImportedOtpAccount>>>()

    init {
        viewModelScope.launch {
            container.session.unlocked.collect { unlocked ->
                if (!unlocked) {
                    migrationPages.clear()
                    _state.value = AuthImportState(status = ImportStatus.IDLE, message = ImportMessage.Locked())
                }
            }
        }
    }

    fun submit(raw: String) {
        val access = container.session.currentAccess()
        if (access == null) {
            _state.value = _state.value.copy(status = ImportStatus.IDLE, message = ImportMessage.Locked())
            return
        }
        _state.value = _state.value.copy(status = ImportStatus.PARSING, message = null)
        when (val parsed = OtpAuthParser.parse(raw)) {
            is OtpParseResult.Invalid ->
                _state.value = _state.value.copy(
                    status = ImportStatus.FAILED,
                    message = ImportMessage.Invalid(parsed.reason, parsed.detail),
                )
            is OtpParseResult.Unsupported ->
                _state.value = _state.value.copy(
                    status = ImportStatus.FAILED,
                    message = ImportMessage.Unsupported(parsed.reason, parsed.detail),
                )
            is OtpParseResult.Accounts -> {
                val batch = parsed.migration
                if (batch != null && batch.isMultiPage) {
                    receivePage(batch)
                } else {
                    viewModelScope.launch { offer(parsed.accounts) }
                }
            }
        }
    }

    private fun receivePage(batch: MigrationBatch) {
        val pages = migrationPages.getOrPut(batch.batchId) { LinkedHashMap() }
        pages[batch.batchIndex] = batch.accounts
        _state.value = _state.value.copy(
            status = ImportStatus.PREVIEW,
            migrationExpected = batch.batchSize,
            migrationReceived = pages.size,
        )
        if (pages.size == batch.batchSize && (0 until batch.batchSize).all { pages.containsKey(it) }) {
            val merged = (0 until batch.batchSize).flatMap { pages[it].orEmpty() }
            migrationPages.remove(batch.batchId)
            viewModelScope.launch { offer(merged) }
        }
    }

    private suspend fun offer(accounts: List<ImportedOtpAccount>) {
        val access = container.session.currentAccess()
        if (access == null) {
            _state.value = AuthImportState(status = ImportStatus.IDLE, message = ImportMessage.Locked())
            return
        }
        val existing = withContext(Dispatchers.IO) {
            runCatching {
                container.secrets.observe(access, SecretKinds.TOTP).first()
                    .mapNotNull { record ->
                        val payload = record.payloadJson
                            .takeUnless { record.decryptionFailed }
                            ?.let { SecretsJson.decodeTotp(it) }
                        payload?.let { record.id to it }
                    }
            }.getOrDefault(emptyList())
        }
        val byName = existing.associate { (id, payload) ->
            ("${payload.issuer.trim().lowercase()}\u0000${payload.account.trim().lowercase()}") to
                (id to "${payload.issuer} · ${payload.account}")
        }
        val seen = HashSet<String>()
        val incoming = accounts.filter { seen.add(it.duplicateKey) }
        val pending = incoming.map { account ->
            val hit = byName["${account.issuer.trim().lowercase()}\u0000${account.account.trim().lowercase()}"]
            PendingAccount(
                account = account,
                existingId = hit?.first,
                existingLabel = hit?.second,
                decision = if (hit != null) DuplicateDecision.SKIP else DuplicateDecision.CREATE,
            )
        }
        _state.value = _state.value.copy(
            status = if (pending.isEmpty()) ImportStatus.FAILED else ImportStatus.PREVIEW,
            pending = pending,
            message = if (pending.isEmpty()) ImportMessage.Invalid(OtpInvalidReason.EMPTY) else null,
            migrationExpected = 0,
            migrationReceived = 0,
        )
    }

    fun setDecision(index: Int, decision: DuplicateDecision) {
        _state.value = _state.value.copy(
            pending = _state.value.pending.mapIndexed { position, entry ->
                if (position == index) entry.copy(decision = decision) else entry
            },
        )
    }

    fun remove(index: Int) {
        setDecision(index, DuplicateDecision.SKIP)
    }

    fun reset() {
        migrationPages.clear()
        _state.value = AuthImportState()
    }

    fun confirm() {
        val access = container.session.currentAccess()
        if (access == null) {
            _state.value = _state.value.copy(status = ImportStatus.FAILED, message = ImportMessage.Locked())
            return
        }
        val chosen = _state.value.pending.filter { it.willImport }
        if (chosen.isEmpty()) return
        _state.value = _state.value.copy(status = ImportStatus.IMPORTING, message = null)
        viewModelScope.launch {
            try {
                val items = chosen.map { entry ->
                    val targetId = if (entry.decision == DuplicateDecision.REPLACE) entry.existingId else null
                    targetId to SecretsJson.encodeTotp(
                        TotpPayload(
                            issuer = entry.account.issuer,
                            account = entry.account.account,
                            secretBase32 = entry.account.secretBase32,
                            algorithm = entry.account.algorithm.name,
                            digits = entry.account.digits,
                            period = entry.account.periodSeconds,
                        ),
                    )
                }
                container.secrets.saveBatch(access, SecretKinds.TOTP, items)
                _state.value = AuthImportState(
                    status = ImportStatus.DONE,
                    importedCount = items.size,
                    skippedDuplicates = _state.value.pending.count { entry ->
                        entry.isDuplicate && entry.decision == DuplicateDecision.SKIP
                    },
                )
            } catch (_: VaultLockedException) {
                _state.value = AuthImportState(status = ImportStatus.FAILED, message = ImportMessage.Locked())
            } catch (failure: Exception) {
                _state.value = AuthImportState(
                    status = ImportStatus.FAILED,
                    message = ImportMessage.Failed(failure.message ?: "IMPORT_FAILED"),
                )
            }
        }
    }

    fun reportQrUnreadable() {
        _state.value = AuthImportState(status = ImportStatus.FAILED, message = ImportMessage.QrUnreadable)
    }

    fun clearMessage() {
        _state.value = _state.value.copy(message = null, status = if (_state.value.pending.isEmpty()) ImportStatus.IDLE else ImportStatus.PREVIEW)
    }
}

@Composable
fun AuthImportScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
) {
    if (container.session.currentAccess() == null) {
        LockedScreen(tr("Import accounts", "استيراد الحسابات"), onBack, onNeedUnlock)
        return
    }
    val application = LocalContext.current.applicationContext as Application
    val viewModel: AuthImportViewModel = viewModel(
        factory = viewModelFactory { AuthImportViewModel(application, container) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var link by remember { mutableStateOf("") }
    var cameraOpen by remember { mutableStateOf(false) }
    var permissionDenied by remember { mutableStateOf(false) }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        viewModel.reset()
        val text = runCatching {
            context.contentResolver.openInputStream(uri)?.use { QrSupport.decodeImage(it) }
        }.getOrNull()
        if (text == null) viewModel.reportQrUnreadable() else viewModel.submit(text)
    }
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permissionDenied = !granted
        cameraOpen = granted
    }

    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp),
        ) {
            BackHeader(tr("Import accounts", "استيراد الحسابات"), onBack)
            Spacer(Modifier.height(8.dp))
            Text(
                tr(
                    "Everything stays on this device: QR decoding, parsing and storage all run locally and the app has no network permission. Secrets are shown once in the preview and then written to the encrypted vault.",
                    "كل شيء يبقى على هذا الجهاز: فك رمز QR والتحليل والتخزين تعمل محليًا ولا يملك التطبيق أي إذن شبكة. تظهر الأسرار مرة واحدة في المعاينة ثم تُكتب في الخزنة المشفرة.",
                ),
                style = MaterialTheme.typography.labelSmall,
            )
            Spacer(Modifier.height(10.dp))

            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Add a link", "إضافة رابط"))
                Spacer(Modifier.height(6.dp))
                KnouxTextField(
                    value = link,
                    onValueChange = { link = it },
                    label = tr("otpauth:// URI", "رابط otpauth://"),
                    singleLine = true,
                )
                Spacer(Modifier.height(6.dp))
                KnouxGhostButton(
                    tr("Preview link", "معاينة الرابط"),
                    { viewModel.submit(link) },
                    enabled = link.isNotBlank() && state.status != ImportStatus.IMPORTING,
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(
                        onClick = { imagePicker.launch("image/*") },
                        enabled = state.status != ImportStatus.IMPORTING,
                    ) { Text(tr("Choose QR image", "اختيار صورة QR"), color = KnouxColors.Violet) }
                    TextButton(
                        onClick = {
                            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                                PackageManager.PERMISSION_GRANTED
                            ) {
                                cameraOpen = true
                            } else {
                                cameraPermission.launch(Manifest.permission.CAMERA)
                            }
                        },
                        enabled = state.status != ImportStatus.IMPORTING,
                    ) { Text(tr("Scan with camera", "مسح بالكاميرا"), color = KnouxColors.Violet) }
                }
                if (permissionDenied) {
                    Text(
                        tr(
                            "Camera permission was denied. You can still add accounts by link or by choosing a QR image.",
                            "رُفض إذن الكاميرا. يمكنك إضافة الحسابات عبر الرابط أو باختيار صورة QR.",
                        ),
                        color = KnouxColors.Warn,
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }
            Spacer(Modifier.height(10.dp))

            state.message?.let { message ->
                GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Alert.copy(alpha = 0.4f)) {
                    Text(
                        messageText(message),
                        color = KnouxColors.Alert,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    (message as? ImportMessage.Invalid)?.detail?.let { detail ->
                        Text(detail, color = KnouxColors.Faint, style = MaterialTheme.typography.labelSmall)
                    }
                    (message as? ImportMessage.Unsupported)?.detail?.let { detail ->
                        Text(detail, color = KnouxColors.Faint, style = MaterialTheme.typography.labelSmall)
                    }
                    TextButton(onClick = { viewModel.clearMessage() }) {
                        Text(tr("Dismiss", "إغلاق"), color = KnouxColors.Violet, fontSize = 11.sp)
                    }
                }
                Spacer(Modifier.height(10.dp))
            }

            if (state.status == ImportStatus.PARSING || state.status == ImportStatus.IMPORTING) {
                LinearProgressIndicator(Modifier.fillMaxWidth(), color = KnouxColors.Violet)
                Spacer(Modifier.height(10.dp))
            }

            if (state.migrationExpected > 1 && state.status != ImportStatus.DONE) {
                GlassCard(Modifier.fillMaxWidth()) {
                    SectionLabel(tr("Multi-page export", "تصدير متعدد الصفحات"))
                    Text(
                        tr(
                            "Received page ${state.migrationReceived} of ${state.migrationExpected}. Scan or choose every page before importing; the batch is committed only once all pages are present.",
                            "استُلمت الصفحة ${state.migrationReceived} من ${state.migrationExpected}. امسح أو اختر كل الصفحات قبل الاستيراد؛ لا تُثبَّت الدفعة إلا عند اكتمال الصفحات.",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Spacer(Modifier.height(10.dp))
            }

            if (state.pending.isNotEmpty()) {
                GlassCard(Modifier.fillMaxWidth()) {
                    SectionLabel(tr("Preview", "المعاينة"))
                    Spacer(Modifier.height(6.dp))
                    state.pending.forEachIndexed { index, entry ->
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "${entry.account.issuer.ifBlank { tr("No issuer", "بلا جهة") }} · ${entry.account.account}",
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                Text(
                                    tr(
                                        "${entry.account.algorithm.name} · ${entry.account.digits} digits · ${entry.account.periodSeconds}s",
                                        "${entry.account.algorithm.name} · ${entry.account.digits} أرقام · ${entry.account.periodSeconds}ث",
                                    ),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = KnouxColors.Muted,
                                )
                            }
                        }
                        if (entry.isDuplicate) {
                            Text(
                                tr(
                                    "Already stored: ${entry.existingLabel}",
                                    "مخزّن بالفعل: ${entry.existingLabel}",
                                ),
                                style = MaterialTheme.typography.labelSmall,
                                color = KnouxColors.Warn,
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                TextButton(onClick = { viewModel.setDecision(index, DuplicateDecision.SKIP) }) {
                                    Text(
                                        if (entry.decision == DuplicateDecision.SKIP) tr("Skip ✓", "تخطي ✓") else tr("Skip", "تخطي"),
                                        color = KnouxColors.Violet,
                                        fontSize = 11.sp,
                                    )
                                }
                                TextButton(onClick = { viewModel.setDecision(index, DuplicateDecision.REPLACE) }) {
                                    Text(
                                        if (entry.decision == DuplicateDecision.REPLACE) tr("Replace ✓", "استبدال ✓")
                                        else tr("Replace", "استبدال"),
                                        color = KnouxColors.Alert,
                                        fontSize = 11.sp,
                                    )
                                }
                            }
                        } else {
                            StatusPill(tr("New", "جديد"), tone = KnouxColors.Success)
                        }
                        Spacer(Modifier.height(6.dp))
                    }
                    Spacer(Modifier.height(4.dp))
                    KnouxPrimaryButton(
                        text = tr(
                            "Import ${state.pending.count { it.willImport }} account(s)",
                            "استيراد ${state.pending.count { it.willImport }} حساب/حسابات",
                        ),
                        onClick = { viewModel.confirm() },
                        enabled = state.pending.any { it.willImport } &&
                            state.status == ImportStatus.PREVIEW &&
                            state.migrationExpected <= 1,
                    )
                    TextButton(onClick = { viewModel.reset(); link = "" }) {
                        Text(tr("Cancel and clear preview", "إلغاء ومسح المعاينة"), color = KnouxColors.Muted)
                    }
                    Text(
                        tr(
                            "Nothing is written until you press Import. Records use the same encrypted TOTP store as manual entries.",
                            "لا يُكتب أي شيء حتى تضغط استيراد. تستخدم السجلات نفس مخزن TOTP المشفر المستخدم للإدخال اليدوي.",
                        ),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Faint,
                    )
                }
                Spacer(Modifier.height(10.dp))
            }

            if (state.status == ImportStatus.DONE) {
                GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Success.copy(alpha = 0.4f)) {
                    SectionLabel(tr("Imported", "تم الاستيراد"))
                    InfoRow(tr("Accounts written", "حسابات مكتوبة"), state.importedCount.toString())
                    InfoRow(tr("Duplicates skipped", "تكرارات متخطاة"), state.skippedDuplicates.toString())
                    Spacer(Modifier.height(6.dp))
                    KnouxGhostButton(tr("Import more", "استيراد المزيد"), { viewModel.reset(); link = "" })
                    Spacer(Modifier.height(6.dp))
                    KnouxGhostButton(tr("Back to Authenticator", "العودة إلى المصادقة"), onBack)
                }
            }

            Spacer(Modifier.height(10.dp))
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Supported formats", "الصيغ المدعومة"))
                Text(
                    tr(
                        "Single otpauth://totp links, QR images containing one, and Google Authenticator exports whose migration payload matches the published protobuf contract (all pages, TOTP only). HOTP, MD5 and unknown algorithms or digit counts are explained and refused, never converted. Issuer, account, secret length, algorithm, digits and period are validated before anything is offered.",
                        "روابط otpauth://totp المفردة، وصور QR التي تحتويها، وتصديرات Google Authenticator التي تطابق عقد protobuf المنشور (كل الصفحات، TOTP فقط). تُشرح HOTP وMD5 والخوارزميات أو أعداد الأرقام غير المعروفة وتُرفض، ولا تُحوَّل أبدًا. يُتحقق من الجهة والحساب وطول السر والخوارزمية والأرقام والفترة قبل عرض أي شيء.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
            }
            Spacer(Modifier.height(24.dp))
        }

        if (cameraOpen) {
            GlassCard(
                Modifier
                    .fillMaxWidth()
                    .padding(18.dp)
                    .height(420.dp),
            ) {
                SectionLabel(tr("Point the camera at the QR code", "وجّه الكاميرا نحو رمز QR"))
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    QrCameraPreview(
                        modifier = Modifier.fillMaxSize(),
                        onDecoded = { text ->
                            cameraOpen = false
                            viewModel.reset()
                            viewModel.submit(text)
                        },
                    )
                }
                KnouxGhostButton(tr("Close camera", "إغلاق الكاميرا"), { cameraOpen = false })
            }
        }
    }
}

@Composable
private fun messageText(message: ImportMessage): String = when (message) {
    is ImportMessage.Unsupported -> when (message.reason) {
        OtpUnsupportedReason.HOTP ->
            tr("HOTP counter-based codes are not supported. Nothing was imported.", "رموز HOTP القائمة على العداد غير مدعومة. لم يُستورد أي شيء.")
        OtpUnsupportedReason.ALGORITHM ->
            tr("This export uses an algorithm KNOUX cannot compute (for example MD5). Nothing was imported.", "يستخدم هذا التصدير خوارزمية لا يستطيع KNOUX حسابها (مثل MD5). لم يُستورد أي شيء.")
        OtpUnsupportedReason.DIGITS ->
            tr("This export uses an unsupported digit count. Nothing was imported.", "يستخدم هذا التصدير عدد أرقام غير مدعوم. لم يُستورد أي شيء.")
        OtpUnsupportedReason.MIGRATION_FORMAT ->
            tr("This migration payload is not the supported format.", "حمولة الترحيل هذه ليست بالصيغة المدعومة.")
    }
    is ImportMessage.Invalid -> when (message.reason) {
        OtpInvalidReason.EMPTY -> tr("Nothing to parse.", "لا يوجد ما يُحلَّل.")
        OtpInvalidReason.TOO_LARGE -> tr("The input or payload is too large.", "الإدخال أو الحمولة كبيرة جدًا.")
        OtpInvalidReason.NOT_OTPAUTH -> tr("This is not an otpauth link or QR payload.", "هذا ليس رابط otpauth أو حمولة QR.")
        OtpInvalidReason.MISSING_SECRET -> tr("The link has no secret.", "لا يحتوي الرابط على سر.")
        OtpInvalidReason.BAD_SECRET -> tr("The secret is not valid Base32 or is out of the accepted length.", "السر ليس Base32 صالحًا أو طوله خارج النطاق المقبول.")
        OtpInvalidReason.BAD_DIGITS -> tr("Unsupported digit count.", "عدد أرقام غير مدعوم.")
        OtpInvalidReason.BAD_PERIOD -> tr("Unsupported period; 15–120 seconds is accepted.", "فترة غير مدعومة؛ يُقبل من 15 إلى 120 ثانية.")
        OtpInvalidReason.BAD_LABEL -> tr("The account label is missing or too long.", "اسم الحساب مفقود أو طويل جدًا.")
        OtpInvalidReason.AMBIGUOUS_URI -> tr("The link repeats a parameter, so it is ambiguous and refused.", "يكرر الرابط معاملًا، لذا هو غامض ويُرفض.")
        OtpInvalidReason.BAD_BASE64 -> tr("The migration payload is not valid base64url.", "حمولة الترحيل ليست base64url صالحة.")
        OtpInvalidReason.MALFORMED_MIGRATION -> tr("The migration payload does not match the supported protobuf contract.", "حمولة الترحيل لا تطابق عقد protobuf المدعوم.")
        OtpInvalidReason.BATCH_INCONSISTENT -> tr("The page numbering of this export is inconsistent.", "ترقيم صفحات هذا التصدير غير متسق.")
    }
    is ImportMessage.Locked -> tr("The vault locked. The preview was cleared and nothing was imported.", "أُقفلت الخزنة. مُسحت المعاينة ولم يُستورد أي شيء.")
    is ImportMessage.Failed -> tr("Import failed; the vault was left unchanged.", "فشل الاستيراد؛ بقيت الخزنة دون تغيير.")
    ImportMessage.CameraDenied -> tr("Camera permission is required to scan.", "إذن الكاميرا مطلوب للمسح.")
    ImportMessage.NoCamera -> tr("No camera is available on this device.", "لا توجد كاميرا على هذا الجهاز.")
    ImportMessage.QrUnreadable ->
        tr("No QR code could be read from that image. Nothing was imported.", "تعذرت قراءة أي رمز QR من تلك الصورة. لم يُستورد أي شيء.")
}
