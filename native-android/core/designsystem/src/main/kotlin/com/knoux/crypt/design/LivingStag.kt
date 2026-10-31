package com.knoux.crypt.design

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random
import androidx.compose.runtime.DisposableEffect
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Living stag overlay (TASK B).
 *
 * The approved artwork is never modified: eyes, antler travel, motes and sparks
 * are drawn as additive light layers on top of the untouched PNG. Positions are
 * normalised to the image so they scale exactly with any drawn size, and the
 * whole effect pauses when the screen is not started and when reduced motion is
 * requested.
 */
object LivingStagGeometry {
    /** Eye centres measured from the 480x480 approved asset. */
    val LEFT_EYE = Offset(0.386f, 0.553f)
    val RIGHT_EYE = Offset(0.648f, 0.553f)

    /** Slit dimensions and tilt, also from the asset. */
    const val SLIT_WIDTH = 0.084f
    const val SLIT_HEIGHT = 0.030f
    const val LEFT_TILT = 10f
    const val RIGHT_TILT = -10f
    const val HALO_RADIUS = 0.150f

    /** Coarse antler ridges used for the travelling light. */
    val LEFT_ANTLER: List<Offset> = listOf(
        Offset(0.360f, 0.330f),
        Offset(0.300f, 0.240f),
        Offset(0.230f, 0.160f),
        Offset(0.160f, 0.095f),
        Offset(0.115f, 0.060f),
    )
    val RIGHT_ANTLER: List<Offset> = LEFT_ANTLER.map { Offset(1f - it.x, it.y) }
}

private data class EyeFrame(val centre: Offset, val intensity: Float, val tilt: Float)

/**
 * True while the host window is at least STARTED and actually drawn, so the
 * animation stops when the app is backgrounded instead of burning frames.
 */
@Composable
internal fun rememberStagVisible(): Boolean {
    val lifecycleOwner = LocalLifecycleOwner.current
    val view = LocalView.current
    var visible by remember { mutableStateOf(false) }
    DisposableEffect(lifecycleOwner, view) {
        val observer = LifecycleEventObserver { _, event ->
            visible = when (event) {
                Lifecycle.Event.ON_START, Lifecycle.Event.ON_RESUME ->
                    lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
                Lifecycle.Event.ON_PAUSE, Lifecycle.Event.ON_STOP -> false
                else -> visible
            } && view.isAttachedToWindow
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        visible = lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED) && view.isAttachedToWindow
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    return visible
}

@Composable
fun LivingStagOverlay(
    modifier: Modifier = Modifier,
    animated: Boolean = true,
) {
    val reduced = LocalReducedMotion.current
    val visible = rememberStagVisible()
    val running = animated && !reduced && visible

    val left = remember { Animatable(0.35f) }
    val right = remember { Animatable(0.35f) }
    var elapsed by remember { mutableFloatStateOf(0f) }

    // Independent eye cycles: ignite, flicker irregularly, dim, then surge back.
    LaunchedEffect(running) {
        if (!running) {
            left.snapTo(0.32f)
            right.snapTo(0.32f)
            return@LaunchedEffect
        }
        coroutineScope {
            launch { eyeCycle(left, seed = 11L) }
            launch { eyeCycle(right, seed = 29L) }
        }
    }

    // One clock for the antler light, motes and sparks.
    LaunchedEffect(running) {
        if (!running) return@LaunchedEffect
        val start = withFrameNanos { it }
        while (true) {
            withFrameNanos { now -> elapsed = (now - start) / 1_000_000_000f }
        }
    }

    Canvas(modifier.fillMaxSize()) {
        val side = min(size.width, size.height)
        if (side <= 0f) return@Canvas
        val origin = Offset((size.width - side) / 2f, (size.height - side) / 2f)
        drawLivingStag(
            side = side,
            origin = origin,
            leftIntensity = left.value,
            rightIntensity = right.value,
            elapsed = elapsed,
            motion = running,
        )
    }
}

private suspend fun eyeCycle(eye: Animatable<Float, AnimationVector1D>, seed: Long) {
    val random = Random(seed)
    while (true) {
        eye.animateTo(1f, tween(durationMillis = 320 + random.nextInt(280)))
        delay(180L + random.nextInt(520))
        repeat(1 + random.nextInt(3)) {
            eye.animateTo(0.42f + random.nextFloat() * 0.3f, tween(45 + random.nextInt(70)))
            delay(30L + random.nextInt(120))
            eye.animateTo(0.72f + random.nextFloat() * 0.28f, tween(50 + random.nextInt(90)))
            delay(60L + random.nextInt(160))
        }
        eye.animateTo(0.10f, tween(1_400 + random.nextInt(1_100)))
        delay(420L + random.nextInt(1_400))
        // Power surge.
        eye.animateTo(0.95f, tween(420 + random.nextInt(240)))
        delay(120L + random.nextInt(300))
    }
}

private fun DrawScope.drawLivingStag(
    side: Float,
    origin: Offset,
    leftIntensity: Float,
    rightIntensity: Float,
    elapsed: Float,
    motion: Boolean,
) {
    val geometry = LivingStagGeometry
    val eyes = listOf(
        EyeFrame(
            centre = origin + Offset(geometry.LEFT_EYE.x * side, geometry.LEFT_EYE.y * side),
            intensity = leftIntensity,
            tilt = geometry.LEFT_TILT,
        ),
        EyeFrame(
            centre = origin + Offset(geometry.RIGHT_EYE.x * side, geometry.RIGHT_EYE.y * side),
            intensity = rightIntensity,
            tilt = geometry.RIGHT_TILT,
        ),
    )

    drawAntlerTravel(side, origin, elapsed, motion)

    eyes.forEach { eye -> drawEye(side, eye) }
    if (motion) {
        drawMotes(side, eyes, elapsed)
        drawSpark(side, eyes, elapsed)
    }
}

private fun DrawScope.drawEye(side: Float, eye: EyeFrame) {
    val haloRadius = side * LivingStagGeometry.HALO_RADIUS
    val intensity = eye.intensity.coerceIn(0f, 1f)
    if (intensity <= 0.02f) return

    // Soft halo, additive so the artwork underneath is never repainted.
    drawCircle(
        brush = Brush.radialGradient(
            colors = listOf(
                KnouxColors.Violet.copy(alpha = 0.52f * intensity),
                Color(0xFFB75CE8).copy(alpha = 0.22f * intensity),
                Color.Transparent,
            ),
            center = eye.centre,
            radius = haloRadius,
        ),
        radius = haloRadius,
        center = eye.centre,
        blendMode = BlendMode.Screen,
    )

    // The slit itself: a bright core, slightly tilted like the engraved eye.
    val slit = Size(side * LivingStagGeometry.SLIT_WIDTH, side * LivingStagGeometry.SLIT_HEIGHT)
    rotate(degrees = eye.tilt, pivot = eye.centre) {
        drawOval(
            brush = Brush.radialGradient(
                colors = listOf(
                    Color.White.copy(alpha = 0.92f * intensity),
                    KnouxColors.Violet.copy(alpha = 0.75f * intensity),
                    Color.Transparent,
                ),
                center = eye.centre,
                radius = slit.width * 0.62f,
            ),
            topLeft = Offset(eye.centre.x - slit.width / 2f, eye.centre.y - slit.height / 2f),
            size = slit,
            blendMode = BlendMode.Screen,
        )
    }
}

/** A slow mote of light walking the antler ridges, mirrored on both sides. */
private fun DrawScope.drawAntlerTravel(side: Float, origin: Offset, elapsed: Float, motion: Boolean) {
    if (!motion) return
    val cycle = 7.2f
    val t = (elapsed % cycle) / cycle
    listOf(LivingStagGeometry.LEFT_ANTLER, LivingStagGeometry.RIGHT_ANTLER).forEach { ridge ->
        val pos = pointAlong(ridge, t)
        val centre = origin + Offset(pos.x * side, pos.y * side)
        val radius = side * 0.022f
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    Color.White.copy(alpha = 0.55f),
                    KnouxColors.Violet.copy(alpha = 0.30f),
                    Color.Transparent,
                ),
                center = centre,
                radius = radius * 2.6f,
            ),
            radius = radius * 2.6f,
            center = centre,
            blendMode = BlendMode.Screen,
        )
        // Faint trail behind the head of the light.
        for (index in 1..3) {
            val back = ((t - index * 0.012f) + 1f) % 1f
            val trailPos = pointAlong(ridge, back)
            val trailCentre = origin + Offset(trailPos.x * side, trailPos.y * side)
            drawCircle(
                color = KnouxColors.Violet.copy(alpha = 0.10f / index),
                radius = radius * (1f - index * 0.18f),
                center = trailCentre,
                blendMode = BlendMode.Screen,
            )
        }
    }
}

private fun DrawScope.drawMotes(side: Float, eyes: List<EyeFrame>, elapsed: Float) {
    val count = 5
    eyes.forEachIndexed { eyeIndex, eye ->
        for (index in 0 until count) {
            val seed = eyeIndex * 31 + index * 17
            val speed = 0.20f + (seed % 7) * 0.035f
            val phase = ((elapsed * speed) + (seed % 11) / 11f) % 1f
            val drift = sin((phase * PI).toFloat() * 2f + seed) * side * 0.020f
            val outward = if (eye.centre.x < side / 2f) -1f else 1f
            val centre = eye.centre + Offset(
                drift + outward * side * 0.02f * phase,
                -side * 0.030f - phase * side * (0.16f + (seed % 3) * 0.02f),
            )
            val alpha = eye.intensity * (1f - phase) * 0.55f
            if (alpha <= 0.01f) continue
            drawCircle(
                color = if (index % 2 == 0) KnouxColors.Violet.copy(alpha = alpha)
                else Color(0xFFE9D7FF).copy(alpha = alpha * 0.8f),
                radius = side * (0.0038f + (seed % 3) * 0.0012f) * (1f - phase * 0.4f),
                center = centre,
                blendMode = BlendMode.Screen,
            )
        }
    }
}

/** One restrained electric arc near an eye every several seconds. */
private fun DrawScope.drawSpark(side: Float, eyes: List<EyeFrame>, elapsed: Float) {
    val period = 6.8f
    val within = elapsed % period
    val life = 0.16f
    if (within > life) return
    val cycle = (elapsed / period).toInt()
    val random = Random(cycle * 97L + 5L)
    val eye = eyes[random.nextInt(eyes.size)]
    val alpha = (1f - within / life).coerceIn(0f, 1f)
    val angle = (-40 + random.nextInt(80)) * PI.toFloat() / 180f
    val start = eye.centre + Offset(
        (random.nextFloat() - 0.5f) * side * 0.05f,
        (random.nextFloat() - 0.5f) * side * 0.03f,
    )
    val length = side * (0.035f + random.nextFloat() * 0.03f)
    var point = start
    for (segment in 1..3) {
        val jitter = (random.nextFloat() - 0.5f) * 0.5f
        val next = point + Offset(
            cos(angle + jitter * 0.6f) * (length / 3f),
            sin(angle + jitter * 0.6f) * (length / 3f),
        )
        drawLine(
            color = lerp(KnouxColors.Violet, Color.White, 0.45f).copy(alpha = alpha * 0.8f),
            start = point,
            end = next,
            strokeWidth = side * 0.0025f,
            blendMode = BlendMode.Screen,
        )
        point = next
    }
}

private fun pointAlong(ridge: List<Offset>, t: Float): Offset {
    if (ridge.isEmpty()) return Offset.Zero
    val clamped = t.coerceIn(0f, 1f) * (ridge.size - 1)
    val index = clamped.toInt().coerceAtMost(ridge.size - 2)
    val fraction = clamped - index
    val a = ridge[index]
    val b = ridge[index + 1]
    return Offset(a.x + (b.x - a.x) * fraction, a.y + (b.y - a.y) * fraction)
}
