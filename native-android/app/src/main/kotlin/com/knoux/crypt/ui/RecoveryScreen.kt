package com.knoux.crypt.ui

import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr

@Composable
fun RecoveryScreen(onBack: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Recovery", "الاستعادة"), onBack)
        Spacer(Modifier.height(10.dp))
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            StatusPill(tr("Blocked", "محجوب"), tone = KnouxColors.Alert)
            Spacer(Modifier.height(10.dp))
            Text(tr("No recovery export exists yet", "لا يوجد تصدير استعادة بعد"), style = MaterialTheme.typography.headlineSmall)
        }
        Spacer(Modifier.height(14.dp))
        GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Alert.copy(alpha = 0.45f)) {
            SectionLabel(tr("Truthful status", "الحالة الصادقة"))
            Spacer(Modifier.height(6.dp))
            Text(
                tr(
                    "This build does not create a portable backup. The Android data key is device-bound and non-exportable. Losing this device or clearing app data can make vault records unrecoverable. No backup, escrow or recovery claim is made.",
                    "هذا البناء لا ينشئ نسخة احتياطية محمولة. مفتاح بيانات أندرويد مرتبط بالجهاز وغير قابل للتصدير. قد يؤدي فقدان الجهاز أو مسح بيانات التطبيق إلى عدم استعادة سجلات الخزنة. لا يُقدّم أي ادعاء نسخ احتياطي أو ضمان استعادة.",
                ),
                style = MaterialTheme.typography.bodySmall,
                color = KnouxColors.Text,
            )
        }
        Spacer(Modifier.height(10.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Required before this can change", "المطلوب قبل تغيير ذلك"))
            Spacer(Modifier.height(6.dp))
            listOf(
                tr("Reviewed Argon2id integration (mission 37)", "دمج Argon2id مُراجع (المهمة 37)"),
                tr("Encrypted recovery wrap with an independent user-held secret", "غلاف استعادة مشفر بسر مستقل يحتفظ به المستخدم"),
                tr("Fresh-device restore and corruption tests", "اختبارات استعادة على جهاز جديد واختبارات فساد"),
                tr("Key rotation and versioned migration", "تدوير المفاتيح وترحيل بإصدارات"),
            ).forEach { line ->
                Text("•  $line", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 2.dp))
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(
            tr(
                "Do not enable any disabled recovery button elsewhere: this screen intentionally performs no export and writes no file.",
                "لا تفعّل أي زر استعادة معطل في مكان آخر: هذه الشاشة لا تصدّر ولا تكتب أي ملف عمدًا.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(24.dp))
    }
}
