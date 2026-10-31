package com.knoux.crypt

/**
 * Monotonic request gate for HMAC work. A late job may only publish results if
 * its token is still current; input changes, Clear Key and Cancel invalidate all
 * older tokens. Synchronization makes the rule deterministic across threads.
 */
class HmacJobGate {
    private var generation: Long = 0L

    @Synchronized
    fun issue(): Long {
        generation += 1
        return generation
    }

    @Synchronized
    fun invalidate() {
        generation += 1
    }

    @Synchronized
    fun isCurrent(token: Long): Boolean = token == generation
}
