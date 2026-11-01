package com.knoux.crypt.security

/**
 * Audio preferences and the gate that keeps the app silent until the owner opts
 * in. Startup is silent by construction: the master switch defaults to off, and
 * every playback path checks [ambientAudible] / [uiAudible] first.
 *
 * These are display/comfort settings, not security controls. Sound is never
 * evidence that an operation succeeded; callers play a confirmation only after
 * the underlying crypto or storage call has actually returned successfully.
 */
object AudioPolicy {
    const val DEFAULT_MASTER_ENABLED = false
    const val DEFAULT_AMBIENT_VOLUME = 0.55f
    const val DEFAULT_UI_ENABLED = true
    const val DEFAULT_UI_VOLUME = 0.70f

    /** Fade used for starting, stopping and losing audio focus. */
    const val FADE_MILLIS = 900L

    /** Below this a channel is treated as muted instead of playing silence. */
    const val SILENCE_THRESHOLD = 0.01f

    fun requireVolume(value: Float): Float {
        require(value.isFinite() && value in 0f..1f) { "Volume must be within 0..1" }
        return value
    }

    fun clampVolume(value: Float): Float =
        if (!value.isFinite()) DEFAULT_AMBIENT_VOLUME else value.coerceIn(0f, 1f)

    fun ambientAudible(masterEnabled: Boolean, volume: Float): Boolean =
        masterEnabled && volume > SILENCE_THRESHOLD

    fun uiAudible(masterEnabled: Boolean, uiEnabled: Boolean, volume: Float): Boolean =
        masterEnabled && uiEnabled && volume > SILENCE_THRESHOLD
}
