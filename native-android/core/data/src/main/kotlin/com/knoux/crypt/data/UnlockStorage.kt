package com.knoux.crypt.data

import android.content.Context
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.unlockDataStore by preferencesDataStore("knoux_unlock")

/**
 * Persists only Base64 unlock-token ciphertext, the active gate slot and a
 * non-secret recovery reason. The gate keys never leave the Android Keystore.
 *
 * Migration safety: existing installations already store the primary token in
 * [KEY_PRIMARY]. A missing active-slot preference therefore means PRIMARY.
 */
internal class DataStoreGateTokenStore(context: Context) : GateTokenStore {
    companion object {
        private val KEY_PRIMARY = stringPreferencesKey("token_blob")
        private val KEY_ALTERNATE = stringPreferencesKey("alternate_blob")
        private val KEY_ACTIVE = stringPreferencesKey("active_slot")
        private val KEY_RECOVERY = stringPreferencesKey("recovery_reason")
    }

    private val appContext = context.applicationContext

    override suspend fun activeSlot(): GateSlot {
        val stored = appContext.unlockDataStore.data.first()[KEY_ACTIVE]
        return if (stored == GateSlot.ALTERNATE.name) GateSlot.ALTERNATE else GateSlot.PRIMARY
    }

    override suspend fun setActiveSlot(slot: GateSlot) {
        appContext.unlockDataStore.edit { it[KEY_ACTIVE] = slot.name }
    }

    override suspend fun blob(slot: GateSlot): ByteArray? {
        val encoded = appContext.unlockDataStore.data.first()[keyFor(slot)] ?: return null
        return runCatching { Base64.decode(encoded, Base64.NO_WRAP) }.getOrNull()
            ?.takeIf(UnlockProtocol::isValidBlob)
    }

    override suspend fun writeBlob(slot: GateSlot, blob: ByteArray) {
        val encoded = Base64.encodeToString(blob, Base64.NO_WRAP)
        appContext.unlockDataStore.edit { it[keyFor(slot)] = encoded }
    }

    override suspend fun clearBlob(slot: GateSlot) {
        appContext.unlockDataStore.edit { it.remove(keyFor(slot)) }
    }

    override suspend fun recoveryReason(): String? =
        appContext.unlockDataStore.data.first()[KEY_RECOVERY]

    override suspend fun setRecoveryReason(reason: String?) {
        appContext.unlockDataStore.edit {
            if (reason == null) it.remove(KEY_RECOVERY) else it[KEY_RECOVERY] = reason
        }
    }

    private fun keyFor(slot: GateSlot) =
        if (slot == GateSlot.PRIMARY) KEY_PRIMARY else KEY_ALTERNATE
}

/**
 * Keeps the Keystore gate operations internal. A public KeystoreManager cannot
 * leak the gate cipher factories or the master-key accessor to the app module.
 */
private class KeystoreGateKeyStore(private val keystore: KeystoreManager) : GateKeyStore {
    override fun hasMasterKey(): Boolean = keystore.hasMasterKey()
    override fun hasGate(slot: GateSlot): Boolean = keystore.hasGate(slot)
    override fun createGateIfNeeded(slot: GateSlot) = keystore.createGateIfNeeded(slot)
    override fun deleteGate(slot: GateSlot) = keystore.deleteGate(slot)
    override fun newEncryptGate(slot: GateSlot): GateCipher = keystore.newEncryptGate(slot)
    override fun newDecryptGate(slot: GateSlot, iv: ByteArray): GateCipher =
        keystore.newDecryptGate(slot, iv)
    override fun isInvalidated(failure: Throwable): Boolean = keystore.isInvalidated(failure)
}

/** Public construction point so the app module never sees the security internals. */
object UnlockManagers {
    fun create(context: Context, keystore: KeystoreManager, session: SessionManager): UnlockManager =
        UnlockManager(KeystoreGateKeyStore(keystore), DataStoreGateTokenStore(context), session)
}
