package com.knoux.crypt.data

import com.knoux.crypt.security.FileEnvelope
import com.knoux.crypt.security.TamperedFileException
import java.io.InputStream
import java.io.OutputStream
import java.security.GeneralSecurityException
import java.security.SecureRandom
import javax.crypto.spec.SecretKeySpec

/**
 * Device-key file encryption. Only callable with a live [VaultAccess]; the
 * non-exportable Keystore root never leaves this module and is never used for
 * caller-chosen chunk nonces.
 *
 * New files are KNF2: a random per-file DEK is wrapped by the Keystore root with
 * KDK1 (Keystore-generated IV), and chunks use that exportable DEK. KNF1 legacy
 * device files remain readable with the root key. Passphrase KNF1 files are
 * unaffected.
 *
 * Revocation is checked on entry, for every chunk progress callback, for the
 * header/provider, and after the envelope finishes. Callers must write to a
 * temporary sink and discard it when a [VaultLockedException] propagates.
 */
class VaultFileCipher(
    private val session: SessionManager,
    private val random: SecureRandom = SecureRandom(),
) {
    companion object {
        private val CONTEXT = "knoux.file.device.v1".toByteArray(Charsets.UTF_8)
        private const val FILE_DEK_BYTES = 32

        /** KDK1 version namespace for per-file DEK wrapping; independent of vault DEKs. */
        private const val FILE_DEK_WRAP_VERSION = 1
    }

    private val envelope = FileEnvelope()
    private val wrapper = DataKeyWrapper()

    fun encrypt(
        access: VaultAccess,
        input: InputStream,
        output: OutputStream,
        plaintextLength: Long,
        onProgress: (FileEnvelope.Progress) -> Unit = {},
    ) {
        session.requireValid(access)
        val root = session.key(access)
        val rawDek = ByteArray(FILE_DEK_BYTES).also(random::nextBytes)
        val fileKey = SecretKeySpec(rawDek, "AES")
        rawDek.fill(0)
        val wrapped = wrapper.wrap(root, FILE_DEK_WRAP_VERSION, fileKey)
        envelope.encryptWrappedDevice(
            input = input,
            output = output,
            fileKey = fileKey,
            wrappedFileKey = wrapped,
            context = CONTEXT,
            plaintextLength = plaintextLength,
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
        val length = envelope.decryptDevice(
            input = input,
            output = output,
            context = CONTEXT,
            keyProvider = { header ->
                session.requireValid(access)
                when (header.keySource) {
                    FileEnvelope.KeySource.DEVICE -> session.key(access) // KNF1 legacy
                    FileEnvelope.KeySource.DEVICE_WRAPPED -> {
                        val wrapped = header.wrappedFileKey
                            ?: throw TamperedFileException("KNF2 header has no wrapped file key")
                        try {
                            wrapper.unwrap(session.key(access), FILE_DEK_WRAP_VERSION, wrapped)
                        } catch (failure: GeneralSecurityException) {
                            throw TamperedFileException("Wrapped file key failed authentication", failure)
                        } catch (failure: IllegalArgumentException) {
                            throw TamperedFileException("Wrapped file key is malformed", failure)
                        }
                    }
                    else -> throw TamperedFileException("Unsupported device-file key source")
                }
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
