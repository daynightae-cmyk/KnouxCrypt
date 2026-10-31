package com.knoux.crypt.security

import java.io.ByteArrayInputStream
import java.io.EOFException
import java.io.IOException

enum class PackageFormat { KNF1, KNF2, KNP1, KNP2, UNKNOWN }

enum class PackageStructuralState { VALID_HEADER, MALFORMED, TRUNCATED, UNSUPPORTED }

/**
 * Non-secret metadata extracted from a ciphertext header.
 *
 * [authenticated] is always false here: without the matching key/passphrase the
 * inspector cannot verify AEAD tags. A VALID_HEADER result proves only that the
 * header is structurally well-formed and bounded, not that the package is fit or
 * authentic. No plaintext is decrypted.
 */
data class PackageReport(
    val format: PackageFormat,
    val state: PackageStructuralState,
    val version: Int? = null,
    val keySource: String? = null,
    val kdf: String? = null,
    val iterations: Int? = null,
    val memoryKib: Int? = null,
    val parallelism: Int? = null,
    val salt: ByteArray? = null,
    val nonce: ByteArray? = null,
    val wrappedKeyBytes: Int? = null,
    val chunkSize: Int? = null,
    val plaintextLength: Long? = null,
    val headerBytes: Int? = null,
    val payloadBytes: Int? = null,
    val notes: List<String> = emptyList(),
) {
    val authenticated: Boolean get() = false
}

/** Bounded header parser for KNF1/KNF2 and KNP1/KNP2. Never derives or uses a key. */
class PackageInspector {
    companion object {
        const val MAX_INSPECT_BYTES = 8 * 1024
    }

    fun inspect(bytes: ByteArray): PackageReport {
        if (bytes.size < 4) {
            return PackageReport(PackageFormat.UNKNOWN, PackageStructuralState.TRUNCATED)
        }
        val magic = String(bytes, 0, 4, Charsets.US_ASCII)
        return try {
            when (magic) {
                "KNF1", "KNF2" -> inspectKnf(bytes)
                "KNP1", "KNP2" -> inspectKnp(bytes)
                else -> PackageReport(
                    PackageFormat.UNKNOWN,
                    PackageStructuralState.UNSUPPORTED,
                    notes = listOf("Unknown magic; expected KNF1/KNF2/KNP1/KNP2."),
                )
            }
        } catch (_: EOFException) {
            PackageReport(formatForMagic(magic), PackageStructuralState.TRUNCATED)
        } catch (_: UnsupportedContainerException) {
            PackageReport(formatForMagic(magic), PackageStructuralState.UNSUPPORTED)
        } catch (_: IOException) {
            PackageReport(formatForMagic(magic), PackageStructuralState.TRUNCATED)
        } catch (_: IllegalArgumentException) {
            PackageReport(formatForMagic(magic), PackageStructuralState.MALFORMED)
        }
    }

    private fun inspectKnf(bytes: ByteArray): PackageReport {
        val header = FileEnvelope().readHeader(ByteArrayInputStream(bytes))
        val format = if (header.version == 2) PackageFormat.KNF2 else PackageFormat.KNF1
        val kdf = when {
            header.kdfParams != null -> "PBKDF2-HMAC-SHA256"
            else -> "None (device-key/wrapped)"
        }
        return PackageReport(
            format = format,
            state = PackageStructuralState.VALID_HEADER,
            version = header.version,
            keySource = header.keySource.name,
            kdf = kdf,
            iterations = header.kdfParams?.iterations,
            salt = header.kdfParams?.salt,
            chunkSize = header.chunkSize,
            plaintextLength = header.plaintextLength,
            headerBytes = header.raw.size,
            payloadBytes = (bytes.size - header.raw.size).coerceAtLeast(0),
            wrappedKeyBytes = header.wrappedFileKey?.size,
            notes = buildList {
                add("Header parsed; payload authenticity requires the matching key.")
                if (header.keySource == FileEnvelope.KeySource.DEVICE_WRAPPED) {
                    add("KNF2 carries a root-wrapped per-file DEK.")
                }
                if (bytes.size >= MAX_INSPECT_BYTES) {
                    add("Only the first ${MAX_INSPECT_BYTES} bytes were supplied; payload length may be partial.")
                }
            },
        )
    }

    private fun inspectKnp(bytes: ByteArray): PackageReport {
        val info = PassphraseEnvelope().inspect(bytes)
        val format = if (info.version == 2) PackageFormat.KNP2 else PackageFormat.KNP1
        val kdf = if (info.kdf == 2) "Argon2id" else "PBKDF2-HMAC-SHA256"
        return PackageReport(
            format = format,
            state = PackageStructuralState.VALID_HEADER,
            version = info.version,
            keySource = "PASSPHRASE",
            kdf = kdf,
            iterations = info.iterations,
            memoryKib = info.memoryKib,
            parallelism = info.parallelism,
            salt = info.salt,
            nonce = info.nonce,
            headerBytes = info.headerBytes,
            payloadBytes = info.payloadBytes,
            notes = buildList {
                add("Header parsed; passphrase-derived authenticity is not verified here.")
                if (bytes.size >= MAX_INSPECT_BYTES) {
                    add("Only the first ${MAX_INSPECT_BYTES} bytes were supplied.")
                }
            },
        )
    }

    private fun formatForMagic(magic: String): PackageFormat = when (magic) {
        "KNF1" -> PackageFormat.KNF1
        "KNF2" -> PackageFormat.KNF2
        "KNP1" -> PackageFormat.KNP1
        "KNP2" -> PackageFormat.KNP2
        else -> PackageFormat.UNKNOWN
    }
}
