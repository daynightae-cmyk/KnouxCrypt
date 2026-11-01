package com.knoux.crypt.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Classification tests for the metadata cleaner (TASK 24).
 *
 * The platform does the reading and writing, so what this build is responsible
 * for — and what these tests pin — is the judgement: which tags place a person,
 * which name a device, which are structural and must never be removed, and which
 * tags are outside the inspected set at all.
 */
class MetadataCleanerTest {

    @Test
    fun locationTagsAreGroupedAsGps() {
        listOf(
            android.media.ExifInterface.TAG_GPS_LATITUDE,
            android.media.ExifInterface.TAG_GPS_LONGITUDE_REF,
            android.media.ExifInterface.TAG_GPS_ALTITUDE,
            android.media.ExifInterface.TAG_GPS_TIMESTAMP,
            android.media.ExifInterface.TAG_GPS_PROCESSING_METHOD,
        ).forEach { tag ->
            assertEquals("misgrouped $tag", MetadataGroup.GPS, MetadataCleaner.groupOf(tag))
        }
    }

    @Test
    fun deviceAndAuthorTagsAreSeparatedFromTechnicalData() {
        assertEquals(MetadataGroup.CAMERA_MODEL, MetadataCleaner.groupOf(android.media.ExifInterface.TAG_MAKE))
        assertEquals(MetadataGroup.CAMERA_MODEL, MetadataCleaner.groupOf(android.media.ExifInterface.TAG_MODEL))
        assertEquals(MetadataGroup.CAMERA_MODEL, MetadataCleaner.groupOf(android.media.ExifInterface.TAG_SOFTWARE))
        assertEquals(MetadataGroup.AUTHOR, MetadataCleaner.groupOf(android.media.ExifInterface.TAG_ARTIST))
        assertEquals(MetadataGroup.AUTHOR, MetadataCleaner.groupOf(android.media.ExifInterface.TAG_COPYRIGHT))
        assertEquals(MetadataGroup.COMMENTS, MetadataCleaner.groupOf(android.media.ExifInterface.TAG_USER_COMMENT))
        assertEquals(MetadataGroup.COMMENTS, MetadataCleaner.groupOf(android.media.ExifInterface.TAG_IMAGE_DESCRIPTION))
        assertEquals(MetadataGroup.TIMESTAMPS, MetadataCleaner.groupOf(android.media.ExifInterface.TAG_DATETIME_ORIGINAL))
        assertEquals(MetadataGroup.TECHNICAL, MetadataCleaner.groupOf(android.media.ExifInterface.TAG_APERTURE))
        assertEquals(MetadataGroup.TECHNICAL, MetadataCleaner.groupOf(android.media.ExifInterface.TAG_FOCAL_LENGTH))
    }

    @Test
    fun structuralTagsAreNeverCandidatesForRemoval() {
        listOf(
            android.media.ExifInterface.TAG_ORIENTATION,
            android.media.ExifInterface.TAG_PIXEL_X_DIMENSION,
            android.media.ExifInterface.TAG_IMAGE_WIDTH,
            android.media.ExifInterface.TAG_EXIF_VERSION,
        ).forEach { tag ->
            assertTrue("expected $tag to be structural", MetadataCleaner.isStructural(tag))
        }
        assertFalse(MetadataCleaner.isStructural(android.media.ExifInterface.TAG_GPS_LATITUDE))
        assertFalse(MetadataCleaner.isStructural(android.media.ExifInterface.TAG_MAKE))
    }

    @Test
    fun theInspectedSetIsDeclaredDeduplicatedAndCoversTheSensitiveGroups() {
        val tags = MetadataCleaner.KNOWN_TAGS
        assertEquals("KNOWN_TAGS contains duplicates", tags.size, tags.distinct().size)
        assertTrue(tags.contains(android.media.ExifInterface.TAG_GPS_LATITUDE))
        assertTrue(tags.contains(android.media.ExifInterface.TAG_MAKE))
        assertTrue(tags.contains(android.media.ExifInterface.TAG_DATETIME_ORIGINAL))
        assertTrue(tags.contains(android.media.ExifInterface.TAG_ARTIST))
        // Every declared tag classifies into a real group, none falls through by accident.
        tags.forEach { tag -> assertTrue(MetadataGroup.values().contains(MetadataCleaner.groupOf(tag))) }
    }

    @Test
    fun onlyPlatformRewritableFormatsAreOfferedForCleaning() {
        assertTrue(MetadataCleaner.WRITABLE_MIME.contains("image/jpeg"))
        assertTrue(MetadataCleaner.WRITABLE_MIME.contains("image/tiff"))
        assertFalse("PNG metadata is not claimed as rewritable here", MetadataCleaner.WRITABLE_MIME.contains("image/png"))
        assertFalse(MetadataCleaner.WRITABLE_MIME.contains("application/pdf"))
    }

    @Test
    fun inventoryCountsOnlyTheGroupsThatActuallyHaveItems() {
        val inventory = Inventory(
            format = "image/jpeg",
            writable = true,
            width = 4032,
            height = 3024,
            items = listOf(
                MetadataItem("GPSLatitude", "gps latitude", "30/1,0/1,0/1", MetadataGroup.GPS),
                MetadataItem("Make", "make", "itel", MetadataGroup.CAMERA_MODEL),
                MetadataItem("Model", "model", "S686LN", MetadataGroup.CAMERA_MODEL),
            ),
            inspectedTagCount = MetadataCleaner.KNOWN_TAGS.size,
        )
        assertEquals(1, inventory.count(MetadataGroup.GPS))
        assertEquals(2, inventory.count(MetadataGroup.CAMERA_MODEL))
        assertEquals(0, inventory.count(MetadataGroup.AUTHOR))
        assertEquals(listOf(MetadataGroup.GPS, MetadataGroup.CAMERA_MODEL), inventory.groups)
    }
}
