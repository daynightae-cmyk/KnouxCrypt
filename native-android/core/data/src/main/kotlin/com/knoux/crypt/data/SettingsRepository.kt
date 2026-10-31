package com.knoux.crypt.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.knoux.crypt.security.AudioPolicy
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

data class AppSettings(
    val language: String = "en",
    val reducedMotion: Boolean = false,
    val autoLockSeconds: Int = SessionPrivacyPolicy.DEFAULT_AUTO_LOCK_SECONDS,
    val lockOnScreenOff: Boolean = SessionPrivacyPolicy.DEFAULT_LOCK_ON_SCREEN_OFF,
    val clipboardClearSeconds: Int = SessionPrivacyPolicy.DEFAULT_CLIPBOARD_SECONDS,
    val blockScreenshots: Boolean = SessionPrivacyPolicy.DEFAULT_BLOCK_SCREENSHOTS,
    val maskOnAppSwitch: Boolean = true,
    val audioEnabled: Boolean = AudioPolicy.DEFAULT_MASTER_ENABLED,
    val ambientVolume: Float = AudioPolicy.DEFAULT_AMBIENT_VOLUME,
    val uiSoundsEnabled: Boolean = AudioPolicy.DEFAULT_UI_ENABLED,
    val uiVolume: Float = AudioPolicy.DEFAULT_UI_VOLUME,
)

private val Context.settingsDataStore by preferencesDataStore("knoux_settings")

/** Nonsecret preferences only. No tokens, keys, inbox addresses or content. */
class SettingsRepository(context: Context) {
    private companion object {
        val LANGUAGE = stringPreferencesKey("language")
        val REDUCED_MOTION = booleanPreferencesKey("reduced_motion")
        val AUTO_LOCK = intPreferencesKey("auto_lock_seconds")
        val LOCK_SCREEN_OFF = booleanPreferencesKey("lock_on_screen_off")
        val CLIPBOARD_CLEAR = intPreferencesKey("clipboard_clear_seconds")
        val BLOCK_SCREENSHOTS = booleanPreferencesKey("block_screenshots")
        val MASK_APP_SWITCH = booleanPreferencesKey("mask_on_app_switch")
        val AUDIO_ENABLED = booleanPreferencesKey("audio_enabled")
        val AMBIENT_VOLUME = floatPreferencesKey("ambient_volume")
        val UI_SOUNDS = booleanPreferencesKey("ui_sounds_enabled")
        val UI_VOLUME = floatPreferencesKey("ui_volume")
    }

    private val store = context.applicationContext.settingsDataStore

    val settings: Flow<AppSettings> = store.data.map { prefs ->
        AppSettings(
            language = prefs[LANGUAGE]?.takeIf { it == "ar" || it == "en" } ?: "en",
            reducedMotion = prefs[REDUCED_MOTION] ?: false,
            autoLockSeconds = prefs[AUTO_LOCK]
                ?.takeIf { it in SessionPrivacyPolicy.AUTO_LOCK_CHOICES_SECONDS }
                ?: SessionPrivacyPolicy.DEFAULT_AUTO_LOCK_SECONDS,
            lockOnScreenOff = prefs[LOCK_SCREEN_OFF] ?: SessionPrivacyPolicy.DEFAULT_LOCK_ON_SCREEN_OFF,
            clipboardClearSeconds = prefs[CLIPBOARD_CLEAR]
                ?.takeIf { it in SessionPrivacyPolicy.CLIPBOARD_CHOICES_SECONDS }
                ?: SessionPrivacyPolicy.DEFAULT_CLIPBOARD_SECONDS,
            blockScreenshots = prefs[BLOCK_SCREENSHOTS] ?: SessionPrivacyPolicy.DEFAULT_BLOCK_SCREENSHOTS,
            maskOnAppSwitch = prefs[MASK_APP_SWITCH] ?: true,
            audioEnabled = prefs[AUDIO_ENABLED] ?: AudioPolicy.DEFAULT_MASTER_ENABLED,
            ambientVolume = prefs[AMBIENT_VOLUME]
                ?.let { AudioPolicy.clampVolume(it) }
                ?: AudioPolicy.DEFAULT_AMBIENT_VOLUME,
            uiSoundsEnabled = prefs[UI_SOUNDS] ?: AudioPolicy.DEFAULT_UI_ENABLED,
            uiVolume = prefs[UI_VOLUME]
                ?.let { AudioPolicy.clampVolume(it) }
                ?: AudioPolicy.DEFAULT_UI_VOLUME,
        )
    }

    suspend fun setLanguage(language: String) {
        require(language == "ar" || language == "en")
        store.edit { it[LANGUAGE] = language }
    }

    suspend fun setReducedMotion(enabled: Boolean) {
        store.edit { it[REDUCED_MOTION] = enabled }
    }

    suspend fun setAutoLockSeconds(seconds: Int) {
        store.edit { it[AUTO_LOCK] = SessionPrivacyPolicy.requireAutoLockSeconds(seconds) }
    }

    suspend fun setLockOnScreenOff(enabled: Boolean) {
        store.edit { it[LOCK_SCREEN_OFF] = enabled }
    }

    suspend fun setClipboardClearSeconds(seconds: Int) {
        store.edit { it[CLIPBOARD_CLEAR] = SessionPrivacyPolicy.requireClipboardSeconds(seconds) }
    }

    suspend fun setBlockScreenshots(enabled: Boolean) {
        store.edit { it[BLOCK_SCREENSHOTS] = enabled }
    }

    suspend fun setMaskOnAppSwitch(enabled: Boolean) {
        store.edit { it[MASK_APP_SWITCH] = enabled }
    }

    suspend fun setAudioEnabled(enabled: Boolean) {
        store.edit { it[AUDIO_ENABLED] = enabled }
    }

    suspend fun setAmbientVolume(volume: Float) {
        store.edit { it[AMBIENT_VOLUME] = AudioPolicy.requireVolume(volume) }
    }

    suspend fun setUiSoundsEnabled(enabled: Boolean) {
        store.edit { it[UI_SOUNDS] = enabled }
    }

    suspend fun setUiVolume(volume: Float) {
        store.edit { it[UI_VOLUME] = AudioPolicy.requireVolume(volume) }
    }
}
