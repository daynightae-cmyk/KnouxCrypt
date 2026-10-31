package com.knoux.crypt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ClipboardLeasePolicyTest {
    @Test
    fun classificationSeparatesOwnershipExpiryAndForeignText() {
        assertEquals(
            ClipboardLeaseState.UNAVAILABLE,
            ClipboardLeasePolicy.classify(false, false, false, false, false),
        )
        assertEquals(
            ClipboardLeaseState.EMPTY,
            ClipboardLeasePolicy.classify(true, false, false, false, false),
        )
        assertEquals(
            ClipboardLeaseState.FOREIGN,
            ClipboardLeasePolicy.classify(true, true, false, false, false),
        )
        assertEquals(
            ClipboardLeaseState.FOREIGN,
            ClipboardLeasePolicy.classify(true, true, false, true, false),
        )
        assertEquals(
            ClipboardLeaseState.MANAGED,
            ClipboardLeasePolicy.classify(true, true, true, true, false),
        )
        assertEquals(
            ClipboardLeaseState.EXPIRED,
            ClipboardLeasePolicy.classify(true, true, true, true, true),
        )
    }

    @Test
    fun onlyOwnedOrExpiredLeasesAutoClearWhileForeignMayOnlyBeExplicitlyCleared() {
        assertTrue(ClipboardLeasePolicy.canAutoClear(ClipboardLeaseState.MANAGED))
        assertTrue(ClipboardLeasePolicy.canAutoClear(ClipboardLeaseState.EXPIRED))
        assertFalse(ClipboardLeasePolicy.canAutoClear(ClipboardLeaseState.FOREIGN))
        assertFalse(ClipboardLeasePolicy.canAutoClear(ClipboardLeaseState.EMPTY))
        assertFalse(ClipboardLeasePolicy.canAutoClear(ClipboardLeaseState.UNAVAILABLE))

        assertTrue(ClipboardLeasePolicy.canExplicitClear(ClipboardLeaseState.FOREIGN))
        assertTrue(ClipboardLeasePolicy.canExplicitClear(ClipboardLeaseState.MANAGED))
        assertFalse(ClipboardLeasePolicy.canExplicitClear(ClipboardLeaseState.EMPTY))
        assertFalse(ClipboardLeasePolicy.canExplicitClear(ClipboardLeaseState.UNAVAILABLE))
    }
}
