package com.knoux.crypt.data

import javax.crypto.Cipher

/**
 * Owns the unlock-gate lifecycle. This class performs no unlock on its own:
 * [SessionManager] verifies the token over the auth-bound cipher and mints the
 * capability only after a real Keystore operation.
 *
 * Invariants:
 * - Fresh enrollment is only possible when no vault exists (no master key and no
 *   gate token). A locked or guest user cannot replace the gate and thereby
 *   claim existing ciphertext.
 * - Gate replacement requires a live unlocked session and is atomic: the new
 *   gate lives in the inactive slot and only becomes active after the
 *   auth-bound cipher has produced and persisted a fresh token. Cancelling or
 *   crashing leaves the old gate usable.
 * - Biometric invalidation never deletes vault data or gate material. It is
 *   surfaced as a persisted recovery-required reason instead.
 */
class UnlockManager internal constructor(
    private val gates: GateKeyStore,
    private val tokens: GateTokenStore,
    private val session: SessionManager,
) {
    companion object {
        const val RECOVERY_BIOMETRIC_INVALIDATED = "biometric-key-invalidated"
        const val RECOVERY_GATE_MISSING = "vault-gate-missing"
    }

    private var preparedSetup: GateCipher? = null
    private var preparedSetupSlot: GateSlot? = null
    private var preparedUnlock: GateCipher? = null
    private var preparedRotation: GateCipher? = null
    private var preparedRotationSlot: GateSlot? = null

    /** True only when an active slot has both its Keystore key and its token blob. */
    suspend fun isConfigured(): Boolean = usableSlot() != null

    /** True when a master key or any gate token exists; used for recovery messaging. */
    suspend fun hasExistingVault(): Boolean =
        gates.hasMasterKey() || GateSlot.entries.any { tokens.blob(it) != null }

    suspend fun recoveryReason(): String? = tokens.recoveryReason()

    /**
     * Prepares a brand-new vault gate. Fails when a master key or any gate token
     * already exists; an orphaned gate key without a token (an interrupted
     * first-run setup) may be reused because it owns no data.
     */
    suspend fun prepareSetupCipher(): Cipher {
        if (gates.hasMasterKey() || GateSlot.entries.any { tokens.blob(it) != null }) {
            throw UnlockReenrollmentBlockedException()
        }
        preparedUnlock = null
        preparedSetup = null
        preparedRotation = null
        val slot = freeSetupSlot()
        preparedSetupSlot = slot
        val gate = try {
            gates.createGateIfNeeded(slot)
            gates.newEncryptGate(slot)
        } catch (failure: Throwable) {
            if (!gates.isInvalidated(failure)) throw failure
            // No vault exists yet, so discarding an orphaned, invalidated setup
            // key cannot destroy any data.
            gates.deleteGate(slot)
            gates.createGateIfNeeded(slot)
            gates.newEncryptGate(slot)
        }
        preparedSetup = gate
        return gate.cipher
    }

    /** Completes first-run enrollment. The cipher must be the one from [prepareSetupCipher]. */
    suspend fun completeSetup(cipher: Cipher) {
        val gate = preparedSetup ?: throw UnlockRejectedException()
        if (gate.cipher !== cipher) throw UnlockRejectedException()
        val slot = preparedSetupSlot ?: throw UnlockRejectedException()
        if (gates.hasMasterKey() || GateSlot.entries.any { tokens.blob(it) != null }) {
            preparedSetup = null
            preparedSetupSlot = null
            throw UnlockReenrollmentBlockedException()
        }
        val ciphertext = execute(gate, recordRecovery = false) { UnlockProtocol.TOKEN }
        val blob = gate.iv + ciphertext
        tokens.writeBlob(slot, blob)
        tokens.setActiveSlot(slot)
        tokens.setRecoveryReason(null)
        preparedSetup = null
        preparedSetupSlot = null
        session.authorizeEnrollment(gate)
    }

    /** Prepares an unlock prompt for the active gate. */
    suspend fun prepareUnlockCipher(): Cipher {
        preparedSetup = null
        preparedRotation = null
        val slot = usableSlot() ?: throw UnlockNotConfiguredException()
        val blob = tokens.blob(slot) ?: throw UnlockNotConfiguredException()
        if (!UnlockProtocol.isValidBlob(blob)) throw UnlockNotConfiguredException()
        val gate = try {
            gates.newDecryptGate(slot, UnlockProtocol.ivOf(blob))
        } catch (failure: Throwable) {
            if (gates.isInvalidated(failure)) {
                tokens.setRecoveryReason(RECOVERY_BIOMETRIC_INVALIDATED)
                throw UnlockKeyInvalidatedException()
            }
            throw failure
        }
        preparedUnlock = gate
        return gate.cipher
    }

    /** Verifies the token through [SessionManager] and mints access on success. */
    suspend fun completeUnlock(cipher: Cipher) {
        val gate = preparedUnlock ?: throw UnlockRejectedException()
        if (gate.cipher !== cipher) throw UnlockRejectedException()
        val slot = usableSlot() ?: throw UnlockNotConfiguredException()
        val blob = tokens.blob(slot) ?: throw UnlockNotConfiguredException()
        preparedUnlock = null
        try {
            session.authorizeUnlock(gate, UnlockProtocol.payloadOf(blob))
        } catch (failure: Throwable) {
            if (gates.isInvalidated(failure)) {
                tokens.setRecoveryReason(RECOVERY_BIOMETRIC_INVALIDATED)
                throw UnlockKeyInvalidatedException()
            }
            throw when (failure) {
                is UnlockRejectedException -> failure
                is UnlockKeyInvalidatedException -> failure
                else -> UnlockRejectedException()
            }
        }
        tokens.setRecoveryReason(null)
    }

    /**
     * Prepares a fresh owner verification for a sensitive key migration. The
     * session must already be unlocked; this does not lock or re-mint it.
     */
    suspend fun prepareRotationReauthCipher(): Cipher {
        if (!session.isUnlocked) throw UnlockNotAuthorizedException()
        return prepareUnlockCipher()
    }

    /**
     * Verifies the unlock token again over the auth-bound gate cipher and
     * returns a short-lived authorization bound to the current capability.
     * It does not mint a new session; if the session locked during the prompt,
     * the migration is refused.
     */
    suspend fun completeRotationReauth(cipher: Cipher): RotationAuthorization {
        if (!session.isUnlocked) throw UnlockNotAuthorizedException()
        val gate = preparedUnlock ?: throw UnlockRejectedException()
        if (gate.cipher !== cipher) throw UnlockRejectedException()
        val slot = usableSlot() ?: throw UnlockNotConfiguredException()
        val blob = tokens.blob(slot) ?: throw UnlockNotConfiguredException()
        preparedUnlock = null
        try {
            session.verifyUnlockProof(gate, UnlockProtocol.payloadOf(blob))
        } catch (failure: Exception) {
            if (gates.isInvalidated(failure)) {
                tokens.setRecoveryReason(RECOVERY_BIOMETRIC_INVALIDATED)
                throw UnlockKeyInvalidatedException()
            }
            throw UnlockRejectedException()
        }
        val access = session.currentAccess() ?: throw UnlockNotAuthorizedException()
        tokens.setRecoveryReason(null)
        return RotationAuthorization(access)
    }

    /**
     * Starts an owner-authorized gate replacement. Only a live unlocked session
     * may call this. The current gate remains authoritative until
     * [completeGateRotation] succeeds.
     */
    suspend fun prepareGateRotationCipher(): Cipher {
        if (!session.isUnlocked) throw UnlockNotAuthorizedException()
        val active = usableSlot() ?: throw UnlockNotConfiguredException()
        val target = active.other()
        preparedSetup = null
        preparedUnlock = null
        preparedRotation = null
        // Discard residue from an interrupted earlier rotation; the target slot
        // is never authoritative while the active slot is usable.
        gates.deleteGate(target)
        tokens.clearBlob(target)
        val gate = try {
            gates.createGateIfNeeded(target)
            gates.newEncryptGate(target)
        } catch (failure: Throwable) {
            if (!gates.isInvalidated(failure)) throw failure
            gates.deleteGate(target)
            gates.createGateIfNeeded(target)
            gates.newEncryptGate(target)
        }
        preparedRotation = gate
        preparedRotationSlot = target
        return gate.cipher
    }

    /**
     * Commits the verified replacement gate atomically from the app's point of
     * view: write the new token, switch the active slot, then delete the old
     * gate and token. The encrypted vault records and master key are untouched.
     */
    suspend fun completeGateRotation(cipher: Cipher) {
        if (!session.isUnlocked) throw UnlockNotAuthorizedException()
        val gate = preparedRotation ?: throw UnlockRejectedException()
        val target = preparedRotationSlot ?: throw UnlockRejectedException()
        if (gate.cipher !== cipher) throw UnlockRejectedException()
        val previous = usableSlot() ?: throw UnlockNotConfiguredException()
        if (target == previous) throw UnlockRejectedException()
        val ciphertext = execute(gate, recordRecovery = false) { UnlockProtocol.TOKEN }
        val blob = gate.iv + ciphertext
        tokens.writeBlob(target, blob)
        tokens.setActiveSlot(target)
        tokens.setRecoveryReason(null)
        preparedRotation = null
        preparedRotationSlot = null
        // The new gate is already authoritative; residue cleanup must not turn
        // a successful rotation into a reported failure.
        runCatching { gates.deleteGate(previous) }
        runCatching { tokens.clearBlob(previous) }
    }

    private suspend fun usableSlot(): GateSlot? {
        val active = tokens.activeSlot()
        if (hasPair(active)) return active
        for (slot in GateSlot.entries) {
            if (hasPair(slot)) {
                tokens.setActiveSlot(slot)
                return slot
            }
        }
        return null
    }

    private suspend fun hasPair(slot: GateSlot): Boolean =
        gates.hasGate(slot) && UnlockProtocol.isValidBlob(tokens.blob(slot))

    private fun freeSetupSlot(): GateSlot = when {
        !gates.hasGate(GateSlot.PRIMARY) -> GateSlot.PRIMARY
        !gates.hasGate(GateSlot.ALTERNATE) -> GateSlot.ALTERNATE
        else -> {
            // No master key and no token exist, so both keys are orphans from
            // interrupted setups. Discarding one cannot destroy vault data.
            gates.deleteGate(GateSlot.PRIMARY)
            GateSlot.PRIMARY
        }
    }

    private suspend fun execute(
        gate: GateCipher,
        recordRecovery: Boolean,
        input: () -> ByteArray,
    ): ByteArray = try {
        gate.doFinal(input())
    } catch (failure: Exception) {
        if (gates.isInvalidated(failure)) {
            // Only an unlock of an existing vault is a non-destructive recovery
            // state. Setup/rotation failures leave the data untouched and must
            // not strand the UI in recovery mode.
            if (recordRecovery) tokens.setRecoveryReason(RECOVERY_BIOMETRIC_INVALIDATED)
            throw UnlockKeyInvalidatedException()
        }
        throw UnlockRejectedException()
    }
}
