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

    fun encodeSigningKey(payload: SigningKeyPayload): String =
        json.encodeToString(SigningKeyPayload.serializer(), payload)

    fun decodeSigningKey(value: String): SigningKeyPayload? =
        runCatching { json.decodeFromString(SigningKeyPayload.serializer(), value) }.getOrNull()

    fun decodeTotp(value: String): TotpPayload? =
        runCatching { json.decodeFromString(TotpPayload.serializer(), value) }.getOrNull()
}
