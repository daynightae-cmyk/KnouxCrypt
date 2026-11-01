package com.knoux.crypt.security

import java.io.ByteArrayInputStream
import java.math.BigInteger
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.PKIXParameters
import java.security.cert.TrustAnchor
import java.security.cert.X509Certificate
import java.util.Base64
import java.util.Date
import org.bouncycastle.asn1.ASN1Primitive
import org.bouncycastle.asn1.x509.AccessDescription
import org.bouncycastle.asn1.x509.AuthorityInformationAccess
import org.bouncycastle.asn1.x509.GeneralNames

/**
 * X.509 import and inspection for the Certificate Inspector (TASK 20).
 *
 * The whole point of this screen is that five different questions have five
 * different answers, and none of them implies the next:
 *
 * 1. **Parsing** — are these bytes a well-formed X.509 certificate at all?
 * 2. **Signature** — does an issuer's public key actually validate this
 *    certificate's signature?
 * 3. **Validity window** — is the current instant inside notBefore/notAfter?
 * 4. **Chain** — does a path reach a trust anchor the user *named*?
 * 5. **Identity** — does a name the user asked about appear in the SANs?
 *
 * A certificate that parses, or is self-signed, or is a CA, is never reported as
 * trusted. Trust only exists relative to an explicit anchor set, and revocation
 * is never checked here because this build has no network permission to do it
 * with; the outcome says so instead of leaving the user to assume.
 */
object CertificateInspector {

    const val MAX_INPUT_BYTES = 256 * 1024
    const val MAX_CHAIN_CERTS = 8

    /**
     * Anchors are bounded, but the bound has to clear a real platform trust
     * store — Android and a desktop JDK each ship on the order of 140 roots — so
     * that validating against the device store is possible while an unbounded
     * caller-supplied list still gets refused.
     */
    const val MAX_TRUST_ANCHORS = 256
    const val PEM_BEGIN = "-----BEGIN CERTIFICATE-----"

    enum class ParseFailure { EMPTY, TOO_LARGE, NOT_A_CERTIFICATE, MALFORMED_ASN1, UNSUPPORTED_TYPE }

    sealed class ParseOutcome {
        data class Parsed(val certificate: X509Certificate, val view: CertificateView) : ParseOutcome()
        data class Rejected(val reason: ParseFailure, val detail: String) : ParseOutcome()
    }

    enum class ValidityState { NOT_YET_VALID, CURRENT, EXPIRED }

    enum class ChainFailure {
        NO_ANCHORS,
        TOO_MANY_INPUTS,
        UNKNOWN_ISSUER,
        SIGNATURE_INVALID,
        EXPIRED,
        NOT_YET_VALID,
        PATH_TOO_LONG,
        NOT_A_CA_IN_PATH,
        POLICY,
        UNSUPPORTED,
    }

    sealed class ChainOutcome {
        data class Trusted(
            val anchorSubject: String,
            val depth: Int,
            val subjects: List<String>,
            val anchoredByUserChoice: Boolean,
        ) : ChainOutcome()

        data class Failed(val reason: ChainFailure, val detail: String, val subjects: List<String>) : ChainOutcome()
    }

    /** A single subjectAltName entry, kept as text the UI can show without parsing. */
    data class SanEntry(val kind: String, val value: String)

    data class CertificateView(
        val subject: String,
        val issuer: String,
        val serialHex: String,
        val notBeforeMillis: Long,
        val notAfterMillis: Long,
        val signatureAlgorithm: String,
        val publicKeyAlgorithm: String,
        val publicKeyBits: Int,
        val version: Int,
        val fingerprintSha256: String,
        val subjectKeyIdentifier: String?,
        val authorityKeyIdentifier: String?,
        val isCa: Boolean,
        val pathLengthConstraint: Int?,
        val selfSigned: Boolean,
        val keyUsage: List<String>,
        val extendedKeyUsageOids: List<String>,
        val subjectAlternativeNames: List<SanEntry>,
        val crlDistributionPoints: List<String>,
        val accessLocations: List<String>,
        val criticalOids: List<String>,
        val derBytes: Int,
    ) {
        fun validityAt(nowMillis: Long): ValidityState = when {
            nowMillis < notBeforeMillis -> ValidityState.NOT_YET_VALID
            nowMillis > notAfterMillis -> ValidityState.EXPIRED
            else -> ValidityState.CURRENT
        }

        /** DNS names usable for identity matching, lower-cased. */
        val dnsNames: List<String>
            get() = subjectAlternativeNames.filter { it.kind == "DNS" }.map { it.value.lowercase() }

        /**
         * RFC 6125-style matching: exact compare, or a leftmost `*` label that
         * does not span a dot. Wildcards below the leftmost label are refused.
         */
        fun matchesHostname(host: String): Boolean {
            val wanted = host.trim().lowercase().removeSuffix(".")
            if (wanted.isEmpty()) return false
            val names = dnsNames.ifEmpty {
                cnOf(subject)?.let { listOf(it) } ?: emptyList()
            }
            return names.any { pattern ->
                if (pattern == wanted) return@any true
                if (!pattern.startsWith("*.")) return@any false
                val suffix = pattern.removePrefix("*.")
                wanted.endsWith(".$suffix") && wanted.substringBeforeLast(".$suffix").none { it == '.' }
            }
        }

        private fun cnOf(dn: String): String? =
            dn.split(',').firstOrNull { it.trim().startsWith("CN=", ignoreCase = true) }
                ?.substringAfter('=')?.trim()?.lowercase()
    }

    private val KEY_USAGE_NAMES = listOf(
        "digitalSignature", "nonRepudiation", "keyEncipherment", "dataEncipherment",
        "keyAgreement", "keyCertSign", "cRLSign", "encipherOnly", "decipherOnly",
    )

    // --- parsing ------------------------------------------------------------

    /** Accepts PEM text or raw DER, bounded by [MAX_INPUT_BYTES]. */
    fun parse(bytes: ByteArray): ParseOutcome {
        if (bytes.isEmpty()) return ParseOutcome.Rejected(ParseFailure.EMPTY, "no bytes were supplied")
        if (bytes.size > MAX_INPUT_BYTES) {
            return ParseOutcome.Rejected(ParseFailure.TOO_LARGE, "${bytes.size} bytes exceeds the $MAX_INPUT_BYTES byte limit")
        }
        val der = if (looksLikePem(bytes)) pemToDer(bytes) else bytes
        if (der == null) {
            return ParseOutcome.Rejected(ParseFailure.NOT_A_CERTIFICATE, "the PEM body could not be decoded")
        }
        return try {
            val factory = CertificateFactory.getInstance("X.509")
            val certificate = factory.generateCertificate(ByteArrayInputStream(der)) as? X509Certificate
                ?: return ParseOutcome.Rejected(ParseFailure.UNSUPPORTED_TYPE, "not an X.509 certificate")
            ParseOutcome.Parsed(certificate, viewOf(certificate))
        } catch (failure: CertificateException) {
            val message = failure.message.orEmpty().lowercase()
            val reason = when {
                "encoded" in message || "asn" in message || "sequence" in message || "truncated" in message ->
                    ParseFailure.MALFORMED_ASN1

                else -> ParseFailure.NOT_A_CERTIFICATE
            }
            ParseOutcome.Rejected(reason, failure.messageOr(reason.name))
        } catch (failure: IllegalArgumentException) {
            ParseOutcome.Rejected(ParseFailure.MALFORMED_ASN1, failure.messageOr("malformed input"))
        }
    }

    fun parseText(text: String): ParseOutcome = parse(text.toByteArray(Charsets.UTF_8))

    private fun looksLikePem(bytes: ByteArray): Boolean =
        bytes.size > PEM_BEGIN.length && String(bytes, 0, minOf(bytes.size, 64), Charsets.ISO_8859_1)
            .contains("-----BEGIN")

    /** Decodes the first PEM block; extra blocks are a bundle, not one certificate. */
    private fun pemToDer(bytes: ByteArray): ByteArray? {
        val text = String(bytes, Charsets.ISO_8859_1)
        val begin = text.indexOf(PEM_BEGIN)
        if (begin < 0) return null
        val end = text.indexOf("-----END CERTIFICATE-----", begin)
        if (end < 0) return null
        if (text.indexOf(PEM_BEGIN, end) >= 0) return null
        val body = text.substring(begin + PEM_BEGIN.length, end)
            .replace("\r", "").replace("\n", "").replace(" ", "")
        return runCatching { Base64.getMimeDecoder().decode(body) }.getOrNull()
    }

    fun viewOf(cert: X509Certificate): CertificateView {
        val der = runCatching { cert.encoded }.getOrNull() ?: ByteArray(0)
        val keyUsage = cert.keyUsage?.let { bits ->
            KEY_USAGE_NAMES.filterIndexed { index, _ -> bits.getOrNull(index) == true }
        }.orEmpty()
        val eku = runCatching { cert.extendedKeyUsage }.getOrNull().orEmpty()
        val sans = runCatching {
            cert.subjectAlternativeNames.orEmpty().mapNotNull { entry ->
                @Suppress("UNCHECKED_CAST")
                val pair = entry as List<Any?>
                val id = (pair[0] as Int)
                val value = pair[1]
                when (id) {
                    1 -> SanEntry("RFC822", value.toString())
                    2 -> SanEntry("DNS", value.toString())
                    6 -> SanEntry("URI", value.toString())
                    7 -> SanEntry("IP", (value as? java.net.InetAddress)?.hostAddress ?: value.toString())
                    else -> SanEntry("other:$id", value.toString())
                }
            }
        }.getOrNull().orEmpty()
        val basic = runCatching { cert.basicConstraints }.getOrDefault(-1)
        val isCa = basic != -1
        val crl = extensionOf(cert, "2.5.29.31")?.let { decodeGeneralNames(it, "cRL") }
            .orEmpty()
        val aia = extensionOf(cert, "1.3.6.1.5.5.7.1.1")?.let { decodeAia(it) }.orEmpty()
        return CertificateView(
            subject = cert.subjectX500Principal.name,
            issuer = cert.issuerX500Principal.name,
            serialHex = cert.serialNumber.toRadixStringSafe(),
            notBeforeMillis = cert.notBefore.time,
            notAfterMillis = cert.notAfter.time,
            signatureAlgorithm = cert.sigAlgName,
            publicKeyAlgorithm = cert.publicKey.algorithm,
            publicKeyBits = keySizeBits(cert),
            version = cert.version,
            fingerprintSha256 = fingerprintOfDer(der),
            subjectKeyIdentifier = extensionOf(cert, "2.5.29.14")?.toHex(),
            authorityKeyIdentifier = extensionOf(cert, "2.5.29.35")?.toHex(),
            isCa = isCa,
            pathLengthConstraint = when {
                !isCa || basic == Int.MAX_VALUE -> null
                else -> basic
            },
            selfSigned = cert.subjectX500Principal.name == cert.issuerX500Principal.name,
            keyUsage = keyUsage,
            extendedKeyUsageOids = eku,
            subjectAlternativeNames = sans,
            crlDistributionPoints = crl,
            accessLocations = aia,
            criticalOids = runCatching { cert.criticalExtensionOIDs.toSet().sorted() }.getOrDefault(emptyList()),
            derBytes = der.size,
        )
    }

    /** Does `issuerKey` really validate `cert`'s signature? Independent of any trust decision. */
    fun verifySignature(cert: X509Certificate, issuerKey: java.security.PublicKey): Boolean =
        runCatching {
            cert.verify(issuerKey)
            true
        }.getOrDefault(false)

    // --- chain validation ---------------------------------------------------

    /**
     * Validates `leaf + intermediates` against [anchors] at [nowMillis].
     *
     * The anchor set is always supplied by the caller and is reported back to the
     * UI as part of the answer, because "trusted" without naming the anchor it
     * reached is meaningless. Revocation is never enabled: this build holds no
     * network permission, so a silent skip would be a false assurance.
     */
    fun validateChain(
        leaf: X509Certificate,
        intermediates: List<X509Certificate>,
        anchors: Set<TrustAnchor>,
        nowMillis: Long,
    ): ChainOutcome {
        if (anchors.isEmpty()) {
            return ChainOutcome.Failed(ChainFailure.NO_ANCHORS, "no trust anchors were defined", listOf(leaf.subjectX500Principal.name))
        }
        if (anchors.size > MAX_TRUST_ANCHORS) {
            return ChainOutcome.Failed(ChainFailure.TOO_MANY_INPUTS, "at most $MAX_TRUST_ANCHORS anchors are accepted", emptyList())
        }
        if (intermediates.size >= MAX_CHAIN_CERTS) {
            return ChainOutcome.Failed(
                ChainFailure.TOO_MANY_INPUTS,
                "a chain of more than $MAX_CHAIN_CERTS certificates is refused",
                intermediates.map { it.subjectX500Principal.name },
            )
        }
        val anchorSubjects = anchors.mapNotNull { it.trustedCert?.subjectX500Principal?.name }.toSet()
        val path = buildList {
            add(leaf)
            intermediates.forEach { if (it.subjectX500Principal.name !in anchorSubjects) add(it) }
        }
        val subjects = path.map { it.subjectX500Principal.name }
        val factory = runCatching { CertificateFactory.getInstance("X.509") }
            .getOrElse { return ChainOutcome.Failed(ChainFailure.UNSUPPORTED, "no X.509 factory is available", subjects) }
        val certPath = runCatching { factory.generateCertPath(path) }
            .getOrElse { return ChainOutcome.Failed(ChainFailure.UNSUPPORTED, "the chain could not be assembled", subjects) }

        val parameters = PKIXParameters(anchors).apply {
            isRevocationEnabled = false
            date = Date(nowMillis)
        }
        return try {
            val result = java.security.cert.CertPathValidator.getInstance("PKIX").validate(certPath, parameters)
                as java.security.cert.PKIXCertPathValidatorResult
            ChainOutcome.Trusted(
                anchorSubject = result.trustAnchor.trustedCert?.subjectX500Principal?.name
                    ?: result.trustAnchor.getCAName() ?: "unnamed anchor",
                depth = certPath.certificates.size,
                subjects = subjects,
                anchoredByUserChoice = result.trustAnchor.trustedCert != null,
            )
        } catch (failure: java.security.cert.CertPathValidatorException) {
            ChainOutcome.Failed(failure.toFailure(), failure.messageOr("chain rejected"), subjects)
        } catch (failure: java.security.InvalidAlgorithmParameterException) {
            ChainOutcome.Failed(ChainFailure.NO_ANCHORS, failure.messageOr("the anchors are unusable"), subjects)
        } catch (failure: CertificateException) {
            ChainOutcome.Failed(ChainFailure.UNSUPPORTED, failure.messageOr("validation is unsupported"), subjects)
        }
    }

    private fun java.security.cert.CertPathValidatorException.toFailure(): ChainFailure {
        // The message is checked first: PKIX reports "no trust anchor" through the
        // generic UNSPECIFIED reason, and mapping that to a length problem would
        // tell the user the wrong story about their own certificate.
        val text = message.orEmpty().lowercase()
        when {
            "expired" in text -> return ChainFailure.EXPIRED
            "not yet valid" in text || "notbefore" in text -> return ChainFailure.NOT_YET_VALID
            "signature" in text -> return ChainFailure.SIGNATURE_INVALID
            "does not chain" in text || "trust anchor" in text || "anchor" in text ->
                return ChainFailure.UNKNOWN_ISSUER

            "basicconstraints" in text || "not a ca" in text || "issuer constraint" in text ||
                "name constraint" in text -> return ChainFailure.NOT_A_CA_IN_PATH

            "length" in text || "too long" in text -> return ChainFailure.PATH_TOO_LONG
        }
        return when (reason) {
            java.security.cert.CertPathValidatorException.BasicReason.EXPIRED -> ChainFailure.EXPIRED
            java.security.cert.CertPathValidatorException.BasicReason.NOT_YET_VALID -> ChainFailure.NOT_YET_VALID
            java.security.cert.CertPathValidatorException.BasicReason.ALGORITHM_CONSTRAINED -> ChainFailure.POLICY

            else -> ChainFailure.UNKNOWN_ISSUER
        }
    }

    /**
     * Builds a trust anchor from a certificate the user imported. A non-CA,
     * non-self-signed certificate can still be anchored — that is exactly what
     * "the user pinned this key" means — and the outcome flags it as a pinned
     * choice rather than a hierarchy result.
     */
    fun anchorFor(cert: X509Certificate): TrustAnchor = TrustAnchor(cert, null)

    /**
     * The device's own platform trust store, read through the accepted issuers of
     * the default X.509 trust manager — the form that exists on both Android and
     * a plain JDK. Any result using these anchors must name the platform store as
     * the policy, because the user did not choose them.
     */
    fun platformAnchors(): Set<TrustAnchor> = runCatching {
        val factory = javax.net.ssl.TrustManagerFactory.getInstance(javax.net.ssl.TrustManagerFactory.getDefaultAlgorithm())
        factory.init(null as java.security.KeyStore?)
        val manager = factory.trustManagers.firstOrNull { it is javax.net.ssl.X509TrustManager }
            as? javax.net.ssl.X509TrustManager ?: return@runCatching emptySet()
        manager.acceptedIssuers.orEmpty().map { TrustAnchor(it, null) }.toSet()
    }.getOrDefault(emptySet())

    // --- helpers ------------------------------------------------------------

    private fun extensionOf(cert: X509Certificate, oid: String): ByteArray? = runCatching {
        val raw = cert.getExtensionValue(oid) ?: return null
        ASN1Primitive.fromByteArray(raw).let { octets ->
            // Extension values are OCTET STRING wrappers around the real DER.
            val inner = (octets as? org.bouncycastle.asn1.ASN1OctetString)?.octets ?: return null
            inner
        }
    }.getOrNull()

    private fun decodeGeneralNames(der: ByteArray, label: String): List<String> = runCatching {
        GeneralNames.getInstance(ASN1Primitive.fromByteArray(der))
            .names.map { "$label:${it.name}" }
    }.getOrDefault(emptyList())

    private fun decodeAia(der: ByteArray): List<String> = runCatching {
        AuthorityInformationAccess.getInstance(ASN1Primitive.fromByteArray(der)).accessDescriptions
            .map { description: AccessDescription ->
                "${description.accessMethod.idOrName()}→${description.accessLocation.name}"
            }
    }.getOrDefault(emptyList())

    private fun org.bouncycastle.asn1.ASN1ObjectIdentifier.idOrName(): String = when (id) {
        "1.3.6.1.5.5.7.48.1" -> "ocsp"
        "1.3.6.1.5.5.7.48.2" -> "caIssuers"
        else -> id
    }

    private fun ByteArray.toHex(): String = joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }

    /** Colon-grouped SHA-256 of the DER encoding — the usual certificate fingerprint. */
    fun fingerprintOfDer(der: ByteArray): String {
        val digest = java.security.MessageDigest.getInstance("SHA-256").digest(der)
        return digest.toHex().uppercase().chunked(2).joinToString(":")
    }

    private fun keySizeBits(cert: X509Certificate): Int = when (val key = cert.publicKey) {
        is java.security.interfaces.RSAPublicKey -> key.modulus.bitLength()
        is java.security.interfaces.ECPublicKey -> runCatching { key.params.order.bitLength() }.getOrDefault(0)
        is java.security.interfaces.DSAPublicKey -> key.params.p.bitLength()
        else -> 0
    }

    private fun BigInteger.toRadixStringSafe(): String = toString(16).uppercase()

    private fun Throwable.messageOr(fallback: String): String = message?.takeIf { it.isNotBlank() } ?: fallback
}
