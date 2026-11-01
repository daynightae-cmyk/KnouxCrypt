package com.knoux.crypt.data

import com.knoux.crypt.security.Hashing
import java.io.ByteArrayOutputStream

/**
 * Truthful metadata about the key material the vault actually holds (TASK 13).
 *
 * Nothing here exposes key bytes: the master key is a non-exportable Keystore
 * secret, and this model only reports what the platform tells us about it.
 * A public-key fingerprint is produced only when an exportable public key
 * really exists — for a symmetric master key there is none, and the UI says so
 * instead of inventing an identity.
 */
enum class KeyProtectionLevel {
    STRONGBOX,
    TRUSTED_ENVIRONMENT,
    SOFTWARE,
    UNKNOWN,
}

data class KeystoreKeyDetails(
    val alias: String,
    val algorithm: String,
    val keySizeBits: Int?,
    val purposes: List<String>,
    val protection: KeyProtectionLevel,
    val insideSecureHardware: Boolean,
    val strongBoxBacked: Boolean,
    val userAuthenticationRequired: Boolean,
    val userAuthenticationValiditySeconds: Int?,
    /**
     * True when the key was *requested* to require an unlocked device. The
     * platform's KeyInfo does not report this back, so the UI labels it as a
     * request rather than as verified platform behaviour.
     */
    val unlockedDeviceRequiredRequested: Boolean,
) {
    /**
     * A symmetric, non-exportable secret has no public key, so no public
     * fingerprint can exist. This stays false and the UI explains why.
     */
    val hasExportablePublicKey: Boolean get() = false
}

/**
 * Integrity fingerprint of the local keyring.
 *
 * It is a SHA-256 over the key alias and the wrapped record-data-key blobs as
 * they are stored. It detects local tampering or an unexpected re-wrap; it is
 * NOT a shareable identity, because the blobs are Keystore-bound ciphertext and
 * never leave the device.
 */
object KeyRingFingerprint {
    fun compute(alias: String, wrappedKeys: Map<Int, ByteArray>): String? {
        if (wrappedKeys.isEmpty()) return null
        val buffer = ByteArrayOutputStream()
        buffer.write("knoux.keyring.v1:".toByteArray(Charsets.UTF_8))
        buffer.write(alias.toByteArray(Charsets.UTF_8))
        wrappedKeys.keys.sorted().forEach { version ->
            val blob = wrappedKeys[version] ?: return null
            buffer.write(byteArrayOf(0x1E))
            buffer.write(version.toString().toByteArray(Charsets.UTF_8))
            buffer.write(byteArrayOf(0x1F))
            buffer.write(blob.size.toString().toByteArray(Charsets.UTF_8))
            buffer.write(blob)
        }
        return Hashing.toHex(Hashing.sha256(buffer.toByteArray()))
    }
}

/** Purpose labels for the display layer; Keystore constants stay internal. */
object KeyPurposes {
    const val ENCRYPT = "encrypt"
    const val DECRYPT = "decrypt"
    const val SIGN = "sign"
    const val VERIFY = "verify"
}
