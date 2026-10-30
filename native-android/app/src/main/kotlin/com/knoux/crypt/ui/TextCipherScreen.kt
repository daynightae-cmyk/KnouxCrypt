package com.knoux.crypt.ui

import android.util.Base64
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.KnouxTextField
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.security.PassphraseEnvelope
import com.knoux.crypt.tr
import java.security.GeneralSecurityException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun TextCipherScreen(onBack: () -> Unit) {
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    var encrypting by rememberSaveable { mutableStateOf(true) }
    var input by rememberSaveable { mutableStateOf("") }
    var passphrase by remember { mutableStateOf("") }
    var output by rememberSaveable { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var showPassphrase by remember { mutableStateOf(false) }
    var copied by remember { mutableStateOf(false) }
    val codec = remember { PassphraseEnvelope() }
    val messageMissing = tr("Enter text and a passphrase.", "أدخل النص وعبارة مرور.")
    val messageWrong = tr(
        "Wrong passphrase or corrupted ciphertext. Nothing was decrypted.",
        "عبارة مرور خاطئة أو نص مشفر تالف. لم يتم فك أي شيء.",
    )
    val messageInvalid = tr("The ciphertext is not a valid KNP1 envelope.", "النص المشفر ليس حاوية KNP1 صالحة.")
    val messageFailed = tr("The operation failed.", "فشلت العملية.")

    fun run() {
        if (busy) return
        if (passphrase.isBlank() || input.isBlank()) {
            error = messageMissing
            return
        }
        busy = true
        error = null
        output = ""
        copied = false
        val pass = passphrase.toCharArray()
        scope.launch {
            try {
                val result = withContext(Dispatchers.Default) {
                    val context = "knoux.text.v1".toByteArray(Charsets.UTF_8)
                    if (encrypting) {
                        Base64.encodeToString(
                            codec.seal(input.toByteArray(Charsets.UTF_8), pass, context),
                            Base64.NO_WRAP,
                        )
                    } else {
                        val raw = Base64.decode(input.trim(), Base64.DEFAULT)
                        String(codec.open(raw, pass, context), Charsets.UTF_8)
                    }
                }
                output = result
            } catch (_: GeneralSecurityException) {
                error = messageWrong
            } catch (_: IllegalArgumentException) {
                error = messageInvalid
            } catch (_: Exception) {
                error = messageFailed
            } finally {
                pass.fill('\u0000')
                busy = false
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Text Cipher", "تشفير النصوص"), onBack)
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = { encrypting = true }, modifier = Modifier.weight(1f)) {
                Text(tr("Encrypt", "تشفير"), color = if (encrypting) KnouxColors.Text else KnouxColors.Muted)
            }
            TextButton(onClick = { encrypting = false }, modifier = Modifier.weight(1f)) {
                Text(tr("Decrypt", "فك التشفير"), color = if (!encrypting) KnouxColors.Text else KnouxColors.Muted)
            }
        }
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(if (encrypting) tr("Plaintext", "النص الأصلي") else tr("Ciphertext (Base64)", "النص المشفر (Base64)"))
            Spacer(Modifier.height(6.dp))
            KnouxTextField(
                value = input,
                onValueChange = { input = it },
                label = if (encrypting) tr("Text to seal", "النص المراد ختمه") else tr("Base64 KNP1 envelope", "حاوية KNP1 بصيغة Base64"),
                singleLine = false,
                minLines = 4,
            )
            Spacer(Modifier.height(10.dp))
            KnouxTextField(
                value = passphrase,
                onValueChange = { passphrase = it },
                label = tr("Passphrase", "عبارة المرور"),
                singleLine = true,
                visualTransformation = if (showPassphrase) VisualTransformation.None else PasswordVisualTransformation(),
                trailingContent = {
                    TextButton(onClick = { showPassphrase = !showPassphrase }) {
                        Text(if (showPassphrase) tr("Hide", "إخفاء") else tr("Show", "إظهار"), fontSize = 10.sp)
                    }
                },
            )
            Spacer(Modifier.height(10.dp))
            KnouxPrimaryButton(
                if (encrypting) tr("Seal text", "ختم النص") else tr("Open text", "فتح النص"),
                ::run,
                enabled = !busy,
            )
            if (busy) {
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = KnouxColors.Violet)
                    Spacer(Modifier.width(8.dp))
                    Text(tr("Deriving key…", "جارٍ اشتقاق المفتاح…"), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        error?.let {
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(6.dp))
        }
        if (output.isNotBlank()) {
            GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Success.copy(alpha = 0.4f)) {
                SectionLabel(if (encrypting) tr("Sealed output", "الناتج المختوم") else tr("Decrypted text", "النص المفكوك"))
                Spacer(Modifier.height(6.dp))
                Text(output, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Text)
                Spacer(Modifier.height(8.dp))
                KnouxGhostButton(
                    if (copied) tr("Copied", "تم النسخ") else tr("Copy output", "نسخ الناتج"),
                    {
                        clipboard.setText(AnnotatedString(output))
                        copied = true
                    },
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(
            tr(
                "KNP1: AES-256-GCM with PBKDF2-HMAC-SHA256 (310,000 iterations). PBKDF2 is not memory-hard; Argon2id remains mission 37 and is not implemented.",
                "KNP1: AES-256-GCM مع PBKDF2-HMAC-SHA256 (310,000 تكرار). PBKDF2 ليس مقاومًا للذاكرة؛ Argon2id مهمة 37 وغير منفذ.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(24.dp))
    }
}
