package com.knoux.crypt.data

import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable

/**
 * A protected collection (TASK 29). The label is user-visible and potentially
 * sensitive, so it is stored only inside an authenticated vault record; the
 * plaintext `secrets` columns keep just the record kind and timestamps.
 */
@Serializable
data class VaultCollectionPayload(
    val label: String,
    val createdAt: Long,
)

data class VaultCollection(
    val id: String,
    val label: String,
    val createdAt: Long,
    /** Row timestamp; the optimistic revision token used by [rename]. */
    val updatedAt: Long,
    val readable: Boolean = true,
)

/** Membership is derived, never a second source of truth. */
data class VaultCollectionSummary(
    val collection: VaultCollection,
    val itemCount: Int,
    val encryptedBytes: Long,
    val types: Set<VaultMediaType>,
)

enum class CollectionFailure {
    EMPTY_NAME,
    NAME_TOO_LONG,
    DUPLICATE_NAME,
    COLLECTION_NOT_FOUND,
    MEDIA_NOT_FOUND,
    MEDIA_UNREADABLE,
    STALE_REVISION,
    LIMIT_REACHED,
}

class CollectionRejectedException(val failure: CollectionFailure) : Exception(failure.name)

/**
 * Vault Collections (TASK 29) on top of the existing encrypted media store.
 *
 * Deliberate storage choices:
 * - A collection is one `collection` vault record; its id is the record id.
 * - Membership lives in the media record's own encrypted metadata
 *   ([VaultMediaPayload.collectionId]), so there is exactly one authoritative
 *   link per item. There is no membership table to orphan, no Room migration and
 *   no re-encryption of media bytes when an item moves between collections.
 * - Moving an item rewrites only its metadata envelope, under the same
 *   revision-checked transaction the notes editor uses, so a concurrent change
 *   fails as [CollectionFailure.STALE_REVISION] instead of silently clobbering.
 * - Deleting a collection clears its members first and only then removes the
 *   record, so a crash leaves items pointing at a collection that still exists
 *   and the operation is idempotent on retry. Media files are never deleted by a
 *   collection deletion.
 * - Audit events carry counts only: no labels, no record ids, no file names.
 */
class VaultCollectionsService(
    private val session: SessionManager,
    private val secrets: SecretRepository,
    private val audit: SecurityAuditSink = NoopSecurityAuditSink,
) {
    companion object {
        const val MAX_LABEL_CHARS = 80
        const val MAX_COLLECTIONS = 200
    }

    fun observeCollections(access: VaultAccess): Flow<List<VaultCollection>> =
        secrets.observe(access, SecretKinds.COLLECTION).map { rows ->
            rows.map { record ->
                val payload = if (record.decryptionFailed) {
                    null
                } else {
                    SecretsJson.decodeCollection(record.payloadJson)
                }
                VaultCollection(
                    id = record.id,
                    label = payload?.label ?: "",
                    createdAt = payload?.createdAt ?: record.updatedAt,
                    updatedAt = record.updatedAt,
                    readable = payload != null,
                )
            }.sortedWith(compareByDescending<VaultCollection> { it.createdAt }.thenBy { it.id })
        }

    suspend fun list(access: VaultAccess): List<VaultCollection> = withContext(Dispatchers.IO) {
        secrets.list(access, SecretKinds.COLLECTION).mapNotNull { record ->
            if (record.decryptionFailed) return@mapNotNull null
            val payload = SecretsJson.decodeCollection(record.payloadJson) ?: return@mapNotNull null
            VaultCollection(record.id, payload.label, payload.createdAt, record.updatedAt)
        }
    }

    /** Pure derivation of per-collection statistics from the media list. */
    fun summaries(collections: List<VaultCollection>, items: List<VaultMediaItem>): List<VaultCollectionSummary> {
        val byId = items.groupBy { it.payload?.collectionId.orEmpty() }
        return collections.map { collection ->
            val members = byId[collection.id].orEmpty().mapNotNull { it.payload }
            VaultCollectionSummary(
                collection = collection,
                itemCount = members.size,
                encryptedBytes = members.sumOf { it.containerBytes + it.thumbnailBytes },
                types = members.map { VaultMediaType.fromCode(it.mediaType) }.toSet(),
            )
        }
    }

    suspend fun create(access: VaultAccess, label: String): VaultCollection = withContext(Dispatchers.IO) {
        session.requireValid(access)
        val normalized = validateLabel(label)
        val existing = list(access)
        if (existing.size >= MAX_COLLECTIONS) throw CollectionRejectedException(CollectionFailure.LIMIT_REACHED)
        if (existing.any { it.label.equals(normalized, ignoreCase = true) }) {
            throw CollectionRejectedException(CollectionFailure.DUPLICATE_NAME)
        }
        val id = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        secrets.save(
            access,
            SecretKinds.COLLECTION,
            id,
            SecretsJson.encodeCollection(VaultCollectionPayload(normalized, now)),
        )
        audit.recordSafely(SecurityAuditEvent(SecurityEventAction.COLLECTION_CREATED, "collections=${existing.size + 1}"))
        VaultCollection(id, normalized, now, now)
    }

    suspend fun rename(
        access: VaultAccess,
        collectionId: String,
        label: String,
        expectedUpdatedAt: Long,
    ): VaultCollection = withContext(Dispatchers.IO) {
        session.requireValid(access)
        val normalized = validateLabel(label)
        val record = secrets.find(access, collectionId)
            ?: throw CollectionRejectedException(CollectionFailure.COLLECTION_NOT_FOUND)
        if (record.kind != SecretKinds.COLLECTION) {
            throw CollectionRejectedException(CollectionFailure.COLLECTION_NOT_FOUND)
        }
        val current = SecretsJson.decodeCollection(record.payloadJson)
            ?: throw CollectionRejectedException(CollectionFailure.COLLECTION_NOT_FOUND)
        if (record.updatedAt != expectedUpdatedAt) throw CollectionRejectedException(CollectionFailure.STALE_REVISION)
        val siblings = list(access).filter { it.id != collectionId }
        if (siblings.any { it.label.equals(normalized, ignoreCase = true) }) {
            throw CollectionRejectedException(CollectionFailure.DUPLICATE_NAME)
        }
        val outcome = secrets.saveIfUnchanged(
            access = access,
            kind = SecretKinds.COLLECTION,
            id = collectionId,
            expectedUpdatedAt = expectedUpdatedAt,
            payloadJson = SecretsJson.encodeCollection(current.copy(label = normalized)),
        )
        if (outcome != SaveOutcome.Saved) throw CollectionRejectedException(CollectionFailure.STALE_REVISION)
        audit.recordSafely(SecurityAuditEvent(SecurityEventAction.COLLECTION_RENAMED, "one collection relabelled"))
        VaultCollection(collectionId, normalized, current.createdAt, System.currentTimeMillis())
    }

    /**
     * Clears membership first, then removes the collection record. Media files
     * and their encrypted metadata stay; only the link is removed.
     */
    suspend fun delete(access: VaultAccess, collectionId: String, currentItems: List<VaultMediaItem>): Int =
        withContext(Dispatchers.IO) {
            session.requireValid(access)
            val record = secrets.find(access, collectionId)
                ?: throw CollectionRejectedException(CollectionFailure.COLLECTION_NOT_FOUND)
            if (record.kind != SecretKinds.COLLECTION) {
                throw CollectionRejectedException(CollectionFailure.COLLECTION_NOT_FOUND)
            }
            var cleared = 0
            currentItems.filter { it.payload?.collectionId == collectionId }.forEach { item ->
                val payload = item.payload ?: throw CollectionRejectedException(CollectionFailure.MEDIA_UNREADABLE)
                val outcome = secrets.saveIfUnchanged(
                    access = access,
                    kind = SecretKinds.MEDIA,
                    id = item.id,
                    expectedUpdatedAt = item.updatedAt,
                    payloadJson = SecretsJson.encodeMedia(payload.copy(collectionId = "")),
                )
                if (outcome != SaveOutcome.Saved) throw CollectionRejectedException(CollectionFailure.STALE_REVISION)
                cleared += 1
            }
            secrets.delete(access, collectionId)
            audit.recordSafely(
                SecurityAuditEvent(SecurityEventAction.COLLECTION_DELETED, "members_cleared=$cleared"),
            )
            cleared
        }

    /** Assigns or moves [mediaId] into [targetCollectionId] (blank = uncategorized). */
    suspend fun assign(
        access: VaultAccess,
        mediaId: String,
        targetCollectionId: String,
        collections: List<VaultCollection>,
    ): VaultMediaItem = withContext(Dispatchers.IO) {
        session.requireValid(access)
        val record = secrets.find(access, mediaId)
            ?: throw CollectionRejectedException(CollectionFailure.MEDIA_NOT_FOUND)
        if (record.kind != SecretKinds.MEDIA) throw CollectionRejectedException(CollectionFailure.MEDIA_NOT_FOUND)
        if (record.decryptionFailed) throw CollectionRejectedException(CollectionFailure.MEDIA_UNREADABLE)
        val payload = SecretsJson.decodeMedia(record.payloadJson)
            ?: throw CollectionRejectedException(CollectionFailure.MEDIA_UNREADABLE)
        if (targetCollectionId.isNotBlank() && collections.none { it.id == targetCollectionId }) {
            throw CollectionRejectedException(CollectionFailure.COLLECTION_NOT_FOUND)
        }
        val outcome = secrets.saveIfUnchanged(
            access = access,
            kind = SecretKinds.MEDIA,
            id = mediaId,
            expectedUpdatedAt = record.updatedAt,
            payloadJson = SecretsJson.encodeMedia(payload.copy(collectionId = targetCollectionId)),
        )
        if (outcome != SaveOutcome.Saved) throw CollectionRejectedException(CollectionFailure.STALE_REVISION)
        audit.recordSafely(
            SecurityAuditEvent(
                SecurityEventAction.COLLECTION_MEMBERSHIP_CHANGED,
                if (targetCollectionId.isBlank()) "item moved to uncategorized" else "item moved",
            ),
        )
        VaultMediaItem(mediaId, payload.copy(collectionId = targetCollectionId), record.updatedAt)
    }

    private fun validateLabel(label: String): String {
        val normalized = label.trim().replace('\n', ' ').take(MAX_LABEL_CHARS)
        if (normalized.isBlank()) throw CollectionRejectedException(CollectionFailure.EMPTY_NAME)
        if (label.trim().length > MAX_LABEL_CHARS) throw CollectionRejectedException(CollectionFailure.NAME_TOO_LONG)
        return normalized
    }
}