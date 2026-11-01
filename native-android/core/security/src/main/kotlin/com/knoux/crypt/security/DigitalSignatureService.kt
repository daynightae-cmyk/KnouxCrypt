package com.knoux.crypt.security

import java.security.KeyFactory
import java.security.PrivateKey
import java.security.PublicKey
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

/**
 * Detached digital signatures (TASK 19).
 *
 * A signature here proves possession of the matching private key over the exact
 * content — it says nothing about who owns the key, and the UI must not claim
 * an identity. The algorithm is fixed to SHA-256 with ECDSA on P-256; weaker or
 * unknown algorithms are rejected instead of being silently accepted.
 *
 * The signature covers the SHA-256 digest of the content, so a stored
 * signature record never has to keep the signed document itself.
 */
object DigitalSignatureService {
    const val ALGORITHM_ECDSA = "SHA256withECDSA"
    const val ALGORITHM_RSA = "SHA256withRSA"
    const val DIGEST = "SHA-256"
    const val CURVE = "secp256r1"
    const val RSA_KEY_SIZE = 2048

    /** The algorithms this engine accepts; anything else is refused. */
    val SUPPORTED_ALGORITHMS = setOf(ALGORITHM_ECDSA, ALGORITHM_RSA)

    enum class Verdict {
        VALID,
        DIGEST_MISMATCH,
        INVALID_SIGNATURE,
        MALFORMED,
    }

    fun digest(content: ByteArray): ByteArray = Hashing.sha256(content)

    fun digestHex(content: ByteArray): String = Hashing.toHex(digest(content))

    /** Signs the content digest with the given private key. */
    fun sign(content: ByteArray, privateKey: PrivateKey, algorithm: String = ALGORITHM_ECDSA): ByteArray {
        require(algorithm in SUPPORTED_ALGORITHMS) { "Unsupported signature algorithm $algorithm" }
        val signer = Signature.getInstance(algorithm)
        signer.initSign(privateKey)
        signer.update(digest(content))
        return signer.sign()
    }

    /**
     * Verifies a detached signature. [expectedDigestHex] is optional: when the
     * caller has a stored digest, a mismatch is reported separately from a
     * broken signature so the evidence stays precise.
     */
    fun verify(
        content: ByteArray,
        publicKey: PublicKey,
        signature: ByteArray,
        algorithm: String = ALGORITHM_ECDSA,
        expectedDigestHex: String? = null,
    ): Verdict {
        if (algorithm !in SUPPORTED_ALGORITHMS) return Verdict.MALFORMED
        if (signature.isEmpty()) return Verdict.MALFORMED
        val digest = digest(content)
        // The digest comparison runs first: when the content was changed after
        // signing, that is the precise finding, and a failed signature check on
        // changed content would only repeat it.
        if (expectedDigestHex != null &&
            !MessageDigestEquals.matches(Hashing.toHex(digest), expectedDigestHex.trim().lowercase())
        ) {
            return Verdict.DIGEST_MISMATCH
        }
        val verifier = runCatching {
            Signature.getInstance(algorithm).apply {
                initVerify(publicKey)
                update(digest)
            }.verify(signature)
        }.getOrElse { return Verdict.MALFORMED }
        if (!verifier) return Verdict.INVALID_SIGNATURE
        return Verdict.VALID
    }

    /** SPKI encoding, the portable form of a public key. */
    fun publicKeyToBase64(publicKey: PublicKey): String =
        Base64.getEncoder().encodeToString(publicKey.encoded)

    /**
     * Rebuilds a public key from its SPKI encoding. The key type is detected
     * from the encoding itself, so a key made with RSA still verifies when the
     * device had no EC support.
     */
    fun publicKeyFromBase64(base64: String): PublicKey? {
        val bytes = runCatching { Base64.getDecoder().decode(base64.trim()) }.getOrNull() ?: return null
        for (type in listOf("EC", "RSA")) {
            val key = runCatching {
                KeyFactory.getInstance(type).generatePublic(X509EncodedKeySpec(bytes))
            }.getOrNull()
            if (key != null) return key
        }
        return null
    }

    /** The verification algorithm that matches a public key's type. */
    fun algorithmFor(publicKey: PublicKey): String =
        if (publicKey is java.security.interfaces.ECPublicKey) ALGORITHM_ECDSA else ALGORITHM_RSA

    fun signatureToBase64(signature: ByteArray): String =
        Base64.getEncoder().encodeToString(signature)

    fun signatureFromBase64(base64: String): ByteArray? = runCatching {
        Base64.getDecoder().decode(base64.trim())
    }.getOrNull()
}

/** Constant-time-ish comparison of two hex digests. */
private object MessageDigestEquals {
    fun matches(left: String, right: String): Boolean {
        if (left.length != right.length) return false
        var diff = 0
        for (index in left.indices) {
            diff = diff or (left[index].code xor right[index].code)
        }
        return diff == 0
    }
}
