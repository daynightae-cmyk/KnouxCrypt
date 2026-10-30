package com.knoux.crypt.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

data class AppSettings(
    val language: String = "en",
    val reducedMotion: Boolean = false,
)

private val Context.settingsDataStore by preferencesDataStore("knoux_settings")

/** Nonsecret preferences only. No tokens, keys, inbox addresses or content. */
class SettingsRepository(context: Context) {
    private companion object {
        val LANGUAGE = stringPreferencesKey("language")
        val REDUCED_MOTION = booleanPreferencesKey("reduced_motion")
    }

    private val store = context.applicationContext.settingsDataStore

    val settings: Flow<AppSettings> = store.data.map { prefs ->
        AppSettings(
            language = prefs[LANGUAGE]?.takeIf { it == "ar" || it == "en" } ?: "en",
            reducedMotion = prefs[REDUCED_MOTION] ?: false,
        )
    }

    suspend fun setLanguage(language: String) {
        require(language == "ar" || language == "en")
        store.edit { it[LANGUAGE] = language }
    }

    suspend fun setReducedMotion(enabled: Boolean) {
        store.edit { it[REDUCED_MOTION] = enabled }
    }
}
