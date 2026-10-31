package com.knoux.crypt.data

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.GeneralSecurityException
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
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
    fun versionedRecordsBindTheirKeyVersion() {
        val payload = """{"title":"v","body":"versioned"}"""
        val versioned = codec.encrypt(SecretKinds.NOTE, "id-v", payload, keyVersion = 3)
        assertEquals(payload, codec.decrypt(SecretKinds.NOTE, "id-v", versioned, keyVersion = 3))

        for (wrong in listOf(0, 2, 4)) {
            try {
                codec.decrypt(SecretKinds.NOTE, "id-v", versioned, keyVersion = wrong)
                fail("Record accepted under key version $wrong")
            } catch (_: GeneralSecurityException) {
            } catch (_: IllegalArgumentException) {
            }
        }

        val legacy = codec.encrypt(SecretKinds.NOTE, "id-l", payload)
        try {
            codec.decrypt(SecretKinds.NOTE, "id-l", legacy, keyVersion = 3)
            fail("Legacy KNC1 record accepted as a versioned KNC2 record")
        } catch (_: GeneralSecurityException) {
        } catch (_: IllegalArgumentException) {
        }

        val tamperedVersion = versioned.clone()
        tamperedVersion[6] = (tamperedVersion[6].toInt() xor 1).toByte()
        try {
            codec.decrypt(SecretKinds.NOTE, "id-v", tamperedVersion, keyVersion = 3)
            fail("Tampered key-version header accepted")
        } catch (_: GeneralSecurityException) {
        } catch (_: IllegalArgumentException) {
        }
    }

    @Test
    fun legacyCallerIvKncFormatsRemainReadable() {
        val key = SecretKeySpec(ByteArray(32) { (it * 5 + 2).toByte() }, "AES")
        val payload = """{"title":"legacy","body":"caller-iv"}"""
        val aad = "knoux:secret:${SecretKinds.NOTE}:legacy-id:v1".toByteArray()

        val knc1Nonce = ByteArray(12) { (it + 1).toByte() }
        val knc1Header = ByteBuffer.allocate(10).order(ByteOrder.BIG_ENDIAN)
            .put(byteArrayOf(0x4b, 0x4e, 0x43, 0x31))
            .put(1.toByte()).put(1.toByte()).putInt(payload.toByteArray().size).array()
        val knc1Cipher = Cipher.getInstance("AES/GCM/NoPadding")
        knc1Cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, knc1Nonce))
        knc1Cipher.updateAAD(knc1Header)
        knc1Cipher.updateAAD(aad)
        val knc1 = knc1Header + knc1Nonce + knc1Cipher.doFinal(payload.toByteArray())
        assertEquals(
            payload,
            SecretCodec(key).decrypt(SecretKinds.NOTE, "legacy-id", knc1, keyVersion = 0),
        )

        val knc2Nonce = ByteArray(12) { (it + 7).toByte() }
        val knc2Header = ByteBuffer.allocate(14).order(ByteOrder.BIG_ENDIAN)
            .put(byteArrayOf(0x4b, 0x4e, 0x43, 0x31))
            .put(2.toByte()).put(1.toByte()).putInt(3).putInt(payload.toByteArray().size).array()
        val knc2Cipher = Cipher.getInstance("AES/GCM/NoPadding")
        knc2Cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, knc2Nonce))
        knc2Cipher.updateAAD(knc2Header)
        knc2Cipher.updateAAD(aad)
        val knc2 = knc2Header + knc2Nonce + knc2Cipher.doFinal(payload.toByteArray())
        assertEquals(
            payload,
            SecretCodec(key).decrypt(SecretKinds.NOTE, "legacy-id", knc2, keyVersion = 3),
        )
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
