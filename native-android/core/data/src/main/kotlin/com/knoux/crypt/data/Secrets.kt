package com.knoux.crypt.data

import com.knoux.crypt.security.AuthenticatedEnvelope
import javax.crypto.SecretKey
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object SecretKinds {
    const val NOTE = "note"
    const val PASSWORD = "password"
    const val TOTP = "totp"
    const val SIGNATURE = "signature"
    const val SIGNING_KEY = "signing_key"
    const val PUBLIC_KEY = "public_key"
    const val SHARE_IDENTITY = "share_identity"
    const val SHARE_RECIPIENT = "share_recipient"
    const val SHARE_RECEIPT = "share_receipt"
    const val CERTIFICATE = "certificate"
    const val ARCHIVE = "archive"
}

@Serializable
data class NotePayload(
    val title: String,
    val body: String,
)

/**
 * Metadata about a past save of a credential. It deliberately stores no old
 * plaintext: previous secret values are not kept anywhere, so history can be
 * shown honestly without extending the exposure of a retired password.
 */
@Serializable
data class PasswordRevision(
    val savedAt: Long,
    val strength: String,
    val changed: List<String> = emptyList(),
)

@Serializable
data class PasswordPayload(
    val title: String,
    val username: String = "",
    val password: String = "",
    val url: String = "",
    val notes: String = "",
    /** Newest first, bounded by [PasswordRevisions.MAX_ENTRIES]. */
    val revisions: List<PasswordRevision> = emptyList(),
)

/** A detached signature record: no signed document is stored, only its digest. */
@Serializable
data class SignaturePayload(
    val label: String,
    val algorithm: String,
    val publicKeySpkiBase64: String,
    val signatureBase64: String,
    val digestHex: String,
    val createdAt: Long,
)

/**
 * The metadata block inside a KSG1/KSA1 signature package (TASK 38). It describes
 * what was signed; the signed bytes themselves are never stored here.
 */
@Serializable
data class SignaturePackageMeta(
    val label: String,
    val fileName: String,
    val fileSize: Long,
    val digestHex: String,
    val signerFingerprint: String,
    val keyOrigin: String,
    val createdAt: Long,
)

/** A public key kept for fingerprint comparison and QR sharing. */
@Serializable
data class PublicKeyPayload(
    val label: String,
    val spkiBase64: String,
    val fingerprint: String,
    val origin: String,
    val createdAt: Long,
)

/**
 * A recipient this device may seal a Secure Share package to (TASK 16).
 *
 * [confirmedFingerprint] is only ever written after the person using the app has
 * compared the full fingerprint against what the other side read out, so an
 * unverified key stays visibly unverified in the UI and cannot be sealed to.
 */
@Serializable
data class ShareRecipientPayload(
    val label: String,
    val spkiBase64: String,
    val fingerprint: String,
    val keyIdHex: String,
    val algorithm: String,
    val createdAt: Long,
    val confirmedFingerprint: String = "",
    val confirmedAt: Long = 0L,
)

/**
 * This installation's X25519 sharing identity. The private half lives here and
 * nowhere else, inside a vault record encrypted by the device key, and
 * [origin] says honestly that it is a software key rather than Keystore-backed.
 */
@Serializable
data class ShareIdentityPayload(
    val spkiBase64: String,
    val privatePkcs8Base64: String,
    val fingerprint: String,
    val origin: String,
    val createdAt: Long,
)

/** The encrypted metadata block carried inside a KSR1 package. */
@Serializable
data class ShareMetadataPayload(
    val fileName: String,
    val mimeType: String,
    val senderLabel: String,
    val senderFingerprint: String,
    val note: String = "",
)

/** What this device sealed or opened. No plaintext, no content key, no file body. */
@Serializable
data class ShareReceiptPayload(
    val packageIdHex: String,
    val displayName: String,
    val plaintextLength: Long,
    val createdAt: Long,
    val expiresAt: Long,
    val digestHex: String,
    val direction: String,
    val delivery: String,
    val recipients: List<ShareReceiptRecipient> = emptyList(),
)

@Serializable
data class ShareReceiptRecipient(
    val label: String,
    val fingerprint: String,
    val verified: Boolean,
)

/**
 * An imported X.509 certificate (TASK 20). The DER bytes are kept so a later
 * inspection sees the original encoding, and [isAnchor] records only that this
 * person chose to trust it — never that the certificate earned trust itself.
 */
@Serializable
data class CertificatePayload(
    val label: String,
    val derBase64: String,
    val subject: String,
    val issuer: String,
    val fingerprint: String,
    val notBeforeMillis: Long,
    val notAfterMillis: Long,
    val isCa: Boolean,
    val isAnchor: Boolean,
    val addedAt: Long,
)

/**
 * An archive this device created (TASK 21). Entry names live inside the encrypted
 * container, so the record keeps only counts, sizes, the container digest and how
 * the key is protected.
 */
@Serializable
data class ArchiveRecordPayload(
    val label: String,
    val entryCount: Int,
    val plaintextBytes: Long,
    val containerBytes: Long,
    val digestHex: String,
    val compressed: Boolean,
    val keySource: String,
    val createdAt: Long,
)

@Serializable
data class TotpPayload(
    val issuer: String,
    val account: String,
    val secretBase32: String,
    val algorithm: String = "SHA1",
    val digits: Int = 6,
    val period: Int = 30,
)

data class SecretRecord(
    val id: String,
    val kind: String,
    val payloadJson: String,
    val updatedAt: Long,
    val decryptionFailed: Boolean = false,
)

/**
 * Encrypts payload bytes with AAD binding the record kind and identity.
 *
 * [keyVersion] 0 writes/reads the legacy KNC1 envelope (root-key records).
 * Positive versions use KNC2 and authenticate the key version in the header.
 */
class SecretCodec(private val key: SecretKey) {
    private val envelope = AuthenticatedEnvelope()

    fun encrypt(kind: String, id: String, payloadJson: String): ByteArray =
        encrypt(kind, id, payloadJson, keyVersion = 0)

    fun encrypt(kind: String, id: String, payloadJson: String, keyVersion: Int): ByteArray {
        val plaintext = payloadJson.toByteArray(Charsets.UTF_8)
        return if (keyVersion == 0) {
            envelope.encrypt(key, plaintext, aad(kind, id))
        } else {
            envelope.encryptVersioned(key, plaintext, aad(kind, id), keyVersion)
        }
    }

    fun decrypt(kind: String, id: String, blob: ByteArray): String =
        decrypt(kind, id, blob, keyVersion = 0)

    fun decrypt(kind: String, id: String, blob: ByteArray, keyVersion: Int): String {
        // Always bind the expected key version, including 0 -> KNC1, so a
        // tampered row.keyVersion cannot select a more permissive format.
        val plaintext = envelope.decryptVersioned(key, blob, aad(kind, id), keyVersion)
        return String(plaintext, Charsets.UTF_8)
    }

    private fun aad(kind: String, id: String): ByteArray =
        "knoux:secret:$kind:$id:v1".toByteArray(Charsets.UTF_8)
}

/** Typed payload codecs kept in the data module so the UI never hand-rolls JSON. */
object SecretsJson {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    fun encodeNote(title: String, body: String): String =
        json.encodeToString(NotePayload.serializer(), NotePayload(title, body))

    fun decodeNote(value: String): NotePayload? =
        runCatching { json.decodeFromString(NotePayload.serializer(), value) }.getOrNull()

    fun encodePassword(payload: PasswordPayload): String =
        json.encodeToString(PasswordPayload.serializer(), payload)

    fun decodePassword(value: String): PasswordPayload? =
        runCatching { json.decodeFromString(PasswordPayload.serializer(), value) }.getOrNull()

    fun encodeTotp(payload: TotpPayload): String =
        json.encodeToString(TotpPayload.serializer(), payload)

    fun encodeSignature(payload: SignaturePayload): String =
        json.encodeToString(SignaturePayload.serializer(), payload)

    fun decodeSignature(value: String): SignaturePayload? =
        runCatching { json.decodeFromString(SignaturePayload.serializer(), value) }.getOrNull()

    fun encodeSignaturePackageMeta(payload: SignaturePackageMeta): String =
        json.encodeToString(SignaturePackageMeta.serializer(), payload)

    fun decodeSignaturePackageMeta(value: String): SignaturePackageMeta? =
        runCatching { json.decodeFromString(SignaturePackageMeta.serializer(), value) }.getOrNull()

    fun encodePublicKey(payload: PublicKeyPayload): String =
        json.encodeToString(PublicKeyPayload.serializer(), payload)

    fun decodePublicKey(value: String): PublicKeyPayload? =
        runCatching { json.decodeFromString(PublicKeyPayload.serializer(), value) }.getOrNull()

    fun encodeShareRecipient(payload: ShareRecipientPayload): String =
        json.encodeToString(ShareRecipientPayload.serializer(), payload)

    fun decodeShareRecipient(value: String): ShareRecipientPayload? =
        runCatching { json.decodeFromString(ShareRecipientPayload.serializer(), value) }.getOrNull()

    fun encodeShareIdentity(payload: ShareIdentityPayload): String =
        json.encodeToString(ShareIdentityPayload.serializer(), payload)

    fun decodeShareIdentity(value: String): ShareIdentityPayload? =
        runCatching { json.decodeFromString(ShareIdentityPayload.serializer(), value) }.getOrNull()

    fun encodeShareMetadata(payload: ShareMetadataPayload): String =
        json.encodeToString(ShareMetadataPayload.serializer(), payload)

    fun decodeShareMetadata(value: String): ShareMetadataPayload? =
        runCatching { json.decodeFromString(ShareMetadataPayload.serializer(), value) }.getOrNull()

    fun encodeShareReceipt(payload: ShareReceiptPayload): String =
        json.encodeToString(ShareReceiptPayload.serializer(), payload)

    fun decodeShareReceipt(value: String): ShareReceiptPayload? =
        runCatching { json.decodeFromString(ShareReceiptPayload.serializer(), value) }.getOrNull()

    fun encodeCertificate(payload: CertificatePayload): String =
        json.encodeToString(CertificatePayload.serializer(), payload)

    fun decodeCertificate(value: String): CertificatePayload? =
        runCatching { json.decodeFromString(CertificatePayload.serializer(), value) }.getOrNull()

    fun encodeArchive(payload: ArchiveRecordPayload): String =
        json.encodeToString(ArchiveRecordPayload.serializer(), payload)

    fun decodeArchive(value: String): ArchiveRecordPayload? =
        runCatching { json.decodeFromString(ArchiveRecordPayload.serializer(), value) }.getOrNull()

    fun encodeSigningKey(payload: SigningKeyPayload): String =
        json.encodeToString(SigningKeyPayload.serializer(), payload)

    fun decodeSigningKey(value: String): SigningKeyPayload? =
        runCatching { json.decodeFromString(SigningKeyPayload.serializer(), value) }.getOrNull()

    fun decodeTotp(value: String): TotpPayload? =
        runCatching { json.decodeFromString(TotpPayload.serializer(), value) }.getOrNull()
}
