package com.knoux.crypt.design

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.sp

/**
 * Obsidian ambience shared by every screen. The rain is decorative, never a
 * substitute for a real operation, and pauses entirely when reduced motion is
 * requested.
 */
@Composable
fun KnouxBackground(
    reducedMotion: Boolean = LocalReducedMotion.current,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(Modifier.fillMaxSize().background(KnouxColors.Obsidian)) {
        Canvas(Modifier.fillMaxSize()) {
            drawRect(
                Brush.verticalGradient(
                    listOf(KnouxColors.CanvasTop, KnouxColors.Obsidian, Color(0xFF050309)),
                ),
            )
            val topGlow = Brush.radialGradient(
                colors = listOf(Color(0x553A0F5E), Color.Transparent),
                center = Offset(size.width * 0.18f, size.height * 0.16f),
                radius = size.width * 0.85f,
            )
            drawRect(topGlow)
            val bottomGlow = Brush.radialGradient(
                colors = listOf(Color(0x332A0A44), Color.Transparent),
                center = Offset(size.width * 0.92f, size.height * 0.86f),
                radius = size.width * 0.9f,
            )
            drawRect(bottomGlow)
        }
        if (!reducedMotion) RainLayer()
        content()
    }
}

@Composable
private fun RainLayer() {
    val terms = remember {
        listOf(
            "AES-256-GCM", "SHA-256", "HKDF", "NONCE", "AAD", "KEYSTORE",
            "CIPHER", "AUTH TAG", "SALT", "RSA-4096", "TOTP", "HMAC",
            "ENTROPY", "KDF", "CIPHERTEXT", "TRUNCATION",
        )
    }
    val textMeasurer = rememberTextMeasurer()
    val style = TextStyle(
        color = KnouxColors.Violet.copy(alpha = 0.16f),
        fontSize = 9.sp,
        fontFamily = FontFamily.Monospace,
        letterSpacing = 1.5.sp,
    )
    val layouts = remember(textMeasurer, style) { terms.map { textMeasurer.measure(it, style) } }
    val transition = rememberInfiniteTransition(label = "knoux-rain")
    val progress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(18_000, easing = LinearEasing), RepeatMode.Restart),
        label = "rain-progress",
    )
    Canvas(Modifier.fillMaxSize()) {
        layouts.forEachIndexed { index, layout ->
            val x = ((index * 137) % 96) / 100f * size.width
            val phase = ((index * 0.117f) + progress) % 1f
            val y = phase * (size.height + 120f) - 60f
            drawText(layout, topLeft = Offset(x, y))
        }
    }
}

@Composable
fun EnergyRibbon(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "knoux-ribbon")
    val sway by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(11_000, easing = LinearEasing), RepeatMode.Reverse),
        label = "ribbon-sway",
    )
    Canvas(modifier) {
        val paint = Brush.linearGradient(
            colors = listOf(Color(0x008B16FF), Color(0x99BC54FF), Color(0x66F2C6FF), Color(0x00681CFF)),
            start = Offset.Zero,
            end = Offset(size.width, size.height),
        )
        val path = androidx.compose.ui.graphics.Path().apply {
            moveTo(0f, size.height * (0.86f - sway * 0.05f))
            cubicTo(
                size.width * 0.25f, size.height * 0.2f,
                size.width * 0.8f, size.height * 0.32f,
                size.width, size.height * 0.6f,
            )
        }
        drawPath(path, brush = paint, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 3f))
    }
}
