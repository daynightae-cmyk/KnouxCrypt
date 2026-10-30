package com.knoux.crypt.data

import com.knoux.crypt.security.FileEnvelope
import java.io.InputStream
import java.io.OutputStream

/**
 * Device-key file encryption. Only callable with a live [VaultAccess]; the
 * non-exportable Keystore key never leaves this module. The envelope is KNF1
 * (chunked AES-256-GCM, authenticated header, chunk order and final flag).
 *
 * Revocation is checked on entry, for every chunk progress callback, and after
 * the envelope finishes, so a lock aborts an in-flight file operation instead of
 * silently completing it. Callers must keep writing to a temporary sink and
 * discard it when a [VaultLockedException] propagates.
 */
class VaultFileCipher(private val session: SessionManager) {
    companion object {
        private val CONTEXT = "knoux.file.device.v1".toByteArray(Charsets.UTF_8)
    }

    private val envelope = FileEnvelope()

    fun encrypt(
        access: VaultAccess,
        input: InputStream,
        output: OutputStream,
        plaintextLength: Long,
        onProgress: (FileEnvelope.Progress) -> Unit = {},
    ) {
        session.requireValid(access)
        envelope.encrypt(
            input = input,
            output = output,
            key = session.key(access),
            keySource = FileEnvelope.KeySource.DEVICE,
            context = CONTEXT,
            plaintextLength = plaintextLength,
            kdfParams = null,
            onProgress = checkpoint(access, onProgress),
        )
        session.requireValid(access)
    }

    fun decrypt(
        access: VaultAccess,
        input: InputStream,
        output: OutputStream,
        onProgress: (FileEnvelope.Progress) -> Unit = {},
    ): Long {
        session.requireValid(access)
        val length = envelope.decrypt(
            input = input,
            output = output,
            expectedKeySource = FileEnvelope.KeySource.DEVICE,
            context = CONTEXT,
            keyProvider = {
                session.requireValid(access)
                session.key(access)
            },
            onProgress = checkpoint(access, onProgress),
        )
        session.requireValid(access)
        return length
    }

    fun headerOf(input: InputStream): FileEnvelope.Header = envelope.readHeader(input)

    private fun checkpoint(
        access: VaultAccess,
        onProgress: (FileEnvelope.Progress) -> Unit,
    ): (FileEnvelope.Progress) -> Unit = { progress ->
        session.requireValid(access)
        onProgress(progress)
    }
}
