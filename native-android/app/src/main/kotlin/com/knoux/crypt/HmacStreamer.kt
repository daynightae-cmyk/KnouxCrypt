package com.knoux.crypt

import com.knoux.crypt.security.Hashing
import java.io.InputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch

/**
 * Streaming HMAC helper with cooperative cancellation. The input is closed when
 * the current job completes/cancels, which is a best-effort way to unblock a
 * provider whose read() has no cancellation support. Cancellation never reports
 * a tag; the caller must use a throw-away sink for any partial work.
 */
object HmacStreamer {
    suspend fun compute(
        key: ByteArray,
        input: InputStream,
        totalBytes: Long,
        onProgress: (Long) -> Unit = {},
    ): ByteArray {
        val self = currentCoroutineContext()[Job]
        // A completion handler fires only after the body returns, which cannot
        // unblock a read that is still in progress. A child watcher is cancelled
        // immediately with the parent and closes the stream in its finally.
        val closer = CoroutineScope(currentCoroutineContext()).launch(start = CoroutineStart.UNDISPATCHED) {
            try {
                awaitCancellation()
            } finally {
                runCatching { input.close() }
            }
        }
        try {
            val tag = Hashing.hmacSha256(key, input, totalBytes) { processed ->
                self?.ensureActive()
                onProgress(processed)
            }
            self?.ensureActive()
            return tag
        } finally {
            closer.cancel()
        }
    }
}
