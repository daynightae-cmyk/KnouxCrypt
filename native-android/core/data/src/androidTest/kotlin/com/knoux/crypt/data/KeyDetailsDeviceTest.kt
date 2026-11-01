package com.knoux.crypt.data

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented check of the real Keystore metadata that TASK 13 reports.
 *
 * It proves the platform actually answers with the alias, algorithm, size,
 * purposes and protection class, and that the reported protection matches the
 * hardware claim — no fabricated "hardware backed" label.
 */
@RunWith(AndroidJUnit4::class)
class KeyDetailsDeviceTest {

    @Test
    fun masterKeyMetadataComesFromTheRealKeystore() {
        val manager = KeystoreManager()
        manager.masterKey() // provisions the alias if this test runs first
        val details = manager.masterKeyDetails()
        assertNotNull("the Keystore returned no metadata", details)
        requireNotNull(details)

        assertEquals(KeystoreManager.MASTER_ALIAS, details.alias)
        assertEquals("AES", details.algorithm)
        assertEquals(256, details.keySizeBits)
        assertTrue(details.purposes.contains(KeyPurposes.ENCRYPT))
        assertTrue(details.purposes.contains(KeyPurposes.DECRYPT))
        assertFalse(details.purposes.contains(KeyPurposes.SIGN))

        // The vault key is deliberately not auth-bound; the unlock gate key is.
        assertFalse(details.userAuthenticationRequired)
        assertFalse(details.hasExportablePublicKey)

        // The protection class must be something the platform actually stated.
        assertTrue(
            "unexpected protection class ${details.protection}",
            details.protection == KeyProtectionLevel.STRONGBOX ||
                details.protection == KeyProtectionLevel.TRUSTED_ENVIRONMENT ||
                details.protection == KeyProtectionLevel.SOFTWARE,
        )
        if (details.protection == KeyProtectionLevel.STRONGBOX) {
            assertTrue(details.strongBoxBacked)
        }
        if (details.protection == KeyProtectionLevel.TRUSTED_ENVIRONMENT ||
            details.protection == KeyProtectionLevel.STRONGBOX
        ) {
            assertTrue("hardware claim without insideSecureHardware", details.insideSecureHardware)
        }
        // The metadata model carries no byte arrays at all, so no key material
        // can travel with it.
        assertTrue(details.javaClass.declaredFields.none { it.type == ByteArray::class.java })
    }
}
