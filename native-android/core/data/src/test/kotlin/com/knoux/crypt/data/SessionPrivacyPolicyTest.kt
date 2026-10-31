package com.knoux.crypt.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionPrivacyPolicyTest {
    @Test
    fun defaultsAreSafe() {
        assertEquals(30, SessionPrivacyPolicy.DEFAULT_AUTO_LOCK_SECONDS)
        assertEquals(60, SessionPrivacyPolicy.DEFAULT_CLIPBOARD_SECONDS)
        assertTrue(SessionPrivacyPolicy.DEFAULT_LOCK_ON_SCREEN_OFF)
        assertTrue(SessionPrivacyPolicy.DEFAULT_BLOCK_SCREENSHOTS)
        assertTrue(SessionPrivacyPolicy.requireAutoLockSeconds(15) == 15)
        assertTrue(SessionPrivacyPolicy.requireClipboardSeconds(0) == 0)
    }

    @Test
    fun unsupportedValuesAreRejected() {
        for (value in listOf(0, 1, 14, 31, 301, 3600)) {
            try {
                SessionPrivacyPolicy.requireAutoLockSeconds(value)
                throw AssertionError("Accepted auto-lock $value")
            } catch (_: IllegalArgumentException) {
            }
        }
        for (value in listOf(-1, 1, 10, 45, 600)) {
            try {
                SessionPrivacyPolicy.requireClipboardSeconds(value)
                throw AssertionError("Accepted clipboard timeout $value")
            } catch (_: IllegalArgumentException) {
            }
        }
    }
}
