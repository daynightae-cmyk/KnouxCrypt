package com.knoux.crypt

import android.content.Context
import com.knoux.crypt.data.DataStoreVaultKeyRegistry
import com.knoux.crypt.data.DatabaseProvider
import com.knoux.crypt.data.KeystoreManager
import com.knoux.crypt.data.RoomTransactionRunner
import com.knoux.crypt.data.SecretRepository
import com.knoux.crypt.data.SessionManager
import com.knoux.crypt.data.SettingsRepository
import com.knoux.crypt.data.UnlockManager
import com.knoux.crypt.data.UnlockManagers
import com.knoux.crypt.data.VaultBackupManager
import com.knoux.crypt.data.VaultFileCipher
import com.knoux.crypt.data.VaultKeyManager
import com.knoux.crypt.data.VaultKeyRotationManager

/** Constructor-based dependency container; no service locator or reflection. */
class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    private val database = DatabaseProvider.create(appContext)
    private val keystore = KeystoreManager()

    val session = SessionManager(keystore)
    val unlockManager = UnlockManagers.create(appContext, keystore, session)
    private val keyRegistry = DataStoreVaultKeyRegistry(appContext)
    val vaultKeys = VaultKeyManager(session, keyRegistry)
    val secrets = SecretRepository(database.secrets(), session, vaultKeys)
    val settings = SettingsRepository(appContext)
    val vaultFiles = VaultFileCipher(session)
    val backups = VaultBackupManager(database.secrets(), session, vaultKeys)
    val keyRotation = VaultKeyRotationManager(
        session = session,
        keys = vaultKeys,
        registry = keyRegistry,
        dao = database.secrets(),
        transactions = RoomTransactionRunner(database),
    )
    val rotationAuthBroker = RotationAuthBroker()
}
