package com.knoux.crypt.data

import java.security.MessageDigest
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.locks.ReentrantReadWriteLock
import javax.crypto.SecretKey
import kotlin.concurrent.read
import kotlin.concurrent.write
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

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
 * - [withAuthorizedMutation] serializes a revocable capability with a database
 *   or journal mutation. [lock] waits for an already-authorized mutation to
 *   finish, then revokes; no mutation can *start* after revocation, and none
 *   can silently commit after the lock call returns.
 * - Locking clears cached keys and increments the generation, so all
 *   previously issued capabilities fail validation.
 * - The master key itself is not auth-bound per use; this is a session-gated
 *   design and must not be described as per-use biometric binding.
 */
class SessionManager internal constructor(private val keys: VaultKeySource) {
    constructor(keystore: KeystoreManager) : this(KeystoreKeySource(keystore))

    private data class Capability(override val generation: Long) : VaultAccess

    /** Guards in-memory access/cachedKey state. Short, non-suspending sections only. */
    private val guard = ReentrantReadWriteLock()
    private val keyCacheLock = Any()

    /**
     * Serializes mutations against revocation. A mutation holds this mutex for
     * the whole logical commit; lock() takes the same mutex before revoking.
     * This is coroutine-safe (unlike holding a thread lock across suspension).
     */
    private val mutationGate = Mutex()
    private val lockListeners = CopyOnWriteArrayList<() -> Unit>()

    private var access: VaultAccess? = null
    private var cachedKey: SecretKey? = null
    private var generation = 0L

    /**
     * When the live capability was minted. Used by screens that must refuse a
     * long-idle sensitive action; zero while locked.
     */
    @Volatile private var unlockedAtMillis: Long = 0L

    /**
     * Cached platform protection class for the fixed master-key alias. This is
     * display metadata only — it is never an authorization input, so caching it
     * cannot let a stale value grant access. It exists because the Keystore
     * binder probe was otherwise repeated on every recomposition.
     */
    @Volatile private var cachedSecurityLevel: String? = null
    @Volatile private var lastSecurityLevelProbeMillis = 0L
    private val _unlocked = MutableStateFlow(false)
    val unlocked: StateFlow<Boolean> = _unlocked.asStateFlow()

    companion object {
        /** Minimum gap between Keystore protection-class probes while unprovisioned. */
        const val SECURITY_LEVEL_RETRY_MILLIS = 5_000L
    }

    val isUnlocked: Boolean
        get() = guard.read { access != null }

    /**
     * Verifies the stored unlock token over an auth-bound gate cipher and only
     * then mints a capability. The cipher instance must have been created by
     * the Keystore gate store; a UI callback cannot construct this proof.
     */
    internal suspend fun authorizeUnlock(gate: GateCipher, payload: ByteArray) {
        require(gate.purpose == GatePurpose.UNLOCK) { "Not an unlock cipher" }
        val plain = gate.doFinal(payload)
        if (!MessageDigest.isEqual(plain, UnlockProtocol.TOKEN)) {
            throw UnlockRejectedException()
        }
        openSession()
    }

    /**
     * Verifies the unlock token without minting a new capability. Used for
     * explicit owner re-authentication before a sensitive migration while an
     * unlocked session already exists.
     */
    internal fun verifyUnlockProof(gate: GateCipher, payload: ByteArray) {
        require(gate.purpose == GatePurpose.UNLOCK) { "Not an unlock cipher" }
        val plain = gate.doFinal(payload)
        if (!MessageDigest.isEqual(plain, UnlockProtocol.TOKEN)) {
            throw UnlockRejectedException()
        }
    }

    /**
     * Opens a brand-new vault after the setup cipher has proved a real
     * auth-bound Keystore operation. Refuses if any master key already exists,
     * which is the data-ownership anchor for an existing vault.
     */
    internal suspend fun authorizeEnrollment(gate: GateCipher) {
        require(gate.purpose == GatePurpose.ENROLL) { "Not an enrollment cipher" }
        if (keys.hasMasterKey()) throw UnlockReenrollmentBlockedException()
        openSession()
    }

    private suspend fun openSession() = mutationGate.withLock {
        guard.write {
            generation += 1
            access = Capability(generation)
            unlockedAtMillis = System.currentTimeMillis()
            synchronized(keyCacheLock) { cachedKey = null }
            _unlocked.value = true
        }
    }

    /**
     * Runs a mutation under the revocation boundary. Lock waits for an
     * already-started authorized mutation to finish; a mutation that starts
     * after revocation fails before touching storage. Callers must keep the
     * block to the logical commit (not long non-mutating work) so locking does
     * not stall.
     */
    internal suspend fun <T> withAuthorizedMutation(
        access: VaultAccess,
        block: suspend () -> T,
    ): T = mutationGate.withLock {
        requireValid(access)
        block()
    }

    /**
     * Registers a non-suspending cleanup hook (for example clipboard clearing)
     * invoked after every revocation.
     */
    fun addOnLockListener(listener: () -> Unit) {
        lockListeners.add(listener)
    }

    /** Revokes the capability, drops the cached key handle and invalidates stale access objects. */
    suspend fun lock() = mutationGate.withLock {
        guard.write {
            access = null
            unlockedAtMillis = 0L
            synchronized(keyCacheLock) { cachedKey = null }
            generation += 1
            _unlocked.value = false
        }
        lockListeners.forEach { listener -> runCatching(listener) }
    }

    /** Millis since the live capability was minted, or null while locked. */
    fun sessionAgeMillis(nowMillis: Long = System.currentTimeMillis()): Long? = guard.read {
        if (access == null) null else (nowMillis - unlockedAtMillis).coerceAtLeast(0L)
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

    /**
     * Reports the platform's actual key protection class, or null before
     * provisioning. The value is cached because it describes a fixed alias and
     * the Keystore probe is a binder call; it is display metadata and is never
     * consulted for authorization. While nothing is provisioned the probe is
     * throttled instead of cached, so a UI that recomposes frequently cannot
     * generate Keystore traffic per frame, and provisioning is still observed
     * within [SECURITY_LEVEL_RETRY_MILLIS].
     */
    fun keySecurityLevel(): String? {
        cachedSecurityLevel?.let { return it }
        val now = System.currentTimeMillis()
        if (now - lastSecurityLevelProbeMillis < SECURITY_LEVEL_RETRY_MILLIS) return null
        lastSecurityLevelProbeMillis = now
        val level = runCatching { keys.masterKeySecurityLevel() }.getOrNull() ?: return null
        cachedSecurityLevel = level
        return level
    }
}
