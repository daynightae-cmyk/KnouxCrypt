package com.knoux.crypt.data

import com.knoux.crypt.security.FileEnvelope
import java.io.InputStream
import java.io.OutputStream

/**
 * Device-key file encryption. Only callable with a live [VaultAccess]; the
 * non-exportable Keystore key never leaves this module. The envelope is KNF1
 * (chunked AES-256-GCM, authenticated header, chunk order and final flag).
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
        envelope.encrypt(
            input = input,
            output = output,
            key = session.key(access),
            keySource = FileEnvelope.KeySource.DEVICE,
            context = CONTEXT,
            plaintextLength = plaintextLength,
            kdfParams = null,
            onProgress = onProgress,
        )
    }

    fun decrypt(
        access: VaultAccess,
        input: InputStream,
        output: OutputStream,
        onProgress: (FileEnvelope.Progress) -> Unit = {},
    ): Long = envelope.decrypt(
        input = input,
        output = output,
        expectedKeySource = FileEnvelope.KeySource.DEVICE,
        context = CONTEXT,
        keyProvider = { session.key(access) },
        onProgress = onProgress,
    )

    fun headerOf(input: InputStream): FileEnvelope.Header = envelope.readHeader(input)
}
