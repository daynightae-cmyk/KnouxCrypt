package com.knoux.crypt.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.knoux.crypt.AccessViewModel
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.tr

@Composable
fun AccessScreen(
    viewModel: AccessViewModel,
    onRequestUnlock: (Boolean) -> Unit,
    onGuest: () -> Unit,
    onUnlocked: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) { viewModel.refresh() }
    LaunchedEffect(state.unlocked) {
        if (state.unlocked) {
            viewModel.consumeUnlocked()
            onUnlocked()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(18.dp))
        GateVisual()
        Spacer(Modifier.height(18.dp))
        Text(tr("Secure Access", "الوصول الآمن"), style = MaterialTheme.typography.headlineLarge)
        Text(
            tr(
                "Your data key stays in the Android Keystore. Unlocking requires a real key operation, never a UI-only gate.",
                "مفتاح بياناتك يبقى داخل Android Keystore. يتطلب الفتح عملية مفتاح حقيقية، وليس بوابة واجهة فقط.",
            ),
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp, start = 8.dp, end = 8.dp),
        )
        Spacer(Modifier.height(20.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            InfoRow(tr("Vault state", "حالة الخزنة"), if (state.unlocked) tr("Unlocked", "مفتوحة") else tr("Locked", "مقفلة"))
            InfoRow(tr("Key storage", "تخزين المفاتيح"), "Android Keystore")
            InfoRow(
                tr("Strong biometric", "بصمة قوية"),
                if (state.strongBiometric) tr("Ready", "جاهزة") else tr("Not enrolled", "غير مسجلة"),
            )
            InfoRow(
                tr("Session", "الجلسة"),
                if (state.unlocked) tr("Authorized", "مصرّح") else tr("No access", "لا وصول"),
            )
        }
        if (state.message != null) {
            Spacer(Modifier.height(12.dp))
            Text(
                state.message.orEmpty(),
                color = KnouxColors.Alert,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
            )
            TextButton(onClick = viewModel::clearMessage) {
                Text(tr("Dismiss", "إغلاق"), color = KnouxColors.Violet)
            }
        }
        Spacer(Modifier.height(16.dp))
        if (!state.checked) {
            LinearProgressIndicator(Modifier.fillMaxWidth(), color = KnouxColors.Violet)
            Spacer(Modifier.height(12.dp))
        }
        if (state.recoveryRequired) {
            RecoveryNotice(state.recoveryCode)
        } else if (state.configured) {
            KnouxPrimaryButton(
                text = tr("Unlock with biometrics", "فتح بالبصمة"),
                onClick = { onRequestUnlock(false) },
                enabled = state.strongBiometric && !state.busy,
            )
        } else {
            KnouxPrimaryButton(
                text = tr("Set up secure unlock", "إعداد الفتح الآمن"),
                onClick = { onRequestUnlock(true) },
                enabled = state.strongBiometric && !state.busy,
            )
        }
        if (state.busy) {
            Spacer(Modifier.height(10.dp))
            LinearProgressIndicator(Modifier.fillMaxWidth(), color = KnouxColors.VioletDeep)
            Text(
                tr("Waiting for authentication…", "بانتظار المصادقة…"),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
        Spacer(Modifier.height(10.dp))
        KnouxGhostButton(
            text = tr("Continue as guest · preview only", "المتابعة كزائر · معاينة فقط"),
            onClick = onGuest,
            enabled = !state.busy,
        )
        Spacer(Modifier.height(14.dp))
        Text(
            tr(
                "Guest mode is visually isolated: stored secrets stay encrypted and no repository is readable until a Keystore-backed unlock succeeds.",
                "وضع الزائر معزول: تبقى الأسرار مشفرة ولا يمكن قراءة أي مستودع حتى ينجح فتح مدعوم بـ Keystore.",
            ),
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
            color = KnouxColors.Faint,
        )
        if (!state.strongBiometric) {
            Spacer(Modifier.height(10.dp))
            Text(
                tr(
                    "No strong biometric is enrolled on this device. Set up a fingerprint or face unlock in Android settings; guest mode remains available.",
                    "لا توجد بصمة قوية مسجلة على هذا الجهاز. أعد إعداد بصمة الإصبع أو الوجه في إعدادات أندرويد؛ يبقى وضع الزائر متاحًا.",
                ),
                style = MaterialTheme.typography.bodySmall,
                color = KnouxColors.Warn,
                textAlign = TextAlign.Center,
            )
        }
        Spacer(Modifier.height(28.dp))
    }

}

@Composable
private fun RecoveryNotice(code: String?) {
    Spacer(Modifier.height(12.dp))
    GlassCard(Modifier.fillMaxWidth()) {
        Text(
            tr("Recovery required", "الاستعادة مطلوبة"),
            style = MaterialTheme.typography.titleMedium,
            color = KnouxColors.Warn,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            if (code == com.knoux.crypt.data.UnlockManager.RECOVERY_BIOMETRIC_INVALIDATED) {
                tr(
                    "The unlock key was invalidated by a device biometric change. Vault ciphertext and the data key were preserved, not deleted. Recovery is not implemented in this build, and a locked session cannot reset the gate or enroll a replacement.",
                    "أُبطل مفتاح الفتح بسبب تغيير في بصمات الجهاز. تم الحفاظ على بيانات الخزنة المشفرة ومفتاح البيانات ولم تُحذف. الاستعادة غير منفذة في هذا البناء، ولا يمكن للجلسة المقفلة إعادة ضبط البوابة أو تسجيل بديل.",
                )
            } else {
                tr(
                    "A vault exists but no usable unlock gate was found. Vault data is intact. Recovery is not implemented in this build; a locked session cannot enroll a replacement gate and claim the existing vault.",
                    "توجد خزنة لكن لم يتم العثور على بوابة فتح صالحة. بيانات الخزنة سليمة. الاستعادة غير منفذة في هذا البناء؛ لا يمكن للجلسة المقفلة تسجيل بوابة بديلة وامتلاك الخزنة الحالية.",
                )
            },
            style = MaterialTheme.typography.bodySmall,
            color = KnouxColors.Warn,
        )
    }
}

@Composable
private fun GateVisual() {
    Box(Modifier.size(118.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(KnouxColors.Violet.copy(alpha = 0.30f), Color.Transparent),
                    center = center,
                    radius = size.minDimension / 2f,
                ),
                radius = size.minDimension / 2f,
                center = center,
            )
            drawCircle(
                color = Color(0x88A15CE5),
                radius = size.minDimension / 2f - 2.dp.toPx(),
                style = Stroke(width = 1.5.dp.toPx()),
            )
            drawCircle(
                color = Color(0x55A15CE5),
                radius = size.minDimension / 2f - 16.dp.toPx(),
                style = Stroke(width = 1.dp.toPx()),
            )
        }
        Icon(
            Icons.Default.Lock,
            contentDescription = tr("Locked", "مقفل"),
            tint = KnouxColors.Violet,
            modifier = Modifier.size(44.dp),
        )
    }
}
