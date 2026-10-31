package com.knoux.crypt.data

import javax.crypto.Cipher

/** Keystore aliases are stable. Changing them would orphan existing vaults. */
object VaultKeyAliases {
    const val MASTER = "knoux.master.v2"
    const val GATE_PRIMARY = "knoux.unlock.v2"
    const val GATE_ALTERNATE = "knoux.unlock.v2.b"
}

/**
 * Two gate slots make gate replacement atomic: the new gate is verified in the
 * inactive slot before it becomes authoritative, so cancelling or crashing
 * during rotation leaves the old gate usable.
 */
internal enum class GateSlot(val alias: String) {
    PRIMARY(VaultKeyAliases.GATE_PRIMARY),
    ALTERNATE(VaultKeyAliases.GATE_ALTERNATE);

    fun other(): GateSlot = if (this == PRIMARY) ALTERNATE else PRIMARY
}

internal enum class GatePurpose { UNLOCK, ENROLL }

/**
 * A cipher that was initialized from an auth-bound Keystore unlock key.
 * The constructor is internal to the security module; the UI only ever sees
 * the raw [Cipher] it must pass to BiometricPrompt and back.
 */
internal class GateCipher(
    internal val purpose: GatePurpose,
    val cipher: Cipher,
) {
    val iv: ByteArray = cipher.iv?.copyOf() ?: ByteArray(0)

    internal fun doFinal(input: ByteArray): ByteArray = cipher.doFinal(input)
}

/** Android Keystore gate operations, abstracted so tests can use plain JVM AES keys. */
internal interface GateKeyStore {
    fun hasMasterKey(): Boolean
    fun hasGate(slot: GateSlot): Boolean
    fun createGateIfNeeded(slot: GateSlot)
    fun deleteGate(slot: GateSlot)
    fun newEncryptGate(slot: GateSlot): GateCipher
    fun newDecryptGate(slot: GateSlot, iv: ByteArray): GateCipher
    fun isInvalidated(failure: Throwable): Boolean
}

/** Encrypted unlock-token persistence (never the key itself). */
internal interface GateTokenStore {
    suspend fun activeSlot(): GateSlot
    suspend fun setActiveSlot(slot: GateSlot)
    suspend fun blob(slot: GateSlot): ByteArray?
    suspend fun writeBlob(slot: GateSlot, blob: ByteArray)
    suspend fun clearBlob(slot: GateSlot)
    suspend fun recoveryReason(): String?
    suspend fun setRecoveryReason(reason: String?)
}

/** Token format shared by enrollment and unlock verification. */
internal object UnlockProtocol {
    private const val TOKEN_TEXT = "KNOUX-UNLOCK-V2"

    /** A fresh copy per access so callers cannot mutate the expected token. */
    val TOKEN: ByteArray get() = TOKEN_TEXT.toByteArray(Charsets.UTF_8)
    const val IV_BYTES = 12
    const val TAG_BYTES = 16
    val MIN_BLOB = IV_BYTES + TOKEN_TEXT.length + TAG_BYTES

    fun isValidBlob(blob: ByteArray?): Boolean = blob != null && blob.size >= MIN_BLOB

    fun ivOf(blob: ByteArray): ByteArray {
        require(blob.size >= MIN_BLOB) { "Invalid unlock token blob" }
        return blob.copyOfRange(0, IV_BYTES)
    }

    fun payloadOf(blob: ByteArray): ByteArray {
        require(blob.size >= MIN_BLOB) { "Invalid unlock token blob" }
        return blob.copyOfRange(IV_BYTES, blob.size)
    }
}

class UnlockNotConfiguredException(message: String = "Secure unlock has not been set up") : Exception(message)
class UnlockRejectedException(message: String = "Unlock was not authorized") : Exception(message)
class UnlockKeyInvalidatedException(
    message: String = "The unlock key was invalidated by a biometric change",
) : Exception(message)

/** Setup was attempted while a vault or a gate already exists. */
class UnlockReenrollmentBlockedException(
    message: String = "An existing vault cannot be re-enrolled without previous authorization or a recovery credential",
) : Exception(message)

/** A gate mutation was attempted from a guest/locked session. */
class UnlockNotAuthorizedException(
    message: String = "Only an authorized, unlocked session may change the unlock gate",
) : Exception(message)
