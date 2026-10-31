package com.knoux.crypt

import android.app.Application
import androidx.biometric.BiometricManager
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.knoux.crypt.data.SessionManager
import com.knoux.crypt.data.UnlockManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AccessUiState(
    val checked: Boolean = false,
    val configured: Boolean = false,
    val strongBiometric: Boolean = false,
    val busy: Boolean = false,
    val message: String? = null,
    val unlocked: Boolean = false,
    val recoveryRequired: Boolean = false,
    val recoveryCode: String? = null,
)

class AccessViewModel(
    application: Application,
    private val unlockManager: UnlockManager,
    private val session: SessionManager,
) : AndroidViewModel(application) {
    private val _state = MutableStateFlow(AccessUiState())
    val state: StateFlow<AccessUiState> = _state.asStateFlow()

    fun refresh() {
        viewModelScope.launch {
            val configured = runCatching { unlockManager.isConfigured() }.getOrDefault(false)
            val reason = runCatching { unlockManager.recoveryReason() }.getOrNull()
            val existingVault = runCatching { unlockManager.hasExistingVault() }.getOrDefault(false)
            val biometric = BiometricManager.from(getApplication())
                .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) ==
                BiometricManager.BIOMETRIC_SUCCESS
            val recovery = reason != null || (!configured && existingVault)
            _state.update {
                it.copy(
                    checked = true,
                    configured = configured,
                    strongBiometric = biometric,
                    unlocked = session.isUnlocked,
                    recoveryRequired = recovery,
                    recoveryCode = reason
                        ?: if (!configured && existingVault) UnlockManager.RECOVERY_GATE_MISSING else null,
                )
            }
        }
    }

    fun setBusy(busy: Boolean) = _state.update { it.copy(busy = busy) }

    fun onUnlocked() = _state.update {
        it.copy(
            busy = false,
            unlocked = true,
            configured = true,
            message = null,
            recoveryRequired = false,
            recoveryCode = null,
        )
    }

    fun onGateRotated() = _state.update {
        it.copy(
            busy = false,
            message = "Secure unlock gate replaced after biometric verification. The vault key and records were not changed.",
            recoveryRequired = false,
            recoveryCode = null,
        )
    }

    fun onError(message: String) = _state.update { it.copy(busy = false, message = message) }

    fun onRecoveryRequired(code: String) = _state.update {
        it.copy(
            busy = false,
            recoveryRequired = true,
            recoveryCode = code,
            message = null,
        )
    }

    fun consumeUnlocked() = _state.update { it.copy(unlocked = false) }
    fun clearMessage() = _state.update { it.copy(message = null) }
}

fun <VM : ViewModel> viewModelFactory(create: () -> VM): ViewModelProvider.Factory =
    object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T = create() as T
    }
