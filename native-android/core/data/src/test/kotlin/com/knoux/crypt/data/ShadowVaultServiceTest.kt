package com.knoux.crypt.data

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.SecureRandom
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * JVM proof of the Shadow Vault vertical slice: KNF2 encryption, encrypted
 * metadata, authenticated random access, encrypted thumbnails, export and
 * lock-time revocation. Android picker/MediaPlayer integration is compiled but
 * requires a device for runtime evidence.
 */
class ShadowVaultServiceTest {
    private lateinit var vault: TestVault
    private lateinit var root: File
    private lateinit var service: ShadowVaultService
    private lateinit var sink: CollectingSink
    private val random = SecureRandom()

    private class CollectingSink : SecurityAuditSink {
        val events = mutableListOf<SecurityAuditEvent>()
        override suspend fun record(event: SecurityAuditEvent) { events += event }
    }

    @Before
    fun setUp() {
        vault = TestVault()
        root = kotlin.io.path.createTempDirectory("shadow-vault-test").toFile()
        sink = CollectingSink()
        service = ShadowVaultService(
            vault.session,
            vault.repository,
            VaultFileCipher(vault.session),
            root,
            sink,
        )
        runBlocking { vault.enroll() }
    }

    @After
    fun tearDown() {
        root.deleteRecursively()
    }

    @Test
    fun importEncryptsMediaAndMetadataAndStreamsAuthenticatedChunks() = runBlocking {
        val access = vault.access()!!
        val plain = ByteArray(220_000).also(random::nextBytes)
        val item = service.import(
            access = access,
            input = ByteArrayInputStream(plain),
            displayName = "private-photo.jpg",
            mimeType = "image/jpeg",
            type = VaultMediaType.PHOTO,
            sizeBytes = plain.size.toLong(),
            width = 1600,
            height = 1200,
        )
        assertEquals(VaultMediaType.PHOTO, item.type)
        assertEquals(plain.size.toLong(), item.payload!!.sizeBytes)

        val observed = service.observe(access).first()
        assertEquals(1, observed.size)
        assertEquals("private-photo.jpg", observed.single().payload?.displayName)

        // Room stores ciphertext only.
        val stored = vault.dao.rows.value.single()
        assertFalse(String(stored.envelope, Charsets.ISO_8859_1).contains("private-photo"))
        assertFalse(String(stored.envelope, Charsets.ISO_8859_1).contains("private bytes"))

        // The media container is not the plaintext.
        val container = service.encryptedFile(item.id)
        assertTrue(container.isFile)
        assertTrue(container.length() > plain.size)
        val onDisk = container.readBytes()
        assertFalse(onDisk.take(4096).toByteArray().contentEquals(plain.take(4096).toByteArray()))

        // Sequential and random access both authenticate and reproduce bytes.
        assertArrayEquals(plain, service.readImage(access, item.id))
        service.openReader(access, item.id).use { reader ->
            assertEquals(plain.size.toLong(), reader.plaintextLength)
            val buffer = ByteArray(70_000)
            val read = reader.readAt(65_500, buffer, 0, buffer.size)
            assertEquals(70_000, read)
            assertArrayEquals(plain.copyOfRange(65_500, 135_500), buffer)
            val tail = ByteArray(20_000)
            assertEquals(20_000, reader.readAt(200_000, tail, 0, tail.size))
            assertArrayEquals(plain.copyOfRange(200_000, 220_000), tail)
            assertEquals(-1, reader.readAt(plain.size.toLong(), ByteArray(1), 0, 1))
        }
        assertEquals(1, sink.events.count { it.action == SecurityEventAction.MEDIA_IMPORTED })
        assertTrue(sink.events.any { it.action == SecurityEventAction.MEDIA_OPENED })
    }

    @Test
    fun encryptedThumbnailRoundTripsAndIsOptional() = runBlocking {
        val access = vault.access()!!
        val plain = "media".toByteArray()
        val thumb = ByteArray(3_000) { (it % 251).toByte() }
        val item = service.import(
            access, ByteArrayInputStream(plain), "clip.mp4", "video/mp4",
            VaultMediaType.VIDEO, plain.size.toLong(), thumb.copyOf(), width = 1080, height = 1920,
            durationMs = 4_000,
        )
        assertTrue(item.payload!!.hasThumbnail)
        assertTrue(File(root, "thumbs/${item.id}.knf").isFile)
        assertArrayEquals(thumb, service.thumbnail(access, item.id))

        val noThumb = service.import(
            access, ByteArrayInputStream(plain), "voice.m4a", "audio/mp4",
            VaultMediaType.AUDIO, plain.size.toLong(), null,
        )
        assertNull(service.thumbnail(access, noThumb.id))
    }

    @Test
    fun exportWritesOnlyToCallerStreamAndRecordsOutcome() = runBlocking {
        val access = vault.access()!!
        val plain = ByteArray(90_000).also(random::nextBytes)
        val item = service.import(
            access, ByteArrayInputStream(plain), "doc.bin", "application/octet-stream",
            VaultMediaType.FILE, plain.size.toLong(),
        )
        val destination = ByteArrayOutputStream()
        val written = service.export(access, item.id, destination)
        assertEquals(plain.size.toLong(), written)
        assertArrayEquals(plain, destination.toByteArray())
        assertTrue(sink.events.any { it.action == SecurityEventAction.MEDIA_EXPORTED })
    }

    @Test
    fun deleteRemovesRecordAndEncryptedFiles() = runBlocking {
        val access = vault.access()!!
        val item = service.import(
            access, ByteArrayInputStream(byteArrayOf(1, 2, 3)), "one.txt", "text/plain",
            VaultMediaType.FILE, 3, ByteArray(16),
        )
        assertTrue(service.encryptedFile(item.id).isFile)
        service.delete(access, item.id)
        assertTrue(service.observe(access).first().isEmpty())
        assertFalse(service.encryptedFile(item.id).exists())
        assertFalse(File(root, "thumbs/${item.id}.knf").exists())
        assertTrue(sink.events.any { it.action == SecurityEventAction.MEDIA_DELETED })
    }

    @Test
    fun lockRevokesAnOpenStreamMidRead() = runBlocking {
        val access = vault.access()!!
        val item = service.import(
            access, ByteArrayInputStream(ByteArray(80_000)), "locked.bin",
            "application/octet-stream", VaultMediaType.FILE, 80_000,
        )
        val reader = service.openReader(access, item.id)
        assertTrue(reader.readAt(0, ByteArray(10), 0, 10) == 10)
        vault.session.lock()
        val failure = runCatching { reader.readAt(0, ByteArray(10), 0, 10) }.exceptionOrNull()
        assertTrue(failure is VaultLockedException)
        reader.close()
    }

    @Test
    fun imageRotationIsStoredAndReflectedInAspectRatio() = runBlocking {
        val access = vault.access()!!
        val item = service.import(
            access, ByteArrayInputStream(byteArrayOf(1, 2, 3)), "portrait.jpg", "image/jpeg",
            VaultMediaType.PHOTO, 3, null, width = 1600, height = 1200, rotationDegrees = 90,
        )
        assertEquals(90, item.payload!!.rotationDegrees)
        assertEquals(1200f / 1600f, item.aspectRatio, 0.0001f)
    }

    @Test
    fun usageCountsRealEncryptedContainers() = runBlocking {
        val access = vault.access()!!
        val plain = ByteArray(10_000).also(random::nextBytes)
        val item = service.import(
            access, ByteArrayInputStream(plain), "photo.png", "image/png",
            VaultMediaType.PHOTO, plain.size.toLong(), ByteArray(500),
        )
        val usage = service.usage(access)
        assertEquals(1, usage.itemCount)
        assertEquals(0, usage.unreadableCount)
        val expected = service.encryptedFile(item.id).length() + File(root, "thumbs/${item.id}.knf").length()
        assertEquals(expected, usage.encryptedBytes)
        assertEquals(expected, usage.byType[VaultMediaType.PHOTO])
    }
}