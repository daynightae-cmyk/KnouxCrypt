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
import androidx.compose.runtime.setValue
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
import com.knoux.crypt.data.SignaturePayload
import com.knoux.crypt.data.SignatureStudio
import com.knoux.crypt.data.SigningKeyInfo
import com.knoux.crypt.data.SigningKeyOrigin
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
import com.knoux.crypt.security.DigitalSignatureService
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import java.io.ByteArrayOutputStream
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class StudioMode { SIGN, VERIFY }
enum class StudioOutput { DETACHED, ATTACHED }

enum class StudioStatus(val labelEn: String, val labelAr: String) {
    AWAITING("Awaiting input", "بانتظار الإدخال"),
    BUSY("Working…", "قيد التنفيذ…"),
    SIGNED("Signature generated", "أُنشئ التوقيع"),
    VERIFIED("Verification finished", "اكتمل التحقق"),
    REJECTED("Rejected. Nothing was written.", "رُفضت العملية. لم يُكتب أي شيء."),
    CANCELLED("Cancelled.", "أُلغيت العملية."),
    UNSUPPORTED("Not supported on this device.", "غير مدعوم على هذا الجهاز."),
    LOCKED("Unlock the vault first.", "افتح الخزنة أولًا."),
}

data class StudioUiState(
    val mode: StudioMode = StudioMode.SIGN,
    val output: StudioOutput = StudioOutput.DETACHED,
    val unlocked: Boolean = false,
    val documentUri: Uri? = null,
    val documentName: String = "",
    val documentSize: Long? = null,
    val packageUri: Uri? = null,
    val packageName: String = "",
    val label: String = "",
    val busy: Boolean = false,
    val status: StudioStatus = StudioStatus.AWAITING,
    val keyInfo: SigningKeyInfo? = null,
    val produced: SignatureStudio.Produced? = null,
    val report: SignatureStudio.Report? = null,
    val stored: List<SignaturePayload> = emptyList(),
    val detail: String? = null,
)

class SignatureStudioViewModel(application: Application, private val container: AppContainer) :
    AndroidViewModel(application) {

    private val _state = MutableStateFlow(StudioUiState())
    val state: StateFlow<StudioUiState> = _state.asStateFlow()
    private var documentBytes: ByteArray? = null
    private var packageBytes: ByteArray? = null

    init {
        container.session.addOnLockListener {
            documentBytes?.fill(0)
            packageBytes = null
            documentBytes = null
            _state.update {
                StudioUiState(
                    mode = it.mode,
                    output = it.output,
                    status = StudioStatus.LOCKED,
                    detail = "the vault is locked again",
                )
            }
        }
    }

    fun attach() {
        val access = container.session.currentAccess()
        if (access == null) {
            _state.update { it.copy(unlocked = false, status = StudioStatus.LOCKED) }
            return
        }
        _state.update { it.copy(unlocked = true) }
        viewModelScope.launch {
            runCatching { container.signatureStudio.observeStoredSignatures(access).collect { rows ->
                _state.update { it.copy(stored = rows) }
            } }
        }
        viewModelScope.launch {
            runCatching { container.signing.ensureKey() }
                .onSuccess { info -> _state.update { it.copy(keyInfo = info) } }
                .onFailure { failure ->
                    if (failure !is VaultLockedException) {
                        _state.update {
                            it.copy(status = StudioStatus.UNSUPPORTED, detail = failure.javaClass.simpleName)
                        }
                    }
                }
        }
    }

    fun setMode(mode: StudioMode) = _state.update {
        it.copy(mode = mode, status = StudioStatus.AWAITING, detail = null, report = null)
    }

    fun setOutput(output: StudioOutput) = _state.update {
        it.copy(output = output, produced = null, status = StudioStatus.AWAITING)
    }

    fun setLabel(label: String) = _state.update { it.copy(label = label.take(120)) }

    fun pickDocument(uri: Uri?) {
        if (uri == null) return
        viewModelScope.launch {
            _state.update { it.copy(busy = true, status = StudioStatus.BUSY) }
            val read = readLimited(uri, SignatureStudio.MAX_CONTENT_BYTES.toLong())
            _state.update { current ->
                if (read == null) {
                    current.copy(
                        busy = false,
                        status = StudioStatus.REJECTED,
                        documentUri = null,
                        documentName = "",
                        documentSize = null,
                        detail = "the file is empty or larger than the studio limit",
                    ).also { documentBytes = null }
                } else {
                    documentBytes = read.second
                    current.copy(
                        busy = false,
                        status = StudioStatus.AWAITING,
                        documentUri = uri,
                        documentName = read.first,
                        documentSize = read.second.size.toLong(),
                        produced = null,
                        report = null,
                        detail = null,
                    )
                }
            }
        }
    }

    fun pickPackage(uri: Uri?) {
        if (uri == null) return
        viewModelScope.launch {
            _state.update { it.copy(busy = true, status = StudioStatus.BUSY) }
            val read = readLimited(uri, SignatureStudio.MAX_CONTENT_BYTES.toLong())
            _state.update { current ->
                if (read == null) {
                    current.copy(busy = false, status = StudioStatus.REJECTED, packageUri = null, packageName = "")
                        .also { packageBytes = null }
                } else {
                    packageBytes = read.second
                    current.copy(
                        busy = false,
                        status = StudioStatus.AWAITING,
                        packageUri = uri,
                        packageName = read.first,
                        detail = null,
                    )
                }
            }
        }
    }

    fun sign() {
        val access = container.session.currentAccess()
        val content = documentBytes
        if (access == null) {
            _state.update { it.copy(status = StudioStatus.LOCKED) }
            return
        }
        if (content == null) {
            _state.update { it.copy(status = StudioStatus.REJECTED, detail = "choose a document first") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(busy = true, status = StudioStatus.BUSY, produced = null) }
            val outcome = runCatching {
                container.signatureStudio.sign(
                    content = content,
                    fileName = _state.value.documentName,
                    label = _state.value.label,
                    attached = _state.value.output == StudioOutput.ATTACHED,
                )
            }
            when (val result = outcome.getOrNull()) {
                is SignatureStudio.SignOutcome.Sealed -> _state.update {
                    it.copy(
                        busy = false,
                        status = StudioStatus.SIGNED,
                        produced = result.produced,
                        detail = null,
                    )
                }

                is SignatureStudio.SignOutcome.Failed -> _state.update {
                    it.copy(
                        busy = false,
                        status = if (result.failure == SignatureStudio.Failure.UNSUPPORTED) {
                            StudioStatus.UNSUPPORTED
                        } else {
                            StudioStatus.REJECTED
                        },
                        detail = result.detail,
                    )
                }

                null -> _state.update {
                    it.copy(
                        busy = false,
                        status = StudioStatus.UNSUPPORTED,
                        detail = outcome.exceptionOrNull()?.javaClass?.simpleName,
                    )
                }
            }
        }
    }

    fun verify() {
        val access = container.session.currentAccess()
        val pack = packageBytes
        if (access == null) {
            _state.update { it.copy(status = StudioStatus.LOCKED) }
            return
        }
        if (pack == null) {
            _state.update { it.copy(status = StudioStatus.REJECTED, detail = "choose a signature package first") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(busy = true, status = StudioStatus.BUSY, report = null) }
            val outcome = runCatching { container.signatureStudio.verify(pack, documentBytes) }
            val result = outcome.getOrNull()
            when {
                result is SignatureStudio.VerifyOutcome.Reported -> _state.update {
                    it.copy(busy = false, status = StudioStatus.VERIFIED, report = result.report, detail = null)
                }

                result is SignatureStudio.VerifyOutcome.Failed -> _state.update {
                    it.copy(
                        busy = false,
                        status = if (result.failure == SignatureStudio.Failure.UNSUPPORTED) {
                            StudioStatus.UNSUPPORTED
                        } else {
                            StudioStatus.REJECTED
                        },
                        detail = result.detail,
                    )
                }

                else -> _state.update {
                    it.copy(
                        busy = false,
                        status = StudioStatus.REJECTED,
                        detail = outcome.exceptionOrNull()?.javaClass?.simpleName,
                    )
                }
            }
        }
    }

    /** Stores the key embedded in the last report so future packages name it. */
    fun rememberSigner() {
        val access = container.session.currentAccess() ?: return
        val report = _state.value.report ?: return
        val pack = packageBytes ?: return
        viewModelScope.launch {
            val key = runCatching {
                com.knoux.crypt.security.SignaturePackage.decode(pack).publicKey()
            }.getOrNull() ?: return@launch
            container.signatureStudio.rememberSignerKey(access, report.fileName.ifBlank { "Signer key" }, key)
            verify()
        }
    }

    fun savePackageTo(uri: Uri?) {
        val produced = _state.value.produced ?: return
        if (uri == null) {
            _state.update { it.copy(status = StudioStatus.REJECTED, detail = "no destination was chosen") }
            return
        }
        val app = getApplication<Application>()
        viewModelScope.launch {
            _state.update { it.copy(busy = true) }
            val written = withContext(Dispatchers.IO) {
                runCatching {
                    app.contentResolver.openOutputStream(uri, "w").use { sink ->
                        requireNotNull(sink).write(produced.bytes)
                    }
                }.isSuccess
            }
            _state.update {
                it.copy(
                    busy = false,
                    status = if (written) StudioStatus.SIGNED else StudioStatus.REJECTED,
                    detail = if (written) null else "the destination could not be written",
                )
            }
        }
    }

    fun suggestedPackageName(): String {
        val base = _state.value.documentName.substringBeforeLast('.').ifBlank { "document" }
        val extension = if (_state.value.output == StudioOutput.ATTACHED) {
            SignatureStudio.ATTACHED_EXTENSION
        } else {
            SignatureStudio.DETACHED_EXTENSION
        }
        return "$base.$extension"
    }

    fun cancel() {
        _state.update { it.copy(busy = false, status = StudioStatus.CANCELLED) }
    }

    private suspend fun readLimited(uri: Uri, limit: Long): Pair<String, ByteArray>? = withContext(Dispatchers.IO) {
        val app = getApplication<Application>()
        val name = runCatching {
            app.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst() && cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME) >= 0) {
                    cursor.getString(0)
                } else {
                    null
                }
            }
        }.getOrNull() ?: "document"
        val output = ByteArrayOutputStream()
        return@withContext try {
            app.contentResolver.openInputStream(uri)?.use { input ->
                val chunk = ByteArray(64 * 1024)
                var total = 0L
                while (true) {
                    val read = input.read(chunk)
                    if (read < 0) break
                    total += read
                    if (total > limit) {
                        output.reset()
                        return@use null
                    }
                    output.write(chunk, 0, read)
                }
                if (total == 0L) null else name to output.toByteArray()
            }
        } catch (failure: IOException) {
            null
        } finally {
            output.reset()
        }
    }
}

/**
 * Signature Studio (TASK 38): sign a file, or verify a signature package.
 *
 * Everything cryptographic is delegated to the TASK 19 engine through
 * [SignatureStudio]; this screen's job is to show the algorithm and key origin
 * truthfully, and to keep "the signature is valid" and "the signer is known" as
 * two separate results.
 */
@Composable
fun SignatureStudioScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
) {
    val context = LocalContext.current
    val application = context.applicationContext as Application
    val viewModel: SignatureStudioViewModel = viewModel(
        factory = viewModelFactory { SignatureStudioViewModel(application, container) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    val unlocked by container.session.unlocked.collectAsStateWithLifecycle()

    val pickDocument = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        viewModel.pickDocument(uri)
    }
    val pickPackage = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        viewModel.pickPackage(uri)
    }
    val savePackage = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        viewModel.savePackageTo(uri)
    }

    LaunchedEffect(unlocked) { viewModel.attach() }

    val title = tr("Signature Studio", "استوديو التوقيع")
    if (!unlocked) {
        LockedScreen(title, onBack, onNeedUnlock)
        return
    }

    val signLabel = tr("Sign Document", "وقّع مستندًا")
    val verifyLabel = tr("Verify Signature", "تحقق من توقيع")
    val chooseDocumentLabel = tr("Choose document", "اختر مستندًا")
    val choosePackageLabel = tr("Choose signature package", "اختر حزمة توقيع")
    val saveLabel = tr("Save signature package", "احفظ حزمة التوقيع")
    val rememberLabel = tr("Remember this signer key", "تذكر مفتاح هذا الموقّع")
    val detachedLabel = tr("Detached .ksig", "منفصل ‎.ksig")
    val attachedLabel = tr("Attached .ksa", "مرفق ‎.ksa")
    val statusPill = when (state.status) {
        StudioStatus.AWAITING -> tr("Awaiting input", "بانتظار الإدخال")
        StudioStatus.BUSY -> tr("Working…", "قيد التنفيذ…")
        StudioStatus.SIGNED -> tr("Signed", "وُقّع")
        StudioStatus.VERIFIED -> tr("Checked", "فُحص")
        StudioStatus.REJECTED -> tr("Rejected", "مرفوض")
        StudioStatus.CANCELLED -> tr("Cancelled", "ملغى")
        StudioStatus.UNSUPPORTED -> tr("Unsupported", "غير مدعوم")
        StudioStatus.LOCKED -> tr("Locked", "مقفل")
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(title, onBack)
        Spacer(Modifier.height(6.dp))
        SectionLabel(tr("Key Forge / Signatures", "مصنع المفاتيح / التواقيع"))
        Spacer(Modifier.height(6.dp))
        Text(
            tr(
                "Sign files and verify integrity with public-key cryptography.",
                "وقّع الملفات وتحقق من سلامتها بالتشفير بالمفتاح العام.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Muted,
        )
        Spacer(Modifier.height(14.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                SectionLabel(tr("Signature operation", "عملية التوقيع"))
                Spacer(Modifier.weight(1f))
                StatusPill(statusPill, if (state.status == StudioStatus.SIGNED || state.status == StudioStatus.VERIFIED) KnouxColors.Success else KnouxColors.Warn)
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PanelButton(signLabel, state.mode == StudioMode.SIGN, { viewModel.setMode(StudioMode.SIGN) }, Modifier.weight(1f))
                PanelButton(verifyLabel, state.mode == StudioMode.VERIFY, { viewModel.setMode(StudioMode.VERIFY) }, Modifier.weight(1f))
            }
        }
        Spacer(Modifier.height(10.dp))

        if (state.mode == StudioMode.SIGN) {
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Document", "المستند"))
                Spacer(Modifier.height(6.dp))
                Text(
                    state.documentName.ifBlank { tr("No document selected", "لم يُختر مستند") },
                    style = MaterialTheme.typography.bodyMedium,
                    color = KnouxColors.Text,
                )
                Text(
                    state.documentSize?.let { formatBytes(it) }
                        ?: tr("Use the Android document picker", "استخدم منتقي مستندات أندرويد"),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
                Spacer(Modifier.height(8.dp))
                KnouxGhostButton(chooseDocumentLabel, { pickDocument.launch(arrayOf("*/*")) }, Modifier.fillMaxWidth())
            }
            Spacer(Modifier.height(10.dp))

            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Signing configuration", "إعدادات التوقيع"))
                Spacer(Modifier.height(6.dp))
                InfoRow(
                    tr("Algorithm", "الخوارزمية"),
                    state.keyInfo?.algorithm ?: tr("no key yet", "لا يوجد مفتاح بعد"),
                )
                InfoRow(
                    tr("Signing key", "مفتاح التوقيع"),
                    state.keyInfo?.let { info ->
                        val short = shortFingerprintOf(info.publicKeySpkiBase64)
                        (if (info.origin == SigningKeyOrigin.KEYSTORE) {
                            tr("Keystore-backed", "مدعوم بمخزن المفاتيح")
                        } else {
                            tr("Vault software key", "مفتاح برمجي في الخزنة")
                        }) + (if (short.isBlank()) "" else " · $short")
                    } ?: tr("requires key authorization", "يتطلب تفويض المفتاح"),
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PanelButton(detachedLabel, state.output == StudioOutput.DETACHED, { viewModel.setOutput(StudioOutput.DETACHED) }, Modifier.weight(1f))
                    PanelButton(attachedLabel, state.output == StudioOutput.ATTACHED, { viewModel.setOutput(StudioOutput.ATTACHED) }, Modifier.weight(1f))
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    if (state.output == StudioOutput.ATTACHED) {
                        tr(
                            "An attached package carries the document beside the signature. It proves origin and integrity; it does not encrypt anything.",
                            "الحزمة المرفقة تحمل المستند بجانب التوقيع. تثبت المصدر والسلامة لكنها لا تشفر شيئًا.",
                        )
                    } else {
                        tr(
                            "A detached package holds only the signature, the public key and the file record. The document stays where it is.",
                            "الحزمة المنفصلة تحمل التوقيع والمفتاح العام وسجل الملف فقط، ويبقى المستند في مكانه.",
                        )
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
                Spacer(Modifier.height(8.dp))
                KnouxTextField(state.label, { viewModel.setLabel(it) }, tr("Label (encrypted at rest)", "التسمية (مشفرة في التخزين)"))
            }
            Spacer(Modifier.height(10.dp))

            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Operation receipt", "سجل العملية"))
                Spacer(Modifier.height(6.dp))
                val produced = state.produced
                if (produced == null) {
                    Text(
                        tr("No signature generated", "لم يُنشأ أي توقيع"),
                        style = MaterialTheme.typography.bodySmall,
                        color = KnouxColors.Faint,
                    )
                    Text(
                        tr("Verification must run after signing.", "يجري التحقق بعد التوقيع."),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Faint,
                    )
                } else {
                    InfoRow(tr("SHA-256 of file", "SHA-256 للملف"), produced.digestHex.take(32) + "…")
                    InfoRow(tr("Signer", "الموقّع"), groupedFingerprint(produced.signerFingerprint).take(24) + "…")
                    InfoRow(tr("Package size", "حجم الحزمة"), formatBytes(produced.bytes.size.toLong()))
                    InfoRow(
                        tr("Key origin", "أصل المفتاح"),
                        if (produced.origin == SigningKeyOrigin.KEYSTORE) {
                            tr("Keystore", "مخزن المفاتيح")
                        } else {
                            tr("Vault software", "برمجي في الخزنة")
                        },
                    )
                    Spacer(Modifier.height(8.dp))
                    KnouxPrimaryButton(saveLabel, { savePackage.launch(viewModel.suggestedPackageName()) })
                }
            }
            Spacer(Modifier.height(10.dp))
            KnouxPrimaryButton(
                text = tr("Sign document", "وقّع المستند"),
                onClick = { viewModel.sign() },
                enabled = state.documentUri != null && !state.busy,
            )
        } else {
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Inputs", "المدخلات"))
                Spacer(Modifier.height(6.dp))
                val documentHint = if (state.documentName.isBlank()) {
                    tr("Detached packages also need the original document.", "الحزم المنفصلة تحتاج المستند الأصلي أيضًا.")
                } else {
                    tr("Document", "المستند") + ": " + state.documentName + " · " +
                        formatBytes(state.documentSize ?: 0L)
                }
                Text(
                    state.packageName.ifBlank { tr("No package selected", "لم تُختر حزمة") },
                    style = MaterialTheme.typography.bodyMedium,
                    color = KnouxColors.Text,
                )
                Text(
                    documentHint,
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    KnouxGhostButton(choosePackageLabel, { pickPackage.launch(arrayOf("*/*")) }, Modifier.weight(1f))
                    KnouxGhostButton(chooseDocumentLabel, { pickDocument.launch(arrayOf("*/*")) }, Modifier.weight(1f))
                }
            }
            Spacer(Modifier.height(10.dp))

            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Verification result", "نتيجة التحقق"))
                Spacer(Modifier.height(6.dp))
                val report = state.report
                if (report == null) {
                    Text(
                        tr("Nothing verified yet.", "لم يتحقق شيء بعد."),
                        style = MaterialTheme.typography.bodySmall,
                        color = KnouxColors.Faint,
                    )
                } else {
                    val verdictColor = if (report.signatureValid) KnouxColors.Success else KnouxColors.Alert
                    Text(
                        tr("Signature", "التوقيع") + ": " + verdictText(report.verdict),
                        style = MaterialTheme.typography.bodyMedium,
                        color = verdictColor,
                    )
                    val recognisedText = if (report.signerRecognised) {
                        tr(
                            "Signer key: stored here as “${report.recognisedAs}”",
                            "مفتاح الموقّع: محفوظ هنا باسم «${report.recognisedAs}»",
                        )
                    } else {
                        tr(
                            "Signer key: valid, but not a key this device has stored",
                            "مفتاح الموقّع: صحيح لكنه ليس مفتاحًا محفوظًا على هذا الجهاز",
                        )
                    }
                    Text(
                        recognisedText,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (report.signerRecognised) KnouxColors.Violet else KnouxColors.Warn,
                    )
                    Spacer(Modifier.height(6.dp))
                    InfoRow(tr("File", "الملف"), report.fileName)
                    InfoRow(tr("Algorithm", "الخوارزمية"), report.algorithm)
                    InfoRow(tr("SHA-256", "SHA-256"), report.digestHex.take(32) + "…")
                    InfoRow(tr("Signer fingerprint", "بصمة الموقّع"), groupedFingerprint(report.signerFingerprint))
                    InfoRow(
                        tr("Recorded size", "الحجم المسجل"),
                        "${report.recordedSize?.let { formatBytes(it) } ?: "—"} / ${formatBytes(report.actualSize)}",
                    )
                    Spacer(Modifier.height(6.dp))
                    KnouxGhostButton(rememberLabel, { viewModel.rememberSigner() }, enabled = !report.signerRecognised)
                }
            }
            Spacer(Modifier.height(10.dp))
            KnouxPrimaryButton(
                text = tr("Verify signature", "تحقق من التوقيع"),
                onClick = { viewModel.verify() },
                enabled = state.packageUri != null,
            )
        }

        Spacer(Modifier.height(10.dp))
        Surface(
            Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.medium,
            color = Color(0x26FFB86B),
            border = androidx.compose.foundation.BorderStroke(1.dp, KnouxColors.Warn),
        ) {
            Text(
                tr(
                    "A signature confirms possession of a key, not the real-world identity of its owner.",
                    "التوقيع يثبت حيازة مفتاح، لا الهوية الحقيقية لصاحبه.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Warn,
                modifier = Modifier.padding(12.dp),
            )
        }
        state.detail?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Alert, fontFamily = FontFamily.Monospace)
        }
        if (state.stored.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Stored signatures", "التواقيع المحفوظة"))
                Spacer(Modifier.height(6.dp))
                state.stored.take(8).forEach { receipt ->
                    InfoRow(receipt.label, receipt.digestHex.take(16) + "…")
                }
            }
        }
        Spacer(Modifier.height(28.dp))
    }
}

/** First two fingerprint blocks of a base64 SPKI, or empty when it cannot be read. */
internal fun shortFingerprintOf(spkiBase64: String): String = runCatching {
    val der = java.util.Base64.getMimeDecoder().decode(spkiBase64.trim())
    groupedFingerprint(com.knoux.crypt.security.KeyFingerprint.ofSpki(der))
}.getOrDefault("").take(12)

@Composable
private fun PanelButton(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = if (selected) KnouxColors.VioletDeep.copy(alpha = 0.35f) else Color(0x33150B24),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) KnouxColors.LineHot else KnouxColors.Line),
    ) {
        TextButton(onClick = onClick) {
            Text(text, color = if (selected) KnouxColors.Text else KnouxColors.Faint, fontSize = 12.sp)
        }
    }
}

@Composable
private fun verdictText(verdict: DigitalSignatureService.Verdict): String = when (verdict) {
    DigitalSignatureService.Verdict.VALID -> tr("valid for these bytes", "صحيح لهذه البيانات")
    DigitalSignatureService.Verdict.INVALID_SIGNATURE -> tr("invalid: the signature does not match", "غير صحيح: التوقيع لا يطابق")
    DigitalSignatureService.Verdict.DIGEST_MISMATCH -> tr("digest mismatch: this is not the signed file", "تباين التجزئة: هذا ليس الملف الموقّع")
    DigitalSignatureService.Verdict.MALFORMED -> tr("malformed package", "حزمة تالفة")
}
