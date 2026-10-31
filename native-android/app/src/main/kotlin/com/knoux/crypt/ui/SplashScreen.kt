package com.knoux.crypt.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import com.knoux.crypt.BuildConfig
import com.knoux.crypt.design.DividerLine
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.StagHero
import com.knoux.crypt.tr

@Composable
fun SplashScreen(onEnter: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        StagHero(
            modifier = Modifier.size(220.dp),
            contentDescription = tr("KNOUX Crypt stag emblem", "شعار نوكس كريبت"),
        )
        Row(verticalAlignment = Alignment.Bottom) {
            Text("Knoux ", style = MaterialTheme.typography.headlineLarge.copy(fontSize = 30.sp, fontWeight = FontWeight.SemiBold))
            Text(
                "Crypt",
                style = MaterialTheme.typography.headlineLarge.copy(fontSize = 30.sp, fontWeight = FontWeight.SemiBold),
                color = KnouxColors.VioletSoft,
            )
        }
        Text(
            tr("PRIVATE ENCRYPTION SUITE", "مجموعة تشفير خاصة"),
            fontSize = 9.sp,
            letterSpacing = 3.sp,
            color = KnouxColors.Muted,
            modifier = Modifier.padding(top = 7.dp),
        )
        DividerLine(Modifier.width(180.dp).padding(vertical = 14.dp))
        Text(
            tr("Sealed · Local · Private", "مختوم · محلي · خاص"),
            fontSize = 11.sp,
            letterSpacing = 2.sp,
            color = KnouxColors.Violet.copy(alpha = 0.85f),
        )
        Spacer(Modifier.height(28.dp))
        Box(Modifier.width(220.dp)) {
            KnouxPrimaryButton(tr("Enter", "دخول"), onEnter)
        }
        Spacer(Modifier.height(16.dp))
        Text(
            "KNOUX NATIVE · ${BuildConfig.VERSION_NAME}",
            fontSize = 8.sp,
            letterSpacing = 1.6.sp,
            color = KnouxColors.Faint,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            tr("Design baseline · no encryption runs on this screen", "خط أساس تصميمي · لا تشفير في هذه الشاشة"),
            fontSize = 8.sp,
            color = KnouxColors.Faint,
        )
    }
}
