package com.knoux.crypt.data

import com.knoux.crypt.security.PassphraseEnvelope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Expiring secret capsule (TASK 41).
 *
 * A capsule is a short secret plus a policy: an absolute expiry and a maximum open
 * count. Both live inside the capsule's own KNC2 record, so they are authenticated
 * together with the secret — editing the expiry without the vault key breaks
 * authentication instead of extending the life of the secret.
 *
 * The honest limit, stated everywhere this is surfaced: a capsule that has already
 * been handed to someone else cannot be recalled. Local expiry and open counts are
 * enforced against this device's clock and this device's record; a recipient who
 * sets their clock back, or who keeps a decrypted copy, defeats them. There is no
 * server here and no remote revocation is claimed.
 */
enum class CapsuleState {
    ACTIVE,
    EXPIRED,
    SPENT,
    REVOKED,
    /** The record exists but its ciphertext did not authenticate. */
    UNREADABLE,
}

@Serializable
data class CapsulePayload(
    val label: String,
    val secret: String,
    val expiresAtMillis: Long,
    val maxOpens: Int,
    val opensUsed: Int = 0,
    val createdAt: Long,
    val revokedAtMillis: Long = 0,
)

data class Capsule(
    val id: String,
    val payload: CapsulePayload?,
    val updatedAt: Long,
    val nowMillis: Long,
) {
    val readable: Boolean get() = payload != null

    /** Derived, never stored: the state is a function of the policy and the clock. */
    val state: CapsuleState
        get() {
            val current = payload ?: return CapsuleState.UNREADABLE
            return when {
                current.revokedAtMillis > 0 -> CapsuleState.REVOKED
                current.expiresAtMillis in 1..nowMillis -> CapsuleState.EXPIRED
                current.opensUsed >= current.maxOpens -> CapsuleState.SPENT
                else -> CapsuleState.ACTIVE
            }
        }

    val opensRemaining: Int
        get() = ((payload?.maxOpens ?: 0) - (payload?.opensUsed ?: 0)).coerceAtLeast(0)

    val millisRemaining: Long
        get() = ((payload?.expiresAtMillis ?: 0) - nowMillis).coerceAtLeast(0)
}

enum class CapsuleFailure {
    LABEL_EMPTY,
    LABEL_TOO_LONG,
    SECRET_EMPTY,
    SECRET_TOO_LARGE,
    TTL_OUT_OF_RANGE,
    MAX_OPENS_OUT_OF_RANGE,
    NOT_FOUND,
    UNREADABLE,
    EXPIRED,
    SPENT,
    REVOKED,
    CONCURRENT_UPDATE,
    LOCKED,
}

class CapsuleRejectedException(val failure: CapsuleFailure) : Exception(failure.name)

/** A record whose payload has already been authenticated and decoded. */
private data class Loaded(
    val id: String,
    val payload: CapsulePayload,
    val updatedAt: Long,
    val nowMillis: Long,
)

/** Testable clock seam. Expiry is only meaningful relative to a stated time source. */
fun interface TimeSource {
    fun nowMillis(): Long
}

object CapsulePolicy {
    const val MAX_LABEL_CHARS = 120
    const val MAX_SECRET_CHARS = 8 * 1024
    val TTL_CHOICES_MILLIS: List<Long> = listOf(
        15L * 60 * 1000,
        60L * 60 * 1000,
        6L * 60 * 60 * 1000,
        24L * 60 * 60 * 1000,
        7L * 24 * 60 * 60 * 1000,
    )
    val MAX_OPEN_CHOICES: List<Int> = listOf(1, 3, 5, 10, 25)
    const val MIN_TTL_MILLIS = 60_000L
    const val MAX_TTL_MILLIS = 30L * 24 * 60 * 60 * 1000
    const val MIN_MAX_OPENS = 1
    const val MAX_MAX_OPENS = 100

    /** Context bound into every capsule share package; never a secret. */
    const val SHARE_CONTEXT = "knoux.capsule.share.v1"

    fun validateTtl(ttlMillis: Long): Long {
        require(ttlMillis in MIN_TTL_MILLIS..MAX_TTL_MILLIS) { "Capsule lifetime out of range" }
        return ttlMillis
    }

    fun validateMaxOpens(maxOpens: Int): Int {
        require(maxOpens in MIN_MAX_OPENS..MAX_MAX_OPENS) { "Capsule open limit out of range" }
        return maxOpens
    }
}

/**
 * Capsule lifecycle over the existing authenticated vault record store.
 *
 * Consuming an open is a compare-and-set on the record revision inside the
 * revocation gate, so two concurrent reveals cannot both spend the last allowance.
 * Refusals are audited with a typed reason and never carry the label or the secret.
 */
class CapsuleService(
    private val session: SessionManager,
    private val secrets: SecretRepository,
    private val timeSource: TimeSource = TimeSource { System.currentTimeMillis() },
    private val audit: SecurityAuditSink = NoopSecurityAuditSink,
    private val envelope: PassphraseEnvelope = PassphraseEnvelope(),
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    fun observe(access: VaultAccess): Flow<List<Capsule>> =
        secrets.observe(access, SecretKinds.CAPSULE).map { rows ->
            val now = timeSource.nowMillis()
            rows.map { record ->
                Capsule(
                    id = record.id,
                    payload = if (record.decryptionFailed) null else decode(record.payloadJson),
                    updatedAt = record.updatedAt,
                    nowMillis = now,
                )
            }.sortedWith(
                compareByDescending<Capsule> { it.payload?.createdAt ?: 0L }.thenByDescending { it.id },
            )
        }

    suspend fun create(
        access: VaultAccess,
        label: String,
        secret: String,
        ttlMillis: Long,
        maxOpens: Int,
    ): Capsule = withContext(Dispatchers.IO) {
        val trimmed = label.trim()
        require(trimmed.isNotEmpty()) { "Label is empty" }
        require(trimmed.length <= CapsulePolicy.MAX_LABEL_CHARS) { "Label is too long" }
        require(secret.isNotEmpty()) { "Secret is empty" }
        require(secret.length <= CapsulePolicy.MAX_SECRET_CHARS) { "Secret is too large" }
        require(ttlMillis in CapsulePolicy.MIN_TTL_MILLIS..CapsulePolicy.MAX_TTL_MILLIS) {
            "Capsule lifetime out of range"
        }
        require(maxOpens in CapsulePolicy.MIN_MAX_OPENS..CapsulePolicy.MAX_MAX_OPENS) {
            "Capsule open limit out of range"
        }
        val now = timeSource.nowMillis()
        val payload = CapsulePayload(
            label = trimmed,
            secret = secret,
            expiresAtMillis = now + ttlMillis,
            maxOpens = maxOpens,
            opensUsed = 0,
            createdAt = now,
        )
        val id = secrets.save(access, SecretKinds.CAPSULE, null, encode(payload))
        audit.recordSafely(
            SecurityAuditEvent(
                SecurityEventAction.CAPSULE_CREATED,
                "ttlMillis=$ttlMillis maxOpens=$maxOpens",
            ),
        )
        Capsule(id = id, payload = payload, updatedAt = now, nowMillis = now)
    }

    /**
     * Returns the secret and consumes one open. Every refusal happens before the
     * record is written, so a refused reveal never silently burns an allowance.
     */
    suspend fun reveal(access: VaultAccess, id: String): String = withContext(Dispatchers.IO) {
        val current = loadOrFail(access, id)
        val payload = current.payload
        if (payload.revokedAtMillis > 0) refuse(id, CapsuleFailure.REVOKED)
        if (payload.expiresAtMillis in 1..current.nowMillis) refuse(id, CapsuleFailure.EXPIRED)
        if (payload.opensUsed >= payload.maxOpens) refuse(id, CapsuleFailure.SPENT)

        val opened = payload.copy(opensUsed = payload.opensUsed + 1)
        val outcome = secrets.saveIfUnchanged(
            access = access,
            kind = SecretKinds.CAPSULE,
            id = id,
            expectedUpdatedAt = current.updatedAt,
            payloadJson = encode(opened),
        )
        when (outcome) {
            is SaveOutcome.Saved -> {
                audit.recordSafely(
                    SecurityAuditEvent(
                        SecurityEventAction.CAPSULE_REVEALED,
                        "opensUsed=${opened.opensUsed} of ${opened.maxOpens}",
                    ),
                )
                payload.secret
            }
            is SaveOutcome.Missing -> refuse(id, CapsuleFailure.NOT_FOUND)
            is SaveOutcome.Conflict -> refuse(id, CapsuleFailure.CONCURRENT_UPDATE)
        }
    }

    /**
     * Revocation is local and truthful: it stops this device from ever revealing
     * the capsule again, and it does not delete the record. A package already
     * handed to someone else is unaffected, and the UI says so.
     */
    suspend fun revoke(access: VaultAccess, id: String): Capsule = withContext(Dispatchers.IO) {
        val current = loadOrFail(access, id)
        if (current.payload.revokedAtMillis > 0) {
            return@withContext Capsule(current.id, current.payload, current.updatedAt, current.nowMillis)
        }
        val revoked = current.payload.copy(revokedAtMillis = current.nowMillis)
        val outcome = secrets.saveIfUnchanged(
            access = access,
            kind = SecretKinds.CAPSULE,
            id = id,
            expectedUpdatedAt = current.updatedAt,
            payloadJson = encode(revoked),
        )
        when (outcome) {
            is SaveOutcome.Saved -> {
                audit.recordSafely(SecurityAuditEvent(SecurityEventAction.CAPSULE_REVOKED, "record kept"))
                Capsule(id, revoked, current.updatedAt + 1, current.nowMillis)
            }
            is SaveOutcome.Missing -> refuse(id, CapsuleFailure.NOT_FOUND)
            is SaveOutcome.Conflict -> refuse(id, CapsuleFailure.CONCURRENT_UPDATE)
        }
    }

    suspend fun delete(access: VaultAccess, id: String) = withContext(Dispatchers.IO) {
        secrets.delete(access, id)
        audit.recordSafely(SecurityAuditEvent(SecurityEventAction.CAPSULE_DELETED, "record removed"))
    }

    /**
     * Seals the capsule into a passphrase-protected KNP2 package. The expiry and
     * open limit travel inside the authenticated plaintext, so tampering with them
     * fails authentication rather than extending the secret's life. The package is
     * a copy: once it leaves this device its policy cannot be enforced remotely.
     */
    suspend fun sharePackage(
        access: VaultAccess,
        id: String,
        passphrase: CharArray,
    ): ByteArray = withContext(Dispatchers.IO) {
        val current = loadOrFail(access, id)
        val payload = current.payload
        if (payload.revokedAtMillis > 0) refuse(id, CapsuleFailure.REVOKED)
        if (payload.expiresAtMillis in 1..current.nowMillis) refuse(id, CapsuleFailure.EXPIRED)
        require(passphrase.isNotEmpty()) { "A passphrase is required" }
        val manifest = json.encodeToString(
            CapsuleShareManifest.serializer(),
            CapsuleShareManifest(
                version = 1,
                label = payload.label,
                secret = payload.secret,
                expiresAtMillis = payload.expiresAtMillis,
                maxOpens = payload.maxOpens,
                createdAt = payload.createdAt,
            ),
        ).toByteArray(Charsets.UTF_8)
        try {
            val sealed = envelope.seal(manifest, passphrase, CapsulePolicy.SHARE_CONTEXT.toByteArray(Charsets.UTF_8))
            audit.recordSafely(
                SecurityAuditEvent(
                    SecurityEventAction.CAPSULE_SHARED,
                    "bytes=${sealed.size} expiresAt=${payload.expiresAtMillis}",
                ),
            )
            sealed
        } finally {
            manifest.fill(0)
        }
    }

    /**
     * Opens a received capsule package. Reports the policy it carries and whether
     * that policy has already run out on this device's clock; a package whose
     * ciphertext was altered fails authentication instead of returning content.
     */
    fun readPackage(
        envelopeBytes: ByteArray,
        passphrase: CharArray,
        nowMillis: Long = timeSource.nowMillis(),
    ): CapsulePackage {
        val plaintext = runCatching {
            envelope.open(envelopeBytes, passphrase, CapsulePolicy.SHARE_CONTEXT.toByteArray(Charsets.UTF_8))
        }.getOrElse {
            throw CapsuleRejectedException(CapsuleFailure.UNREADABLE)
        }
        try {
            val manifest = json.decodeFromString(CapsuleShareManifest.serializer(), plaintext.toString(Charsets.UTF_8))
            val expired = manifest.expiresAtMillis in 1..nowMillis
            return CapsulePackage(
                label = manifest.label,
                secret = if (expired) "" else manifest.secret,
                expiresAtMillis = manifest.expiresAtMillis,
                maxOpens = manifest.maxOpens,
                createdAt = manifest.createdAt,
                expired = expired,
                revokedBySender = false,
            )
        } catch (failure: CapsuleRejectedException) {
            throw failure
        } catch (_: Throwable) {
            throw CapsuleRejectedException(CapsuleFailure.UNREADABLE)
        } finally {
            plaintext.fill(0)
        }
    }

    private suspend fun loadOrFail(access: VaultAccess, id: String): Loaded {
        session.requireValid(access)
        val record = secrets.find(access, id)
            ?: run {
                audit.recordSafely(
                    SecurityAuditEvent(SecurityEventAction.CAPSULE_REFUSED, "reason=NOT_FOUND"),
                )
                throw CapsuleRejectedException(CapsuleFailure.NOT_FOUND)
            }
        if (record.kind != SecretKinds.CAPSULE) throw CapsuleRejectedException(CapsuleFailure.NOT_FOUND)
        if (record.decryptionFailed) {
            audit.recordSafely(
                SecurityAuditEvent(SecurityEventAction.CAPSULE_REFUSED, "reason=UNREADABLE"),
            )
            throw CapsuleRejectedException(CapsuleFailure.UNREADABLE)
        }
        val payload = decode(record.payloadJson)
            ?: run {
                audit.recordSafely(
                    SecurityAuditEvent(SecurityEventAction.CAPSULE_REFUSED, "reason=UNREADABLE"),
                )
                throw CapsuleRejectedException(CapsuleFailure.UNREADABLE)
            }
        return Loaded(record.id, payload, record.updatedAt, timeSource.nowMillis())
    }

    private suspend fun refuse(id: String, failure: CapsuleFailure): Nothing {
        audit.recordSafely(
            SecurityAuditEvent(SecurityEventAction.CAPSULE_REFUSED, "reason=${failure.name}"),
        )
        throw CapsuleRejectedException(failure)
    }

    private fun encode(payload: CapsulePayload): String =
        json.encodeToString(CapsulePayload.serializer(), payload)

    private fun decode(value: String): CapsulePayload? =
        runCatching { json.decodeFromString(CapsulePayload.serializer(), value) }.getOrNull()
}

@Serializable
private data class CapsuleShareManifest(
    val version: Int,
    val label: String,
    val secret: String,
    val expiresAtMillis: Long,
    val maxOpens: Int,
    val createdAt: Long,
)

/** A received capsule. `secret` is empty when the policy has already run out. */
data class CapsulePackage(
    val label: String,
    val secret: String,
    val expiresAtMillis: Long,
    val maxOpens: Int,
    val createdAt: Long,
    val expired: Boolean,
    val revokedBySender: Boolean,
)
