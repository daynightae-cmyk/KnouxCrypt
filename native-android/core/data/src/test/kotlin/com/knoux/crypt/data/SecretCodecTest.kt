package com.knoux.crypt.data

import java.security.GeneralSecurityException
import javax.crypto.spec.SecretKeySpec
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class SecretCodecTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val codec = SecretCodec(SecretKeySpec(ByteArray(32) { it.toByte() }, "AES"))

    @Test
    fun notePayloadRoundTrip() {
        val note = NotePayload("عنوان سري", "body that must never appear in plaintext")
        val encoded = codec.encrypt(SecretKinds.NOTE, "id-1", json.encodeToString(NotePayload.serializer(), note))
        assertFalse(String(encoded, Charsets.UTF_8).contains("body"))
        val decoded = json.decodeFromString(NotePayload.serializer(), codec.decrypt(SecretKinds.NOTE, "id-1", encoded))
        assertEquals(note, decoded)
    }

    @Test
    fun passwordPayloadRoundTrip() {
        val password = PasswordPayload("Mail", "user@example.test", "correct-horse", "https://example.test", "")
        val encoded = codec.encrypt(
            SecretKinds.PASSWORD, "id-2", json.encodeToString(PasswordPayload.serializer(), password),
        )
        val decoded = json.decodeFromString(
            PasswordPayload.serializer(),
            codec.decrypt(SecretKinds.PASSWORD, "id-2", encoded),
        )
        assertEquals(password, decoded)
    }

    @Test
    fun identityBindingRejectsSwappedRecords() {
        val encoded = codec.encrypt(SecretKinds.NOTE, "id-3", """{"title":"a","body":"b"}""")
        for ((kind, id) in listOf(SecretKinds.PASSWORD to "id-3", SecretKinds.NOTE to "id-4")) {
            try {
                codec.decrypt(kind, id, encoded)
                fail("Record accepted under a different identity")
            } catch (_: GeneralSecurityException) {
            } catch (_: IllegalArgumentException) {
            }
        }
        assertTrue(codec.decrypt(SecretKinds.NOTE, "id-3", encoded).contains("\"a\""))
    }

    @Test
    fun tamperingRejected() {
        val encoded = codec.encrypt(SecretKinds.TOTP, "id-5", """{"secretBase32":"JBSWY3DPEHPK3PXP"}""")
        for (index in listOf(0, 10, encoded.size - 1)) {
            val changed = encoded.clone()
            changed[index] = (changed[index].toInt() xor 1).toByte()
            try {
                codec.decrypt(SecretKinds.TOTP, "id-5", changed)
                fail("Tampered record accepted")
            } catch (_: GeneralSecurityException) {
            } catch (_: IllegalArgumentException) {
            }
        }
    }
}
