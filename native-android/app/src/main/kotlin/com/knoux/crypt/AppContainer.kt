package com.knoux.crypt

import android.content.Context
import com.knoux.crypt.data.ArchiveService
import com.knoux.crypt.data.CertificateVaultService
import com.knoux.crypt.data.DataStoreVaultKeyRegistry
import com.knoux.crypt.data.DatabaseProvider
import com.knoux.crypt.data.DocumentViewerService
import com.knoux.crypt.data.KeystoreManager
import com.knoux.crypt.data.MetadataCleaner
import com.knoux.crypt.data.PasswordAuditService
import com.knoux.crypt.data.RoomTransactionRunner
import com.knoux.crypt.data.SecretRepository
import com.knoux.crypt.data.SecurityAuditEvent
import com.knoux.crypt.data.SecurityEventAction
import com.knoux.crypt.data.SecurityEventRepository
import com.knoux.crypt.data.SessionManager
import com.knoux.crypt.data.SettingsRepository
import com.knoux.crypt.data.ShadowVaultService
import com.knoux.crypt.data.ShareService
import com.knoux.crypt.data.SignatureStudio
import com.knoux.crypt.data.SigningService
import com.knoux.crypt.data.UnlockManager
import com.knoux.crypt.data.UnlockManagers
import com.knoux.crypt.data.VaultBackupManager
import com.knoux.crypt.data.VaultCollectionsService
import com.knoux.crypt.data.VaultFileCipher
import com.knoux.crypt.data.VaultKeyManager
import com.knoux.crypt.data.VaultKeyRotationManager
import com.knoux.crypt.data.recordSafely
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Constructor-based dependency container; no service locator or reflection. */
class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val database = DatabaseProvider.create(appContext)
    val keystore = KeystoreManager()

    val session = SessionManager(keystore)
    /** Room-backed audit sink; constructed before every service that can emit. */
    val securityEvents = SecurityEventRepository(database.securityEvents())
    /** Application-scoped so screens can preview sounds; MainActivity drives lifecycle. */
    val audio = AudioController(appContext, appScope)
    val unlockManager = UnlockManagers.create(appContext, keystore, session, securityEvents)
    private val keyRegistry = DataStoreVaultKeyRegistry(appContext)
    val vaultKeys = VaultKeyManager(session, keyRegistry)
    val secrets = SecretRepository(database.secrets(), session, vaultKeys, securityEvents)
    val settings = SettingsRepository(appContext, securityEvents)
    val clipboard = ClipboardPrivacy(appContext, settings, appScope).also { privacy ->
        session.addOnLockListener { privacy.clearNow() }
    }
    val signing = SigningService(keystore, secrets, session)
    val signatureStudio = SignatureStudio(signing, secrets, session)
    val share = ShareService(session, secrets, audit = securityEvents)
    val certificates = CertificateVaultService(session, secrets)
    val vaultFiles = VaultFileCipher(session)
    /** TASK 05: encrypted media store; no plaintext media or thumbnail files. */
    val shadowVault = ShadowVaultService(
        session = session,
        secrets = secrets,
        files = vaultFiles,
        root = java.io.File(appContext.filesDir, "shadow_vault"),
        audit = securityEvents,
    )
    /** TASK 29: encrypted collection labels + membership stored on the media record. */
    val vaultCollections = VaultCollectionsService(session, secrets, securityEvents)
    /**
     * TASK 30: protected document viewer. Text decrypts into wiped memory;
     * PDF leases live only under app-private cache and are deleted on close,
     * on lock and by the startup sweep of an interrupted previous process.
     */
    val documentViewer = DocumentViewerService(
        session = session,
        secrets = secrets,
        vault = shadowVault,
        vaultFiles = vaultFiles,
        leaseRoot = java.io.File(appContext.cacheDir, "document_viewer"),
        audit = securityEvents,
        auditScope = appScope,
    )
    val archives = ArchiveService(session, vaultFiles, secrets) { appContext.cacheDir }
    val metadataCleaner = MetadataCleaner()
    val passwordAudit = PasswordAuditService(session, database.secrets(), secrets)
    val backups = VaultBackupManager(database.secrets(), session, vaultKeys)
    val keyRotation = VaultKeyRotationManager(
        session = session,
        keys = vaultKeys,
        registry = keyRegistry,
        dao = database.secrets(),
        transactions = RoomTransactionRunner(database),
        audit = securityEvents,
    )
    val rotationAuthBroker = RotationAuthBroker()

    init {
        // Lock is an authoritative session outcome and is recorded even when the
        // caller is a lifecycle timeout or the screen-off receiver.
        session.addOnLockListener {
            appScope.launch {
                securityEvents.recordSafely(SecurityAuditEvent(SecurityEventAction.SESSION_LOCKED))
            }
        }
        // Drop interrupted import temps; decrypted media never exists on disk.
        session.addOnLockListener { shadowVault.onLock() }
        // A lock must never leave a decrypted PDF lease behind.
        session.addOnLockListener { documentViewer.onLock() }
        // Reclaim a lease orphaned by a previous process that was killed mid-view.
        appScope.launch(Dispatchers.IO) { documentViewer.sweepExpiredLeases() }
    }
}
