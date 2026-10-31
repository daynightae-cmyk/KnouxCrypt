package com.knoux.crypt.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The app must be silent until the owner opts in, and volume edges must be safe. */
class AudioPolicyTest {

    @Test
    fun startupDefaultsAreSilent() {
        assertFalse(AudioPolicy.DEFAULT_MASTER_ENABLED)
        assertTrue(AudioPolicy.DEFAULT_AMBIENT_VOLUME in 0f..1f)
        assertTrue(AudioPolicy.DEFAULT_UI_VOLUME in 0f..1f)
        assertFalse(AudioPolicy.ambientAudible(AudioPolicy.DEFAULT_MASTER_ENABLED, AudioPolicy.DEFAULT_AMBIENT_VOLUME))
        assertFalse(
            AudioPolicy.uiAudible(
                AudioPolicy.DEFAULT_MASTER_ENABLED,
                AudioPolicy.DEFAULT_UI_ENABLED,
                AudioPolicy.DEFAULT_UI_VOLUME,
            ),
        )
    }

    @Test
    fun volumeIsClampedAndRejectedRatherThanGuessed() {
        assertEquals(0f, AudioPolicy.clampVolume(-3f), 0f)
        assertEquals(1f, AudioPolicy.clampVolume(9f), 0f)
        assertEquals(0.42f, AudioPolicy.clampVolume(0.42f), 0f)
        assertEquals(AudioPolicy.DEFAULT_AMBIENT_VOLUME, AudioPolicy.clampVolume(Float.NaN), 0f)
        assertEquals(AudioPolicy.DEFAULT_AMBIENT_VOLUME, AudioPolicy.clampVolume(Float.POSITIVE_INFINITY), 0f)

        assertTrue(runCatching { AudioPolicy.requireVolume(-0.01f) }.isFailure)
        assertTrue(runCatching { AudioPolicy.requireVolume(1.01f) }.isFailure)
        assertTrue(runCatching { AudioPolicy.requireVolume(Float.NaN) }.isFailure)
        assertEquals(0.5f, AudioPolicy.requireVolume(0.5f), 0f)
    }

    @Test
    fun channelsNeedTheirOwnGateNotJustMaster() {
        assertTrue(AudioPolicy.ambientAudible(true, 0.6f))
        assertFalse(AudioPolicy.ambientAudible(true, 0f))
        assertFalse(AudioPolicy.ambientAudible(false, 0.6f))

        assertTrue(AudioPolicy.uiAudible(true, true, 0.6f))
        assertFalse(AudioPolicy.uiAudible(false, true, 0.6f))
        assertFalse(AudioPolicy.uiAudible(true, false, 0.6f))
        assertFalse(AudioPolicy.uiAudible(true, true, AudioPolicy.SILENCE_THRESHOLD))
    }
}
