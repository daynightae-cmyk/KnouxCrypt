package com.knoux.crypt.security

import java.security.GeneralSecurityException
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.junit.Assert.*
import org.junit.Test

class FoundationTest {
    private val key = SecretKeySpec(ByteArray(32) { it.toByte() }, "AES")
    private val context = "knoux:test:record-1".toByteArray()
    private val codec = AuthenticatedEnvelope()
    private fun rejected(action: () -> Unit) {
        try { action(); fail("Unauthenticated input accepted") }
        catch (_: GeneralSecurityException) { /* expected */ }
        catch (_: IllegalArgumentException) { /* expected framing rejection */ }
    }
    @Test fun debugGuestCannotReadSecrets() {
        val policy = SessionPolicy(true)
        assertTrue(policy.enterGuestPreview())
        assertFalse(policy.canReadSecrets())
        policy.lock()
        assertEquals(SessionMode.LOCKED, policy.mode)
    }
    @Test fun releaseGuestDenied() {
        val policy = SessionPolicy(false)
        assertFalse(policy.enterGuestPreview())
        assertEquals(SessionMode.LOCKED, policy.mode)
        assertFalse(policy.canReadSecrets())
    }
    @Test fun roundTripBoundaries() {
        for (size in listOf(0, 1, 15, 16, 17, 4096, AuthenticatedEnvelope.MAX_PLAINTEXT_BYTES)) {
            val input = ByteArray(size) { (it % 251).toByte() }
            assertArrayEquals(input, codec.decrypt(key, codec.encrypt(key, input, context), context))
        }
    }
    @Test fun nonceVaries() {
        val a = codec.encrypt(key, byteArrayOf(1), context)
        val b = codec.encrypt(key, byteArrayOf(1), context)
        assertFalse(a.copyOfRange(10, 22).contentEquals(b.copyOfRange(10, 22)))
    }
    @Test fun rejectsEachByteTamper() {
        val data = codec.encrypt(key, "sample".toByteArray(), context)
        for (index in data.indices) {
            val changed = data.clone()
            changed[index] = (changed[index].toInt() xor 1).toByte()
            rejected { codec.decrypt(key, changed, context) }
        }
    }
    @Test fun wrongKeyAndContextRejected() {
        val data = codec.encrypt(key, byteArrayOf(7), context)
        rejected { codec.decrypt(SecretKeySpec(ByteArray(32) { 99 }, "AES"), data, context) }
        rejected { codec.decrypt(key, data, "other record".toByteArray()) }
    }
    @Test fun truncationAndTrailingBytesRejected() {
        val data = codec.encrypt(key, ByteArray(16), context)
        for (length in 0 until data.size) rejected { codec.decrypt(key, data.copyOf(length), context) }
        rejected { codec.decrypt(key, data + byteArrayOf(0), context) }
    }
    @Test fun rejectsOversizedAndNon256BitKeys() {
        rejected { codec.encrypt(key, ByteArray(AuthenticatedEnvelope.MAX_PLAINTEXT_BYTES + 1), context) }
        rejected { codec.encrypt(SecretKeySpec(ByteArray(16), "AES"), byteArrayOf(), context) }
    }
    @Test fun emptyContextAndOversizedContextRejected() {
        rejected { codec.encrypt(key, byteArrayOf(1), byteArrayOf()) }
        rejected { codec.encrypt(key, byteArrayOf(1), ByteArray(4097)) }
        val data = codec.encrypt(key, byteArrayOf(1), context)
        rejected { codec.decrypt(key, data, byteArrayOf()) }
    }
    @Test fun nistAes256GcmKnownAnswer() {
        // NIST GCM zero key/IV, one zero block, no AAD. Test provider, not UI.
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(ByteArray(32), "AES"), GCMParameterSpec(128, ByteArray(12)))
        val expected = hex("cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919")
        assertArrayEquals(expected, cipher.doFinal(ByteArray(16)))
    }
    private fun hex(value: String) = value.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
}
