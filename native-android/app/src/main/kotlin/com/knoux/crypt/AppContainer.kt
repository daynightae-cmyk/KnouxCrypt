package com.knoux.crypt

import android.content.Context
import com.knoux.crypt.data.DataStoreVaultKeyRegistry
import com.knoux.crypt.data.DatabaseProvider
import com.knoux.crypt.data.KeystoreManager
import com.knoux.crypt.data.PasswordAuditService
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Constructor-based dependency container; no service locator or reflection. */
class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val database = DatabaseProvider.create(appContext)
    private val keystore = KeystoreManager()

    val session = SessionManager(keystore)
    /** Application-scoped so screens can preview sounds; MainActivity drives lifecycle. */
    val audio = AudioController(appContext, appScope)
    val unlockManager = UnlockManagers.create(appContext, keystore, session)
    private val keyRegistry = DataStoreVaultKeyRegistry(appContext)
    val vaultKeys = VaultKeyManager(session, keyRegistry)
    val secrets = SecretRepository(database.secrets(), session, vaultKeys)
    val settings = SettingsRepository(appContext)
    val clipboard = ClipboardPrivacy(appContext, settings, appScope).also { privacy ->
        session.addOnLockListener { privacy.clearNow() }
    }
    val vaultFiles = VaultFileCipher(session)
    val passwordAudit = PasswordAuditService(session, database.secrets(), secrets)
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
