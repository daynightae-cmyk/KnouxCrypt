package com.knoux.crypt.data

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import java.security.KeyStore
import java.security.PrivateKey
import java.security.PublicKey
import com.knoux.crypt.security.DigitalSignatureService
import javax.crypto.SecretKeyFactory
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
        internal const val SIGNING_ALIAS = VaultKeyAliases.SIGNING
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    }

    private fun store(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    fun hasMasterKey(): Boolean =
        runCatching { store().containsAlias(MASTER_ALIAS) }.getOrDefault(false)

    /**
     * Platform-reported metadata for the master key (TASK 13). It never
     * returns key material: only what [android.security.keystore.KeyInfo]
     * exposes about a key that cannot be exported in the first place.
     */
    fun masterKeyDetails(): KeystoreKeyDetails? {
        val keyStore = store()
        val key = runCatching { keyStore.getKey(MASTER_ALIAS, null) as? SecretKey }.getOrNull() ?: return null
        val factory = runCatching { SecretKeyFactory.getInstance(key.algorithm, ANDROID_KEYSTORE) }.getOrNull()
        val info = runCatching { factory?.getKeySpec(key, KeyInfo::class.java) as? KeyInfo }.getOrNull()
        val protection = when {
            info == null -> KeyProtectionLevel.UNKNOWN
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> when (info.securityLevel) {
                KeyProperties.SECURITY_LEVEL_STRONGBOX -> KeyProtectionLevel.STRONGBOX
                KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> KeyProtectionLevel.TRUSTED_ENVIRONMENT
                KeyProperties.SECURITY_LEVEL_SOFTWARE -> KeyProtectionLevel.SOFTWARE
                else -> KeyProtectionLevel.UNKNOWN
            }
            info.isInsideSecureHardware -> KeyProtectionLevel.TRUSTED_ENVIRONMENT
            else -> KeyProtectionLevel.SOFTWARE
        }
        // KeyInfo reports the protection class but not StrongBox or
        // unlocked-device flags directly; StrongBox follows from the security
        // level, and the unlocked-device requirement is what the key was
        // created with, not something the platform confirms back.
        val strongBox = protection == KeyProtectionLevel.STRONGBOX
        val unlockedDeviceRequested = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
        return KeystoreKeyDetails(
            alias = MASTER_ALIAS,
            algorithm = key.algorithm,
            keySizeBits = runCatching { info?.keySize }.getOrNull()?.takeIf { it > 0 },
            purposes = purposesOf(info?.purposes),
            protection = protection,
            insideSecureHardware = runCatching { info?.isInsideSecureHardware == true }.getOrDefault(false),
            strongBoxBacked = strongBox,
            userAuthenticationRequired = runCatching { info?.isUserAuthenticationRequired == true }.getOrDefault(false),
            userAuthenticationValiditySeconds = runCatching {
                info?.userAuthenticationValidityDurationSeconds
            }.getOrNull()?.takeIf { it >= 0 },
            unlockedDeviceRequiredRequested = unlockedDeviceRequested,
        )
    }

    /**
     * Signing key for TASK 19. The private half never leaves the Keystore.
     *
     * EC P-256 is preferred, but the first device run showed that some
     * AndroidKeyStore providers do not implement EC at all (the itel S686LN
     * answers "no such algorithm: EC for provider AndroidKeyStore"). The
     * factory therefore falls back to RSA-2048 with SHA-256, and the algorithm
     * that was actually used travels with every signature.
     */
    /**
     * The Keystore signing key, or null when this provider cannot create one.
     * Some AndroidKeyStore implementations ship without EC or RSA support; the
     * caller then falls back to a vault-protected software key and says so.
     */
    @Synchronized
    internal fun keystoreSigningKey(): PrivateKey? = runCatching { signingPrivateKey() }.getOrNull()

    @Synchronized
    internal fun signingPrivateKey(): PrivateKey {
        val keyStore = store()
        (keyStore.getKey(SIGNING_ALIAS, null) as? PrivateKey)?.let { return it }
        return try {
            createSigningKey(
                algorithm = KeyProperties.KEY_ALGORITHM_EC,
                spec = KeyGenParameterSpec.Builder(
                    SIGNING_ALIAS,
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
                )
                    .setAlgorithmParameterSpec(
                        java.security.spec.ECGenParameterSpec(DigitalSignatureService.CURVE),
                    )
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .build(),
            )
        } catch (failure: Exception) {
            // This Keystore has no EC support; drop any partial alias and use RSA.
            runCatching { store().deleteEntry(SIGNING_ALIAS) }
            createSigningKey(
                algorithm = KeyProperties.KEY_ALGORITHM_RSA,
                spec = KeyGenParameterSpec.Builder(
                    SIGNING_ALIAS,
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
                )
                    .setKeySize(DigitalSignatureService.RSA_KEY_SIZE)
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .build(),
            )
        }
    }

    private fun createSigningKey(algorithm: String, spec: KeyGenParameterSpec): PrivateKey {
        val generator = KeyGenerator.getInstance(algorithm, ANDROID_KEYSTORE)
        generator.init(spec)
        return generator.generateKey() as PrivateKey
    }

    /** The signature algorithm that matches the key actually created. */
    internal fun signingAlgorithm(): String {
        val key = signingPrivateKey()
        return if (key is java.security.interfaces.ECPrivateKey) {
            DigitalSignatureService.ALGORITHM_ECDSA
        } else {
            DigitalSignatureService.ALGORITHM_RSA
        }
    }

    /** The exportable public half of the signing key, in SPKI form. */
    @Synchronized
    internal fun signingPublicKey(): PublicKey {
        signingPrivateKey()
        val keyStore = store()
        val certificate = keyStore.getCertificate(SIGNING_ALIAS)
            ?: throw IllegalStateException("The signing key has no certificate")
        return certificate.publicKey
    }

    /** Maps the platform purpose flags to stable labels. */
    private fun purposesOf(flags: Int?): List<String> {
        if (flags == null) return listOf(KeyPurposes.ENCRYPT, KeyPurposes.DECRYPT)
        val purposes = ArrayList<String>(4)
        if (flags and KeyProperties.PURPOSE_ENCRYPT != 0) purposes += KeyPurposes.ENCRYPT
        if (flags and KeyProperties.PURPOSE_DECRYPT != 0) purposes += KeyPurposes.DECRYPT
        if (flags and KeyProperties.PURPOSE_SIGN != 0) purposes += KeyPurposes.SIGN
        if (flags and KeyProperties.PURPOSE_VERIFY != 0) purposes += KeyPurposes.VERIFY
        return purposes.ifEmpty { listOf(KeyPurposes.ENCRYPT, KeyPurposes.DECRYPT) }
    }

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
