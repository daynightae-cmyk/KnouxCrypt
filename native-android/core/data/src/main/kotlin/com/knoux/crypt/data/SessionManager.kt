package com.knoux.crypt.data

import java.security.MessageDigest
import java.util.concurrent.locks.ReentrantReadWriteLock
import javax.crypto.SecretKey
import kotlin.concurrent.read
import kotlin.concurrent.write
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * A live, in-memory authorization capability.
 *
 * Instances are minted only by [SessionManager] and are invalidated by
 * [SessionManager.lock]. The type is sealed so neither the UI module nor a
 * test can implement it; holding a reference to an old capability never grants
 * access after the session generation changes.
 */
sealed interface VaultAccess {
    val generation: Long
}

/** Raised when a capability outlives its session or the vault is locked. */
class VaultLockedException(message: String = "The vault is locked") : IllegalStateException(message)

/**
 * The master data key source. Only [KeystoreManager] implements it in
 * production; the interface exists so the authorization boundary can be
 * exercised with deterministic JVM keys.
 */
internal interface VaultKeySource {
    fun hasMasterKey(): Boolean
    fun masterKey(): SecretKey
    fun masterKeySecurityLevel(): String?
}

/** Keeps the master-key accessor internal to this module; only the adapter can reach it. */
private class KeystoreKeySource(private val keystore: KeystoreManager) : VaultKeySource {
    override fun hasMasterKey(): Boolean = keystore.hasMasterKey()
    override fun masterKey(): SecretKey = keystore.masterKey()
    override fun masterKeySecurityLevel(): String? = keystore.masterKeySecurityLevel()
}

/**
 * Session authorization and the non-exportable master data-key handle.
 *
 * Security rules enforced here:
 * - Access is minted only by [authorizeUnlock], which verifies the unlock token
 *   over a cipher produced from the auth-bound Keystore unlock key.
 * - [authorizeEnrollment] can only open a brand-new vault (no master key yet).
 *   It can never open an existing vault, so setting up a replacement gate
 *   cannot grant ownership of existing ciphertext.
 * - Locking clears the cached key handle and increments the generation, so all
 *   previously issued capabilities fail validation.
 * - The master key itself is not auth-bound per use; this is a session-gated
 *   design and must not be described as per-use biometric binding.
 */
class SessionManager internal constructor(private val keys: VaultKeySource) {
    constructor(keystore: KeystoreManager) : this(KeystoreKeySource(keystore))

    private data class Capability(override val generation: Long) : VaultAccess

    private val guard = ReentrantReadWriteLock()
    private val keyCacheLock = Any()
    private var access: VaultAccess? = null
    private var cachedKey: SecretKey? = null
    private var generation = 0L
    private val _unlocked = MutableStateFlow(false)
    val unlocked: StateFlow<Boolean> = _unlocked.asStateFlow()

    val isUnlocked: Boolean
        get() = guard.read { access != null }

    /**
     * Verifies the stored unlock token over an auth-bound gate cipher and only
     * then mints a capability. The cipher instance must have been created by
     * the Keystore gate store; a UI callback cannot construct this proof.
     */
    internal fun authorizeUnlock(gate: GateCipher, payload: ByteArray) {
        require(gate.purpose == GatePurpose.UNLOCK) { "Not an unlock cipher" }
        val plain = gate.doFinal(payload)
        if (!MessageDigest.isEqual(plain, UnlockProtocol.TOKEN)) {
            throw UnlockRejectedException()
        }
        openSession()
    }

    /**
     * Opens a brand-new vault after the setup cipher has proved a real
     * auth-bound Keystore operation. Refuses if any master key already exists,
     * which is the data-ownership anchor for an existing vault.
     */
    internal fun authorizeEnrollment(gate: GateCipher) {
        require(gate.purpose == GatePurpose.ENROLL) { "Not an enrollment cipher" }
        if (keys.hasMasterKey()) throw UnlockReenrollmentBlockedException()
        openSession()
    }

    private fun openSession() = guard.write {
        generation += 1
        access = Capability(generation)
        synchronized(keyCacheLock) { cachedKey = null }
        _unlocked.value = true
    }

    /** Revokes the capability, drops the cached key handle and invalidates stale access objects. */
    fun lock() = guard.write {
        access = null
        synchronized(keyCacheLock) { cachedKey = null }
        generation += 1
        _unlocked.value = false
    }

    fun currentAccess(): VaultAccess? = guard.read { access }

    fun isValid(access: VaultAccess): Boolean = guard.read { this.access === access }

    /** Fails fast when a capability came from a previous generation or the vault is locked. */
    internal fun requireValid(access: VaultAccess) {
        guard.read {
            if (this.access !== access) throw VaultLockedException()
        }
    }

    /**
     * Returns the master-key handle only for the live capability. The handle is
     * cached for the session; locking drops this reference. Callers must still
     * re-validate after long operations because an already-obtained JCA key
     * handle cannot be revoked by the platform.
     */
    internal fun key(access: VaultAccess): SecretKey = guard.read {
        if (this.access !== access) throw VaultLockedException()
        synchronized(keyCacheLock) {
            cachedKey ?: keys.masterKey().also { cachedKey = it }
        }
    }

    /** Reports the platform's actual key protection class, or null before provisioning. */
    fun keySecurityLevel(): String? = keys.masterKeySecurityLevel()
}
