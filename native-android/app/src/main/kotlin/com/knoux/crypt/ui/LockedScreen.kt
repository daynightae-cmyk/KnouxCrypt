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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.tr

@Composable
fun LockedScreen(title: String, onBack: () -> Unit, onNeedUnlock: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(title, onBack)
        Spacer(Modifier.height(60.dp))
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Default.Lock,
                contentDescription = null,
                tint = KnouxColors.Violet,
                modifier = Modifier.size(52.dp),
            )
            Spacer(Modifier.height(16.dp))
            Text(tr("Unlock required", "الفتح مطلوب"), style = MaterialTheme.typography.headlineSmall)
            Text(
                tr(
                    "This screen reads or writes encrypted vault records. Unlock with a real Keystore operation first; guest mode cannot bypass it.",
                    "تقرأ هذه الشاشة أو تكتب سجلات خزنة مشفرة. افتح بعملية Keystore حقيقية أولًا؛ لا يمكن لوضع الزائر تجاوزها.",
                ),
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp, start = 16.dp, end = 16.dp),
            )
            Spacer(Modifier.height(20.dp))
            KnouxPrimaryButton(tr("Unlock", "فتح"), onNeedUnlock, Modifier.fillMaxWidth(0.7f))
        }
        Spacer(Modifier.height(60.dp))
    }
}
