package com.knoux.crypt.security

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import org.bouncycastle.asn1.ASN1EncodableVector
import org.bouncycastle.asn1.ASN1Integer
import org.bouncycastle.asn1.ASN1ObjectIdentifier
import org.bouncycastle.asn1.ASN1OctetString
import org.bouncycastle.asn1.DEROctetString
import org.bouncycastle.asn1.DERSequence
import org.bouncycastle.asn1.pkcs.PrivateKeyInfo
import org.bouncycastle.asn1.x509.AlgorithmIdentifier
import org.bouncycastle.asn1.x509.SubjectPublicKeyInfo
import org.bouncycastle.crypto.digests.SHA256Digest
import org.bouncycastle.crypto.generators.HKDFBytesGenerator
import org.bouncycastle.crypto.generators.X25519KeyPairGenerator
import org.bouncycastle.crypto.params.HKDFParameters
import org.bouncycastle.crypto.params.X25519KeyGenerationParameters
import org.bouncycastle.crypto.params.X25519PrivateKeyParameters
import org.bouncycastle.crypto.params.X25519PublicKeyParameters

/**
 * Recipient keys for Secure Share (TASK 16).
 *
 * Sharing encrypts *to a key*, so the recipient half of the contract has to be a
 * key that can actually be used for key agreement. This build accepts exactly one
 * kind: an X25519 (Curve25519, RFC 7748) public key, agreed with the vetted
 * Bouncy Castle implementation already used for Argon2id, and stretched with
 * HKDF-SHA-256 (RFC 5869).
 *
 * A signing key is deliberately not accepted. The device's EC/RSA signing key and
 * any imported `knouxkey:v1:` signing public key cannot seal a package here,
 * because an ECDSA key pair produced for signatures carries no assurance that it
 * is safe to use for Diffie-Hellman, and nothing about its encoding says
 * otherwise. Rejecting it is a correctness rule, not a missing feature: the
 * caller gets [KeyKindRejectedException] naming the algorithm it saw.
 */

/** Raised when a key is well-formed but belongs to a different purpose. */
class KeyKindRejectedException(message: String) : IllegalArgumentException(message)

/** A public X25519 key a share package can be sealed to. */
class RecipientKey private constructor(
    val parameters: X25519PublicKeyParameters,
    val spki: ByteArray,
) {
    /** SSH-style identity of this key, shared with TASK 23 and TASK 28. */
    val fingerprint: String by lazy(LazyThreadSafetyMode.PUBLICATION) { KeyFingerprint.ofSpki(spki) }

    /**
     * Eight-byte non-secret selector written into every package header so a
     * reader can tell whether the package was sealed for this key without
     * attempting a decryption first.
     */
    val keyId: ByteArray by lazy(LazyThreadSafetyMode.PUBLICATION) {
        MessageDigest.getInstance("SHA-256").digest(spki).copyOf(KEY_ID_BYTES)
    }

    val keyIdHex: String get() = hex(keyId)

    val spkiBase64: String get() = Base64.getEncoder().encodeToString(spki)

    /** The `knouxkey:v2:` URI this key is shared as; it names its own algorithm. */
    fun uriFor(label: String): String {
        val body = "$KEY_URI_PREFIX$V2_MARKER:$ALGORITHM_TAG:$spkiBase64"
        val trimmed = label.trim()
        return if (trimmed.isEmpty()) body else "$body#$trimmed"
    }

    override fun equals(other: Any?): Boolean = other is RecipientKey && other.spki.contentEquals(spki)

    override fun hashCode(): Int = spki.contentHashCode()

    companion object {
        /** RFC 8410 id-X25519. */
        val X25519_OID: ASN1ObjectIdentifier = ASN1ObjectIdentifier("1.3.101.110")
        const val ALGORITHM_TAG = "x25519"
        const val KEY_URI_PREFIX = "knouxkey:"
        const val V2_MARKER = "v2"
        const val RAW_KEY_BYTES = 32
        const val KEY_ID_BYTES = 8
        const val MAX_SPKI_BYTES = 128

        internal fun hex(value: ByteArray): String =
            value.joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }

        /** Parses a DER SubjectPublicKeyInfo, rejecting anything that is not X25519. */
        fun fromSpki(spki: ByteArray): RecipientKey {
            if (spki.isEmpty() || spki.size > MAX_SPKI_BYTES) {
                throw KeyKindRejectedException("Public key encoding has an implausible length")
            }
            val info = try {
                SubjectPublicKeyInfo.getInstance(spki)
            } catch (failure: RuntimeException) {
                throw KeyKindRejectedException("Public key is not a valid DER SubjectPublicKeyInfo")
                    .apply { addSuppressed(failure) }
            } ?: throw KeyKindRejectedException("Public key is not a SubjectPublicKeyInfo")
            val algorithm = info.algorithm.algorithm
            if (algorithm != X25519_OID) {
                throw KeyKindRejectedException(
                    "This is a ${describe(algorithm)} key. Secure Share seals to an X25519 " +
                        "encryption key; a signing key is never assumed to be usable for agreement.",
                )
            }
            if (info.algorithm.parameters != null) {
                throw KeyKindRejectedException("X25519 public keys must carry no algorithm parameters")
            }
            val raw = info.publicKeyData.bytes
            if (raw.size != RAW_KEY_BYTES) {
                throw KeyKindRejectedException("X25519 public keys are 32 bytes")
            }
            return RecipientKey(X25519PublicKeyParameters(raw, 0), spki)
        }

        fun fromBase64(value: String): RecipientKey {
            val trimmed = value.trim()
            if (trimmed.isEmpty()) throw KeyKindRejectedException("No public key supplied")
            val der = try {
                Base64.getMimeDecoder().decode(trimmed)
            } catch (failure: IllegalArgumentException) {
                throw KeyKindRejectedException("Public key is not valid base64").apply { addSuppressed(failure) }
            }
            return fromSpki(der)
        }

        /**
         * Reads a `knouxkey:` URI. Version 1 carries a signing key and is refused
         * for sharing; version 2 names its algorithm, so nothing is inferred.
         * Returns null when the text is not a KNOUX key URI at all.
         */
        fun fromUri(uri: String): Pair<RecipientKey, String>? {
            val value = uri.trim()
            if (!value.startsWith(KEY_URI_PREFIX)) return null
            val body = value.removePrefix(KEY_URI_PREFIX)
            val payload = body.substringBefore('#')
            val label = body.substringAfter('#', "").trim()
            val parts = payload.split(':')
            if (parts.firstOrNull() == "v1") {
                throw KeyKindRejectedException(
                    "That key is a signing key (knouxkey:v1). Ask for a Secure Share key " +
                        "(knouxkey:v2:x25519:…) instead.",
                )
            }
            if (parts.size != 3 || parts[0] != V2_MARKER || parts[1] != ALGORITHM_TAG) return null
            return fromBase64(parts[2]) to label
        }

        private fun describe(oid: ASN1ObjectIdentifier): String = when (oid.toString()) {
            "1.2.840.10045.2.1" -> "EC (ECDSA/ECDH) signing"
            "1.2.840.113549.1.1.1" -> "RSA"
            "1.3.101.112" -> "Ed25519"
            "1.3.101.111" -> "X448"
            else -> "unknown ($oid)"
        }
    }
}

/**
 * The sharing identity of this installation: one X25519 key pair whose private
 * half is kept only inside an encrypted vault record. It is a software key and is
 * presented as such — the test handset's Keystore offers no asymmetric algorithm,
 * so claiming hardware protection here would be false.
 */
class ShareKeyPair private constructor(
    private val privateKey: X25519PrivateKeyParameters,
    val public: RecipientKey,
) {
    val fingerprint: String get() = public.fingerprint

    /** PKCS#8 (RFC 8410) encoding of the private half, for encrypted-at-rest storage. */
    val pkcs8: ByteArray by lazy(LazyThreadSafetyMode.PUBLICATION) { x25519Pkcs8(privateKey.encoded) }

    val pkcs8Base64: String get() = Base64.getEncoder().encodeToString(pkcs8)

    /** Raw X25519 agreement (32 bytes). Callers must stretch it before use. */
    fun sharedSecret(peer: RecipientKey): ByteArray {
        val secret = ByteArray(X25519PrivateKeyParameters.SECRET_SIZE)
        privateKey.generateSecret(peer.parameters, secret, 0)
        return secret
    }

    companion object {
        fun generate(random: SecureRandom = SecureRandom()): ShareKeyPair {
            val generator = X25519KeyPairGenerator()
            generator.init(X25519KeyGenerationParameters(random))
            val pair = generator.generateKeyPair()
            return fromPrivate(pair.private as X25519PrivateKeyParameters)
        }

        fun fromPkcs8(pkcs8: ByteArray): ShareKeyPair {
            val info = try {
                PrivateKeyInfo.getInstance(pkcs8)
            } catch (failure: RuntimeException) {
                throw KeyKindRejectedException("Private key is not a valid PKCS#8 document")
                    .apply { addSuppressed(failure) }
            } ?: throw KeyKindRejectedException("Private key is not a PKCS#8 document")
            if (info.privateKeyAlgorithm.algorithm != RecipientKey.X25519_OID) {
                throw KeyKindRejectedException("Secure Share needs an X25519 identity key")
            }
            val raw = try {
                ASN1OctetString.getInstance(info.parsePrivateKey()).octets
            } catch (failure: RuntimeException) {
                throw KeyKindRejectedException("X25519 private key encoding is malformed")
                    .apply { addSuppressed(failure) }
            }
            if (raw.size != RecipientKey.RAW_KEY_BYTES) {
                throw KeyKindRejectedException("X25519 private keys are 32 bytes")
            }
            val private = X25519PrivateKeyParameters(raw, 0)
            raw.fill(0)
            return fromPrivate(private)
        }

        fun fromPkcs8Base64(value: String): ShareKeyPair =
            fromPkcs8(Base64.getMimeDecoder().decode(value.trim()))

        private fun fromPrivate(privateKey: X25519PrivateKeyParameters): ShareKeyPair {
            val spki = SubjectPublicKeyInfo(
                AlgorithmIdentifier(RecipientKey.X25519_OID),
                privateKey.generatePublicKey().encoded,
            ).encoded
            return ShareKeyPair(privateKey, RecipientKey.fromSpki(spki))
        }
    }
}

/**
 * HKDF-SHA-256 (RFC 5869) through Bouncy Castle. Every derived key in a share
 * package comes from here so the context string is always explicit and one key
 * can never be reused across two purposes by accident.
 */
object ShareKdf {
    const val KEY_BYTES = 32
    const val SALT_BYTES = 32
    const val MAX_INFO_BYTES = 256

    fun hkdfSha256(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int = KEY_BYTES): ByteArray {
        require(ikm.isNotEmpty()) { "HKDF needs keying material" }
        require(length in 1..80) { "HKDF output length out of bounds" }
        require(info.size <= MAX_INFO_BYTES) { "HKDF context string too large" }
        val generator = HKDFBytesGenerator(SHA256Digest())
        generator.init(HKDFParameters(ikm, salt, info))
        val output = ByteArray(length)
        generator.generateBytes(output, 0, length)
        return output
    }

    /** The context strings used by Secure Share, kept in one place for tests. */
    fun kekInfo(recipientIndex: Int, keyId: ByteArray): ByteArray =
        ("knoux:share:v1:kek:$recipientIndex:" + RecipientKey.hex(keyId)).toByteArray(Charsets.UTF_8)

    fun payloadContext(packageId: String): ByteArray =
        ("knoux:share:v1:payload:$packageId").toByteArray(Charsets.UTF_8)

    fun metadataContext(packageId: String): ByteArray =
        ("knoux:share:v1:metadata:$packageId").toByteArray(Charsets.UTF_8)
}

/** DER SubjectPublicKeyInfo for a raw X25519 public scalar. */
internal fun x25519Spki(rawPublicKey: ByteArray): ByteArray =
    SubjectPublicKeyInfo(
        AlgorithmIdentifier(RecipientKey.X25519_OID),
        rawPublicKey,
    ).encoded

/**
 * DER PKCS#8 (RFC 8410) for a raw X25519 private scalar.
 *
 * The PKCS#8 `privateKey` OCTET STRING carries the DER of `CurvePrivateKey`,
 * which is itself an OCTET STRING, so the scalar is wrapped twice. Building the
 * sequence explicitly keeps that structure under our control — handing BC a
 * ready-made OCTET STRING would collapse the two layers into one.
 */
internal fun x25519Pkcs8(rawPrivateKey: ByteArray): ByteArray =
    DERSequence(
        org.bouncycastle.asn1.ASN1EncodableVector().apply {
            add(ASN1Integer(0L))
            add(AlgorithmIdentifier(RecipientKey.X25519_OID))
            add(DEROctetString(DEROctetString(rawPrivateKey).encoded))
        },
    ).encoded
