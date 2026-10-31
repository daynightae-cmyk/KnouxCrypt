package com.knoux.crypt.data

/**
 * Validated, non-secret session privacy policy choices. No key material or
 * clipboard content is stored in preferences.
 */
object SessionPrivacyPolicy {
    val AUTO_LOCK_CHOICES_SECONDS: List<Int> = listOf(15, 30, 60, 300)
    val CLIPBOARD_CHOICES_SECONDS: List<Int> = listOf(0, 30, 60, 120)
    const val DEFAULT_AUTO_LOCK_SECONDS = 30
    const val DEFAULT_CLIPBOARD_SECONDS = 60
    const val DEFAULT_LOCK_ON_SCREEN_OFF = true
    const val DEFAULT_BLOCK_SCREENSHOTS = true

    fun requireAutoLockSeconds(value: Int): Int {
        require(value in AUTO_LOCK_CHOICES_SECONDS) { "Unsupported auto-lock timeout" }
        return value
    }

    fun requireClipboardSeconds(value: Int): Int {
        require(value in CLIPBOARD_CHOICES_SECONDS) { "Unsupported clipboard timeout" }
        return value
    }
}
