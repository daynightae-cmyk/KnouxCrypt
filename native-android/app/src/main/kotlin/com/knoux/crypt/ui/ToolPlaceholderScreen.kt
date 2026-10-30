package com.knoux.crypt.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.knoux.crypt.Catalog
import com.knoux.crypt.LocalLanguage
import com.knoux.crypt.ServiceDef
import com.knoux.crypt.ServiceStatus
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.ServiceArtImage
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr

@Composable
fun ToolPlaceholderScreen(service: ServiceDef?, onBack: () -> Unit) {
    val lang = LocalLanguage.current
    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = ScreenHorizontalPadding),
    ) {
        BackHeader(tr("Tool detail", "تفاصيل الأداة"), onBack)
        if (service == null) {
            Text(tr("Unknown destination.", "وجهة غير معروفة."), style = MaterialTheme.typography.bodyMedium)
            return@Column
        }
        Spacer(Modifier.height(20.dp))
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            ServiceArtImage(service.art, Modifier.size(112.dp))
            Spacer(Modifier.height(12.dp))
            StatusPill(
                text = when (service.status) {
                    ServiceStatus.IMPLEMENTED -> tr("Implemented · unverified", "منفذ · غير موثق")
                    ServiceStatus.DESIGN_ONLY -> tr("Design only", "تصميم فقط")
                    ServiceStatus.BLOCKED -> tr("Blocked", "محجوب")
                },
                tone = when (service.status) {
                    ServiceStatus.IMPLEMENTED -> KnouxColors.Success
                    ServiceStatus.DESIGN_ONLY -> KnouxColors.Warn
                    ServiceStatus.BLOCKED -> KnouxColors.Alert
                },
            )
            Text(
                Catalog.title(service, lang),
                style = MaterialTheme.typography.headlineMedium,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 10.dp),
            )
            Text(
                Catalog.description(service, lang),
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 4.dp, start = 12.dp, end = 12.dp),
            )
        }
        Spacer(Modifier.height(20.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Native status", "الحالة الأصلية"))
            Spacer(Modifier.height(8.dp))
            InfoRow(tr("Catalog ID", "معرّف الكتالوج"), service.id)
            InfoRow(
                tr("Requires unlock", "يتطلب فتحًا"),
                if (service.requiresUnlock) tr("Yes", "نعم") else tr("No", "لا"),
            )
            InfoRow(tr("Operation", "العملية"), tr("None running", "لا شيء يعمل"))
        }
        Spacer(Modifier.height(12.dp))
        GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Warn.copy(alpha = 0.4f)) {
            Text(
                when (service.status) {
                    ServiceStatus.DESIGN_ONLY ->
                        tr(
                            "This destination is preserved in the accepted 34-entry catalog, but its native workflow is not implemented yet. Nothing is stored, encrypted or simulated on this screen.",
                            "هذه الوجهة محفوظة ضمن كتالوج 34 وجهة المعتمد، لكن سير العمل الأصلي غير منفذ بعد. لا يتم تخزين أو تشفير أو محاكاة أي شيء في هذه الشاشة.",
                        )
                    ServiceStatus.BLOCKED ->
                        tr(
                            "This capability remains blocked pending a real, tested implementation. No recovery or security claim is made.",
                            "تبقى هذه القدرة محجوبة بانتظار تنفيذ حقيقي مختبَر. لا يُقدّم أي ادعاء استعادة أو أمان.",
                        )
                    ServiceStatus.IMPLEMENTED ->
                        tr(
                            "A dedicated implementation exists; open it from Home or Tools.",
                            "يوجد تنفيذ مخصص؛ افتحه من الرئيسية أو الأدوات.",
                        )
                },
                style = MaterialTheme.typography.bodySmall,
                color = KnouxColors.Text,
            )
        }
        Spacer(Modifier.height(18.dp))
        TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text(tr("Back", "رجوع"), color = KnouxColors.Violet)
        }
        Spacer(Modifier.height(24.dp))
    }
}
