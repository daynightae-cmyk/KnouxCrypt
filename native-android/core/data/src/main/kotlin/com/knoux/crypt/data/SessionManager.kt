package com.knoux.crypt.data

import javax.crypto.SecretKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** A live, in-memory authorization produced only by a successful Keystore key use. */
class VaultAccess internal constructor()

/**
 * Holds session authorization and the non-exportable data-key handle.
 * Locking drops both; the Keystore key remains, but no app code can use it
 * through this boundary until a new authenticated unlock succeeds.
 */
class SessionManager(private val keystore: KeystoreManager) {
    private var access: VaultAccess? = null
    private var cachedKey: SecretKey? = null
    private val _unlocked = MutableStateFlow(false)
    val unlocked: StateFlow<Boolean> = _unlocked.asStateFlow()

    val isUnlocked: Boolean
        @Synchronized get() = access != null

    @Synchronized
    internal fun unlock() {
        access = VaultAccess()
        _unlocked.value = true
    }

    @Synchronized
    fun lock() {
        access = null
        cachedKey = null
        _unlocked.value = false
    }

    @Synchronized
    fun currentAccess(): VaultAccess? = access

    @Synchronized
    internal fun key(access: VaultAccess): SecretKey {
        require(this.access === access) { "Vault is locked" }
        return cachedKey ?: keystore.masterKey().also { cachedKey = it }
    }

    /** Reports the platform's actual key protection class, or null before provisioning. */
    fun keySecurityLevel(): String? = keystore.masterKeySecurityLevel()
}
