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
}

@Serializable
data class NotePayload(
    val title: String,
    val body: String,
)

@Serializable
data class PasswordPayload(
    val title: String,
    val username: String = "",
    val password: String = "",
    val url: String = "",
    val notes: String = "",
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

/** Encrypts payload bytes with AAD binding the record kind and identity. */
class SecretCodec(private val key: SecretKey) {
    private val envelope = AuthenticatedEnvelope()

    fun encrypt(kind: String, id: String, payloadJson: String): ByteArray =
        envelope.encrypt(key, payloadJson.toByteArray(Charsets.UTF_8), aad(kind, id))

    fun decrypt(kind: String, id: String, blob: ByteArray): String =
        String(envelope.decrypt(key, blob, aad(kind, id)), Charsets.UTF_8)

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

    fun decodeTotp(value: String): TotpPayload? =
        runCatching { json.decodeFromString(TotpPayload.serializer(), value) }.getOrNull()
}
