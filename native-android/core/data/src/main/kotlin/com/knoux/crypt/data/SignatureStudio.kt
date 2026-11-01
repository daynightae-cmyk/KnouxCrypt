package com.knoux.crypt.data

import com.knoux.crypt.security.DigitalSignatureService
import com.knoux.crypt.security.KeyFingerprint
import com.knoux.crypt.security.SignaturePackage
import java.security.PublicKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * The Signature Studio service (TASK 38).
 *
 * It does not contain a signing engine. Key creation, the choice between a
 * Keystore key and the encrypted software key, and the signature itself all come
 * from [SigningService] and [DigitalSignatureService] — the TASK 19 path — so a
 * file signed here verifies under exactly the same rules as a text signed there.
 *
 * What this class adds is the studio's own honesty: a report separates *the
 * signature is mathematically valid for these bytes* from *the key that made it is
 * one this vault holds and names*. A valid signature from an unknown key is
 * reported as valid and unrecognised, never as trusted.
 */
class SignatureStudio(
    private val signing: SigningService,
    private val repository: SecretRepository,
    private val session: SessionManager,
) {
    companion object {
        /** The studio signs whole files in memory; larger inputs are refused, never truncated. */
        const val MAX_CONTENT_BYTES = 32 * 1024 * 1024
        const val DETACHED_EXTENSION = "ksig"
        const val ATTACHED_EXTENSION = "ksa"
    }

    enum class Failure { LOCKED, TOO_LARGE, UNREADABLE, UNSUPPORTED }

    /** A signature package the studio produced, ready to write out. */
    data class Produced(
        val bytes: ByteArray,
        val attached: Boolean,
        val algorithm: String,
        val digestHex: String,
        val signerFingerprint: String,
        val origin: SigningKeyOrigin,
        val createdAt: Long,
        val receiptId: String,
    )

    sealed class SignOutcome {
        data class Sealed(val produced: Produced) : SignOutcome()
        data class Failed(val failure: Failure, val detail: String) : SignOutcome()
    }

    sealed class VerifyOutcome {
        data class Reported(val report: Report) : VerifyOutcome()
        data class Failed(val failure: Failure, val detail: String) : VerifyOutcome()
    }

    /** The two independent questions a verification answers, never merged. */
    data class Report(
        val verdict: DigitalSignatureService.Verdict,
        val algorithm: String,
        val digestHex: String,
        val signerFingerprint: String,
        val attached: Boolean,
        val fileName: String,
        val label: String,
        val recognisedAs: String?,
        val origin: String,
        val detail: String,
        val recordedSize: Long?,
        val actualSize: Long,
    ) {
        /** True only when the bytes authenticate under the embedded key. */
        val signatureValid: Boolean get() = verdict == DigitalSignatureService.Verdict.VALID

        /** True only when that key is one this vault stores under a name. */
        val signerRecognised: Boolean get() = !recognisedAs.isNullOrBlank()
    }

    /**
     * Signs [content] into a KSG1 (detached) or KSA1 (attached) package. An
     * attached package stores the document beside the signature and is **not**
     * encrypted; the caller is expected to say so rather than imply secrecy.
     */
    suspend fun sign(
        content: ByteArray,
        fileName: String,
        label: String,
        attached: Boolean,
    ): SignOutcome {
        val access = session.currentAccess() ?: return SignOutcome.Failed(Failure.LOCKED, "the vault is locked")
        if (content.size > MAX_CONTENT_BYTES) {
            return SignOutcome.Failed(Failure.TOO_LARGE, "${content.size} bytes exceeds the studio limit")
        }
        val info = runCatching { signing.ensureKey() }
            .getOrElse { failure ->
                return SignOutcome.Failed(Failure.UNSUPPORTED, failure.javaClass.simpleName)
            }
        val publicKey = DigitalSignatureService.publicKeyFromBase64(info.publicKeySpkiBase64)
            ?: return SignOutcome.Failed(Failure.UNSUPPORTED, "the signing key has no usable public half")
        val fingerprint = KeyFingerprint.of(publicKey)
        val createdAt = System.currentTimeMillis()
        val cleanName = fileName.take(180).ifBlank { "document" }
        val fileDigest = DigitalSignatureService.digestHex(content)
        val meta = SecretsJson.encodeSignaturePackageMeta(
            SignaturePackageMeta(
                label = label.ifBlank { "Signed file" }.take(120),
                fileName = cleanName,
                fileSize = content.size.toLong(),
                digestHex = fileDigest,
                signerFingerprint = fingerprint,
                keyOrigin = info.origin.name.lowercase(),
                createdAt = createdAt,
            ),
        ).toByteArray(Charsets.UTF_8)
        // The signature covers the content digest *and* the metadata digest, so
        // rewriting the file name or the claimed size inside a package breaks it.
        val binding = SignaturePackage.binding(
            content = content,
            metadata = meta,
            digestMode = SignaturePackage.DIGEST_MODE_BOUND_METADATA,
        )
        val artifact = runCatching { signing.sign(binding) }
            .getOrElse { failure ->
                return SignOutcome.Failed(Failure.UNSUPPORTED, failure.javaClass.simpleName)
            }
        if (artifact.origin != info.origin || artifact.publicKeySpkiBase64 != info.publicKeySpkiBase64) {
            return SignOutcome.Failed(Failure.UNSUPPORTED, "the signing key changed between checks")
        }
        val signatureBytes = DigitalSignatureService.signatureFromBase64(artifact.signatureBase64)
            ?: return SignOutcome.Failed(Failure.UNSUPPORTED, "the signature could not be decoded")
        val bytes = runCatching {
            SignaturePackage.encode(
                attached = attached,
                algorithm = artifact.algorithm,
                publicKeySpki = publicKey.encoded,
                signature = signatureBytes,
                metadata = meta,
                content = if (attached) content else null,
                digestMode = SignaturePackage.DIGEST_MODE_BOUND_METADATA,
            )
        }.getOrElse { failure ->
            return when (failure) {
                is SignaturePackage.UnsupportedPackageException ->
                    SignOutcome.Failed(Failure.UNSUPPORTED, failure.messageOr("the package format is unsupported"))

                else -> SignOutcome.Failed(Failure.UNREADABLE, failure.messageOr("encoding failed"))
            }
        }
        val receiptId = repository.save(
            access,
            SecretKinds.SIGNATURE,
            null,
            SecretsJson.encodeSignature(
                SignaturePayload(
                    label = (if (attached) "attached · " else "detached · ") + cleanName,
                    algorithm = artifact.algorithm,
                    publicKeySpkiBase64 = artifact.publicKeySpkiBase64,
                    signatureBase64 = artifact.signatureBase64,
                    digestHex = fileDigest,
                    createdAt = createdAt,
                ),
            ),
        )
        return SignOutcome.Sealed(
            Produced(
                bytes = bytes,
                attached = attached,
                algorithm = artifact.algorithm,
                digestHex = fileDigest,
                signerFingerprint = fingerprint,
                origin = artifact.origin,
                createdAt = createdAt,
                receiptId = receiptId,
            ),
        )
    }

    /**
     * Verifies a package. A detached package needs its document supplied; an
     * attached one is checked against its own embedded copy, because that is the
     * only content its signature can be about.
     */
    suspend fun verify(
        packageBytes: ByteArray,
        content: ByteArray?,
    ): VerifyOutcome {
        val access = session.currentAccess() ?: return VerifyOutcome.Failed(Failure.LOCKED, "the vault is locked")
        if (packageBytes.size > MAX_CONTENT_BYTES) {
            return VerifyOutcome.Failed(Failure.TOO_LARGE, "the package is larger than the studio limit")
        }
        val decoded = runCatching { SignaturePackage.decode(packageBytes) }.getOrElse { failure ->
            return when (failure) {
                is SignaturePackage.UnsupportedPackageException ->
                    VerifyOutcome.Failed(Failure.UNSUPPORTED, failure.messageOr("unsupported package"))

                else -> VerifyOutcome.Failed(Failure.UNREADABLE, failure.messageOr("malformed package"))
            }
        }
        val payload = when {
            decoded.attached -> decoded.content
            else -> content
        } ?: return VerifyOutcome.Failed(
            Failure.UNREADABLE,
            if (decoded.attached) "the attached package carries no content" else "a detached package needs its document",
        )
        if (payload.size > MAX_CONTENT_BYTES) {
            return VerifyOutcome.Failed(Failure.TOO_LARGE, "the document is larger than the studio limit")
        }
        val meta = SecretsJson.decodeSignaturePackageMeta(String(decoded.metadata, Charsets.UTF_8))
        val publicKey = decoded.publicKey()
            ?: return VerifyOutcome.Failed(Failure.UNSUPPORTED, "the embedded public key is not one this build can verify")
        val digestHex = DigitalSignatureService.digestHex(payload)
        val recordedDigest = meta?.digestHex?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
        val verdict = when {
            // A mode-2 package binds the metadata into the signature, so the file
            // digest is checked against the record separately: a package that
            // claims one digest while holding another is reported as such rather
            // than as a broken signature.
            decoded.digestMode == SignaturePackage.DIGEST_MODE_BOUND_METADATA &&
                recordedDigest != null && recordedDigest != digestHex ->
                DigitalSignatureService.Verdict.DIGEST_MISMATCH

            else -> DigitalSignatureService.verify(
                content = SignaturePackage.binding(payload, decoded.metadata, decoded.digestMode),
                publicKey = publicKey,
                signature = decoded.signature,
                algorithm = decoded.algorithm,
                expectedDigestHex = recordedDigest.takeIf { decoded.digestMode == SignaturePackage.DIGEST_MODE_SHA256_OF_CONTENT },
            )
        }
        val fingerprint = KeyFingerprint.of(publicKey)
        val recognised = runCatching {
            knownKeys(access).firstOrNull { KeyFingerprint.matches(it.second, fingerprint) }
        }.getOrNull()
        val detail = when {
            decoded.attached && content != null ->
                "an attached package was checked against its embedded copy; the supplied document was ignored"

            decoded.attached -> "checked against the copy embedded in the package"
            meta == null -> "the package metadata could not be read"
            else -> verdict.name.lowercase()
        }
        return VerifyOutcome.Reported(
            Report(
                verdict = verdict,
                algorithm = decoded.algorithm,
                digestHex = digestHex,
                signerFingerprint = fingerprint,
                attached = decoded.attached,
                fileName = meta?.fileName.orEmpty().ifBlank { if (decoded.attached) "attached document" else "unknown file" },
                label = meta?.label.orEmpty().ifBlank { "Signature" },
                recognisedAs = recognised?.first,
                origin = meta?.keyOrigin.orEmpty(),
                detail = detail,
                recordedSize = meta?.fileSize?.takeIf { it > 0L },
                actualSize = payload.size.toLong(),
            ),
        )
    }

    /** Stores a public key so future signatures made by it can be recognised. */
    suspend fun rememberSignerKey(access: VaultAccess, label: String, publicKey: PublicKey): String =
        repository.save(
            access,
            SecretKinds.PUBLIC_KEY,
            null,
            SecretsJson.encodePublicKey(
                PublicKeyPayload(
                    label = label.take(120).ifBlank { "Signer key" },
                    spkiBase64 = DigitalSignatureService.publicKeyToBase64(publicKey),
                    fingerprint = KeyFingerprint.of(publicKey),
                    origin = "signature-package",
                    createdAt = System.currentTimeMillis(),
                ),
            ),
        )

    fun observeStoredSignatures(access: VaultAccess): Flow<List<SignaturePayload>> =
        repository.observe(access, SecretKinds.SIGNATURE).map { rows ->
            rows.mapNotNull { row ->
                if (row.decryptionFailed) return@mapNotNull null
                SecretsJson.decodeSignature(row.payloadJson)
            }
        }

    private suspend fun knownKeys(access: VaultAccess): List<Pair<String, String>> =
        repository.observe(access, SecretKinds.PUBLIC_KEY).first().mapNotNull { row ->
            if (row.decryptionFailed) return@mapNotNull null
            SecretsJson.decodePublicKey(row.payloadJson)?.let { it.label to it.fingerprint }
        }

    private fun Throwable.messageOr(fallback: String): String = message?.takeIf { it.isNotBlank() } ?: fallback
}
