package com.knoux.crypt.data

import java.io.ByteArrayInputStream
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** TASK 29: encrypted collections over the existing vault records and media store. */
class VaultCollectionsServiceTest {
    private lateinit var vault: TestVault
    private lateinit var collections: VaultCollectionsService
    private lateinit var media: ShadowVaultService
    private lateinit var sink: CollectingSink
    private lateinit var root: java.io.File

    private class CollectingSink : SecurityAuditSink {
        val events = mutableListOf<SecurityAuditEvent>()
        override suspend fun record(event: SecurityAuditEvent) { events += event }
    }

    @Before
    fun setUp() {
        vault = TestVault()
        sink = CollectingSink()
        val repository = SecretRepository(
            vault.dao,
            vault.session,
            VaultKeyManager(vault.session, TestKeyRegistry()),
            sink,
        )
        collections = VaultCollectionsService(vault.session, repository, sink)
        root = kotlin.io.path.createTempDirectory("vault-collections-test").toFile()
        media = ShadowVaultService(vault.session, repository, VaultFileCipher(vault.session), root, sink)
        runBlocking { vault.enroll() }
    }

    private suspend fun addMedia(label: String, collectionId: String = ""): VaultMediaItem {
        val bytes = label.toByteArray()
        return media.import(
            vault.access()!!,
            ByteArrayInputStream(bytes),
            "name-$label",
            "image/png",
            VaultMediaType.PHOTO,
            bytes.size.toLong(),
            collectionId = collectionId,
        )
    }

    @Test
    fun collectionLabelIsOnlyStoredInsideCiphertext() = runBlocking {
        val access = vault.access()!!
        val created = collections.create(access, "Private Documents")
        assertEquals("Private Documents", created.label)
        val row = vault.dao.rows.value.single { it.id == created.id }
        assertEquals(SecretKinds.COLLECTION, row.kind)
        assertFalse(String(row.envelope, Charsets.ISO_8859_1).contains("Private Documents"))
        assertFalse(vault.dao.rows.value.any { String(it.envelope, Charsets.ISO_8859_1).contains("name-") })
    }

    @Test
    fun duplicateEmptyAndOverlongNamesAreRejectedTyped() = runBlocking {
        val access = vault.access()!!
        collections.create(access, "Work")
        assertEquals(
            CollectionFailure.DUPLICATE_NAME,
            runCatching { collections.create(access, "  work ") }.exceptionOrNull()
                ?.let { (it as CollectionRejectedException).failure },
        )
        assertEquals(
            CollectionFailure.EMPTY_NAME,
            runCatching { collections.create(access, "   ") }.exceptionOrNull()
                ?.let { (it as CollectionRejectedException).failure },
        )
        assertEquals(
            CollectionFailure.NAME_TOO_LONG,
            runCatching { collections.create(access, "x".repeat(VaultCollectionsService.MAX_LABEL_CHARS + 5)) }
                .exceptionOrNull()?.let { (it as CollectionRejectedException).failure },
        )
    }

    @Test
    fun renameUsesTheRevisionTokenAndRefusesStaleWrites() = runBlocking {
        val access = vault.access()!!
        val created = collections.create(access, "Original")
        val stored = vault.dao.rows.value.first { it.id == created.id }
        val renamed = collections.rename(access, created.id, "Renamed", stored.updatedAt)
        assertEquals("Renamed", renamed.label)

        val stale = runCatching { collections.rename(access, created.id, "Conflict", stored.updatedAt) }
            .exceptionOrNull()
        assertTrue(stale is CollectionRejectedException)
        assertEquals(CollectionFailure.STALE_REVISION, (stale as CollectionRejectedException).failure)
        assertEquals("Renamed", collections.list(access).single().label)
    }

    @Test
    fun assignMovesMembershipWithoutTouchingCiphertextBytes() = runBlocking {
        val access = vault.access()!!
        val work = collections.create(access, "Work")
        val personal = collections.create(access, "Personal")
        val item = addMedia("one")
        val before = vault.dao.rows.value.first { it.id == item.id }.envelope.copyOf()
        val originalContainer = media.encryptedFile(item.id).readBytes()

        collections.assign(access, item.id, work.id, collections.list(access))
        assertEquals(work.id, media.observe(access).first().single().payload?.collectionId)

        collections.assign(access, item.id, personal.id, collections.list(access))
        val moved = media.observe(access).first().single()
        assertEquals(personal.id, moved.payload?.collectionId)
        assertNotEquals(before.toList(), vault.dao.rows.value.first { it.id == item.id }.envelope.toList())
        assertArrayEqualsKeepContainer(originalContainer, media.encryptedFile(item.id).readBytes())

        assertEquals(
            CollectionFailure.COLLECTION_NOT_FOUND,
            runCatching { collections.assign(access, item.id, "ghost", collections.list(access)) }
                .exceptionOrNull()?.let { (it as CollectionRejectedException).failure },
        )
        collections.assign(access, item.id, "", collections.list(access))
        assertEquals("", media.observe(access).first().single().payload?.collectionId)
    }

    private fun assertArrayEqualsKeepContainer(expected: ByteArray, actual: ByteArray) {
        assertTrue("media container must not be rewritten by a membership move", expected.contentEquals(actual))
    }

    @Test
    fun deleteClearsMembersAndKeepsMediaFiles() = runBlocking {
        val access = vault.access()!!
        val collection = collections.create(access, "Temp")
        val first = addMedia("a", collection.id)
        val second = addMedia("b", collection.id)
        val items = media.observe(access).first()

        val cleared = collections.delete(access, collection.id, items)
        assertEquals(2, cleared)
        assertTrue(collections.list(access).isEmpty())
        val survivors = media.observe(access).first()
        assertEquals(2, survivors.size)
        assertTrue(survivors.all { it.payload?.collectionId.isNullOrBlank() })
        assertTrue(media.encryptedFile(first.id).isFile)
        assertTrue(media.encryptedFile(second.id).isFile)

        assertEquals(
            CollectionFailure.COLLECTION_NOT_FOUND,
            runCatching { collections.delete(access, collection.id, media.observe(access).first()) }
                .exceptionOrNull()?.let { (it as CollectionRejectedException).failure },
        )
    }

    @Test
    fun summariesDeriveCountsSizesAndTypesFromMembership() = runBlocking {
        val access = vault.access()!!
        val docs = collections.create(access, "Docs")
        addMedia("p1", docs.id)
        addMedia("p2", docs.id)
        val rows = media.observe(access).first()
        val summaries = collections.summaries(collections.list(access), rows)
        val summary = summaries.single()
        assertEquals(2, summary.itemCount)
        assertTrue(summary.encryptedBytes > 0)
        assertEquals(setOf(VaultMediaType.PHOTO), summary.types)
        val expectedBytes = rows.filter { it.payload?.collectionId == docs.id }
            .sumOf { (it.payload!!.containerBytes + it.payload.thumbnailBytes) }
        assertEquals(expectedBytes, summary.encryptedBytes)
    }

    @Test
    fun revokedSessionCannotReadOrWriteCollections() = runBlocking {
        val access = vault.access()!!
        collections.create(access, "Before lock")
        vault.session.lock()
        assertTrue(runCatching { collections.create(access, "After lock") }.isFailure)
        assertTrue(runCatching { collections.list(access) }.isFailure)
    }

    @Test
    fun auditEventsNeverCarryLabelsOrRecordIds() = runBlocking {
        val access = vault.access()!!
        val collection = collections.create(access, "Secret Label")
        val item = addMedia("secret-name")
        collections.assign(access, item.id, collection.id, collections.list(access))
        collections.rename(access, collection.id, "Renamed Label", vault.dao.rows.value.first { it.id == collection.id }.updatedAt)
        collections.delete(access, collection.id, media.observe(access).first())

        val relevant = sink.events.filter { it.action.name.startsWith("COLLECTION_") }
        assertTrue(relevant.isNotEmpty())
        relevant.forEach { event ->
            assertFalse(event.detail.contains("Secret Label"))
            assertFalse(event.detail.contains("Renamed Label"))
            assertFalse(event.detail.contains(collection.id))
            assertFalse(event.detail.contains(item.id))
        }
        assertEquals(SecurityEventAction.COLLECTION_MEMBERSHIP_CHANGED, relevant.first { it.action == SecurityEventAction.COLLECTION_MEMBERSHIP_CHANGED }.action)
    }
}