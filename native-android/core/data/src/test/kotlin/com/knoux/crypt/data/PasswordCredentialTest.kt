package com.knoux.crypt.data

import com.knoux.crypt.security.StrengthLevel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure rules behind the credential detail screen (TASK 09): origin validation,
 * plaintext-free revision history, the reveal window and save diffing.
 */
class PasswordCredentialTest {

    @Test
    fun blankOriginIsAcceptedAsNotSet() {
        assertEquals(OriginVerdict.Empty, CredentialOrigins.validate(""))
        assertEquals(OriginVerdict.Empty, CredentialOrigins.validate("   "))
    }

    @Test
    fun wellFormedOriginsAreAccepted() {
        val https = CredentialOrigins.validate("https://mail.example.com/inbox")
        assertTrue(https is OriginVerdict.Valid && https.scheme == "https" && https.host == "mail.example.com")
        val http = CredentialOrigins.validate("http://localhost:8080")
        assertTrue(http is OriginVerdict.Valid && http.host == "localhost")
    }

    @Test
    fun unsafeOrMalformedOriginsAreRejected() {
        fun reason(value: String): String = (CredentialOrigins.validate(value) as OriginVerdict.Invalid).reason

        assertEquals(CredentialOrigins.REASON_UNSUPPORTED_SCHEME, reason("ftp://files.example.com"))
        assertEquals(CredentialOrigins.REASON_UNSUPPORTED_SCHEME, reason("example.com"))
        assertEquals(CredentialOrigins.REASON_UNSUPPORTED_SCHEME, reason("javascript:alert(1)"))
        assertEquals(CredentialOrigins.REASON_MISSING_HOST, reason("https://example"))
        assertEquals(CredentialOrigins.REASON_BLANK_HOST, reason("https://:8080/x"))
        assertEquals(
            CredentialOrigins.REASON_EMBEDDED_CREDENTIALS,
            reason("https://user:pass@example.com"),
        )
        assertEquals(CredentialOrigins.REASON_SPACES, reason("https://exa mple.com"))
        assertEquals(CredentialOrigins.REASON_CONTROL_CHARS, reason("https://exa\u0000mple.com"))
        assertEquals(CredentialOrigins.REASON_TOO_LONG, reason("https://" + "a".repeat(3000)))
    }

    @Test
    fun revisionHistoryIsBoundedAndNewestFirst() {
        var history = emptyList<PasswordRevision>()
        repeat(30) { index ->
            history = PasswordRevisions.append(
                history,
                PasswordRevision(savedAt = 1_000L + index, strength = StrengthLevel.STRONG.name, changed = listOf("secret")),
            )
        }
        assertEquals(PasswordRevisions.MAX_ENTRIES, history.size)
        assertEquals(1_029L, history.first().savedAt)
        assertEquals(1_010L, history.last().savedAt)
    }

    @Test
    fun revisionEntriesCarryNoSecretMaterial() {
        val entry = PasswordRevisions.entry(
            savedAt = 5_000L,
            strength = StrengthLevel.WEAK,
            changed = setOf("secret", "username"),
        )
        assertEquals("WEAK", entry.strength)
        assertEquals(listOf("secret", "username"), entry.changed)
        assertFalse(entry.toString().contains("hunter2"))
    }

    @Test
    fun revealRequiresAFreshAuthenticatedSession() {
        assertEquals(RevealGate.NO_SESSION, CredentialRevealPolicy.gate(null))
        assertEquals(RevealGate.ALLOWED, CredentialRevealPolicy.gate(0L))
        assertEquals(
            RevealGate.ALLOWED,
            CredentialRevealPolicy.gate(CredentialRevealPolicy.RECENT_SESSION_MILLIS),
        )
        assertEquals(
            RevealGate.SESSION_TOO_OLD,
            CredentialRevealPolicy.gate(CredentialRevealPolicy.RECENT_SESSION_MILLIS + 1),
        )
    }

    @Test
    fun revealedSecretHidesItselfAfterTheWindow() {
        val revealedAt = 100_000L
        assertTrue(CredentialRevealPolicy.stillVisible(revealedAt, revealedAt))
        assertTrue(
            CredentialRevealPolicy.stillVisible(
                revealedAt,
                revealedAt + CredentialRevealPolicy.AUTO_HIDE_MILLIS - 1,
            ),
        )
        assertFalse(
            CredentialRevealPolicy.stillVisible(
                revealedAt,
                revealedAt + CredentialRevealPolicy.AUTO_HIDE_MILLIS,
            ),
        )
        assertFalse(CredentialRevealPolicy.stillVisible(revealedAt, revealedAt - 1))
    }

    @Test
    fun saveDiffNamesOnlyWhatActuallyChanged() {
        val before = PasswordPayload("Mail", "me", "old-secret", "https://a.example", "note")
        val same = before.copy(revisions = listOf(PasswordRevision(1L, "STRONG")))
        assertEquals(emptySet<String>(), CredentialDiff.changedFields(before, same))

        val changed = CredentialDiff.changedFields(
            before,
            before.copy(password = "new-secret", url = "https://b.example"),
        )
        assertEquals(setOf("secret", "origin"), changed)
    }

    @Test
    fun legacyPayloadWithoutHistoryStillDecodes() {
        val legacy = """{"title":"Old","username":"me","password":"pw","url":"","notes":""}"""
        val decoded = SecretsJson.decodePassword(legacy)
        assertTrue(decoded != null && decoded.revisions.isEmpty())
    }

    @Test
    fun historySurvivesThePayloadCodec() {
        val payload = PasswordPayload(
            title = "Mail",
            username = "me",
            password = "S3cret!vector",
            url = "https://mail.example",
            notes = "",
            revisions = listOf(
                PasswordRevision(2_000L, "EXCELLENT", listOf("secret")),
                PasswordRevision(1_000L, "WEAK", listOf("title")),
            ),
        )
        val decoded = SecretsJson.decodePassword(SecretsJson.encodePassword(payload))
        assertEquals(payload, decoded)
    }
}
