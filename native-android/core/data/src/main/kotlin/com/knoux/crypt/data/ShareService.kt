package com.knoux.crypt.data

import com.knoux.crypt.security.FileEnvelope
import com.knoux.crypt.security.KeyFingerprint
import com.knoux.crypt.security.KeyKindRejectedException
import com.knoux.crypt.security.RecipientKey
import com.knoux.crypt.security.SecureSharePackage
import com.knoux.crypt.security.ShareKeyPair
import com.knoux.crypt.security.UnsupportedContainerException
import java.io.InputStream
import java.io.OutputStream
import java.security.DigestOutputStream
import java.security.MessageDigest
import java.security.SecureRandom
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * The Secure Share service (TASK 16).
 *
 * Three things are deliberately separated here:
 *
 * 1. **Identity.** This installation holds one X25519 key pair. Its private half
 *    is stored only as a vault record encrypted by the device key, and the
 *    [ShareIdentityPayload.origin] field says out loud that it is a *software*
 *    key, because the tested handset's Keystore offers no asymmetric algorithm.
 * 2. **Recipients.** A recipient is only usable once the person holding the
 *    device has confirmed the full fingerprint, so sealing to a key that merely
 *    "looks right" is impossible rather than merely discouraged.
 * 3. **Packages.** The crypto lives in [SecureSharePackage]; this class adds
 *    session authorization, encrypted persistence and receipts, and never
 *    invents a result when the platform or the user has not supplied one.
 */
class ShareService(
    private val session: SessionManager,
    private val secrets: SecretRepository,
    private val random: SecureRandom = SecureRandom(),
) {
    companion object {
        const val IDENTITY_RECORD_ID = "knoux.share-identity.v1"
        const val ORIGIN_VAULT_SOFTWARE = "vault-software"
        const val DIRECTION_OUTGOING = "outgoing"
        const val DIRECTION_INCOMING = "incoming"
        const val MAX_NAME_CHARS = 180
        const val MAX_NOTE_CHARS = 400
    }

    private val container = SecureSharePackage(random)

    private data class CachedIdentity(
        val access: VaultAccess,
        val payload: ShareIdentityPayload,
        val keyPair: ShareKeyPair,
    )

    @Volatile
    private var cached: CachedIdentity? = null

    init {
        // A lock must drop the in-memory private scalar, not just the UI state.
        session.addOnLockListener { cached = null }
    }

    // --- identity -----------------------------------------------------------

    /** Loads, or on first use creates, this device's X25519 sharing identity. */
    suspend fun identity(access: VaultAccess): ShareIdentityPayload {
        session.requireValid(access)
        cached?.takeIf { it.access === access }?.let { return it.payload }
        val existing = secrets.find(access, IDENTITY_RECORD_ID)
        val payload = existing?.takeUnless { it.decryptionFailed }?.payloadJson?.let { raw ->
            SecretsJson.decodeShareIdentity(raw)
        } ?: runCatching { newIdentity(access) }.getOrElse {
            throw ShareUnavailableException("The sharing identity could not be created on this device")
        }
        val pair = runCatching { ShareKeyPair.fromPkcs8Base64(payload.privatePkcs8Base64) }.getOrNull()
            ?: throw ShareUnavailableException("The stored sharing identity is not usable")
        if (pair.fingerprint != payload.fingerprint) {
            throw ShareUnavailableException("The stored sharing identity does not match its own fingerprint")
        }
        cached = CachedIdentity(access, payload, pair)
        return payload
    }

    private suspend fun newIdentity(access: VaultAccess): ShareIdentityPayload {
        val pair = ShareKeyPair.generate(random)
        val payload = ShareIdentityPayload(
            spkiBase64 = pair.public.spkiBase64,
            privatePkcs8Base64 = pair.pkcs8Base64,
            fingerprint = pair.fingerprint,
            origin = ORIGIN_VAULT_SOFTWARE,
            createdAt = System.currentTimeMillis(),
        )
        secrets.save(access, SecretKinds.SHARE_IDENTITY, IDENTITY_RECORD_ID, SecretsJson.encodeShareIdentity(payload))
        return payload
    }

    /** The URI a partner scans to import this device as a recipient. */
    suspend fun identityUri(access: VaultAccess, label: String): String {
        val payload = identity(access)
        return RecipientKey.fromBase64(payload.spkiBase64).uriFor(label)
    }

    private suspend fun keyPair(access: VaultAccess): ShareKeyPair {
        val payload = identity(access)
        cached?.takeIf { it.access === access }?.let { return it.keyPair }
        return ShareKeyPair.fromPkcs8Base64(payload.privatePkcs8Base64)
    }

    // --- recipients ---------------------------------------------------------

    fun observeRecipients(access: VaultAccess): Flow<List<ShareRecipientView>> =
        secrets.observe(access, SecretKinds.SHARE_RECIPIENT).map { rows ->
            rows.mapNotNull { row ->
                if (row.decryptionFailed) return@mapNotNull null
                SecretsJson.decodeShareRecipient(row.payloadJson)?.let { it to row.id }
            }.map { (payload, id) ->
                ShareRecipientView(
                    id = id,
                    label = payload.label,
                    fingerprint = payload.fingerprint,
                    keyIdHex = payload.keyIdHex,
                    verified = payload.confirmedFingerprint.isNotEmpty() &&
                        KeyFingerprint.matches(payload.confirmedFingerprint, payload.fingerprint),
                    createdAt = payload.createdAt,
                )
            }
        }

    /**
     * Adds a recipient from a `knouxkey:v2:x25519:…` URI or a bare base64 SPKI.
     * Anything that is not an X25519 key — a signing key included — is refused
     * with the reason, never silently converted.
     */
    suspend fun addRecipient(
        access: VaultAccess,
        label: String,
        keyText: String,
    ): AddRecipientOutcome {
        session.requireValid(access)
        val trimmed = keyText.trim()
        if (trimmed.isEmpty()) return AddRecipientOutcome.Rejected(ShareFailure.BAD_RECIPIENT_KEY, "No key was supplied")
        val parsed = try {
            RecipientKey.fromUri(trimmed) ?: (RecipientKey.fromBase64(trimmed) to "")
        } catch (failure: KeyKindRejectedException) {
            return AddRecipientOutcome.Rejected(ShareFailure.BAD_RECIPIENT_KEY, failure.messageOr(failure.javaClass.simpleName))
        }
        val (key, uriLabel) = parsed
        val cleanLabel = label.trim().ifBlank { uriLabel.ifBlank { "Recipient" } }.take(MAX_NAME_CHARS)
        val existing = recipients(access)
        existing.firstOrNull { it.second.keyIdHex == key.keyIdHex }?.let { (id, payload) ->
            return AddRecipientOutcome.Duplicate(id, payload.label)
        }
        val payload = ShareRecipientPayload(
            label = cleanLabel,
            spkiBase64 = key.spkiBase64,
            fingerprint = key.fingerprint,
            keyIdHex = key.keyIdHex,
            algorithm = RecipientKey.ALGORITHM_TAG,
            createdAt = System.currentTimeMillis(),
        )
        val id = secrets.save(access, SecretKinds.SHARE_RECIPIENT, null, SecretsJson.encodeShareRecipient(payload))
        return AddRecipientOutcome.Added(id, cleanLabel, key.fingerprint)
    }

    /**
     * Records that the user compared this fingerprint out of band. The typed
     * [confirmed] value has to match the stored fingerprint exactly, so a
     * confirmation can never be attached to a different key.
     */
    suspend fun confirmRecipient(access: VaultAccess, id: String, confirmed: String): Boolean {
        session.requireValid(access)
        val record = secrets.find(access, id) ?: return false
        if (record.kind != SecretKinds.SHARE_RECIPIENT || record.decryptionFailed) return false
        val payload = SecretsJson.decodeShareRecipient(record.payloadJson) ?: return false
        if (!KeyFingerprint.matches(payload.fingerprint, confirmed)) return false
        val stored = RecipientKey.fromBase64(payload.spkiBase64)
        if (stored.fingerprint != payload.fingerprint) return false
        secrets.save(
            access,
            SecretKinds.SHARE_RECIPIENT,
            id,
            SecretsJson.encodeShareRecipient(payload.copy(confirmedFingerprint = payload.fingerprint, confirmedAt = System.currentTimeMillis())),
        )
        return true
    }

    suspend fun renameRecipient(access: VaultAccess, id: String, label: String): Boolean {
        session.requireValid(access)
        val record = secrets.find(access, id) ?: return false
        if (record.kind != SecretKinds.SHARE_RECIPIENT || record.decryptionFailed) return false
        val payload = SecretsJson.decodeShareRecipient(record.payloadJson) ?: return false
        val clean = label.trim().ifBlank { return false }.take(MAX_NAME_CHARS)
        secrets.save(
            access,
            SecretKinds.SHARE_RECIPIENT,
            id,
            SecretsJson.encodeShareRecipient(payload.copy(label = clean)),
        )
        return true
    }

    suspend fun removeRecipient(access: VaultAccess, id: String) {
        session.requireValid(access)
        val record = secrets.find(access, id) ?: return
        if (record.kind == SecretKinds.SHARE_RECIPIENT) secrets.delete(access, id)
    }

    private suspend fun recipients(access: VaultAccess): List<Pair<String, ShareRecipientPayload>> =
        secrets.observe(access, SecretKinds.SHARE_RECIPIENT).first().mapNotNull { row ->
            if (row.decryptionFailed) return@mapNotNull null
            SecretsJson.decodeShareRecipient(row.payloadJson)?.let { row.id to it }
        }

    // --- sealing ------------------------------------------------------------

    /**
     * Seals the bytes in [input] to [recipientIds] and writes a KSR1 package to
     * [output]. Every recipient must already be fingerprint-confirmed; the sender
     * copy is added as an ordinary recipient so the sender can reopen their own
     * package without any hidden key material.
     */
    suspend fun seal(
        access: VaultAccess,
        input: InputStream,
        output: OutputStream,
        recipientIds: List<String>,
        fileName: String,
        mimeType: String,
        note: String,
        senderLabel: String,
        plaintextLength: Long,
        expiresAt: Long?,
        includeSenderCopy: Boolean = true,
        onProgress: (FileEnvelope.Progress) -> Unit = {},
    ): SealOutcome {
        session.requireValid(access)
        if (recipientIds.isEmpty()) {
            return SealOutcome.Rejected(ShareFailure.NO_RECIPIENTS, "Choose at least one recipient")
        }
        val stored = recipients(access).associateBy { it.first }
        val chosen = recipientIds.mapNotNull { stored[it] }
        if (chosen.size != recipientIds.distinct().size) {
            return SealOutcome.Rejected(ShareFailure.NO_RECIPIENTS, "A chosen recipient is no longer in the vault")
        }
        val unverified = chosen.filter { row ->
            !(row.second.confirmedFingerprint.isNotEmpty() &&
                KeyFingerprint.matches(row.second.confirmedFingerprint, row.second.fingerprint))
        }
        if (unverified.isNotEmpty()) {
            return SealOutcome.Rejected(
                ShareFailure.UNVERIFIED_RECIPIENTS,
                unverified.joinToString { it.second.label }.ifBlank { "one recipient" },
            )
        }
        val keys = try {
            chosen.map { RecipientKey.fromBase64(it.second.spkiBase64) }
        } catch (failure: KeyKindRejectedException) {
            return SealOutcome.Rejected(ShareFailure.BAD_RECIPIENT_KEY, failure.messageOr("Stored key is unusable"))
        }
        val identityPayload = identity(access)
        val senderKey = RecipientKey.fromBase64(identityPayload.spkiBase64)
        val recipients = if (includeSenderCopy && keys.none { it.keyIdHex == senderKey.keyIdHex }) keys + senderKey else keys

        val createdAt = System.currentTimeMillis()
        if (expiresAt != null && expiresAt <= createdAt) {
            return SealOutcome.Rejected(ShareFailure.BAD_REQUEST, "The expiry must be in the future")
        }
        val metadata = SecretsJson.encodeShareMetadata(
            ShareMetadataPayload(
                fileName = fileName.take(MAX_NAME_CHARS).ifBlank { "shared file" },
                mimeType = mimeType.take(120).ifBlank { "application/octet-stream" },
                senderLabel = senderLabel.take(MAX_NAME_CHARS).ifBlank { "KNOUX" },
                senderFingerprint = identityPayload.fingerprint,
                note = note.take(MAX_NOTE_CHARS),
            ),
        ).toByteArray(Charsets.UTF_8)

        val digest = MessageDigest.getInstance("SHA-256")
        val counted = CountingOutputStream(DigestOutputStream(output, digest))
        val summary = try {
            container.seal(
                input = input,
                output = counted,
                recipients = recipients,
                metadata = metadata,
                plaintextLength = plaintextLength,
                createdAt = createdAt,
                expiresAt = expiresAt,
                onProgress = onProgress,
            )
        } catch (failure: UnsupportedContainerException) {
            return SealOutcome.Rejected(ShareFailure.BAD_REQUEST, failure.messageOr("The package could not be built"))
        }
        val digestHex = digest.digest().joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }

        val receipt = ShareReceiptPayload(
            packageIdHex = summary.packageIdHex,
            displayName = fileName.take(MAX_NAME_CHARS).ifBlank { "shared file" },
            plaintextLength = plaintextLength,
            createdAt = createdAt,
            expiresAt = expiresAt ?: 0L,
            digestHex = digestHex,
            direction = DIRECTION_OUTGOING,
            delivery = "not-delivered",
            recipients = chosen.map { (_, payload) ->
                ShareReceiptRecipient(payload.label, payload.fingerprint, verified = true)
            },
        )
        val receiptId = secrets.save(access, SecretKinds.SHARE_RECEIPT, null, SecretsJson.encodeShareReceipt(receipt))
        return SealOutcome.Sealed(
            receiptId = receiptId,
            packageIdHex = summary.packageIdHex,
            digestHex = digestHex,
            packageBytes = counted.count,
            plaintextBytes = plaintextLength,
            recipientCount = recipients.size,
        )
    }

    /** Marks a receipt as delivered once the Sharesheet or export actually ran. */
    suspend fun markDelivery(access: VaultAccess, receiptId: String, delivery: String) {
        session.requireValid(access)
        val record = secrets.find(access, receiptId) ?: return
        if (record.kind != SecretKinds.SHARE_RECEIPT || record.decryptionFailed) return
        val payload = SecretsJson.decodeShareReceipt(record.payloadJson) ?: return
        val safe = delivery.take(40)
        if (payload.delivery == safe) return
        secrets.save(access, SecretKinds.SHARE_RECEIPT, receiptId, SecretsJson.encodeShareReceipt(payload.copy(delivery = safe)))
    }

    // --- opening ------------------------------------------------------------

    /** Reads the framing of a package without holding any key. */
    fun summarize(input: InputStream): SecureSharePackage.Summary = container.summarize(input)

    suspend fun open(
        access: VaultAccess,
        input: InputStream,
        output: OutputStream,
        nowMillis: Long = System.currentTimeMillis(),
        onProgress: (FileEnvelope.Progress) -> Unit = {},
    ): ReceiveOutcome {
        session.requireValid(access)
        val pair = try {
            keyPair(access)
        } catch (failure: ShareUnavailableException) {
            return ReceiveOutcome.Rejected(ShareFailure.IDENTITY_UNAVAILABLE, failure.messageOr("No sharing identity"))
        }
        val target = CountingOutputStream(output)
        val result = container.open(input, target, pair, nowMillis, onProgress)
        val metadata = result.metadata?.let { raw ->
            SecretsJson.decodeShareMetadata(String(raw, Charsets.UTF_8))
        }
        val summary = result.summary
        return when (result.verdict) {
            SecureSharePackage.Verdict.OPENED -> {
                if (summary != null) {
                    val receipt = ShareReceiptPayload(
                        packageIdHex = summary.packageIdHex,
                        displayName = metadata?.fileName?.take(MAX_NAME_CHARS).orEmpty().ifBlank { "received file" },
                        plaintextLength = summary.plaintextLength,
                        createdAt = summary.createdAt,
                        expiresAt = summary.expiresAt ?: 0L,
                        digestHex = "",
                        direction = DIRECTION_INCOMING,
                        delivery = "opened",
                        recipients = listOf(
                            ShareReceiptRecipient(
                                metadata?.senderLabel.orEmpty().ifBlank { "Unknown sender" },
                                metadata?.senderFingerprint.orEmpty(),
                                verified = false,
                            ),
                        ),
                    )
                    secrets.save(access, SecretKinds.SHARE_RECEIPT, null, SecretsJson.encodeShareReceipt(receipt))
                }
                ReceiveOutcome.Opened(
                    fileName = metadata?.fileName.orEmpty().ifBlank { "received file" },
                    mimeType = metadata?.mimeType.orEmpty().ifBlank { "application/octet-stream" },
                    note = metadata?.note.orEmpty(),
                    senderLabel = metadata?.senderLabel.orEmpty().ifBlank { "Unknown sender" },
                    senderFingerprint = metadata?.senderFingerprint.orEmpty(),
                    bytes = target.count,
                    packageIdHex = summary?.packageIdHex.orEmpty(),
                )
            }

            SecureSharePackage.Verdict.EXPIRED -> ReceiveOutcome.Expired(
                fileName = metadata?.fileName.orEmpty().ifBlank { "this file" },
                expiresAt = summary?.expiresAt ?: 0L,
                packageIdHex = summary?.packageIdHex.orEmpty(),
            )

            SecureSharePackage.Verdict.RECIPIENT_MISMATCH -> ReceiveOutcome.RecipientMismatch(
                sealedForKeyIds = summary?.recipientKeyIds.orEmpty(),
                ourKeyId = pair.public.keyIdHex,
            )

            SecureSharePackage.Verdict.TAMPERED -> ReceiveOutcome.Tampered(result.detail)
            SecureSharePackage.Verdict.UNSUPPORTED -> ReceiveOutcome.Unsupported(result.detail)
        }
    }

    /** The receipts this device has written, newest first. */
    fun observeReceipts(access: VaultAccess): Flow<List<ShareReceiptPayload>> =
        secrets.observe(access, SecretKinds.SHARE_RECEIPT).map { rows ->
            rows.mapNotNull { row ->
                if (row.decryptionFailed) return@mapNotNull null
                SecretsJson.decodeShareReceipt(row.payloadJson)
            }
        }
}

/** A recipient as the UI sees it. The key bytes stay in the vault record. */
data class ShareRecipientView(
    val id: String,
    val label: String,
    val fingerprint: String,
    val keyIdHex: String,
    val verified: Boolean,
    val createdAt: Long,
)

enum class ShareFailure {
    NO_RECIPIENTS,
    UNVERIFIED_RECIPIENTS,
    BAD_RECIPIENT_KEY,
    BAD_REQUEST,
    IDENTITY_UNAVAILABLE,
}

sealed class AddRecipientOutcome {
    data class Added(val id: String, val label: String, val fingerprint: String) : AddRecipientOutcome()
    data class Duplicate(val existingId: String, val existingLabel: String) : AddRecipientOutcome()
    data class Rejected(val failure: ShareFailure, val detail: String) : AddRecipientOutcome()
}

sealed class SealOutcome {
    data class Sealed(
        val receiptId: String,
        val packageIdHex: String,
        val digestHex: String,
        val packageBytes: Long,
        val plaintextBytes: Long,
        val recipientCount: Int,
    ) : SealOutcome()

    data class Rejected(val failure: ShareFailure, val detail: String) : SealOutcome()
}

sealed class ReceiveOutcome {
    data class Opened(
        val fileName: String,
        val mimeType: String,
        val note: String,
        val senderLabel: String,
        val senderFingerprint: String,
        val bytes: Long,
        val packageIdHex: String,
    ) : ReceiveOutcome()

    data class Expired(val fileName: String, val expiresAt: Long, val packageIdHex: String) : ReceiveOutcome()
    data class RecipientMismatch(val sealedForKeyIds: List<String>, val ourKeyId: String) : ReceiveOutcome()
    data class Tampered(val detail: String) : ReceiveOutcome()
    data class Unsupported(val detail: String) : ReceiveOutcome()
    data class Rejected(val failure: ShareFailure, val detail: String) : ReceiveOutcome()
}

class ShareUnavailableException(message: String) : IllegalStateException(message)

private class CountingOutputStream(private val delegate: OutputStream) : OutputStream() {
    var count: Long = 0L
        private set

    override fun write(byte: Int) {
        delegate.write(byte)
        count += 1
    }

    override fun write(bytes: ByteArray, offset: Int, length: Int) {
        delegate.write(bytes, offset, length)
        count += length
    }

    override fun flush() = delegate.flush()

    override fun close() = delegate.close()
}

private fun Throwable.messageOr(fallback: String): String = message?.takeIf { it.isNotBlank() } ?: fallback
