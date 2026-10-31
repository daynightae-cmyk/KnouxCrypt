package com.knoux.crypt

import java.io.IOException
import java.io.InputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HmacStreamerTest {
    @Test
    fun cancellationClosesBlockingInputAndNeverReturnsATag() = runBlocking {
        val key = ByteArray(32) { it.toByte() }
        val release = CountDownLatch(1)
        val closed = AtomicBoolean(false)
        val blocking = object : InputStream() {
            override fun read(): Int {
                release.await(10, TimeUnit.SECONDS)
                throw IOException("released")
            }

            override fun read(buffer: ByteArray, offset: Int, length: Int): Int = read()

            override fun close() {
                closed.set(true)
                release.countDown()
            }
        }
        var result: ByteArray? = null
        val job = launch(Dispatchers.IO) {
            try {
                result = HmacStreamer.compute(key, blocking, totalBytes = -1)
            } catch (_: Exception) {
                // Cancellation/closed-stream errors are expected and must not
                // become a tag.
            }
        }
        delay(100)
        withTimeout(5_000) { job.cancelAndJoin() }
        assertTrue(closed.get())
        assertNull(result)
    }

    @Test
    fun completedStreamStillReturnsTheRfcTag() = runBlocking {
        val key = "0b".repeat(20).chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val tag = HmacStreamer.compute(
            key,
            "Hi There".byteInputStream(),
            totalBytes = 8,
        )
        assertTrue(tag.isNotEmpty())
        assertTrue(
            HashingHex.of(tag) == "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
        )
    }
}

private object HashingHex {
    fun of(bytes: ByteArray): String = buildString(bytes.size * 2) {
        bytes.forEach {
            val v = it.toInt() and 0xff
            append("0123456789abcdef"[v ushr 4])
            append("0123456789abcdef"[v and 0x0f])
        }
    }
}
