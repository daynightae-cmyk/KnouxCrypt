package com.knoux.crypt

import com.knoux.crypt.data.RotationAuthorization
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Carries a fresh biometric authorization from the Activity (which owns
 * BiometricPrompt) to the rotation screen ViewModel. The token is single-use
 * and bound to the live capability by the data layer.
 */
class RotationAuthBroker {
    private val _authorization = MutableStateFlow<RotationAuthorization?>(null)
    val authorization: StateFlow<RotationAuthorization?> = _authorization.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _requesting = MutableStateFlow(false)
    val requesting: StateFlow<Boolean> = _requesting.asStateFlow()

    fun beginRequest() {
        _error.value = null
        _requesting.value = true
    }

    fun grant(authorization: RotationAuthorization) {
        _requesting.value = false
        _error.value = null
        _authorization.value = authorization
    }

    fun fail(message: String) {
        _requesting.value = false
        _error.value = message
    }

    fun cancelRequest() {
        _requesting.value = false
    }

    fun consume(): RotationAuthorization? {
        val value = _authorization.value
        _authorization.value = null
        return value
    }

    fun clearError() {
        _error.value = null
    }
}
