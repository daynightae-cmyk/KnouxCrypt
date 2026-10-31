package com.knoux.crypt.data

import com.knoux.crypt.security.StrengthLevel

/**
 * Pure rules behind the credential detail screen (TASK 09). Keeping them here
 * means the JVM tests exercise the same code the Compose screen uses, and the
 * screen cannot drift into weaker checks of its own.
 */

/** Verdict for the origin/URL field of a credential. */
sealed class OriginVerdict {
    data object Empty : OriginVerdict()
    data class Valid(val scheme: String, val host: String) : OriginVerdict()
    /** [reason] is a machine-readable code the UI localises. */
    data class Invalid(val reason: String) : OriginVerdict()

    val isAccepted: Boolean get() = this !is Invalid
}

object CredentialOrigins {
    const val MAX_LENGTH = 2048
    const val REASON_UNSUPPORTED_SCHEME = "unsupported_scheme"
    const val REASON_MISSING_HOST = "missing_host"
    const val REASON_EMBEDDED_CREDENTIALS = "embedded_credentials"
    const val REASON_BLANK_HOST = "blank_host"
    const val REASON_TOO_LONG = "too_long"
    const val REASON_CONTROL_CHARS = "control_chars"
    const val REASON_SPACES = "spaces"

    /**
     * Validates what the user typed as an origin. Blank is accepted (an offline
     * credential is legitimate). Anything that is not a syntactically plain
     * http/https origin is rejected, including URLs that embed a user name or
     * password, because those would store a second secret in a plain field.
     */
    fun validate(raw: String): OriginVerdict {
        val value = raw.trim()
        if (value.isEmpty()) return OriginVerdict.Empty
        if (value.length > MAX_LENGTH) return OriginVerdict.Invalid(REASON_TOO_LONG)
        if (value.any { it.code < 0x20 || it.code == 0x7F }) return OriginVerdict.Invalid(REASON_CONTROL_CHARS)
        if (value.any { it.isWhitespace() }) return OriginVerdict.Invalid(REASON_SPACES)
        val schemeEnd = value.indexOf("://")
        if (schemeEnd <= 0) return OriginVerdict.Invalid(REASON_UNSUPPORTED_SCHEME)
        val scheme = value.substring(0, schemeEnd).lowercase()
        if (scheme != "http" && scheme != "https") return OriginVerdict.Invalid(REASON_UNSUPPORTED_SCHEME)
        val rest = value.substring(schemeEnd + 3)
        val authorityPart = rest.substringBefore('/').substringBefore('?').substringBefore('#')
        if (authorityPart.contains('@')) return OriginVerdict.Invalid(REASON_EMBEDDED_CREDENTIALS)
        val host = authorityPart.substringBefore(':')
        if (host.isBlank()) return OriginVerdict.Invalid(REASON_BLANK_HOST)
        if (host != "localhost" && !host.contains('.')) return OriginVerdict.Invalid(REASON_MISSING_HOST)
        return OriginVerdict.Valid(scheme, host)
    }
}

/** Bounded, plaintext-free revision history for one credential. */
object PasswordRevisions {
    const val MAX_ENTRIES = 20

    fun append(existing: List<PasswordRevision>, entry: PasswordRevision): List<PasswordRevision> =
        (listOf(entry) + existing).take(MAX_ENTRIES)

    fun entry(savedAt: Long, strength: StrengthLevel, changed: Set<String>): PasswordRevision =
        PasswordRevision(savedAt = savedAt, strength = strength.name, changed = changed.sorted())
}

/** Whether a reveal is permitted right now, and for how long. */
enum class RevealGate { ALLOWED, NO_SESSION, SESSION_TOO_OLD }

object CredentialRevealPolicy {
    /** A reveal needs a recently minted capability, not just any live session. */
    const val RECENT_SESSION_MILLIS = 60_000L

    /** Visible plaintext hides again on its own. */
    const val AUTO_HIDE_MILLIS = 15_000L

    fun gate(sessionAgeMillis: Long?): RevealGate = when {
        sessionAgeMillis == null -> RevealGate.NO_SESSION
        sessionAgeMillis > RECENT_SESSION_MILLIS -> RevealGate.SESSION_TOO_OLD
        else -> RevealGate.ALLOWED
    }

    fun stillVisible(revealedAtMillis: Long, nowMillis: Long): Boolean =
        nowMillis - revealedAtMillis in 0 until AUTO_HIDE_MILLIS
}

/** Which fields a save actually changed, for the revision record. */
object CredentialDiff {
    fun changedFields(before: PasswordPayload, after: PasswordPayload): Set<String> {
        val changed = LinkedHashSet<String>()
        if (before.title != after.title) changed += "title"
        if (before.username != after.username) changed += "username"
        if (before.password != after.password) changed += "secret"
        if (before.url != after.url) changed += "origin"
        if (before.notes != after.notes) changed += "notes"
        return changed
    }
}
