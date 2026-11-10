package com.knoux.crypt

import com.knoux.crypt.autofill.AutofillCredential
import com.knoux.crypt.autofill.AutofillMatcher
import com.knoux.crypt.autofill.AutofillQueryKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AutofillMatcherTest {
    private val google = AutofillCredential("g", "Google", "user@gmail.com", "p1", "https://www.google.com/login")
    private val bank = AutofillCredential("b", "Bank", "alice", "p2", "https://bank.example.com/")
    private val appCred = AutofillCredential("a", "App login", "bob", "p3", "android://com.example.app")
    private val webOnly = AutofillCredential("w", "Web", "carol", "p4", "https://example.com")

    @Test
    fun webQueryMatchesHostAndIgnoresWww() {
        val query = AutofillMatcher.buildQuery("www.google.com", null)
        assertEquals(AutofillQueryKind.WEB, query?.kind)
        assertEquals("google.com", query?.host)
        val result = AutofillMatcher.suggestions(listOf(google), query)
        assertEquals(listOf(google), result)
    }

    @Test
    fun webQueryDoesNotMatchDifferentHost() {
        val query = AutofillMatcher.buildQuery("bank.example.com", null)
        val result = AutofillMatcher.suggestions(listOf(google), query)
        assertTrue(result.isEmpty())
    }

    @Test
    fun subdomainDoesNotMatch() {
        val query = AutofillMatcher.buildQuery("accounts.google.com", null)
        val result = AutofillMatcher.suggestions(listOf(google), query)
        assertTrue(result.isEmpty())
    }

    @Test
    fun httpsAndHttpBothMatchWeb() {
        val httpCred = google.copy(url = "http://google.com")
        val query = AutofillMatcher.buildQuery("google.com", null)
        val result = AutofillMatcher.suggestions(listOf(httpCred), query)
        assertEquals(listOf(httpCred), result)
    }

    @Test
    fun androidSchemeMatchesPackageQuery() {
        val query = AutofillMatcher.buildQuery(null, "com.example.app")
        assertEquals(AutofillQueryKind.APP, query?.kind)
        assertEquals("com.example.app", query?.host)
        val result = AutofillMatcher.suggestions(listOf(appCred), query)
        assertEquals(listOf(appCred), result)
    }

    @Test
    fun androidSchemeDoesNotMatchWebDomain() {
        val query = AutofillMatcher.buildQuery("example.com", null)
        val result = AutofillMatcher.suggestions(listOf(appCred), query)
        assertTrue(result.isEmpty())
    }

    @Test
    fun webCredentialDoesNotMatchPackageQuery() {
        val query = AutofillMatcher.buildQuery(null, "com.example.app")
        val result = AutofillMatcher.suggestions(listOf(webOnly), query)
        assertTrue(result.isEmpty())
    }

    @Test
    fun webDomainTakesPriorityOverPackage() {
        val query = AutofillMatcher.buildQuery("example.com", "com.example.app")
        assertEquals(AutofillQueryKind.WEB, query?.kind)
        assertEquals("example.com", query?.host)
    }

    @Test
    fun blankQueryReturnsNothing() {
        val query = AutofillMatcher.buildQuery("   ", "")
        assertNull(query)
        assertTrue(AutofillMatcher.suggestions(listOf(google), query).isEmpty())
    }

    @Test
    fun invalidOrBlankUrlsIgnored() {
        val bad = google.copy(url = "not a url / /")
        val query = AutofillMatcher.buildQuery("google.com", null)
        // "not a url / /" with no scheme: normalized to https://not a url / /; URI host null -> ignored
        assertTrue(AutofillMatcher.suggestions(listOf(bad), query).isEmpty())
    }

    @Test
    fun credentialsWithoutPasswordIgnored() {
        val noPass = google.copy(password = "")
        val query = AutofillMatcher.buildQuery("google.com", null)
        assertTrue(AutofillMatcher.suggestions(listOf(noPass), query).isEmpty())
    }

    @Test
    fun suggestionsAreBounded() {
        val many = (1..8).map { google.copy(recordId = "r$it", title = "T$it") }
        val query = AutofillMatcher.buildQuery("google.com", null)
        val result = AutofillMatcher.suggestions(many, query)
        assertEquals(AutofillMatcher.MAX_SUGGESTIONS, result.size)
    }

    @Test
    fun caseInsensitiveHostMatching() {
        val q = AutofillMatcher.buildQuery("GOOGLE.COM", null)
        assertEquals("google.com", q?.host)
        val result = AutofillMatcher.suggestions(listOf(google), q)
        assertEquals(listOf(google), result)
    }

    @Test
    fun portIsIgnoredForHost() {
        val q = AutofillMatcher.buildQuery("https://google.com:8443", null)
        assertEquals("google.com", q?.host)
    }
}
