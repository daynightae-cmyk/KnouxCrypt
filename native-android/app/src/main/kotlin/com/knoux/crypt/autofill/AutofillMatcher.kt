package com.knoux.crypt.autofill

import java.net.URI

/**
 * Honest matching rules for Android Autofill suggestions.
 *
 * The data module stores credentials with URLs; this matcher decides which of
 * them may be offered for a given form. It is pure Kotlin so the rules can be
 * exercised by JVM tests without an Android runtime.
 */
data class AutofillCredential(
    val recordId: String,
    val title: String,
    val username: String,
    val password: String,
    val url: String,
)

enum class AutofillQueryKind { WEB, APP }

data class AutofillQuery(val kind: AutofillQueryKind, val host: String)

object AutofillMatcher {
    const val MAX_SUGGESTIONS = 5

    fun buildQuery(webDomain: String?, packageName: String?): AutofillQuery? {
        normalizeHost(webDomain)?.let { return AutofillQuery(AutofillQueryKind.WEB, it) }
        normalizeHost(packageName)?.let { return AutofillQuery(AutofillQueryKind.APP, it) }
        return null
    }

    fun suggestions(
        credentials: List<AutofillCredential>,
        query: AutofillQuery?,
    ): List<AutofillCredential> {
        if (query == null) return emptyList()
        return credentials
            .asSequence()
            .filter { it.password.isNotBlank() && matches(it.url, query) }
            .sortedWith(compareBy({ it.title.lowercase() }, { it.username.lowercase() }))
            .take(MAX_SUGGESTIONS)
            .toList()
    }

    fun matches(storedUrl: String, query: AutofillQuery): Boolean {
        val target = parseStoredUrl(storedUrl) ?: return false
        if (target.host != query.host) return false
        return when (query.kind) {
            AutofillQueryKind.WEB -> target.scheme == "http" || target.scheme == "https"
            AutofillQueryKind.APP -> target.scheme == "android"
        }
    }

    internal fun normalizeHost(value: String?): String? {
        val raw = value?.trim().orEmpty()
        if (raw.isEmpty()) return null
        val candidate = when {
            raw.contains("://") -> runCatching { URI(raw).host }.getOrNull()
            raw.contains('/') -> raw.substringBefore('/')
            else -> raw
        } ?: return null
        val host = candidate.trim().trimEnd('.').lowercase().removePrefix("www.")
        if (host.isBlank() || host.contains(' ') || host.contains('@') || host.contains('/')) return null
        return host
    }

    private data class ParsedUrl(val scheme: String, val host: String)

    private fun parseStoredUrl(value: String): ParsedUrl? {
        val raw = value.trim()
        if (raw.isEmpty()) return null
        val normalized = if (raw.contains("://")) raw else "https://$raw"
        val uri = runCatching { URI(normalized) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase() ?: return null
        val host = uri.host?.lowercase()?.trimEnd('.')?.removePrefix("www.") ?: return null
        if (host.isBlank()) return null
        return ParsedUrl(scheme, host)
    }
}
