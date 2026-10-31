package com.knoux.crypt.data

import androidx.room.withTransaction
import java.security.GeneralSecurityException
import java.security.SecureRandom
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Runs a group of DAO mutations atomically. Production uses Room transactions. */
interface TransactionRunner {
    suspend fun <T> inTransaction(block: suspend () -> T): T
}

class RoomTransactionRunner(private val database: KnouxDatabase) : TransactionRunner {
    override suspend fun <T> inTransaction(block: suspend () -> T): T =
        database.withTransaction { block() }
}

/**
 * Proof that the owner performed a fresh auth-bound gate verification for a
 * sensitive key migration. Minted only by UnlockManager after token
 * verification; bound to the live capability and short-lived.
 */
class RotationAuthorization internal constructor(
    internal val access: VaultAccess,
    val issuedAt: Long = System.currentTimeMillis(),
) {
    internal var consumed: Boolean = false

    companion object {
        const val MAX_AGE_MS = 5 * 60 * 1000L
    }
}

class RotationNotAuthorizedException(message: String = "Rotation requires a fresh owner verification") : Exception(message)
class RotationIncompleteException(message: String) : Exception(message)
class RotationCorruptRecordException(val recordId: String, cause: Throwable) :
    Exception("Record $recordId could not be migrated; the batch was rolled back", cause)

data class RotationInventory(
    val activeVersion: Int,
    val versionCounts: Map<Int, Int>,
    val journal: RotationJournal?,
    val storedKeyVersions: List<Int>,
) {
    val totalRows: Int get() = versionCounts.values.sum()
}

data class RotationProgress(
    val sourceVersion: Int,
    val targetVersion: Int,
    val totalRows: Int,
    val migratedRows: Int,
    val remainingRows: Int,
    val phase: String,
    val done: Boolean,
)

data class RotationResult(
    val sourceVersion: Int,
    val targetVersion: Int,
    val migratedRows: Int,
    val oldDataKeyRetired: Boolean,
    val rootKeyRetained: Boolean,
)

enum class RotationCancelResult { CANCELLED_CLEAN, CANCELLED_RESUMABLE }

/**
 * Versioned vault-data-key rotation over the versioned DEK hierarchy.
 *
 * Safety model:
 * - The Keystore root alias `knoux.master.v2` is never deleted or replaced.
 *   Version 0 records and KNF1 device-key files depend on it.
 * - A rotation creates a new wrapped DEK, journals the source/target versions,
 *   migrates records in atomic Room batches with a decrypt/encrypt/verify
 *   round-trip, re-validates every target row, then switches the active version.
 * - Rows carry their keyVersion, so reads work mid-migration. A crash before
 *   cutover leaves a resumable journal and both keys. A crash after cutover but
 *   before cleanup leaves active=target and a CUTOVER journal; resume only
 *   verifies and cleans up.
 * - The source DEK is removed only after zero rows reference it, every target
 *   row was verified, and active==target. The root key is retained permanently
 *   because external KNF1 files cannot be enumerated.
 */
class VaultKeyRotationManager(
    private val session: SessionManager,
    private val keys: VaultKeyManager,
    private val registry: VaultKeyRegistry,
    private val dao: SecretDao,
    private val transactions: TransactionRunner,
    private val random: SecureRandom = SecureRandom(),
) {
    companion object {
        const val BATCH_SIZE = 16
        private const val PAGE_SIZE = 64
    }

    private val rotationMutex = Mutex()
    private var authorizedAccess: VaultAccess? = null

    suspend fun inventory(access: VaultAccess): RotationInventory {
        session.requireValid(access)
        val counts = dao.versionCounts().associate { it.keyVersion to it.count }
        return RotationInventory(
            activeVersion = registry.activeVersion(),
            versionCounts = counts,
            journal = registry.rotationJournal(),
            storedKeyVersions = registry.versions(),
        )
    }

    /**
     * Creates the rotation journal and target DEK, or resumes an existing
     * journal after a fresh owner verification. No record is changed here.
     */
    suspend fun prepare(access: VaultAccess, authorization: RotationAuthorization): RotationJournal =
        rotationMutex.withLock {
            if (authorizedAccess !== access) authorize(access, authorization)
            val journal = registry.rotationJournal()
            val active = registry.activeVersion()
            if (journal != null) {
                if (journal.targetVersion != active && journal.sourceVersion != active) {
                    throw VaultKeyInconsistentException("Rotation journal does not match the active key version")
                }
                return@withLock journal
            }
            val counts = dao.versionCounts().associate { it.keyVersion to it.count }
            // Remove harmless wrapped keys left by an interrupted preparation
            // that never wrote a journal or any dependent row. Version 0 is the
            // Keystore root and is never in this registry.
            registry.versions()
                .filter { it != active && !counts.containsKey(it) }
                .forEach { orphan -> runCatching { registry.removeWrappedKey(orphan) } }
            val foreignVersions = counts.keys - setOf(active)
            if (foreignVersions.isNotEmpty()) {
                throw VaultKeyInconsistentException(
                    "Records exist under key versions $foreignVersions without a rotation journal",
                )
            }
            if (active > LEGACY_KEY_VERSION && registry.wrappedKey(active) == null) {
                throw MissingVaultKeyException(active)
            }
            val highest = maxOf(
                active,
                counts.keys.maxOrNull() ?: LEGACY_KEY_VERSION,
                registry.versions().maxOrNull() ?: LEGACY_KEY_VERSION,
            )
            val target = highest + 1
            keys.createDataKey(access, target, random)
            val now = System.currentTimeMillis()
            val prepared = RotationJournal(
                sourceVersion = active,
                targetVersion = target,
                phase = RotationPhases.PREPARED,
                createdAt = now,
                updatedAt = now,
                totalRows = counts[active] ?: 0,
            )
            try {
                registry.setRotationJournal(prepared)
            } catch (failure: Exception) {
                runCatching { registry.removeWrappedKey(target) }
                throw VaultKeyInconsistentException("Could not persist the rotation journal", failure)
            }
            prepared
        }

    /**
     * Migrates at most [batchSize] source rows in one Room transaction. Returns
     * progress derived from the authoritative row metadata, not a fragile
     * checkpoint. Call repeatedly until [RotationProgress.done].
     */
    suspend fun migrateBatch(access: VaultAccess, batchSize: Int = BATCH_SIZE): RotationProgress =
        rotationMutex.withLock {
            require(batchSize in 1..1000) { "Invalid migration batch size" }
            requireAuthorized(access)
            val journal = registry.rotationJournal()
                ?: throw RotationIncompleteException("No rotation is in progress")
            val active = registry.activeVersion()
            if (active == journal.targetVersion) {
                return@withLock progress(journal, remaining = 0)
            }
            if (journal.phase == RotationPhases.CUTOVER || journal.phase == RotationPhases.CLEANUP) {
                throw VaultKeyInconsistentException("Cutover journal does not match the active key version")
            }
            val sourceKey = keys.keyFor(access, journal.sourceVersion)
            val targetKey = keys.keyFor(access, journal.targetVersion)
            session.withAuthorizedMutation(access) {
                transactions.inTransaction {
                    val rows = dao.pageByVersionAfter(journal.sourceVersion, after = "", limit = batchSize)
                    rows.forEach { row ->
                        val plaintext = try {
                            SecretCodec(sourceKey).decrypt(
                                row.kind,
                                row.id,
                                row.envelope,
                                journal.sourceVersion,
                            )
                        } catch (failure: GeneralSecurityException) {
                            throw RotationCorruptRecordException(row.id, failure)
                        } catch (failure: IllegalArgumentException) {
                            throw RotationCorruptRecordException(row.id, failure)
                        }
                        val migratedBlob = SecretCodec(targetKey)
                            .encrypt(row.kind, row.id, plaintext, journal.targetVersion)
                        // Authenticated round-trip before replacing the row.
                        val check = try {
                            SecretCodec(targetKey).decrypt(
                                row.kind,
                                row.id,
                                migratedBlob,
                                journal.targetVersion,
                            )
                        } catch (failure: GeneralSecurityException) {
                            throw RotationCorruptRecordException(row.id, failure)
                        }
                        if (check != plaintext) {
                            throw RotationCorruptRecordException(
                                row.id,
                                IllegalStateException("Round-trip mismatch"),
                            )
                        }
                        dao.updateEnvelope(row.id, migratedBlob, journal.targetVersion)
                    }
                    rows.size
                }
            }
            val remaining = dao.countVersion(journal.sourceVersion)
            val updated = journal.copy(
                phase = if (remaining == 0) RotationPhases.VERIFYING else RotationPhases.MIGRATING,
                updatedAt = System.currentTimeMillis(),
            )
            registry.setRotationJournal(updated)
            progress(updated, remaining)
        }

    /**
     * Verifies every target record, refuses if source rows remain, switches the
     * active version and retires the old DEK only when zero rows depend on it.
     * The Keystore root key is never retired.
     */
    suspend fun verifyAndCutover(access: VaultAccess): RotationResult = rotationMutex.withLock {
        requireAuthorized(access)
        val journal = registry.rotationJournal()
            ?: throw RotationIncompleteException("No rotation is in progress")
        val targetKey = keys.keyFor(access, journal.targetVersion)
        var verified = 0
        var cursor = ""
        do {
            val page = dao.pageByVersionAfter(journal.targetVersion, cursor, PAGE_SIZE)
            page.forEach { row ->
                try {
                    SecretCodec(targetKey).decrypt(
                        row.kind,
                        row.id,
                        row.envelope,
                        journal.targetVersion,
                    )
                } catch (failure: GeneralSecurityException) {
                    throw RotationCorruptRecordException(row.id, failure)
                } catch (failure: IllegalArgumentException) {
                    throw RotationCorruptRecordException(row.id, failure)
                }
                verified += 1
                cursor = row.id
            }
        } while (page.isNotEmpty())
        val remainingSource = dao.countVersion(journal.sourceVersion)
        if (remainingSource > 0) {
            throw RotationIncompleteException(
                "$remainingSource record(s) still use version ${journal.sourceVersion}; migrate again before cutover",
            )
        }
        val extraVersions = dao.versionCounts()
            .map { it.keyVersion }
            .filter { it != journal.targetVersion && it != journal.sourceVersion }
        if (extraVersions.isNotEmpty()) {
            throw VaultKeyInconsistentException("Unexpected key versions present: $extraVersions")
        }
        session.withAuthorizedMutation(access) {
            if (dao.countVersion(journal.sourceVersion) > 0) {
                throw RotationIncompleteException("Source records appeared during cutover")
            }
            registry.setActiveVersion(journal.targetVersion)
            registry.setRotationJournal(
                journal.copy(phase = RotationPhases.CUTOVER, updatedAt = System.currentTimeMillis()),
            )
        }
        // Cleanup is idempotent and only after verified zero dependencies.
        val sourceRetired = if (journal.sourceVersion > LEGACY_KEY_VERSION) {
            if (dao.countVersion(journal.sourceVersion) != 0) {
                throw VaultKeyInconsistentException("Refusing to retire a key with dependent rows")
            }
            keys.retireDataKey(access, journal.sourceVersion)
            true
        } else {
            false
        }
        registry.setRotationJournal(
            journal.copy(phase = RotationPhases.CLEANUP, updatedAt = System.currentTimeMillis()),
        )
        registry.setRotationJournal(null)
        authorizedAccess = null
        RotationResult(
            sourceVersion = journal.sourceVersion,
            targetVersion = journal.targetVersion,
            migratedRows = verified,
            oldDataKeyRetired = sourceRetired,
            rootKeyRetained = journal.sourceVersion == LEGACY_KEY_VERSION,
        )
    }

    /**
     * Stops without discarding migrated data. If nothing was migrated, the
     * unused target key and journal are removed; otherwise the journal remains
     * resumable and the old key is retained.
     */
    suspend fun cancel(access: VaultAccess): RotationCancelResult = rotationMutex.withLock {
        requireAuthorized(access)
        authorizedAccess = null
        val journal = registry.rotationJournal() ?: return@withLock RotationCancelResult.CANCELLED_CLEAN
        val active = registry.activeVersion()
        if (active == journal.targetVersion) {
            return@withLock RotationCancelResult.CANCELLED_RESUMABLE
        }
        val targetRows = dao.countVersion(journal.targetVersion)
        if (targetRows == 0) {
            // No row ever depended on the target key; removing it cannot lose data.
            runCatching { registry.removeWrappedKey(journal.targetVersion) }
            registry.setRotationJournal(null)
            RotationCancelResult.CANCELLED_CLEAN
        } else {
            RotationCancelResult.CANCELLED_RESUMABLE
        }
    }

    private fun authorize(access: VaultAccess, authorization: RotationAuthorization) {
        session.requireValid(access)
        if (authorization.access !== access) throw RotationNotAuthorizedException()
        if (authorization.consumed) throw RotationNotAuthorizedException("Owner verification was already used")
        val age = System.currentTimeMillis() - authorization.issuedAt
        if (age < 0 || age > RotationAuthorization.MAX_AGE_MS) {
            throw RotationNotAuthorizedException("Owner verification expired; verify again")
        }
        authorization.consumed = true
        authorizedAccess = access
    }

    private fun requireAuthorized(access: VaultAccess) {
        session.requireValid(access)
        if (authorizedAccess !== access) throw RotationNotAuthorizedException()
    }

    private fun progress(journal: RotationJournal, remaining: Int): RotationProgress {
        val total = maxOf(journal.totalRows, remaining)
        return RotationProgress(
            sourceVersion = journal.sourceVersion,
            targetVersion = journal.targetVersion,
            totalRows = total,
            migratedRows = (total - remaining).coerceAtLeast(0),
            remainingRows = remaining,
            phase = journal.phase,
            done = remaining == 0,
        )
    }
}
