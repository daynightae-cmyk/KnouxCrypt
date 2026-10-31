package com.knoux.crypt.design

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object KnouxColors {
    val Abyss = Color(0xFF05070D)
    val Obsidian = Color(0xFF080411)
    val Raised = Color(0xFF140A22)
    val Sealed = Color(0xFF1B0D2E)
    val Violet = Color(0xFFBC86F3)
    val VioletDeep = Color(0xFF7556FF)
    val VioletSoft = Color(0xFFB75CE8)
    val Text = Color(0xFFF4EDFF)
    val Muted = Color(0xFFA99AC8)
    val Faint = Color(0xFF8F7FA4)
    val Line = Color(0x66A75BE2)
    val LineHot = Color(0xFFB77BFF)
    val Success = Color(0xFF5FE0C8)
    val Warn = Color(0xFFFFB86B)
    val Alert = Color(0xFFFF586D)
    val CardTop = Color(0x9925103D)
    val CardBottom = Color(0xFF0B061A)
    val CardTopAlt = Color(0x991A0E2B)
    val CanvasTop = Color(0xFF0A0514)
}

val KnouxTypography = Typography(
    displayLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 32.sp, lineHeight = 38.sp, color = KnouxColors.Text),
    headlineLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 26.sp, lineHeight = 32.sp, color = KnouxColors.Text),
    headlineMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp, color = KnouxColors.Text),
    headlineSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 24.sp, color = KnouxColors.Text),
    titleLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 24.sp, color = KnouxColors.Text),
    titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 20.sp, color = KnouxColors.Text),
    titleSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, lineHeight = 18.sp, color = KnouxColors.Text),
    bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 15.sp, lineHeight = 23.sp, color = KnouxColors.Text),
    bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 13.sp, lineHeight = 20.sp, color = KnouxColors.Text),
    bodySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 11.sp, lineHeight = 16.sp, color = KnouxColors.Muted),
    labelLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 18.sp, color = KnouxColors.Text),
    labelMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 14.sp, letterSpacing = 0.6.sp, color = KnouxColors.Muted),
    labelSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 9.sp, lineHeight = 12.sp, letterSpacing = 1.sp, color = KnouxColors.Faint),
)

val KnouxShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(30.dp),
)

/** Disables ambience loops without removing content; set from persisted settings. */
val LocalReducedMotion = staticCompositionLocalOf { false }

@Composable
fun KnouxTheme(
    reducedMotion: Boolean = false,
    content: @Composable () -> Unit,
) {
    val scheme = darkColorScheme(
        primary = KnouxColors.Violet,
        onPrimary = Color(0xFF180B28),
        primaryContainer = KnouxColors.VioletDeep,
        onPrimaryContainer = KnouxColors.Text,
        secondary = KnouxColors.VioletSoft,
        onSecondary = KnouxColors.Text,
        background = KnouxColors.Obsidian,
        onBackground = KnouxColors.Text,
        surface = KnouxColors.Raised,
        onSurface = KnouxColors.Text,
        surfaceVariant = KnouxColors.Sealed,
        onSurfaceVariant = KnouxColors.Muted,
        outline = KnouxColors.LineHot,
        outlineVariant = KnouxColors.Line,
        error = KnouxColors.Alert,
        onError = Color(0xFF1B0509),
    )
    CompositionLocalProvider(LocalReducedMotion provides reducedMotion) {
        MaterialTheme(
            colorScheme = scheme,
            typography = KnouxTypography,
            shapes = KnouxShapes,
            content = content,
        )
    }
}
