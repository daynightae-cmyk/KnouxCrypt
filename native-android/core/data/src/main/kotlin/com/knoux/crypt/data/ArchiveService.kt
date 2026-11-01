package com.knoux.crypt.data

import com.knoux.crypt.security.FileEnvelope
import com.knoux.crypt.security.KeyDerivation
import com.knoux.crypt.security.TamperedFileException
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Encrypted archives (TASK 21).
 *
 * Nothing new is invented here. The container is the same authenticated KNF2 file
 * envelope used by File Cipher — a random per-file DEK wrapped by the
 * non-exportable Keystore root — and the payload inside it is a standard ZIP
 * written by `java.util.zip`. What this service adds is the part an archive
 * actually needs: a manifest checked before anything is written, names that
 * cannot climb out of the destination, hard size quotas, and extraction that
 * verifies every byte before the user's destination sees any of it.
 *
 * Decrypted payload layout:
 *
 * ```
 * manifest length   4      big-endian
 * manifest          var     ArchiveManifest JSON (names, sizes, digests)
 * zip bytes         var     standard ZIP, DEFLATE or STORED
 * ```
 *
 * The container's AEAD context is `knoux.archive.v1`, deliberately different from
 * the plain-file context, so an archive can never be opened as a single encrypted
 * file, or a file as an archive.
 */
class ArchiveService(
    private val session: SessionManager,
    private val vaultFiles: VaultFileCipher,
    private val repository: SecretRepository,
    private val tempDirProvider: () -> File,
) {
    companion object {
        val ARCHIVE_CONTEXT: ByteArray = "knoux.archive.v1".toByteArray(Charsets.UTF_8)
        const val MAX_ENTRIES = 256
        const val MAX_ENTRY_BYTES = 256L * 1024 * 1024
        const val MAX_TOTAL_BYTES = 1024L * 1024 * 1024
        const val MAX_NAME_CHARS = 200
        const val MANIFEST_VERSION = 1

        /** A ZIP entry that expands far past what the manifest declared is refused, not extracted. */
        const val MAX_EXTRA_SLACK_BYTES = 1_048_576L

        /**
         * Accepts only a single, safe path segment. Anything that carries a path at
         * all — a separator, `..`, a drive letter, a leading dot, a control
         * character, a reserved device name or an over-long name — is refused rather
         * than quietly stripped down to something the user did not ask for. Silent
         * cleaning is how `../escape.txt` becomes a legal-looking name.
         */
        fun sanitize(name: String): String? {
            val trimmed = name.trim()
            if (trimmed.isEmpty() || trimmed.length > MAX_NAME_CHARS) return null
            if (trimmed.contains('/') || trimmed.contains('\\')) return null
            if (trimmed == "." || trimmed == ".." || trimmed.startsWith(".")) return null
            if (trimmed.any { it.code < 0x20 || it in charArrayOf(':', '*', '?', '"', '<', '>', '|') }) return null
            val upper = trimmed.uppercase()
            val reserved = upper in setOf("CON", "PRN", "AUX", "NUL", "CLOCK$", "LPT1", "LPT2", "LPT3")
            val comPort = upper.length == 4 && upper.startsWith("COM") && upper[3] in '1'..'9'
            if (reserved || comPort) return null
            return trimmed
        }
    }

    @Serializable
    data class ManifestEntry(val name: String, val size: Long, val digestHex: String)

    @Serializable
    data class ArchiveManifest(val version: Int, val entries: List<ManifestEntry>, val compressed: Boolean)

    data class Item(val name: String, val length: Long, val open: () -> InputStream)

    data class Created(
        val containerBytes: Long,
        val plaintextBytes: Long,
        val entryCount: Int,
        val compressed: Boolean,
        val digestHex: String,
    )

    data class EntryInfo(val index: Int, val name: String, val size: Long, val digestHex: String)

    sealed class ArchiveFailure {
        data object Empty : ArchiveFailure()
        data object TooManyEntries : ArchiveFailure()
        data class UnsafeName(val name: String) : ArchiveFailure()
        data class DuplicateName(val name: String) : ArchiveFailure()
        data class TooLarge(val detail: String) : ArchiveFailure()
        data object Locked : ArchiveFailure()
        data object NotAnArchive : ArchiveFailure()
        data class Tampered(val detail: String) : ArchiveFailure()
        data class Unsupported(val detail: String) : ArchiveFailure()
    }

    sealed class Outcome<out T> {
        data class Success<T>(val value: T) : Outcome<T>()
        data class Failed(val failure: ArchiveFailure) : Outcome<Nothing>()
    }

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    /** Builds the ZIP, then seals it in a device-key KNF2 container. */
    suspend fun create(
        access: VaultAccess,
        items: List<Item>,
        output: OutputStream,
        compressed: Boolean,
        onProgress: (FractionalProgress) -> Unit = {},
    ): Outcome<Created> {
        session.requireValid(access)
        return buildAndSeal(items, compressed, output, onProgress) { payload, sink ->
            vaultFiles.encrypt(
                access = access,
                input = payload.inputStream(),
                output = sink,
                plaintextLength = payload.length(),
                context = ARCHIVE_CONTEXT,
                onProgress = { progress -> onProgress(FractionalProgress(progress.fraction)) },
            )
        }
    }

    /** The same container sealed with a passphrase-derived key, for portable archives. */
    suspend fun createWithPassphrase(
        passphrase: CharArray,
        items: List<Item>,
        output: OutputStream,
        compressed: Boolean,
        onProgress: (FractionalProgress) -> Unit = {},
    ): Outcome<Created> {
        val envelope = FileEnvelope()
        val salt = ByteArray(FileEnvelope.SALT_BYTES).also { java.security.SecureRandom().nextBytes(it) }
        val kdf = FileEnvelope.KdfParams(310_000, salt)
        val key = KeyDerivation.forEnvelope(passphrase, kdf)
        return buildAndSeal(items, compressed, output, onProgress) { payload, sink ->
            envelope.encrypt(
                input = payload.inputStream(),
                output = sink,
                key = key,
                keySource = FileEnvelope.KeySource.PASSPHRASE,
                context = ARCHIVE_CONTEXT,
                plaintextLength = payload.length(),
                kdfParams = kdf,
                onProgress = { progress -> onProgress(FractionalProgress(progress.fraction)) },
            )
        }
    }

    data class FractionalProgress(val fraction: Float)

    private suspend fun buildAndSeal(
        items: List<Item>,
        compressed: Boolean,
        output: OutputStream,
        onProgress: (FractionalProgress) -> Unit,
        seal: (File, OutputStream) -> Unit,
    ): Outcome<Created> {
        if (items.isEmpty()) return Outcome.Failed(ArchiveFailure.Empty)
        if (items.size > MAX_ENTRIES) return Outcome.Failed(ArchiveFailure.TooManyEntries)
        val declaredTotal = items.sumOf { it.length }
        if (declaredTotal > MAX_TOTAL_BYTES) {
            return Outcome.Failed(
                ArchiveFailure.TooLarge("the queued files declare $declaredTotal bytes, over the $MAX_TOTAL_BYTES byte quota"),
            )
        }
        val names = LinkedHashSet<String>()
        items.forEach { item ->
            val safe = sanitize(item.name) ?: return Outcome.Failed(ArchiveFailure.UnsafeName(item.name.take(40)))
            if (!names.add(safe)) return Outcome.Failed(ArchiveFailure.DuplicateName(safe))
            if (item.length > MAX_ENTRY_BYTES) {
                return Outcome.Failed(ArchiveFailure.TooLarge("$safe is larger than the $MAX_ENTRY_BYTES byte entry quota"))
            }
        }

        val staging = newStaging("zip")
        val payload = newStaging("payload")
        val entries = mutableListOf<ManifestEntry>()
        try {
            FileOutputStream(staging).use { fileOut ->
                ZipOutputStream(fileOut).use { zip ->
                    zip.setMethod(if (compressed) ZipEntry.DEFLATED else ZipEntry.STORED)
                    items.forEachIndexed { index, item ->
                        val name = names.toList()[index]
                        val digest = MessageDigest.getInstance("SHA-256")
                        val written = writeEntry(zip, name, item, compressed, digest)
                        entries += ManifestEntry(name, written, digest.digest().toHex())
                    }
                }
            }
            val manifest = json.encodeToString(ArchiveManifest(MANIFEST_VERSION, entries, compressed))
                .toByteArray(Charsets.UTF_8)
            FileOutputStream(payload).use { out ->
                out.writeIntBigEndian(manifest.size)
                out.write(manifest)
                staging.inputStream().use { it.copyTo(out, 64 * 1024) }
            }
            val digest = MessageDigest.getInstance("SHA-256")
            val counted = DigestTee(output, digest)
            seal(payload, counted)
            return Outcome.Success(
                Created(
                    containerBytes = counted.count,
                    plaintextBytes = payload.length(),
                    entryCount = entries.size,
                    compressed = compressed,
                    digestHex = digest.digest().toHex(),
                ),
            )
        } catch (failure: QuotaExceededException) {
            return Outcome.Failed(ArchiveFailure.TooLarge(failure.messageOr("a file exceeded its quota while streaming")))
        } catch (failure: TamperedFileException) {
            return Outcome.Failed(ArchiveFailure.Tampered(failure.messageOr("the container did not authenticate")))
        } catch (failure: com.knoux.crypt.security.ContainerException) {
            return Outcome.Failed(ArchiveFailure.Unsupported(failure.messageOr("this container format is not supported")))
        } catch (failure: java.io.IOException) {
            return Outcome.Failed(ArchiveFailure.Unsupported(failure.messageOr("an I/O failure stopped the archive")))
        } finally {
            deleteQuietly(staging)
            deleteQuietly(payload)
        }
    }

    private fun writeEntry(
        zip: ZipOutputStream,
        name: String,
        item: Item,
        compressed: Boolean,
        digest: MessageDigest,
    ): Long {
        // A STORED entry has to declare its size and CRC up front, so the source is
        // measured once and then streamed again; DEFLATE needs neither.
        val crc = CRC32()
        var measured = 0L
        if (!compressed) {
            item.open().use { input ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    measured += read
                    if (measured > MAX_ENTRY_BYTES) throw QuotaExceededException("$name exceeded the entry quota")
                    crc.update(buffer, 0, read)
                }
            }
        }
        val entry = ZipEntry(name)
        if (!compressed) {
            entry.size = measured
            entry.compressedSize = measured
            entry.crc = crc.value
        }
        zip.putNextEntry(entry)
        var written = 0L
        item.open().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                written += read
                if (written > MAX_ENTRY_BYTES) throw QuotaExceededException("$name exceeded the entry quota")
                digest.update(buffer, 0, read)
                zip.write(buffer, 0, read)
            }
        }
        zip.closeEntry()
        return written
    }

    /** Reads only the container header, so the UI can identify a KNF file without any key. */
    fun inspectHeader(input: InputStream): FileEnvelope.Header = FileEnvelope().readHeader(input)

    /**
     * Decrypts into staging and returns the verified manifest together with the
     * staged file. The caller must [StagedArchive.close] it; a failure here leaves
     * nothing behind and never touches the destination.
     */
    suspend fun open(access: VaultAccess, container: InputStream): StagedArchive {
        session.requireValid(access)
        val staged = newStaging("open")
        try {
            FileOutputStream(staged).use { out ->
                vaultFiles.decrypt(access, container, out, context = ARCHIVE_CONTEXT)
            }
            return StagedArchive(staged, readManifest(staged))
        } catch (failure: Throwable) {
            deleteQuietly(staged)
            throw failure
        }
    }

    /** Opens a passphrase-sealed archive; the same manifest rules apply. */
    fun openWithPassphrase(passphrase: CharArray, container: InputStream): StagedArchive {
        val envelope = FileEnvelope()
        val staged = newStaging("open-pass")
        return try {
            FileOutputStream(staged).use { out ->
                envelope.decrypt(
                    input = container,
                    output = out,
                    expectedKeySource = FileEnvelope.KeySource.PASSPHRASE,
                    context = ARCHIVE_CONTEXT,
                    keyProvider = { header ->
                        KeyDerivation.forEnvelope(passphrase, requireNotNull(header.kdfParams))
                    },
                )
            }
            StagedArchive(staged, readManifest(staged))
        } catch (failure: Throwable) {
            deleteQuietly(staged)
            throw failure
        }
    }

    /** Holds the decrypted payload and the ZIP split out of it, and cleans both up. */
    inner class StagedArchive internal constructor(
        internal val payload: File,
        val manifest: ArchiveManifest,
    ) : java.io.Closeable {
        val entries: List<EntryInfo> = manifest.entries.mapIndexed { index, entry ->
            EntryInfo(index, entry.name, entry.size, entry.digestHex)
        }

        /** Splits the ZIP out of the payload so `ZipFile` can read its directory. */
        fun zipFile(): File {
            val zip = newStaging("inner")
            payload.inputStream().use { input ->
                val declared = input.readIntBigEndian()
                if (declared < 0 || declared > payload.length() - 4) {
                    throw TamperedFileException("the manifest length does not fit the payload")
                }
                input.skipNBytes(declared.toLong())
                FileOutputStream(zip).use { output -> input.copyTo(output, 64 * 1024) }
            }
            return zip
        }

        override fun close() = deleteQuietly(payload)

        private fun InputStream.skipNBytes(count: Long) {
            var remaining = count
            while (remaining > 0) {
                val skipped = skip(remaining)
                if (skipped <= 0) throw TamperedFileException("the payload ended early")
                remaining -= skipped
            }
        }
    }

    private fun readManifest(file: File): ArchiveManifest {
        file.inputStream().use { input ->
            val length = input.readIntBigEndian()
            if (length <= 0 || length > file.length() - 4) {
                throw TamperedFileException("the archive manifest length is implausible")
            }
            val manifest = ByteArray(length)
            if (input.read(manifest) != length) throw TamperedFileException("the archive manifest is truncated")
            return runCatching { json.decodeFromString<ArchiveManifest>(String(manifest, Charsets.UTF_8)) }
                .getOrElse { throw TamperedFileException("the archive manifest is malformed", it) }
        }
    }

    /**
     * Cross-checks the ZIP directory against the manifest before anything is
     * offered for extraction. A mismatch is tampering, not a warning.
     */
    fun verifyDirectory(archive: StagedArchive): Outcome<List<EntryInfo>> {
        val zip = runCatching { archive.zipFile() }.getOrElse {
            return Outcome.Failed(ArchiveFailure.Tampered(it.messageOr("the inner archive could not be read")))
        }
        try {
            val names = runCatching { ZipFile(zip).use { file -> file.entries().asSequence().map { it.name }.toSet() } }
                .getOrNull() ?: return Outcome.Failed(ArchiveFailure.NotAnArchive)
            val declared = archive.manifest.entries.map { it.name }.toSet()
            if (names != declared) {
                return Outcome.Failed(ArchiveFailure.Tampered("the manifest and the archive contents disagree"))
            }
            return Outcome.Success(archive.entries)
        } finally {
            deleteQuietly(zip)
        }
    }

    /**
     * Extracts one entry into [output], verifying its SHA-256 and refusing to
     * release more bytes than the manifest declared. Callers must pass a temporary
     * sink and only copy it onward once this returns success.
     */
    fun extract(archive: StagedArchive, index: Int, output: OutputStream): Outcome<EntryInfo> {
        val entry = archive.manifest.entries.getOrNull(index)
            ?: return Outcome.Failed(ArchiveFailure.UnsafeName("entry $index is not in the manifest"))
        val safe = sanitize(entry.name)
            ?: return Outcome.Failed(ArchiveFailure.UnsafeName("stored name ${entry.name.take(40)} is not a safe file name"))
        if (safe != entry.name) {
            return Outcome.Failed(ArchiveFailure.UnsafeName("stored name ${entry.name.take(40)} is not a safe file name"))
        }
        val zip = runCatching { archive.zipFile() }.getOrElse {
            return Outcome.Failed(ArchiveFailure.Tampered(it.messageOr("the inner archive could not be read")))
        }
        try {
            val digest = MessageDigest.getInstance("SHA-256")
            ZipFile(zip).use { file ->
                val zipEntry = file.getEntry(entry.name)
                    ?: return Outcome.Failed(ArchiveFailure.Tampered("the manifest names a file the archive does not hold"))
                if (zipEntry.size > MAX_ENTRY_BYTES) {
                    return Outcome.Failed(ArchiveFailure.TooLarge("${entry.name} declares ${zipEntry.size} bytes"))
                }
                val ceiling = entry.size + maxOf(entry.size, MAX_EXTRA_SLACK_BYTES)
                var total = 0L
                file.getInputStream(zipEntry).use { input ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        total += read
                        if (total > ceiling) {
                            return Outcome.Failed(
                                ArchiveFailure.TooLarge(
                                    "${entry.name} expanded past its declared ${entry.size} bytes; " +
                                        "the archive was not extracted",
                                ),
                            )
                        }
                        digest.update(buffer, 0, read)
                        output.write(buffer, 0, read)
                    }
                }
                if (total != entry.size) {
                    return Outcome.Failed(
                        ArchiveFailure.Tampered("${entry.name} is ${total} bytes but the manifest declares ${entry.size}"),
                    )
                }
            }
            val actual = digest.digest().toHex()
            if (actual != entry.digestHex) {
                return Outcome.Failed(ArchiveFailure.Tampered("${entry.name} does not match its recorded digest"))
            }
            return Outcome.Success(EntryInfo(index, entry.name, entry.size, actual))
        } catch (failure: java.io.IOException) {
            return Outcome.Failed(ArchiveFailure.NotAnArchive)
        } finally {
            deleteQuietly(zip)
        }
    }

    /** Persists an archive record: counts, sizes and the container digest, never entry names. */
    suspend fun record(
        access: VaultAccess,
        label: String,
        created: Created,
        keySource: String,
    ): String {
        session.requireValid(access)
        return repository.save(
            access,
            SecretKinds.ARCHIVE,
            null,
            SecretsJson.encodeArchive(
                ArchiveRecordPayload(
                    label = label.take(120).ifBlank { "archive" },
                    entryCount = created.entryCount,
                    plaintextBytes = created.plaintextBytes,
                    containerBytes = created.containerBytes,
                    digestHex = created.digestHex,
                    compressed = created.compressed,
                    keySource = keySource,
                    createdAt = System.currentTimeMillis(),
                ),
            ),
        )
    }

    fun observeRecords(access: VaultAccess) =
        repository.observe(access, SecretKinds.ARCHIVE).map { rows ->
            rows.mapNotNull { row ->
                if (row.decryptionFailed) return@mapNotNull null
                SecretsJson.decodeArchive(row.payloadJson)
            }
        }

    private fun newStaging(suffix: String): File =
        File(tempDirProvider(), "karc-$suffix-${System.nanoTime()}.bin").also { it.parentFile?.mkdirs() }

    private fun deleteQuietly(file: File) {
        runCatching { file.delete() }
    }

    private class QuotaExceededException(message: String) : RuntimeException(message)
}

private fun ByteArray.toHex(): String = joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }

private fun Throwable.messageOr(fallback: String): String = message?.takeIf { it.isNotBlank() } ?: fallback

private fun OutputStream.writeIntBigEndian(value: Int) {
    write(byteArrayOf(
        (value shr 24 and 0xff).toByte(),
        (value shr 16 and 0xff).toByte(),
        (value shr 8 and 0xff).toByte(),
        (value and 0xff).toByte(),
    ))
}

private fun InputStream.readIntBigEndian(): Int {
    val buffer = ByteArray(4)
    var filled = 0
    while (filled < 4) {
        val read = read(buffer, filled, 4 - filled)
        if (read < 0) throw TamperedFileException("the archive payload is truncated")
        filled += read
    }
    return ((buffer[0].toInt() and 0xff) shl 24) or
        ((buffer[1].toInt() and 0xff) shl 16) or
        ((buffer[2].toInt() and 0xff) shl 8) or
        (buffer[3].toInt() and 0xff)
}

/** Writes through while hashing and counting, so the container digest needs no second pass. */
private class DigestTee(private val delegate: OutputStream, private val digest: MessageDigest) : OutputStream() {
    var count: Long = 0L
        private set

    override fun write(byte: Int) {
        digest.update(byte.toByte())
        delegate.write(byte)
        count += 1
    }

    override fun write(bytes: ByteArray, offset: Int, length: Int) {
        digest.update(bytes, offset, length)
        delegate.write(bytes, offset, length)
        count += length
    }

    override fun flush() = delegate.flush()

    override fun close() = delegate.close()
}
