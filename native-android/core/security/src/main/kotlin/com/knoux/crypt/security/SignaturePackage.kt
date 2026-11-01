package com.knoux.crypt.security

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Versioned signature packages for the Signature Studio (TASK 38).
 *
 * Two containers share one framing:
 *
 * ```
 * magic            4      "KSG1" detached · "KSA1" attached
 * version          1      = 1
 * algorithm id     1      1 = SHA256withECDSA · 2 = SHA256withRSA
 * digest mode      1      1 = the signature covers SHA-256(content)
 * content kind     1      1 = detached · 2 = attached
 * spki length      2      + SPKI bytes
 * signature length 2      + signature bytes
 * metadata length  2      + metadata bytes (caller-defined JSON)
 * content          …      attached packages only, raw and unencrypted
 * ```
 *
 * The digest mode is recorded rather than implied. KNOUX signs the SHA-256 digest
 * of the content with `SHA256withECDSA`, which is **not** the same as a standard
 * signature over the raw file, and a verifier that assumed otherwise would
 * silently reject valid packages or accept the wrong ones. A future standard mode
 * can be added as a new id without reinterpreting existing bytes.
 *
 * An attached package carries the document in the clear: it proves origin and
 * integrity, it does not hide anything. A detached package holds only the
 * signature, the key and the metadata, so the document never has to travel with
 * it. Nothing here encrypts, and nothing here can export a private key.
 */
object SignaturePackage {
    const val VERSION = 1

    /** The signature covers SHA-256(content) — the TASK 19 convention, readable but not written. */
    const val DIGEST_MODE_SHA256_OF_CONTENT = 1

    /**
     * The signature covers `SHA-256(content) ‖ SHA-256(metadata)`, so the package
     * metadata — file name, size, claimed digest — cannot be rewritten without
     * breaking the signature. This is what KSG1/KSA1 write.
     */
    const val DIGEST_MODE_BOUND_METADATA = 2

    const val ALGORITHM_ECDSA_ID = 1
    const val ALGORITHM_RSA_ID = 2
    const val KIND_DETACHED = 1
    const val KIND_ATTACHED = 2

    const val MAX_SPKI_BYTES = 4 * 1024
    const val MAX_SIGNATURE_BYTES = 8 * 1024
    const val MAX_METADATA_BYTES = 4 * 1024
    const val MAX_CONTENT_BYTES = 64L * 1024 * 1024

    private val MAGIC_DETACHED = byteArrayOf(0x4b, 0x53, 0x47, 0x31) // KSG1
    private val MAGIC_ATTACHED = byteArrayOf(0x4b, 0x53, 0x41, 0x31) // KSA1
    private const val HEADER_BYTES = 4 + 1 + 1 + 1 + 1 + 2

    class UnsupportedPackageException(message: String, cause: Throwable? = null) : IOException(message, cause)
    class MalformedPackageException(message: String, cause: Throwable? = null) : IOException(message, cause)

    data class Contents(
        val attached: Boolean,
        val algorithm: String,
        val digestMode: Int,
        val publicKeySpki: ByteArray,
        val signature: ByteArray,
        val metadata: ByteArray,
        val content: ByteArray?,
    ) {
        val signatureBase64: String get() = DigitalSignatureService.signatureToBase64(signature)
        val publicKeyBase64: String get() = java.util.Base64.getEncoder().encodeToString(publicKeySpki)

        /** The embedded key, or null when it is not a key this build can verify with. */
        fun publicKey(): java.security.PublicKey? = DigitalSignatureService.publicKeyFromBase64(publicKeyBase64)
    }

    /** True when the bytes start with a signature-package magic. */
    fun looksLike(bytes: ByteArray): Boolean {
        if (bytes.size < HEADER_BYTES) return false
        val magic = bytes.copyOfRange(0, 4)
        return magic.contentEquals(MAGIC_DETACHED) || magic.contentEquals(MAGIC_ATTACHED)
    }

    fun encode(
        attached: Boolean,
        algorithm: String,
        publicKeySpki: ByteArray,
        signature: ByteArray,
        metadata: ByteArray,
        content: ByteArray? = null,
        digestMode: Int = DIGEST_MODE_BOUND_METADATA,
    ): ByteArray {
        require(digestMode == DIGEST_MODE_BOUND_METADATA || digestMode == DIGEST_MODE_SHA256_OF_CONTENT) {
            "Unknown digest mode $digestMode"
        }
        val algorithmId = when (algorithm) {
            DigitalSignatureService.ALGORITHM_ECDSA -> ALGORITHM_ECDSA_ID
            DigitalSignatureService.ALGORITHM_RSA -> ALGORITHM_RSA_ID
            else -> throw UnsupportedPackageException("Unsupported signature algorithm $algorithm")
        }
        require(publicKeySpki.isNotEmpty() && publicKeySpki.size <= MAX_SPKI_BYTES) { "Public key length is out of range" }
        require(signature.isNotEmpty() && signature.size <= MAX_SIGNATURE_BYTES) { "Signature length is out of range" }
        require(metadata.isNotEmpty() && metadata.size <= MAX_METADATA_BYTES) { "Metadata length is out of range" }
        if (attached) {
            requireNotNull(content) { "An attached package must carry its content" }
            require(content.size.toLong() <= MAX_CONTENT_BYTES) { "Attached content is too large" }
        } else {
            require(content == null) { "A detached package must not carry content" }
        }
        return ByteArrayOutputStream().apply {
            write(if (attached) MAGIC_ATTACHED else MAGIC_DETACHED)
            write(VERSION)
            write(algorithmId)
            write(digestMode)
            write(if (attached) KIND_ATTACHED else KIND_DETACHED)
            write(shortBytes(publicKeySpki.size))
            write(publicKeySpki)
            write(shortBytes(signature.size))
            write(signature)
            write(shortBytes(metadata.size))
            write(metadata)
            if (attached && content != null) write(content)
        }.toByteArray()
    }

    /**
     * Parses a package without trusting any length it declares: every field is
     * checked against the bytes actually present before it is allocated, so a
     * hostile file cannot ask for a huge buffer.
     */
    fun decode(bytes: ByteArray): Contents {
        if (bytes.size < HEADER_BYTES) throw MalformedPackageException("Signature package is truncated")
        val magic = bytes.copyOfRange(0, 4)
        val attached = when {
            magic.contentEquals(MAGIC_ATTACHED) -> true
            magic.contentEquals(MAGIC_DETACHED) -> false
            else -> throw UnsupportedPackageException("Not a KNOUX signature package")
        }
        var offset = 4
        val version = bytes[offset].toInt() and 0xff
        offset += 1
        if (version != VERSION) throw UnsupportedPackageException("Unsupported signature package version $version")
        val algorithmId = bytes[offset].toInt() and 0xff
        offset += 1
        val digestMode = bytes[offset].toInt() and 0xff
        offset += 1
        val kind = bytes[offset].toInt() and 0xff
        offset += 1
        if (kind != (if (attached) KIND_ATTACHED else KIND_DETACHED)) {
            throw MalformedPackageException("The package kind contradicts its magic")
        }
        if (digestMode != DIGEST_MODE_SHA256_OF_CONTENT && digestMode != DIGEST_MODE_BOUND_METADATA) {
            throw UnsupportedPackageException("Unsupported digest mode $digestMode")
        }
        val algorithm = when (algorithmId) {
            ALGORITHM_ECDSA_ID -> DigitalSignatureService.ALGORITHM_ECDSA
            ALGORITHM_RSA_ID -> DigitalSignatureService.ALGORITHM_RSA
            else -> throw UnsupportedPackageException("Unsupported signature algorithm id $algorithmId")
        }
        val spki = readField(bytes, offset, MAX_SPKI_BYTES, "public key").also { offset = it.second }
        val signature = readField(bytes, offset, MAX_SIGNATURE_BYTES, "signature").also { offset = it.second }
        val metadata = readField(bytes, offset, MAX_METADATA_BYTES, "metadata").also { offset = it.second }
        val content = if (attached) {
            val remaining = bytes.size - offset
            if (remaining > MAX_CONTENT_BYTES) throw MalformedPackageException("Attached content is too large")
            bytes.copyOfRange(offset, bytes.size)
        } else {
            if (bytes.size != offset) throw MalformedPackageException("A detached package carries trailing bytes")
            null
        }
        return Contents(
            attached = attached,
            algorithm = algorithm,
            digestMode = digestMode,
            publicKeySpki = spki.first,
            signature = signature.first,
            metadata = metadata.first,
            content = content,
        )
    }

    private fun readField(bytes: ByteArray, from: Int, maximum: Int, name: String): Pair<ByteArray, Int> {
        if (from + 2 > bytes.size) throw MalformedPackageException("Signature package is truncated")
        val length = ByteBuffer.wrap(bytes, from, 2).order(ByteOrder.BIG_ENDIAN).short.toInt() and 0xffff
        if (length == 0 || length > maximum) throw MalformedPackageException("$name length is out of range")
        val start = from + 2
        val end = start + length
        if (end > bytes.size) throw MalformedPackageException("Signature package is truncated")
        return bytes.copyOfRange(start, end) to end
    }

    private fun shortBytes(value: Int): ByteArray =
        ByteBuffer.allocate(2).order(ByteOrder.BIG_ENDIAN).putShort(value.toShort()).array()

    /**
     * The exact bytes the signature is made over. Mode 1 signs the content
     * itself; mode 2 signs the two digests concatenated, which is what binds the
     * metadata to the signature. Both sides must call this same function, so a
     * verifier cannot be talked into checking a weaker binding than was signed.
     */
    fun binding(content: ByteArray, metadata: ByteArray, digestMode: Int): ByteArray = when (digestMode) {
        DIGEST_MODE_SHA256_OF_CONTENT -> content
        DIGEST_MODE_BOUND_METADATA -> Hashing.sha256(content) + Hashing.sha256(metadata)
        else -> throw UnsupportedPackageException("Unsupported digest mode $digestMode")
    }
}
