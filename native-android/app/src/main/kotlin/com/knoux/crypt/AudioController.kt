package com.knoux.crypt

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.SoundPool
import android.net.Uri
import com.knoux.crypt.data.AppSettings
import com.knoux.crypt.security.AudioPolicy
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Native ambient bed and interface sounds (TASK C).
 *
 * Everything here is local and opt-in: the master switch defaults to off, so
 * startup is silent. Sound never runs ahead of the operation it celebrates —
 * callers play a confirmation only after the real call returned successfully.
 *
 * The ambient bed is a looping [MediaPlayer] that fades in/out, holds audio
 * focus, pauses on transient focus loss and resumes on gain. Interface sounds
 * use [SoundPool] so taps stay short. All playback stops when the activity is
 * not started; nothing is mixed in the background.
 */
enum class UiSound(val resId: Int, val volumeScale: Float) {
    TAP(R.raw.knoux_ui_tap, 0.55f),
    COPY(R.raw.knoux_ui_copy, 0.7f),
    CONFIRM(R.raw.knoux_ui_confirm, 0.9f),
    UNLOCK(R.raw.knoux_ui_unlock, 1.0f),
    ERROR(R.raw.knoux_ui_error, 0.9f),
}

class AudioController(
    context: Context,
    private val scope: CoroutineScope,
) {
    private val appContext = context.applicationContext
    private val audioManager = appContext.getSystemService(AudioManager::class.java)

    private var player: MediaPlayer? = null
    private var soundPool: SoundPool? = null
    private val soundIds = HashMap<UiSound, Int>()
    private var fadeJob: Job? = null
    private var prepared = false
    private var foreground = false
    private var focusRequest: AudioFocusRequest? = null
    private var focusHeld = false
    private var ambientPlaying = false

    @Volatile
    private var settings = AppSettings()

    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK,
            -> pauseForFocusLoss()
            AudioManager.AUDIOFOCUS_GAIN -> resumeAfterFocusGain()
        }
    }

    fun onForeground() {
        foreground = true
        refresh()
    }

    fun onBackground() {
        foreground = false
        refresh()
    }

    fun updateSettings(updated: AppSettings) {
        settings = updated
        if (!AudioPolicy.uiAudible(updated.audioEnabled, updated.uiSoundsEnabled, updated.uiVolume)) {
            soundPool?.autoPause()
        }
        refresh()
    }

    /** Plays a short interface sound only when the owner enabled audio. */
    fun play(sound: UiSound) {
        val current = settings
        if (!AudioPolicy.uiAudible(current.audioEnabled, current.uiSoundsEnabled, current.uiVolume)) return
        val pool = soundPool ?: return
        val id = soundIds[sound] ?: return
        val volume = (current.uiVolume * sound.volumeScale).coerceIn(0f, 1f)
        pool.play(id, volume, volume, 1, 0, 1f)
    }

    fun release() {
        fadeJob?.cancel()
        ambientPlaying = false
        player?.runCatching {
            if (isPlaying) stop()
            release()
        }
        player = null
        prepared = false
        soundPool?.runCatching { release() }
        soundPool = null
        soundIds.clear()
        abandonFocus()
    }

    private fun refresh() {
        val current = settings
        val shouldPlayAmbient = foreground && AudioPolicy.ambientAudible(current.audioEnabled, current.ambientVolume)
        if (shouldPlayAmbient) {
            scope.launch { startAmbient(current.ambientVolume) }
            ensureSoundPool()
        } else {
            scope.launch { stopAmbient() }
        }
        soundPool?.let { if (current.audioEnabled) it.autoResume() else it.autoPause() }
    }

    private suspend fun startAmbient(targetVolume: Float) {
        if (!preparePlayer()) return
        val media = player ?: return
        if (!ensureFocus()) return
        withContext(Dispatchers.Main.immediate) {
            if (!media.isPlaying) {
                media.setVolume(0f, 0f)
                lastAppliedVolume = 0f
                runCatching { media.start() }.onFailure { return@withContext }
                ambientPlaying = true
            }
        }
        fadeTo(targetVolume)
    }

    private suspend fun stopAmbient() {
        val media = player ?: return
        if (!ambientPlaying) {
            abandonFocus()
            return
        }
        fadeTo(0f)
        withContext(Dispatchers.Main.immediate) {
            if (media.isPlaying) media.pause()
        }
        ambientPlaying = false
        abandonFocus()
    }

    private suspend fun preparePlayer(): Boolean {
        if (prepared && player != null) return true
        return withContext(Dispatchers.IO) {
            try {
                val media = MediaPlayer().apply {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build(),
                    )
                    setDataSource(
                        appContext,
                        Uri.parse("android.resource://${appContext.packageName}/${R.raw.knoux_ambient}"),
                    )
                    isLooping = true
                    setVolume(0f, 0f)
                    prepare()
                }
                player = media
                prepared = true
                true
            } catch (_: Exception) {
                // A missing or unreadable asset must never crash the app; a
                // silent runtime is the honest fallback.
                prepared = false
                false
            }
        }
    }

    private fun ensureSoundPool(): SoundPool {
        soundPool?.let { return it }
        val pool = SoundPool.Builder()
            .setMaxStreams(4)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            .build()
        UiSound.entries.forEach { sound ->
            runCatching { pool.load(appContext, sound.resId, 1) }
                .onSuccess { soundIds[sound] = it }
        }
        soundPool = pool
        return pool
    }

    private fun fadeTo(target: Float) {
        val media = player ?: return
        fadeJob?.cancel()
        fadeJob = scope.launch {
            val steps = 18
            val stepDelay = (AudioPolicy.FADE_MILLIS / steps).coerceAtLeast(10L)
            val from = lastAppliedVolume
            for (index in 1..steps) {
                val value = from + (target - from) * (index.toFloat() / steps)
                runCatching { media.setVolume(value, value) }
                lastAppliedVolume = value
                delay(stepDelay)
            }
        }
    }

    @Volatile
    private var lastAppliedVolume = 0f

    private fun ensureFocus(): Boolean {
        if (focusHeld) return true
        val manager = audioManager ?: return false
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build(),
            )
            .setWillPauseWhenDucked(true)
            .setOnAudioFocusChangeListener(focusListener)
            .build()
        val result = manager.requestAudioFocus(request)
        focusRequest = request
        focusHeld = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        return focusHeld
    }

    private fun abandonFocus() {
        val manager = audioManager ?: return
        focusRequest?.let { manager.abandonAudioFocusRequest(it) }
        focusRequest = null
        focusHeld = false
    }

    private fun pauseForFocusLoss() {
        focusHeld = false
        scope.launch { stopAmbient() }
        soundPool?.autoPause()
    }

    private fun resumeAfterFocusGain() {
        focusHeld = true
        refresh()
    }
}
