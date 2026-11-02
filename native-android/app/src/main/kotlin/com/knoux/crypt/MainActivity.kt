package com.knoux.crypt

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.knoux.crypt.data.AppSettings
import com.knoux.crypt.data.SecurityAuditEvent
import com.knoux.crypt.data.SecurityEventAction
import com.knoux.crypt.data.SessionPrivacyPolicy
import com.knoux.crypt.data.UnlockKeyInvalidatedException
import com.knoux.crypt.data.UnlockManager
import com.knoux.crypt.data.UnlockNotAuthorizedException
import com.knoux.crypt.data.UnlockNotConfiguredException
import com.knoux.crypt.data.UnlockReenrollmentBlockedException
import com.knoux.crypt.data.UnlockRejectedException
import com.knoux.crypt.data.recordSafely
import javax.crypto.Cipher
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : FragmentActivity() {
    private enum class GateAction { SETUP, UNLOCK, ROTATE, ROTATE_KEYS }

    private lateinit var container: AppContainer
    private lateinit var accessViewModel: AccessViewModel
    private var backgroundLockJob: Job? = null
    private var privacySettings = AppSettings()
    private var screenOffRegistered = false

    private val screenOffReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == Intent.ACTION_SCREEN_OFF && privacySettings.lockOnScreenOff) {
                lifecycleScope.launch { container.session.lock() }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (privacySettings.blockScreenshots) {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
        container = AppContainer(applicationContext)
        lifecycleScope.launch {
            container.settings.settings.collect { settings ->
                privacySettings = settings
                applyScreenCapturePolicy(settings.blockScreenshots)
                container.audio.updateSettings(settings)
            }
        }
        accessViewModel = ViewModelProvider(
            this,
            viewModelFactory { AccessViewModel(application, container.unlockManager, container.session) },
        )[AccessViewModel::class.java]
        accessViewModel.refresh()

        setContent {
            KnouxRoot(
                container = container,
                accessViewModel = accessViewModel,
                onRequestUnlock = { setup ->
                    authenticate(if (setup) GateAction.SETUP else GateAction.UNLOCK)
                },
                onRequestGateRotation = { authenticate(GateAction.ROTATE) },
                onRequestRotationAuth = { authenticate(GateAction.ROTATE_KEYS) },
            )
        }
    }

    override fun onStart() {
        super.onStart()
        container.audio.onForeground()
        backgroundLockJob?.cancel()
        backgroundLockJob = null
        if (!screenOffRegistered) {
            ContextCompat.registerReceiver(
                this,
                screenOffReceiver,
                IntentFilter(Intent.ACTION_SCREEN_OFF),
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )
            screenOffRegistered = true
        }
    }

    override fun onStop() {
        super.onStop()
        container.audio.onBackground()
        if (screenOffRegistered) {
            runCatching { unregisterReceiver(screenOffReceiver) }
            screenOffRegistered = false
        }
        if (isChangingConfigurations) return
        // Configurable grace period; the setting is validated by
        // SessionPrivacyPolicy before it is persisted.
        val timeoutSeconds = SessionPrivacyPolicy.requireAutoLockSeconds(privacySettings.autoLockSeconds)
        backgroundLockJob = lifecycleScope.launch {
            if (timeoutSeconds > 0) delay(timeoutSeconds * 1000L)
            container.session.lock()
        }
    }

    override fun onDestroy() {
        container.audio.release()
        super.onDestroy()
    }

    private fun applyScreenCapturePolicy(block: Boolean) {
        if (block) {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    /**
     * Every gate action is bound to a real auth-bound Keystore cipher. The UI
     * can only ask for an action; the domain verifies the token and the
     * resulting capability after BiometricPrompt succeeds.
     */
    private fun authenticate(action: GateAction) {
        if (accessViewModel.state.value.busy || container.rotationAuthBroker.requesting.value) return
        val keyRotation = action == GateAction.ROTATE_KEYS
        if (keyRotation) container.rotationAuthBroker.beginRequest() else accessViewModel.setBusy(true)
        lifecycleScope.launch {
            val cipher = try {
                when (action) {
                    GateAction.SETUP -> container.unlockManager.prepareSetupCipher()
                    GateAction.UNLOCK -> container.unlockManager.prepareUnlockCipher()
                    GateAction.ROTATE -> container.unlockManager.prepareGateRotationCipher()
                    GateAction.ROTATE_KEYS -> container.unlockManager.prepareRotationReauthCipher()
                }
            } catch (failure: Exception) {
                auditGateFailure(action, failure)
                handleFailure(failure, action)
                return@launch
            }
            showPrompt(action, cipher)
        }
    }

    private fun showPrompt(action: GateAction, cipher: Cipher) {
        val prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    val cipherUsed = result.cryptoObject?.cipher
                    if (cipherUsed == null) {
                        reportPromptMessage(action, AccessErrors.missingCipher())
                        return
                    }
                    lifecycleScope.launch {
                        try {
                            when (action) {
                                GateAction.SETUP -> {
                                    container.unlockManager.completeSetup(cipherUsed)
                                    accessViewModel.onUnlocked()
                                    container.audio.play(UiSound.UNLOCK)
                                }
                                GateAction.UNLOCK -> {
                                    container.unlockManager.completeUnlock(cipherUsed)
                                    accessViewModel.onUnlocked()
                                    container.audio.play(UiSound.UNLOCK)
                                }
                                GateAction.ROTATE -> {
                                    container.unlockManager.completeGateRotation(cipherUsed)
                                    accessViewModel.onGateRotated()
                                    container.audio.play(UiSound.CONFIRM)
                                }
                                GateAction.ROTATE_KEYS -> {
                                    val authorization =
                                        container.unlockManager.completeRotationReauth(cipherUsed)
                                    container.rotationAuthBroker.grant(authorization)
                                }
                            }
                        } catch (failure: Exception) {
                            handleFailure(failure, action)
                        }
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    val message = when (errorCode) {
                        BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                        BiometricPrompt.ERROR_USER_CANCELED,
                        -> AccessErrors.cancelled()
                        BiometricPrompt.ERROR_CANCELED -> AccessErrors.cancelled()
                        BiometricPrompt.ERROR_LOCKOUT -> AccessErrors.lockout()
                        BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> AccessErrors.permanentLockout()
                        BiometricPrompt.ERROR_NO_BIOMETRICS,
                        BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL,
                        -> AccessErrors.noBiometrics()
                        BiometricPrompt.ERROR_HW_NOT_PRESENT,
                        BiometricPrompt.ERROR_HW_UNAVAILABLE,
                        BiometricPrompt.ERROR_UNABLE_TO_PROCESS,
                        -> AccessErrors.hardwareUnavailable()
                        // An unrecognised platform code keeps its raw text so a
                        // real cause is never replaced by a generic sentence.
                        else -> AccessErrors.platformDetail(errString.toString())
                    }
                    reportPromptMessage(action, message)
                    auditPromptError(action, errorCode)
                }
            },
        )
        val subtitle = when (action) {
            GateAction.SETUP -> "Set up secure unlock"
            GateAction.UNLOCK -> "Unlock your vault"
            GateAction.ROTATE -> "Verify before replacing the unlock gate"
            GateAction.ROTATE_KEYS -> "Verify to rotate the vault data key"
        }
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("KNOUX Crypt")
            .setSubtitle(subtitle)
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButtonText("Cancel")
            .setConfirmationRequired(false)
            .build()
        prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))
    }

    private fun reportPromptMessage(action: GateAction, message: SecurityMessage) {
        if (action == GateAction.ROTATE_KEYS) {
            container.rotationAuthBroker.fail(message)
        } else {
            accessViewModel.onError(message)
        }
    }

    /**
     * The biometric prompt itself is an authoritative platform boundary; a
     * cancelled or errored prompt never reaches UnlockManager, so the outcome is
     * recorded here without any biometric or secret detail.
     */
    private fun auditPromptError(action: GateAction, errorCode: Int) {
        val cancelled = errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
            errorCode == BiometricPrompt.ERROR_USER_CANCELED ||
            errorCode == BiometricPrompt.ERROR_CANCELED
        val event = when {
            action == GateAction.ROTATE && cancelled -> SecurityEventAction.GATE_ROTATION_CANCELLED
            action == GateAction.ROTATE -> SecurityEventAction.GATE_ROTATION_FAILED
            cancelled -> SecurityEventAction.UNLOCK_CANCELLED
            else -> SecurityEventAction.UNLOCK_FAILED
        }
        lifecycleScope.launch {
            container.securityEvents.recordSafely(
                SecurityAuditEvent(event, "biometric prompt ${if (cancelled) "cancelled" else "error"}"),
            )
        }
    }

    /** Authentication could not even begin; the operation never reached the gate. */
    private fun auditGateFailure(action: GateAction, failure: Exception) {
        val detail = when (failure) {
            is UnlockNotConfiguredException -> "unlock gate not configured"
            is UnlockNotAuthorizedException -> "session not authorized"
            else -> "gate preparation failed"
        }
        val event = if (action == GateAction.ROTATE) {
            SecurityEventAction.GATE_ROTATION_FAILED
        } else {
            SecurityEventAction.UNLOCK_FAILED
        }
        lifecycleScope.launch {
            container.securityEvents.recordSafely(SecurityAuditEvent(event, detail))
        }
    }

    private fun handleFailure(failure: Exception, action: GateAction) {
        val rotationContext = action == GateAction.ROTATE_KEYS
        val invalidated = failure is KeyPermanentlyInvalidatedException
        if (invalidated) {
            val message = AccessErrors.invalidatedKey(rotationContext)
            if (rotationContext) container.rotationAuthBroker.fail(message) else accessViewModel.onError(message)
            if (!rotationContext) accessViewModel.refresh()
            return
        }
        if (rotationContext) {
            container.rotationAuthBroker.fail(AccessErrors.fromFailure(failure, rotationContext = true))
            return
        }
        when (failure) {
            is UnlockKeyInvalidatedException -> lifecycleScope.launch {
                val reason = runCatching { container.unlockManager.recoveryReason() }.getOrNull()
                if (reason != null) {
                    accessViewModel.onRecoveryRequired(reason)
                } else {
                    accessViewModel.onError(AccessErrors.fromFailure(failure, rotationContext = false))
                }
                accessViewModel.refresh()
            }

            is UnlockReenrollmentBlockedException -> lifecycleScope.launch {
                val configured = runCatching { container.unlockManager.isConfigured() }.getOrDefault(false)
                if (configured) {
                    accessViewModel.onError(AccessErrors.fromFailure(failure, rotationContext = false))
                } else {
                    accessViewModel.onRecoveryRequired(UnlockManager.RECOVERY_GATE_MISSING)
                }
                accessViewModel.refresh()
            }

            is UnlockNotConfiguredException -> {
                accessViewModel.onError(AccessErrors.fromFailure(failure, rotationContext = false))
                accessViewModel.refresh()
            }

            else -> accessViewModel.onError(AccessErrors.fromFailure(failure, rotationContext = false))
        }
    }
}
