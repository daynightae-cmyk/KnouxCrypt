package com.knoux.crypt

/** Clipboard exposure without any clipboard plaintext. */
enum class ClipboardLeaseState { UNAVAILABLE, EMPTY, MANAGED, EXPIRED, FOREIGN }

enum class ClipboardClearOutcome { CLEARED, NOTHING, NOT_OWNED, UNAVAILABLE }

data class ClipboardExposure(
    val state: ClipboardLeaseState,
    val charCount: Int? = null,
    val label: String? = null,
    val copiedAtMillis: Long? = null,
    val expiresAtMillis: Long? = null,
    val owned: Boolean = false,
) {
    val hasText: Boolean get() = state != ClipboardLeaseState.EMPTY && state != ClipboardLeaseState.UNAVAILABLE
}

/**
 * Pure ownership/expiry classification. A value match within this process is the
 * only ownership proof we have; after process death or an external clipboard
 * change, the value is FOREIGN and must never be silently cleared.
 */
object ClipboardLeasePolicy {
    fun classify(
        canRead: Boolean,
        hasText: Boolean,
        currentMatchesLease: Boolean,
        leasePresent: Boolean,
        expired: Boolean,
    ): ClipboardLeaseState = when {
        !canRead -> ClipboardLeaseState.UNAVAILABLE
        !hasText -> ClipboardLeaseState.EMPTY
        leasePresent && currentMatchesLease && expired -> ClipboardLeaseState.EXPIRED
        leasePresent && currentMatchesLease -> ClipboardLeaseState.MANAGED
        else -> ClipboardLeaseState.FOREIGN
    }

    fun canAutoClear(state: ClipboardLeaseState): Boolean =
        state == ClipboardLeaseState.MANAGED || state == ClipboardLeaseState.EXPIRED

    fun canExplicitClear(state: ClipboardLeaseState): Boolean =
        state != ClipboardLeaseState.EMPTY && state != ClipboardLeaseState.UNAVAILABLE
}
