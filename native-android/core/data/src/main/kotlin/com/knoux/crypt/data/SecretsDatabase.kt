package com.knoux.crypt.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert
import java.security.GeneralSecurityException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

@Entity(tableName = "secrets")
data class SecretEntity(
    @PrimaryKey val id: String,
    val kind: String,
    val envelope: ByteArray,
    val updatedAt: Long,
)

@Dao
interface SecretDao {
    @Query("SELECT * FROM secrets WHERE kind = :kind ORDER BY updatedAt DESC")
    fun observe(kind: String): Flow<List<SecretEntity>>

    @Query("SELECT * FROM secrets WHERE id = :id")
    suspend fun find(id: String): SecretEntity?

    @Upsert
    suspend fun upsert(entity: SecretEntity)

    @Query("DELETE FROM secrets WHERE id = :id")
    suspend fun delete(id: String)

    @Query("SELECT COUNT(*) FROM secrets WHERE kind = :kind")
    fun count(kind: String): Flow<Int>
}

@Database(entities = [SecretEntity::class], version = 1, exportSchema = true)
abstract class KnouxDatabase : RoomDatabase() {
    abstract fun secrets(): SecretDao
}

object DatabaseProvider {
    fun create(context: Context): KnouxDatabase =
        Room.databaseBuilder(context.applicationContext, KnouxDatabase::class.java, "knoux.db")
            .build()
}

/**
 * All rows are ciphertext; kind and timestamps are the only plaintext metadata.
 * Reads require a live [VaultAccess]; corrupted rows are surfaced, never hidden
 * or silently replaced with demo data.
 */
class SecretRepository(
    private val dao: SecretDao,
    private val session: SessionManager,
) {
    fun observe(access: VaultAccess, kind: String): Flow<List<SecretRecord>> =
        dao.observe(kind)
            .map { rows -> rows.map { decode(access, it) } }
            .flowOn(Dispatchers.IO)

    fun count(access: VaultAccess, kind: String): Flow<Int> = dao.count(kind).flowOn(Dispatchers.IO)

    suspend fun find(access: VaultAccess, id: String): SecretRecord? = withContext(Dispatchers.IO) {
        dao.find(id)?.let { decode(access, it) }
    }

    suspend fun save(access: VaultAccess, kind: String, id: String?, payloadJson: String): String =
        withContext(Dispatchers.IO) {
            val recordId = id?.takeIf { it.isNotBlank() } ?: java.util.UUID.randomUUID().toString()
            val codec = SecretCodec(session.key(access))
            val blob = codec.encrypt(kind, recordId, payloadJson)
            dao.upsert(SecretEntity(recordId, kind, blob, System.currentTimeMillis()))
            recordId
        }

    suspend fun delete(access: VaultAccess, id: String) = withContext(Dispatchers.IO) {
        session.key(access) // authorize before mutating
        dao.delete(id)
    }

    private fun decode(access: VaultAccess, entity: SecretEntity): SecretRecord {
        val codec = SecretCodec(session.key(access))
        return try {
            SecretRecord(entity.id, entity.kind, codec.decrypt(entity.kind, entity.id, entity.envelope), entity.updatedAt)
        } catch (_: GeneralSecurityException) {
            SecretRecord(entity.id, entity.kind, "", entity.updatedAt, decryptionFailed = true)
        } catch (_: IllegalArgumentException) {
            SecretRecord(entity.id, entity.kind, "", entity.updatedAt, decryptionFailed = true)
        }
    }
}
