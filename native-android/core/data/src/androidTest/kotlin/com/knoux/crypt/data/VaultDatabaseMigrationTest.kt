package com.knoux.crypt.data

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented Room migration check. Compiles but was NOT run without a device.
 * Proves the 1 -> 2 migration preserves rows and defaults them to root-key
 * version 0 without re-encryption.
 */
@RunWith(AndroidJUnit4::class)
class VaultDatabaseMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        KnouxDatabase::class.java,
    )

    @Test
    fun migration1To2PreservesRowsAndDefaultsKeyVersionZero() {
        val old = helper.createDatabase("knoux-migration-test", 1)
        old.execSQL(
            "INSERT INTO secrets (id, kind, envelope, updatedAt) VALUES ('legacy', 'note', X'010203', 1)",
        )
        old.close()

        val migrated = helper.runMigrationsAndValidate("knoux-migration-test", 2, true, MIGRATION_1_2)
        migrated.query("SELECT id, keyVersion FROM secrets").use { cursor ->
            assertTrue(cursor.moveToFirst())
            assertEquals("legacy", cursor.getString(0))
            assertEquals(0, cursor.getInt(1))
        }
        migrated.close()
    }
}
