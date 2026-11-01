package com.knoux.crypt.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.knoux.crypt.security.DigitalSignatureService
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented signing check on the real device (TASK 19).
 *
 * The itel S686LN's AndroidKeyStore provider answers "no such algorithm: EC"
 * and then "no such algorithm: RSA", so the signing service must fall back to a
 * software key pair stored encrypted in the vault and must say so. This test
 * asserts whichever origin the device ends up with: the signature has to verify
 * with the exported public key, altered content must not verify, and the
 * private key must never appear in the stored row.
 */
@RunWith(AndroidJUnit4::class)
class SigningDeviceTest {

    private class SoftwareKeySource : VaultKeySource {
        private var master: SecretKey? = null
        override fun hasMasterKey(): Boolean = master != null
        override fun masterKey(): SecretKey = master
            ?: SecretKeySpec(ByteArray(32) { (it * 17 + 5).toByte() }, "AES").also { master = it }
        override fun masterKeySecurityLevel(): String? = "FAKE_SOFTWARE"
    }

    @Test
    fun signingWorksOnThisDeviceAndThePrivateKeyStaysEncrypted() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, KnouxDatabase::class.java).build()
        try {
            val session = SessionManager(SoftwareKeySource())
            val dao = database.secrets()
            val repository = SecretRepository(dao, session, VaultKeyManager(session, MemoryRegistry()))
            val gate = Cipher.getInstance("AES/GCM/NoPadding")
                .apply { init(Cipher.ENCRYPT_MODE, SecretKeySpec(ByteArray(32) { 8 }, "AES")) }
            session.authorizeEnrollment(GateCipher(GatePurpose.ENROLL, gate))
            val access = session.currentAccess() ?: error("the vault did not open")

            val service = SigningService(KeystoreManager(), repository, session)
            val content = "KNOUX device signing check".toByteArray()
            val artifact = service.sign(content)

            assertTrue(
                "unexpected algorithm ${artifact.algorithm}",
                artifact.algorithm == DigitalSignatureService.ALGORITHM_ECDSA ||
                    artifact.algorithm == DigitalSignatureService.ALGORITHM_RSA,
            )
            assertTrue(
                "unexpected key origin ${artifact.origin}",
                artifact.origin == SigningKeyOrigin.KEYSTORE ||
                    artifact.origin == SigningKeyOrigin.VAULT_SOFTWARE,
            )
            assertEquals(DigitalSignatureService.digestHex(content), artifact.digestHex)

            val publicKey = DigitalSignatureService.publicKeyFromBase64(artifact.publicKeySpkiBase64)
            assertNotNull(publicKey)
            val signature = DigitalSignatureService.signatureFromBase64(artifact.signatureBase64)
            assertNotNull(signature)
            assertEquals(
                DigitalSignatureService.Verdict.VALID,
                DigitalSignatureService.verify(content, publicKey!!, signature!!, artifact.algorithm),
            )
            assertEquals(
                DigitalSignatureService.Verdict.INVALID_SIGNATURE,
                DigitalSignatureService.verify("other content".toByteArray(), publicKey, signature, artifact.algorithm),
            )

            // The exported public key must be stable across calls.
            assertEquals(service.publicKeyBase64(), artifact.publicKeySpkiBase64)

            if (artifact.origin == SigningKeyOrigin.VAULT_SOFTWARE) {
                // The software private key lives in the vault, encrypted.
                val row = dao.find(SigningService.SIGNING_KEY_ID) ?: error("signing key record missing")
                val raw = String(row.envelope, Charsets.ISO_8859_1)
                assertFalse("the private key leaked into the stored row", raw.contains("PRIVATE"))
                val decoded = SecretsJson.decodeSigningKey(
                    repository.find(access, SigningService.SIGNING_KEY_ID)!!.payloadJson,
                )
                assertNotNull(decoded)
                assertTrue(decoded!!.privateKeyPkcs8Base64.isNotEmpty())
            }
        } finally {
            database.close()
        }
    }

    private class MemoryRegistry : VaultKeyRegistry {
        override suspend fun activeVersion(): Int = 0
        override suspend fun setActiveVersion(version: Int) = Unit
        override suspend fun wrappedKey(version: Int): ByteArray? = null
        override suspend fun storeWrappedKey(version: Int, blob: ByteArray) = Unit
        override suspend fun removeWrappedKey(version: Int) = Unit
        override suspend fun versions(): List<Int> = emptyList()
        override suspend fun rotationJournal(): RotationJournal? = null
        override suspend fun setRotationJournal(journal: RotationJournal?) = Unit
    }
}
