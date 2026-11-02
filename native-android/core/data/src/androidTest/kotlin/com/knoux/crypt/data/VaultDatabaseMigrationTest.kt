package com.knoux.crypt.data

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.security.SecureRandom
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented Room migration checks for the versioned vault database.
 *
 * [MigrationTestHelper.runMigrationsAndValidate] compares the migrated schema
 * with the exported expected schema and fails if a table, column or index does
 * not match. These tests therefore prove that MIGRATION_2_3 creates exactly the
 * table declared by [SecurityEventEntity] - the previous revision created two
 * undeclared indexes and would fail Room's open-time validation.
 *
 * These require a device/emulator. When no target is attached they compile but
 * are not executed; the TASK 39 evidence records that limitation explicitly.
 */
@RunWith(AndroidJUnit4::class)
class VaultDatabaseMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        KnouxDatabase::class.java,
    )

    private val random = SecureRandom()

    @Test
    fun migration1To2PreservesRowsAndDefaultsKeyVersionZero() {
        val old = helper.createDatabase("knoux-migration-1-2", 1)
        old.execSQL(
            "INSERT INTO secrets (id, kind, envelope, updatedAt) VALUES ('legacy', 'note', X'010203', 1)",
        )
        old.close()

        val migrated = helper.runMigrationsAndValidate("knoux-migration-1-2", 2, true, MIGRATION_1_2)
        migrated.query("SELECT id, keyVersion FROM secrets").use { cursor ->
            assertTrue(cursor.moveToFirst())
            assertEquals("legacy", cursor.getString(0))
            assertEquals(0, cursor.getInt(1))
        }
        migrated.close()
    }

    @Test
    fun migration2To3CreatesTimelineWithoutIndexesAndPreservesCiphertextBytes() {
        val envelope = ByteArray(96).also(random::nextBytes)
        val old = helper.createDatabase("knoux-migration-2-3", 2)
        old.execSQL(
            "INSERT INTO secrets (id, kind, envelope, updatedAt, keyVersion) VALUES (?, 'note', ?, 42, 3)",
            arrayOf<Any>("secret-row", envelope),
        )
        old.close()

        val migrated = helper.runMigrationsAndValidate("knoux-migration-2-3", 3, true, MIGRATION_2_3)
        migrated.query("SELECT id, kind, envelope, updatedAt, keyVersion FROM secrets").use { cursor ->
            assertTrue(cursor.moveToFirst())
            assertEquals("secret-row", cursor.getString(0))
            assertEquals("note", cursor.getString(1))
            assertArrayEquals(envelope, cursor.getBlob(2))
            assertEquals(42L, cursor.getLong(3))
            assertEquals(3, cursor.getInt(4))
        }
        migrated.query("SELECT name FROM sqlite_master WHERE type='table' AND name='security_events'").use { cursor ->
            assertTrue("security_events table missing", cursor.moveToFirst())
        }
        // No index was declared on the entity, so the migration must not create any.
        migrated.query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='security_events'").use { cursor ->
            assertEquals("security_events must have no indexes", 0, cursor.count)
        }
        migrated.query("SELECT COUNT(*) FROM security_events").use { cursor ->
            assertTrue(cursor.moveToFirst())
            assertEquals(0, cursor.getInt(0))
        }
        migrated.close()
    }

    @Test
    fun migration1To3RunsBothStepsAndPreservesCiphertextBytes() {
        val envelope = ByteArray(128).also(random::nextBytes)
        val old = helper.createDatabase("knoux-migration-1-3", 1)
        old.execSQL(
            "INSERT INTO secrets (id, kind, envelope, updatedAt) VALUES (?, 'password', ?, 7)",
            arrayOf<Any>("legacy-row", envelope),
        )
        old.close()

        val migrated = helper.runMigrationsAndValidate(
            "knoux-migration-1-3",
            3,
            true,
            MIGRATION_1_2,
            MIGRATION_2_3,
        )
        migrated.query("SELECT id, envelope, keyVersion FROM secrets").use { cursor ->
            assertTrue(cursor.moveToFirst())
            assertEquals("legacy-row", cursor.getString(0))
            assertArrayEquals(envelope, cursor.getBlob(1))
            assertEquals(0, cursor.getInt(2))
        }
        migrated.query("SELECT name FROM sqlite_master WHERE type='table' AND name='security_events'").use { cursor ->
            assertTrue("security_events table missing after 1->3", cursor.moveToFirst())
        }
        migrated.close()
    }
}
