package com.knoux.crypt

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
import com.knoux.crypt.data.UnlockKeyInvalidatedException
import com.knoux.crypt.data.UnlockManager
import com.knoux.crypt.data.UnlockNotAuthorizedException
import com.knoux.crypt.data.UnlockNotConfiguredException
import com.knoux.crypt.data.UnlockReenrollmentBlockedException
import com.knoux.crypt.data.UnlockRejectedException
import javax.crypto.Cipher
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : FragmentActivity() {
    private enum class GateAction { SETUP, UNLOCK, ROTATE, ROTATE_KEYS }

    private lateinit var container: AppContainer
    private lateinit var accessViewModel: AccessViewModel
    private var backgroundLockJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        container = AppContainer(applicationContext)
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
        backgroundLockJob?.cancel()
        backgroundLockJob = null
    }

    override fun onStop() {
        super.onStop()
        if (isChangingConfigurations) return
        // System pickers briefly background the app; keep a short grace period so
        // returning from SAF does not silently discard an authorized session.
        backgroundLockJob = lifecycleScope.launch {
            delay(30_000)
            container.session.lock()
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
                        reportPromptMessage(action, "Biometric result did not include a key cipher.")
                        return
                    }
                    lifecycleScope.launch {
                        try {
                            when (action) {
                                GateAction.SETUP -> {
                                    container.unlockManager.completeSetup(cipherUsed)
                                    accessViewModel.onUnlocked()
                                }
                                GateAction.UNLOCK -> {
                                    container.unlockManager.completeUnlock(cipherUsed)
                                    accessViewModel.onUnlocked()
                                }
                                GateAction.ROTATE -> {
                                    container.unlockManager.completeGateRotation(cipherUsed)
                                    accessViewModel.onGateRotated()
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
                    reportPromptMessage(
                        action,
                        when (errorCode) {
                            BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                            BiometricPrompt.ERROR_USER_CANCELED,
                            -> "Authentication cancelled."
                            BiometricPrompt.ERROR_LOCKOUT -> "Too many attempts. Try again later."
                            BiometricPrompt.ERROR_LOCKOUT_PERMANENT ->
                                "Biometric unlock is locked; guest mode remains available."
                            BiometricPrompt.ERROR_NO_BIOMETRICS -> "No strong biometric is enrolled."
                            BiometricPrompt.ERROR_HW_NOT_PRESENT,
                            BiometricPrompt.ERROR_HW_UNAVAILABLE,
                            -> "Biometric hardware is unavailable."
                            else -> errString.toString()
                        },
                    )
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

    private fun reportPromptMessage(action: GateAction, message: String) {
        if (action == GateAction.ROTATE_KEYS) {
            container.rotationAuthBroker.fail(message)
        } else {
            accessViewModel.onError(message)
        }
    }

    private fun handleFailure(failure: Exception, action: GateAction) {
        if (action == GateAction.ROTATE_KEYS) {
            val message = when (failure) {
                is UnlockKeyInvalidatedException,
                is KeyPermanentlyInvalidatedException,
                -> "The biometric key was invalidated. Unlock or recover the gate before rotating."
                is UnlockRejectedException -> "Authentication failed; rotation was not authorized."
                is UnlockNotAuthorizedException -> "Unlock the vault before rotating its key."
                else -> failure.message ?: "Rotation authorization failed."
            }
            container.rotationAuthBroker.fail(message)
            return
        }
        when (failure) {
            is UnlockKeyInvalidatedException,
            is KeyPermanentlyInvalidatedException,
            -> lifecycleScope.launch {
                val reason = runCatching { container.unlockManager.recoveryReason() }.getOrNull()
                if (reason != null) {
                    accessViewModel.onRecoveryRequired(reason)
                } else {
                    accessViewModel.onError(
                        "The biometric key was invalidated. Your data is intact; try again or use the existing gate.",
                    )
                }
                accessViewModel.refresh()
            }

            is UnlockReenrollmentBlockedException -> lifecycleScope.launch {
                val configured = runCatching { container.unlockManager.isConfigured() }.getOrDefault(false)
                if (configured) {
                    accessViewModel.onError(
                        "A vault and unlock gate already exist. Unlock with the existing gate; a new gate cannot claim this vault.",
                    )
                } else {
                    accessViewModel.onRecoveryRequired(UnlockManager.RECOVERY_GATE_MISSING)
                }
                accessViewModel.refresh()
            }

            is UnlockNotAuthorizedException ->
                accessViewModel.onError("Unlock the vault with biometrics before changing its gate.")

            is UnlockNotConfiguredException -> {
                accessViewModel.onError("Secure unlock is not set up on this device.")
                accessViewModel.refresh()
            }

            is UnlockRejectedException ->
                accessViewModel.onError("Authentication failed. The vault stayed locked.")

            else -> accessViewModel.onError(failure.message ?: "Secure unlock is unavailable.")
        }
    }
}
