package com.knoux.crypt.data

import android.security.keystore.KeyInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented Keystore probes. Compiles on the JVM but needs real Android
 * hardware for results; no device or emulator was available when this file was
 * added. Never report these as passing without device evidence.
 */
@RunWith(AndroidJUnit4::class)
class KeystoreDeviceTest {
    @Test
    fun masterKeyRoundTripsAnAuthenticatedRecord() {
        val keystore = KeystoreManager()
        val key = keystore.masterKey()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val iv = cipher.iv
        val plaintext = "knoux-device-check".toByteArray()
        val sealed = cipher.doFinal(plaintext)

        val opening = Cipher.getInstance("AES/GCM/NoPadding")
        opening.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
        assertArrayEquals(plaintext, opening.doFinal(sealed))
    }

    @Test
    fun gateKeyIsUserAuthenticationBound() {
        val keystore = KeystoreManager()
        keystore.createGateIfNeeded(GateSlot.PRIMARY)
        val stored = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        assertTrue(stored.containsAlias(VaultKeyAliases.GATE_PRIMARY))
        val key = stored.getKey(VaultKeyAliases.GATE_PRIMARY, null) as javax.crypto.SecretKey
        val factory = SecretKeyFactory.getInstance(key.algorithm, "AndroidKeyStore")
        val info = factory.getKeySpec(key, KeyInfo::class.java) as KeyInfo
        @Suppress("DEPRECATION")
        assertTrue(info.isUserAuthenticationRequired)
    }
}
