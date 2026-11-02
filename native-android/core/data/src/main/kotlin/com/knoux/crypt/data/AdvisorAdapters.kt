package com.knoux.crypt.data

import android.content.Context
import android.os.Build
import android.content.pm.PackageManager
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

/**
 * Reads the Android framework signals the advisor is allowed to see. Nothing here
 * enumerates other packages, inspects running processes or touches the network:
 * `GET_PERMISSIONS` is queried for this app's own package only, which is the one
 * permission list this build can honestly report.
 */
class AndroidDeviceSignals(context: Context) : DeviceSignals {
    private val appContext = context.applicationContext
    private val keyguard = appContext.getSystemService(Context.KEYGUARD_SERVICE)
        as android.app.KeyguardManager?

    override fun isDeviceSecure(): Boolean? =
        runCatching { keyguard?.isDeviceSecure }.getOrNull()

    override fun securityPatch(): String? =
        runCatching { Build.VERSION.SECURITY_PATCH }.getOrNull()

    override fun declaredPermissions(): List<String> = runCatching {
        val info = appContext.packageManager.getPackageInfo(
            appContext.packageName,
            PackageManager.GET_PERMISSIONS,
        )
        info.requestedPermissions?.toList().orEmpty()
    }.getOrDefault(emptyList())
}

private val Context.advisorDataStore by preferencesDataStore("knoux_advisor")

/**
 * Dismissal records for the advisor. Non-secret by construction: the stored value
 * is a fixed check code plus an epoch millis, so plain preferences are the correct
 * place and no vault capability is needed to read or clear them.
 */
class DataStoreAdvisorDismissalStore(context: Context) : AdvisorDismissalStore {
    private val store = context.applicationContext.advisorDataStore

    override suspend fun dismissed(): Set<String> =
        store.data.first()[KEY] ?: emptySet()

    override suspend fun dismiss(check: AdvisorCheckId) {
        val code = check.code
        store.edit { prefs ->
            val current = prefs[KEY] ?: emptySet()
            prefs[KEY] = (current.filterNot { it.substringBefore('@') == code } + "$code@${System.currentTimeMillis()}").toSet()
        }
    }

    override suspend fun restore(check: AdvisorCheckId) {
        val code = check.code
        store.edit { prefs ->
            val current = prefs[KEY] ?: emptySet()
            val next = current.filterNot { it.substringBefore('@') == code }.toSet()
            if (next.isEmpty()) prefs.remove(KEY) else prefs[KEY] = next
        }
    }

    override suspend fun clearAll() {
        store.edit { it.remove(KEY) }
    }

    /** When a check was dismissed, for the UI to state it truthfully. */
    suspend fun dismissedAt(check: AdvisorCheckId): Long? {
        val code = check.code
        val entry = dismissed().firstOrNull { it.substringBefore('@') == code } ?: return null
        return entry.substringAfter('@').toLongOrNull()
    }

    private companion object {
        val KEY = stringSetPreferencesKey("advisor_dismissals")
    }
}
