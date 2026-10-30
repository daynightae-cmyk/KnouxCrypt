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
 * - Master data key: non-exportable AES-256-GCM, used to encrypt vault records.
 * - Unlock key: non-exportable AES-256-GCM, per-use user authentication, used to
 *   verify a real key operation before [SessionManager] grants access.
 *
 * The master key is intentionally NOT auth-bound in this first implementation so
 * a biometric enrollment change cannot destroy vault data before a recovery
 * format exists. This means vault decryption is protected by Keystore + the
 * in-app capability, not by per-use biometric authorization. Do not describe it
 * as hardware-verified or as an audited boundary.
 */
class KeystoreManager {
    companion object {
        const val MASTER_ALIAS = "knoux.master.v2"
        const val UNLOCK_ALIAS = "knoux.unlock.v2"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    }

    private fun store(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    fun hasMasterKey(): Boolean = runCatching { store().containsAlias(MASTER_ALIAS) }.getOrDefault(false)

    @Synchronized
    fun masterKey(): SecretKey {
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

    fun hasUnlockKey(): Boolean = runCatching { store().containsAlias(UNLOCK_ALIAS) }.getOrDefault(false)

    @Synchronized
    fun createUnlockKeyIfNeeded(): SecretKey {
        val keyStore = store()
        (keyStore.getKey(UNLOCK_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val builder = KeyGenParameterSpec.Builder(
            UNLOCK_ALIAS,
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
        return generator.generateKey()
    }

    fun newUnlockEncryptCipher(): Cipher {
        val key = store().getKey(UNLOCK_ALIAS, null) as? SecretKey
            ?: throw IllegalStateException("Unlock key is not provisioned")
        return Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key) }
    }

    fun newUnlockDecryptCipher(iv: ByteArray): Cipher {
        require(iv.size == 12) { "Invalid IV length" }
        val key = store().getKey(UNLOCK_ALIAS, null) as? SecretKey
            ?: throw IllegalStateException("Unlock key is not provisioned")
        return Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
        }
    }

    @Synchronized
    fun deleteUnlockKey() {
        val keyStore = store()
        if (keyStore.containsAlias(UNLOCK_ALIAS)) keyStore.deleteEntry(UNLOCK_ALIAS)
    }

    /**
     * Reports what the platform actually says about the master key. Null means the
     * key has not been generated yet. Never upgrade this to a marketing claim.
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

    fun isInvalidated(failure: Throwable): Boolean =
        failure is KeyPermanentlyInvalidatedException || failure.cause is KeyPermanentlyInvalidatedException
}
