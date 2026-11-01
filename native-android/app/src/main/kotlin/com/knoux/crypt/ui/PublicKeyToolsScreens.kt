package com.knoux.crypt.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.PublicKeyPayload
import com.knoux.crypt.data.SecretKinds
import com.knoux.crypt.data.SecretsJson
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
import com.knoux.crypt.security.KeyFingerprint
import com.knoux.crypt.tr
import kotlinx.coroutines.launch

/**
 * Fingerprint comparison for public keys (TASK 23).
 *
 * The fingerprint is the SSH-style SHA-256 of the key's SPKI encoding, so two
 * people can compare a short string instead of a long key. It identifies a
 * public key only; nothing here can fingerprint a secret.
 */
@Composable
fun FingerprintVerifyScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
) {
    if (container.session.currentAccess() == null) {
        LockedScreen(tr("Fingerprint Verify", "التحقق من البصمة"), onBack, onNeedUnlock)
        return
    }
    val scope = rememberCoroutineScope()
    var ownFingerprint by remember { mutableStateOf("") }
    var ownPublicKey by remember { mutableStateOf("") }
    var stored by remember { mutableStateOf<List<PublicKeyPayload>>(emptyList()) }
    var comparison by remember { mutableStateOf("") }
    var comparisonLabel by remember { mutableStateOf("") }
    var importLabel by remember { mutableStateOf("") }
    var importKey by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }

    val compareLabel = tr("Compare", "قارن")
    val unreadableInput = tr("Unreadable input", "إدخال غير قابل للقراءة")
    val noSigningKeyYet = tr("This device has no signing key yet", "لا يوجد مفتاح توقيع على هذا الجهاز بعد")
    val matchLabel = tr("Match", "مطابقة")
    val noMatchLabel = tr("No match", "غير مطابق")
    val storeKeyLabel = tr("Store public key", "احفظ المفتاح العام")
    val importedKeyLabel = tr("Imported key", "مفتاح مستورد")
    val keyParseError = tr("The key could not be parsed.", "تعذر تحليل المفتاح.")

    LaunchedEffect(Unit) {
        val base64 = runCatching { container.signing.publicKeyBase64() }.getOrNull()
        ownPublicKey = base64.orEmpty()
        val publicKey = base64?.let { DigitalSignatureService.publicKeyFromBase64(it) }
        ownFingerprint = publicKey?.let { KeyFingerprint.of(it) }.orEmpty()
        val access = container.session.currentAccess()
        if (access != null) {
            runCatching { container.secrets.observe(access, SecretKinds.PUBLIC_KEY).collect { rows ->
                stored = rows.mapNotNull { row ->
                    row.payloadJson.takeUnless { row.decryptionFailed }?.let { SecretsJson.decodePublicKey(it) }
                }
            } }.onFailure { }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Fingerprint Verify", "التحقق من البصمة"), onBack)
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "A fingerprint identifies a public key so two people can compare one short string. It never identifies a secret, and it proves nothing on its own.",
                "البصمة تعرّف مفتاحًا عامًا ليقارن شخصان سلسلة قصيرة. لا تعرّف أي سر، ولا تثبت شيئًا بذاتها.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(10.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("This device's signing key", "مفتاح التوقيع لهذا الجهاز"))
            Spacer(Modifier.height(6.dp))
            if (ownFingerprint.isEmpty()) {
                Text(
                    tr("The signing key is not available yet.", "مفتاح التوقيع غير متاح بعد."),
                    style = MaterialTheme.typography.bodySmall,
                    color = KnouxColors.Warn,
                )
            } else {
                Text(ownFingerprint, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Text)
                Spacer(Modifier.height(6.dp))
                TextButton(onClick = {
                    scope.launch { container.clipboard.copySensitive(ownFingerprint, "KNOUX key fingerprint") }
                }) { Text(tr("Copy fingerprint", "نسخ البصمة"), color = KnouxColors.Violet, fontSize = 11.sp) }
            }
        }
        Spacer(Modifier.height(10.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Compare with another key", "قارن بمفتاح آخر"))
            Spacer(Modifier.height(6.dp))
            KnouxTextField(comparison, { comparison = it }, tr("Fingerprint or public key (base64)", "البصمة أو المفتاح العام (base64)"), minLines = 2)
            Spacer(Modifier.height(8.dp))
            KnouxPrimaryButton(
                text = compareLabel,
                onClick = {
                    val candidate = resolveFingerprint(comparison)
                    comparisonLabel = when {
                        candidate == null -> unreadableInput
                        ownFingerprint.isEmpty() -> noSigningKeyYet
                        KeyFingerprint.matches(ownFingerprint, candidate) -> matchLabel
                        else -> noMatchLabel
                    }
                },
                enabled = comparison.isNotBlank(),
            )
            if (comparisonLabel.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(comparisonLabel, style = MaterialTheme.typography.bodyMedium, color = KnouxColors.Violet)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                tr(
                    "Paste the other side's fingerprint (SHA256:…) or its base64 public key. A mismatch means the keys differ, not that either one is hostile.",
                    "الصق بصمة الطرف الآخر (SHA256:…) أو مفتاحه العام بصيغة base64. الاختلاف يعني أن المفتاحين مختلفان، لا أن أحدهما معادٍ.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
        }
        Spacer(Modifier.height(10.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Stored public keys", "المفاتيح العامة المخزنة"))
            Spacer(Modifier.height(6.dp))
            if (stored.isEmpty()) {
                Text(
                    tr("No public key stored yet.", "لا يوجد مفتاح عام مخزن بعد."),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            stored.forEach { key ->
                InfoRow(key.label, key.fingerprint)
                TextButton(onClick = {
                    scope.launch { container.clipboard.copySensitive(key.fingerprint, "KNOUX key fingerprint") }
                }) { Text(tr("Copy fingerprint", "نسخ البصمة"), color = KnouxColors.Violet, fontSize = 11.sp) }
            }
            Spacer(Modifier.height(6.dp))
            KnouxTextField(importLabel, { importLabel = it }, tr("Label", "التسمية"), singleLine = true)
            Spacer(Modifier.height(6.dp))
            KnouxTextField(importKey, { importKey = it }, tr("Public key (base64 SPKI)", "المفتاح العام (base64 SPKI)"), minLines = 2)
            Spacer(Modifier.height(8.dp))
            KnouxGhostButton(
                storeKeyLabel,
                {
                    val access = container.session.currentAccess()
                    val publicKey = DigitalSignatureService.publicKeyFromBase64(importKey.trim())
                    if (access == null || publicKey == null) {
                        message = keyParseError
                    } else {
                        scope.launch {
                            container.secrets.save(
                                access,
                                SecretKinds.PUBLIC_KEY,
                                null,
                                SecretsJson.encodePublicKey(
                                    PublicKeyPayload(
                                        label = importLabel.trim().ifBlank { importedKeyLabel },
                                        spkiBase64 = importKey.trim(),
                                        fingerprint = KeyFingerprint.of(publicKey),
                                        origin = "imported",
                                        createdAt = System.currentTimeMillis(),
                                    ),
                                ),
                            )
                            importKey = ""
                            importLabel = ""
                        }
                    }
                },
                enabled = importKey.isNotBlank(),
            )
            message?.let {
                Spacer(Modifier.height(6.dp))
                Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.labelSmall)
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

/**
 * Public-key QR (TASK 28): the approved key rendered as a scannable code that
 * carries the key and its fingerprint, plus the plain text for copy/paste.
 */
@Composable
fun PublicKeyQrScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
) {
    if (container.session.currentAccess() == null) {
        LockedScreen(tr("Public Key QR", "رمز المفتاح العام"), onBack, onNeedUnlock)
        return
    }
    val scope = rememberCoroutineScope()
    var publicKeyBase64 by remember { mutableStateOf("") }
    var fingerprint by remember { mutableStateOf("") }
    var label by remember { mutableStateOf("KNOUX signing key") }

    LaunchedEffect(Unit) {
        val base64 = runCatching { container.signing.publicKeyBase64() }.getOrNull()
        publicKeyBase64 = base64.orEmpty()
        val publicKey = base64?.let { DigitalSignatureService.publicKeyFromBase64(it) }
        fingerprint = publicKey?.let { KeyFingerprint.of(it) }.orEmpty()
    }

    val uri = remember(publicKeyBase64, label) {
        if (publicKeyBase64.isBlank()) "" else KeyFingerprint.uriFor(label, publicKeyBase64)
    }
    val bitmap = remember(uri) { if (uri.isBlank()) null else encodeQrBitmap(uri, 720) }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Public Key QR", "رمز المفتاح العام"), onBack)
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "The code carries this device's public key and its fingerprint. Scanning it reveals a public key only — never a secret — and the fingerprint is what two people should compare out of band.",
                "يحمل الرمز المفتاح العام لهذا الجهاز وبصمته. مسحه يكشف مفتاحًا عامًا فقط، ولا يكشف أي سر، والبصمة هي ما ينبغي أن يقارنه الطرفان عبر قناة أخرى.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(12.dp))

        if (bitmap == null) {
            GlassCard(Modifier.fillMaxWidth()) {
                Text(
                    tr("The signing key is not available yet.", "مفتاح التوقيع غير متاح بعد."),
                    style = MaterialTheme.typography.bodySmall,
                    color = KnouxColors.Warn,
                )
            }
        } else {
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Public key", "المفتاح العام"))
                Spacer(Modifier.height(8.dp))
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = tr("QR code with the public key", "رمز QR يحتوي المفتاح العام"),
                    modifier = Modifier
                        .fillMaxWidth(0.78f)
                        .aspectRatio(1f),
                )
                Spacer(Modifier.height(8.dp))
                Text(fingerprint, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Text)
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = {
                        scope.launch { container.clipboard.copySensitive(uri, "KNOUX public key") }
                    }) { Text(tr("Copy key URI", "نسخ رابط المفتاح"), color = KnouxColors.Violet, fontSize = 11.sp) }
                    TextButton(onClick = {
                        scope.launch { container.clipboard.copySensitive(fingerprint, "KNOUX key fingerprint") }
                    }) { Text(tr("Copy fingerprint", "نسخ البصمة"), color = KnouxColors.Violet, fontSize = 11.sp) }
                }
            }
            Spacer(Modifier.height(10.dp))
            GlassCard(Modifier.fillMaxWidth()) {
                SectionLabel(tr("Plain text", "نص صريح"))
                Text(uri, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Faint)
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

/** Resolves either an SSH-style fingerprint or a base64 public key. */
private fun resolveFingerprint(input: String): String? {
    val value = input.trim()
    if (value.isEmpty()) return null
    if (value.startsWith(KeyFingerprint.PREFIX, ignoreCase = true)) return value
    val publicKey = DigitalSignatureService.publicKeyFromBase64(value) ?: return null
    return KeyFingerprint.of(publicKey)
}

/** Renders text as a QR bitmap with ZXing; returns null when encoding fails. */
internal fun encodeQrBitmap(text: String, size: Int): Bitmap? = runCatching {
    val matrix = com.google.zxing.qrcode.QRCodeWriter()
        .encode(text, com.google.zxing.BarcodeFormat.QR_CODE, size, size)
    val width = matrix.width
    val height = matrix.height
    val pixels = IntArray(width * height)
    for (y in 0 until height) {
        val offset = y * width
        for (x in 0 until width) {
            pixels[offset + x] = if (matrix.get(x, y)) 0xFF000000.toInt() else 0xFFFFFFFF.toInt()
        }
    }
    Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
}.getOrNull()
