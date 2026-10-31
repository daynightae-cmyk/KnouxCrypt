package com.knoux.crypt.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.knoux.crypt.security.StrengthLevel
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented credential-detail checks against a real Room database: the
 * revision history survives the encrypted round trip, the stored envelope never
 * contains the plaintext, and the reveal window is driven by the live session.
 *
 * The vault key is a software key so the test does not need a fingerprint
 * prompt; real Keystore behaviour is covered by KeystoreDeviceTest.
 */
@RunWith(AndroidJUnit4::class)
class PasswordDetailRoomTest {

    private class SoftwareKeySource : VaultKeySource {
        private var master: SecretKey? = null
        override fun hasMasterKey(): Boolean = master != null
        override fun masterKey(): SecretKey = master
            ?: SecretKeySpec(ByteArray(32) { (it * 3 + 11).toByte() }, "AES").also { master = it }
        override fun masterKeySecurityLevel(): String? = "FAKE_SOFTWARE"
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

    @Test
    fun detailRoundTripKeepsHistoryAndNeverStoresPlaintext() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, KnouxDatabase::class.java).build()
        try {
            val session = SessionManager(SoftwareKeySource())
            val dao = database.secrets()
            val keys = VaultKeyManager(session, MemoryRegistry())
            val repository = SecretRepository(dao, session, keys)
            val gate = Cipher.getInstance("AES/GCM/NoPadding")
                .apply { init(Cipher.ENCRYPT_MODE, SecretKeySpec(ByteArray(32) { 5 }, "AES")) }
            session.authorizeEnrollment(GateCipher(GatePurpose.ENROLL, gate))
            val access = session.currentAccess() ?: error("the vault did not open")

            val first = PasswordPayload("Mail", "me@example.com", "First#Vector9qL", "https://mail.example", "note")
            repository.save(access, SecretKinds.PASSWORD, "cred", SecretsJson.encodePassword(first))

            val loaded = repository.find(access, "cred") ?: error("row missing")
            val decoded = SecretsJson.decodePassword(loaded.payloadJson) ?: error("payload unreadable")
            assertEquals(first, decoded)
            assertTrue(decoded.revisions.isEmpty())

            // Reveal must be permitted while the session is fresh, and refused
            // outright once the session is gone.
            val age = session.sessionAgeMillis()
            assertNotNull(age)
            assertEquals(RevealGate.ALLOWED, CredentialRevealPolicy.gate(age))
            assertEquals(RevealGate.NO_SESSION, CredentialRevealPolicy.gate(null))

            // Re-save a changed secret through the same rules the screen uses.
            val second = first.copy(password = "Second#Vector4tR")
            val changed = CredentialDiff.changedFields(first, second)
            assertEquals(setOf("secret"), changed)
            val strength = com.knoux.crypt.security.PasswordStrength.evaluate(second.password).level
            val withHistory = second.copy(
                revisions = PasswordRevisions.append(
                    first.revisions,
                    PasswordRevisions.entry(System.currentTimeMillis(), strength, changed),
                ),
            )
            repository.save(access, SecretKinds.PASSWORD, "cred", SecretsJson.encodePassword(withHistory))

            val reread = SecretsJson.decodePassword(
                repository.find(access, "cred")?.payloadJson ?: error("row missing"),
            ) ?: error("payload unreadable")
            assertEquals(1, reread.revisions.size)
            assertEquals(strength.name, reread.revisions.first().strength)
            assertEquals(listOf("secret"), reread.revisions.first().changed)
            assertEquals("Second#Vector4tR", reread.password)

            // The stored envelope must not contain either plaintext value.
            val entity = dao.find("cred") ?: error("row missing")
            val stored = String(entity.envelope, Charsets.ISO_8859_1)
            assertFalse(stored.contains("First#Vector9qL"))
            assertFalse(stored.contains("Second#Vector4tR"))
            assertFalse(stored.contains("me@example.com"))

            repository.delete(access, "cred")
            assertNull(repository.find(access, "cred"))

            // Locking drops the session age, so a reveal can no longer be granted.
            session.lock()
            assertNull(session.sessionAgeMillis())
        } finally {
            database.close()
        }
    }

    /**
     * The detail screen is only reachable with a live capability, and a fresh
     * gate can never claim a vault that already has one. This asserts that rule
     * against a real Room database and a real provisioned master key.
     */
    @Test
    fun lockedExistingVaultRefusesANewEnrollmentGate() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, KnouxDatabase::class.java).build()
        try {
            val source = SoftwareKeySource()
            val session = SessionManager(source)
            val keys = VaultKeyManager(session, MemoryRegistry())
            val repository = SecretRepository(database.secrets(), session, keys)
            val gate = Cipher.getInstance("AES/GCM/NoPadding")
                .apply { init(Cipher.ENCRYPT_MODE, SecretKeySpec(ByteArray(32) { 5 }, "AES")) }
            session.authorizeEnrollment(GateCipher(GatePurpose.ENROLL, gate))
            val access = session.currentAccess() ?: error("the vault did not open")
            repository.save(
                access,
                SecretKinds.PASSWORD,
                "cred",
                SecretsJson.encodePassword(PasswordPayload("Mail", "me", "Persist#Vector2xK")),
            )
            session.lock()

            val replacement = Cipher.getInstance("AES/GCM/NoPadding")
                .apply { init(Cipher.ENCRYPT_MODE, SecretKeySpec(ByteArray(32) { 9 }, "AES")) }
            var blocked: Throwable? = null
            try {
                session.authorizeEnrollment(GateCipher(GatePurpose.ENROLL, replacement))
            } catch (expected: UnlockReenrollmentBlockedException) {
                blocked = expected
            }
            assertTrue(blocked is UnlockReenrollmentBlockedException)
            assertNull(session.currentAccess())
            // The record is still there, untouched and unreadable without a session.
            assertEquals(1, database.secrets().ids().size)
        } finally {
            database.close()
        }
    }

    @Test
    fun generatorOutputIsStorableAndScoresStrong() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, KnouxDatabase::class.java).build()
        try {
            val session = SessionManager(SoftwareKeySource())
            val keys = VaultKeyManager(session, MemoryRegistry())
            val repository = SecretRepository(database.secrets(), session, keys)
            val gate = Cipher.getInstance("AES/GCM/NoPadding")
                .apply { init(Cipher.ENCRYPT_MODE, SecretKeySpec(ByteArray(32) { 7 }, "AES")) }
            session.authorizeEnrollment(GateCipher(GatePurpose.ENROLL, gate))
            val access = session.currentAccess() ?: error("the vault did not open")

            val generated = com.knoux.crypt.security.PasswordGenerator.generate(
                com.knoux.crypt.security.PasswordGenerator.Options(length = 20),
                SecureRandom(),
            )
            assertEquals(20, generated.length)
            val metric = com.knoux.crypt.security.PasswordStrength.evaluate(generated)
            assertTrue(
                "generated value scored ${metric.level} at ${metric.effectiveEntropyBits} bits",
                metric.level.ordinal >= StrengthLevel.STRONG.ordinal,
            )
            repository.save(
                access,
                SecretKinds.PASSWORD,
                "gen",
                SecretsJson.encodePassword(PasswordPayload("Generated", "me", generated)),
            )
            val back = SecretsJson.decodePassword(repository.find(access, "gen")?.payloadJson ?: "")
            assertEquals(generated, back?.password)
        } finally {
            database.close()
        }
    }
}
