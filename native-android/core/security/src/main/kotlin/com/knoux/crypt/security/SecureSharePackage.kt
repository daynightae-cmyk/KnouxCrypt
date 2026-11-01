package com.knoux.crypt.security

import java.io.ByteArrayOutputStream
import java.io.EOFException
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.GeneralSecurityException
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * KSR1 — the versioned, authenticated, multi-recipient share package (TASK 16).
 *
 * Layout, all integers big-endian and no padding:
 *
 * ```
 * offset  field                bytes  meaning
 * 0       magic                4      "KSR1"
 * 4       version              1      = 1
 * 5       kem                  1      = 1 (X25519 + HKDF-SHA-256)
 * 6       cipher               1      = 1 (AES-256-GCM)
 * 7       recipientCount       1      N, 1..8
 * 8       packageId            16     random, clear, binds every context string
 * 24      salt                 32     HKDF salt, one per package
 * 56      keyIds               8*N    selector = first 8 bytes of SHA-256(SPKI)
 *         encapsulations       92*N   ephemeral public (32) | IV (12) | wrapped CEK (32) | tag (16)
 *         createdAt            8      epoch millis
 *         expiresAt            8      epoch millis, 0 = no expiry label
 *         metadata IV          12
 *         metadata length      2      length of the encrypted metadata block
 *         metadata             var    CEK-encrypted, CEK-authenticated
 *         payload base nonce   12
 *         chunk size           4
 *         plaintext length     8
 *         chunks               ...    ceil(len/chunk) * (chunk + 16)
 * ```
 *
 * One random content key (CEK) encrypts the payload and the metadata. It is
 * wrapped separately for every recipient with a fresh ephemeral X25519 key pair,
 * so each recipient has its own encapsulation and its own derived key. The header
 * prefix is authenticated as AAD on every wrap, the header up to the metadata
 * length on the metadata block, and the complete header plus chunk index and
 * final flag on every payload chunk. Nothing is returned before an AEAD tag
 * verifies; a package that fails authentication is reported, never repaired.
 *
 * JVM-tested with known-answer vectors. NOT audited and NOT device-verified.
 */
class SecureSharePackage(private val random: SecureRandom = SecureRandom()) {

    companion object {
        const val VERSION = 1
        const val KEM_X25519_HKDF_SHA256 = 1
        const val CIPHER_AES_256_GCM = 1

        const val MAGIC_BYTES = 4
        const val PACKAGE_ID_BYTES = 16
        const val SALT_BYTES = ShareKdf.SALT_BYTES
        const val KEY_ID_BYTES = RecipientKey.KEY_ID_BYTES
        const val EPHEMERAL_BYTES = RecipientKey.RAW_KEY_BYTES
        const val CEK_BYTES = ShareKdf.KEY_BYTES
        const val NONCE_BYTES = 12
        const val TAG_BYTES = 16
        const val ENCAPSULATION_BYTES = EPHEMERAL_BYTES + NONCE_BYTES + CEK_BYTES + TAG_BYTES
        const val MIN_RECIPIENTS = 1
        const val MAX_RECIPIENTS = 8
        const val MAX_METADATA_BYTES = 4 * 1024
        const val DEFAULT_CHUNK_SIZE = FileEnvelope.DEFAULT_CHUNK_SIZE
        const val MAX_CHUNK_SIZE = FileEnvelope.MAX_CHUNK_SIZE
        const val MAX_PACKAGE_BYTES = 512L * 1024 * 1024

        private val MAGIC = byteArrayOf(0x4b, 0x53, 0x52, 0x31) // KSR1
        private const val FLAGS_OFFSET = MAGIC_BYTES
        private const val PACKAGE_ID_OFFSET = FLAGS_OFFSET + 4
        private const val SALT_OFFSET = PACKAGE_ID_OFFSET + PACKAGE_ID_BYTES
        private const val KEY_ID_OFFSET = SALT_OFFSET + SALT_BYTES
        private const val TAIL_BYTES = NONCE_BYTES + 4 + 8

        private fun encapsulationOffset(count: Int) = KEY_ID_OFFSET + KEY_ID_BYTES * count
        private fun createdAtOffset(count: Int) = encapsulationOffset(count) + ENCAPSULATION_BYTES * count
        private fun expiresAtOffset(count: Int) = createdAtOffset(count) + 8
        private fun metadataNonceOffset(count: Int) = expiresAtOffset(count) + 8
        private fun metadataLengthOffset(count: Int) = metadataNonceOffset(count) + NONCE_BYTES
        private fun payloadOffset(metadataLength: Int, count: Int) =
            metadataLengthOffset(count) + 2 + metadataLength
    }

    /** Everything a reader can see without holding any key. */
    data class Summary(
        val version: Int,
        val kem: Int,
        val cipher: Int,
        val recipientCount: Int,
        val packageIdHex: String,
        val recipientKeyIds: List<String>,
        val createdAt: Long,
        val expiresAt: Long?,
        val metadataLength: Int,
        val plaintextLength: Long,
        val chunkSize: Int,
    )

    enum class Verdict { OPENED, EXPIRED, RECIPIENT_MISMATCH, TAMPERED, UNSUPPORTED }

    data class OpenResult(
        val verdict: Verdict,
        val summary: Summary?,
        val metadata: ByteArray?,
        val plaintextBytes: Long,
        val detail: String,
    ) {
        val isOpen: Boolean get() = verdict == Verdict.OPENED
        val isExpired: Boolean get() = verdict == Verdict.EXPIRED
    }

    /**
     * Seals [input] to [recipients]. The caller chooses the list, so a sender copy
     * is an ordinary extra entry rather than a hidden behaviour. [metadata] is
     * encrypted and authenticated and never appears in the clear header.
     */
    fun seal(
        input: InputStream,
        output: OutputStream,
        recipients: List<RecipientKey>,
        metadata: ByteArray,
        plaintextLength: Long,
        createdAt: Long,
        expiresAt: Long?,
        chunkSize: Int = DEFAULT_CHUNK_SIZE,
        onProgress: (FileEnvelope.Progress) -> Unit = {},
    ): Summary {
        require(recipients.isNotEmpty()) { "At least one recipient is required" }
        if (recipients.size > MAX_RECIPIENTS) {
            throw UnsupportedContainerException("A package carries at most $MAX_RECIPIENTS recipients")
        }
        require(metadata.isNotEmpty() && metadata.size <= MAX_METADATA_BYTES) {
            "Share metadata must fit in $MAX_METADATA_BYTES bytes"
        }
        require(plaintextLength in 0..MAX_PACKAGE_BYTES) { "Plaintext length is out of range" }
        require(chunkSize in 1024..MAX_CHUNK_SIZE) { "Chunk size out of bounds" }
        require(createdAt > 0) { "Creation time is required" }
        require(expiresAt == null || expiresAt > createdAt) { "The expiry label must be after creation" }
        if (recipients.map { it.keyIdHex }.distinct().size != recipients.size) {
            throw UnsupportedContainerException("The same recipient key appears twice in the list")
        }
        val count = recipients.size
        val packageId = ByteArray(PACKAGE_ID_BYTES).also(random::nextBytes)
        val salt = ByteArray(SALT_BYTES).also(random::nextBytes)
        val cek = ByteArray(CEK_BYTES).also(random::nextBytes)
        try {
            // 1. Prefix: everything the key wraps are bound to.
            val prefix = ByteArrayOutputStream().apply {
                write(MAGIC)
                write(byteArrayOf(VERSION.toByte(), KEM_X25519_HKDF_SHA256.toByte(), CIPHER_AES_256_GCM.toByte()))
                write(count)
                write(packageId)
                write(salt)
                recipients.forEach { write(it.keyId) }
            }.toByteArray()

            // 2. One fresh encapsulation per recipient.
            val encapsulations = ByteArrayOutputStream()
            recipients.forEachIndexed { index, recipient ->
                val ephemeral = ShareKeyPair.generate(random)
                val kek = ShareKdf.hkdfSha256(
                    ikm = ephemeral.sharedSecret(recipient),
                    salt = salt,
                    info = ShareKdf.kekInfo(index, recipient.keyId),
                )
                val nonce = ByteArray(NONCE_BYTES).also(random::nextBytes)
                encapsulations.write(ephemeral.public.parameters.encoded)
                encapsulations.write(nonce)
                encapsulations.write(sealAead(kek, nonce, cek, prefix + kekAadSuffix(index)))
            }

            // 3. Metadata, authenticated under the CEK with the header so far.
            val metadataNonce = ByteArray(NONCE_BYTES).also(random::nextBytes)
            val throughMetadataLength = ByteArrayOutputStream().apply {
                write(prefix)
                write(encapsulations.toByteArray())
                write(longBytes(createdAt))
                write(longBytes(expiresAt ?: 0L))
                write(metadataNonce)
                write(shortBytes(metadata.size + TAG_BYTES))
            }.toByteArray()
            val metadataCipher = sealAead(
                key = cek,
                nonce = metadataNonce,
                plaintext = metadata,
                associatedData = throughMetadataLength,
            )

            // 4. Payload framing, then the chunks.
            val baseNonce = ByteArray(NONCE_BYTES).also(random::nextBytes)
            val header = throughMetadataLength + metadataCipher + baseNonce +
                intBytes(chunkSize) + longBytes(plaintextLength)
            output.write(header)
            writeChunks(
                input = input,
                output = output,
                key = cek,
                header = header,
                baseNonce = baseNonce,
                chunkSize = chunkSize,
                length = plaintextLength,
                packageId = packageId,
                decrypting = false,
                onProgress = onProgress,
            )
            return summaryOf(header)
        } finally {
            cek.fill(0)
        }
    }

    /**
     * Opens a package with [identity] and writes the payload to [output].
     * [nowMillis] is supplied by the caller so the expiry decision is explicit and
     * testable. Any partial output on failure is the caller's to discard.
     */
    fun open(
        input: InputStream,
        output: OutputStream,
        identity: ShareKeyPair,
        nowMillis: Long,
        onProgress: (FileEnvelope.Progress) -> Unit = {},
    ): OpenResult {
        val framing = try {
            readFraming(input)
        } catch (failure: UnsupportedContainerException) {
            return OpenResult(Verdict.UNSUPPORTED, null, null, 0L, failure.readableMessage())
        } catch (failure: IOException) {
            return OpenResult(Verdict.UNSUPPORTED, null, null, 0L, "The package header is truncated")
        }
        val (header, summary) = framing
        val count = summary.recipientCount
        val ourKeyId = identity.public.keyId
        val ourKeyIdHex = RecipientKey.hex(ourKeyId)
        val index = summary.recipientKeyIds.indexOf(ourKeyIdHex)
        if (index < 0) {
            return OpenResult(
                verdict = Verdict.RECIPIENT_MISMATCH,
                summary = summary,
                metadata = null,
                plaintextBytes = 0L,
                detail = "Sealed for ${summary.recipientKeyIds.joinToString()}; this identity is $ourKeyIdHex",
            )
        }
        val salt = header.copyOfRange(SALT_OFFSET, SALT_OFFSET + SALT_BYTES)
        val packageId = header.copyOfRange(PACKAGE_ID_OFFSET, PACKAGE_ID_OFFSET + PACKAGE_ID_BYTES)
        val encapsulation = header.copyOfRange(
            encapsulationOffset(count) + index * ENCAPSULATION_BYTES,
            encapsulationOffset(count) + (index + 1) * ENCAPSULATION_BYTES,
        )
        val prefixLength = encapsulationOffset(count)
        val metadataAadLength = metadataLengthOffset(count) + 2

        val cek = try {
            val ephemeralPublic = RecipientKey.fromSpki(
                x25519Spki(encapsulation.copyOfRange(0, EPHEMERAL_BYTES)),
            )
            val kek = ShareKdf.hkdfSha256(
                ikm = identity.sharedSecret(ephemeralPublic),
                salt = salt,
                info = ShareKdf.kekInfo(index, ourKeyId),
            )
            openAead(
                key = kek,
                nonce = encapsulation.copyOfRange(EPHEMERAL_BYTES, EPHEMERAL_BYTES + NONCE_BYTES),
                ciphertext = encapsulation.copyOfRange(EPHEMERAL_BYTES + NONCE_BYTES, encapsulation.size),
                associatedData = header.copyOfRange(0, prefixLength) + kekAadSuffix(index),
            )
        } catch (failure: GeneralSecurityException) {
            return OpenResult(Verdict.TAMPERED, summary, null, 0L, "The content key did not authenticate")
        } catch (failure: IllegalArgumentException) {
            return OpenResult(Verdict.TAMPERED, summary, null, 0L, "The encapsulation is malformed")
        }

        val metadataStart = metadataLengthOffset(count) + 2
        val metadata = try {
            openAead(
                key = cek,
                nonce = header.copyOfRange(metadataNonceOffset(count), metadataNonceOffset(count) + NONCE_BYTES),
                ciphertext = header.copyOfRange(metadataStart, metadataStart + summary.metadataLength),
                associatedData = header.copyOfRange(0, metadataAadLength),
            )
        } catch (failure: GeneralSecurityException) {
            cek.fill(0)
            return OpenResult(Verdict.TAMPERED, summary, null, 0L, "The share metadata did not authenticate")
        }

        if (summary.expiresAt != null && nowMillis > summary.expiresAt) {
            cek.fill(0)
            return OpenResult(Verdict.EXPIRED, summary, metadata, 0L, "The expiry label has passed")
        }

        return try {
            val baseNonceOffset = payloadOffset(summary.metadataLength, count)
            val written = writeChunks(
                input = input,
                output = output,
                key = cek,
                header = header,
                baseNonce = header.copyOfRange(baseNonceOffset, baseNonceOffset + NONCE_BYTES),
                chunkSize = summary.chunkSize,
                length = summary.plaintextLength,
                packageId = packageId,
                decrypting = true,
                onProgress = onProgress,
            )
            OpenResult(Verdict.OPENED, summary, metadata, written, "Opened")
        } catch (failure: TamperedFileException) {
            OpenResult(Verdict.TAMPERED, summary, metadata, 0L, failure.readableMessage())
        } catch (failure: IOException) {
            OpenResult(Verdict.TAMPERED, summary, metadata, 0L, "The package stream ended early")
        } finally {
            cek.fill(0)
        }
    }

    /** Reads the framing without any key, for the honest "what is this?" display. */
    fun summarize(input: InputStream): Summary = readFraming(input).summary

    // --- internals ----------------------------------------------------------

    private data class Framing(val header: ByteArray, val summary: Summary)

    /** Reads exactly the header, leaving the payload chunks in the stream. */
    private fun readFraming(input: InputStream): Framing {
        val sink = ByteArrayOutputStream()
        fun take(count: Int): ByteArray {
            val buffer = ByteArray(count)
            if (readFully(input, buffer, count) != count) throw EOFException("Package header is truncated")
            sink.write(buffer)
            return buffer
        }
        val magic = take(MAGIC_BYTES)
        if (!magic.contentEquals(MAGIC)) throw UnsupportedContainerException("Not a KSR1 share package")
        val flags = take(4)
        val version = flags[0].toInt() and 0xff
        if (version != VERSION) throw UnsupportedContainerException("Unsupported KSR version $version")
        val kem = flags[1].toInt() and 0xff
        if (kem != KEM_X25519_HKDF_SHA256) throw UnsupportedContainerException("Unsupported key encapsulation mode $kem")
        val cipher = flags[2].toInt() and 0xff
        if (cipher != CIPHER_AES_256_GCM) throw UnsupportedContainerException("Unsupported cipher $cipher")
        val count = flags[3].toInt() and 0xff
        if (count !in MIN_RECIPIENTS..MAX_RECIPIENTS) {
            throw UnsupportedContainerException("Recipient count $count is out of range")
        }
        take(PACKAGE_ID_BYTES + SALT_BYTES + KEY_ID_BYTES * count)
        take(ENCAPSULATION_BYTES * count)
        take(8 + 8 + NONCE_BYTES)
        val metadataLength = ByteBuffer.wrap(take(2)).order(ByteOrder.BIG_ENDIAN).short.toInt() and 0xffff
        if (metadataLength !in 1 + TAG_BYTES..MAX_METADATA_BYTES + TAG_BYTES) {
            throw UnsupportedContainerException("Metadata block length is out of range")
        }
        take(metadataLength)
        take(TAIL_BYTES)
        val header = sink.toByteArray()
        return Framing(header, summaryOf(header))
    }

    /** Parses the framing that [readFraming] collected, or that [seal] just built. */
    private fun summaryOf(header: ByteArray): Summary {
        val count = header[FLAGS_OFFSET + 3].toInt() and 0xff
        if (count !in MIN_RECIPIENTS..MAX_RECIPIENTS) throw UnsupportedContainerException("Recipient count out of range")
        if (header.size < payloadOffset(0, count) + TAIL_BYTES) {
            throw UnsupportedContainerException("Package header is too short")
        }
        val packageId = header.copyOfRange(PACKAGE_ID_OFFSET, PACKAGE_ID_OFFSET + PACKAGE_ID_BYTES)
        val keyIds = (0 until count).map { index ->
            val start = KEY_ID_OFFSET + index * KEY_ID_BYTES
            RecipientKey.hex(header.copyOfRange(start, start + KEY_ID_BYTES))
        }
        val tail = ByteBuffer.wrap(header, createdAtOffset(count), header.size - createdAtOffset(count))
            .order(ByteOrder.BIG_ENDIAN)
        val createdAt = tail.long
        val expiresAt = tail.long
        tail.position(tail.position() + NONCE_BYTES)
        val metadataLength = tail.short.toInt() and 0xffff
        tail.position(tail.position() + metadataLength)
        val baseNonce = ByteArray(NONCE_BYTES)
        tail.get(baseNonce)
        val chunkSize = tail.int
        val plaintextLength = tail.long
        if (chunkSize !in 1024..MAX_CHUNK_SIZE) throw UnsupportedContainerException("Chunk size out of bounds")
        if (plaintextLength < 0 || plaintextLength > MAX_PACKAGE_BYTES) {
            throw UnsupportedContainerException("Declared length is out of range")
        }
        if (metadataLength !in 1 + TAG_BYTES..MAX_METADATA_BYTES + TAG_BYTES) {
            throw UnsupportedContainerException("Metadata block length is out of range")
        }
        if (header.size != payloadOffset(metadataLength, count) + TAIL_BYTES) {
            throw UnsupportedContainerException("Package header framing is inconsistent")
        }
        return Summary(
            version = header[FLAGS_OFFSET].toInt() and 0xff,
            kem = header[FLAGS_OFFSET + 1].toInt() and 0xff,
            cipher = header[FLAGS_OFFSET + 2].toInt() and 0xff,
            recipientCount = count,
            packageIdHex = RecipientKey.hex(packageId),
            recipientKeyIds = keyIds,
            createdAt = createdAt,
            expiresAt = expiresAt.takeIf { it != 0L },
            metadataLength = metadataLength,
            plaintextLength = plaintextLength,
            chunkSize = chunkSize,
        )
    }

    private fun writeChunks(
        input: InputStream,
        output: OutputStream,
        key: ByteArray,
        header: ByteArray,
        baseNonce: ByteArray,
        chunkSize: Int,
        length: Long,
        packageId: ByteArray,
        decrypting: Boolean,
        onProgress: (FileEnvelope.Progress) -> Unit,
    ): Long {
        val keySpec = SecretKeySpec(key, "AES")
        val context = ShareKdf.payloadContext(RecipientKey.hex(packageId))
        val totalChunks = if (length == 0L) 1 else (((length - 1) / chunkSize) + 1).toInt()
        val buffer = ByteArray(chunkSize)
        var processed = 0L
        for (index in 0 until totalChunks) {
            val remaining = length - processed
            val plainSize = if (remaining > chunkSize) chunkSize else remaining.toInt()
            val aad = header + context +
                ByteBuffer.allocate(5).order(ByteOrder.BIG_ENDIAN)
                    .putInt(index)
                    .put(if (index == totalChunks - 1) 1 else 0)
                    .array()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            val nonce = nonceFor(baseNonce, index)
            if (decrypting) {
                val encrypted = ByteArray(plainSize + TAG_BYTES)
                if (readFully(input, encrypted, encrypted.size) != encrypted.size) {
                    throw TamperedFileException("Chunk $index is missing")
                }
                cipher.init(Cipher.DECRYPT_MODE, keySpec, GCMParameterSpec(TAG_BYTES * 8, nonce))
                cipher.updateAAD(aad)
                val plain = try {
                    cipher.doFinal(encrypted)
                } catch (failure: GeneralSecurityException) {
                    throw TamperedFileException("Chunk $index failed authentication", failure)
                }
                output.write(plain)
                processed += plain.size
            } else {
                val read = readFully(input, buffer, plainSize)
                if (read != plainSize) throw EOFException("Input is shorter than the declared length")
                cipher.init(Cipher.ENCRYPT_MODE, keySpec, GCMParameterSpec(TAG_BYTES * 8, nonce))
                cipher.updateAAD(aad)
                output.write(cipher.doFinal(buffer, 0, plainSize))
                processed += plainSize
            }
            onProgress(FileEnvelope.Progress(processed, length))
        }
        if (!decrypting && input.read() != -1) throw IOException("Input exceeds the declared length")
        output.flush()
        return processed
    }

    private fun sealAead(key: ByteArray, nonce: ByteArray, plaintext: ByteArray, associatedData: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BYTES * 8, nonce))
        cipher.updateAAD(associatedData)
        return cipher.doFinal(plaintext)
    }

    private fun openAead(key: ByteArray, nonce: ByteArray, ciphertext: ByteArray, associatedData: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BYTES * 8, nonce))
        cipher.updateAAD(associatedData)
        return cipher.doFinal(ciphertext)
    }

    private fun nonceFor(base: ByteArray, index: Int): ByteArray {
        val nonce = base.copyOf()
        val counter = ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(index).array()
        for (offset in 0 until 4) {
            nonce[NONCE_BYTES - 4 + offset] =
                (nonce[NONCE_BYTES - 4 + offset].toInt() xor counter[offset].toInt()).toByte()
        }
        return nonce
    }

    private fun kekAadSuffix(index: Int): ByteArray = "KSR1-KEK-$index".toByteArray(Charsets.UTF_8)

    private fun readFully(input: InputStream, buffer: ByteArray, length: Int): Int {
        var total = 0
        while (total < length) {
            val read = input.read(buffer, total, length - total)
            if (read < 0) break
            if (read == 0) continue
            total += read
        }
        return total
    }

    private fun longBytes(value: Long): ByteArray =
        ByteBuffer.allocate(8).order(ByteOrder.BIG_ENDIAN).putLong(value).array()

    private fun intBytes(value: Int): ByteArray =
        ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(value).array()

    private fun shortBytes(value: Int): ByteArray =
        ByteBuffer.allocate(2).order(ByteOrder.BIG_ENDIAN).putShort(value.toShort()).array()
}

private fun Throwable.readableMessage(): String = message?.takeIf { it.isNotBlank() } ?: javaClass.simpleName
