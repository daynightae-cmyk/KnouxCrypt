package com.knoux.crypt

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HmacJobGateTest {
    @Test
    fun newerRequestsAndClearInvalidateLateResults() {
        val gate = HmacJobGate()
        val first = gate.issue()
        val second = gate.issue()
        assertFalse(gate.isCurrent(first))
        assertTrue(gate.isCurrent(second))

        gate.invalidate() // Clear Key / Cancel
        assertFalse(gate.isCurrent(second))
        assertFalse(gate.isCurrent(first))

        val third = gate.issue()
        assertTrue(gate.isCurrent(third))
        // A completion from the old job cannot publish after the new token.
        assertFalse(gate.isCurrent(first))
        assertFalse(gate.isCurrent(second))
    }

    @Test
    fun invalidationFromAnotherThreadIsDeterministic() {
        val gate = HmacJobGate()
        val token = gate.issue()
        val ready = CountDownLatch(1)
        val invalidated = CountDownLatch(1)
        val failure = AtomicReference<Throwable?>()
        val invalidator = Thread {
            try {
                ready.countDown()
                gate.invalidate()
            } catch (failureCaught: Throwable) {
                failure.set(failureCaught)
            } finally {
                invalidated.countDown()
            }
        }
        invalidator.start()
        assertTrue(ready.await(5, TimeUnit.SECONDS))
        assertTrue(invalidated.await(5, TimeUnit.SECONDS))
        invalidator.join()
        failure.get()?.let { throw it }
        assertFalse(gate.isCurrent(token))
        val next = gate.issue()
        assertTrue(gate.isCurrent(next))
    }

    @Test
    fun concurrentIssueInvalidateStressNeverThrowsAndEndsWithACurrentToken() {
        val gate = HmacJobGate()
        val start = CountDownLatch(1)
        val done = CountDownLatch(2)
        val failure = AtomicReference<Throwable?>()
        val issuer = Thread {
            try {
                start.await()
                repeat(20_000) { gate.issue() }
            } catch (failureCaught: Throwable) {
                failure.set(failureCaught)
            } finally {
                done.countDown()
            }
        }
        val invalidator = Thread {
            try {
                start.await()
                repeat(20_000) { gate.invalidate() }
            } catch (failureCaught: Throwable) {
                failure.set(failureCaught)
            } finally {
                done.countDown()
            }
        }
        issuer.start()
        invalidator.start()
        start.countDown()
        assertTrue(done.await(10, TimeUnit.SECONDS))
        issuer.join()
        invalidator.join()
        failure.get()?.let { throw it }
        val finalToken = gate.issue()
        assertTrue(gate.isCurrent(finalToken))
    }
}
