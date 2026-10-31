package com.knoux.crypt

import android.content.Context
import com.knoux.crypt.data.DatabaseProvider
import com.knoux.crypt.data.KeystoreManager
import com.knoux.crypt.data.SecretRepository
import com.knoux.crypt.data.SessionManager
import com.knoux.crypt.data.SettingsRepository
import com.knoux.crypt.data.UnlockManager
import com.knoux.crypt.data.UnlockManagers
import com.knoux.crypt.data.VaultBackupManager
import com.knoux.crypt.data.VaultFileCipher

/** Constructor-based dependency container; no service locator or reflection. */
class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    private val database = DatabaseProvider.create(appContext)
    private val keystore = KeystoreManager()

    val session = SessionManager(keystore)
    val unlockManager = UnlockManagers.create(appContext, keystore, session)
    val secrets = SecretRepository(database.secrets(), session)
    val settings = SettingsRepository(appContext)
    val vaultFiles = VaultFileCipher(session)
    val backups = VaultBackupManager(database.secrets(), session)
}
