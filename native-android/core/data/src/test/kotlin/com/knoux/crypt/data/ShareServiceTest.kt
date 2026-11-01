package com.knoux.crypt.data

import com.knoux.crypt.security.KeyFingerprint
import com.knoux.crypt.security.RecipientKey
import com.knoux.crypt.security.ShareKeyPair
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.KeyPairGenerator
import java.security.SecureRandom
import java.security.spec.ECGenParameterSpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Secure Share service behaviour (TASK 16) against an in-memory vault.
 *
 * These tests pin the *service* rules — verification before sealing, honest
 * rejection of signing keys, receipts without plaintext, and lock behaviour.
 * The container itself is covered in core:security; the Keystore-backed vault key
 * is covered by the instrumented ShareRoomTest on the handset.
 */
class ShareServiceTest {

    private fun fixture() = Fixture()

    private fun recipientKeyPair(): ShareKeyPair = ShareKeyPair.generate(SecureRandom())

    @Test
    fun identityIsCreatedOnceStoredEncryptedAndNeverInClearText() = runBlocking {
        val f = fixture()
        f.enroll()
        val access = f.access()!!
        val service = f.service

        val first = service.identity(access)
        val again = service.identity(access)
        assertEquals(first.fingerprint, again.fingerprint)
        assertEquals(ShareService.ORIGIN_VAULT_SOFTWARE, first.origin)
        assertEquals(1, f.dao.rows.value.count { it.kind == SecretKinds.SHARE_IDENTITY })

        val stored = f.dao.rows.value.first { it.id == ShareService.IDENTITY_RECORD_ID }
        val raw = String(stored.envelope, Charsets.ISO_8859_1)
        assertFalse(raw.contains(first.privatePkcs8Base64))
        assertFalse(raw.contains("PRIVATE KEY"))
        // The record round-trips to the same key material.
        val pair = ShareKeyPair.fromPkcs8Base64(first.privatePkcs8Base64)
        assertEquals(first.fingerprint, pair.fingerprint)
        assertEquals(first.spkiBase64, pair.public.spkiBase64)
    }

    @Test
    fun signingKeysAreRefusedAsRecipients() = runBlocking {
        val f = fixture()
        f.enroll()
        val access = f.access()!!
        val service = f.service

        val ec = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }
        val signingSpki = Base64.getEncoder().encodeToString(ec.generateKeyPair().public.encoded)
        val rejected = service.addRecipient(access, "Mistaken key", signingSpki)
        assertTrue(rejected is AddRecipientOutcome.Rejected)
        assertEquals(ShareFailure.BAD_RECIPIENT_KEY, (rejected as AddRecipientOutcome.Rejected).failure)
        assertTrue(rejected.detail.contains("X25519"))

        // A TASK 28 signing-key URI is refused for the same reason.
        val signingUri = KeyFingerprint.uriFor("KNOUX signing key", signingSpki)
        assertTrue(service.addRecipient(access, "From QR", signingUri) is AddRecipientOutcome.Rejected)
        assertTrue(f.dao.rows.value.none { it.kind == SecretKinds.SHARE_RECIPIENT })
    }

    @Test
    fun recipientIsAddedFromItsUriAndDuplicatesAreDetected() = runBlocking {
        val f = fixture()
        f.enroll()
        val access = f.access()!!
        val service = f.service
        val pair = recipientKeyPair()

        val added = service.addRecipient(access, "", pair.public.uriFor("Rana's phone"))
        assertTrue(added is AddRecipientOutcome.Added)
        added as AddRecipientOutcome.Added
        assertEquals("Rana's phone", added.label)
        assertEquals(pair.fingerprint, added.fingerprint)

        val duplicate = service.addRecipient(access, "Again", pair.public.spkiBase64)
        assertTrue(duplicate is AddRecipientOutcome.Duplicate)
        assertEquals(added.id, (duplicate as AddRecipientOutcome.Duplicate).existingId)
        assertEquals(1, f.dao.rows.value.count { it.kind == SecretKinds.SHARE_RECIPIENT })
    }

    @Test
    fun sealingIsImpossibleUntilTheFingerprintIsConfirmed() = runBlocking {
        val f = fixture()
        f.enroll()
        val access = f.access()!!
        val service = f.service
        val pair = recipientKeyPair()
        val id = (service.addRecipient(access, "Rana", pair.public.spkiBase64) as AddRecipientOutcome.Added).id

        // A wrong fingerprint cannot be attached as a confirmation.
        assertFalse(service.confirmRecipient(access, id, "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"))
        val unverified = service.observeRecipients(access).first().first { it.id == id }
        assertFalse(unverified.verified)

        val plaintext = "sealed only after confirmation".toByteArray()
        val blocked = service.seal(
            access = access,
            input = ByteArrayInputStream(plaintext),
            output = ByteArrayOutputStream(),
            recipientIds = listOf(id),
            fileName = "plan.txt",
            mimeType = "text/plain",
            note = "",
            senderLabel = "KNOUX",
            plaintextLength = plaintext.size.toLong(),
            expiresAt = null,
        )
        assertTrue(blocked is SealOutcome.Rejected)
        assertEquals(ShareFailure.UNVERIFIED_RECIPIENTS, (blocked as SealOutcome.Rejected).failure)
        assertEquals("Rana", blocked.detail)

        assertTrue(service.confirmRecipient(access, id, pair.fingerprint.lowercase()))
        val sealed = service.seal(
            access = access,
            input = ByteArrayInputStream(plaintext),
            output = ByteArrayOutputStream(),
            recipientIds = listOf(id),
            fileName = "plan.txt",
            mimeType = "text/plain",
            note = "",
            senderLabel = "KNOUX",
            plaintextLength = plaintext.size.toLong(),
            expiresAt = null,
        )
        assertTrue(sealed is SealOutcome.Sealed)
        // recipient + sender copy
        assertEquals(2, (sealed as SealOutcome.Sealed).recipientCount)
    }

    @Test
    fun theRecipientOpensExactlyWhatWasSealed() = runBlocking {
        val sender = fixture().also { it.enroll() }
        val receiver = fixture().also { it.enroll() }
        val senderAccess = sender.access()!!
        val receiverAccess = receiver.access()!!

        // The recipient is the other device's real sharing identity.
        val receiverKey = RecipientKey.fromBase64(receiver.service.identity(receiverAccess).spkiBase64)
        val id = (sender.service.addRecipient(senderAccess, "Receiver device", receiverKey.spkiBase64)
            as AddRecipientOutcome.Added).id
        sender.service.confirmRecipient(senderAccess, id, receiverKey.fingerprint)

        val plaintext = ByteArray(5000) { (it % 199).toByte() }
        val packageBytes = ByteArrayOutputStream()
        val sealed = sender.service.seal(
            access = senderAccess,
            input = ByteArrayInputStream(plaintext),
            output = packageBytes,
            recipientIds = listOf(id),
            fileName = "field notes.md",
            mimeType = "text/markdown",
            note = "for the meeting",
            senderLabel = "Studio",
            plaintextLength = plaintext.size.toLong(),
            expiresAt = null,
        )
        assertTrue(sealed is SealOutcome.Sealed)
        sealed as SealOutcome.Sealed
        assertEquals(packageBytes.size().toLong(), sealed.packageBytes)
        assertEquals(64, sealed.digestHex.length)

        val recovered = ByteArrayOutputStream()
        val opened = receiver.service.open(receiverAccess, ByteArrayInputStream(packageBytes.toByteArray()), recovered)
        assertTrue("expected Opened, got $opened", opened is ReceiveOutcome.Opened)
        opened as ReceiveOutcome.Opened
        assertArrayEqualsFast(plaintext, recovered.toByteArray())
        assertEquals("field notes.md", opened.fileName)
        assertEquals("for the meeting", opened.note)
        assertEquals("Studio", opened.senderLabel)
        assertEquals(sender.service.identity(senderAccess).fingerprint, opened.senderFingerprint)
        assertEquals(plaintext.size.toLong(), opened.bytes)
    }

    @Test
    fun wrongDeviceTamperingAndExpiryAllRefuseToProducePlaintext() = runBlocking {
        val sender = fixture().also { it.enroll() }
        val other = fixture().also { it.enroll() }
        val access = sender.access()!!
        val otherAccess = other.access()!!
        val identity = sender.service.identity(access)
        val key = RecipientKey.fromBase64(identity.spkiBase64)
        val id = (sender.service.addRecipient(access, "Self", key.spkiBase64) as AddRecipientOutcome.Added).id
        sender.service.confirmRecipient(access, id, key.fingerprint)

        val plaintext = "handle with care".toByteArray()
        val bytes = ByteArrayOutputStream()
        val sealed = sender.service.seal(
            access, ByteArrayInputStream(plaintext), bytes, listOf(id), "note.txt", "text/plain", "", "Me",
            plaintext.size.toLong(), System.currentTimeMillis() + 60_000,
        )
        assertTrue("expected Sealed, got $sealed", sealed is SealOutcome.Sealed)

        // A different device cannot open it.
        val mismatchOut = ByteArrayOutputStream()
        val mismatch = other.service.open(otherAccess, ByteArrayInputStream(bytes.toByteArray()), mismatchOut)
        assertTrue(mismatch is ReceiveOutcome.RecipientMismatch)
        assertEquals(0, mismatchOut.size())

        // Tampering with the payload is caught.
        val tampered = bytes.toByteArray().copyOf()
        tampered[tampered.size - 1] = (tampered[tampered.size - 1].toInt() xor 0x01).toByte()
        val tamperedOut = ByteArrayOutputStream()
        val tamperedResult = sender.service.open(access, ByteArrayInputStream(tampered), tamperedOut)
        assertTrue("expected Tampered, got $tamperedResult", tamperedResult is ReceiveOutcome.Tampered)
        assertEquals(0, tamperedOut.size())

        // An expired package reports itself and decrypts nothing.
        val notYet = System.currentTimeMillis()
        val expiredBytes = ByteArrayOutputStream()
        val shortLived = sender.service.seal(
            access, ByteArrayInputStream(plaintext), expiredBytes, listOf(id), "note.txt", "text/plain", "", "Me",
            plaintext.size.toLong(), notYet + 50,
        )
        assertTrue("expected Sealed, got $shortLived", shortLived is SealOutcome.Sealed)
        val expiredOut = ByteArrayOutputStream()
        val expired = sender.service.open(
            access,
            ByteArrayInputStream(expiredBytes.toByteArray()),
            expiredOut,
            nowMillis = notYet + 10_000,
        )
        assertTrue("expected Expired, got $expired", expired is ReceiveOutcome.Expired)
        assertEquals(0, expiredOut.size())
        assertEquals("note.txt", (expired as ReceiveOutcome.Expired).fileName)

        // Sealing to a deadline that has already passed is refused up front.
        val refused = sender.service.seal(
            access, ByteArrayInputStream(plaintext), ByteArrayOutputStream(), listOf(id), "note.txt",
            "text/plain", "", "Me", plaintext.size.toLong(), System.currentTimeMillis() - 1_000,
        )
        assertTrue(refused is SealOutcome.Rejected)
    }

    @Test
    fun receiptsRecordDeliveryTruthfullyAndLeakNothing() = runBlocking {
        val f = fixture()
        f.enroll()
        val access = f.access()!!
        val service = f.service
        val pair = recipientKeyPair()
        val id = (service.addRecipient(access, "Rana", pair.public.spkiBase64) as AddRecipientOutcome.Added).id
        service.confirmRecipient(access, id, pair.fingerprint)

        val plaintext = "quarterly figures".toByteArray()
        val bytes = ByteArrayOutputStream()
        val sealed = service.seal(
            access, ByteArrayInputStream(plaintext), bytes, listOf(id), "figures.csv", "text/csv", "", "Me",
            plaintext.size.toLong(), null,
        ) as SealOutcome.Sealed

        var receipts = service.observeReceipts(access).first()
        assertEquals(1, receipts.size)
        assertEquals(ShareService.DIRECTION_OUTGOING, receipts.first().direction)
        assertEquals("not-delivered", receipts.first().delivery)
        assertEquals(1, receipts.first().recipients.size)
        assertTrue(receipts.first().recipients.first().verified)

        service.markDelivery(access, sealed.receiptId, "sharesheet")
        receipts = service.observeReceipts(access).first()
        assertEquals("sharesheet", receipts.first().delivery)
        assertEquals(sealed.packageIdHex, receipts.first().packageIdHex)

        // No receipt row carries plaintext or the content key.
        f.dao.rows.value.filter { it.kind == SecretKinds.SHARE_RECEIPT }.forEach { row ->
            val raw = String(row.envelope, Charsets.ISO_8859_1)
            assertFalse(raw.contains("quarterly figures"))
            assertFalse(raw.contains("figures.csv"))
        }
    }

    @Test
    fun aLockedSessionCannotSealAndTheIdentitySurvivesInVault() = runBlocking {
        val f = fixture()
        f.enroll()
        val access = f.access()!!
        val service = f.service
        val fingerprint = service.identity(access).fingerprint

        f.session.lock()
        assertNull(f.access())
        val failure = runCatching {
            service.seal(
                access,
                ByteArrayInputStream("x".toByteArray()),
                ByteArrayOutputStream(),
                listOf("nobody"),
                "x", "text/plain", "", "Me", 1L, null,
            )
        }.exceptionOrNull()
        assertTrue("expected VaultLockedException, got $failure", failure is VaultLockedException)
        assertTrue(runCatching { service.identity(access) }.exceptionOrNull() is VaultLockedException)

        // The identity is still there, encrypted, waiting for the next session.
        val row = f.dao.rows.value.first { it.id == ShareService.IDENTITY_RECORD_ID }
        assertEquals(SecretKinds.SHARE_IDENTITY, row.kind)
        assertFalse(String(row.envelope, Charsets.ISO_8859_1).contains(fingerprint))
    }

    private fun assertArrayEqualsFast(expected: ByteArray, actual: ByteArray) {
        assertEquals(expected.size, actual.size)
        assertEquals(
            expected.joinToString("") { (it.toInt() and 0xff).toString(16) },
            actual.joinToString("") { (it.toInt() and 0xff).toString(16) },
        )
    }

    // --- in-memory vault harness -------------------------------------------

    private class FakeVaultKeys : VaultKeySource {
        private var master: SecretKey? = null
        override fun hasMasterKey(): Boolean = master != null
        override fun masterKey(): SecretKey = master
            ?: SecretKeySpec(ByteArray(32) { (it * 7 + 11).toByte() }, "AES").also { master = it }
        override fun masterKeySecurityLevel(): String? = "FAKE_SOFTWARE"
    }

    private class FakeGateStore(private val vault: FakeVaultKeys) : GateKeyStore {
        private val keys = mutableMapOf<GateSlot, SecretKey>()
        private val random = SecureRandom()
        override fun hasMasterKey(): Boolean = vault.hasMasterKey()
        override fun hasGate(slot: GateSlot): Boolean = keys.containsKey(slot)
        override fun createGateIfNeeded(slot: GateSlot) {
            keys.getOrPut(slot) { SecretKeySpec(ByteArray(32).also(random::nextBytes), "AES") }
        }
        override fun deleteGate(slot: GateSlot) { keys.remove(slot) }
        override fun newEncryptGate(slot: GateSlot): GateCipher {
            val key = keys[slot] ?: throw IllegalStateException("missing gate key")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key) }
            return GateCipher(GatePurpose.ENROLL, cipher)
        }
        override fun newDecryptGate(slot: GateSlot, iv: ByteArray): GateCipher {
            val key = keys[slot] ?: throw IllegalStateException("missing gate key")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
            }
            return GateCipher(GatePurpose.UNLOCK, cipher)
        }
        override fun isInvalidated(failure: Throwable): Boolean = false
    }

    private class FakeTokenStore : GateTokenStore {
        private val blobs = mutableMapOf<GateSlot, ByteArray>()
        private var active = GateSlot.PRIMARY
        private var recovery: String? = null
        override suspend fun activeSlot(): GateSlot = active
        override suspend fun setActiveSlot(slot: GateSlot) { active = slot }
        override suspend fun blob(slot: GateSlot): ByteArray? = blobs[slot]?.copyOf()
        override suspend fun writeBlob(slot: GateSlot, blob: ByteArray) { blobs[slot] = blob.copyOf() }
        override suspend fun clearBlob(slot: GateSlot) { blobs.remove(slot) }
        override suspend fun recoveryReason(): String? = recovery
        override suspend fun setRecoveryReason(reason: String?) { recovery = reason }
    }

    private class FakeDao : SecretDao {
        val rows = MutableStateFlow<List<SecretEntity>>(emptyList())
        override fun observe(kind: String): Flow<List<SecretEntity>> = flow { emit(rows.value.filter { it.kind == kind }) }
        override suspend fun find(id: String): SecretEntity? = rows.value.firstOrNull { it.id == id }
        override suspend fun upsert(entity: SecretEntity) {
            rows.value = rows.value.filterNot { it.id == entity.id } + entity
        }
        override suspend fun upsertAll(entities: List<SecretEntity>) {
            var staged = rows.value
            entities.forEach { entity -> staged = staged.filterNot { it.id == entity.id } + entity }
            rows.value = staged
        }
        override suspend fun delete(id: String) { rows.value = rows.value.filterNot { it.id == id } }
        override fun count(kind: String): Flow<Int> = flow { emit(rows.value.count { it.kind == kind }) }
        override suspend fun all(): List<SecretEntity> = rows.value.sortedBy { it.updatedAt }
        override suspend fun ids(): List<String> = rows.value.map { it.id }
        override suspend fun insertAll(entities: List<SecretEntity>) {
            val existing = rows.value.map { it.id }.toSet()
            if (entities.any { it.id in existing }) throw IllegalStateException("UNIQUE constraint failed")
            rows.value = rows.value + entities
        }
        override suspend fun pageByVersionAfter(version: Int, after: String, limit: Int): List<SecretEntity> =
            rows.value.filter { it.keyVersion == version && it.id > after }.sortedBy { it.id }.take(limit)
        override suspend fun countVersion(version: Int): Int = rows.value.count { it.keyVersion == version }
        override suspend fun updateEnvelope(id: String, envelope: ByteArray, keyVersion: Int) {
            rows.value = rows.value.map { if (it.id == id) it.copy(envelope = envelope, keyVersion = keyVersion) else it }
        }
        override suspend fun versionCounts(): List<VersionCount> =
            rows.value.groupingBy { it.keyVersion }.eachCount().map { VersionCount(it.key, it.value) }
    }

    private class MemoryRegistry : VaultKeyRegistry {
        private var active = 0
        override suspend fun activeVersion(): Int = active
        override suspend fun setActiveVersion(version: Int) { active = version }
        override suspend fun wrappedKey(version: Int): ByteArray? = null
        override suspend fun storeWrappedKey(version: Int, blob: ByteArray) = Unit
        override suspend fun removeWrappedKey(version: Int) = Unit
        override suspend fun versions(): List<Int> = listOf(active)
        override suspend fun rotationJournal(): RotationJournal? = null
        override suspend fun setRotationJournal(journal: RotationJournal?) = Unit
    }

    private class Fixture {
        val vault = FakeVaultKeys()
        val tokens = FakeTokenStore()
        val session = SessionManager(vault)
        val manager = UnlockManager(FakeGateStore(vault), tokens, session)
        val dao = FakeDao()
        val repository = SecretRepository(dao, session, VaultKeyManager(session, MemoryRegistry()))
        val service = ShareService(session, repository)

        fun access(): VaultAccess? = session.currentAccess()

        suspend fun enroll() {
            manager.completeSetup(manager.prepareSetupCipher())
        }
    }
}
