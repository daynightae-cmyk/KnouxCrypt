package com.knoux.crypt.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import java.security.GeneralSecurityException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext

@Entity(tableName = "secrets")
data class SecretEntity(
    @PrimaryKey val id: String,
    val kind: String,
    val envelope: ByteArray,
    val updatedAt: Long,
    /** 0 = legacy root-key record (KNC1); positive = wrapped vault DEK version (KNC2). */
    val keyVersion: Int = 0,
)

@Dao
interface SecretDao {
    @Query("SELECT * FROM secrets WHERE kind = :kind ORDER BY updatedAt DESC")
    fun observe(kind: String): Flow<List<SecretEntity>>

    @Query("SELECT * FROM secrets WHERE id = :id")
    suspend fun find(id: String): SecretEntity?

    @Upsert
    suspend fun upsert(entity: SecretEntity)

    /** One Room transaction for a batch import; any failure aborts the whole batch. */
    @Upsert
    suspend fun upsertAll(entities: List<SecretEntity>)

    @Query("DELETE FROM secrets WHERE id = :id")
    suspend fun delete(id: String)

    @Query("SELECT COUNT(*) FROM secrets WHERE kind = :kind")
    fun count(kind: String): Flow<Int>

    @Query("SELECT * FROM secrets ORDER BY updatedAt ASC")
    suspend fun all(): List<SecretEntity>

    @Query("SELECT id FROM secrets")
    suspend fun ids(): List<String>

    /** One Room transaction: any conflict aborts the whole restore. */
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertAll(entities: List<SecretEntity>)

    @Query("SELECT * FROM secrets WHERE keyVersion = :version AND id > :after ORDER BY id LIMIT :limit")
    suspend fun pageByVersionAfter(version: Int, after: String, limit: Int): List<SecretEntity>

    @Query("SELECT COUNT(*) FROM secrets WHERE keyVersion = :version")
    suspend fun countVersion(version: Int): Int

    @Query("UPDATE secrets SET envelope = :envelope, keyVersion = :keyVersion WHERE id = :id")
    suspend fun updateEnvelope(id: String, envelope: ByteArray, keyVersion: Int)

    @Query("SELECT keyVersion AS keyVersion, COUNT(*) AS count FROM secrets GROUP BY keyVersion")
    suspend fun versionCounts(): List<VersionCount>
}

data class VersionCount(val keyVersion: Int, val count: Int)

@Database(entities = [SecretEntity::class, SecurityEventEntity::class], version = 3, exportSchema = true)
abstract class KnouxDatabase : RoomDatabase() {
    abstract fun secrets(): SecretDao
    abstract fun securityEvents(): SecurityEventDao
}

/** Adds explicit key-version metadata without touching or re-encrypting existing rows. */
val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(database: SupportSQLiteDatabase) {
        database.execSQL("ALTER TABLE secrets ADD COLUMN keyVersion INTEGER NOT NULL DEFAULT 0")
    }
}

/** Adds the non-secret local audit timeline used by TASK 39. */
val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(database: SupportSQLiteDatabase) {
        database.execSQL(
            "CREATE TABLE IF NOT EXISTS security_events (" +
                "id TEXT NOT NULL PRIMARY KEY," +
                "category TEXT NOT NULL," +
                "action TEXT NOT NULL," +
                "detail TEXT NOT NULL," +
                "severity TEXT NOT NULL," +
                "createdAt INTEGER NOT NULL)"
        )
        database.execSQL("CREATE INDEX IF NOT EXISTS idx_security_events_createdAt ON security_events(createdAt)")
        database.execSQL("CREATE INDEX IF NOT EXISTS idx_security_events_category ON security_events(category)")
    }
}

object DatabaseProvider {
    fun create(context: Context): KnouxDatabase =
        Room.databaseBuilder(context.applicationContext, KnouxDatabase::class.java, "knoux.db")
            .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
            .build()
}

/**
 * All rows are ciphertext; kind and timestamps are the only plaintext metadata.
 * Reads require a live [VaultAccess]; corrupted rows are surfaced, never hidden
 * or silently replaced with demo data.
 *
 * Revocation is checked at three points: when a cold Flow is collected, before
 * every emission is delivered, and after every decrypt/encrypt. A capability
 * that outlives its session therefore fails with [VaultLockedException] instead
 * of returning cached plaintext. Locking also clears the UI-facing flows in the
 * app module.
 */
class SecretRepository(
    private val dao: SecretDao,
    private val session: SessionManager,
    private val keys: VaultKeyManager,
) {
    fun observe(access: VaultAccess, kind: String): Flow<List<SecretRecord>> = flow {
        session.requireValid(access)
        dao.observe(kind).collect { rows ->
            session.requireValid(access)
            emit(rows.map { decode(access, it) })
        }
    }.flowOn(Dispatchers.IO)

    fun count(access: VaultAccess, kind: String): Flow<Int> = flow {
        session.requireValid(access)
        dao.count(kind).collect { count ->
            session.requireValid(access)
            emit(count)
        }
    }.flowOn(Dispatchers.IO)

    suspend fun find(access: VaultAccess, id: String): SecretRecord? = withContext(Dispatchers.IO) {
        session.requireValid(access)
        val entity = dao.find(id)
        val record = entity?.let { decode(access, it) }
        // A lock may have happened while the DAO call was suspended. Never
        // hand back plaintext that was decrypted after revocation.
        session.requireValid(access)
        record
    }

    suspend fun save(access: VaultAccess, kind: String, id: String?, payloadJson: String): String =
        withContext(Dispatchers.IO) {
            session.withAuthorizedMutation(access) {
                val recordId = id?.takeIf { it.isNotBlank() } ?: java.util.UUID.randomUUID().toString()
                val keyVersion = keys.activeVersion(access)
                val codec = SecretCodec(keys.keyFor(access, keyVersion))
                val blob = codec.encrypt(kind, recordId, payloadJson, keyVersion)
                dao.upsert(SecretEntity(recordId, kind, blob, System.currentTimeMillis(), keyVersion))
                recordId
            }
        }

    /**
     * Writes several records under one authorization boundary and one Room
     * transaction ([SecretDao.upsertAll]). Either every row is committed or none
     * is; a lock or cancellation before the write leaves the vault unchanged.
     */
    suspend fun saveBatch(
        access: VaultAccess,
        kind: String,
        items: List<Pair<String?, String>>,
    ): List<String> = withContext(Dispatchers.IO) {
        if (items.isEmpty()) return@withContext emptyList()
        session.withAuthorizedMutation(access) {
            val keyVersion = keys.activeVersion(access)
            val codec = SecretCodec(keys.keyFor(access, keyVersion))
            val now = System.currentTimeMillis()
            val ids = ArrayList<String>(items.size)
            val entities = ArrayList<SecretEntity>(items.size)
            items.forEach { (requestedId, payloadJson) ->
                val recordId = requestedId?.takeIf { it.isNotBlank() } ?: java.util.UUID.randomUUID().toString()
                ids += recordId
                entities += SecretEntity(
                    recordId,
                    kind,
                    codec.encrypt(kind, recordId, payloadJson, keyVersion),
                    now,
                    keyVersion,
                )
            }
            dao.upsertAll(entities)
            ids
        }
    }

    suspend fun delete(access: VaultAccess, id: String) = withContext(Dispatchers.IO) {
        session.withAuthorizedMutation(access) {
            session.key(access) // authorize before mutating
            dao.delete(id)
        }
    }

    private suspend fun decode(access: VaultAccess, entity: SecretEntity): SecretRecord {
        session.requireValid(access)
        val record = try {
            val codec = SecretCodec(keys.keyFor(access, entity.keyVersion))
            SecretRecord(
                entity.id,
                entity.kind,
                codec.decrypt(entity.kind, entity.id, entity.envelope, entity.keyVersion),
                entity.updatedAt,
            )
        } catch (_: MissingVaultKeyException) {
            SecretRecord(entity.id, entity.kind, "", entity.updatedAt, decryptionFailed = true)
        } catch (_: GeneralSecurityException) {
            SecretRecord(entity.id, entity.kind, "", entity.updatedAt, decryptionFailed = true)
        } catch (_: IllegalArgumentException) {
            SecretRecord(entity.id, entity.kind, "", entity.updatedAt, decryptionFailed = true)
        }
        session.requireValid(access)
        return record
    }
}
