package com.knoux.crypt.data

import android.media.ExifInterface
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream

/**
 * Format-aware metadata inspection and selective removal (TASK 24).
 *
 * Reading and rewriting is done by the platform's own `android.media.ExifInterface`,
 * not by a hand-written APP1 parser: it knows where the segments live and how to
 * write them back. What this service adds is the judgement — which tags actually
 * reveal something — and an honest account of what was looked at.
 *
 * `android.media.ExifInterface` cannot enumerate the tags a file carries, so the
 * inventory is a declared list. That is a limit, not a secret: anything outside
 * [KNOWN_TAGS] is reported as *not inspected*, and no file is ever described as
 * clean. Two rules hold regardless: the original is only ever read, and the output
 * is a new document the user chose.
 */

enum class MetadataGroup { TECHNICAL, GPS, CAMERA_MODEL, AUTHOR, TIMESTAMPS, COMMENTS, OTHER }

data class MetadataItem(val tag: String, val label: String, val value: String, val group: MetadataGroup)

data class Inventory(
    val format: String,
    val writable: Boolean,
    val width: Int,
    val height: Int,
    val items: List<MetadataItem>,
    val inspectedTagCount: Int,
) {
    fun count(group: MetadataGroup): Int = items.count { it.group == group }

    val groups: List<MetadataGroup> get() = MetadataGroup.values().filter { count(it) > 0 }
}

data class CleanResult(
    val removed: List<MetadataItem>,
    val kept: List<MetadataItem>,
    val outputBytes: Long,
    val notes: List<String>,
)

sealed class MetadataFailure {
    data object Unreadable : MetadataFailure()
    data class Unsupported(val detail: String) : MetadataFailure()
}

class MetadataFailureException(val failure: MetadataFailure) : IllegalStateException(failure.toString())

class MetadataCleaner {

    companion object {
        /** Formats `ExifInterface` can rewrite on this platform. */
        val WRITABLE_MIME = setOf("image/jpeg", "image/tiff")

        private val GPS_TAGS = listOf(
            ExifInterface.TAG_GPS_LATITUDE, ExifInterface.TAG_GPS_LATITUDE_REF,
            ExifInterface.TAG_GPS_LONGITUDE, ExifInterface.TAG_GPS_LONGITUDE_REF,
            ExifInterface.TAG_GPS_ALTITUDE, ExifInterface.TAG_GPS_ALTITUDE_REF,
            ExifInterface.TAG_GPS_TIMESTAMP, ExifInterface.TAG_GPS_DATESTAMP,
            ExifInterface.TAG_GPS_PROCESSING_METHOD, ExifInterface.TAG_GPS_AREA_INFORMATION,
            ExifInterface.TAG_GPS_VERSION_ID, ExifInterface.TAG_GPS_IMG_DIRECTION,
            ExifInterface.TAG_GPS_IMG_DIRECTION_REF, ExifInterface.TAG_GPS_DEST_BEARING,
        )

        private val CAMERA_MODEL_TAGS = listOf(
            ExifInterface.TAG_MAKE, ExifInterface.TAG_MODEL, ExifInterface.TAG_SOFTWARE,
        )

        private val AUTHOR_TAGS = listOf(
            ExifInterface.TAG_ARTIST, ExifInterface.TAG_COPYRIGHT,
        )

        private val TIMESTAMP_TAGS = listOf(
            ExifInterface.TAG_DATETIME, ExifInterface.TAG_DATETIME_ORIGINAL,
            ExifInterface.TAG_DATETIME_DIGITIZED, ExifInterface.TAG_SUBSEC_TIME,
            ExifInterface.TAG_SUBSEC_TIME_ORIGINAL, ExifInterface.TAG_SUBSEC_TIME_DIGITIZED,
        )

        private val COMMENT_TAGS = listOf(
            ExifInterface.TAG_USER_COMMENT, ExifInterface.TAG_IMAGE_DESCRIPTION,
        )

        /**
         * Everything this build looks at. A tag absent from this list is neither
         * read nor removed, and the UI says so.
         */
        val KNOWN_TAGS: List<String> = (
            GPS_TAGS + CAMERA_MODEL_TAGS + AUTHOR_TAGS + TIMESTAMP_TAGS + COMMENT_TAGS + listOf(
                ExifInterface.TAG_APERTURE, ExifInterface.TAG_EXPOSURE_TIME, ExifInterface.TAG_ISO_SPEED_RATINGS,
                ExifInterface.TAG_FOCAL_LENGTH, ExifInterface.TAG_WHITE_BALANCE, ExifInterface.TAG_FLASH,
                ExifInterface.TAG_METERING_MODE, ExifInterface.TAG_SHUTTER_SPEED_VALUE, ExifInterface.TAG_COLOR_SPACE,
                ExifInterface.TAG_PIXEL_X_DIMENSION, ExifInterface.TAG_PIXEL_Y_DIMENSION,
                ExifInterface.TAG_IMAGE_WIDTH, ExifInterface.TAG_IMAGE_LENGTH, ExifInterface.TAG_ORIENTATION,
                ExifInterface.TAG_EXIF_VERSION,
            )
            ).distinct()

        /**
         * Pure classification, so the security-relevant judgement — which tags
         * place a person, name a device or identify an author — is testable
         * without a handset.
         */
        fun groupOf(tag: String): MetadataGroup = when {
            tag in GPS_TAGS || tag.startsWith("GPS_") -> MetadataGroup.GPS
            tag in CAMERA_MODEL_TAGS -> MetadataGroup.CAMERA_MODEL
            tag in AUTHOR_TAGS -> MetadataGroup.AUTHOR

            tag in TIMESTAMP_TAGS -> MetadataGroup.TIMESTAMPS
            tag in COMMENT_TAGS -> MetadataGroup.COMMENTS
            else -> MetadataGroup.TECHNICAL
        }

        /** Tags whose removal would make the image display wrongly rather than safely. */
        fun isStructural(tag: String): Boolean = tag in setOf(
            ExifInterface.TAG_ORIENTATION, ExifInterface.TAG_PIXEL_X_DIMENSION,
            ExifInterface.TAG_PIXEL_Y_DIMENSION, ExifInterface.TAG_EXIF_VERSION,
            ExifInterface.TAG_INTEROPERABILITY_INDEX, ExifInterface.TAG_IMAGE_WIDTH,
            ExifInterface.TAG_IMAGE_LENGTH,
        )
    }

    fun inspect(input: InputStream, mimeHint: String?): Inventory {
        val format = mimeHint?.lowercase() ?: guessFormat(input)
        val exif = runCatching { ExifInterface(input) }
            .getOrElse { throw MetadataFailureException(MetadataFailure.Unreadable) }
        val items = readAll(exif)
        return Inventory(
            format = format,
            writable = format in WRITABLE_MIME,
            width = firstInt(exif, ExifInterface.TAG_IMAGE_WIDTH, ExifInterface.TAG_PIXEL_X_DIMENSION),
            height = firstInt(exif, ExifInterface.TAG_IMAGE_LENGTH, ExifInterface.TAG_PIXEL_Y_DIMENSION),
            items = items,
            inspectedTagCount = KNOWN_TAGS.size,
        )
    }

    /**
     * Copies the source into staging, clears the selected groups through the
     * platform, and writes the result onward. The source stream is only read. A
     * format the platform will not rewrite is refused outright, never passed
     * through as "cleaned".
     */
    fun clean(
        input: InputStream,
        output: OutputStream,
        cacheDir: File,
        groupsToRemove: Set<MetadataGroup>,
        mimeHint: String?,
    ): CleanResult {
        val format = mimeHint?.lowercase() ?: "image/jpeg"
        if (format !in WRITABLE_MIME) {
            throw MetadataFailureException(
                MetadataFailure.Unsupported(
                    "Android's ExifInterface cannot rewrite $format. No clean copy was produced, and the original is unchanged.",
                ),
            )
        }
        val staging = File(cacheDir, "meta-${System.nanoTime()}.${if (format == "image/tiff") "tif" else "jpg"}")
        try {
            FileOutputStream(staging).use { target -> input.copyTo(target, 64 * 1024) }
            val exif = runCatching { ExifInterface(staging.absolutePath) }
                .getOrElse { throw MetadataFailureException(MetadataFailure.Unreadable) }
            val removed = mutableListOf<MetadataItem>()
            val kept = mutableListOf<MetadataItem>()
            var changed = false
            readAll(exif).forEach { item ->
                if (item.group in groupsToRemove && !isStructural(item.tag)) {
                    runCatching { exif.setAttribute(item.tag, null) }
                        .onSuccess { changed = true }
                        .onFailure { kept += item }
                    if (changed) removed += item
                } else {
                    kept += item
                }
            }
            if (changed) {
                runCatching { exif.saveAttributes() }.getOrElse {
                    throw MetadataFailureException(MetadataFailure.Unsupported(it.messageOr("the platform refused to rewrite the file")))
                }
            }
            staging.inputStream().use { it.copyTo(output, 64 * 1024) }
            return CleanResult(
                removed = removed,
                kept = kept,
                outputBytes = staging.length(),
                notes = listOf(
                    "Removed ${removed.size} of ${KNOWN_TAGS.size} inspected tags through android.media.ExifInterface.",
                    "XMP blocks, ICC profiles, embedded thumbnails, GPS inside video and document metadata in PDF or Office files are not inspected or removed.",
                ),
            )
        } finally {
            runCatching { staging.delete() }
        }
    }

    private fun readAll(exif: ExifInterface): List<MetadataItem> =
        KNOWN_TAGS.mapNotNull { tag ->
            val value = runCatching { exif.getAttribute(tag) }.getOrNull()
            if (value.isNullOrBlank()) null
            else MetadataItem(tag, tag.lowercase().removePrefix("tag_").replace('_', ' '), value, groupOf(tag))
        }.sortedBy { it.tag }

    private fun firstInt(exif: ExifInterface, primary: String, fallback: String): Int {
        val first = runCatching { exif.getAttributeInt(primary, 0) }.getOrDefault(0)
        return if (first > 0) first else runCatching { exif.getAttributeInt(fallback, 0) }.getOrDefault(0)
    }

    private fun guessFormat(input: InputStream): String {
        val head = ByteArray(4)
        val read = runCatching { input.read(head) }.getOrDefault(0)
        return if (read >= 2 && head[0] == 0xFF.toByte() && head[1] == 0xD8.toByte()) "image/jpeg" else "unknown"
    }

    private fun Throwable.messageOr(fallback: String): String = message?.takeIf { it.isNotBlank() } ?: fallback
}
