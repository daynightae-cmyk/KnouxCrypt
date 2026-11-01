package com.knoux.crypt.security

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * KTX1 — the local-transfer session protocol (TASK 22).
 *
 * A transport carries bytes; this decides what those bytes *mean* and what is
 * refused. Both ends run the same state machine over a duplex byte pipe, so it is
 * fully testable without a radio, and the radio is only ever allowed to carry
 * frames this layer produced.
 *
 * Guarantees, each with a test:
 *  - **Ciphertext only.** Payload frames are AES-256-GCM under a session key; the
 *    clear frames carry public values only (version, session id, ephemeral keys).
 *  - **Peer identity.** Each side proves possession of its long-term X25519
 *    identity inside the encrypted handshake, and the recorded fingerprint must
 *    equal the one the user confirmed before any payload byte is accepted.
 *  - **Replay and ordering.** One key per direction, a 64-bit sequence in every
 *    nonce and in the AAD, and a receiver that stops at the first gap.
 *  - **Truncation and substitution.** An END frame carries the byte count and the
 *    SHA-256 of the payload; a finished stream that does not match is rejected.
 *  - **Resume.** A resumed transfer re-handshakes with a fresh session id and an
 *    authenticated offset, so a restart cannot silently re-send old bytes into the
 *    middle of a file.
 *
 * It does not provide forward secrecy against a peer that later reveals its long
 * term key, and it is not a trust network: identity here means "the key you said
 * you verified".
 */
object TransferProtocol {
    const val VERSION = 1
    const val SESSION_ID_BYTES = 16

    /** A frame length is two bytes, so 65 535 is the largest payload the framing can carry. */
    const val MAX_FRAME_BYTES = 65_535
    const val MAX_NAME_BYTES = 64
    const val MAX_CHUNK_BYTES = 32 * 1024

    const val TYPE_HELLO = 1
    const val TYPE_KEYCONF = 2
    const val TYPE_OFFER = 3
    const val TYPE_ACCEPT = 4
    const val TYPE_DATA = 5
    const val TYPE_END = 6
    const val TYPE_ERROR = 7

    enum class Failure {
        UNSUPPORTED_VERSION,
        MALFORMED_FRAME,
        FRAME_TOO_LARGE,
        REPLAY,
        OUT_OF_ORDER,
        TAMPERED,
        IDENTITY_MISMATCH,
        DIGEST_MISMATCH,
        SIZE_MISMATCH,
        PEER_ABORTED,
        NOT_READY,
    }

    class ProtocolException(val failure: Failure, message: String? = null) : IOException(message ?: failure.name)

    data class Hello(val sessionId: ByteArray, val ephemeralPublic: ByteArray, val name: String)

    data class Offer(
        val packageIdHex: String,
        val fileName: String,
        val totalBytes: Long,
        val offset: Long,
        val digestHex: String,
    )

    data class Accept(val offset: Long)

    sealed class Event {
        data class HelloReceived(val hello: Hello) : Event()
        data class KeyConf(val identitySpki: ByteArray, val fingerprint: String) : Event()
        data class OfferReceived(val offer: Offer) : Event()
        data class AcceptReceived(val accept: Accept) : Event()
        data class Data(val bytes: ByteArray, val expectedNext: Long) : Event()
        data class End(val totalBytes: Long, val digestHex: String) : Event()
        data class Aborted(val failure: Failure, val detail: String) : Event()
    }

    // --- framing ------------------------------------------------------------

    fun frame(type: Int, payload: ByteArray): ByteArray {
        require(type in TYPE_HELLO..TYPE_END) { "Unknown frame type $type" }
        require(payload.size <= MAX_FRAME_BYTES) { "Frame payload is too large" }
        return ByteArrayOutputStream(payload.size + 3).apply {
            write(type)
            write(shortBytes(payload.size))
            write(payload)
        }.toByteArray()
    }

    /** Splits one frame off the front of a buffer; returns null when more bytes are needed. */
    fun nextFrame(buffer: ByteArray, from: Int = 0): Pair<Int, ByteArray>? {
        val available = buffer.size - from
        if (available < 3) return null
        val type = buffer[from].toInt() and 0xff
        val length = ((buffer[from + 1].toInt() and 0xff) shl 8) or (buffer[from + 2].toInt() and 0xff)
        if (length > MAX_FRAME_BYTES) throw ProtocolException(Failure.FRAME_TOO_LARGE, "declared frame length $length")
        if (available < 3 + length) return null
        return type to buffer.copyOfRange(from + 3, from + 3 + length)
    }

    // --- handshake ----------------------------------------------------------

    fun hello(sessionId: ByteArray, ephemeralPublic: ByteArray, name: String): ByteArray {
        val cleanName = name.toByteArray(Charsets.UTF_8).take(MAX_NAME_BYTES).toByteArray()
        require(ephemeralPublic.size == RecipientKey.RAW_KEY_BYTES) { "an X25519 public key is 32 bytes" }
        val payload = ByteBuffer
            .allocate(1 + SESSION_ID_BYTES + 1 + ephemeralPublic.size + 1 + cleanName.size)
            .order(ByteOrder.BIG_ENDIAN)
            .put(VERSION.toByte())
            .put(sessionId)
            .put(ephemeralPublic.size.toByte())
            .put(ephemeralPublic)
            .put(cleanName.size.toByte())
            .put(cleanName)
            .array()
        return frame(TYPE_HELLO, payload)
    }

    fun parseHello(payload: ByteArray): Hello {
        if (payload.isEmpty()) throw ProtocolException(Failure.MALFORMED_FRAME, "empty hello")
        if (payload[0].toInt() != VERSION) throw ProtocolException(Failure.UNSUPPORTED_VERSION, "hello version ${payload[0]}")
        var offset = 1
        if (payload.size < offset + SESSION_ID_BYTES) throw ProtocolException(Failure.MALFORMED_FRAME, "short session id")
        val sessionId = payload.copyOfRange(offset, offset + SESSION_ID_BYTES)
        offset += SESSION_ID_BYTES
        val keyLength = payload[offset].toInt() and 0xff
        offset += 1
        if (keyLength != RecipientKey.RAW_KEY_BYTES || payload.size < offset + keyLength) {
            throw ProtocolException(Failure.MALFORMED_FRAME, "bad ephemeral key length $keyLength")
        }
        val ephemeral = payload.copyOfRange(offset, offset + keyLength)
        offset += keyLength
        val nameLength = payload[offset].toInt() and 0xff
        offset += 1
        if (payload.size < offset + nameLength) throw ProtocolException(Failure.MALFORMED_FRAME, "truncated name")
        val name = String(payload, offset, nameLength, Charsets.UTF_8)
        return Hello(sessionId, ephemeral, name)
    }

    /**
     * Derives the two direction keys from both ephemeral secrets, the session id
     * and the transcript. Each side gets the mirror image of the other: the role
     * is decided by comparing the two ephemeral public keys, so it does not depend
     * on who spoke first or on the order arguments happen to be passed in.
     */
    fun sessionKeys(
        myEphemeral: ShareKeyPair,
        peerHello: Hello,
        myHelloSent: ByteArray,
        peerHelloBytes: ByteArray,
    ): SessionKeys {
        val peerPublic = RecipientKey.fromSpki(x25519Spki(peerHello.ephemeralPublic))
        val shared = myEphemeral.sharedSecret(peerPublic)
        val transcript = if (compareUnsigned(myHelloSent, peerHelloBytes) <= 0) {
            myHelloSent + peerHelloBytes
        } else {
            peerHelloBytes + myHelloSent
        }
        val transcriptHash = Hashing.sha256(transcript)
        val base = "knoux:transfer:v1:".toByteArray(Charsets.UTF_8) + transcriptHash
        val firstKey = ShareKdf.hkdfSha256(shared, peerHello.sessionId, base + "first".toByteArray())
        val secondKey = ShareKdf.hkdfSha256(shared, peerHello.sessionId, base + "second".toByteArray())
        val iAmFirst = compareUnsigned(myEphemeral.public.parameters.encoded, peerHello.ephemeralPublic) <= 0
        return SessionKeys(
            sendKey = if (iAmFirst) firstKey else secondKey,
            receiveKey = if (iAmFirst) secondKey else firstKey,
            sessionId = peerHello.sessionId,
        )
    }

    private fun compareUnsigned(left: ByteArray, right: ByteArray): Int {
        val size = minOf(left.size, right.size)
        for (index in 0 until size) {
            val diff = (left[index].toInt() and 0xff) - (right[index].toInt() and 0xff)
            if (diff != 0) return diff
        }
        return left.size - right.size
    }

    data class SessionKeys(val sendKey: ByteArray, val receiveKey: ByteArray, val sessionId: ByteArray) {
        /** Four bytes of the session id, mixed into every nonce and AAD. */
        val sessionTag: ByteArray get() = sessionId.copyOfRange(0, 4)
    }

    // --- protected records --------------------------------------------------

    fun sealRecord(type: Int, key: SessionKeys, sequence: Long, plaintext: ByteArray, offset: Long = 0L): ByteArray {
        val nonce = nonceFor(key.sessionTag, sequence)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key.sendKey, "AES"), GCMParameterSpec(128, nonce))
        cipher.updateAAD(aadFor(type, key.sessionTag, sequence, offset))
        val body = cipher.doFinal(plaintext)
        return frame(type, ByteBuffer.allocate(8 + body.size).order(ByteOrder.BIG_ENDIAN).putLong(sequence).put(body).array())
    }

    fun openRecord(type: Int, key: SessionKeys, expectedSequence: Long, payload: ByteArray, offset: Long = 0L): Pair<Long, ByteArray> {
        if (payload.size < 8) throw ProtocolException(Failure.MALFORMED_FRAME, "record is missing its sequence")
        val buffer = ByteBuffer.wrap(payload).order(ByteOrder.BIG_ENDIAN)
        val sequence = buffer.long
        if (sequence < expectedSequence) throw ProtocolException(Failure.REPLAY, "record $sequence is older than $expectedSequence")
        if (sequence > expectedSequence) throw ProtocolException(Failure.OUT_OF_ORDER, "gap: expected $expectedSequence, got $sequence")
        val nonce = nonceFor(key.sessionTag, sequence)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key.receiveKey, "AES"), GCMParameterSpec(128, nonce))
        cipher.updateAAD(aadFor(type, key.sessionTag, sequence, offset))
        val body = try {
            cipher.doFinal(payload, 8, payload.size - 8)
        } catch (failure: java.security.GeneralSecurityException) {
            throw ProtocolException(Failure.TAMPERED, "record $sequence did not authenticate")
        }
        return sequence to body
    }

    private fun nonceFor(sessionTag: ByteArray, sequence: Long): ByteArray =
        ByteBuffer.allocate(12).order(ByteOrder.BIG_ENDIAN).put(sessionTag).putLong(sequence).array()

    private fun aadFor(type: Int, sessionTag: ByteArray, sequence: Long, offset: Long): ByteArray =
        ByteBuffer.allocate(21).order(ByteOrder.BIG_ENDIAN)
            .put(type.toByte()).put(sessionTag).putLong(sequence).putLong(offset).array()

    // --- clear control payloads --------------------------------------------

    fun offerPayload(offer: Offer): ByteArray {
        val name = offer.fileName.toByteArray(Charsets.UTF_8).take(MAX_NAME_BYTES).toByteArray()
        val id = offer.packageIdHex.toByteArray(Charsets.UTF_8).take(64).toByteArray()
        val digest = offer.digestHex.toByteArray(Charsets.UTF_8).take(64).toByteArray()
        return ByteArrayOutputStream().apply {
            write(intBytes(id.size)); write(id)
            write(intBytes(name.size)); write(name)
            write(longBytes(offer.totalBytes))
            write(longBytes(offer.offset))
            write(intBytes(digest.size)); write(digest)
        }.toByteArray()
    }

    fun parseOffer(payload: ByteArray): Offer {
        var offset = 0
        fun int(): Int {
            if (offset + 4 > payload.size) throw ProtocolException(Failure.MALFORMED_FRAME, "offer truncated")
            val value = ByteBuffer.wrap(payload, offset, 4).order(ByteOrder.BIG_ENDIAN).int
            offset += 4
            return value
        }
        fun longValue(): Long {
            if (offset + 8 > payload.size) throw ProtocolException(Failure.MALFORMED_FRAME, "offer truncated")
            val value = ByteBuffer.wrap(payload, offset, 8).order(ByteOrder.BIG_ENDIAN).long
            offset += 8
            return value
        }
        fun text(): String {
            val length = int()
            if (length < 0 || offset + length > payload.size) throw ProtocolException(Failure.MALFORMED_FRAME, "offer field length is implausible")
            val value = String(payload, offset, length, Charsets.UTF_8)
            offset += length
            return value
        }
        val packageId = text()
        val name = text()
        val total = longValue()
        val resume = longValue()
        val digest = text()
        if (total < 0 || resume < 0 || resume > total) {
            throw ProtocolException(Failure.SIZE_MISMATCH, "offer declares offset $resume beyond total $total")
        }
        return Offer(packageId, name, total, resume, digest)
    }

    fun acceptPayload(offset: Long): ByteArray = longBytes(offset)

    fun parseOffset(payload: ByteArray): Long {
        if (payload.size != 8) throw ProtocolException(Failure.MALFORMED_FRAME, "accept payload must be one length")
        return ByteBuffer.wrap(payload).order(ByteOrder.BIG_ENDIAN).long
    }

    fun endPayload(totalBytes: Long, digestHex: String): ByteArray {
        val digest = digestHex.toByteArray(Charsets.UTF_8).take(64).toByteArray()
        return longBytes(totalBytes) + intBytes(digest.size) + digest
    }

    fun parseEnd(payload: ByteArray): Pair<Long, String> {
        if (payload.size < 12) throw ProtocolException(Failure.MALFORMED_FRAME, "end frame is truncated")
        val total = ByteBuffer.wrap(payload, 0, 8).order(ByteOrder.BIG_ENDIAN).long
        val length = ByteBuffer.wrap(payload, 8, 4).order(ByteOrder.BIG_ENDIAN).int
        if (length < 0 || 12 + length > payload.size) throw ProtocolException(Failure.MALFORMED_FRAME, "end digest length is implausible")
        return total to String(payload, 12, length, Charsets.UTF_8)
    }

    fun errorPayload(failure: Failure): ByteArray =
        failure.name.toByteArray(Charsets.UTF_8).take(48).toByteArray()

    fun newSessionId(random: SecureRandom = SecureRandom()): ByteArray =
        ByteArray(SESSION_ID_BYTES).also(random::nextBytes)

    private fun intBytes(value: Int): ByteArray = ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(value).array()
    private fun longBytes(value: Long): ByteArray = ByteBuffer.allocate(8).order(ByteOrder.BIG_ENDIAN).putLong(value).array()
    private fun shortBytes(value: Int): ByteArray = ByteBuffer.allocate(2).order(ByteOrder.BIG_ENDIAN).putShort(value.toShort()).array()
}
