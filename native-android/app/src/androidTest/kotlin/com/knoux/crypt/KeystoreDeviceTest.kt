package com.knoux.crypt

import android.security.keystore.KeyInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.knoux.crypt.data.KeystoreManager
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Instrumented Keystore probes. NOT RUN in this session: no device or emulator was available. */
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
    fun unlockKeyIsUserAuthenticationBound() {
        val keystore = KeystoreManager()
        val key = keystore.createUnlockKeyIfNeeded()
        val factory = SecretKeyFactory.getInstance(key.algorithm, "AndroidKeyStore")
        val info = factory.getKeySpec(key, KeyInfo::class.java) as KeyInfo
        @Suppress("DEPRECATION")
        assertTrue(info.isUserAuthenticationRequired)
        val stored = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        assertTrue(stored.containsAlias(KeystoreManager.UNLOCK_ALIAS))
    }
}
