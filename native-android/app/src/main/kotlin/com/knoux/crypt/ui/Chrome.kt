package com.knoux.crypt.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.knoux.crypt.design.KnouxBottomBar
import com.knoux.crypt.design.KnouxTab
import com.knoux.crypt.tr

@Composable
fun TabScreen(
    selected: KnouxTab,
    onTab: (KnouxTab) -> Unit,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
        content()
        KnouxBottomBar(
            selected = selected,
            labels = listOf(
                tr("Home", "الرئيسية"),
                tr("Tools", "الأدوات"),
                tr("Account", "الحساب"),
            ),
            onSelect = onTab,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(horizontal = 14.dp, vertical = 8.dp),
        )
    }
}

val ScreenHorizontalPadding = 18.dp
