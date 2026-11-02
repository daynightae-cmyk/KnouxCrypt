package com.knoux.crypt.ui

import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.media.MediaDataSource
import android.media.MediaPlayer
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.VaultMediaItem
import com.knoux.crypt.data.VaultRandomAccessReader
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.tr
import java.io.IOException
import kotlinx.coroutines.delay

/**
 * MediaDataSource over [VaultRandomAccessReader]. MediaPlayer asks for byte
 * ranges; every range is authenticated before it is returned, so seeking and
 * playback never need a decrypted file. Reads fail after a vault lock.
 */
private class VaultMediaDataSource(
    private val reader: VaultRandomAccessReader,
) : MediaDataSource() {
    override fun readAt(position: Long, buffer: ByteArray, offset: Int, size: Int): Int =
        try {
            reader.readAt(position, buffer, offset, size)
        } catch (failure: Exception) {
            throw IOException("Authenticated media read failed", failure)
        }

    override fun getSize(): Long = reader.plaintextLength

    override fun close() = reader.close()
}

@Composable
fun SecureMediaPlayer(
    item: VaultMediaItem,
    container: AppContainer,
    video: Boolean,
    onClose: () -> Unit,
) {
    val access = container.session.currentAccess()
    val context = LocalContext.current
    val surfaceView = remember { SurfaceView(context) }
    var player by remember(item.id) { mutableStateOf<MediaPlayer?>(null) }
    var dataSource by remember(item.id) { mutableStateOf<VaultMediaDataSource?>(null) }
    var prepared by remember(item.id) { mutableStateOf(false) }
    var playing by remember(item.id) { mutableStateOf(false) }
    var duration by remember(item.id) { mutableLongStateOf(item.payload?.durationMs ?: 0L) }
    var position by remember(item.id) { mutableLongStateOf(0L) }
    var dragging by remember(item.id) { mutableStateOf(false) }
    var dragPosition by remember(item.id) { mutableStateOf(0f) }
    var error by remember(item.id) { mutableStateOf<String?>(null) }
    val currentPlayer = rememberUpdatedState(player)

    DisposableEffect(item.id) {
        val callback = object : SurfaceHolder.Callback {
            override fun surfaceCreated(holder: SurfaceHolder) {
                currentPlayer.value?.setSurface(holder.surface)
            }

            override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) = Unit

            override fun surfaceDestroyed(holder: SurfaceHolder) {
                runCatching { currentPlayer.value?.setSurface(null) }
            }
        }
        if (video) surfaceView.holder.addCallback(callback)
        onDispose {
            if (video) runCatching { surfaceView.holder.removeCallback(callback) }
            runCatching { player?.release() }
            player = null
            runCatching { dataSource?.close() }
            dataSource = null
        }
    }

    LaunchedEffect(item.id, access) {
        if (access == null) {
            error = "The vault is locked."
            return@LaunchedEffect
        }
        try {
            val reader = container.shadowVault.openReader(access, item.id)
            val source = VaultMediaDataSource(reader)
            dataSource = source
            val mediaPlayer = MediaPlayer()
            player = mediaPlayer
            mediaPlayer.setDataSource(source)
            mediaPlayer.setOnPreparedListener { ready ->
                prepared = true
                duration = ready.duration.toLong().coerceAtLeast(0L)
                ready.start()
                playing = true
            }
            mediaPlayer.setOnCompletionListener {
                playing = false
                position = duration
            }
            mediaPlayer.setOnErrorListener { _, what, extra ->
                error = "Playback stopped (error $what/$extra). The encrypted stream may be damaged."
                playing = false
                true
            }
            if (video) {
                val surface: Surface? = surfaceView.holder.surface
                if (surface != null && surface.isValid) mediaPlayer.setSurface(surface)
            }
            mediaPlayer.prepareAsync()
        } catch (failure: Throwable) {
            error = failure.message ?: "The encrypted media could not be opened."
        }
    }

    LaunchedEffect(playing) {
        while (playing) {
            position = player?.currentPosition?.toLong() ?: 0L
            duration = player?.duration?.toLong()?.takeIf { it > 0 } ?: duration
            delay(400)
        }
    }

    Column(Modifier.fillMaxWidth()) {
        if (video) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color.Black),
            ) {
                if (error == null) {
                    AndroidView(factory = { surfaceView }, modifier = Modifier.fillMaxSize())
                }
            }
        } else {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(170.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(KnouxColors.VioletDeep.copy(alpha = 0.5f), KnouxColors.Obsidian),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (prepared) tr("Encrypted audio playing", "يُشغَّل الصوت المشفر")
                    else tr("Opening encrypted audio", "جارٍ فتح الصوت المشفر"),
                    style = MaterialTheme.typography.titleMedium,
                    color = KnouxColors.Violet,
                )
            }
        }

        error?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodySmall,
                color = KnouxColors.Alert,
                modifier = Modifier.padding(top = 10.dp),
            )
        }

        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TextButton(
                onClick = {
                    val current = player ?: return@TextButton
                    if (!prepared) return@TextButton
                    if (current.isPlaying) {
                        current.pause()
                        playing = false
                    } else {
                        current.start()
                        playing = true
                    }
                },
                enabled = prepared && error == null,
            ) {
                Text(if (playing) tr("Pause", "إيقاف مؤقت") else tr("Play", "تشغيل"))
            }
            Text(
                "${formatDuration(position)} / ${formatDuration(duration)}",
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Muted,
            )
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onClose) { Text(tr("Close", "إغلاق")) }
        }
        if (prepared && duration > 0) {
            Slider(
                value = if (dragging) dragPosition.coerceIn(0f, duration.toFloat()) else
                    position.toFloat().coerceIn(0f, duration.toFloat()),
                onValueChange = {
                    dragging = true
                    dragPosition = it
                },
                onValueChangeFinished = {
                    player?.seekTo(dragPosition.toInt())
                    position = dragPosition.toLong()
                    dragging = false
                },
                valueRange = 0f..duration.toFloat(),
            )
        }
    }
}

internal fun formatDuration(millis: Long): String {
    val totalSeconds = (millis / 1000L).coerceAtLeast(0L)
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "%d:%02d".format(minutes, seconds)
}