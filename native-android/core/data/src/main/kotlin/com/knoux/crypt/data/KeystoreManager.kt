package com.knoux.crypt.data

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Android Keystore boundary.
 *
 * - Master data key ([VaultKeyAliases.MASTER]): non-exportable AES-256-GCM used
 *   to encrypt vault records. It is intentionally NOT auth-bound so a biometric
 *   enrollment change cannot destroy vault ciphertext before a recovery format
 *   exists. Vault decryption is therefore gated by the session capability, not
 *   by per-use biometric authorization. Never describe this as hardware-verified.
 * - Gate keys ([VaultKeyAliases.GATE_PRIMARY] / [GATE_ALTERNATE]): auth-bound,
 *   per-use AES-256-GCM keys used only to verify the unlock token. Two stable
 *   aliases allow atomic gate replacement without orphaning vault data.
 *
 * Aliases and key specs are frozen for migration safety. Do not regenerate or
 * rename them to "fix" an API boundary; existing ciphertext depends on them.
 */
class KeystoreManager {
    companion object {
        const val MASTER_ALIAS = VaultKeyAliases.MASTER
        const val UNLOCK_ALIAS = VaultKeyAliases.GATE_PRIMARY
        internal const val UNLOCK_ALTERNATE_ALIAS = VaultKeyAliases.GATE_ALTERNATE
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    }

    private fun store(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    fun hasMasterKey(): Boolean =
        runCatching { store().containsAlias(MASTER_ALIAS) }.getOrDefault(false)

    @Synchronized
    internal fun masterKey(): SecretKey {
        val keyStore = store()
        (keyStore.getKey(MASTER_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(
            MASTER_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setKeySize(256)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) setUnlockedDeviceRequired(true)
            }
            .build()
        generator.init(spec)
        return generator.generateKey()
    }

    internal fun hasGate(slot: GateSlot): Boolean =
        runCatching { store().containsAlias(slot.alias) }.getOrDefault(false)

    @Synchronized
    internal fun createGateIfNeeded(slot: GateSlot) {
        val keyStore = store()
        if (keyStore.getKey(slot.alias, null) is SecretKey) return
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val builder = KeyGenParameterSpec.Builder(
            slot.alias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setKeySize(256)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
        } else {
            @Suppress("DEPRECATION")
            builder.setUserAuthenticationValidityDurationSeconds(-1)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) builder.setUnlockedDeviceRequired(true)
        generator.init(builder.build())
        generator.generateKey()
    }

    @Synchronized
    internal fun deleteGate(slot: GateSlot) {
        val keyStore = store()
        if (keyStore.containsAlias(slot.alias)) keyStore.deleteEntry(slot.alias)
    }

    internal fun newEncryptGate(slot: GateSlot): GateCipher {
        val key = store().getKey(slot.alias, null) as? SecretKey
            ?: throw IllegalStateException("Unlock gate is not provisioned")
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            .apply { init(Cipher.ENCRYPT_MODE, key) }
        return GateCipher(GatePurpose.ENROLL, cipher)
    }

    internal fun newDecryptGate(slot: GateSlot, iv: ByteArray): GateCipher {
        require(iv.size == UnlockProtocol.IV_BYTES) { "Invalid IV length" }
        val key = store().getKey(slot.alias, null) as? SecretKey
            ?: throw IllegalStateException("Unlock gate is not provisioned")
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            .apply { init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(UnlockProtocol.TAG_BYTES * 8, iv)) }
        return GateCipher(GatePurpose.UNLOCK, cipher)
    }

    /**
     * Reports what the platform actually says about the master key. Null means
     * not provisioned. Never upgrade this to a marketing claim.
     */
    fun masterKeySecurityLevel(): String? {
        val key = runCatching { store().getKey(MASTER_ALIAS, null) as? SecretKey }.getOrNull() ?: return null
        val factory = javax.crypto.SecretKeyFactory.getInstance(key.algorithm, ANDROID_KEYSTORE)
        val info = runCatching { factory.getKeySpec(key, KeyInfo::class.java) as KeyInfo }.getOrNull() ?: return "UNKNOWN"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return when (info.securityLevel) {
                KeyProperties.SECURITY_LEVEL_STRONGBOX -> "STRONGBOX"
                KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "TEE"
                KeyProperties.SECURITY_LEVEL_SOFTWARE -> "SOFTWARE"
                else -> "UNKNOWN"
            }
        }
        @Suppress("DEPRECATION")
        return if (info.isInsideSecureHardware) "SECURE_HARDWARE" else "SOFTWARE"
    }

    internal fun isInvalidated(failure: Throwable): Boolean =
        failure is KeyPermanentlyInvalidatedException || failure.cause is KeyPermanentlyInvalidatedException
}
