package com.knoux.crypt.data

import java.io.ByteArrayInputStream
import java.io.File
import java.security.SecureRandom
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * JVM proof of the TASK 30 document-viewer slice: in-memory-only text reads,
 * bounded plaintext, transient PDF leases that are always reclaimed, stale or
 * tampered records rejected before content is returned, and privacy-safe audit
 * details. `android.graphics.pdf.PdfRenderer` page rendering itself needs a
 * device and is recorded separately as DEVICE_UNVERIFIED.
 */
class DocumentViewerServiceTest {
    private lateinit var vault: TestVault
    private lateinit var mediaRoot: File
    private lateinit var leaseRoot: File
    private lateinit var shadow: ShadowVaultService
    private lateinit var viewer: DocumentViewerService
    private lateinit var sink: CollectingSink
    private val random = SecureRandom()

    private class CollectingSink : SecurityAuditSink {
        val events = mutableListOf<SecurityAuditEvent>()
        override suspend fun record(event: SecurityAuditEvent) { events += event }
        fun details(): String = events.joinToString("|") { "${it.action.name} ${it.detail}" }
    }

    @Before
    fun setUp() {
        vault = TestVault()
        mediaRoot = kotlin.io.path.createTempDirectory("docview-media").toFile()
        leaseRoot = kotlin.io.path.createTempDirectory("docview-lease").toFile()
        sink = CollectingSink()
        val cipher = VaultFileCipher(vault.session)
        shadow = ShadowVaultService(vault.session, vault.repository, cipher, mediaRoot, sink)
        viewer = DocumentViewerService(vault.session, vault.repository, shadow, cipher, leaseRoot, sink)
        runBlocking { vault.enroll() }
    }

    @After
    fun tearDown() {
        mediaRoot.deleteRecursively()
        leaseRoot.deleteRecursively()
    }

    private suspend fun store(
        name: String,
        mime: String,
        bytes: ByteArray,
    ): DocumentDescriptor {
        val access = vault.access() ?: error("vault is locked")
        val item = shadow.import(
            access = access,
            input = ByteArrayInputStream(bytes),
            displayName = name,
            mimeType = mime,
            type = VaultMediaType.FILE,
            sizeBytes = bytes.size.toLong(),
        )
        return DocumentViewerPolicy.descriptor(item) ?: error("descriptor was not offered for $mime")
    }

    @Test
    fun modeAndAcceptancePolicyIsExplicit() {
        assertEquals(DocumentMode.PDF, DocumentViewerPolicy.modeFor("application/pdf"))
        assertEquals(DocumentMode.PDF, DocumentViewerPolicy.modeFor("APPLICATION/PDF"))
        assertEquals(DocumentMode.TEXT, DocumentViewerPolicy.modeFor("text/plain"))
        assertEquals(DocumentMode.TEXT, DocumentViewerPolicy.modeFor("text/markdown"))
        assertEquals(DocumentMode.TEXT, DocumentViewerPolicy.modeFor("application/json"))
        assertEquals(DocumentMode.UNSUPPORTED, DocumentViewerPolicy.modeFor("image/jpeg"))
        assertEquals(DocumentMode.UNSUPPORTED, DocumentViewerPolicy.modeFor("video/mp4"))
        assertEquals(DocumentMode.UNSUPPORTED, DocumentViewerPolicy.modeFor("application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
        assertEquals(DocumentViewerPolicy.MAX_TEXT_BYTES, DocumentViewerPolicy.limitFor(DocumentMode.TEXT))
        assertEquals(DocumentViewerPolicy.MAX_PDF_BYTES, DocumentViewerPolicy.limitFor(DocumentMode.PDF))
        assertEquals(0L, DocumentViewerPolicy.limitFor(DocumentMode.UNSUPPORTED))
        assertTrue(DocumentViewerPolicy.isLeaseFile("docview-abc.pdf.lease"))
        assertFalse(DocumentViewerPolicy.isLeaseFile("notes.json"))
        assertFalse(DocumentViewerPolicy.isLeaseFile("docview-abc.txt"))
    }

    @Test
    fun onlyOpenableAndInPolicyItemsAreOffered() = runBlocking {
        val access = vault.access() ?: error("vault is locked")
        shadow.import(
            access, ByteArrayInputStream(ByteArray(16)), "snap.jpg", "image/jpeg",
            VaultMediaType.PHOTO, 16,
        )
        shadow.import(
            access, ByteArrayInputStream("hello".toByteArray()), "readme.txt", "text/plain",
            VaultMediaType.FILE, 5,
        )
        shadow.import(
            access, ByteArrayInputStream("x".repeat(900).toByteArray()), "manual.pdf", "application/pdf",
            VaultMediaType.FILE, 900,
        )
        val offered = viewer.descriptors(shadow.observe(access).first())
        assertEquals(2, offered.size)
        assertEquals(setOf("text/plain", "application/pdf"), offered.map { it.mimeType }.toSet())
        assertTrue(offered.none { it.displayName == "snap.jpg" })
        // Unsupported media is never staged, so nothing may exist in the lease root.
        assertTrue(leaseRoot.listFiles().orEmpty().isEmpty())
    }

    @Test
    fun textDocumentDecryptsInMemoryAndCreatesNoFile() = runBlocking {
        val body = buildString {
            repeat(400) { append("خطوة $it — encrypted at rest\n") }
        }.toByteArray(Charsets.UTF_8)
        val descriptor = store("quarterly-report.txt", "text/plain", body)
        val access = vault.access() ?: error("vault is locked")

        val text = viewer.readText(access, descriptor)
        assertEquals(String(body, Charsets.UTF_8), text)

        // Text never touches storage: the lease root stays empty...
        assertTrue(leaseRoot.listFiles().orEmpty().isEmpty())
        assertEquals(0, viewer.activeLeaseCount())
        // ...and the vault directory still holds only the encrypted container.
        val mediaFiles = File(mediaRoot, "media").listFiles().orEmpty().toList()
        assertEquals(1, mediaFiles.size)
        assertFalse(String(mediaFiles.single().readBytes(), Charsets.ISO_8859_1).contains("encrypted at rest"))
        assertTrue(sink.details().contains("DOCUMENT_VIEWED mode=text"))
    }

    @Test
    fun unsupportedAndLockedReadsFailWithoutReturningContent() = runBlocking {
        val descriptor = store("diagram.txt", "text/plain", "square".toByteArray())
        val pdfShapedAsText = descriptor.copy(mode = DocumentMode.PDF)
        val access = vault.access() ?: error("vault is locked")

        val mismatch = runCatching { viewer.readText(access, pdfShapedAsText) }.exceptionOrNull()
        assertTrue(mismatch is DocumentRejectedException)
        assertEquals(DocumentFailure.UNSUPPORTED_TYPE, (mismatch as DocumentRejectedException).failure)

        val unsupported = descriptor.copy(mode = DocumentMode.UNSUPPORTED)
        val rejected = runCatching { viewer.readText(access, unsupported) }.exceptionOrNull()
        assertEquals(DocumentFailure.UNSUPPORTED_TYPE, (rejected as DocumentRejectedException).failure)

        // Lock is reported as a lock, never as a corrupted document.
        vault.session.lock()
        val afterLock = runCatching { viewer.readText(access, descriptor) }.exceptionOrNull()
        assertTrue("expected VaultLockedException, got $afterLock", afterLock is VaultLockedException)
    }

    @Test
    fun oversizeTextIsRejectedByTheHardMemoryBoundWithoutReturningContent() = runBlocking {
        val access = vault.access() ?: error("vault is locked")
        val oversized = ByteArray((DocumentViewerPolicy.MAX_TEXT_BYTES + 1).toInt()).also(random::nextBytes)
        val item = shadow.import(
            access = access,
            input = ByteArrayInputStream(oversized),
            displayName = "huge.txt",
            mimeType = "text/plain",
            type = VaultMediaType.FILE,
            sizeBytes = oversized.size.toLong(),
        )
        // The catalog refuses to offer it in the first place.
        assertNull(DocumentViewerPolicy.descriptor(item))

        // A hand-built descriptor still cannot bypass the bound: decryption stops
        // as soon as the plaintext would exceed it, before any content is returned.
        val descriptor = DocumentDescriptor(
            recordId = item.id,
            displayName = "huge.txt",
            mimeType = "text/plain",
            sizeBytes = DocumentViewerPolicy.MAX_TEXT_BYTES,
            mode = DocumentMode.TEXT,
            collectionId = "",
        )
        val failure = runCatching { viewer.readText(access, descriptor) }.exceptionOrNull()
        assertTrue(failure is DocumentRejectedException)
        assertEquals(DocumentFailure.TOO_LARGE, (failure as DocumentRejectedException).failure)
        assertTrue(leaseRoot.listFiles().orEmpty().isEmpty())
        assertTrue(sink.details().contains("DOCUMENT_OPEN_FAILED mode=text reason=TOO_LARGE"))
    }

    @Test
    fun pdfLeaseRoundTripsThenIsDeletedOnCloseAndOnLock() = runBlocking {
        val plain = ByteArray(150_000).also(random::nextBytes)
        val descriptor = store("invoice-2026.pdf", "application/pdf", plain)
        val access = vault.access() ?: error("vault is locked")

        val lease = viewer.openPdfLease(access, descriptor)
        assertTrue(lease.isFile)
        assertEquals(leaseRoot.canonicalFile, lease.parentFile?.canonicalFile)
        assertTrue(DocumentViewerPolicy.isLeaseFile(lease.name))
        assertEquals(plain.size.toLong(), lease.length())
        assertEquals(1, viewer.activeLeaseCount())
        // The staged file really is the decrypted document, and the container is not.
        assertEquals(
            plain.contentEquals(lease.readBytes()),
            true,
        )
        assertFalse(
            shadow.encryptedFile(descriptor.recordId).readBytes().contentEquals(plain),
        )

        assertTrue(viewer.closeLease(descriptor.recordId))
        assertFalse(lease.exists())
        assertEquals(0, viewer.activeLeaseCount())
        // Closing twice is harmless.
        assertFalse(viewer.closeLease(descriptor.recordId))

        val second = viewer.openPdfLease(access, descriptor)
        assertTrue(second.isFile)
        vault.session.lock()
        viewer.onLock()
        assertEquals(0, viewer.activeLeaseCount())
        assertTrue(leaseRoot.listFiles().orEmpty().isEmpty())
    }

    @Test
    fun staleDescriptorCannotOpenADeletedRecord() = runBlocking {
        val descriptor = store("ephemeral.pdf", "application/pdf", "%PDF-1.4 stale".toByteArray())
        val access = vault.access() ?: error("vault is locked")
        shadow.delete(access, descriptor.recordId)

        val textFailure = runCatching { viewer.readText(access, descriptor) }.exceptionOrNull()
        assertEquals(DocumentFailure.MISSING, (textFailure as DocumentRejectedException).failure)
        val pdfFailure = runCatching { viewer.openPdfLease(access, descriptor) }.exceptionOrNull()
        assertEquals(DocumentFailure.MISSING, (pdfFailure as DocumentRejectedException).failure)
        assertTrue(leaseRoot.listFiles().orEmpty().isEmpty())
    }

    @Test
    fun tamperedContainerFailsAsUnreadableAndLeavesNoLease() = runBlocking {
        val plain = ByteArray(70_000).also(random::nextBytes)
        val descriptor = store("tampered.pdf", "application/pdf", plain)
        val access = vault.access() ?: error("vault is locked")
        val container = shadow.encryptedFile(descriptor.recordId)
        val bytes = container.readBytes()
        bytes[bytes.size - 1] = (bytes[bytes.size - 1].toInt() xor 0x01).toByte()
        container.outputStream().use { it.write(bytes) }

        val failure = runCatching { viewer.openPdfLease(access, descriptor) }.exceptionOrNull()
        assertTrue("expected a rejection, got $failure", failure is DocumentRejectedException)
        assertEquals(DocumentFailure.UNREADABLE, (failure as DocumentRejectedException).failure)
        assertEquals(0, viewer.activeLeaseCount())
        assertTrue(leaseRoot.listFiles().orEmpty().isEmpty())
        assertTrue(sink.details().contains("DOCUMENT_OPEN_FAILED mode=pdf reason=UNREADABLE"))
    }

    @Test
    fun startupSweepRemovesStaleLeasesAndKeepsOtherFiles() = runBlocking {
        val descriptor = store("swept.pdf", "application/pdf", ByteArray(4_096))
        val access = vault.access() ?: error("vault is locked")
        val live = viewer.openPdfLease(access, descriptor)
        val stale = File(leaseRoot, "docview-orphan.pdf.lease").apply { writeBytes(ByteArray(32)) }
        stale.setLastModified(System.currentTimeMillis() - 60_000)
        val unrelated = File(leaseRoot, "keep.bin").apply { writeBytes(ByteArray(8)) }

        val removed = viewer.sweepExpiredLeases(maxAgeMillis = 1_000)
        assertEquals(1, removed)
        assertFalse(stale.exists())
        assertTrue(unrelated.exists())
        // A lease the viewer still owns is not swept out from under it.
        assertTrue(live.exists())
        viewer.closeLease(descriptor.recordId)
        assertFalse(live.exists())
    }

    @Test
    fun auditDetailsNeverCarryTheDocumentNameOrAnyPath() = runBlocking {
        val descriptor = store("board-minutes-confidential.pdf", "application/pdf", ByteArray(2048))
        val access = vault.access() ?: error("vault is locked")
        val lease = viewer.openPdfLease(access, descriptor)
        viewer.closeLease(descriptor.recordId)
        viewer.onLock()
        viewer.sweepExpiredLeases()
        runCatching { viewer.openPdfLease(access, descriptor) }

        val details = sink.details()
        assertFalse(details.contains("confidential"))
        assertFalse(details.contains("board"))
        assertFalse(details.contains("minutes"))
        assertFalse(details.contains(descriptor.recordId))
        assertFalse(details.contains(leaseRoot.absolutePath))
        assertFalse(details.contains(lease.name))
        assertFalse(details.contains(File.separator))
        // The stage names are typed codes, never free text.
        assertTrue(details.contains("DOCUMENT_VIEWED mode=pdf"))
    }
}
