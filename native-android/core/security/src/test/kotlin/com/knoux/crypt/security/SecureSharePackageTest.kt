package com.knoux.crypt.security

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Behaviour and abuse tests for the KSR1 share container (TASK 16).
 *
 * Everything here is checked against the container as it is written on the wire,
 * so a change to the framing that silently weakens authentication fails a test
 * instead of passing a round trip.
 */
class SecureSharePackageTest {

    private val share = SecureSharePackage()
    private val alice = ShareKeyPair.generate()
    private val bob = ShareKeyPair.generate()
    private val carol = ShareKeyPair.generate()
    private val createdAt = 1_700_000_000_000L

    private fun sealBytes(
        recipients: List<RecipientKey>,
        plaintext: ByteArray,
        metadata: ByteArray = """{"file":"brief.pdf"}""".toByteArray(),
        expiresAt: Long? = null,
        chunkSize: Int = 1024,
    ): ByteArray {
        val output = ByteArrayOutputStream()
        share.seal(
            input = ByteArrayInputStream(plaintext),
            output = output,
            recipients = recipients,
            metadata = metadata,
            plaintextLength = plaintext.size.toLong(),
            createdAt = createdAt,
            expiresAt = expiresAt,
            chunkSize = chunkSize,
        )
        return output.toByteArray()
    }

    private fun open(bytes: ByteArray, identity: ShareKeyPair, now: Long = createdAt + 1000): Pair<SecureSharePackage.OpenResult, ByteArray> {
        val output = ByteArrayOutputStream()
        val result = share.open(ByteArrayInputStream(bytes), output, identity, now)
        return result to output.toByteArray()
    }

    /** Mirrors the documented framing so the tests address real byte offsets. */
    private fun encapsulationOffset(count: Int) = 56 + 8 * count
    private fun expiresAtOffset(count: Int) = encapsulationOffset(count) + 92 * count + 8
    private fun metadataOffset(count: Int) = expiresAtOffset(count) + 8 + 12 + 2
    private fun payloadOffset(count: Int, metadataLength: Int) = metadataOffset(count) + metadataLength + 24

    @Test
    fun roundTripReturnsTheExactBytesAndMetadata() {
        val plaintext = ByteArray(4096) { (it % 251).toByte() }
        val metadata = """{"fileName":"quarterly report.pdf","note":"for rana"}""".toByteArray()
        val bytes = sealBytes(listOf(bob.public), plaintext, metadata)

        val (result, output) = open(bytes, bob)
        assertEquals(SecureSharePackage.Verdict.OPENED, result.verdict)
        assertArrayEquals(plaintext, output)
        assertArrayEquals(metadata, result.metadata)
        assertEquals(plaintext.size.toLong(), result.plaintextBytes)
        assertEquals(1, result.summary?.recipientCount)
    }

    @Test
    fun everyListedRecipientCanOpenTheSamePackage() {
        val plaintext = "the same sealed bytes for everyone".toByteArray()
        val bytes = sealBytes(listOf(alice.public, bob.public, carol.public), plaintext)

        listOf(alice, bob, carol).forEach { identity ->
            val (result, output) = open(bytes, identity)
            assertEquals(SecureSharePackage.Verdict.OPENED, result.verdict)
            assertArrayEquals(plaintext, output)
        }
        // An outsider holding a different key gets nothing.
        val (outsider, outsiderOutput) = open(bytes, ShareKeyPair.generate())
        assertEquals(SecureSharePackage.Verdict.RECIPIENT_MISMATCH, outsider.verdict)
        assertEquals(0, outsiderOutput.size)
    }

    @Test
    fun wrongRecipientIsReportedWithoutWritingAnything() {
        val bytes = sealBytes(listOf(bob.public), "secret plan".toByteArray())
        val (result, output) = open(bytes, alice)
        assertEquals(SecureSharePackage.Verdict.RECIPIENT_MISMATCH, result.verdict)
        assertEquals(0, output.size)
        assertNull(result.metadata)
        assertNotNull(result.summary)
        assertTrue(result.detail.contains(bob.public.keyIdHex))
        assertTrue(result.detail.contains(alice.public.keyIdHex))
    }

    @Test
    fun tamperedPayloadChunkIsRejected() {
        val bytes = sealBytes(listOf(bob.public), ByteArray(2048) { 3 })
        val summary = share.summarize(ByteArrayInputStream(bytes))
        val target = payloadOffset(summary.recipientCount, summary.metadataLength) + 5
        bytes[target] = (bytes[target].toInt() xor 0x01).toByte()

        val (result, output) = open(bytes, bob)
        assertEquals(SecureSharePackage.Verdict.TAMPERED, result.verdict)
        assertEquals(0, output.size)
    }

    @Test
    fun tamperedEncapsulationIsRejected() {
        val bytes = sealBytes(listOf(bob.public), "wrap me".toByteArray())
        bytes[encapsulationOffset(1) + 40] = (bytes[encapsulationOffset(1) + 40].toInt() xor 0x80).toByte()
        val (result, output) = open(bytes, bob)
        assertEquals(SecureSharePackage.Verdict.TAMPERED, result.verdict)
        assertEquals(0, output.size)
    }

    @Test
    fun tamperedMetadataBlockIsRejected() {
        val bytes = sealBytes(listOf(bob.public), "meta me".toByteArray())
        val index = metadataOffset(1) + 3
        bytes[index] = (bytes[index].toInt() xor 0x02).toByte()
        val (result, _) = open(bytes, bob)
        assertEquals(SecureSharePackage.Verdict.TAMPERED, result.verdict)
    }

    @Test
    fun changingTheClearExpiryFieldBreaksAuthenticationInsteadOfExtendingAccess() {
        val bytes = sealBytes(listOf(bob.public), "expiry is bound".toByteArray(), expiresAt = createdAt + 5_000)
        val index = expiresAtOffset(1)
        bytes[index] = (bytes[index].toInt() xor 0x01).toByte()
        val (result, output) = open(bytes, bob)
        assertEquals(SecureSharePackage.Verdict.TAMPERED, result.verdict)
        assertEquals(0, output.size)
    }

    @Test
    fun expiredPackageRevealsItsMetadataButNeverItsPayload() {
        val plaintext = "time limited".toByteArray()
        val metadata = """{"fileName":"ticket.pdf"}""".toByteArray()
        val bytes = sealBytes(listOf(bob.public), plaintext, metadata, expiresAt = createdAt + 1_000)

        val (result, output) = open(bytes, bob, now = createdAt + 2_000)
        assertEquals(SecureSharePackage.Verdict.EXPIRED, result.verdict)
        assertEquals(0, output.size)
        assertArrayEquals(metadata, result.metadata)

        // Before the label passes, the same package opens normally.
        val (early, earlyOutput) = open(bytes, bob, now = createdAt + 999)
        assertEquals(SecureSharePackage.Verdict.OPENED, early.verdict)
        assertArrayEquals(plaintext, earlyOutput)
    }

    @Test
    fun foreignAndTruncatedContainersAreUnsupported() {
        val bytes = sealBytes(listOf(bob.public), "hello".toByteArray())
        val notOurs = bytes.copyOf().also { it[0] = 'X'.code.toByte() }
        assertEquals(SecureSharePackage.Verdict.UNSUPPORTED, open(notOurs, bob).first.verdict)
        assertEquals(SecureSharePackage.Verdict.UNSUPPORTED, open(bytes.copyOfRange(0, 30), bob).first.verdict)
        assertEquals(SecureSharePackage.Verdict.UNSUPPORTED, open(ByteArray(0), bob).first.verdict)
        // Payload truncated after a valid header.
        val summary = share.summarize(ByteArrayInputStream(bytes))
        val cut = bytes.copyOfRange(0, payloadOffset(summary.recipientCount, summary.metadataLength) + 8)
        assertEquals(SecureSharePackage.Verdict.TAMPERED, open(cut, bob).first.verdict)
    }

    @Test
    fun emptyAndLargePayloadsSurviveChunking() {
        val empty = sealBytes(listOf(bob.public), ByteArray(0))
        assertEquals(SecureSharePackage.Verdict.OPENED, open(empty, bob).first.verdict)
        assertArrayEquals(ByteArray(0), open(empty, bob).second)

        val large = ByteArray(9_000) { (it * 7 + 3).toByte() }
        val bytes = sealBytes(listOf(bob.public), large, chunkSize = 1024)
        val (result, output) = open(bytes, bob)
        assertEquals(SecureSharePackage.Verdict.OPENED, result.verdict)
        assertArrayEquals(large, output)
        assertEquals(large.size.toLong(), result.summary?.plaintextLength)
    }

    @Test
    fun plaintextAndMetadataNeverAppearInThePackage() {
        val plaintext = "TOP-SECRET-CONTRACT-TEXT".toByteArray()
        val metadata = """{"fileName":"board minutes.docx"}""".toByteArray()
        val bytes = sealBytes(listOf(bob.public), plaintext, metadata)
        val asText = String(bytes, Charsets.ISO_8859_1)
        assertFalse(asText.contains("TOP-SECRET-CONTRACT-TEXT"))
        assertFalse(asText.contains("board minutes"))
        assertTrue(asText.startsWith("KSR1"))
    }

    @Test
    fun substitutingAnotherPackagesEncapsulationFails() {
        val first = sealBytes(listOf(bob.public), "package one".toByteArray())
        val second = sealBytes(listOf(bob.public), "package two".toByteArray())
        // Copy the whole encapsulation of `second` over the one in `first`.
        val spliced = first.copyOf()
        System.arraycopy(second, encapsulationOffset(1), spliced, encapsulationOffset(1), 92)
        val (result, output) = open(spliced, bob)
        assertEquals(SecureSharePackage.Verdict.TAMPERED, result.verdict)
        assertEquals(0, output.size)
    }

    @Test
    fun duplicateRecipientKeysAreRefusedBeforeAnyWork() {
        try {
            sealBytes(listOf(bob.public, bob.public), "nope".toByteArray())
            fail("A duplicated recipient must be rejected")
        } catch (expected: UnsupportedContainerException) {
            assertTrue(expected.message!!.contains("twice"))
        }
    }

    @Test
    fun oversizedInputsAreRefused() {
        val tooMany = (1..SecureSharePackage.MAX_RECIPIENTS + 1).map { ShareKeyPair.generate().public }
        try {
            sealBytes(tooMany, "x".toByteArray())
            fail("More than ${SecureSharePackage.MAX_RECIPIENTS} recipients must be rejected")
        } catch (expected: UnsupportedContainerException) {
            assertTrue(expected.message!!.contains("recipients"))
        }
        try {
            sealBytes(listOf(bob.public), "x".toByteArray(), metadata = ByteArray(SecureSharePackage.MAX_METADATA_BYTES + 1))
            fail("Oversized metadata must be rejected")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message!!.isNotBlank())
        }
        try {
            sealBytes(listOf(bob.public), "x".toByteArray(), expiresAt = createdAt - 1)
            fail("An expiry before creation must be rejected")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message!!.contains("expiry"))
        }
    }

    @Test
    fun progressReportsTheWholePayloadAndSummaryIsReadableWithoutKeys() {
        val plaintext = ByteArray(3000) { it.toByte() }
        val output = ByteArrayOutputStream()
        val marks = mutableListOf<Float>()
        val summary = share.seal(
            input = ByteArrayInputStream(plaintext),
            output = output,
            recipients = listOf(alice.public, bob.public),
            metadata = "meta".toByteArray(),
            plaintextLength = plaintext.size.toLong(),
            createdAt = createdAt,
            expiresAt = null,
            chunkSize = 1024,
            onProgress = { marks += it.fraction },
        )
        assertEquals(2, summary.recipientCount)
        assertEquals(3, marks.size)
        assertEquals(1f, marks.last(), 0.0001f)
        assertEquals(plaintext.size.toLong(), summary.plaintextLength)

        val blind = share.summarize(ByteArrayInputStream(output.toByteArray()))
        assertEquals(summary, blind)
        assertEquals(2, blind.recipientKeyIds.size)
        assertTrue(blind.recipientKeyIds.contains(bob.public.keyIdHex))
        assertNull(blind.expiresAt)
        assertEquals(32, blind.packageIdHex.length)
    }
}
