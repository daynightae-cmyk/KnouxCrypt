package com.knoux.crypt.data

import com.knoux.crypt.security.CertificateInspector
import java.security.cert.TrustAnchor
import java.security.cert.X509Certificate
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * Stored certificates and user-chosen trust anchors (TASK 20).
 *
 * A certificate is public data, but *which* certificates this person keeps and
 * inspects is not, so they are stored as ordinary encrypted vault records. The
 * DER encoding is what is persisted, which means a later inspection sees exactly
 * the bytes that were imported rather than a re-serialised guess.
 */
sealed class TrustPolicy {
    /** No anchors at all: nothing can be trusted, and the UI says so. */
    object None : TrustPolicy()

    /** Only the certificates this user explicitly marked as anchors. */
    object StoredAnchors : TrustPolicy()

    /** The handset's own platform trust store, named as such wherever it is used. */
    object PlatformStore : TrustPolicy()
}

data class StoredCertificate(
    val id: String,
    val label: String,
    val subject: String,
    val issuer: String,
    val fingerprint: String,
    val notBeforeMillis: Long,
    val notAfterMillis: Long,
    val isCa: Boolean,
    val isAnchor: Boolean,
    val addedAt: Long,
)

sealed class CertificateImportOutcome {
    data class Imported(val id: String, val view: CertificateInspector.CertificateView) : CertificateImportOutcome()
    data class AlreadyStored(val id: String, val label: String) : CertificateImportOutcome()
    data class Rejected(val reason: CertificateInspector.ParseFailure, val detail: String) : CertificateImportOutcome()
}

/** The five answers the inspector keeps apart, in one object for the UI. */
data class CertificateAssessment(
    val view: CertificateInspector.CertificateView,
    val validity: CertificateInspector.ValidityState,
    val chain: CertificateInspector.ChainOutcome,
    val policy: TrustPolicy,
    val signatureFromIssuer: Boolean?,
    val hostname: String?,
    val hostnameMatches: Boolean?,
    val revocationChecked: Boolean,
)

class CertificateVaultService(
    private val session: SessionManager,
    private val repository: SecretRepository,
) {
    companion object {
        const val MAX_STORED = 64
    }

    suspend fun import(access: VaultAccess, label: String, bytes: ByteArray): CertificateImportOutcome {
        session.requireValid(access)
        val parsed = CertificateInspector.parse(bytes)
        if (parsed is CertificateInspector.ParseOutcome.Rejected) {
            return CertificateImportOutcome.Rejected(parsed.reason, parsed.detail)
        }
        parsed as CertificateInspector.ParseOutcome.Parsed
        val fingerprint = parsed.view.fingerprintSha256
        val existing = records(access).firstOrNull { it.second.fingerprint == fingerprint }
        if (existing != null) {
            return CertificateImportOutcome.AlreadyStored(existing.first, existing.second.label)
        }
        val payload = CertificatePayload(
            label = label.trim().take(120).ifBlank { commonName(parsed.view.subject) ?: "certificate" },
            derBase64 = java.util.Base64.getEncoder().encodeToString(parsed.certificate.encoded),
            subject = parsed.view.subject,
            issuer = parsed.view.issuer,
            fingerprint = fingerprint,
            notBeforeMillis = parsed.view.notBeforeMillis,
            notAfterMillis = parsed.view.notAfterMillis,
            isCa = parsed.view.isCa,
            isAnchor = false,
            addedAt = System.currentTimeMillis(),
        )
        val id = repository.save(access, SecretKinds.CERTIFICATE, null, SecretsJson.encodeCertificate(payload))
        return CertificateImportOutcome.Imported(id, parsed.view)
    }

    fun observe(access: VaultAccess): Flow<List<StoredCertificate>> =
        repository.observe(access, SecretKinds.CERTIFICATE).map { rows ->
            rows.mapNotNull { row ->
                if (row.decryptionFailed) return@mapNotNull null
                SecretsJson.decodeCertificate(row.payloadJson)?.let { row.id to it }
            }.map { (id, payload) ->
                StoredCertificate(
                    id = id,
                    label = payload.label,
                    subject = payload.subject,
                    issuer = payload.issuer,
                    fingerprint = payload.fingerprint,
                    notBeforeMillis = payload.notBeforeMillis,
                    notAfterMillis = payload.notAfterMillis,
                    isCa = payload.isCa,
                    isAnchor = payload.isAnchor,
                    addedAt = payload.addedAt,
                )
            }
        }

    suspend fun setAnchor(access: VaultAccess, id: String, anchor: Boolean): Boolean {
        session.requireValid(access)
        val pair = records(access).firstOrNull { it.first == id } ?: return false
        repository.save(
            access,
            SecretKinds.CERTIFICATE,
            id,
            SecretsJson.encodeCertificate(pair.second.copy(isAnchor = anchor)),
        )
        return true
    }

    suspend fun rename(access: VaultAccess, id: String, label: String): Boolean {
        session.requireValid(access)
        val pair = records(access).firstOrNull { it.first == id } ?: return false
        val clean = label.trim().take(120).ifBlank { return false }
        repository.save(
            access,
            SecretKinds.CERTIFICATE,
            id,
            SecretsJson.encodeCertificate(pair.second.copy(label = clean)),
        )
        return true
    }

    suspend fun delete(access: VaultAccess, id: String) {
        session.requireValid(access)
        val known = records(access).any { it.first == id }
        if (known) repository.delete(access, id)
    }

    /** Re-reads the stored DER so an assessment always works from the original bytes. */
    suspend fun certificateOf(access: VaultAccess, id: String): X509Certificate? {
        session.requireValid(access)
        val payload = records(access).firstOrNull { it.first == id }?.second ?: return null
        val der = runCatching { java.util.Base64.getMimeDecoder().decode(payload.derBase64) }.getOrNull() ?: return null
        return (CertificateInspector.parse(der) as? CertificateInspector.ParseOutcome.Parsed)?.certificate
    }

    suspend fun storedCertificates(access: VaultAccess): List<X509Certificate> {
        session.requireValid(access)
        return records(access).mapNotNull { (_, payload) ->
            val der = runCatching { java.util.Base64.getMimeDecoder().decode(payload.derBase64) }.getOrNull()
            (der?.let { CertificateInspector.parse(it) } as? CertificateInspector.ParseOutcome.Parsed)?.certificate
        }
    }

    /**
     * Builds the anchor set for the chosen policy. [PlatformStore] is resolved
     * through the inspector so the caller can name it in the UI; an empty result
     * is reported as "no anchors" rather than as trust.
     */
    suspend fun anchorsFor(access: VaultAccess, policy: TrustPolicy): Set<TrustAnchor> = when (policy) {
        TrustPolicy.None -> emptySet()
        TrustPolicy.PlatformStore -> CertificateInspector.platformAnchors()
        TrustPolicy.StoredAnchors -> {
            session.requireValid(access)
            records(access).filter { it.second.isAnchor }.mapNotNull { (_, payload) ->
                val der = runCatching { java.util.Base64.getMimeDecoder().decode(payload.derBase64) }.getOrNull()
                val certificate = (der?.let { CertificateInspector.parse(it) } as? CertificateInspector.ParseOutcome.Parsed)
                    ?.certificate
                certificate?.let { CertificateInspector.anchorFor(it) }
            }.toSet()
        }
    }

    /**
     * Produces the five-part assessment. The chain is validated against the
     * policy's anchors only, and the issuer signature check is reported
     * separately, so a certificate whose issuer is present but untrusted still
     * shows "signature verifies" next to "not trusted".
     */
    suspend fun assess(
        access: VaultAccess,
        certificate: X509Certificate,
        policy: TrustPolicy,
        nowMillis: Long,
        hostname: String?,
    ): CertificateAssessment {
        session.requireValid(access)
        val view = CertificateInspector.viewOf(certificate)
        val anchors = anchorsFor(access, policy)
        val pool = storedCertificates(access) + certificate
        // Walk the issuer links through what this vault holds, bounded by the
        // inspector's chain limit; a missing link is reported as unknown issuer
        // rather than patched with a guess.
        val intermediates = mutableListOf<X509Certificate>()
        var current = certificate
        while (intermediates.size < CertificateInspector.MAX_CHAIN_CERTS - 1) {
            val issuer = pool.firstOrNull {
                it.subjectX500Principal == current.issuerX500Principal &&
                    it.serialHexOrNull() != current.serialHexOrNull() &&
                    it !== current &&
                    intermediates.none { candidate -> candidate.serialHexOrNull() == it.serialHexOrNull() }
            } ?: break
            intermediates += issuer
            current = issuer
        }
        val chain = CertificateInspector.validateChain(
            leaf = certificate,
            intermediates = intermediates,
            anchors = anchors,
            nowMillis = nowMillis,
        )
        val issuerCertificate = intermediates.firstOrNull()
        return CertificateAssessment(
            view = view,
            validity = view.validityAt(nowMillis),
            chain = chain,
            policy = policy,
            signatureFromIssuer = issuerCertificate?.let {
                CertificateInspector.verifySignature(certificate, it.publicKey)
            },
            hostname = hostname?.trim()?.takeIf { it.isNotEmpty() },
            hostnameMatches = hostname?.trim()?.takeIf { it.isNotEmpty() }?.let { view.matchesHostname(it) },
            revocationChecked = false,
        )
    }

    private suspend fun records(access: VaultAccess): List<Pair<String, CertificatePayload>> =
        repository.observe(access, SecretKinds.CERTIFICATE).first().mapNotNull { row ->
            if (row.decryptionFailed) return@mapNotNull null
            SecretsJson.decodeCertificate(row.payloadJson)?.let { row.id to it }
        }.take(MAX_STORED)

    private fun commonName(dn: String): String? =
        dn.split(',').firstOrNull { it.trim().startsWith("CN=", ignoreCase = true) }?.substringAfter('=')?.trim()

    private fun X509Certificate.serialHexOrNull(): String? = runCatching { serialNumber.toString(16) }.getOrNull()
}
