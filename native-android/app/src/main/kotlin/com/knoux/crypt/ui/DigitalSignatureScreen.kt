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
import androidx.compose.foundation.layout.imePadding
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.SecretKinds
import com.knoux.crypt.data.SecretsJson
import com.knoux.crypt.data.SignaturePayload
import com.knoux.crypt.data.SigningKeyOrigin
import com.knoux.crypt.data.SignedArtifact
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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class SignatureRunStatus { IDLE, SIGNING, READY, FAILED }

data class StoredSignature(val id: String, val payload: SignaturePayload)

data class DigitalSignatureUiState(
    val status: SignatureRunStatus = SignatureRunStatus.IDLE,
    val records: List<StoredSignature> = emptyList(),
    val lastArtifact: SignedArtifact? = null,
    val verdict: DigitalSignatureService.Verdict? = null,
    val verdictScope: String? = null,
    val message: String? = null,
)

/**
 * TASK 19 — detached signatures over text.
 *
 * Signing uses the Keystore EC P-256 key; the private half never leaves the
 * platform. A stored record keeps the signature, the digest and the public
 * key, never the signed document. Verification states are explicit: a valid
 * signature proves possession of the matching key and nothing more.
 */
class DigitalSignatureViewModel(
    application: Application,
    private val container: AppContainer,
) : AndroidViewModel(application) {
    private val _state = MutableStateFlow(DigitalSignatureUiState())
    val state: StateFlow<DigitalSignatureUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            container.session.unlocked.collect { unlocked ->
                if (!unlocked) _state.value = DigitalSignatureUiState()
            }
        }
        observe()
    }

    private fun observe() {
        val access = container.session.currentAccess() ?: return
        viewModelScope.launch {
            runCatching { container.secrets.observe(access, SecretKinds.SIGNATURE).collect { rows ->
                val decoded = rows.mapNotNull { record ->
                    record.payloadJson
                        .takeUnless { record.decryptionFailed }
                        ?.let { SecretsJson.decodeSignature(it) }
                        ?.let { StoredSignature(record.id, it) }
                }
                _state.update { it.copy(records = decoded) }
            } }.onFailure { failure ->
                if (failure is VaultLockedException) _state.value = DigitalSignatureUiState()
            }
        }
    }

    fun sign(label: String, content: String) {
        val access = container.session.currentAccess()
        if (access == null) {
            _state.update { it.copy(status = SignatureRunStatus.FAILED, message = "LOCKED") }
            return
        }
        _state.update { it.copy(status = SignatureRunStatus.SIGNING, message = null, verdict = null) }
        viewModelScope.launch {
            try {
                val artifact = container.signing.sign(content.toByteArray(Charsets.UTF_8))
                container.secrets.save(
                    access,
                    SecretKinds.SIGNATURE,
                    null,
                    SecretsJson.encodeSignature(
                        SignaturePayload(
                            label = label.ifBlank { "Signed text" },
                            algorithm = artifact.algorithm,
                            publicKeySpkiBase64 = artifact.publicKeySpkiBase64,
                            signatureBase64 = artifact.signatureBase64,
                            digestHex = artifact.digestHex,
                            createdAt = System.currentTimeMillis(),
                        ),
                    ),
                )
                _state.update {
                    it.copy(status = SignatureRunStatus.READY, lastArtifact = artifact, verdict = null)
                }
            } catch (_: VaultLockedException) {
                _state.update { it.copy(status = SignatureRunStatus.FAILED, message = "LOCKED") }
            } catch (failure: Exception) {
                _state.update {
                    it.copy(status = SignatureRunStatus.FAILED, message = failure.message ?: "SIGN_FAILED")
                }
            }
        }
    }

    fun verifyStored(record: StoredSignature, content: String) {
        val publicKey = DigitalSignatureService.publicKeyFromBase64(record.payload.publicKeySpkiBase64)
        val signature = DigitalSignatureService.signatureFromBase64(record.payload.signatureBase64)
        if (publicKey == null || signature == null) {
            _state.update { it.copy(verdict = DigitalSignatureService.Verdict.MALFORMED, verdictScope = record.payload.label) }
            return
        }
        val verdict = DigitalSignatureService.verify(
            content = content.toByteArray(Charsets.UTF_8),
            publicKey = publicKey,
            signature = signature,
            algorithm = record.payload.algorithm,
            expectedDigestHex = record.payload.digestHex,
        )
        _state.update { it.copy(verdict = verdict, verdictScope = record.payload.label) }
    }

    fun verifyExternal(publicKeyBase64: String, signatureBase64: String, content: String) {
        val publicKey = DigitalSignatureService.publicKeyFromBase64(publicKeyBase64)
        val signature = DigitalSignatureService.signatureFromBase64(signatureBase64)
        if (publicKey == null || signature == null) {
            _state.update {
                it.copy(verdict = DigitalSignatureService.Verdict.MALFORMED, verdictScope = null)
            }
            return
        }
        val verdict = DigitalSignatureService.verify(
            content = content.toByteArray(Charsets.UTF_8),
            publicKey = publicKey,
            signature = signature,
            algorithm = DigitalSignatureService.algorithmFor(publicKey),
        )
        _state.update { it.copy(verdict = verdict, verdictScope = null) }
    }

    fun clearVerdict() = _state.update { it.copy(verdict = null, verdictScope = null) }
}

@Composable
fun DigitalSignatureScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
) {
    if (container.session.currentAccess() == null) {
        LockedScreen(tr("Digital Signature", "التوقيع الرقمي"), onBack, onNeedUnlock)
        return
    }
    val application = LocalContext.current.applicationContext as Application
    val viewModel: DigitalSignatureViewModel = viewModel(
        factory = viewModelFactory { DigitalSignatureViewModel(application, container) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()

    var label by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    var verifyTarget by remember { mutableStateOf<StoredSignature?>(null) }
    var verifyText by remember { mutableStateOf("") }
    var externalKey by remember { mutableStateOf("") }
    var externalSignature by remember { mutableStateOf("") }
    var externalContent by remember { mutableStateOf("") }
    var copied by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Digital Signature", "التوقيع الرقمي"), onBack)
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "Detached signatures over SHA-256. The algorithm follows what this device's Keystore supports: EC P-256 when available, RSA-2048 otherwise. The private key never leaves the Keystore; only the public key and the signature are exportable. A valid signature proves possession of the matching key — it does not prove who owns it.",
                "توقيعات منفصلة على SHA-256. تتبع الخوارزمية ما يدعمه Keystore في هذا الجهاز: EC P-256 إن توفر، وإلا RSA-2048. لا يغادر المفتاح الخاص Keystore أبدًا؛ ولا يُصدَّر سوى المفتاح العام والتوقيع. التوقيع الصحيح يثبت ملكية المفتاح المطابق، ولا يثبت هوية مالكه.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(10.dp))

        if (state.status == SignatureRunStatus.SIGNING) {
            LinearProgressIndicator(Modifier.fillMaxWidth(), color = KnouxColors.Violet)
            Spacer(Modifier.height(8.dp))
        }
        state.message?.let {
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(6.dp))
        }

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Sign text", "توقيع نص"))
            Spacer(Modifier.height(6.dp))
            KnouxTextField(label, { label = it }, tr("Label", "التسمية"), singleLine = true)
            Spacer(Modifier.height(6.dp))
            KnouxTextField(content, { content = it }, tr("Text to sign", "النص المراد توقيعه"), minLines = 3)
            Spacer(Modifier.height(8.dp))
            KnouxPrimaryButton(
                text = tr("Sign and store", "وقّع واحفظ"),
                onClick = { viewModel.sign(label, content) },
                enabled = content.isNotBlank() && state.status != SignatureRunStatus.SIGNING,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                tr(
                    "The signed text itself is not stored: the record keeps the signature, the digest and the public key.",
                    "لا يُخزَّن النص الموقَّع نفسه: يحتفظ السجل بالتوقيع والبصمة والمفتاح العام.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
        }
        Spacer(Modifier.height(10.dp))

        state.lastArtifact?.let { artifact ->
            GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Success.copy(alpha = 0.35f)) {
                SectionLabel(tr("Latest signature", "آخر توقيع"))
                InfoRow(tr("Algorithm", "الخوارزمية"), artifact.algorithm)
                InfoRow(
                    tr("Key storage", "تخزين المفتاح"),
                    when (artifact.origin) {
                        SigningKeyOrigin.KEYSTORE ->
                            tr("Android Keystore (as reported by the platform)", "Keystore في أندرويد (كما يبلّغ عنه النظام)")
                        SigningKeyOrigin.VAULT_SOFTWARE ->
                            tr("Vault-encrypted software key (not hardware-backed)", "مفتاح برمجي مشفّر في الخزنة (غير مدعوم عتاديًا)")
                    },
                )
                InfoRow(tr("Digest (SHA-256)", "البصمة (SHA-256)"), artifact.digestHex)
                InfoRow(
                    tr("Signature (base64)", "التوقيع (base64)"),
                    artifact.signatureBase64.take(44) + "…",
                )
                InfoRow(
                    tr("Public key (base64 SPKI)", "المفتاح العام (base64 SPKI)"),
                    artifact.publicKeySpkiBase64.take(44) + "…",
                )
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = {
                        scopeCopy(scope, container, artifact.publicKeySpkiBase64) { copied = "key" }
                    }) { Text(tr("Copy public key", "نسخ المفتاح العام"), color = KnouxColors.Violet, fontSize = 11.sp) }
                    TextButton(onClick = {
                        scopeCopy(scope, container, artifact.signatureBase64) { copied = "signature" }
                    }) { Text(tr("Copy signature", "نسخ التوقيع"), color = KnouxColors.Violet, fontSize = 11.sp) }
                }
                copied?.let {
                    Text(
                        tr("Copied under the clipboard policy.", "تم النسخ وفق سياسة الحافظة."),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Success,
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
        }

        state.verdict?.let { verdict ->
            GlassCard(
                Modifier.fillMaxWidth(),
                borderColor = when (verdict) {
                    DigitalSignatureService.Verdict.VALID -> KnouxColors.Success.copy(alpha = 0.45f)
                    DigitalSignatureService.Verdict.DIGEST_MISMATCH -> KnouxColors.Warn.copy(alpha = 0.45f)
                    else -> KnouxColors.Alert.copy(alpha = 0.45f)
                },
            ) {
                SectionLabel(tr("Verification", "التحقق"))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StatusPill(
                        text = verdictLabel(verdict),
                        tone = when (verdict) {
                            DigitalSignatureService.Verdict.VALID -> KnouxColors.Success
                            DigitalSignatureService.Verdict.DIGEST_MISMATCH -> KnouxColors.Warn
                            else -> KnouxColors.Alert
                        },
                    )
                    state.verdictScope?.let {
                        Spacer(Modifier.width(6.dp))
                        Text(it, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Muted)
                    }
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    verdictExplanation(verdict),
                    style = MaterialTheme.typography.bodySmall,
                )
                TextButton(onClick = { viewModel.clearVerdict() }) {
                    Text(tr("Dismiss", "إغلاق"), color = KnouxColors.Violet, fontSize = 11.sp)
                }
            }
            Spacer(Modifier.height(10.dp))
        }

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Stored signatures", "التوقيعات المخزنة"))
            Spacer(Modifier.height(6.dp))
            if (state.records.isEmpty()) {
                Text(
                    tr("No signature stored yet.", "لا يوجد توقيع مخزن بعد."),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            state.records.forEach { record ->
                InfoRow(record.payload.label, record.payload.digestHex.take(16) + "…")
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = {
                        verifyTarget = record
                        verifyText = ""
                    }) { Text(tr("Verify", "تحقق"), color = KnouxColors.Violet, fontSize = 11.sp) }
                    TextButton(onClick = {
                        scopeCopy(scope, container, record.payload.publicKeySpkiBase64) { copied = "key" }
                    }) { Text(tr("Copy public key", "نسخ المفتاح العام"), color = KnouxColors.Violet, fontSize = 11.sp) }
                    TextButton(onClick = {
                        scopeCopy(scope, container, record.payload.signatureBase64) { copied = "signature" }
                    }) { Text(tr("Copy signature", "نسخ التوقيع"), color = KnouxColors.Violet, fontSize = 11.sp) }
                }
            }
        }
        Spacer(Modifier.height(10.dp))

        verifyTarget?.let { target ->
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Verify against text", "التحقق من نص"))
                Text(
                    tr(
                        "Paste the exact signed text. A digest mismatch means the content changed; a broken signature means the key does not match.",
                        "الصق النص الموقَّع كما هو. اختلاف البصمة يعني أن المحتوى تغيّر؛ وبطلان التوقيع يعني أن المفتاح لا يطابق.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
                Spacer(Modifier.height(6.dp))
                KnouxTextField(verifyText, { verifyText = it }, tr("Signed text", "النص الموقَّع"), minLines = 3)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    KnouxPrimaryButton(
                        text = tr("Verify", "تحقق"),
                        onClick = { viewModel.verifyStored(target, verifyText) },
                        enabled = verifyText.isNotBlank(),
                    )
                    KnouxGhostButton(tr("Close", "إغلاق"), { verifyTarget = null })
                }
            }
            Spacer(Modifier.height(10.dp))
        }

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Verify an external signature", "التحقق من توقيع خارجي"))
            Spacer(Modifier.height(6.dp))
            KnouxTextField(externalKey, { externalKey = it }, tr("Public key (base64 SPKI)", "المفتاح العام (base64 SPKI)"))
            Spacer(Modifier.height(6.dp))
            KnouxTextField(externalSignature, { externalSignature = it }, tr("Signature (base64)", "التوقيع (base64)"))
            Spacer(Modifier.height(6.dp))
            KnouxTextField(externalContent, { externalContent = it }, tr("Signed text", "النص الموقَّع"), minLines = 3)
            Spacer(Modifier.height(8.dp))
            KnouxPrimaryButton(
                text = tr("Verify external signature", "تحقق من توقيع خارجي"),
                onClick = { viewModel.verifyExternal(externalKey, externalSignature, externalContent) },
                enabled = externalKey.isNotBlank() && externalSignature.isNotBlank() && externalContent.isNotBlank(),
            )
        }
        Spacer(Modifier.height(10.dp))

        GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Warn.copy(alpha = 0.4f)) {
            SectionLabel(tr("Limits", "الحدود"))
            Text(
                tr(
                    "Signatures are made over the SHA-256 digest of the content; a stored record never keeps the signed document. Verification proves that the content matches a signature made with the matching private key. It does not establish the signer's identity, and this build makes no attestation about the device or the key.",
                    "تُوقَّع البصمة SHA-256 للمحتوى؛ ولا يحتفظ أي سجل بالنص الموقَّع. يثبت التحقق تطابق المحتوى مع توقيع أُنشئ بالمفتاح الخاص المطابق، ولا يثبت هوية الموقِّع، ولا يقدّم هذا البناء أي إثبات عن الجهاز أو المفتاح.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
        }
        Spacer(Modifier.height(24.dp))
    }
}

private fun scopeCopy(
    scope: kotlinx.coroutines.CoroutineScope,
    container: AppContainer,
    value: String,
    onDone: () -> Unit,
) {
    scope.launch {
        container.clipboard.copySensitive(value, "KNOUX signature material")
        onDone()
    }
}

@Composable
private fun verdictLabel(verdict: DigitalSignatureService.Verdict): String = when (verdict) {
    DigitalSignatureService.Verdict.VALID -> tr("Valid", "صالح")
    DigitalSignatureService.Verdict.DIGEST_MISMATCH -> tr("Content changed", "تغيّر المحتوى")
    DigitalSignatureService.Verdict.INVALID_SIGNATURE -> tr("Invalid signature", "توقيع غير صالح")
    DigitalSignatureService.Verdict.MALFORMED -> tr("Malformed", "مشطوب")
}

@Composable
private fun verdictExplanation(verdict: DigitalSignatureService.Verdict): String = when (verdict) {
    DigitalSignatureService.Verdict.VALID ->
        tr(
            "The content matches the digest that was signed, and the signature verifies with the stored public key.",
            "يطابق المحتوى البصمة التي وقّعت، ويتحقق التوقيع بالمفتاح العام المخزن.",
        )
    DigitalSignatureService.Verdict.DIGEST_MISMATCH ->
        tr(
            "The content no longer matches the digest that was signed, so the text was changed after signing.",
            "لم يعد المحتوى يطابق البصمة التي وقّعت، أي أن النص تغيّر بعد التوقيع.",
        )
    DigitalSignatureService.Verdict.INVALID_SIGNATURE ->
        tr(
            "The signature does not verify with this key. The content, the signature or the key may be wrong.",
            "لا يتحقق التوقيع بهذا المفتاح. قد يكون المحتوى أو التوقيع أو المفتاح خاطئًا.",
        )
    DigitalSignatureService.Verdict.MALFORMED ->
        tr(
            "The key or signature could not be parsed, so nothing was verified.",
            "تعذر تحليل المفتاح أو التوقيع، لذلك لم يُتحقق من شيء.",
        )
}
