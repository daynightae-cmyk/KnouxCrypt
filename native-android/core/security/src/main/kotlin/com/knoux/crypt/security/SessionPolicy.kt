package com.knoux.crypt.security

/** UI preview is never an authenticated capability. No boolean UI unlock API. */
enum class SessionMode { LOCKED, GUEST_PREVIEW }
class SessionPolicy(private val debugPreviewAllowed: Boolean) {
    var mode: SessionMode = SessionMode.LOCKED
        private set
    fun enterGuestPreview(): Boolean {
        if (!debugPreviewAllowed) return false
        mode = SessionMode.GUEST_PREVIEW
        return true
    }
    fun lock() { mode = SessionMode.LOCKED }
    // A future authenticated capability must be bound to successful key use.
    fun canReadSecrets(): Boolean = false
}
enum class FeatureReadiness { PLANNED, UNSUPPORTED, IMPLEMENTED_UNVERIFIED, TESTED, AUDITED }
