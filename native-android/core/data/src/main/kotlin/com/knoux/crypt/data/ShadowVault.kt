package com.knoux.crypt.data

import com.knoux.crypt.security.FileEnvelope
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable

/** Encrypted media types supported by the Shadow Vault (TASK 05). */
enum class VaultMediaType(val code: String) {
    PHOTO("photo"),
    VIDEO("video"),
    AUDIO("audio"),
    FILE("file"),
    ;

    companion object {
        fun fromCode(value: String): VaultMediaType =
            entries.firstOrNull { it.code == value } ?: FILE
    }
}

/**
 * Metadata stored as a KNC2 vault record. It lives inside ciphertext in Room;
 * the only plaintext things on disk are container lengths and random file names.
 */
@Serializable
data class VaultMediaPayload(
    val displayName: String,
    val mimeType: String,
    val mediaType: String,
    val sizeBytes: Long,
    val containerBytes: Long = 0,
    val thumbnailBytes: Long = 0,
    val durationMs: Long = 0,
    val width: Int = 0,
    val height: Int = 0,
    /** EXIF rotation for images (0/90/180/270); 0 for other media. */
    val rotationDegrees: Int = 0,
    val hasThumbnail: Boolean = false,
    val importedAt: Long,
)

/** A decoded vault item. A null payload means the record is genuinely unreadable. */
data class VaultMediaItem(
    val id: String,
    val payload: VaultMediaPayload?,
    val updatedAt: Long,
) {
    val type: VaultMediaType get() = VaultMediaType.fromCode(payload?.mediaType.orEmpty())
    val readable: Boolean get() = payload != null
    val aspectRatio: Float
        get() {
            val storedWidth = payload?.width ?: 0
            val storedHeight = payload?.height ?: 0
            val quarterTurn = (payload?.rotationDegrees ?: 0) % 180 != 0
            val width = if (quarterTurn) storedHeight else storedWidth
            val height = if (quarterTurn) storedWidth else storedHeight
            return if (width > 0 && height > 0) width.toFloat() / height.toFloat() else 1f
        }
}

data class VaultUsage(
    val itemCount: Int,
    val unreadableCount: Int,
    val encryptedBytes: Long,
    val byType: Map<VaultMediaType, Long>,
)

class VaultMediaUnavailableException(message: String) : IOException(message)
class VaultMediaTooLargeException(val bytes: Long, val limit: Long) :
    IOException("Media is $bytes bytes; the in-memory preview limit is $limit bytes")

/**
 * Shadow Vault (TASK 05) vertical service.
 *
 * - Media bytes are encrypted with the established KNF2 device-file envelope
 *   (per-file DEK wrapped by the Keystore root); metadata is a KNC2 vault record.
 * - No plaintext media or thumbnail is persisted. Thumbnails are encrypted
 *   separately and decrypted only into memory for the grid.
 * - Playback uses [VaultFileCipher.openRandomAccess], so only authenticated
 *   chunks are decrypted into a bounded memory cache; no plaintext temp file.
 * - Export writes plaintext only to a destination the user explicitly chose
 *   through the Storage Access Framework, after an explicit confirmation.
 * - Every method requires a live [VaultAccess]; locking cancels reads mid-stream.
 */
class ShadowVaultService(
    private val session: SessionManager,
    private val secrets: SecretRepository,
    private val files: VaultFileCipher,
    root: File,
    private val audit: SecurityAuditSink = NoopSecurityAuditSink,
) {
    companion object {
        const val MEDIA_CONTEXT = "knoux.shadow.media.v1"
        const val THUMB_CONTEXT = "knoux.shadow.thumb.v1"
        const val MAX_THUMBNAIL_BYTES = 2L * 1024 * 1024
        const val MAX_IMAGE_BYTES = 64L * 1024 * 1024
    }

    private val root = root
    private val mediaDir = File(root, "media")
    private val thumbDir = File(root, "thumbs")
    private val tempDir = File(root, "tmp")

    fun observe(access: VaultAccess): Flow<List<VaultMediaItem>> =
        secrets.observe(access, SecretKinds.MEDIA).map { rows ->
            rows.map { record ->
                VaultMediaItem(
                    id = record.id,
                    payload = if (record.decryptionFailed) null else SecretsJson.decodeMedia(record.payloadJson),
                    updatedAt = record.updatedAt,
                )
            }.sortedWith(
                compareByDescending<VaultMediaItem> { it.payload?.importedAt ?: 0L }
                    .thenByDescending { it.id },
            )
        }

    suspend fun usage(access: VaultAccess): VaultUsage = withContext(Dispatchers.IO) {
        val payloads = secrets.list(access, SecretKinds.MEDIA).map { record ->
            if (record.decryptionFailed) null else SecretsJson.decodeMedia(record.payloadJson)
        }
        val readable = payloads.filterNotNull()
        val byType = VaultMediaType.entries.associateWith { type ->
            readable.filter { it.mediaType == type.code }.sumOf { it.containerBytes + it.thumbnailBytes }
        }
        VaultUsage(
            itemCount = payloads.size,
            unreadableCount = payloads.count { it == null },
            encryptedBytes = byType.values.sum(),
            byType = byType,
        )
    }

    suspend fun import(
        access: VaultAccess,
        input: InputStream,
        displayName: String,
        mimeType: String,
        type: VaultMediaType,
        sizeBytes: Long,
        thumbnailJpeg: ByteArray? = null,
        width: Int = 0,
        height: Int = 0,
        durationMs: Long = 0,
        rotationDegrees: Int = 0,
        onProgress: (FileEnvelope.Progress) -> Unit = {},
    ): VaultMediaItem = withContext(Dispatchers.IO) {
        session.requireValid(access)
        require(sizeBytes >= 0) { "Media size is invalid" }
        ensureDirectories()
        val id = UUID.randomUUID().toString()
        val target = File(mediaDir, "$id.knf")
        val temp = File(tempDir, "$id.part")
        var thumbTarget: File? = null
        var thumbTemp: File? = null
        val importJob = currentCoroutineContext()[Job]
        try {
            FileOutputStream(temp).use { output ->
                files.encrypt(
                    access = access,
                    input = input,
                    output = output,
                    plaintextLength = sizeBytes,
                    context = MEDIA_CONTEXT.toByteArray(Charsets.UTF_8),
                    onProgress = { progress ->
                        // FileEnvelope is synchronous; make cancel/retry stop at
                        // the next chunk instead of after the whole media file.
                        if (importJob?.isActive == false) {
                            throw CancellationException("Media import cancelled")
                        }
                        onProgress(progress)
                    },
                )
                output.fd.sync()
            }
            if (!temp.renameTo(target)) throw IOException("Could not commit encrypted media")
            val thumbnail = thumbnailJpeg?.takeIf { it.isNotEmpty() }
            if (thumbnail != null) {
                if (thumbnail.size > MAX_THUMBNAIL_BYTES) {
                    throw VaultMediaTooLargeException(thumbnail.size.toLong(), MAX_THUMBNAIL_BYTES)
                }
                val destination = File(thumbDir, "$id.knf")
                val partial = File(tempDir, "$id.thumb.part")
                thumbTemp = partial
                FileOutputStream(partial).use { output ->
                    files.encrypt(
                        access = access,
                        input = thumbnail.inputStream(),
                        output = output,
                        plaintextLength = thumbnail.size.toLong(),
                        context = THUMB_CONTEXT.toByteArray(Charsets.UTF_8),
                    )
                    output.fd.sync()
                }
                if (!partial.renameTo(destination)) throw IOException("Could not commit encrypted thumbnail")
                thumbTarget = destination
            }
            val now = System.currentTimeMillis()
            val payload = VaultMediaPayload(
                displayName = displayName.take(180).ifBlank { "vault item" },
                mimeType = mimeType.take(120).ifBlank { "application/octet-stream" },
                mediaType = type.code,
                sizeBytes = sizeBytes,
                containerBytes = target.length(),
                thumbnailBytes = thumbTarget?.length() ?: 0L,
                durationMs = durationMs.coerceAtLeast(0),
                width = width.coerceAtLeast(0),
                height = height.coerceAtLeast(0),
                rotationDegrees = when (rotationDegrees) {
                    90, 180, 270 -> rotationDegrees
                    else -> 0
                },
                hasThumbnail = thumbTarget != null,
                importedAt = now,
            )
            secrets.save(access, SecretKinds.MEDIA, id, SecretsJson.encodeMedia(payload))
            audit.recordSafely(
                SecurityAuditEvent(
                    SecurityEventAction.MEDIA_IMPORTED,
                    "type=${type.code} bytes=$sizeBytes thumb=${thumbTarget != null}",
                ),
            )
            VaultMediaItem(id, payload, now)
        } catch (failure: CancellationException) {
            runCatching { temp.delete() }
            runCatching { thumbTemp?.delete() }
            runCatching { target.delete() }
            runCatching { thumbTarget?.delete() }
            audit.recordSafely(
                SecurityAuditEvent(SecurityEventAction.MEDIA_IMPORT_CANCELLED, "type=${type.code}"),
            )
            throw failure
        } catch (failure: Throwable) {
            runCatching { temp.delete() }
            runCatching { thumbTemp?.delete() }
            runCatching { target.delete() }
            runCatching { thumbTarget?.delete() }
            audit.recordSafely(
                SecurityAuditEvent(SecurityEventAction.MEDIA_IMPORT_FAILED, "type=${type.code}"),
            )
            throw failure
        } finally {
            thumbnailJpeg?.fill(0)
        }
    }

    /** Opens authenticated random access to the full media container. */
    suspend fun openReader(access: VaultAccess, recordId: String): VaultRandomAccessReader =
        withContext(Dispatchers.IO) {
            val record = requireReadableRecord(access, recordId)
            val file = File(mediaDir, "$recordId.knf")
            if (!file.isFile) throw VaultMediaUnavailableException("Encrypted media file is missing")
            val reader = files.openRandomAccess(
                access,
                file,
                MEDIA_CONTEXT.toByteArray(Charsets.UTF_8),
            )
            audit.recordSafely(
                SecurityAuditEvent(
                    SecurityEventAction.MEDIA_OPENED,
                    "type=${record.mediaType} bytes=${record.sizeBytes}",
                ),
            )
            reader
        }

    /** Reads a full image into memory with an explicit bound; never persists it. */
    suspend fun readImage(access: VaultAccess, recordId: String): ByteArray =
        withContext(Dispatchers.IO) {
            openReader(access, recordId).use { reader ->
                readAll(reader, MAX_IMAGE_BYTES)
            }
        }

    /** Decrypts the encrypted thumbnail into memory for the grid. */
    suspend fun thumbnail(access: VaultAccess, recordId: String): ByteArray? =
        withContext(Dispatchers.IO) {
            val record = requireReadableRecord(access, recordId)
            if (!record.hasThumbnail) return@withContext null
            val file = File(thumbDir, "$recordId.knf")
            if (!file.isFile) return@withContext null
            val reader = files.openRandomAccess(
                access,
                file,
                THUMB_CONTEXT.toByteArray(Charsets.UTF_8),
            )
            reader.use { readAll(it, MAX_THUMBNAIL_BYTES) }
        }

    /**
     * Controlled export. The destination is a user-chosen SAF stream opened by
     * the UI after explicit confirmation. A partial plaintext destination may
     * remain if the provider fails mid-write; the app never hides that.
     */
    suspend fun export(
        access: VaultAccess,
        recordId: String,
        output: OutputStream,
        onProgress: (FileEnvelope.Progress) -> Unit = {},
    ): Long = withContext(Dispatchers.IO) {
        val record = requireReadableRecord(access, recordId)
        val file = File(mediaDir, "$recordId.knf")
        if (!file.isFile) throw VaultMediaUnavailableException("Encrypted media file is missing")
        try {
            file.inputStream().use { input ->
                val written = files.decrypt(
                    access = access,
                    input = input,
                    output = output,
                    context = MEDIA_CONTEXT.toByteArray(Charsets.UTF_8),
                    onProgress = onProgress,
                )
                output.flush()
                audit.recordSafely(
                    SecurityAuditEvent(
                        SecurityEventAction.MEDIA_EXPORTED,
                        "type=${record.mediaType} bytes=$written",
                    ),
                )
                written
            }
        } catch (failure: Throwable) {
            audit.recordSafely(
                SecurityAuditEvent(
                    SecurityEventAction.MEDIA_EXPORT_FAILED,
                    "type=${record.mediaType}",
                ),
            )
            throw failure
        }
    }

    /**
     * Removes the metadata record first, then the encrypted files. Deletion is
     * logical, not a provable physical erase; the UI states this.
     */
    suspend fun delete(access: VaultAccess, recordId: String) = withContext(Dispatchers.IO) {
        val record = secrets.find(access, recordId)
            ?: throw VaultMediaUnavailableException("Media record not found")
        if (record.kind != SecretKinds.MEDIA) throw VaultMediaUnavailableException("Not a media record")
        secrets.delete(access, recordId)
        runCatching { File(mediaDir, "$recordId.knf").delete() }
        runCatching { File(thumbDir, "$recordId.knf").delete() }
        audit.recordSafely(
            SecurityAuditEvent(SecurityEventAction.MEDIA_DELETED, "record removed"),
        )
    }

    /**
     * Lock-time cleanup: removes interrupted import temps. Encrypted final files
     * are never deleted on lock; the UI drops decrypted bitmaps and readers.
     */
    fun onLock() {
        runCatching {
            tempDir.listFiles()?.forEach { file ->
                if (file.isFile && file.name.endsWith(".part")) file.delete()
            }
        }
    }

    fun encryptedFile(recordId: String): File = File(mediaDir, "$recordId.knf")

    private suspend fun requireReadableRecord(access: VaultAccess, recordId: String): VaultMediaPayload {
        session.requireValid(access)
        val record = secrets.find(access, recordId)
            ?: throw VaultMediaUnavailableException("Media record not found")
        if (record.kind != SecretKinds.MEDIA) throw VaultMediaUnavailableException("Not a media record")
        if (record.decryptionFailed) throw VaultMediaUnavailableException("Media metadata is unreadable")
        return SecretsJson.decodeMedia(record.payloadJson)
            ?: throw VaultMediaUnavailableException("Media metadata is malformed")
    }

    private suspend fun readAll(reader: VaultRandomAccessReader, maxBytes: Long): ByteArray {
        if (reader.plaintextLength > maxBytes) {
            throw VaultMediaTooLargeException(reader.plaintextLength, maxBytes)
        }
        val output = ByteArrayOutputStream(reader.plaintextLength.toInt())
        val buffer = ByteArray(FileEnvelope.DEFAULT_CHUNK_SIZE)
        var position = 0L
        while (true) {
            currentCoroutineContext().ensureActive()
            val read = reader.readAt(position, buffer, 0, buffer.size)
            if (read < 0) break
            if (read == 0) throw IOException("Media reader made no progress")
            output.write(buffer, 0, read)
            position += read
        }
        buffer.fill(0)
        return output.toByteArray()
    }

    private fun ensureDirectories() {
        if (!mediaDir.isDirectory && !mediaDir.mkdirs()) throw IOException("Could not create vault storage")
        if (!thumbDir.isDirectory && !thumbDir.mkdirs()) throw IOException("Could not create thumbnail storage")
        if (!tempDir.isDirectory && !tempDir.mkdirs()) throw IOException("Could not create temporary storage")
    }
}