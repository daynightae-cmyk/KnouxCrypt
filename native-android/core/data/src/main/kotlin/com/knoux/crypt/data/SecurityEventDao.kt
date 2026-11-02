package com.knoux.crypt.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface SecurityEventDao {
    @Query("SELECT * FROM security_events ORDER BY createdAt DESC, id DESC")
    suspend fun all(): List<SecurityEventEntity>

    @Query("SELECT * FROM security_events WHERE category = :category ORDER BY createdAt DESC, id DESC")
    suspend fun byCategory(category: String): List<SecurityEventEntity>

    /** Genuine Room observation used by the timeline; not a one-shot query. */
    @Query("SELECT * FROM security_events ORDER BY createdAt DESC, id DESC")
    fun observeAll(): Flow<List<SecurityEventEntity>>

    @Query("SELECT * FROM security_events WHERE category = :category ORDER BY createdAt DESC, id DESC")
    fun observeByCategory(category: String): Flow<List<SecurityEventEntity>>

    @Query("SELECT COUNT(*) FROM security_events")
    suspend fun count(): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entity: SecurityEventEntity)

    @Query("DELETE FROM security_events")
    suspend fun clear()

    @Query("DELETE FROM security_events WHERE createdAt < :before")
    suspend fun clearOlderThan(before: Long)

    /** Keeps the newest [keep] rows and deletes the rest, enforcing the retention bound. */
    @Query(
        "DELETE FROM security_events WHERE id NOT IN " +
            "(SELECT id FROM security_events ORDER BY createdAt DESC, id DESC LIMIT :keep)",
    )
    suspend fun trimToMostRecent(keep: Int)

    @Query("SELECT * FROM security_events ORDER BY createdAt DESC, id DESC LIMIT :limit")
    suspend fun recent(limit: Int): List<SecurityEventEntity>
}
