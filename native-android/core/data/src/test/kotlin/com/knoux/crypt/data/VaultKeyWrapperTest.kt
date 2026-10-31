package com.knoux.crypt.data

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.GeneralSecurityException
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.fail
import org.junit.Test

class VaultKeyWrapperTest {
    private val root: SecretKey = SecretKeySpec(ByteArray(32) { (it * 11 + 3).toByte() }, "AES")
    private val dek: SecretKey = SecretKeySpec(ByteArray(32) { (it * 13 + 5).toByte() }, "AES")
    private val wrapper = DataKeyWrapper()

    @Test
    fun currentWrappingRoundTripsAndBindsVersion() {
        val wrapped = wrapper.wrap(root, version = 9, dek = dek)
        val opened = wrapper.unwrap(root, expectedVersion = 9, blob = wrapped)
        assertArrayEquals(dek.encoded, opened.encoded)
        try {
            wrapper.unwrap(root, expectedVersion = 8, blob = wrapped)
            fail("Wrong wrapped key version accepted")
        } catch (_: IllegalArgumentException) {
        }
    }

    @Test
    fun legacyCallerIvWrappedKeyRemainsReadable() {
        // KDK1 blobs produced before the Keystore IV correction used a caller
        // nonce. Decryption must keep accepting those layouts.
        val version = 4
        val context = "knoux:dek-wrap:v1".toByteArray()
        val header = ByteBuffer.allocate(9).order(ByteOrder.BIG_ENDIAN)
            .put(byteArrayOf(0x4b, 0x44, 0x4b, 0x31)).put(1.toByte()).putInt(version).array()
        val nonce = ByteArray(12) { (it + 2).toByte() }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, root, GCMParameterSpec(128, nonce))
        cipher.updateAAD(header)
        cipher.updateAAD(context)
        val legacy = header + nonce + cipher.doFinal(dek.encoded)

        val opened = wrapper.unwrap(root, version, legacy)
        assertArrayEquals(dek.encoded, opened.encoded)

        val tampered = legacy.clone()
        tampered[tampered.size - 1] = (tampered[tampered.size - 1].toInt() xor 1).toByte()
        try {
            wrapper.unwrap(root, version, tampered)
            fail("Tampered KDK1 accepted")
        } catch (_: GeneralSecurityException) {
        }
    }

    @Test
    fun malformedAndWrongRootRejected() {
        val wrapped = wrapper.wrap(root, 2, dek)
        val wrongRoot = SecretKeySpec(ByteArray(32) { (it * 3 + 1).toByte() }, "AES")
        try {
            wrapper.unwrap(wrongRoot, 2, wrapped)
            fail("Wrong root accepted")
        } catch (_: GeneralSecurityException) {
        }
        try {
            wrapper.unwrap(root, 2, wrapped.copyOf(wrapped.size - 1))
            fail("Truncated KDK1 accepted")
        } catch (_: IllegalArgumentException) {
        }
        assertFalse(wrapped.contentEquals(dek.encoded))
    }
}
