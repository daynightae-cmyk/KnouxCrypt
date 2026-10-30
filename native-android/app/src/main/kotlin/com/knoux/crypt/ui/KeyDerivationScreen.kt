package com.knoux.crypt.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
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
import com.knoux.crypt.security.Argon2id
import com.knoux.crypt.security.Argon2idParameters
import com.knoux.crypt.tr
import java.security.SecureRandom
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Real, local Argon2id KDF workbench. Nothing is persisted: the passphrase and
 * derived key live in composition state only and are cleared on success/back.
 * Memory/timing choices are explicit; there is no silent downgrade.
 */
@Composable
fun KeyDerivationScreen(onBack: () -> Unit) {
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    val random = remember { SecureRandom() }
    var passphrase by remember { mutableStateOf("") }
    var showPassphrase by remember { mutableStateOf(false) }
    var salt by remember { mutableStateOf(ByteArray(16).also(random::nextBytes)) }
    var memoryKib by remember { mutableIntStateOf(Argon2idParameters.DEFAULT_MEMORY_KIB) }
    var iterations by remember { mutableIntStateOf(Argon2idParameters.DEFAULT_ITERATIONS) }
    var parallelism by remember { mutableIntStateOf(Argon2idParameters.DEFAULT_PARALLELISM) }
    var busy by remember { mutableStateOf(false) }
    var elapsedMs by remember { mutableLongStateOf(0L) }
    var output by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var copied by remember { mutableStateOf(false) }

    val parameters = remember(memoryKib, iterations, parallelism) {
        runCatching { Argon2idParameters(memoryKib, iterations, parallelism) }.getOrNull()
    }
    val belowMinimum = parameters != null &&
        parameters.estimatedWorkKib < Argon2idParameters.OWASP_MINIMUM.estimatedWorkKib
    val messageMissing = tr("Enter a passphrase first.", "أدخل عبارة المرور أولاً.")
    val messageFailed = tr("Derivation failed.", "فشل الاشتقاق.")
    val messageOom = tr(
        "Not enough memory for this cost. Lower the memory setting; no silent downgrade was applied.",
        "لا توجد ذاكرة كافية لهذه التكلفة. اخفض إعداد الذاكرة؛ لم يتم تخفيض أي إعداد تلقائيًا.",
    )

    fun derive() {
        if (busy) return
        if (passphrase.isBlank()) {
            error = messageMissing
            return
        }
        val chosen = parameters ?: return
        busy = true
        error = null
        output = null
        copied = false
        val pass = passphrase.toCharArray()
        val saltCopy = salt.copyOf()
        scope.launch {
            val started = System.nanoTime()
            try {
                val derived = withContext(Dispatchers.Default) {
                    Argon2id.derive(pass, saltCopy, chosen)
                }
                elapsedMs = (System.nanoTime() - started) / 1_000_000
                output = derived.toHex()
                derived.fill(0)
                passphrase = ""
            } catch (_: OutOfMemoryError) {
                error = messageOom
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
        BackHeader(tr("Key Derivation", "اشتقاق المفاتيح"), onBack)
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "Argon2id v1.3 derives a 32-byte key from a passphrase and a 16-byte salt. The parameters are shown and versioned; nothing is stored.",
                "يشتق Argon2id v1.3 مفتاحًا بطول 32 بايت من عبارة مرور وملح بطول 16 بايت. تُعرض المعاملات وتُسجَّل بنسخة؛ لا يُخزَّن أي شيء.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(12.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Passphrase", "عبارة المرور"))
            Spacer(Modifier.height(8.dp))
            KnouxTextField(
                value = passphrase,
                onValueChange = {
                    passphrase = it
                    output = null
                },
                label = tr("Passphrase (held in screen memory only)", "عبارة المرور (في ذاكرة الشاشة فقط)"),
                visualTransformation = if (showPassphrase) VisualTransformation.None else PasswordVisualTransformation(),
                trailingContent = {
                    androidx.compose.material3.TextButton(onClick = { showPassphrase = !showPassphrase }) {
                        Text(
                            if (showPassphrase) tr("Hide", "إخفاء") else tr("Show", "إظهار"),
                            color = KnouxColors.Violet,
                            fontSize = 11.sp,
                        )
                    }
                },
            )
            Spacer(Modifier.height(6.dp))
            Text(
                tr(
                    "Use a long, unique passphrase. Clearing the field is offered after a successful run.",
                    "استخدم عبارة مرور طويلة وفريدة. يُمسح الحقل بعد نجاح العملية.",
                ),
                style = MaterialTheme.typography.labelSmall,
            )
        }
        Spacer(Modifier.height(10.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Salt · 16 bytes", "الملح · 16 بايت"))
            Spacer(Modifier.height(6.dp))
            Text(
                salt.toHex(),
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                color = KnouxColors.Violet,
            )
            Spacer(Modifier.height(8.dp))
            KnouxGhostButton(
                tr("Generate new random salt", "توليد ملح عشوائي جديد"),
                {
                    salt = ByteArray(16).also(random::nextBytes)
                    output = null
                },
                enabled = !busy,
            )
        }
        Spacer(Modifier.height(10.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Cost parameters", "معاملات التكلفة"))
            Spacer(Modifier.height(8.dp))
            ParameterRow(
                label = tr("Memory", "الذاكرة"),
                options = listOf(16, 32, 64, 128, 256),
                selected = memoryKib / 1024,
                enabled = !busy,
                format = { "$it MiB" },
                onSelect = { memoryKib = it * 1024 },
            )
            Spacer(Modifier.height(8.dp))
            ParameterRow(
                label = tr("Iterations", "التكرارات"),
                options = (1..6).toList(),
                selected = iterations,
                enabled = !busy,
                format = { "t=$it" },
                onSelect = { iterations = it },
            )
            Spacer(Modifier.height(8.dp))
            ParameterRow(
                label = tr("Parallelism", "التوازي"),
                options = (1..4).toList(),
                selected = parallelism,
                enabled = !busy,
                format = { "p=$it" },
                onSelect = { parallelism = it },
            )
            Spacer(Modifier.height(8.dp))
            Text(
                tr(
                    "Reference: OWASP 2023 minimum is 19 MiB, t=2, p=1. Defaults are 64 MiB, t=3, p=2.",
                    "المرجع: الحد الأدنى وفق OWASP 2023 هو 19 MiB وt=2 وp=1. الافتراضي 64 MiB وt=3 وp=2.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
            if (belowMinimum) {
                Spacer(Modifier.height(6.dp))
                Text(
                    tr(
                        "These settings are below the published minimum. They run as chosen, not silently upgraded.",
                        "هذه الإعدادات أقل من الحد المنشور. تُنفَّذ كما اخترتها، دون ترقية تلقائية.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = KnouxColors.Warn,
                )
            }
        }
        Spacer(Modifier.height(12.dp))

        KnouxPrimaryButton(
            text = if (busy) tr("Deriving…", "جارٍ الاشتقاق…") else tr("Derive 32-byte key", "اشتق مفتاحًا بطول 32 بايت"),
            onClick = ::derive,
            enabled = !busy && passphrase.isNotBlank() && parameters != null,
        )
        if (busy) {
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = KnouxColors.Violet)
                Spacer(Modifier.width(8.dp))
                Text(
                    tr(
                        "Running Argon2id on this device. The work factor is real, not animated.",
                        "يتم تشغيل Argon2id على هذا الجهاز. عبء العمل حقيقي وليس رسومًا متحركة.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        Spacer(Modifier.height(10.dp))

        error?.let {
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }
        output?.let { hex ->
            GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Success.copy(alpha = 0.4f)) {
                SectionLabel(tr("Derived key · hex", "المفتاح المشتق · hex"))
                Spacer(Modifier.height(6.dp))
                Text(hex, fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = KnouxColors.Text)
                Spacer(Modifier.height(6.dp))
                Text(
                    tr("Elapsed: $elapsedMs ms", "استغرق: $elapsedMs مللي ثانية"),
                    style = MaterialTheme.typography.labelSmall,
                )
                Spacer(Modifier.height(8.dp))
                KnouxGhostButton(
                    if (copied) tr("Copied", "تم النسخ") else tr("Copy key hex", "نسخ المفتاح"),
                    {
                        clipboard.setText(AnnotatedString(hex))
                        copied = true
                    },
                )
                Spacer(Modifier.height(6.dp))
                KnouxGhostButton(
                    tr("Clear result", "مسح الناتج"),
                    {
                        output = null
                        copied = false
                    },
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    tr(
                        "Clipboard is not auto-cleared in this build. Mission 44 owns that control.",
                        "لا تُمسح الحافظة تلقائيًا في هذا البناء. تتحكم بذلك المهمة 44.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Text(
            tr(
                "Argon2id is Bouncy Castle's pure-Java implementation (RFC 9106), tested against the published reference vector. This build is not independently audited; KNF1 file containers still use PBKDF2.",
                "Argon2id هو تنفيذ Bouncy Castle النقي بلغة جافا (RFC 9106)، تم اختباره مقابل متجه المرجع المنشور. هذا البناء غير مدقق أمنيًا بشكل مستقل؛ ما زالت حاويات KNF1 تستخدم PBKDF2.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun ParameterRow(
    label: String,
    options: List<Int>,
    selected: Int,
    enabled: Boolean,
    format: (Int) -> String,
    onSelect: (Int) -> Unit,
) {
    Text(label, style = MaterialTheme.typography.labelLarge, color = KnouxColors.Muted)
    Spacer(Modifier.height(4.dp))
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
                    .selectable(
                        selected = active,
                        enabled = enabled,
                        role = Role.RadioButton,
                        onClick = { onSelect(option) },
                    )
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
    }
}

private fun ByteArray.toHex(): String =
    joinToString("") { "%02x".format(Locale.ROOT, it) }
