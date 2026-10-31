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

/**
 * A user-facing failure category for the secure-access and key-rotation flows.
 *
 * Every category carries both an English and an Arabic sentence, because the
 * device run on 2026-11-01 showed Latin-only strings ("Authentication
 * cancelled.") inside an Arabic UI. Categories never turn a failure into a
 * success and never hide the underlying cause: when the platform or the data
 * layer supplies extra text the caller keeps it as [SecurityMessage.detail],
 * which the UI renders next to the localized category.
 */
enum class AccessError(val labelEn: String, val labelAr: String) {
    CANCELLED(
        "Authentication cancelled. The vault stayed locked.",
        "أُلغيت المصادقة. بقيت الخزنة مقفلة.",
    ),
    LOCKOUT(
        "Too many attempts. Try again in a moment.",
        "محاولات كثيرة. أعد المحاولة بعد قليل.",
    ),
    LOCKOUT_PERMANENT(
        "Biometric unlock is locked. Guest mode remains available and your data is untouched.",
        "فتح البصمة مقفل. يبقى وضع الزائر متاحًا وبياناتك لم تتأثر.",
    ),
    NO_BIOMETRICS(
        "No strong biometric is enrolled on this device.",
        "لا توجد بصمة قوية مسجّلة على هذا الجهاز.",
    ),
    HARDWARE_UNAVAILABLE(
        "Biometric hardware is unavailable right now.",
        "عتاد البصمة غير متاح الآن.",
    ),
    AUTH_FAILED(
        "Authentication failed. The vault stayed locked.",
        "فشلت المصادقة. بقيت الخزنة مقفلة.",
    ),
    MISSING_CIPHER(
        "The biometric result did not include a key cipher, so nothing was authorized.",
        "لم تُضمّن نتيجة البصمة مفتاح تشفير، لذلك لم يُمنح أي تفويض.",
    ),
    NOT_CONFIGURED(
        "Secure unlock is not set up on this device.",
        "الفتح الآمن غير مُهيّأ على هذا الجهاز.",
    ),
    NOT_UNLOCKED(
        "Unlock the vault with biometrics before changing its gate.",
        "افتح الخزنة بالبصمة قبل تغيير بوابتها.",
    ),
    KEY_INVALIDATED(
        "The biometric key was invalidated by a device change. Vault data and the data key were preserved.",
        "أُبطل مفتاح البصمة بسبب تغيير في الجهاز. بيانات الخزنة ومفتاح البيانات محفوظان.",
    ),
    REENROLLMENT_BLOCKED(
        "A vault and unlock gate already exist. Unlock with the existing gate; a new gate cannot claim this vault.",
        "توجد خزنة وبوابة فتح بالفعل. افتح بالبوابة الحالية؛ لا يمكن لبوابة جديدة امتلاك هذه الخزنة.",
    ),
    ROTATION_KEY_INVALIDATED(
        "The biometric key was invalidated. Unlock or recover the gate before rotating the key.",
        "أُبطل مفتاح البصمة. افتح أو استعد البوابة قبل تدوير المفتاح.",
    ),
    ROTATION_NOT_AUTHORIZED(
        "Owner verification is missing or expired. Verify with biometrics again.",
        "التحقق من المالك مفقود أو منتهٍ. تحقق بالبصمة من جديد.",
    ),
    ROTATION_LOCKED(
        "The vault locked during rotation. No key was discarded; unlock and resume.",
        "أُقفلت الخزنة أثناء التدوير. لم يُلغَ أي مفتاح؛ افتح الخزنة واستأنف.",
    ),
    ROTATION_INCOMPLETE(
        "Rotation is incomplete and resumable.",
        "التدوير غير مكتمل وقابل للاستئناف.",
    ),
    ROTATION_RECORD_CORRUPT(
        "A record failed authentication during migration; the batch was rolled back.",
        "فشل التحقق من أحد السجلات أثناء الترحيل؛ تم التراجع عن الدفعة.",
    ),
    VAULT_KEY_MISSING(
        "A required vault data key is missing or cannot be unwrapped.",
        "مفتاح بيانات الخزنة المطلوب مفقود أو لا يمكن فك لفّه.",
    ),
    KEY_METADATA_INCONSISTENT(
        "Vault key metadata is inconsistent.",
        "بيانات مفاتيح الخزنة الوصفية غير متسقة.",
    ),
    ROTATION_FAILED(
        "Key rotation failed. Existing keys and records were left intact.",
        "فشل تدوير المفتاح. المفاتيح والسجلات الحالية بقيت سليمة.",
    ),
    UNAVAILABLE(
        "Secure unlock is unavailable.",
        "الفتح الآمن غير متاح.",
    ),
    ;
}

/** A localized category plus the optional raw platform/domain text. */
data class SecurityMessage(val error: AccessError, val detail: String? = null)

/**
 * Pure mappings from thrown failures to user-facing categories. These are unit
 * tested in both languages; the BiometricPrompt code mapping lives in
 * [MainActivity] because it needs the platform constants, and is covered by an
 * instrumented test instead.
 */
object AccessErrors {
    fun fromFailure(failure: Throwable, rotationContext: Boolean): SecurityMessage = when (failure) {
        is UnlockKeyInvalidatedException -> invalidatedKey(rotationContext)
        is UnlockReenrollmentBlockedException -> SecurityMessage(AccessError.REENROLLMENT_BLOCKED)
        is UnlockNotAuthorizedException ->
            SecurityMessage(if (rotationContext) AccessError.ROTATION_NOT_AUTHORIZED else AccessError.NOT_UNLOCKED)
        is UnlockNotConfiguredException -> SecurityMessage(AccessError.NOT_CONFIGURED)
        is UnlockRejectedException -> SecurityMessage(AccessError.AUTH_FAILED)
        is VaultLockedException -> SecurityMessage(AccessError.ROTATION_LOCKED)
        is RotationNotAuthorizedException -> SecurityMessage(AccessError.ROTATION_NOT_AUTHORIZED)
        is RotationIncompleteException ->
            SecurityMessage(AccessError.ROTATION_INCOMPLETE, failure.message)
        is RotationCorruptRecordException ->
            SecurityMessage(AccessError.ROTATION_RECORD_CORRUPT, failure.message)
        is MissingVaultKeyException -> SecurityMessage(AccessError.VAULT_KEY_MISSING)
        is VaultKeyInconsistentException -> SecurityMessage(AccessError.KEY_METADATA_INCONSISTENT)
        else -> SecurityMessage(
            if (rotationContext) AccessError.ROTATION_FAILED else AccessError.UNAVAILABLE,
            failure.message,
        )
    }

    /**
     * Android's [android.security.keystore.KeyPermanentlyInvalidatedException]
     * cannot be constructed in a JVM unit test, so the caller passes the flag
     * after recognising it. The category is identical either way: the key is
     * gone, the vault data is not.
     */
    fun invalidatedKey(rotationContext: Boolean): SecurityMessage = SecurityMessage(
        if (rotationContext) AccessError.ROTATION_KEY_INVALIDATED else AccessError.KEY_INVALIDATED,
    )

    /** Prompt-level categories that BiometricPrompt error codes map onto. */
    fun cancelled(): SecurityMessage = SecurityMessage(AccessError.CANCELLED)
    fun lockout(): SecurityMessage = SecurityMessage(AccessError.LOCKOUT)
    fun permanentLockout(): SecurityMessage = SecurityMessage(AccessError.LOCKOUT_PERMANENT)
    fun noBiometrics(): SecurityMessage = SecurityMessage(AccessError.NO_BIOMETRICS)
    fun hardwareUnavailable(): SecurityMessage = SecurityMessage(AccessError.HARDWARE_UNAVAILABLE)
    fun missingCipher(): SecurityMessage = SecurityMessage(AccessError.MISSING_CIPHER)

    /** Unknown platform codes keep their raw text as detail; never dropped. */
    fun platformDetail(detail: String?): SecurityMessage = SecurityMessage(AccessError.UNAVAILABLE, detail)
}
