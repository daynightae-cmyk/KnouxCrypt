package com.knoux.crypt.data

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Source-level authorization-boundary tests. These run on the JVM with plain
 * AES keys standing in for the Android Keystore. They prove the domain rules;
 * they cannot prove Android Keystore or BiometricPrompt behavior on a device.
 */
class SecurityBoundaryTest {

    @Test
    fun freshEnrollmentOnlyMintsAfterThePreparedCipherIsUsed() = runBlocking {
        val fixture = Fixture()
        val cipher = fixture.manager.prepareSetupCipher()
        val foreign = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.ENCRYPT_MODE, SecretKeySpec(ByteArray(32) { 9 }, "AES"))
        }

        expect<UnlockRejectedException> { fixture.manager.completeSetup(foreign) }
        assertFalse(fixture.session.isUnlocked)
        assertTrue(fixture.tokens.blobs.isEmpty())

        fixture.manager.completeSetup(cipher)
        assertTrue(fixture.session.isUnlocked)
        assertNotNull(fixture.tokens.blobs[GateSlot.PRIMARY])
        assertTrue(fixture.manager.isConfigured())
    }

    @Test
    fun setupIsBlockedOnceAMasterKeyExists() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        fixture.vault.masterKey() // a vault has been provisioned and may hold ciphertext
        fixture.session.lock()

        expect<UnlockReenrollmentBlockedException> { fixture.manager.prepareSetupCipher() }
        assertFalse(fixture.session.isUnlocked)
    }

    @Test
    fun setupIsBlockedEvenWhenTheGateTokenWasLostButTheVaultRemains() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        fixture.vault.masterKey()
        fixture.session.lock()
        fixture.tokens.blobs.clear()
        fixture.gates.keys.clear()

        assertFalse(fixture.manager.isConfigured())
        assertTrue(fixture.manager.hasExistingVault())
        expect<UnlockReenrollmentBlockedException> { fixture.manager.prepareSetupCipher() }
    }

    @Test
    fun lockedGuestCannotStartOrCompleteGateRotation() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val originalBlob = fixture.tokens.blobs[GateSlot.PRIMARY]!!.copyOf()
        fixture.session.lock()
        val active = fixture.tokens.active

        expect<UnlockNotAuthorizedException> { fixture.manager.prepareGateRotationCipher() }
        val foreign = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.ENCRYPT_MODE, SecretKeySpec(ByteArray(32) { 3 }, "AES"))
        }
        expect<UnlockNotAuthorizedException> { fixture.manager.completeGateRotation(foreign) }
        assertTrue(fixture.tokens.blobs[active]!!.contentEquals(originalBlob))
        assertTrue(fixture.gates.keys.containsKey(active))
    }

    @Test
    fun deepEnrollmentCannotOpenAVaultThatAlreadyHasAMasterKey() = runBlocking {
        val fixture = Fixture()
        fixture.vault.masterKey()
        fixture.gates.createGateIfNeeded(GateSlot.PRIMARY)
        val gate = fixture.gates.newEncryptGate(GateSlot.PRIMARY)

        expect<UnlockReenrollmentBlockedException> { fixture.session.authorizeEnrollment(gate) }
        assertFalse(fixture.session.isUnlocked)
    }

    @Test
    fun capabilitiesFollowTheSessionGeneration() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repository = fixture.repository()
        repository.save(fixture.access()!!, SecretKinds.NOTE, null, """{"title":"a","body":"b"}""")
        val firstCapability = fixture.access()!!

        fixture.session.lock()
        expect<VaultLockedException> { repository.find(firstCapability, "missing") }
        expect<VaultLockedException> { fixture.session.key(firstCapability) }

        fixture.unlock()
        val secondCapability = fixture.access()
        assertNotNull(secondCapability)
        assertFalse(fixture.session.isValid(firstCapability))
        assertTrue(fixture.session.isValid(secondCapability!!))
        expect<VaultLockedException> { repository.save(firstCapability, SecretKinds.NOTE, null, "{}") }
    }

    @Test
    fun lockedFlowIsRejectedBeforeCollection() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repository = fixture.repository()
        val access = fixture.access()!!
        repository.save(access, SecretKinds.NOTE, null, """{"title":"x","body":"y"}""")
        fixture.session.lock()

        expect<VaultLockedException> { repository.observe(access, SecretKinds.NOTE).first() }
        expect<VaultLockedException> { repository.count(access, SecretKinds.NOTE).first() }
    }

    @Test
    fun flowEmissionAfterRevocationFailsInsteadOfDeliveringPlaintext() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repository = fixture.repository()
        val access = fixture.access()!!
        repository.save(access, SecretKinds.NOTE, null, """{"title":"secret","body":"plaintext"}""")
        fixture.dao.observeHook = { runBlocking { fixture.session.lock() } }

        expect<VaultLockedException> {
            repository.observe(access, SecretKinds.NOTE).toList()
        }

        fixture.unlock()
        val fresh = fixture.access()!!
        fixture.dao.countHook = { runBlocking { fixture.session.lock() } }
        expect<VaultLockedException> {
            repository.count(fresh, SecretKinds.NOTE).toList()
        }
    }

    @Test
    fun inFlightReadCannotReturnPlaintextAfterLock() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repository = fixture.repository()
        val access = fixture.access()!!
        val id = repository.save(access, SecretKinds.NOTE, null, """{"title":"t","body":"s"}""")
        fixture.dao.blockFind = true

        val pending = async { runCatching { repository.find(access, id) } }
        fixture.dao.findEntered.await()
        fixture.session.lock()
        fixture.dao.findRelease.complete(Unit)

        val outcome = pending.await()
        assertTrue(outcome.exceptionOrNull() is VaultLockedException)
    }

    @Test
    fun setupIsRecheckedAfterPreparationIfAVaultAppearsConcurrently() = runBlocking {
        val fixture = Fixture()
        val cipher = fixture.manager.prepareSetupCipher()
        fixture.vault.masterKey() // another authorized path provisions the vault

        expect<UnlockReenrollmentBlockedException> { fixture.manager.completeSetup(cipher) }
        assertFalse(fixture.session.isUnlocked)
        assertTrue(fixture.tokens.blobs.isEmpty())
    }

    @Test
    fun cancelledAuthenticationNeverMintsAccess() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        fixture.session.lock()
        fixture.manager.prepareUnlockCipher() // prompt shown, then cancelled: cipher simply unused
        assertFalse(fixture.session.isUnlocked)
        assertNull(fixture.access())
        fixture.unlock()
        assertTrue(fixture.session.isUnlocked)
    }

    @Test
    fun inFlightFileEncryptionAbortsAfterLock() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        val cipher = VaultFileCipher(fixture.session)
        val plaintext = ByteArray(3 * 64 * 1024) { (it % 251).toByte() }
        val sealed = ByteArrayOutputStream()

        expect<VaultLockedException> {
            cipher.encrypt(
                access,
                ByteArrayInputStream(plaintext),
                sealed,
                plaintext.size.toLong(),
            ) { progress ->
                if (progress.processedBytes > 0) runBlocking { fixture.session.lock() }
            }
        }
        assertFalse(fixture.session.isUnlocked)

        // Unlocking again allows a fresh, complete operation.
        fixture.unlock()
        val second = ByteArrayOutputStream()
        cipher.encrypt(fixture.access()!!, ByteArrayInputStream(plaintext), second, plaintext.size.toLong())
        val restored = ByteArrayOutputStream()
        cipher.decrypt(
            fixture.access()!!,
            ByteArrayInputStream(second.toByteArray()),
            restored,
        )
        assertTrue(restored.toByteArray().contentEquals(plaintext))
    }

    @Test
    fun inFlightFileDecryptionAbortsAfterLock() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        val cipher = VaultFileCipher(fixture.session)
        val plaintext = ByteArray(3 * 64 * 1024) { (it % 251).toByte() }
        val sealed = ByteArrayOutputStream()
        cipher.encrypt(access, ByteArrayInputStream(plaintext), sealed, plaintext.size.toLong())

        expect<VaultLockedException> {
            cipher.decrypt(
                access,
                ByteArrayInputStream(sealed.toByteArray()),
                ByteArrayOutputStream(),
            ) { progress ->
                if (progress.processedBytes > 0) runBlocking { fixture.session.lock() }
            }
        }
        assertFalse(fixture.session.isUnlocked)
    }

    @Test
    fun invalidatedBiometricGateIsNonDestructiveAndReportsRecovery() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repository = fixture.repository()
        val access = fixture.access()!!
        val id = repository.save(access, SecretKinds.NOTE, null, """{"title":"keep","body":"me"}""")
        val tokenBefore = fixture.tokens.blobs.toMap()
        val masterBefore = fixture.vault.masterKey().encoded!!.copyOf()
        fixture.session.lock()

        fixture.gates.invalidateDecrypt = true
        expect<UnlockKeyInvalidatedException> { fixture.manager.prepareUnlockCipher() }
        assertFalse(fixture.session.isUnlocked)
        assertEquals(
            UnlockManager.RECOVERY_BIOMETRIC_INVALIDATED,
            fixture.manager.recoveryReason(),
        )
        tokenBefore.forEach { (slot, blob) ->
            assertTrue(fixture.tokens.blobs[slot]!!.contentEquals(blob))
        }
        assertTrue(fixture.vault.masterKey().encoded!!.contentEquals(masterBefore))
        assertTrue(fixture.gates.hasGate(GateSlot.PRIMARY))

        fixture.gates.invalidateDecrypt = false
        fixture.unlock()
        val record = repository.find(fixture.access()!!, id)
        assertNotNull(record)
        assertTrue(record!!.payloadJson.contains("keep"))
        assertNull(fixture.manager.recoveryReason())
    }

    @Test
    fun corruptAndWrongTokensAreRejectedWithoutOpeningTheVault() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val slot = fixture.tokens.active
        fixture.tokens.blobs[slot] = ByteArray(UnlockProtocol.MIN_BLOB) { 0x41 }
        fixture.session.lock()

        val cipher = fixture.manager.prepareUnlockCipher()
        expect<UnlockRejectedException> { fixture.manager.completeUnlock(cipher) }
        assertFalse(fixture.session.isUnlocked)

        fixture.tokens.blobs[slot] = fixture.gates.encryptWithSlot(slot, "WRONG-TOKEN-VALUE".toByteArray())
        val second = fixture.manager.prepareUnlockCipher()
        expect<UnlockRejectedException> { fixture.manager.completeUnlock(second) }
        assertFalse(fixture.session.isUnlocked)
    }

    @Test
    fun failedUnlockAndSubstitutedCipherStayLockedAndRemainRetryable() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        fixture.session.lock()

        val first = fixture.manager.prepareUnlockCipher()
        val second = fixture.manager.prepareUnlockCipher()
        // The first cipher is stale after a second prepare; it must not unlock.
        expect<UnlockRejectedException> { fixture.manager.completeUnlock(first) }
        assertFalse(fixture.session.isUnlocked)

        fixture.manager.completeUnlock(second)
        assertTrue(fixture.session.isUnlocked)
    }

    @Test
    fun gateRotationIsAtomicPreservesDataAndOldGateUntilVerified() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repository = fixture.repository()
        val access = fixture.access()!!
        val id = repository.save(access, SecretKinds.NOTE, null, """{"title":"stable","body":"ciphertext"}""")
        val master = fixture.vault.masterKey()
        val ciphertextBefore = fixture.dao.rows.value.single().envelope.copyOf()
        val primaryBlobBefore = fixture.tokens.blobs[GateSlot.PRIMARY]!!.copyOf()

        val rotation = fixture.manager.prepareGateRotationCipher()
        // Not committed yet: the old gate is still authoritative and the token untouched.
        assertTrue(fixture.tokens.blobs[GateSlot.PRIMARY]!!.contentEquals(primaryBlobBefore))
        assertTrue(fixture.manager.isConfigured())

        fixture.manager.completeGateRotation(rotation)
        assertTrue(fixture.session.isUnlocked)
        assertEquals(GateSlot.ALTERNATE, fixture.tokens.active)
        assertNull(fixture.tokens.blobs[GateSlot.PRIMARY])
        assertFalse(fixture.gates.hasGate(GateSlot.PRIMARY))
        assertSame(master, fixture.vault.masterKey())
        assertTrue(fixture.dao.rows.value.single().envelope.contentEquals(ciphertextBefore))
        assertEquals("stable", SecretsJson.decodeNote(repository.find(fixture.access()!!, id)!!.payloadJson)?.title)

        fixture.session.lock()
        // Only the rotated gate can open the vault; the old key material was
        // removed after the new token became authoritative.
        fixture.unlock()
        assertTrue(fixture.session.isUnlocked)
        assertFalse(fixture.gates.hasGate(GateSlot.PRIMARY))
    }

    @Test
    fun cancelledRotationLeavesTheOldGateUsable() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val oldBlob = fixture.tokens.blobs[GateSlot.PRIMARY]!!.copyOf()
        fixture.manager.prepareGateRotationCipher() // user cancels the biometric prompt
        fixture.session.lock()

        assertTrue(fixture.tokens.blobs[GateSlot.PRIMARY]!!.contentEquals(oldBlob))
        fixture.unlock()
        assertTrue(fixture.session.isUnlocked)
    }

    @Test
    fun rotationRequiresAConfiguredGateAndAnUnlockedSession() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        fixture.gates.keys.clear()
        fixture.tokens.blobs.clear()
        expect<UnlockNotConfiguredException> { fixture.manager.prepareGateRotationCipher() }
        fixture.session.lock()
        expect<UnlockNotAuthorizedException> { fixture.manager.prepareGateRotationCipher() }
    }

    @Test
    fun cipherPurposeCannotBeConfusedToMintAccess() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        fixture.session.lock()
        val enrollGate = fixture.gates.newEncryptGate(GateSlot.PRIMARY)
        expect<IllegalArgumentException> {
            fixture.session.authorizeUnlock(enrollGate, UnlockProtocol.TOKEN)
        }
        assertFalse(fixture.session.isUnlocked)

        val unlockGate = fixture.gates.newDecryptGate(
            GateSlot.PRIMARY,
            UnlockProtocol.ivOf(fixture.tokens.blobs[GateSlot.PRIMARY]!!),
        )
        expect<IllegalArgumentException> { fixture.session.authorizeEnrollment(unlockGate) }
        assertFalse(fixture.session.isUnlocked)
    }

    @Test
    fun previousCiphertextAndAliasesRemainCompatible() = runBlocking {
        assertEquals("knoux.master.v2", VaultKeyAliases.MASTER)
        assertEquals("knoux.unlock.v2", VaultKeyAliases.GATE_PRIMARY)
        assertEquals("knoux.unlock.v2.b", VaultKeyAliases.GATE_ALTERNATE)
        assertEquals(UnlockProtocol.IV_BYTES + UnlockProtocol.TOKEN.size + UnlockProtocol.TAG_BYTES, UnlockProtocol.MIN_BLOB)

        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        val legacyKey = fixture.vault.masterKey()
        // A record written by the shipped codec must remain readable after the
        // boundary changes; the format, AAD and aliases were not touched.
        val legacyEnvelope = SecretCodec(legacyKey).encrypt(
            SecretKinds.NOTE,
            "legacy-id",
            """{"title":"legacy","body":"before-hardening"}""",
        )
        fixture.dao.rows.value = listOf(SecretEntity("legacy-id", SecretKinds.NOTE, legacyEnvelope, 1L))
        fixture.session.lock()
        fixture.unlock()

        val record = fixture.repository().find(fixture.access()!!, "legacy-id")
        assertNotNull(record)
        assertFalse(record!!.decryptionFailed)
        assertEquals("legacy", SecretsJson.decodeNote(record.payloadJson)?.title)
    }

    @Test
    fun collectionCiphertextIsNeverAcceptedUnderAnotherIdentity() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repository = fixture.repository()
        val access = fixture.access()!!
        val id = repository.save(access, SecretKinds.NOTE, null, """{"title":"a","body":"b"}""")
        val row = fixture.dao.rows.value.single()
        fixture.dao.rows.value = listOf(row.copy(id = "$id-other"))

        val record = repository.find(access, "$id-other")
        assertNotNull(record)
        assertTrue(record!!.decryptionFailed)
        assertTrue(record.payloadJson.isEmpty())
    }

    @Test
    fun rotationReauthRequiresThePreparedGateCipherAndAnUnlockedSession() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val access = fixture.access()!!
        val cipher = fixture.manager.prepareRotationReauthCipher()
        val authorization = fixture.manager.completeRotationReauth(cipher)
        assertSame(access, fixture.session.currentAccess())
        assertTrue(fixture.session.isUnlocked)

        val foreign = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.ENCRYPT_MODE, SecretKeySpec(ByteArray(32) { 4 }, "AES"))
        }
        expect<UnlockRejectedException> { fixture.manager.completeRotationReauth(foreign) }

        fixture.session.lock()
        expect<UnlockNotAuthorizedException> { fixture.manager.prepareRotationReauthCipher() }
        assertFalse(fixture.session.isUnlocked)
        assertTrue(authorization.issuedAt > 0)
    }

    @Test
    fun revocationWaitsForAnAuthorizedWriteAndNeverLetsLaterWritesCommit() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repository = fixture.repository()
        val access = fixture.access()!!
        fixture.dao.blockUpsert = true

        val save = async {
            repository.save(access, SecretKinds.NOTE, "race", """{"title":"r","body":"b"}""")
        }
        fixture.dao.upsertEntered.await()
        val lock = async { fixture.session.lock() }
        // lock() must wait for the authorized in-flight commit instead of
        // revoking underneath it and leaving a commit-after-revocation window.
        assertNull(withTimeoutOrNull(100) { lock.await() })

        fixture.dao.upsertRelease.complete(Unit)
        assertEquals("race", save.await())
        lock.await()
        assertFalse(fixture.session.isUnlocked)
        assertTrue(fixture.dao.rows.value.any { it.id == "race" })

        expect<VaultLockedException> {
            repository.save(access, SecretKinds.NOTE, "after", """{"title":"a","body":"b"}""")
        }
        assertFalse(fixture.dao.rows.value.any { it.id == "after" })
    }

    @Test
    fun cancelledPendingWriteDoesNotCommitAndLockCompletes() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repository = fixture.repository()
        val access = fixture.access()!!
        fixture.dao.blockUpsert = true

        val save = async {
            repository.save(access, SecretKinds.NOTE, "cancelled", """{"title":"c","body":"b"}""")
        }
        fixture.dao.upsertEntered.await()
        save.cancelAndJoin()
        fixture.dao.upsertRelease.complete(Unit)
        fixture.session.lock()

        assertFalse(fixture.session.isUnlocked)
        assertFalse(fixture.dao.rows.value.any { it.id == "cancelled" })
        expect<VaultLockedException> {
            repository.save(access, SecretKinds.NOTE, "late", """{"title":"l","body":"b"}""")
        }
    }

    @Test
    fun databaseFailureWritesNothingAndLeavesTheSessionRevocable() = runBlocking {
        val fixture = Fixture()
        fixture.enroll()
        val repository = fixture.repository()
        val access = fixture.access()!!
        fixture.dao.failUpsert = IllegalStateException("disk full")

        expect<IllegalStateException> {
            repository.save(access, SecretKinds.NOTE, "failed", """{"title":"f","body":"b"}""")
        }
        assertFalse(fixture.dao.rows.value.any { it.id == "failed" })
        fixture.session.lock()
        assertFalse(fixture.session.isUnlocked)
    }

    // ---------------------------------------------------------------------

    private class FakeVaultKeys : VaultKeySource {
        private var master: SecretKey? = null
        override fun hasMasterKey(): Boolean = master != null
        override fun masterKey(): SecretKey =
            master ?: SecretKeySpec(ByteArray(32) { (it * 7 + 3).toByte() }, "AES").also { master = it }
        override fun masterKeySecurityLevel(): String? = if (master == null) null else "FAKE_SOFTWARE"
    }

    private class FakeInvalidated : Exception("fake biometric invalidation")

    private class FakeGateStore(private val vault: FakeVaultKeys) : GateKeyStore {
        val keys = mutableMapOf<GateSlot, SecretKey>()
        var invalidateDecrypt = false
        var invalidateEncrypt = false
        private val random = SecureRandom()

        override fun hasMasterKey(): Boolean = vault.hasMasterKey()

        override fun hasGate(slot: GateSlot): Boolean = keys.containsKey(slot)

        override fun createGateIfNeeded(slot: GateSlot) {
            keys.getOrPut(slot) {
                SecretKeySpec(ByteArray(32).also(random::nextBytes), "AES")
            }
        }

        override fun deleteGate(slot: GateSlot) {
            keys.remove(slot)
        }

        override fun newEncryptGate(slot: GateSlot): GateCipher {
            if (invalidateEncrypt) throw FakeInvalidated()
            val key = keys[slot] ?: throw IllegalStateException("gate missing")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key) }
            return GateCipher(GatePurpose.ENROLL, cipher)
        }

        override fun newDecryptGate(slot: GateSlot, iv: ByteArray): GateCipher {
            if (invalidateDecrypt) throw FakeInvalidated()
            val key = keys[slot] ?: throw IllegalStateException("gate missing")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
            }
            return GateCipher(GatePurpose.UNLOCK, cipher)
        }

        override fun isInvalidated(failure: Throwable): Boolean = failure is FakeInvalidated

        fun encryptWithSlot(slot: GateSlot, plaintext: ByteArray): ByteArray {
            val key = keys[slot] ?: throw IllegalStateException("gate missing")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key) }
            return cipher.iv + cipher.doFinal(plaintext)
        }
    }

    private class FakeTokenStore : GateTokenStore {
        val blobs = mutableMapOf<GateSlot, ByteArray>()
        var active = GateSlot.PRIMARY
        var recovery: String? = null

        override suspend fun activeSlot(): GateSlot = active
        override suspend fun setActiveSlot(slot: GateSlot) { active = slot }
        override suspend fun blob(slot: GateSlot): ByteArray? = blobs[slot]?.copyOf()
        override suspend fun writeBlob(slot: GateSlot, blob: ByteArray) { blobs[slot] = blob.copyOf() }
        override suspend fun clearBlob(slot: GateSlot) { blobs.remove(slot) }
        override suspend fun recoveryReason(): String? = recovery
        override suspend fun setRecoveryReason(reason: String?) { recovery = reason }
    }

    internal class MemoryKeyRegistry : VaultKeyRegistry {
        var active = 0
        val wrapped = mutableMapOf<Int, ByteArray>()
        var journal: RotationJournal? = null
        override suspend fun activeVersion(): Int = active
        override suspend fun setActiveVersion(version: Int) { active = version }
        override suspend fun wrappedKey(version: Int): ByteArray? = wrapped[version]?.copyOf()
        override suspend fun storeWrappedKey(version: Int, blob: ByteArray) { wrapped[version] = blob.copyOf() }
        override suspend fun removeWrappedKey(version: Int) { wrapped.remove(version) }
        override suspend fun versions(): List<Int> = wrapped.keys.sorted()
        override suspend fun rotationJournal(): RotationJournal? = journal
        override suspend fun setRotationJournal(journal: RotationJournal?) { this.journal = journal }
    }

    private class FakeDao : SecretDao {
        val rows = MutableStateFlow<List<SecretEntity>>(emptyList())
        var observeHook: (() -> Unit)? = null
        var countHook: (() -> Unit)? = null
        var blockFind = false
        val findEntered = CompletableDeferred<Unit>()
        val findRelease = CompletableDeferred<Unit>()
        var lastReturned: SecretEntity? = null
        var blockUpsert = false
        val upsertEntered = CompletableDeferred<Unit>()
        val upsertRelease = CompletableDeferred<Unit>()
        var failUpsert: Exception? = null

        override fun observe(kind: String): Flow<List<SecretEntity>> = flow {
            emit(snapshot(kind))
            observeHook?.invoke()
            emit(snapshot(kind))
        }

        override suspend fun find(id: String): SecretEntity? {
            if (blockFind) {
                findEntered.complete(Unit)
                findRelease.await()
            }
            return rows.value.firstOrNull { it.id == id }.also { lastReturned = it }
        }

        override suspend fun upsertAll(entities: List<SecretEntity>) {
            entities.forEach { entity -> upsert(entity) }
        }

        override suspend fun upsert(entity: SecretEntity) {
            if (blockUpsert) {
                upsertEntered.complete(Unit)
                upsertRelease.await()
            }
            failUpsert?.let { throw it }
            rows.value = rows.value.filterNot { it.id == entity.id } + entity
        }

        override suspend fun delete(id: String) {
            rows.value = rows.value.filterNot { it.id == id }
        }

        override fun count(kind: String): Flow<Int> = flow {
            emit(snapshot(kind).size)
            countHook?.invoke()
            emit(snapshot(kind).size)
        }

        override suspend fun all(): List<SecretEntity> = rows.value.sortedBy { it.updatedAt }

        override suspend fun ids(): List<String> = rows.value.map { it.id }

        override suspend fun insertAll(entities: List<SecretEntity>) {
            val existing = rows.value.map { it.id }.toSet()
            if (entities.any { it.id in existing }) {
                throw IllegalStateException("UNIQUE constraint failed: secrets.id")
            }
            rows.value = rows.value + entities
        }

        override suspend fun pageByVersionAfter(version: Int, after: String, limit: Int): List<SecretEntity> =
            rows.value.filter { it.keyVersion == version && it.id > after }.sortedBy { it.id }.take(limit)

        override suspend fun countVersion(version: Int): Int = rows.value.count { it.keyVersion == version }

        override suspend fun updateEnvelope(id: String, envelope: ByteArray, keyVersion: Int) {
            rows.value = rows.value.map {
                if (it.id == id) it.copy(envelope = envelope, keyVersion = keyVersion) else it
            }
        }

        override suspend fun versionCounts(): List<VersionCount> =
            rows.value.groupingBy { it.keyVersion }.eachCount().map { VersionCount(it.key, it.value) }

        private fun snapshot(kind: String) = rows.value.filter { it.kind == kind }
    }

    private class Fixture {
        val vault = FakeVaultKeys()
        val gates = FakeGateStore(vault)
        val tokens = FakeTokenStore()
        val session = SessionManager(vault)
        val manager = UnlockManager(gates, tokens, session)
        val dao = FakeDao()
        val registry = MemoryKeyRegistry()
        val keys = VaultKeyManager(session, registry)

        fun repository() = SecretRepository(dao, session, keys)

        fun access(): VaultAccess? = session.currentAccess()

        suspend fun enroll() {
            val cipher = manager.prepareSetupCipher()
            manager.completeSetup(cipher)
        }

        suspend fun unlock() {
            val cipher = manager.prepareUnlockCipher()
            manager.completeUnlock(cipher)
        }
    }

    private suspend inline fun <reified T : Throwable> expect(block: suspend () -> Unit) {
        try {
            block()
        } catch (failure: Throwable) {
            if (failure is T) return
            throw failure
        }
        fail("Expected ${T::class.java.simpleName}")
    }
}
