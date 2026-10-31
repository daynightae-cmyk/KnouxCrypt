package com.knoux.crypt.security

import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Known-answer tests for the import parsers. The migration payloads are built
 * with a tiny encoder inside the test so every field and boundary is explicit.
 */
class OtpImportTest {

    // ---- Base32 -------------------------------------------------------------

    @Test
    fun base32MatchesRfcVectorsAndIsForgivingAboutGrouping() {
        assertEquals("foo", String(OtpBase32.decode("MZXW6===")))
        assertEquals("foobar", String(OtpBase32.decode("MZXW6YTBOI======")))
        assertEquals("foobar", String(OtpBase32.decode("mzxw 6ytb oi")))
        assertEquals("JBSWY3DPEHPK3PXP", OtpBase32.encode(OtpBase32.decode("JBSWY3DPEHPK3PXP")))
        assertTrue(runCatching { OtpBase32.decode("MZXW6YT!") }.isFailure)
        assertTrue(runCatching { OtpBase32.decode("") }.isFailure)
    }

    // ---- otpauth:// ---------------------------------------------------------

    @Test
    fun standardGoogleStyleUriParsesWithLabelIssuer() {
        val result = OtpAuthParser.parse(
            "otpauth://totp/ACME%20Co:john@example.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME%20Co&algorithm=SHA1&digits=6&period=30",
        )
        val account = (result as OtpParseResult.Accounts).accounts.single()
        assertEquals("ACME Co", account.issuer)
        assertEquals("john@example.com", account.account)
        assertEquals("JBSWY3DPEHPK3PXP", account.secretBase32)
        assertEquals(OtpAlgorithm.SHA1, account.algorithm)
        assertEquals(6, account.digits)
        assertEquals(30, account.periodSeconds)
    }

    @Test
    fun supportedVariantsAreAccepted() {
        val sha256 = OtpAuthParser.parse(
            "otpauth://totp/Vault:me?secret=JBSWY3DPEHPK3PXPMZXW6YTBOI&algorithm=SHA256&digits=8&period=60",
        ) as OtpParseResult.Accounts
        assertEquals(OtpAlgorithm.SHA256, sha256.accounts.single().algorithm)
        assertEquals(8, sha256.accounts.single().digits)
        assertEquals(60, sha256.accounts.single().periodSeconds)

        val noIssuer = OtpAuthParser.parse("otpauth://totp/only-account?secret=JBSWY3DPEHPK3PXP") as OtpParseResult.Accounts
        assertEquals("", noIssuer.accounts.single().issuer)
        assertEquals("only-account", noIssuer.accounts.single().account)
        assertEquals(30, noIssuer.accounts.single().periodSeconds)
        assertEquals(6, noIssuer.accounts.single().digits)
    }

    @Test
    fun unsupportedAndInvalidUrisAreTypedNotGuessed() {
        fun unsupported(uri: String) = OtpAuthParser.parse(uri) as OtpParseResult.Unsupported
        fun invalid(uri: String) = OtpAuthParser.parse(uri) as OtpParseResult.Invalid

        assertEquals(OtpUnsupportedReason.HOTP, unsupported("otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=1").reason)
        assertEquals(
            OtpUnsupportedReason.ALGORITHM,
            unsupported("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=MD5").reason,
        )
        assertEquals(
            OtpUnsupportedReason.DIGITS,
            unsupported("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=7").reason,
        )

        assertEquals(OtpInvalidReason.EMPTY, invalid("").reason)
        assertEquals(OtpInvalidReason.NOT_OTPAUTH, invalid("https://example.com/otp").reason)
        assertEquals(OtpInvalidReason.MISSING_SECRET, invalid("otpauth://totp/x").reason)
        assertEquals(OtpInvalidReason.BAD_SECRET, invalid("otpauth://totp/x?secret=!!!!").reason)
        assertEquals(OtpInvalidReason.BAD_PERIOD, invalid("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=5").reason)
        assertEquals(
            OtpInvalidReason.AMBIGUOUS_URI,
            invalid("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&secret=JBSWY3DPEHPK3PXQ").reason,
        )
        assertEquals(OtpInvalidReason.TOO_LARGE, invalid("otpauth://totp/x?secret=" + "A".repeat(9000)).reason)
    }

    // ---- otpauth-migration:// ----------------------------------------------

    private fun varint(value: Long): ByteArray {
        var remaining = value
        val out = java.io.ByteArrayOutputStream()
        while (true) {
            val byte = (remaining and 0x7F).toInt()
            remaining = remaining ushr 7
            if (remaining == 0L) {
                out.write(byte)
                return out.toByteArray()
            }
            out.write(byte or 0x80)
        }
    }

    private fun fieldBytes(field: Int, payload: ByteArray): ByteArray =
        varint((field.toLong() shl 3) or 2L) + varint(payload.size.toLong()) + payload

    private fun fieldVarint(field: Int, value: Long): ByteArray = varint(field.toLong() shl 3) + varint(value)

    private fun account(
        secret: ByteArray,
        name: String,
        issuer: String,
        algorithm: Long = 1L,
        digits: Long = 1L,
        type: Long = 2L,
    ): ByteArray = fieldBytes(1, secret) +
        fieldBytes(2, name.toByteArray()) +
        fieldBytes(3, issuer.toByteArray()) +
        fieldVarint(4, algorithm) +
        fieldVarint(5, digits) +
        fieldVarint(6, type)

    private fun migrationUri(payload: ByteArray): String {
        val encoded = Base64.getUrlEncoder().withoutPadding().encodeToString(payload)
        return "otpauth-migration://offline?data=$encoded"
    }

    private val secret20 = ByteArray(20) { (it + 1).toByte() }

    @Test
    fun twoAccountExportParsesIntoBothAccounts() {
        val payload = fieldBytes(1, account(secret20, "dev@example.com", "Example Git")) +
            fieldBytes(1, account(ByteArray(32) { (it * 2 + 3).toByte() }, "user@example.com", "Example Mail", algorithm = 2L, digits = 2L)) +
            fieldVarint(2, 1L) +
            fieldVarint(3, 1L) +
            fieldVarint(4, 0L) +
            fieldVarint(5, 77L)

        val result = OtpAuthParser.parse(migrationUri(payload)) as OtpParseResult.Accounts
        assertEquals(2, result.accounts.size)
        assertEquals("Example Git", result.accounts[0].issuer)
        assertEquals("dev@example.com", result.accounts[0].account)
        assertEquals(OtpBase32.encode(secret20), result.accounts[0].secretBase32)
        assertEquals(OtpAlgorithm.SHA1, result.accounts[0].algorithm)
        assertEquals(OtpAlgorithm.SHA256, result.accounts[1].algorithm)
        assertEquals(8, result.accounts[1].digits)
        val batch = result.migration ?: error("migration metadata missing")
        assertEquals(1, batch.batchSize)
        assertEquals(0, batch.batchIndex)
        assertEquals(77, batch.batchId)
        assertEquals(false, batch.isMultiPage)
    }

    @Test
    fun multiPageExportCarriesItsIndex() {
        val payload = fieldBytes(1, account(secret20, "me@example.com", "Mail")) +
            fieldVarint(2, 1L) + fieldVarint(3, 2L) + fieldVarint(4, 1L) + fieldVarint(5, 9L)
        val result = OtpAuthParser.parse(migrationUri(payload)) as OtpParseResult.Accounts
        val batch = result.migration ?: error("missing batch")
        assertTrue(batch.isMultiPage)
        assertEquals(2, batch.batchSize)
        assertEquals(1, batch.batchIndex)
        assertEquals(9, batch.batchId)
    }

    @Test
    fun unsupportedTypesAndAlgorithmsAreExplained() {
        fun unsupported(payload: ByteArray) =
            OtpAuthParser.parse(migrationUri(payload)) as OtpParseResult.Unsupported

        assertEquals(
            OtpUnsupportedReason.HOTP,
            unsupported(fieldBytes(1, account(secret20, "me", "Mail", type = 1L)) + fieldVarint(2, 1L)).reason,
        )
        assertEquals(
            OtpUnsupportedReason.ALGORITHM,
            unsupported(fieldBytes(1, account(secret20, "me", "Mail", algorithm = 4L)) + fieldVarint(2, 1L)).reason,
        )
        assertEquals(
            OtpUnsupportedReason.DIGITS,
            unsupported(fieldBytes(1, account(secret20, "me", "Mail", digits = 3L)) + fieldVarint(2, 1L)).reason,
        )
    }

    @Test
    fun malformedPayloadsAreRejectedWithTypedReasons() {
        fun invalid(uri: String) = OtpAuthParser.parse(uri) as OtpParseResult.Invalid

        assertEquals(OtpInvalidReason.BAD_BASE64, invalid("otpauth-migration://offline?data=%%%").reason)
        assertEquals(
            OtpInvalidReason.MALFORMED_MIGRATION,
            invalid(migrationUri(byteArrayOf(0x0A, 0x7F))).reason, // declared length past the end
        )
        // Missing version field.
        assertEquals(
            OtpInvalidReason.MALFORMED_MIGRATION,
            invalid(migrationUri(fieldBytes(1, account(secret20, "me", "Mail")))).reason,
        )
        // Version 2 is not the documented format.
        assertEquals(
            OtpInvalidReason.MALFORMED_MIGRATION,
            invalid(migrationUri(fieldBytes(1, account(secret20, "me", "Mail")) + fieldVarint(2, 2L))).reason,
        )
        // batch_index outside batch_size.
        assertEquals(
            OtpInvalidReason.BATCH_INCONSISTENT,
            invalid(
                migrationUri(
                    fieldBytes(1, account(secret20, "me", "Mail")) + fieldVarint(2, 1L) +
                        fieldVarint(3, 1L) + fieldVarint(4, 1L),
                ),
            ).reason,
        )
        // Missing type field cannot be assumed.
        assertEquals(
            OtpInvalidReason.MALFORMED_MIGRATION,
            invalid(
                migrationUri(
                    fieldBytes(1, fieldBytes(1, secret20) + fieldBytes(2, "me".toByteArray()) + fieldVarint(4, 1L)) +
                        fieldVarint(2, 1L),
                ),
            ).reason,
        )
    }

    @Test
    fun unknownFieldsAreSkippedNotFatal() {
        // A future field (number 9, wire type 2) must be ignored.
        val extra = fieldBytes(9, "future".toByteArray())
        val payload = fieldBytes(1, account(secret20, "me@example.com", "Mail")) + fieldVarint(2, 1L) + extra
        val result = OtpAuthParser.parse(migrationUri(payload)) as OtpParseResult.Accounts
        assertEquals(1, result.accounts.size)
    }

    @Test
    fun oversizedAndEmptyMigrationPayloadsAreRejected() {
        val huge = ByteArray(70_000) { 1 }
        val uri = "otpauth-migration://offline?data=" + Base64.getUrlEncoder().encodeToString(huge)
        assertEquals(OtpInvalidReason.TOO_LARGE, (OtpAuthParser.parse(uri) as OtpParseResult.Invalid).reason)
        assertEquals(
            OtpInvalidReason.MALFORMED_MIGRATION,
            (OtpAuthParser.parse("otpauth-migration://offline") as OtpParseResult.Invalid).reason,
        )
    }
}
