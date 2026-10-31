package com.knoux.crypt.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.security.SecureRandomSource
import com.knoux.crypt.tr

private val AdvisoryWords = listOf(
    "anchor", "atlas", "beacon", "cipher", "comet", "delta", "ember", "falcon",
    "glacier", "harbor", "ivory", "juniper", "kite", "lantern", "meadow", "nimbus",
    "onyx", "orbit", "pepper", "quartz", "raven", "saffron", "tundra", "umber",
    "violet", "willow", "xenon", "yonder", "zephyr", "amber", "basalt", "cobalt",
)

@Composable
fun SecureRandomScreen(onBack: () -> Unit) {
    val clipboard = LocalClipboardManager.current
    var length by rememberSaveable { mutableIntStateOf(32) }
    var format by rememberSaveable { mutableStateOf("hex") }
    var value by rememberSaveable { mutableStateOf("") }
    var copied by remember { mutableStateOf(false) }

    fun generate() {
        value = when (format) {
            "hex" -> SecureRandomSource.hex(length)
            "base64" -> SecureRandomSource.base64(length)
            else -> SecureRandomSource.words(AdvisoryWords, 6)
        }
        copied = false
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Secure Random Studio", "مولّد العشوائية الآمن"), onBack)
        Spacer(Modifier.height(8.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Entropy source", "مصدر العشوائية"))
            Text(
                tr(
                    "Values come from the platform java.security.SecureRandom provider. No hardware RNG claim is made.",
                    "تأتي القيم من مزوّد java.security.SecureRandom في المنصة. لا يُقدّم ادعاء مولد عشوائي عتادي.",
                ),
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.height(10.dp))
            SectionLabel(tr("Format", "الصيغة"))
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("hex" to "HEX", "base64" to "BASE64", "words" to tr("WORDS", "كلمات")).forEach { (id, label) ->
                    val active = format == id
                    Text(
                        label,
                        fontSize = 10.sp,
                        color = if (active) KnouxColors.Text else KnouxColors.Muted,
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(if (active) KnouxColors.VioletDeep.copy(alpha = 0.55f) else KnouxColors.Raised)
                            .clickable(role = Role.Tab) { format = id }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }
            }
            if (format != "words") {
                Spacer(Modifier.height(8.dp))
                SectionLabel(tr("Length", "الطول"))
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(16, 32, 64).forEach { size ->
                        val active = length == size
                        Text(
                            "$size B",
                            fontSize = 10.sp,
                            color = if (active) KnouxColors.Text else KnouxColors.Muted,
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(if (active) KnouxColors.VioletDeep.copy(alpha = 0.55f) else KnouxColors.Raised)
                                .clickable(role = Role.RadioButton) { length = size }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                        )
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            KnouxPrimaryButton(tr("Generate", "توليد"), ::generate)
        }
        Spacer(Modifier.height(10.dp))
        if (value.isNotBlank()) {
            GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Success.copy(alpha = 0.35f)) {
                SectionLabel(tr("Generated value", "القيمة المولدة"))
                Spacer(Modifier.height(6.dp))
                Text(value, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Text)
                Spacer(Modifier.height(8.dp))
                KnouxGhostButton(if (copied) tr("Copied", "تم النسخ") else tr("Copy", "نسخ"), {
                    clipboard.setText(AnnotatedString(value))
                    copied = true
                })
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(
            tr(
                "A random string is not a passphrase manager. Treat generated values as secrets and clear the clipboard after use.",
                "السلسلة العشوائية ليست مدير عبارات مرور. تعامل مع القيم كم secrets وامسح الحافظة بعد الاستخدام.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(24.dp))
    }
}
