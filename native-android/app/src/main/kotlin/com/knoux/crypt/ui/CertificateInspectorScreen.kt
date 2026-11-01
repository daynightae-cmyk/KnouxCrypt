package com.knoux.crypt.ui

import android.app.Application
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.CertificateAssessment
import com.knoux.crypt.data.CertificateImportOutcome
import com.knoux.crypt.data.StoredCertificate
import com.knoux.crypt.data.TrustPolicy
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
import com.knoux.crypt.security.CertificateInspector
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import java.io.IOException
import java.security.cert.X509Certificate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class PolicyChoice { NONE, STORED, PLATFORM }

data class CertificateUiState(
    val unlocked: Boolean = false,
    val fileName: String = "",
    val fileSize: Long? = null,
    val pastedText: String = "",
    val view: CertificateInspector.CertificateView? = null,
    val status: String? = null,
    val failed: Boolean = false,
    val busy: Boolean = false,
    val assessment: CertificateAssessment? = null,
    val policy: PolicyChoice = PolicyChoice.PLATFORM,
    val hostname: String = "",
    val inspectedAtMillis: Long = 0L,
    val stored: List<StoredCertificate> = emptyList(),
    val showFingerprint: Boolean = false,
    val notice: String? = null,
)

class CertificateInspectorViewModel(application: Application, private val container: AppContainer) :
    AndroidViewModel(application) {

    private val _state = MutableStateFlow(CertificateUiState())
    val state: StateFlow<CertificateUiState> = _state.asStateFlow()
    private var certificate: X509Certificate? = null
    private var rawBytes: ByteArray? = null

    fun attach() {
        val access = container.session.currentAccess()
        _state.update { it.copy(unlocked = access != null) }
        if (access == null) {
            _state.update { it.copy(stored = emptyList()) }
            return
        }
        viewModelScope.launch {
            runCatching { container.certificates.observe(access).collect { rows ->
                _state.update { it.copy(stored = rows) }
            } }
        }
    }

    fun setPasted(text: String) {
        _state.update { it.copy(pastedText = text, status = null, failed = false) }
    }

    fun setHostname(host: String) = _state.update { it.copy(hostname = host.take(120)) }

    fun setPolicy(policy: PolicyChoice) = _state.update { it.copy(policy = policy) }

    fun toggleFingerprint() = _state.update { it.copy(showFingerprint = !it.showFingerprint) }

    fun clear() {
        rawBytes?.fill(0)
        rawBytes = null
        certificate = null
        _state.update {
            it.copy(
                fileName = "",
                fileSize = null,
                view = null,
                assessment = null,
                status = null,
                failed = false,
                showFingerprint = false,
            )
        }
    }

    fun chooseBytes(bytes: ByteArray, name: String) {
        rawBytes = bytes
        _state.update {
            it.copy(
                fileName = name,
                fileSize = bytes.size.toLong(),
                pastedText = if (String(bytes, Charsets.ISO_8859_1).contains("-----BEGIN")) {
                    String(bytes, Charsets.UTF_8)
                } else {
                    it.pastedText
                },
                status = null,
                failed = false,
                assessment = null,
                view = null,
            )
        }
        inspect()
    }

    fun pickFromUri(uri: Uri) {
        val app = getApplication<Application>()
        viewModelScope.launch {
            _state.update { it.copy(busy = true) }
            val read = withContext(Dispatchers.IO) {
                val name = runCatching {
                    app.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst() && cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME) >= 0) cursor.getString(0) else null
                    }
                }.getOrNull() ?: "certificate"
                val size = runCatching {
                    app.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst() && cursor.getColumnIndex(OpenableColumns.SIZE) >= 0 && !cursor.isNull(0)) {
                            cursor.getLong(0)
                        } else {
                            null
                        }
                    }
                }.getOrNull()
                if (size != null && size > CertificateInspector.MAX_INPUT_BYTES) {
                    return@withContext null to name
                }
                val bytes = runCatching {
                    app.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                }.getOrNull()
                bytes to name
            }
            _state.update { it.copy(busy = false) }
            val bytes = read.first
            if (bytes == null || bytes.isEmpty()) {
                _state.update {
                    it.copy(failed = true, status = "file-unreadable", fileName = read.second, view = null)
                }
                return@launch
            }
            chooseBytes(bytes, read.second)
        }
    }

    /** Parses whatever is available: the chosen file, or the pasted PEM. */
    fun inspect() {
        val fromPaste = _state.value.pastedText.toByteArray(Charsets.UTF_8)
        val source = rawBytes?.takeIf { it.isNotEmpty() } ?: fromPaste
        if (source.isEmpty()) {
            _state.update { it.copy(failed = true, status = "no-input", view = null, assessment = null) }
            return
        }
        when (val outcome = CertificateInspector.parse(source)) {
            is CertificateInspector.ParseOutcome.Parsed -> {
                certificate = outcome.certificate
                _state.update {
                    it.copy(
                        view = outcome.view,
                        failed = false,
                        status = "parsed",
                        assessment = null,
                        inspectedAtMillis = System.currentTimeMillis(),
                    )
                }
            }

            is CertificateInspector.ParseOutcome.Rejected -> {
                certificate = null
                _state.update {
                    it.copy(
                        view = null,
                        assessment = null,
                        failed = true,
                        status = outcome.reason.name.lowercase(),
                    )
                }
            }
        }
    }

    fun checkChain() {
        val access = container.session.currentAccess()
        val current = certificate
        if (access == null || current == null) {
            _state.update { it.copy(failed = current == null, status = if (access == null) "locked" else "no-certificate") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(busy = true) }
            val policy = when (_state.value.policy) {
                PolicyChoice.NONE -> TrustPolicy.None
                PolicyChoice.STORED -> TrustPolicy.StoredAnchors
                PolicyChoice.PLATFORM -> TrustPolicy.PlatformStore
            }
            val outcome = runCatching {
                container.certificates.assess(
                    access = access,
                    certificate = current,
                    policy = policy,
                    nowMillis = System.currentTimeMillis(),
                    hostname = _state.value.hostname,
                )
            }
            _state.update { state ->
                val assessment = outcome.getOrNull()
                state.copy(
                    busy = false,
                    assessment = assessment,
                    failed = assessment == null,
                    status = when {
                        assessment == null -> "assessment-failed"
                        assessment.chain is CertificateInspector.ChainOutcome.Trusted -> "chain-trusted"
                        else -> "chain-failed"
                    },
                )
            }
        }
    }

    fun importCertificate(label: String) {
        val access = container.session.currentAccess()
        val bytes = rawBytes ?: _state.value.pastedText.toByteArray().takeIf { it.isNotEmpty() }
        if (access == null || bytes == null) {
            _state.update { it.copy(status = if (access == null) "locked" else "no-input", failed = true) }
            return
        }
        viewModelScope.launch {
            val outcome = runCatching { container.certificates.import(access, label, bytes) }
            _state.update { state ->
                when (val result = outcome.getOrNull()) {
                    is CertificateImportOutcome.Imported -> state.copy(notice = "imported", failed = false)
                    is CertificateImportOutcome.AlreadyStored -> state.copy(notice = "already-stored", failed = false)
                    is CertificateImportOutcome.Rejected -> state.copy(status = result.reason.name.lowercase(), failed = true)
                    null -> state.copy(
                        status = if (outcome.exceptionOrNull() is VaultLockedException) "locked" else "import-failed",
                        failed = true,
                    )

                    else -> state
                }
            }
        }
    }

    fun setAnchor(id: String, anchor: Boolean) {
        val access = container.session.currentAccess() ?: return
        viewModelScope.launch { runCatching { container.certificates.setAnchor(access, id, anchor) } }
    }

    fun deleteCertificate(id: String) {
        val access = container.session.currentAccess() ?: return
        viewModelScope.launch { runCatching { container.certificates.delete(access, id) } }
    }

    fun copyFingerprint(value: String) {
        viewModelScope.launch { runCatching { container.clipboard.copySensitive(value, "KNOUX certificate fingerprint") } }
    }
}

/**
 * Certificate Inspector (TASK 20).
 *
 * Reading a certificate is allowed while the vault is locked — a public
 * certificate is public — but storing one, or choosing it as a trust anchor,
 * needs the vault open. The panel order follows the approved reference: file,
 * details, chain, primary action, then the fingerprint and chain sub-actions.
 */
@Composable
fun CertificateInspectorScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
) {
    val context = LocalContext.current
    val application = context.applicationContext as Application
    val viewModel: CertificateInspectorViewModel = viewModel(
        factory = viewModelFactory { CertificateInspectorViewModel(application, container) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    val unlocked by container.session.unlocked.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var importLabel by remember { mutableStateOf("") }

    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) viewModel.pickFromUri(uri)
    }

    LaunchedEffect(unlocked) { viewModel.attach() }

    val title = tr("Certificate Inspector", "فاحص الشهادات")
    val policyLabels = listOf(
        PolicyChoice.PLATFORM to tr("Device trust store", "متجر ثقة الجهاز"),
        PolicyChoice.STORED to tr("My stored anchors", "مراسي المعتمدة عندي"),
        PolicyChoice.NONE to tr("No anchors", "لا مراسي"),
    )

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(title, onBack)
        Spacer(Modifier.height(6.dp))
        Text(
            tr(
                "Inspect certificate details and verify the trust chain.",
                "افحص تفاصيل الشهادة وتحقق من سلسلة الثقة.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Muted,
        )
        Spacer(Modifier.height(12.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Certificate", "الشهادة"))
            Spacer(Modifier.height(6.dp))
            Text(
                state.fileName.ifBlank { tr("No certificate selected", "لم تُختر شهادة") },
                style = MaterialTheme.typography.bodyMedium,
                color = KnouxColors.Text,
            )
            Text(
                state.fileSize?.let { "${formatBytes(it)} · ${tr("PEM or DER", "PEM أو DER")}" }
                    ?: tr("Use the Android document picker or paste PEM below", "استخدم منتقي المستندات أو الصق PEM أدناه"),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                KnouxGhostButton(
                    tr("Choose file", "اختر ملفًا"),
                    { pickFile.launch(arrayOf("*/*")) },
                    Modifier.weight(1f),
                )
                if (state.fileName.isNotBlank() || state.view != null) {
                    TextButton(onClick = { viewModel.clear() }) {
                        Text(tr("Clear", "مسح"), color = KnouxColors.Faint, fontSize = 11.sp)
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            KnouxTextField(
                value = state.pastedText,
                onValueChange = { viewModel.setPasted(it) },
                label = tr("Paste PEM text", "الصق نص PEM"),
                minLines = 3,
            )
        }
        Spacer(Modifier.height(10.dp))

        val view = state.view
        if (view == null) {
            GlassCard(Modifier.fillMaxWidth()) {
                Text(
                    when (state.status) {
                        null -> tr("Nothing inspected yet.", "لم يُفحص شيء بعد.")
                        "no_input", "no-input" -> tr("Choose a file or paste PEM text first.", "اختر ملفًا أو الصق نص PEM أولًا.")
                        "too_large" -> tr("That file is larger than the 256 KB inspector limit.", "هذا الملف أكبر من حد 256 كيلوبايت.")
                        "malformed_asn1", "malformed-asn1" -> tr(
                            "The bytes are not a well-formed certificate. Nothing was inferred from them.",
                            "البيانات ليست شهادة صحيحة التكوين، ولم يُستنتج منها شيء.",
                        )

                        "not_a_certificate", "not-a-certificate" -> tr(
                            "This is not an X.509 certificate, or it is a bundle of several.",
                            "هذه ليست شهادة X.509، أو أنها حزمة تضم أكثر من شهادة.",
                        )

                        "empty" -> tr("The input was empty.", "كان المدخل فارغًا.")
                        "unsupported_type", "unsupported-type" -> tr("Unsupported certificate type.", "نوع شهادة غير مدعوم.")
                        "file-unreadable" -> tr("The selected file could not be read.", "تعذرت قراءة الملف المحدد.")
                        "locked" -> tr("Unlock the vault to store or anchor certificates.", "افتح الخزنة لحفظ الشهادات أو اعتمادها.")
                        else -> tr("The certificate could not be parsed.", "تعذر تحليل الشهادة.")
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = if (state.failed) KnouxColors.Alert else KnouxColors.Faint,
                )
            }
        } else {
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Details", "التفاصيل"))
                Spacer(Modifier.height(6.dp))
                InfoRow(tr("Subject", "الموضوع"), shorten(view.subject))
                InfoRow(tr("Issuer", "المنشئ"), shorten(view.issuer))
                InfoRow(tr("Valid From", "صالحة من"), formatTime(view.notBeforeMillis))
                InfoRow(tr("Valid To", "صالحة حتى"), formatTime(view.notAfterMillis))
                InfoRow(tr("Signature Algorithm", "خوارزمية التوقيع"), view.signatureAlgorithm)
                InfoRow(tr("Public key", "المفتاح العام"), "${view.publicKeyAlgorithm} ${view.publicKeyBits} bits")
                InfoRow(tr("Serial", "الرقم التسلسلي"), view.serialHex)
                InfoRow(
                    tr("Type", "النوع"),
                    if (view.isCa) {
                        tr("Certificate authority", "جهة إصدار شهادات")
                    } else {
                        tr("End entity", "كيان نهائي")
                    } + if (view.selfSigned) " · ${tr("self-signed", "موقعة ذاتيًا")}" else "",
                )
                if (view.subjectAlternativeNames.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        tr("Subject alternative names", "أسماء بديلة للموضوع"),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Violet,
                    )
                    view.subjectAlternativeNames.forEach { entry ->
                        Text(
                            "${entry.kind}: ${entry.value}",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = FontFamily.Monospace,
                            color = KnouxColors.Muted,
                        )
                    }
                }
                if (view.keyUsage.isNotEmpty() || view.criticalOids.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    InfoRow(
                        tr("Key usage", "استخدام المفتاح"),
                        view.keyUsage.joinToString().ifBlank { tr("none declared", "غير معلن") },
                    )
                    InfoRow(
                        tr("Critical extensions", "امتدادات حرجة"),
                        view.criticalOids.size.toString(),
                    )
                }
                if (view.accessLocations.isNotEmpty()) {
                    view.accessLocations.forEach { Text(it, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Faint) }
                }
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { viewModel.toggleFingerprint() }) {
                        Text(
                            if (state.showFingerprint) {
                                tr("Hide fingerprint", "أخفِ البصمة")
                            } else {
                                tr("View fingerprint", "اعرض البصمة")
                            },
                            color = KnouxColors.Violet,
                            fontSize = 11.sp,
                        )
                    }
                    TextButton(onClick = { viewModel.copyFingerprint(view.fingerprintSha256) }) {
                        Text(tr("Copy fingerprint", "انسخ البصمة"), color = KnouxColors.Violet, fontSize = 11.sp)
                    }
                }
                if (state.showFingerprint) {
                    Text(
                        view.fingerprintSha256,
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = FontFamily.Monospace,
                        color = KnouxColors.Text,
                    )
                }
            }
            Spacer(Modifier.height(10.dp))

            GlassCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SectionLabel(tr("Certificate chain", "سلسلة الشهادة"))
                    Spacer(Modifier.weight(1f))
                    val assessment = state.assessment
                    StatusPill(
                        text = when {
                            assessment == null -> tr("Not inspected yet", "لم تُفحص بعد")
                            assessment.chain is CertificateInspector.ChainOutcome.Trusted ->
                                tr("Chain reaches an anchor", "السلسلة تصل إلى مرساة")

                            else -> tr("Not trusted", "غير موثوقة")
                        },
                        tone = when {
                            assessment == null -> KnouxColors.Warn
                            assessment.chain is CertificateInspector.ChainOutcome.Trusted -> KnouxColors.Success
                            else -> KnouxColors.Alert
                        },
                    )
                }
                Spacer(Modifier.height(6.dp))
                val chainSubjects = state.assessment?.chain?.let {
                    when (it) {
                        is CertificateInspector.ChainOutcome.Trusted -> it.subjects
                        is CertificateInspector.ChainOutcome.Failed -> it.subjects
                    }
                }.orEmpty().ifEmpty { listOf(shorten(view.subject)) }
                chainSubjects.forEachIndexed { index, subject ->
                    ChainRow(
                        role = when {
                            index == 0 -> tr("End entity", "كيان نهائي")
                            index == chainSubjects.lastIndex -> tr("Root", "جذر")
                            else -> tr("Intermediate", "وسيط")
                        },
                        subject = subject,
                    )
                }
                state.assessment?.let { assessment ->
                    Spacer(Modifier.height(8.dp))
                    Text(
                        assessmentLine(assessment),
                        style = MaterialTheme.typography.bodySmall,
                        color = if (assessment.chain is CertificateInspector.ChainOutcome.Trusted) {
                            KnouxColors.Success
                        } else {
                            KnouxColors.Alert
                        },
                    )
                    Text(
                        tr(
                            "Trust policy: %s · Revocation: not checked (this build has no network permission).",
                            "سياسة الثقة: %s · السحب: غير مفحوص (لا يملك هذا البناء إذن شبكة).",
                        ).format(policyName(assessment.policy)),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Faint,
                    )
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    policyLabels.forEach { (choice, label) ->
                        val active = state.policy == choice
                        Surface(
                            shape = MaterialTheme.shapes.small,
                            color = if (active) KnouxColors.VioletDeep.copy(alpha = 0.32f) else Color(0x33150B24),
                            border = androidx.compose.foundation.BorderStroke(1.dp, if (active) KnouxColors.LineHot else KnouxColors.Line),
                        ) {
                            TextButton(onClick = { viewModel.setPolicy(choice) }) {
                                Text(label, color = if (active) KnouxColors.Text else KnouxColors.Faint, fontSize = 11.sp)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                KnouxTextField(
                    value = state.hostname,
                    onValueChange = { viewModel.setHostname(it) },
                    label = tr("Check this host name (identity)", "تحقق من اسم المضيف هذا (الهوية)"),
                )
                Spacer(Modifier.height(8.dp))
                KnouxPrimaryButton(
                    text = tr("Check chain", "افحص السلسلة"),
                    onClick = { viewModel.checkChain() },
                    enabled = !state.busy,
                )
                if (!unlocked) {
                    Spacer(Modifier.height(6.dp))
                    TextButton(onClick = onNeedUnlock) {
                        Text(
                            tr("Unlock the vault to use your own anchors", "افتح الخزنة لاستخدام مراسيك الخاصة"),
                            color = KnouxColors.Violet,
                            fontSize = 11.sp,
                        )
                    }
                }
            }
            Spacer(Modifier.height(10.dp))

            KnouxPrimaryButton(text = tr("Inspect Certificate", "افحص الشهادة"), onClick = { viewModel.inspect() })
            Spacer(Modifier.height(8.dp))
            if (unlocked) {
                GlassCard(Modifier.fillMaxWidth()) {
                    SectionLabel(tr("Store this certificate", "خزّن هذه الشهادة"))
                    Spacer(Modifier.height(6.dp))
                    KnouxTextField(importLabel, { importLabel = it }, tr("Label", "التسمية"))
                    Spacer(Modifier.height(8.dp))
                    KnouxGhostButton(tr("Import into the vault", "استورد إلى الخزنة"), {
                        viewModel.importCertificate(importLabel)
                        importLabel = ""
                    })
                    state.notice?.let {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            if (it == "imported") {
                                tr("Stored as an encrypted record.", "حُفظت كمسجل مشفر.")
                            } else {
                                tr("A certificate with this fingerprint is already stored.", "توجد شهادة بهذه البصمة محفوظة.")
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = KnouxColors.Violet,
                        )
                    }
                }
            }
        }

        if (state.stored.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Stored certificates", "الشهادات المحفوظة"))
                Spacer(Modifier.height(6.dp))
                state.stored.forEach { stored ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(stored.label, style = MaterialTheme.typography.bodyMedium, color = KnouxColors.Text)
                            Text(
                                shorten(stored.subject) + " · " +
                                    if (stored.isCa) tr("CA", "جهة إصدار") else tr("leaf", "ورقة"),
                                style = MaterialTheme.typography.labelSmall,
                                color = KnouxColors.Faint,
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            StatusPill(
                                text = if (stored.isAnchor) tr("Anchor", "مرساة") else tr("Stored", "محفوظة"),
                                tone = if (stored.isAnchor) KnouxColors.Success else KnouxColors.Muted,
                            )
                            Spacer(Modifier.height(2.dp))
                            Row {
                                TextButton(onClick = { viewModel.setAnchor(stored.id, !stored.isAnchor) }) {
                                    Text(
                                        if (stored.isAnchor) tr("Unanchor", "إلغاء الاعتماد") else tr("Anchor", "اعتماد"),
                                        color = KnouxColors.Violet,
                                        fontSize = 11.sp,
                                    )
                                }
                                TextButton(onClick = { viewModel.deleteCertificate(stored.id) }) {
                                    Text(tr("Delete", "حذف"), color = KnouxColors.Alert, fontSize = 11.sp)
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    tr(
                        "Marking a certificate as an anchor means you trust it. It is never done automatically, and it does not mean the certificate earned trust.",
                        "اعتماد الشهادة يعني أنك تثق بها. لا يحدث ذلك تلقائيًا، ولا يعني أن الشهادة اكتسبت الثقة.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Warn,
                )
            }
        }
        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun ChainRow(role: String, subject: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Surface(
            shape = MaterialTheme.shapes.small,
            color = Color(0x33150B24),
            border = androidx.compose.foundation.BorderStroke(1.dp, KnouxColors.Line),
        ) {
            Text(role, Modifier.padding(horizontal = 8.dp, vertical = 4.dp), fontSize = 10.sp, color = KnouxColors.Violet)
        }
        Spacer(Modifier.width(8.dp))
        Text(shorten(subject), style = MaterialTheme.typography.bodySmall, color = KnouxColors.Text)
    }
    Spacer(Modifier.height(4.dp))
}

@Composable
private fun assessmentLine(assessment: CertificateAssessment): String {
    val view = assessment.view
    val validity = when (assessment.validity) {
        CertificateInspector.ValidityState.CURRENT -> tr("within its validity window", "ضمن مدة صلاحيتها")
        CertificateInspector.ValidityState.EXPIRED -> tr("EXPIRED", "منتهية الصلاحية")
        CertificateInspector.ValidityState.NOT_YET_VALID -> tr("not valid yet", "ليست صالحة بعد")
    }
    val signature = when (assessment.signatureFromIssuer) {
        true -> tr("issuer signature verifies", "توقيع المنشئ صحيح")
        false -> tr("issuer signature does NOT verify", "توقيع المنشئ غير صحيح")
        null -> tr("issuer certificate not available", "شهادة المنشئ غير متوفرة")
    }
    val identity = when (assessment.hostnameMatches) {
        true -> tr("host name matches", "اسم المضيف مطابق")
        false -> tr("host name does NOT match", "اسم المضيف غير مطابق")
        null -> tr("no host name checked", "لم يُفحص اسم مضيف")
    }
    val chain = when (val outcome = assessment.chain) {
        is CertificateInspector.ChainOutcome.Trusted ->
            tr("chain reaches ${outcome.anchorSubject}", "السلسلة تصل إلى ${outcome.anchorSubject}")

        is CertificateInspector.ChainOutcome.Failed ->
            tr("chain rejected: ${outcome.reason.name.lowercase().replace('_', ' ')}", "السلسلة مرفوضة: ${outcome.reason.name.lowercase().replace('_', ' ')}")
    }
    return tr(
        "Parsed · $validity · $signature · $chain · $identity",
        "تم التحليل · $validity · $signature · $chain · $identity",
    )
}

@Composable
private fun policyName(policy: TrustPolicy): String = when (policy) {
    TrustPolicy.None -> tr("no anchors", "لا مراسي")
    TrustPolicy.StoredAnchors -> tr("certificates you marked", "الشهادات التي اعتمدتها")
    TrustPolicy.PlatformStore -> tr("the device trust store", "متجر ثقة الجهاز")
}

/** Keeps distinguished names readable in a narrow column without inventing text. */
internal fun shorten(dn: String): String = dn.replace(Regex("\\s*,\\s*"), ", ").take(120)
