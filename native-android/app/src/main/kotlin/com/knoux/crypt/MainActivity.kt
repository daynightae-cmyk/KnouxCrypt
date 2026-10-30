package com.knoux.crypt

import android.os.Bundle
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.knoux.crypt.data.UnlockKeyInvalidatedException
import com.knoux.crypt.data.UnlockNotConfiguredException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : FragmentActivity() {
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
                onRequestUnlock = ::requestSecureUnlock,
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

    private fun requestSecureUnlock(setup: Boolean) {
        if (accessViewModel.state.value.busy) return
        lifecycleScope.launch {
            accessViewModel.setBusy(true)
            val cipher = try {
                if (setup) container.unlockManager.prepareSetupCipher()
                else container.unlockManager.prepareUnlockCipher()
            } catch (_: UnlockNotConfiguredException) {
                accessViewModel.onError("Secure unlock is not set up on this device.")
                accessViewModel.refresh()
                return@launch
            } catch (_: KeyPermanentlyInvalidatedException) {
                accessViewModel.onInvalidated()
                return@launch
            } catch (failure: Exception) {
                accessViewModel.onError(failure.message ?: "Secure unlock is unavailable.")
                accessViewModel.refresh()
                return@launch
            }
            val prompt = BiometricPrompt(
                this@MainActivity,
                ContextCompat.getMainExecutor(this@MainActivity),
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        val cipherUsed = result.cryptoObject?.cipher
                        if (cipherUsed == null) {
                            accessViewModel.onError("Biometric result did not include a key cipher.")
                            return
                        }
                        lifecycleScope.launch {
                            try {
                                if (setup) container.unlockManager.completeSetup(cipherUsed)
                                else container.unlockManager.completeUnlock(cipherUsed)
                                accessViewModel.onUnlocked()
                            } catch (_: UnlockKeyInvalidatedException) {
                                accessViewModel.onInvalidated()
                            } catch (failure: Exception) {
                                accessViewModel.onError(failure.message ?: "Unlock failed.")
                            }
                        }
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        accessViewModel.onError(
                            when (errorCode) {
                                BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                                BiometricPrompt.ERROR_USER_CANCELED,
                                -> "Authentication cancelled."
                                BiometricPrompt.ERROR_LOCKOUT -> "Too many attempts. Try again later."
                                BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> "Biometric unlock is locked; guest mode remains available."
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
            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle("KNOUX Crypt")
                .setSubtitle(if (setup) "Set up secure unlock" else "Unlock your vault")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .setNegativeButtonText("Cancel")
                .setConfirmationRequired(false)
                .build()
            prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))
        }
    }
}
