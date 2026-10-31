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
 * Managed clipboard leases for copied vault secrets.
 *
 * A sensitive copy is cleared after the configured timeout and on every session
 * lock, but only if the clipboard still contains our exact value. Android may
 * keep clipboard data after process death or if another app replaces it; this
 * class makes no OS-level guarantee and never clears a foreign value silently.
 * API 33+ marks managed clips sensitive.
 */
class ClipboardPrivacy(
    context: Context,
    private val settings: SettingsRepository,
    private val scope: CoroutineScope,
) {
    private data class Lease(
        val value: String,
        val label: String,
        val copiedAtMillis: Long,
        val expiresAtMillis: Long?,
    )

    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private var clearJob: Job? = null

    @Volatile
    private var lease: Lease? = null

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
        val now = System.currentTimeMillis()
        val currentLease = Lease(
            value = value,
            label = label,
            copiedAtMillis = now,
            expiresAtMillis = if (timeout > 0) now + timeout * 1000L else null,
        )
        lease = currentLease
        clearJob?.cancel()
        if (timeout > 0) {
            clearJob = scope.launch {
                delay(timeout * 1000L)
                clearManaged()
            }
        }
    }

    /** Metadata-only exposure snapshot. Must be called on the main thread. */
    fun exposure(): ClipboardExposure {
        checkMainThread()
        val read = readClipboard()
        val current = read.text
        val currentLease = lease
        val matches = currentLease != null && read.available && current != null && current == currentLease.value
        val expired = currentLease?.expiresAtMillis?.let { System.currentTimeMillis() >= it } == true
        val state = ClipboardLeasePolicy.classify(
            canRead = read.available,
            hasText = current != null && current.isNotEmpty(),
            currentMatchesLease = matches,
            leasePresent = currentLease != null,
            expired = expired,
        )
        if (state == ClipboardLeaseState.FOREIGN && currentLease != null) {
            // Another app or a previous process changed the clip. Drop our
            // ownership claim; never silently clear the new content.
            lease = null
        }
        val metadataLease = if (state == ClipboardLeaseState.MANAGED || state == ClipboardLeaseState.EXPIRED) currentLease else null
        return ClipboardExposure(
            state = state,
            charCount = current?.length,
            label = metadataLease?.label,
            copiedAtMillis = metadataLease?.copiedAtMillis,
            expiresAtMillis = metadataLease?.expiresAtMillis,
            owned = ClipboardLeasePolicy.canAutoClear(state),
        )
    }

    /** Clears only a value this process still owns. */
    fun clearIfOwned(): ClipboardClearOutcome {
        checkMainThread()
        val read = readClipboard()
        if (!read.available) return ClipboardClearOutcome.UNAVAILABLE
        val current = read.text
        val currentLease = lease
        if (current == null || current.isEmpty()) {
            lease = null
            return ClipboardClearOutcome.NOTHING
        }
        if (currentLease == null || current != currentLease.value) {
            lease = null
            return ClipboardClearOutcome.NOT_OWNED
        }
        return clearClipboard()
    }

    /** Explicit user action after a confirmation dialog; can clear foreign text. */
    fun clearCurrentExplicit(): ClipboardClearOutcome {
        checkMainThread()
        val read = readClipboard()
        if (!read.available) return ClipboardClearOutcome.UNAVAILABLE
        if (read.text.isNullOrEmpty()) {
            lease = null
            return ClipboardClearOutcome.NOTHING
        }
        return clearClipboard()
    }

    /** Lock-listener path: clear only a managed value. Safe to call off-main. */
    fun clearNow() {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post { clearNow() }
            return
        }
        clearManaged()
    }

    private fun clearManaged() {
        val currentLease = lease ?: return
        val read = readClipboard()
        if (read.available && read.text == currentLease.value) {
            clearClipboard()
        } else {
            // Ownership is gone or unreadable; never clear a foreign value.
            lease = null
            clearJob?.cancel()
            clearJob = null
        }
    }

    private fun clearClipboard(): ClipboardClearOutcome {
        val manager = appContext.getSystemService(ClipboardManager::class.java)
            ?: return ClipboardClearOutcome.UNAVAILABLE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            manager.clearPrimaryClip()
        } else {
            manager.setPrimaryClip(ClipData.newPlainText("", ""))
        }
        lease = null
        clearJob?.cancel()
        clearJob = null
        return ClipboardClearOutcome.CLEARED
    }

    private data class ClipRead(val available: Boolean, val text: String?)

    private fun readClipboard(): ClipRead {
        val manager = appContext.getSystemService(ClipboardManager::class.java)
            ?: return ClipRead(false, null)
        return try {
            val text = manager.primaryClip
                ?.takeIf { it.itemCount > 0 }
                ?.getItemAt(0)
                ?.coerceToText(appContext)
                ?.toString()
            ClipRead(true, text)
        } catch (_: SecurityException) {
            ClipRead(false, null)
        } catch (_: Exception) {
            ClipRead(false, null)
        }
    }

    private fun checkMainThread() {
        check(Looper.myLooper() == Looper.getMainLooper()) {
            "Clipboard metadata must be accessed on the main thread"
        }
    }
}
