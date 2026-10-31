package com.knoux.crypt

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import com.knoux.crypt.data.SettingsRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Real clipboard clearing for copied vault secrets.
 *
 * A sensitive copy is cleared after the configured timeout and on every session
 * lock, but only if the clipboard still contains our exact value. Android may
 * keep clipboard data after process death or if another app replaces it; this
 * class makes no OS-level guarantee. API 33+ marks the clip sensitive.
 */
class ClipboardPrivacy(
    context: Context,
    private val settings: SettingsRepository,
    private val scope: CoroutineScope,
) {
    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private var clearJob: Job? = null

    @Volatile
    private var lastCopied: String? = null

    suspend fun copySensitive(value: String, label: String = "KNOUX sensitive value") {
        if (value.isEmpty()) return
        val timeout = settings.settings.first().clipboardClearSeconds
        val manager = appContext.getSystemService(ClipboardManager::class.java) ?: return
        val clip = ClipData.newPlainText(label, value)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            clip.description.extras = PersistableBundle().apply {
                putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true)
            }
        }
        manager.setPrimaryClip(clip)
        lastCopied = value
        clearJob?.cancel()
        if (timeout > 0) {
            clearJob = scope.launch {
                delay(timeout * 1000L)
                clearNow()
            }
        }
    }

    /** Clears only if the current primary clip is still our copied value. */
    fun clearNow() {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post { clearNow() }
            return
        }
        val expected = lastCopied ?: return
        val manager = appContext.getSystemService(ClipboardManager::class.java)
        val current = runCatching {
            manager?.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(appContext)?.toString()
        }.getOrNull()
        if (manager != null && current == expected) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                manager.clearPrimaryClip()
            } else {
                manager.setPrimaryClip(ClipData.newPlainText("", ""))
            }
        }
        lastCopied = null
        clearJob?.cancel()
        clearJob = null
    }
}
