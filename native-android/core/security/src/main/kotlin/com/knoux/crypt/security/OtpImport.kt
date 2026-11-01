package com.knoux.crypt.security

import java.util.Base64

/**
 * Strict, offline parsers for the account-import formats (TASK 11).
 *
 * Two sources are accepted:
 *  - a single `otpauth://totp/...` URI (also produced by any QR code);
 *  - Google Authenticator's `otpauth-migration://offline?data=...` export, whose
 *    payload is the published protobuf message. The decoder is hand-written and
 *    bounded: it never trusts a length, never allocates from a declared size
 *    without a cap, skips unknown fields by wire type, and returns a typed
 *    rejection instead of guessing when something does not match.
 *
 * Nothing here logs, stores or transmits a secret; callers receive Base32 text
 * that they must hand straight to the encrypted vault.
 */
enum class OtpAlgorithm(val otpauthName: String) {
    SHA1("SHA1"),
    SHA256("SHA256"),
    SHA512("SHA512"),
}

enum class OtpImportSource { URI, MIGRATION }

data class ImportedOtpAccount(
    val issuer: String,
    val account: String,
    val secretBase32: String,
    val algorithm: OtpAlgorithm = OtpAlgorithm.SHA1,
    val digits: Int = 6,
    val periodSeconds: Int = 30,
    val source: OtpImportSource = OtpImportSource.URI,
) {
    /** Duplicate key: providers are inconsistent about case, so fold it. */
    val duplicateKey: String
        get() = "${issuer.trim().lowercase()}\u0000${account.trim().lowercase()}\u0000$secretBase32"
}

data class MigrationBatch(
    val accounts: List<ImportedOtpAccount>,
    val batchId: Int,
    val batchIndex: Int,
    val batchSize: Int,
) {
    val completePage: Boolean get() = batchSize in 1..MAX_PAGES && batchIndex in 0 until batchSize
    val isMultiPage: Boolean get() = batchSize > 1

    companion object {
        const val MAX_PAGES = 10
    }
}

enum class OtpUnsupportedReason {
    HOTP,
    ALGORITHM,
    DIGITS,
    MIGRATION_FORMAT,
}

enum class OtpInvalidReason {
    EMPTY,
    TOO_LARGE,
    NOT_OTPAUTH,
    MISSING_SECRET,
    BAD_SECRET,
    BAD_DIGITS,
    BAD_PERIOD,
    BAD_LABEL,
    AMBIGUOUS_URI,
    BAD_BASE64,
    MALFORMED_MIGRATION,
    BATCH_INCONSISTENT,
}

sealed class OtpParseResult {
    data class Accounts(
        val accounts: List<ImportedOtpAccount>,
        val migration: MigrationBatch? = null,
    ) : OtpParseResult()

    data class Unsupported(val reason: OtpUnsupportedReason, val detail: String? = null) : OtpParseResult()
    data class Invalid(val reason: OtpInvalidReason, val detail: String? = null) : OtpParseResult()
}

object OtpBase32 {
    private const val ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

    class Base32Exception(message: String) : IllegalArgumentException(message)

    /**
     * RFC 4648 base32, case-insensitive, spaces and hyphens ignored (users paste
     * secrets in groups). Padding is optional but must be consistent; any other
     * character is rejected instead of being dropped.
     */
    fun decode(text: String): ByteArray {
        val cleaned = buildString {
            text.forEach { char ->
                when {
                    char == ' ' || char == '-' || char == '\t' -> Unit
                    char == '=' -> Unit
                    else -> append(char.uppercaseChar())
                }
            }
        }
        if (cleaned.isEmpty()) throw Base32Exception("empty secret")
        if (cleaned.length > 1024) throw Base32Exception("secret too long")
        var buffer = 0
        var bits = 0
        val out = java.io.ByteArrayOutputStream()
        cleaned.forEach { char ->
            val value = ALPHABET.indexOf(char)
            if (value < 0) throw Base32Exception("invalid base32 character")
            buffer = (buffer shl 5) or value
            bits += 5
            if (bits >= 8) {
                bits -= 8
                out.write((buffer shr bits) and 0xFF)
            }
        }
        // Leftover bits must be zero padding, not a truncated symbol.
        if (bits > 0 && (buffer and ((1 shl bits) - 1)) != 0) {
            throw Base32Exception("non-zero base32 padding")
        }
        if (out.size() == 0) throw Base32Exception("empty secret")
        return out.toByteArray()
    }

    fun encode(bytes: ByteArray): String {
        if (bytes.isEmpty()) return ""
        val builder = StringBuilder((bytes.size * 8 + 4) / 5)
        var buffer = 0
        var bits = 0
        bytes.forEach { byte ->
            buffer = (buffer shl 8) or (byte.toInt() and 0xFF)
            bits += 8
            while (bits >= 5) {
                bits -= 5
                builder.append(ALPHABET[(buffer shr bits) and 0x1F])
            }
        }
        if (bits > 0) builder.append(ALPHABET[(buffer shl (5 - bits)) and 0x1F])
        return builder.toString()
    }
}

object OtpAuthParser {
    private const val MAX_URI = 8_192
    private const val MAX_ISSUER = 128
    private const val MAX_ACCOUNT = 256

    fun parse(raw: String): OtpParseResult {
        val value = raw.trim()
        if (value.isEmpty()) return OtpParseResult.Invalid(OtpInvalidReason.EMPTY)
        if (value.length > MAX_URI) return OtpParseResult.Invalid(OtpInvalidReason.TOO_LARGE)
        return when {
            value.startsWith("otpauth-migration://", ignoreCase = true) -> OtpMigrationParser.parse(value)
            value.startsWith("otpauth://", ignoreCase = true) -> parseSingle(value)
            else -> OtpParseResult.Invalid(OtpInvalidReason.NOT_OTPAUTH)
        }
    }

    private fun parseSingle(uri: String): OtpParseResult {
        val rest = uri.substringAfter("://", "")
        val type = rest.substringBefore('/').substringBefore('?').lowercase()
        if (type == "hotp") return OtpParseResult.Unsupported(OtpUnsupportedReason.HOTP)
        if (type != "totp") return OtpParseResult.Invalid(OtpInvalidReason.NOT_OTPAUTH, type)

        val pathAndQuery = rest.substringAfter('/', "")
        val labelRaw = pathAndQuery.substringBefore('?')
        val queryRaw = pathAndQuery.substringAfter('?', "")
        val params = parseQuery(queryRaw)
        if (params.values.any { it == DUPLICATE_MARKER }) {
            return OtpParseResult.Invalid(OtpInvalidReason.AMBIGUOUS_URI)
        }

        val label = runCatching { java.net.URLDecoder.decode(labelRaw, "UTF-8") }.getOrDefault(labelRaw)
        val queryIssuer = params["issuer"]?.let { runCatching { java.net.URLDecoder.decode(it, "UTF-8") }.getOrDefault(it) }
        val (labelIssuer, account) = splitLabel(label)
        val issuer = (queryIssuer ?: labelIssuer).orEmpty().trim()
        if (issuer.length > MAX_ISSUER) return OtpParseResult.Invalid(OtpInvalidReason.BAD_LABEL)
        if (account.isBlank()) return OtpParseResult.Invalid(OtpInvalidReason.BAD_LABEL)
        if (account.length > MAX_ACCOUNT) return OtpParseResult.Invalid(OtpInvalidReason.BAD_LABEL)

        val secretRaw = params["secret"]?.trim().orEmpty()
        if (secretRaw.isEmpty()) return OtpParseResult.Invalid(OtpInvalidReason.MISSING_SECRET)
        val secretBytes = try {
            OtpBase32.decode(secretRaw)
        } catch (failure: OtpBase32.Base32Exception) {
            return OtpParseResult.Invalid(OtpInvalidReason.BAD_SECRET, failure.message)
        }
        if (secretBytes.size !in 10..64) return OtpParseResult.Invalid(OtpInvalidReason.BAD_SECRET)

        val algorithm = when (params["algorithm"]?.uppercase() ?: "SHA1") {
            "SHA1" -> OtpAlgorithm.SHA1
            "SHA256" -> OtpAlgorithm.SHA256
            "SHA512" -> OtpAlgorithm.SHA512
            else -> return OtpParseResult.Unsupported(OtpUnsupportedReason.ALGORITHM, params["algorithm"])
        }
        val digits = when (val raw = params["digits"]) {
            null -> 6
            "6" -> 6
            "8" -> 8
            else -> return OtpParseResult.Unsupported(OtpUnsupportedReason.DIGITS, raw)
        }
        val period = when (val raw = params["period"]) {
            null -> 30
            else -> raw.toIntOrNull()?.takeIf { it in 15..120 }
                ?: return OtpParseResult.Invalid(OtpInvalidReason.BAD_PERIOD, raw)
        }

        return OtpParseResult.Accounts(
            listOf(
                ImportedOtpAccount(
                    issuer = issuer,
                    account = account.trim(),
                    secretBase32 = OtpBase32.encode(secretBytes),
                    algorithm = algorithm,
                    digits = digits,
                    periodSeconds = period,
                    source = OtpImportSource.URI,
                ),
            ),
        )
    }

    private fun splitLabel(label: String): Pair<String?, String> {
        val cleaned = label.trim().removePrefix("/")
        val colon = cleaned.indexOf(':')
        return if (colon > 0) {
            cleaned.substring(0, colon).trim() to cleaned.substring(colon + 1).trim()
        } else {
            null to cleaned
        }
    }

    private const val DUPLICATE_MARKER = "\u0000duplicate"

    private fun parseQuery(query: String): Map<String, String> {
        if (query.isEmpty()) return emptyMap()
        val map = LinkedHashMap<String, String>()
        query.split('&').forEach { pair ->
            if (pair.isEmpty()) return@forEach
            val key = pair.substringBefore('=').lowercase()
            val value = pair.substringAfter('=', "")
            // First occurrence wins and duplicates of a known key are rejected
            // by returning a marker the caller treats as invalid.
            if (map.containsKey(key)) map[key] = "\u0000duplicate" else map[key] = value
        }
        return map
    }
}

/**
 * Bounded decoder for the published Google Authenticator export message.
 * Unknown fields are skipped by wire type; every length is checked against the
 * remaining buffer before use.
 */
object OtpMigrationParser {
    private const val MAX_PAYLOAD_BYTES = 64 * 1024
    private const val MAX_ACCOUNTS = 100
    private const val MAX_NAME = 256
    private const val MAX_ISSUER = 128
    private const val MAX_SECRET_BYTES = 64

    fun parse(uri: String): OtpParseResult {
        val query = uri.substringAfter('?', "")
        val params = query.split('&').filter { '=' in it }.associate {
            it.substringBefore('=') to it.substringAfter('=')
        }
        val data = params["data"] ?: return OtpParseResult.Invalid(OtpInvalidReason.MALFORMED_MIGRATION)
        val bytes = try {
            Base64.getUrlDecoder().decode(data.trim().trimEnd('='))
        } catch (_: IllegalArgumentException) {
            return OtpParseResult.Invalid(OtpInvalidReason.BAD_BASE64)
        }
        if (bytes.isEmpty() || bytes.size > MAX_PAYLOAD_BYTES) {
            return OtpParseResult.Invalid(OtpInvalidReason.TOO_LARGE)
        }
        return try {
            decodePayload(bytes)
        } catch (failure: MigrationException) {
            OtpParseResult.Invalid(OtpInvalidReason.MALFORMED_MIGRATION, failure.message)
        }
    }

    private class MigrationException(message: String) : Exception(message)

    private class Reader(private val bytes: ByteArray) {
        var index = 0

        fun hasMore(): Boolean = index < bytes.size

        fun varint(): Long {
            var result = 0L
            var shift = 0
            while (true) {
                if (index >= bytes.size) throw MigrationException("truncated varint")
                if (shift > 63) throw MigrationException("varint too long")
                val byte = bytes[index++].toInt() and 0xFF
                result = result or ((byte and 0x7F).toLong() shl shift)
                if (byte and 0x80 == 0) return result
                shift += 7
            }
        }

        fun bytes(): ByteArray {
            val length = varint()
            if (length < 0 || length > bytes.size - index) throw MigrationException("length out of range")
            val slice = bytes.copyOfRange(index, index + length.toInt())
            index += length.toInt()
            return slice
        }
    }

    private fun decodePayload(bytes: ByteArray): OtpParseResult {
        val reader = Reader(bytes)
        val accounts = ArrayList<ImportedOtpAccount>()
        var version = 0L
        var batchSize = 1L
        var batchIndex = 0L
        var batchId = 0L
        var sawVersion = false
        var unsupported: OtpParseResult.Unsupported? = null

        while (reader.hasMore()) {
            val tag = reader.varint()
            val field = (tag ushr 3).toInt()
            val wire = (tag and 0x7).toInt()
            when (field) {
                1 -> {
                    if (wire != 2) throw MigrationException("otp_parameters must be length-delimited")
                    if (accounts.size >= MAX_ACCOUNTS) throw MigrationException("too many accounts")
                    val parsed = decodeAccount(reader.bytes())
                    when (parsed) {
                        is OtpParseResult.Accounts -> accounts += parsed.accounts
                        is OtpParseResult.Unsupported -> unsupported = unsupported ?: parsed
                        is OtpParseResult.Invalid -> throw MigrationException(parsed.detail ?: "bad account")
                    }
                }
                2 -> { version = reader.varint(); sawVersion = true }
                3 -> batchSize = reader.varint()
                4 -> batchIndex = reader.varint()
                5 -> batchId = reader.varint()
                else -> skip(reader, wire)
            }
        }

        if (!sawVersion || version != 1L) {
            return OtpParseResult.Invalid(OtpInvalidReason.MALFORMED_MIGRATION, "unsupported version")
        }
        if (batchSize !in 1..MigrationBatch.MAX_PAGES.toLong() || batchIndex !in 0 until batchSize) {
            return OtpParseResult.Invalid(OtpInvalidReason.BATCH_INCONSISTENT)
        }
        if (accounts.isEmpty() && unsupported == null) {
            return OtpParseResult.Invalid(OtpInvalidReason.MALFORMED_MIGRATION, "no accounts")
        }
        unsupported?.let { return it }
        return OtpParseResult.Accounts(accounts, MigrationBatch(accounts, batchId.toInt(), batchIndex.toInt(), batchSize.toInt()))
    }

    private fun decodeAccount(bytes: ByteArray): OtpParseResult {
        val reader = Reader(bytes)
        var secret: ByteArray? = null
        var name = ""
        var issuer = ""
        var algorithm = 0L
        var digits = 0L
        var type = 0L
        var sawType = false

        while (reader.hasMore()) {
            val tag = reader.varint()
            val field = (tag ushr 3).toInt()
            val wire = (tag and 0x7).toInt()
            when (field) {
                1 -> {
                    if (wire != 2) throw MigrationException("secret must be bytes")
                    if (secret != null) throw MigrationException("duplicate secret")
                    secret = reader.bytes()
                }
                2 -> { if (wire != 2) throw MigrationException("name"); name = utf8(reader.bytes(), MAX_NAME) }
                3 -> { if (wire != 2) throw MigrationException("issuer"); issuer = utf8(reader.bytes(), MAX_ISSUER) }
                4 -> algorithm = reader.varint()
                5 -> digits = reader.varint()
                6 -> { type = reader.varint(); sawType = true }
                7 -> reader.varint() // HOTP counter, intentionally ignored
                else -> skip(reader, wire)
            }
        }

        if (!sawType) return OtpParseResult.Invalid(OtpInvalidReason.MALFORMED_MIGRATION, "missing type")
        if (type == 1L) return OtpParseResult.Unsupported(OtpUnsupportedReason.HOTP)
        if (type != 2L) return OtpParseResult.Invalid(OtpInvalidReason.MALFORMED_MIGRATION, "unknown type")

        val key = secret ?: return OtpParseResult.Invalid(OtpInvalidReason.MISSING_SECRET)
        if (key.size !in 10..MAX_SECRET_BYTES) return OtpParseResult.Invalid(OtpInvalidReason.BAD_SECRET)

        val mappedAlgorithm = when (algorithm) {
            0L, 1L -> OtpAlgorithm.SHA1
            2L -> OtpAlgorithm.SHA256
            3L -> OtpAlgorithm.SHA512
            else -> return OtpParseResult.Unsupported(OtpUnsupportedReason.ALGORITHM, "algorithm=$algorithm")
        }
        val mappedDigits = when (digits) {
            0L, 1L -> 6
            2L -> 8
            else -> return OtpParseResult.Unsupported(OtpUnsupportedReason.DIGITS, "digits=$digits")
        }

        // Google stores the account sometimes as "issuer:account".
        val colon = name.indexOf(':')
        var finalIssuer = issuer.trim()
        var finalAccount = name.trim()
        if (finalIssuer.isEmpty() && colon > 0) {
            finalIssuer = name.substring(0, colon).trim()
            finalAccount = name.substring(colon + 1).trim()
        }
        if (finalAccount.isEmpty()) return OtpParseResult.Invalid(OtpInvalidReason.BAD_LABEL)

        return OtpParseResult.Accounts(
            listOf(
                ImportedOtpAccount(
                    issuer = finalIssuer,
                    account = finalAccount,
                    secretBase32 = OtpBase32.encode(key),
                    algorithm = mappedAlgorithm,
                    digits = mappedDigits,
                    periodSeconds = 30,
                    source = OtpImportSource.MIGRATION,
                ),
            ),
        )
    }

    private fun utf8(bytes: ByteArray, max: Int): String {
        if (bytes.size > max) throw MigrationException("text field too long")
        return String(bytes, Charsets.UTF_8)
    }

    private fun skip(reader: Reader, wire: Int) {
        when (wire) {
            0 -> reader.varint()
            1 -> repeat(8) { if (!reader.hasMore()) throw MigrationException("truncated fixed64"); reader.index++ }
            2 -> reader.bytes()
            5 -> repeat(4) { if (!reader.hasMore()) throw MigrationException("truncated fixed32"); reader.index++ }
            else -> throw MigrationException("unsupported wire type $wire")
        }
    }
}
