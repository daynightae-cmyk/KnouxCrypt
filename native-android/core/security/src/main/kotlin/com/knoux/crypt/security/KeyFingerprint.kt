package com.knoux.crypt.security

import java.security.MessageDigest
import java.security.PublicKey
import java.util.Base64

/**
 * Key fingerprints for the fingerprint-compare and public-key QR flows
 * (TASK 23 and TASK 28).
 *
 * The format follows the familiar SSH style: `SHA256:` followed by the
 * base64 (url-safe, unpadded) SHA-256 of the key's SPKI encoding. It is a
 * short, human-checkable identity of an *asymmetric public* key only — never
 * of a secret, and never of a symmetric key that cannot be exported.
 */
object KeyFingerprint {
    const val PREFIX = "SHA256:"

    fun ofSpki(spki: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(spki)
        val encoded = Base64.getUrlEncoder().withoutPadding().encodeToString(digest)
        return PREFIX + encoded
    }

    fun of(publicKey: PublicKey): String {
        val encoded = publicKey.encoded ?: return ""
        return ofSpki(encoded)
    }

    /** Normalizes a fingerprint for comparison: case-insensitive, trimmed. */
    fun normalize(value: String): String = value.trim().uppercase()

    /** Compares two fingerprints without leaking where they differ. */
    fun matches(first: String, second: String): Boolean {
        val left = normalize(first)
        val right = normalize(second)
        if (left.isEmpty() || right.isEmpty() || left.length != right.length) return false
        var diff = 0
        for (index in left.indices) {
            diff = diff or (left[index].code xor right[index].code)
        }
        return diff == 0
    }

    /**
     * The URI that a public-key QR carries. It is deliberately plain and
     * self-describing so a scanner can show the fingerprint without trusting
     * the app that produced it.
     */
    fun uriFor(label: String, spkiBase64: String): String {
        val payload = "knouxkey:v1:$spkiBase64"
        return if (label.isBlank()) payload else "$payload#${label.trim()}"
    }
}
