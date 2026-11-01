package com.knoux.crypt.security

import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * KTX1 local-transfer protocol tests (TASK 22).
 *
 * The protocol is the part of a nearby transfer that can be proven without a
 * radio: framing, key agreement symmetry, replay and ordering enforcement,
 * tamper detection, and the resume contract. Each of those has a test here, so
 * the transport decision can be made on evidence rather than on hope.
 */
class TransferProtocolTest {

    private fun pair() = Pair(ShareKeyPair.generate(), ShareKeyPair.generate())

    private fun helloFor(ephemeral: ShareKeyPair, sessionId: ByteArray, name: String): ByteArray =
        TransferProtocol.hello(sessionId, ephemeral.public.parameters.encoded, name)

    @Test
    fun framesRoundTripAndPartialFramesWait() {
        val payload = "a sealed chunk of a package".toByteArray()
        val bytes = TransferProtocol.frame(TransferProtocol.TYPE_DATA, payload)
        val frame = TransferProtocol.nextFrame(bytes)
        assertEquals(TransferProtocol.TYPE_DATA, frame!!.first)
        assertTrue(payload.contentEquals(frame.second))

        // A frame split across two reads is not a frame yet.
        val partial = bytes.copyOfRange(0, bytes.size - 1)
        assertEquals(null, TransferProtocol.nextFrame(partial))
        assertEquals(null, TransferProtocol.nextFrame(ByteArray(2)))
    }

    @Test
    fun aDeclaredFrameLengthBeyondTheLimitIsRefusedNotAllocated() {
        // A frame length is two bytes, so the worst a hostile sender can declare is
        // 65 535 bytes: the parser waits for the rest instead of allocating it, and
        // the framing can never ask for an unbounded buffer.
        val hostile = ByteArray(3 + 8)
        hostile[0] = TransferProtocol.TYPE_DATA.toByte()
        hostile[1] = 0xff.toByte()
        hostile[2] = 0xff.toByte()
        assertEquals(null, TransferProtocol.nextFrame(hostile))

        try {
            TransferProtocol.frame(TransferProtocol.TYPE_DATA, ByteArray(TransferProtocol.MAX_FRAME_BYTES + 1))
            fail("framed a payload larger than the two-byte length field")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message!!.contains("too large"))
        }
    }

    @Test
    fun helloCarriesTheSessionIdEphemeralKeyAndName() {
        val ephemeral = ShareKeyPair.generate()
        val sessionId = TransferProtocol.newSessionId()
        val bytes = helloFor(ephemeral, sessionId, "Pixel 8 Pro")
        val (_, payload) = requireNotNull(TransferProtocol.nextFrame(bytes))
        val hello = TransferProtocol.parseHello(payload)
        assertTrue(sessionId.contentEquals(hello.sessionId))
        assertTrue(ephemeral.public.parameters.encoded.contentEquals(hello.ephemeralPublic))
        assertEquals("Pixel 8 Pro", hello.name)

        // The frame header is three bytes, so the version is the fourth byte overall.
        val wrongVersion = bytes.copyOf().also { it[3] = 9 }
        try {
            TransferProtocol.parseHello(requireNotNull(TransferProtocol.nextFrame(wrongVersion)).second)
            fail("accepted an unsupported protocol version")
        } catch (expected: TransferProtocol.ProtocolException) {
            assertEquals(TransferProtocol.Failure.UNSUPPORTED_VERSION, expected.failure)
        }

        // A complete frame with a valid version but a body too short for the session id.
        val truncated = TransferProtocol.frame(TransferProtocol.TYPE_HELLO, byteArrayOf(1) + ByteArray(9))
        try {
            TransferProtocol.parseHello(requireNotNull(TransferProtocol.nextFrame(truncated)).second)
            fail("accepted a truncated hello")
        } catch (expected: TransferProtocol.ProtocolException) {
            assertEquals(TransferProtocol.Failure.MALFORMED_FRAME, expected.failure)
        }
    }

    @Test
    fun bothSidesDeriveMirroredKeysWhateverTheSpeakingOrder() {
        val (aEphemeral, bEphemeral) = pair()
        val sessionId = TransferProtocol.newSessionId()
        val helloA = helloFor(aEphemeral, sessionId, "A")
        val helloB = helloFor(bEphemeral, sessionId, "B")
        val payloadA = requireNotNull(TransferProtocol.nextFrame(helloA)).second
        val payloadB = requireNotNull(TransferProtocol.nextFrame(helloB)).second

        val keysA = TransferProtocol.sessionKeys(aEphemeral, TransferProtocol.parseHello(payloadB), helloA, helloB)
        val keysB = TransferProtocol.sessionKeys(bEphemeral, TransferProtocol.parseHello(payloadA), helloB, helloA)

        assertTrue(keysA.sendKey.contentEquals(keysB.receiveKey))
        assertTrue(keysA.receiveKey.contentEquals(keysB.sendKey))
        assertEquals(32, keysA.sendKey.size)
        assertFalse(keysA.sendKey.contentEquals(keysA.receiveKey))

        // Swapping the argument order must not change the derived keys.
        val keysASwapped = TransferProtocol.sessionKeys(aEphemeral, TransferProtocol.parseHello(payloadB), helloB, helloA)
        assertTrue(keysA.sendKey.contentEquals(keysASwapped.sendKey))
    }

    @Test
    fun recordsAuthenticateAndEnforceSequence() {
        val (aEphemeral, bEphemeral) = pair()
        val sessionId = TransferProtocol.newSessionId()
        val helloA = helloFor(aEphemeral, sessionId, "A")
        val helloB = helloFor(bEphemeral, sessionId, "B")
        val keysA = TransferProtocol.sessionKeys(aEphemeral, TransferProtocol.parseHello(requireNotNull(TransferProtocol.nextFrame(helloB)).second), helloA, helloB)
        val keysB = TransferProtocol.sessionKeys(bEphemeral, TransferProtocol.parseHello(requireNotNull(TransferProtocol.nextFrame(helloA)).second), helloB, helloA)

        val plaintext = "package bytes".toByteArray()
        val record = TransferProtocol.sealRecord(TransferProtocol.TYPE_DATA, keysA, 0L, plaintext, offset = 1024L)
        val (sequence, body) = TransferProtocol.openRecord(TransferProtocol.TYPE_DATA, keysB, 0L, requireNotNull(TransferProtocol.nextFrame(record)).second, offset = 1024L)
        assertEquals(0L, sequence)
        assertTrue(plaintext.contentEquals(body))

        // Replaying an older record is refused.
        val replay = TransferProtocol.sealRecord(TransferProtocol.TYPE_DATA, keysA, 3L, plaintext, offset = 1024L)
        val replayPayload = requireNotNull(TransferProtocol.nextFrame(replay)).second
        try {
            TransferProtocol.openRecord(TransferProtocol.TYPE_DATA, keysB, 4L, replayPayload, offset = 1024L)
            fail("accepted a replayed record")
        } catch (expected: TransferProtocol.ProtocolException) {
            assertEquals(TransferProtocol.Failure.REPLAY, expected.failure)
        }

        // A gap is refused rather than silently skipped.
        try {
            TransferProtocol.openRecord(TransferProtocol.TYPE_DATA, keysB, 1L, replayPayload, offset = 1024L)
            fail("accepted an out-of-order record")
        } catch (expected: TransferProtocol.ProtocolException) {
            assertEquals(TransferProtocol.Failure.OUT_OF_ORDER, expected.failure)
        }
    }

    @Test
    fun tamperingWithARecordOrItsContextBreaksAuthentication() {
        val (aEphemeral, bEphemeral) = pair()
        val sessionId = TransferProtocol.newSessionId()
        val helloA = helloFor(aEphemeral, sessionId, "A")
        val helloB = helloFor(bEphemeral, sessionId, "B")
        val keysA = TransferProtocol.sessionKeys(aEphemeral, TransferProtocol.parseHello(requireNotNull(TransferProtocol.nextFrame(helloB)).second), helloA, helloB)
        val keysB = TransferProtocol.sessionKeys(bEphemeral, TransferProtocol.parseHello(requireNotNull(TransferProtocol.nextFrame(helloA)).second), helloB, helloA)

        val record = TransferProtocol.sealRecord(TransferProtocol.TYPE_DATA, keysA, 0L, "payload".toByteArray(), offset = 0L)
        val payload = requireNotNull(TransferProtocol.nextFrame(record)).second
        val flipped = payload.copyOf().also { it[it.size - 1] = (it[it.size - 1].toInt() xor 0x01).toByte() }
        try {
            TransferProtocol.openRecord(TransferProtocol.TYPE_DATA, keysB, 0L, flipped, offset = 0L)
            fail("accepted a tampered record")
        } catch (expected: TransferProtocol.ProtocolException) {
            assertEquals(TransferProtocol.Failure.TAMPERED, expected.failure)
        }

        // The offset is authenticated: the same record is not valid at another resume point.
        try {
            TransferProtocol.openRecord(TransferProtocol.TYPE_DATA, keysB, 0L, payload, offset = 4096L)
            fail("accepted a record at a different offset")
        } catch (expected: TransferProtocol.ProtocolException) {
            assertEquals(TransferProtocol.Failure.TAMPERED, expected.failure)
        }

        // Nor is a DATA record valid as an END record.
        try {
            TransferProtocol.openRecord(TransferProtocol.TYPE_END, keysB, 0L, payload, offset = 0L)
            fail("accepted a record reinterpreted as another type")
        } catch (expected: TransferProtocol.ProtocolException) {
            assertEquals(TransferProtocol.Failure.TAMPERED, expected.failure)
        }
    }

    @Test
    fun aDifferentSessionIdDerivesDifferentKeys() {
        val (aEphemeral, bEphemeral) = pair()
        val helloA = helloFor(aEphemeral, TransferProtocol.newSessionId(), "A")
        val helloB1 = helloFor(bEphemeral, ByteArray(TransferProtocol.SESSION_ID_BYTES) { 1 }, "B")
        val helloB2 = helloFor(bEphemeral, ByteArray(TransferProtocol.SESSION_ID_BYTES) { 2 }, "B")
        val keys1 = TransferProtocol.sessionKeys(aEphemeral, TransferProtocol.parseHello(requireNotNull(TransferProtocol.nextFrame(helloB1)).second), helloA, helloB1)
        val keys2 = TransferProtocol.sessionKeys(aEphemeral, TransferProtocol.parseHello(requireNotNull(TransferProtocol.nextFrame(helloB2)).second), helloA, helloB2)
        assertFalse(keys1.sendKey.contentEquals(keys2.sendKey))
    }

    @Test
    fun controlPayloadsRoundTripAndRejectImplausibleFraming() {
        val offer = TransferProtocol.Offer(
            packageIdHex = "0123456789abcdef",
            fileName = "media-share.kx",
            totalBytes = 13_421_772L,
            offset = 4_194_304L,
            digestHex = "ab".repeat(32),
        )
        val parsed = TransferProtocol.parseOffer(TransferProtocol.offerPayload(offer))
        assertEquals(offer, parsed)

        val accept = TransferProtocol.parseOffset(TransferProtocol.acceptPayload(offer.offset))
        assertEquals(4_194_304L, accept)

        val (total, digest) = TransferProtocol.parseEnd(TransferProtocol.endPayload(123L, "ff".repeat(32)))
        assertEquals(123L, total)
        assertEquals("ff".repeat(32), digest)

        // An offset beyond the declared total is nonsense and is refused.
        val hostile = ByteBuffer.allocate(24).order(ByteOrder.BIG_ENDIAN)
            .putInt(0).array()
        try {
            TransferProtocol.parseOffer(hostile)
            fail("accepted an empty offer")
        } catch (expected: TransferProtocol.ProtocolException) {
            assertEquals(TransferProtocol.Failure.MALFORMED_FRAME, expected.failure)
        }

        val beyondTotal = TransferProtocol.offerPayload(offer.copy(totalBytes = 10, offset = 20))
        try {
            TransferProtocol.parseOffer(beyondTotal)
            fail("accepted an offer resuming past its own end")
        } catch (expected: TransferProtocol.ProtocolException) {
            assertEquals(TransferProtocol.Failure.SIZE_MISMATCH, expected.failure)
        }

        val badEnd = byteArrayOf(0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 64) + ByteArray(4)
        try {
            TransferProtocol.parseEnd(badEnd)
            fail("accepted an end frame declaring more digest than it holds")
        } catch (expected: TransferProtocol.ProtocolException) {
            assertEquals(TransferProtocol.Failure.MALFORMED_FRAME, expected.failure)
        }
    }

    @Test
    fun namesAndLongTermsAreTruncatedToTheirDeclaredBounds() {
        val long = "x".repeat(400)
        val bytes = helloFor(ShareKeyPair.generate(), TransferProtocol.newSessionId(), long)
        val hello = TransferProtocol.parseHello(requireNotNull(TransferProtocol.nextFrame(bytes)).second)
        assertEquals(TransferProtocol.MAX_NAME_BYTES, hello.name.length)

        val offer = TransferProtocol.Offer("id".repeat(80), long, 1L, 0L, "d".repeat(200))
        val parsed = TransferProtocol.parseOffer(TransferProtocol.offerPayload(offer))
        assertTrue(parsed.fileName.length <= TransferProtocol.MAX_NAME_BYTES)
        assertTrue(parsed.digestHex.length <= 64)
        assertTrue(parsed.packageIdHex.length <= 64)
    }
}
