package com.knoux.crypt

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/** Auth-required AES wrapping key boundary. NOT wired to a working vault yet.
 * BiometricPrompt CryptoObject must authorize the returned cipher in TASK 02.
 * Never treat a successful UI callback or guest entry as key authorization.
 */
class DeviceWrappingKey {
    companion object { private const val ALIAS = "knoux.device.wrap.v1" }
    @Synchronized
    fun prepareAuthenticatedEncryption(): Cipher {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = store.getKey(ALIAS, null)
        val key = if (existing == null) {
            val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            generator.init(KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .setUserAuthenticationRequired(true)
                .setUserAuthenticationValidityDurationSeconds(-1)
                .setInvalidatedByBiometricEnrollment(true)
                .build())
            generator.generateKey()
        } else existing as SecretKey
        // Keystore chooses IV. Never provide a fixed or reused IV for encryption.
        return Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key) }
    }
    // No delete/regenerate-on-error fallback; invalidation must enter recovery flow.
    // Hardware/StrongBox capability has NOT been evaluated or promised.
}
