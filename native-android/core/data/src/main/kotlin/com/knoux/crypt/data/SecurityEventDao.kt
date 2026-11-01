package com.knoux.crypt.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface SecurityEventDao {
    @Query("SELECT * FROM security_events ORDER BY createdAt DESC")
    suspend fun all(): List<SecurityEventEntity>

    @Query("SELECT * FROM security_events WHERE category = :category ORDER BY createdAt DESC")
    suspend fun byCategory(category: String): List<SecurityEventEntity>

    @Query("SELECT COUNT(*) FROM security_events")
    suspend fun count(): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entity: SecurityEventEntity)

    @Query("DELETE FROM security_events")
    suspend fun clear()

    @Query("DELETE FROM security_events WHERE createdAt < :before")
    suspend fun clearOlderThan(before: Long)

    @Query("SELECT * FROM security_events ORDER BY createdAt DESC LIMIT :limit")
    suspend fun recent(limit: Int): List<SecurityEventEntity>
}
