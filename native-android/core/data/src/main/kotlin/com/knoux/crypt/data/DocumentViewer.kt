package com.knoux.crypt.data

import com.knoux.crypt.security.TamperedFileException
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.security.GeneralSecurityException
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class DocumentMode { TEXT, PDF, UNSUPPORTED }

enum class DocumentFailure {
    MISSING,
    UNREADABLE,
    UNSUPPORTED_TYPE,
    TOO_LARGE,
    LEASE_WRITE_FAILED,
    RENDER_UNAVAILABLE,
}

class DocumentRejectedException(val failure: DocumentFailure) : Exception(failure.name)

/** A vault item the document viewer can actually open. */
data class DocumentDescriptor(
    val recordId: String,
    val displayName: String,
    val mimeType: String,
    val sizeBytes: Long,
    val mode: DocumentMode,
    val collectionId: String,
)

/**
 * The single source of truth for what the viewer accepts, how large a document
 * may be and how long decrypted content may live. Deliberately free of Android
 * types so the policy is directly testable on the JVM.
 */
object DocumentViewerPolicy {
    /** Plain text is decoded in memory only and never written to disk. */
    const val MAX_TEXT_BYTES = 4L * 1024 * 1024

    /**
     * A PDF needs a seekable descriptor for `android.graphics.pdf.PdfRenderer`;
     * the platform cannot render from a stream. It is therefore staged as a
     * transient, randomly named lease inside app-private cache storage and
     * deleted on close, on lock, on idle timeout and by the startup sweep.
     */
    const val MAX_PDF_BYTES = 64L * 1024 * 1024

    /** Decrypted lease is cleared after this idle period. */
    const val IDLE_CLEAR_SECONDS = 30

    /** Longest edge of a rendered PDF page bitmap. */
    const val MAX_PAGE_WIDTH = 1600

    const val LEASE_PREFIX = "docview-"
    const val LEASE_SUFFIX = ".pdf.lease"

    private val TEXT_MIMES = setOf(
        "text/plain", "text/markdown", "text/csv", "application/json",
        "application/xml", "text/xml",
    )

    fun modeFor(mimeType: String): DocumentMode = when {
        mimeType.equals("application/pdf", ignoreCase = true) -> DocumentMode.PDF
        mimeType.lowercase() in TEXT_MIMES || mimeType.lowercase().startsWith("text/") -> DocumentMode.TEXT
        else -> DocumentMode.UNSUPPORTED
    }

    fun limitFor(mode: DocumentMode): Long = when (mode) {
        DocumentMode.TEXT -> MAX_TEXT_BYTES
        DocumentMode.PDF -> MAX_PDF_BYTES
        DocumentMode.UNSUPPORTED -> 0L
    }

    /** Only items with readable metadata and an accepted MIME type are openable. */
    fun descriptor(item: VaultMediaItem): DocumentDescriptor? {
        val payload = item.payload ?: return null
        val mode = modeFor(payload.mimeType)
        if (mode == DocumentMode.UNSUPPORTED) return null
        if (payload.sizeBytes <= 0L) return null
        if (payload.sizeBytes > limitFor(mode)) return null
        return DocumentDescriptor(
            recordId = item.id,
            displayName = payload.displayName,
            mimeType = payload.mimeType,
            sizeBytes = payload.sizeBytes,
            mode = mode,
            collectionId = payload.collectionId,
        )
    }

    fun descriptors(items: List<VaultMediaItem>): List<DocumentDescriptor> =
        items.mapNotNull { descriptor(it) }

    fun leaseFile(leaseRoot: File): File =
        File(leaseRoot, "$LEASE_PREFIX${UUID.randomUUID()}$LEASE_SUFFIX")

    fun isLeaseFile(name: String): Boolean =
        name.startsWith(LEASE_PREFIX) && name.endsWith(LEASE_SUFFIX)
}

/**
 * Protected document viewer (TASK 30) over the Shadow Vault.
 *
 * - Text documents are decrypted into a bounded in-memory buffer that zeroes its
 *   own storage before returning; no text file is ever created.
 * - PDFs are staged as a transient, randomly named lease inside app-private
 *   cache storage because the platform renderer requires a seekable descriptor.
 *   The lease is deleted when the viewer closes, when the vault locks, when the
 *   idle timer fires and by [sweepExpiredLeases] on the next start. The lease is
 *   deliberately not fsynced: durability would only make residue survive a crash.
 * - Every path re-validates the live [VaultAccess]; a lock mid-operation deletes
 *   the lease and fails instead of returning content.
 * - A stale descriptor (record deleted, wrong kind, unreadable metadata) is
 *   rejected before any byte is decrypted.
 * - Audit events carry the mode, the size and the outcome only — never the
 *   document name, path or content.
 */
class DocumentViewerService(
    private val session: SessionManager,
    private val secrets: SecretRepository,
    private val vault: ShadowVaultService,
    private val vaultFiles: VaultFileCipher,
    private val leaseRoot: File,
    private val audit: SecurityAuditSink = NoopSecurityAuditSink,
    private val auditScope: CoroutineScope? = null,
) {
    /** Live leases, keyed by record id, so a close or a lock always finds the file. */
    private val liveLeases = mutableMapOf<String, File>()
    private val leasesLock = Any()

    fun descriptors(items: List<VaultMediaItem>): List<DocumentDescriptor> =
        DocumentViewerPolicy.descriptors(items)

    /** Removes lease files left behind by an interrupted previous process. */
    fun sweepExpiredLeases(
        nowMillis: Long = System.currentTimeMillis(),
        maxAgeMillis: Long = DocumentViewerPolicy.IDLE_CLEAR_SECONDS * 1000L,
    ): Int {
        val stale = runCatching {
            leaseRoot.listFiles()?.filter { file ->
                DocumentViewerPolicy.isLeaseFile(file.name) &&
                    nowMillis - file.lastModified() > maxAgeMillis
            }.orEmpty()
        }.getOrDefault(emptyList())
        stale.forEach { file -> runCatching { file.delete() } }
        if (stale.isNotEmpty()) {
            auditDetached(
                SecurityAuditEvent(
                    SecurityEventAction.DOCUMENT_LEASE_CLEARED,
                    "swept=${stale.size}",
                ),
            )
        }
        return stale.size
    }

    fun activeLeaseCount(): Int = synchronized(leasesLock) { liveLeases.size }

    /** Lock-time cleanup: delete every live lease immediately, synchronously. */
    fun onLock() {
        val files = synchronized(leasesLock) {
            val snapshot = liveLeases.values.toList()
            liveLeases.clear()
            snapshot
        }
        files.forEach { runCatching { it.delete() } }
        val swept = runCatching {
            leaseRoot.listFiles()?.filter { DocumentViewerPolicy.isLeaseFile(it.name) }
                ?.count { it.delete() } ?: 0
        }.getOrDefault(0)
        if (files.isNotEmpty() || swept > 0) {
            auditDetached(
                SecurityAuditEvent(
                    SecurityEventAction.DOCUMENT_LEASE_CLEARED,
                    "reason=lock cleared=${files.size + swept}",
                ),
            )
        }
    }

    /**
     * Decrypts a text document fully in memory. The storage backing the string is
     * wiped before this returns, so only the immutable String remains.
     */
    suspend fun readText(access: VaultAccess, descriptor: DocumentDescriptor): String =
        withContext(Dispatchers.IO) {
            validate(access, descriptor)
            if (descriptor.mode != DocumentMode.TEXT) {
                throw DocumentRejectedException(DocumentFailure.UNSUPPORTED_TYPE)
            }
            val buffer = WipeableBuffer(DocumentViewerPolicy.MAX_TEXT_BYTES)
            try {
                source(descriptor).inputStream().use { input ->
                    vaultFiles.decrypt(
                        access = access,
                        input = input,
                        output = buffer,
                        context = ShadowVaultService.MEDIA_CONTEXT.toByteArray(Charsets.UTF_8),
                    )
                }
                session.requireValid(access)
                val text = String(buffer.bytes(), 0, buffer.size(), Charsets.UTF_8)
                audit.recordSafely(
                    SecurityAuditEvent(
                        SecurityEventAction.DOCUMENT_VIEWED,
                        "mode=text bytes=${buffer.size()}",
                    ),
                )
                text
            } catch (failure: CancellationException) {
                throw failure
            } catch (failure: VaultLockedException) {
                // A lock is a truthful session outcome, never an "unreadable file".
                throw failure
            } catch (failure: DocumentRejectedException) {
                auditFailure(descriptor, failure.failure)
                throw failure
            } catch (failure: Throwable) {
                val reason = classifyReadFailure(failure, DocumentFailure.UNREADABLE)
                auditFailure(descriptor, reason)
                throw DocumentRejectedException(reason)
            } finally {
                buffer.wipe()
            }
        }

    /**
     * Stages a PDF lease. The caller MUST pass the returned file to
     * [closeLease] when the renderer is released. Ownership of the lease is
     * recorded so close, lock and idle timeout can all find it.
     */
    suspend fun openPdfLease(access: VaultAccess, descriptor: DocumentDescriptor): File =
        withContext(Dispatchers.IO) {
            validate(access, descriptor)
            if (descriptor.mode != DocumentMode.PDF) {
                throw DocumentRejectedException(DocumentFailure.UNSUPPORTED_TYPE)
            }
            if (!leaseRoot.isDirectory && !leaseRoot.mkdirs()) {
                auditFailure(descriptor, DocumentFailure.LEASE_WRITE_FAILED)
                throw DocumentRejectedException(DocumentFailure.LEASE_WRITE_FAILED)
            }
            val lease = DocumentViewerPolicy.leaseFile(leaseRoot)
            try {
                FileOutputStream(lease).use { output ->
                    source(descriptor).inputStream().use { input ->
                        vaultFiles.decrypt(
                            access = access,
                            input = input,
                            output = output,
                            context = ShadowVaultService.MEDIA_CONTEXT.toByteArray(Charsets.UTF_8),
                        )
                    }
                }
                lease.setReadable(true, true)
                if (!lease.isFile || lease.length() == 0L) {
                    throw DocumentRejectedException(DocumentFailure.LEASE_WRITE_FAILED)
                }
                synchronized(leasesLock) { liveLeases[descriptor.recordId] = lease }
                audit.recordSafely(
                    SecurityAuditEvent(
                        SecurityEventAction.DOCUMENT_VIEWED,
                        "mode=pdf bytes=${lease.length()}",
                    ),
                )
                lease
            } catch (failure: CancellationException) {
                deleteQuietly(lease, descriptor.recordId)
                throw failure
            } catch (failure: VaultLockedException) {
                deleteQuietly(lease, descriptor.recordId)
                throw failure
            } catch (failure: DocumentRejectedException) {
                deleteQuietly(lease, descriptor.recordId)
                auditFailure(descriptor, failure.failure)
                throw failure
            } catch (failure: Throwable) {
                deleteQuietly(lease, descriptor.recordId)
                val reason = classifyReadFailure(failure, DocumentFailure.LEASE_WRITE_FAILED)
                auditFailure(descriptor, reason)
                throw DocumentRejectedException(reason)
            }
        }

    /**
     * Deletes the lease for [recordId]; safe to call twice and safe from a
     * lifecycle callback. Deletion is synchronous and happens before any audit
     * work, so a dropped audit dispatch can never leave plaintext behind.
     */
    fun closeLease(recordId: String): Boolean {
        val file = synchronized(leasesLock) { liveLeases.remove(recordId) }
        if (file == null) return false
        val deleted = runCatching { file.delete() }.getOrDefault(false)
        auditDetached(
            SecurityAuditEvent(
                SecurityEventAction.DOCUMENT_LEASE_CLEARED,
                "deleted=$deleted",
            ),
        )
        return deleted
    }

    private fun source(descriptor: DocumentDescriptor): File =
        vault.encryptedFile(descriptor.recordId)

    private suspend fun validate(access: VaultAccess, descriptor: DocumentDescriptor) {
        session.requireValid(access)
        if (descriptor.mode == DocumentMode.UNSUPPORTED) {
            throw DocumentRejectedException(DocumentFailure.UNSUPPORTED_TYPE)
        }
        if (descriptor.sizeBytes > DocumentViewerPolicy.limitFor(descriptor.mode)) {
            throw DocumentRejectedException(DocumentFailure.TOO_LARGE)
        }
        val record = secrets.find(access, descriptor.recordId)
            ?: throw DocumentRejectedException(DocumentFailure.MISSING)
        if (record.kind != SecretKinds.MEDIA || record.decryptionFailed) {
            throw DocumentRejectedException(DocumentFailure.UNREADABLE)
        }
        if (!source(descriptor).isFile) throw DocumentRejectedException(DocumentFailure.MISSING)
    }

    private fun deleteQuietly(lease: File, recordId: String) {
        runCatching { lease.delete() }
        synchronized(leasesLock) { liveLeases.remove(recordId, lease) }
    }

    /**
     * A failed authentication/tag check is a corrupted document; anything else
     * that reaches the reader is an I/O problem in the path being used. Neither
     * message may reveal a path, so the caller only maps an enum.
     */
    private fun classifyReadFailure(failure: Throwable, ioFallback: DocumentFailure): DocumentFailure =
        when {
            failure is TamperedFileException -> DocumentFailure.UNREADABLE
            failure is GeneralSecurityException -> DocumentFailure.UNREADABLE
            else -> ioFallback
        }

    private suspend fun auditFailure(descriptor: DocumentDescriptor, failure: DocumentFailure) {
        audit.recordSafely(
            SecurityAuditEvent(
                SecurityEventAction.DOCUMENT_OPEN_FAILED,
                "mode=${descriptor.mode.name.lowercase()} reason=${failure.name}",
            ),
        )
    }

    /**
     * Non-blocking audit for paths that run from lifecycle/lock callbacks. The
     * security-relevant deletion has already completed by the time this is used.
     */
    private fun auditDetached(event: SecurityAuditEvent) {
        if (audit === NoopSecurityAuditSink) return
        val scope = auditScope ?: return
        if (!scope.isActive) return
        runCatching { scope.launch { audit.recordSafely(event) } }
    }

    /** Growable in-memory target that can provably zero its own storage. */
    private class WipeableBuffer(private val limit: Long) : OutputStream() {
        private var storage = ByteArray(8 * 1024)
        private var length = 0

        override fun write(byte: Int) {
            grow(1)
            storage[length] = byte.toByte()
            length += 1
        }

        override fun write(source: ByteArray, offset: Int, count: Int) {
            require(offset >= 0 && count >= 0 && offset + count <= source.size) { "Invalid write window" }
            if (count == 0) return
            grow(count)
            System.arraycopy(source, offset, storage, length, count)
            length += count
        }

        fun bytes(): ByteArray = storage

        fun size(): Int = length

        fun wipe() {
            storage.fill(0)
            storage = ByteArray(0)
            length = 0
        }

        private fun grow(incoming: Int) {
            val needed = length.toLong() + incoming
            if (needed > limit) throw DocumentRejectedException(DocumentFailure.TOO_LARGE)
            if (needed <= storage.size) return
            var capacity = storage.size
            while (capacity < needed) {
                capacity = if (capacity > MAX_DOUBLING_HEADROOM) {
                    needed.toInt()
                } else {
                    minOf(capacity * 2L, limit, Int.MAX_VALUE.toLong()).toInt()
                }
            }
            val grown = storage.copyOf(capacity)
            // Only the newest array may hold plaintext; the superseded one is wiped.
            storage.fill(0)
            storage = grown
        }

        private companion object {
            const val MAX_DOUBLING_HEADROOM = 1 shl 20
        }
    }
}
