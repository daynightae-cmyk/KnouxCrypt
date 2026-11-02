package com.knoux.crypt.data

import java.io.File
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JVM proof of the capsule policy engine. Every rule that decides whether a secret
 * is released is exercised against the real session, the real KNC2 record store and
 * the real KNP2 passphrase envelope; only the clock is injected, because expiry is
 * meaningless without stating which clock it is measured against.
 */
class SecretCapsuleServiceTest {
    private val vault = TestVault()
    private var clock = 1_700_000_000_000L
    private val sink = CollectingSink()
    private lateinit var service: CapsuleService

    private class CollectingSink : SecurityAuditSink {
        val events = mutableListOf<SecurityAuditEvent>()
        override suspend fun record(event: SecurityAuditEvent) { events += event }
        fun details(): String = events.joinToString("|") { "${it.action.name} ${it.detail}" }
    }

    private suspend fun newService(): CapsuleService {
        vault.enroll()
        return CapsuleService(
            session = vault.session,
            secrets = vault.repository,
            timeSource = TimeSource { clock },
            audit = sink,
        )
    }

    private fun setUp() = runBlocking {
        service = newService()
    }

    private fun failure(block: suspend () -> Any?): CapsuleFailure? =
        rejection(block)?.failure

    private fun rejection(block: suspend () -> Any?): CapsuleRejectedException? =
        runCatching { runBlocking { block() } }.exceptionOrNull() as? CapsuleRejectedException

    private fun thrown(block: suspend () -> Any?): Throwable? =
        runCatching { runBlocking { block() } }.exceptionOrNull()

    @Test
    fun createValidatesEveryBoundBeforeWritingAnything() {
        setUp()
        val access = vault.access()!!
        val good = runBlocking { service.create(access, "otp-backup", "s3cret", 60_000, 1) }
        assertEquals(CapsuleState.ACTIVE, good.state)
        assertEquals(1, good.opensRemaining)

        val rows = vault.dao.rows.value
        assertEquals(1, rows.size)

        val rejections: List<suspend () -> Any?> = listOf(
            suspend { service.create(access, "   ", "x", 60_000, 1) },
            suspend { service.create(access, "a".repeat(121), "x", 60_000, 1) },
            suspend { service.create(access, "ok", "", 60_000, 1) },
            suspend { service.create(access, "ok", "x", 30_000, 1) },
            suspend { service.create(access, "ok", "x", 60_000, 0) },
            suspend { service.create(access, "ok", "x", 60_000, 101) },
            suspend { service.create(access, "ok", "x".repeat(CapsulePolicy.MAX_SECRET_CHARS + 1), 60_000, 1) },
        )
        rejections.forEach { block ->
            val raised = thrown(block)
            assertTrue("expected an IllegalArgumentException, got $raised", raised is IllegalArgumentException)
        }
        // Every rejection happened before a second record was written.
        assertEquals(1, vault.dao.rows.value.size)
    }

    @Test
    fun revealReturnsTheSecretAndConsumesExactlyOneOpen() {
        setUp()
        val access = vault.access()!!
        val capsule = runBlocking { service.create(access, "two-opens", "the-secret", 60_000, 2) }

        assertEquals("the-secret", runBlocking { service.reveal(access, capsule.id) })
        assertEquals("the-secret", runBlocking { service.reveal(access, capsule.id) })

        val after = runBlocking { service.observe(access).first().single() }
        assertEquals(2, after.payload?.opensUsed)
        assertEquals(0, after.opensRemaining)
        assertEquals(CapsuleState.SPENT, after.state)
        assertEquals(CapsuleFailure.SPENT, failure { service.reveal(access, capsule.id) })
        assertTrue(sink.details().contains("CAPSULE_REVEALED opensUsed=2 of 2"))
    }

    @Test
    fun expiryIsMeasuredAgainstTheStatedClockAndRefusalCostsNoOpen() {
        setUp()
        val access = vault.access()!!
        val capsule = runBlocking { service.create(access, "short-lived", "burn-me", 60_000, 5) }

        clock += 30_000
        assertEquals(CapsuleState.ACTIVE, runBlocking { service.observe(access).first().single().state })
        assertEquals(30_000L, runBlocking { service.observe(access).first().single().millisRemaining })

        clock += 31_000
        assertEquals(CapsuleState.EXPIRED, runBlocking { service.observe(access).first().single().state })
        assertEquals(CapsuleFailure.EXPIRED, failure { service.reveal(access, capsule.id) })

        // A refusal must not quietly consume allowance on its way out.
        val row = runBlocking { service.observe(access).first().single() }
        assertEquals(0, row.payload?.opensUsed)
        assertEquals(5, row.opensRemaining)
        assertTrue(sink.details().contains("CAPSULE_REFUSED reason=EXPIRED"))
    }

    @Test
    fun revokedCapsuleNeverRevealsAgainButItsRecordSurvives() {
        setUp()
        val access = vault.access()!!
        val capsule = runBlocking { service.create(access, "recall-me", "value", 60_000, 5) }
        runBlocking { service.revoke(access, capsule.id) }

        assertEquals(CapsuleFailure.REVOKED, failure { service.reveal(access, capsule.id) })
        val after = runBlocking { service.observe(access).first().single() }
        assertEquals(CapsuleState.REVOKED, after.state)
        // Revocation is not deletion: the ciphertext is still there, and the UI says
        // plainly that a copy already handed out is unaffected.
        assertEquals(1, vault.dao.rows.value.size)
        assertNotNull(after.payload)
        assertTrue(sink.details().contains("CAPSULE_REVOKED"))
    }

    @Test
    fun twoRacingRevealsCannotBothSpendTheLastAllowance() {
        setUp()
        val access = vault.access()!!
        val capsule = runBlocking { service.create(access, "race", "only-once", 60_000, 1) }

        val results = runBlocking {
            listOf(
                async { runCatching { service.reveal(access, capsule.id) } },
                async { runCatching { service.reveal(access, capsule.id) } },
            ).awaitAll()
        }
        val succeeded = results.count { it.isSuccess }
        assertEquals("exactly one reveal may consume the last open", 1, succeeded)
        assertEquals("only-once", results.first { it.isSuccess }.getOrNull())

        val final = runBlocking { service.observe(access).first().single() }
        assertEquals(1, final.payload?.opensUsed)
        val loser = results.first { it.isFailure }.exceptionOrNull() as CapsuleRejectedException
        assertTrue(
            "expected a spend or a revision conflict, got ${loser.failure}",
            loser.failure == CapsuleFailure.SPENT || loser.failure == CapsuleFailure.CONCURRENT_UPDATE,
        )
    }

    @Test
    fun sharedPackageRoundTripsAndAnyTamperingFailsAuthentication() {
        setUp()
        val access = vault.access()!!
        val capsule = runBlocking { service.create(access, "handout", "package-secret", 60_000, 3) }
        val passphrase = "correct horse battery staple".toCharArray()
        val sealed = runBlocking { service.sharePackage(access, capsule.id, passphrase) }

        val opened = service.readPackage(sealed, passphrase.copyOf())
        assertEquals("handout", opened.label)
        assertEquals("package-secret", opened.secret)
        assertFalse(opened.expired)
        assertEquals(3, opened.maxOpens)

        // A wrong passphrase yields no content, not a partially decrypted blob.
        assertEquals(CapsuleFailure.UNREADABLE, failure { service.readPackage(sealed, "wrong".toCharArray()) })

        val tampered = sealed.copyOf().also { it[it.size - 1] = (it[it.size - 1].toInt() xor 0x01).toByte() }
        assertEquals(CapsuleFailure.UNREADABLE, failure { service.readPackage(tampered, passphrase.copyOf()) })
    }

    @Test
    fun readerHonoursTheExpiryCarriedInsideThePackage() {
        setUp()
        val access = vault.access()!!
        val capsule = runBlocking { service.create(access, "later", "read-me", 60_000, 2) }
        val passphrase = "passphrase".toCharArray()
        val sealed = runBlocking { service.sharePackage(access, capsule.id, passphrase) }

        val before = service.readPackage(sealed, passphrase.copyOf(), nowMillis = clock + 30_000)
        assertEquals("read-me", before.secret)
        assertFalse(before.expired)

        val after = service.readPackage(sealed, passphrase.copyOf(), nowMillis = clock + 61_000)
        assertTrue(after.expired)
        assertEquals("", after.secret)
    }

    @Test
    fun sharingAnExpiredOrRevokedCapsuleIsRefusedBeforeAnyBytesAreProduced() {
        setUp()
        val access = vault.access()!!
        val expiring = runBlocking { service.create(access, "soon", "nope", 60_000, 2) }
        clock += 61_000
        assertEquals(CapsuleFailure.EXPIRED, failure { service.sharePackage(access, expiring.id, "pw".toCharArray()) })

        val live = runBlocking { service.create(access, "alive", "yes", 60_000, 2) }
        runBlocking { service.revoke(access, live.id) }
        assertEquals(CapsuleFailure.REVOKED, failure { service.sharePackage(access, live.id, "pw".toCharArray()) })
    }

    @Test
    fun stateIsDerivedFromTheClockAndNeverStored() {
        setUp()
        val access = vault.access()!!
        val capsule = runBlocking { service.create(access, "derived", "v", 60_000, 5) }
        val storedBefore = vault.dao.rows.value.single().envelope.copyOf()

        clock += 61_000
        assertEquals(CapsuleState.EXPIRED, runBlocking { service.observe(access).first().single().state })
        // Moving the clock changed nothing on disk: the state is computed, not written.
        assertEquals(storedBefore.toList(), vault.dao.rows.value.single().envelope.toList())
    }

    @Test
    fun deleteRemovesTheRecordAndALaterRevealReportsNotFound() {
        setUp()
        val access = vault.access()!!
        val capsule = runBlocking { service.create(access, "gone", "v", 60_000, 1) }
        runBlocking { service.delete(access, capsule.id) }

        assertTrue(runBlocking { service.observe(access).first().isEmpty() })
        assertEquals(CapsuleFailure.NOT_FOUND, failure { service.reveal(access, capsule.id) })
        assertTrue(sink.details().contains("CAPSULE_DELETED"))
        assertTrue(sink.details().contains("CAPSULE_REFUSED reason=NOT_FOUND"))
    }

    @Test
    fun auditNeverCarriesTheLabelOrTheSecret() {
        setUp()
        val access = vault.access()!!
        val capsule = runBlocking {
            service.create(access, "board-passphrase", "Sup3rS3cretValue", 60_000, 2)
        }
        runBlocking { service.reveal(access, capsule.id) }
        runBlocking { service.sharePackage(access, capsule.id, "pw".toCharArray()) }
        clock += 61_000
        failure { service.reveal(access, capsule.id) }
        runBlocking { service.revoke(access, capsule.id) }
        runBlocking { service.delete(access, capsule.id) }

        val details = sink.details()
        assertFalse(details.contains("Sup3rS3cretValue"))
        assertFalse(details.contains("board-passphrase"))
        assertFalse(details.contains(capsule.id))
        assertFalse(details.contains("pw"))
        assertFalse(details.contains(File.separator))
    }

    @Test
    fun capsuleWritesUseTheirOwnEventsAndDoNotDoubleLogTheTimeline() {
        setUp()
        val access = vault.access()!!
        runBlocking {
            service.create(access, "quiet", "v", 60_000, 1)
            service.reveal(access, service.observe(access).first().single().id)
        }
        assertEquals(1, sink.events.count { it.action == SecurityEventAction.CAPSULE_CREATED })
        assertEquals(1, sink.events.count { it.action == SecurityEventAction.CAPSULE_REVEALED })
        // The generic per-record lines are suppressed for this kind, so a burst of
        // capsule opens cannot evict real alerts from the bounded timeline.
        assertEquals(0, sink.events.count { it.action == SecurityEventAction.DATA_WRITTEN })
        assertEquals(0, sink.events.count { it.action == SecurityEventAction.DATA_DELETED })
    }

    @Test
    fun lockedSessionCannotCreateRevealOrRevoke() {
        setUp()
        val access = vault.access()!!
        val capsule = runBlocking { service.create(access, "locked", "v", 60_000, 1) }
        runBlocking { vault.session.lock() }

        assertTrue("create must fail closed on a locked vault", thrown { service.create(access, "again", "v", 60_000, 1) } is VaultLockedException)
        assertTrue("reveal must fail closed on a locked vault", thrown { service.reveal(access, capsule.id) } is VaultLockedException)
        assertTrue("revoke must fail closed on a locked vault", thrown { service.revoke(access, capsule.id) } is VaultLockedException)
        assertTrue("share must fail closed on a locked vault", thrown { service.sharePackage(access, capsule.id, "pw".toCharArray()) } is VaultLockedException)
    }

    @Test
    fun policyChoicesAreTheOnesTheUiOffers() {
        assertTrue(CapsulePolicy.TTL_CHOICES_MILLIS.contains(24L * 60 * 60 * 1000))
        assertEquals(listOf(1, 3, 5, 10, 25), CapsulePolicy.MAX_OPEN_CHOICES)
        assertEquals(1, CapsulePolicy.MIN_MAX_OPENS)
        assertEquals(60_000L, CapsulePolicy.MIN_TTL_MILLIS)
        assertEquals(
            CapsulePolicy.MAX_TTL_MILLIS,
            CapsulePolicy.validateTtl(CapsulePolicy.MAX_TTL_MILLIS),
        )
        assertEquals(100, CapsulePolicy.validateMaxOpens(100))
    }
}
