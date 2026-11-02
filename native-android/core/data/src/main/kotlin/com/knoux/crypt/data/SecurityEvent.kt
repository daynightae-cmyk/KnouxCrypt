package com.knoux.crypt.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "security_events")
data class SecurityEventEntity(
    @PrimaryKey val id: String,
    val category: String,
    val action: String,
    val detail: String,
    val severity: String,
    val createdAt: Long,
)

data class SecurityEvent(
    val id: String,
    val category: String,
    val action: String,
    val detail: String,
    val severity: String,
    val createdAt: Long,
)

fun SecurityEventEntity.toDomain(): SecurityEvent =
    SecurityEvent(id, category, action, detail, severity, createdAt)
