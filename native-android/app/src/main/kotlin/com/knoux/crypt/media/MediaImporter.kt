package com.knoux.crypt.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import com.knoux.crypt.data.VaultMediaType
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream

class MediaImportException(message: String, cause: Throwable? = null) : IOException(message, cause)

/**
 * Prepares a Photo Picker / Storage Access Framework item for the Shadow Vault.
 *
 * The picker grants a temporary read permission; this class reads metadata and
 * builds a small thumbnail in memory, then the ViewModel reopens the stream and
 * encrypts it directly. No plaintext is copied to an intermediate file and no
 * broad storage permission is requested.
 */
class MediaImporter(private val context: Context) {
    data class Prepared(
        val uri: Uri,
        val displayName: String,
        val mimeType: String,
        val type: VaultMediaType,
        val sizeBytes: Long,
        val thumbnailJpeg: ByteArray?,
        val width: Int,
        val height: Int,
        val durationMs: Long,
        val rotationDegrees: Int,
    )

    fun prepare(uri: Uri): Prepared {
        val resolver = context.contentResolver
        val mimeType = runCatching { resolver.getType(uri) }
            .getOrNull()
            ?.takeIf { it.isNotBlank() }
            ?: "application/octet-stream"
        val type = when {
            mimeType.startsWith("image/") -> VaultMediaType.PHOTO
            mimeType.startsWith("video/") -> VaultMediaType.VIDEO
            mimeType.startsWith("audio/") -> VaultMediaType.AUDIO
            else -> VaultMediaType.FILE
        }
        val (name, declaredSize) = queryNameAndSize(uri)
        val displayName = name
            ?.substringAfterLast('/')
            ?.substringAfterLast('\\')
            ?.trim()
            ?.take(180)
            ?.takeIf { it.isNotBlank() }
            ?: "vault item"
        val size = declaredSize ?: runCatching {
            resolver.openAssetFileDescriptor(uri, "r")?.use { it.length }
        }.getOrNull()?.takeIf { it >= 0 }
        if (size == null) {
            throw MediaImportException("The provider did not declare a file size, so it cannot be encrypted safely")
        }

        var thumbnail: ByteArray? = null
        var width = 0
        var height = 0
        var duration = 0L
        var rotation = 0
        when (type) {
            VaultMediaType.PHOTO -> {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                runCatching {
                    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
                }
                width = bounds.outWidth.coerceAtLeast(0)
                height = bounds.outHeight.coerceAtLeast(0)
                rotation = runCatching { imageRotation(uri) }.getOrDefault(0)
                thumbnail = runCatching { imageThumbnail(uri, bounds, rotation) }.getOrNull()
            }

            VaultMediaType.VIDEO -> {
                val metadata = runCatching { videoMetadata(uri) }.getOrNull()
                width = metadata?.first ?: 0
                height = metadata?.second ?: 0
                duration = metadata?.third ?: 0L
                thumbnail = runCatching { videoThumbnail(uri) }.getOrNull()
            }

            VaultMediaType.AUDIO -> {
                duration = runCatching {
                    val retriever = MediaMetadataRetriever()
                    try {
                        retriever.setDataSource(context, uri)
                        retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                            ?.toLongOrNull() ?: 0L
                    } finally {
                        runCatching { retriever.release() }
                    }
                }.getOrDefault(0L)
            }

            VaultMediaType.FILE -> Unit
        }

        return Prepared(
            uri = uri,
            displayName = displayName,
            mimeType = mimeType,
            type = type,
            sizeBytes = size,
            thumbnailJpeg = thumbnail,
            width = width,
            height = height,
            durationMs = duration,
            rotationDegrees = rotation,
        )
    }

    fun openStream(uri: Uri): InputStream =
        context.contentResolver.openInputStream(uri)
            ?: throw MediaImportException("The selected item is no longer readable")

    private fun queryNameAndSize(uri: Uri): Pair<String?, Long?> {
        val projection = arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        return runCatching {
            context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
                if (!cursor.moveToFirst()) return@use null
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                val name = if (nameIndex >= 0 && !cursor.isNull(nameIndex)) cursor.getString(nameIndex) else null
                val size = if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) cursor.getLong(sizeIndex) else null
                name to size
            }
        }.getOrNull() ?: (null to null)
    }

    private fun imageThumbnail(uri: Uri, bounds: BitmapFactory.Options, rotationDegrees: Int): ByteArray? {
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (bounds.outWidth / sample > 512 || bounds.outHeight / sample > 512) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val bitmap = context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, options)
        } ?: return null
        return compressThumbnail(bitmap, rotationDegrees)
    }

    /** EXIF rotations are applied to the encrypted thumbnail and the full viewer. */
    private fun imageRotation(uri: Uri): Int {
        val orientation = context.contentResolver.openInputStream(uri)?.use { stream ->
            ExifInterface(stream).getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL,
            )
        } ?: return 0
        return when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90
            ExifInterface.ORIENTATION_ROTATE_180 -> 180
            ExifInterface.ORIENTATION_ROTATE_270 -> 270
            else -> 0
        }
    }

    private fun videoMetadata(uri: Uri): Triple<Int, Int, Long>? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(context, uri)
            var width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
                ?.toIntOrNull() ?: 0
            var height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
                ?.toIntOrNull() ?: 0
            val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
                ?.toIntOrNull() ?: 0
            if (rotation == 90 || rotation == 270) {
                val swapped = width
                width = height
                height = swapped
            }
            val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                ?.toLongOrNull() ?: 0L
            Triple(width, height, duration)
        } finally {
            runCatching { retriever.release() }
        }
    }

    private fun videoThumbnail(uri: Uri): ByteArray? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(context, uri)
            val frame = retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                ?: return null
            compressThumbnail(frame)
        } finally {
            runCatching { retriever.release() }
        }
    }

    private fun compressThumbnail(source: Bitmap, rotationDegrees: Int = 0): ByteArray {
        val upright = if (rotationDegrees != 0) {
            val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
            val rotated = Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
            if (rotated !== source) source.recycle()
            rotated
        } else {
            source
        }
        val maxSide = maxOf(upright.width, upright.height)
        val scaled = if (maxSide > 512) {
            val ratio = 512f / maxSide
            Bitmap.createScaledBitmap(
                upright,
                (upright.width * ratio).toInt().coerceAtLeast(1),
                (upright.height * ratio).toInt().coerceAtLeast(1),
                true,
            )
        } else {
            upright
        }
        val output = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 80, output)
        if (scaled !== upright) scaled.recycle()
        upright.recycle()
        return output.toByteArray()
    }
}