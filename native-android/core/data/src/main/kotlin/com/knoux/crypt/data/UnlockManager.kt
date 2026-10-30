package com.knoux.crypt.data

import android.content.Context
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.security.GeneralSecurityException
import java.security.MessageDigest
import javax.crypto.Cipher
import kotlinx.coroutines.flow.first

private val Context.unlockDataStore by preferencesDataStore("knoux_unlock")

class UnlockNotConfiguredException : Exception("Secure unlock has not been set up")
class UnlockRejectedException : Exception("Unlock was not authorized")
class UnlockKeyInvalidatedException : Exception("The unlock key was invalidated by a biometric change")

/**
 * Binds an unlock to a real Keystore key operation. A UI confirmation alone can
 * never mark the session unlocked.
 */
class UnlockManager(
    context: Context,
    private val keystore: KeystoreManager,
    private val session: SessionManager,
) {
    companion object {
        private const val TOKEN = "KNOUX-UNLOCK-V2"
        private val BLOB_KEY = stringPreferencesKey("token_blob")
    }

    private val appContext = context.applicationContext

    suspend fun isConfigured(): Boolean = keystore.hasUnlockKey() && readBlob() != null

    suspend fun prepareSetupCipher(): Cipher {
        keystore.createUnlockKeyIfNeeded()
        return keystore.newUnlockEncryptCipher()
    }

    suspend fun completeSetup(cipher: Cipher) {
        val ciphertext = cipher.doFinal(TOKEN.toByteArray(Charsets.UTF_8))
        val blob = cipher.iv + ciphertext
        appContext.unlockDataStore.edit { it[BLOB_KEY] = Base64.encodeToString(blob, Base64.NO_WRAP) }
        session.unlock()
    }

    suspend fun prepareUnlockCipher(): Cipher {
        val blob = readBlob() ?: throw UnlockNotConfiguredException()
        if (!keystore.hasUnlockKey()) throw UnlockNotConfiguredException()
        return keystore.newUnlockDecryptCipher(blob.copyOfRange(0, 12))
    }

    suspend fun completeUnlock(cipher: Cipher) {
        val blob = readBlob() ?: throw UnlockNotConfiguredException()
        val plain = try {
            cipher.doFinal(blob, 12, blob.size - 12)
        } catch (failure: GeneralSecurityException) {
            if (keystore.isInvalidated(failure)) throw UnlockKeyInvalidatedException()
            throw UnlockRejectedException()
        }
        if (!MessageDigest.isEqual(plain, TOKEN.toByteArray(Charsets.UTF_8))) throw UnlockRejectedException()
        session.unlock()
    }

    /** Explicit owner action only: deletes the gate and its token, never vault data. */
    suspend fun reset() {
        keystore.deleteUnlockKey()
        appContext.unlockDataStore.edit { it.remove(BLOB_KEY) }
        session.lock()
    }

    private suspend fun readBlob(): ByteArray? {
        val encoded = appContext.unlockDataStore.data.first()[BLOB_KEY] ?: return null
        return runCatching { Base64.decode(encoded, Base64.NO_WRAP) }.getOrNull()
            ?.takeIf { it.size >= 12 + 16 }
    }
}
