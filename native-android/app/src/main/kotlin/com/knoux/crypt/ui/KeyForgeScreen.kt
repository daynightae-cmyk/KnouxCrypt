package com.knoux.crypt.ui

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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.security.Hashing
import com.knoux.crypt.security.SecureRandomSource
import com.knoux.crypt.tr

@Composable
fun KeyForgeScreen(onBack: () -> Unit, onNeedUnlock: () -> Unit, isUnlocked: Boolean) {
    if (!isUnlocked) {
        LockedScreen(tr("Key Forge", "مصنع المفاتيح"), onBack, onNeedUnlock)
        return
    }
    val clipboard = LocalClipboardManager.current
    var keyHex by remember { mutableStateOf("") }
    var fingerprint by remember { mutableStateOf("") }
    var copied by remember { mutableStateOf(false) }

    fun generate() {
        val key = SecureRandomSource.bytes(32)
        keyHex = Hashing.toHex(key)
        fingerprint = Hashing.toHex(Hashing.sha256(key))
        key.fill(0)
        copied = false
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Key Forge", "مصنع المفاتيح"), onBack)
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "Generates an ephemeral 256-bit key from the platform SecureRandom provider. It is displayed once and not stored by this screen.",
                "يولّد مفتاحًا عابرًا بحجم 256 بت من مزوّد SecureRandom. يُعرض مرة واحدة ولا تحفظه هذه الشاشة.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(10.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Key material", "مادة المفتاح"))
            Spacer(Modifier.height(6.dp))
            Text(
                keyHex.ifBlank { tr("No key generated yet", "لم يُولّد مفتاح بعد") },
                style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                color = if (keyHex.isBlank()) KnouxColors.Muted else KnouxColors.Text,
            )
            Spacer(Modifier.height(10.dp))
            SectionLabel(tr("SHA-256 fingerprint", "بصمة SHA-256"))
            Spacer(Modifier.height(6.dp))
            Text(
                fingerprint.ifBlank { "—" },
                style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                color = KnouxColors.Text,
            )
            Spacer(Modifier.height(12.dp))
            KnouxPrimaryButton(tr("Generate 256-bit key", "توليد مفتاح 256 بت"), ::generate)
            if (keyHex.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Row {
                    KnouxGhostButton(
                        if (copied) tr("Copied", "تم النسخ") else tr("Copy key", "نسخ المفتاح"),
                        {
                            clipboard.setText(AnnotatedString(keyHex))
                            copied = true
                        },
                    )
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Warn.copy(alpha = 0.35f)) {
            InfoRow(tr("Storage", "التخزين"), tr("None on this screen", "لا يوجد في هذه الشاشة"))
            InfoRow(tr("Entropy", "العشوائية"), "java.security.SecureRandom")
            InfoRow(tr("Hardware claim", "ادعاء عتادي"), tr("None", "لا يوجد"))
        }
        Spacer(Modifier.height(10.dp))
        Text(
            tr(
                "For persistent keys, a vault-backed keyring with rotation and recovery is required; that workflow is not implemented yet.",
                "للمفاتيح الدائمة، يلزم مخزن مفاتيح مدعوم بالخزنة مع تدوير واستعادة؛ هذا المسار غير منفذ بعد.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(24.dp))
    }
}
