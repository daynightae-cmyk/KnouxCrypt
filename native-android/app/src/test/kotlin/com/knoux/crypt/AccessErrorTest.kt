package com.knoux.crypt

import com.knoux.crypt.data.MissingVaultKeyException
import com.knoux.crypt.data.RotationCorruptRecordException
import com.knoux.crypt.data.RotationIncompleteException
import com.knoux.crypt.data.RotationNotAuthorizedException
import com.knoux.crypt.data.UnlockKeyInvalidatedException
import com.knoux.crypt.data.UnlockNotAuthorizedException
import com.knoux.crypt.data.UnlockNotConfiguredException
import com.knoux.crypt.data.UnlockReenrollmentBlockedException
import com.knoux.crypt.data.UnlockRejectedException
import com.knoux.crypt.data.VaultKeyInconsistentException
import com.knoux.crypt.data.VaultLockedException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Bilingual error-handling regression tests. The device run on 2026-11-01
 * exposed Latin-only failure text inside the Arabic UI, so every category must
 * carry both languages, and no failure may be swallowed or turned into a
 * success by the mapping.
 */
class AccessErrorTest {

    @Test
    fun everyCategoryHasDistinctArabicAndEnglishText() {
        AccessError.entries.forEach { error ->
            assertTrue("${error.name} has no English text", error.labelEn.isNotBlank())
            assertTrue("${error.name} has no Arabic text", error.labelAr.isNotBlank())
            assertNotEquals(error.name, error.labelEn, error.labelAr)
            assertTrue(
                "${error.name} Arabic text contains no Arabic letters",
                error.labelAr.any { it.code in 0x0600..0x06FF },
            )
            assertTrue(
                "${error.name} English text must stay Latin-only",
                error.labelEn.none { it.code in 0x0600..0x06FF },
            )
        }
    }

    @Test
    fun authenticationFailuresKeepTheirOwnCategories() {
        assertEquals(AccessError.CANCELLED, AccessErrors.cancelled().error)
        assertEquals(AccessError.LOCKOUT, AccessErrors.lockout().error)
        assertEquals(AccessError.LOCKOUT_PERMANENT, AccessErrors.permanentLockout().error)
        assertEquals(AccessError.NO_BIOMETRICS, AccessErrors.noBiometrics().error)
        assertEquals(AccessError.HARDWARE_UNAVAILABLE, AccessErrors.hardwareUnavailable().error)
        assertEquals(AccessError.MISSING_CIPHER, AccessErrors.missingCipher().error)
    }

    @Test
    fun domainFailuresMapWithoutChangingTheirMeaning() {
        fun category(failure: Throwable, rotation: Boolean) = AccessErrors.fromFailure(failure, rotation).error

        assertEquals(AccessError.KEY_INVALIDATED, category(UnlockKeyInvalidatedException(), rotation = false))
        assertEquals(
            AccessError.ROTATION_KEY_INVALIDATED,
            category(UnlockKeyInvalidatedException(), rotation = true),
        )
        assertEquals(AccessError.REENROLLMENT_BLOCKED, category(UnlockReenrollmentBlockedException(), false))
        assertEquals(AccessError.NOT_UNLOCKED, category(UnlockNotAuthorizedException(), false))
        assertEquals(AccessError.ROTATION_NOT_AUTHORIZED, category(UnlockNotAuthorizedException(), true))
        assertEquals(AccessError.NOT_CONFIGURED, category(UnlockNotConfiguredException(), false))
        assertEquals(AccessError.AUTH_FAILED, category(UnlockRejectedException(), false))
        assertEquals(AccessError.ROTATION_LOCKED, category(VaultLockedException(), true))
        assertEquals(
            AccessError.ROTATION_NOT_AUTHORIZED,
            category(RotationNotAuthorizedException(), true),
        )
        assertEquals(AccessError.ROTATION_INCOMPLETE, category(RotationIncompleteException("partial"), true))
        assertEquals(
            AccessError.ROTATION_RECORD_CORRUPT,
            category(RotationCorruptRecordException("row-1", IllegalStateException("tag")), true),
        )
        assertEquals(AccessError.VAULT_KEY_MISSING, category(MissingVaultKeyException(4), true))
        assertEquals(
            AccessError.KEY_METADATA_INCONSISTENT,
            category(VaultKeyInconsistentException("metadata"), true),
        )
    }

    @Test
    fun unknownFailuresKeepTheirRawTextAsDetail() {
        val message = AccessErrors.fromFailure(IllegalStateException("vendor said no"), rotationContext = false)
        assertEquals(AccessError.UNAVAILABLE, message.error)
        assertEquals("vendor said no", message.detail)

        val rotation = AccessErrors.fromFailure(IllegalStateException("disk full"), rotationContext = true)
        assertEquals(AccessError.ROTATION_FAILED, rotation.error)
        assertEquals("disk full", rotation.detail)

        val platform = AccessErrors.platformDetail("Unrecognised code 42")
        assertEquals(AccessError.UNAVAILABLE, platform.error)
        assertEquals("Unrecognised code 42", platform.detail)
    }

    @Test
    fun mappedCategoriesWithoutDomainTextDoNotInventADetail() {
        assertNull(AccessErrors.fromFailure(UnlockRejectedException(), false).detail)
        assertNull(AccessErrors.invalidatedKey(true).detail)
        assertNull(AccessErrors.cancelled().detail)
    }

    @Test
    fun invalidatedKeyCategoryIsUsedForBothAndroidAndDomainInvalidation() {
        assertEquals(AccessErrors.invalidatedKey(false), AccessErrors.fromFailure(UnlockKeyInvalidatedException(), false))
        assertEquals(
            AccessErrors.invalidatedKey(true),
            AccessErrors.fromFailure(UnlockKeyInvalidatedException(), true),
        )
    }
}
