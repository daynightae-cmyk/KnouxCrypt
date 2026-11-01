package com.knoux.crypt.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The keyring fingerprint is an integrity signal, never a shareable identity. */
class KeyDetailsTest {

    @Test
    fun fingerprintIsStableForTheSameKeyring() {
        val blobs = mapOf(1 to byteArrayOf(1, 2, 3), 2 to byteArrayOf(4, 5))
        val first = KeyRingFingerprint.compute("knoux.master.v2", blobs)
        val second = KeyRingFingerprint.compute("knoux.master.v2", blobs)
        assertEquals(first, second)
        assertTrue(first != null && first.length == 64)
    }

    @Test
    fun fingerprintChangesWhenAnyPartChanges() {
        val base = KeyRingFingerprint.compute("knoux.master.v2", mapOf(1 to byteArrayOf(1, 2, 3)))
        val otherBlob = KeyRingFingerprint.compute("knoux.master.v2", mapOf(1 to byteArrayOf(1, 2, 4)))
        val otherVersion = KeyRingFingerprint.compute("knoux.master.v2", mapOf(2 to byteArrayOf(1, 2, 3)))
        val otherAlias = KeyRingFingerprint.compute("other.alias", mapOf(1 to byteArrayOf(1, 2, 3)))
        assertNotEquals(base, otherBlob)
        assertNotEquals(base, otherVersion)
        assertNotEquals(base, otherAlias)
    }

    @Test
    fun emptyKeyringHasNoFingerprint() {
        assertNull(KeyRingFingerprint.compute("knoux.master.v2", emptyMap()))
    }

    @Test
    fun symmetricVaultKeyNeverClaimsAPublicKey() {
        val details = KeystoreKeyDetails(
            alias = "knoux.master.v2",
            algorithm = "AES",
            keySizeBits = 256,
            purposes = listOf(KeyPurposes.ENCRYPT, KeyPurposes.DECRYPT),
            protection = KeyProtectionLevel.TRUSTED_ENVIRONMENT,
            insideSecureHardware = true,
            strongBoxBacked = false,
            userAuthenticationRequired = false,
            userAuthenticationValiditySeconds = null,
            unlockedDeviceRequiredRequested = true,
        )
        assertEquals(false, details.hasExportablePublicKey)
        // The model carries no key material of any kind.
        val rendered = details.toString()
        assertTrue(rendered.contains("knoux.master.v2"))
        assertTrue(rendered.length < 400)
    }
}
