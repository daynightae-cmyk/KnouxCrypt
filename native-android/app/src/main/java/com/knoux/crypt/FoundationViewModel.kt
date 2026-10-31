package com.knoux.crypt

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.knoux.crypt.security.SessionPolicy
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

// Explicit constructor DI: Android adapters and session policy stay outside UI state.
class AppContainer {
    private val policy = SessionPolicy(debugPreviewAllowed = BuildConfig.DEBUG)
    val factory: ViewModelProvider.Factory = object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass == FoundationViewModel::class.java)
            return FoundationViewModel(policy) as T
        }
    }
}
class FoundationViewModel(private val policy: SessionPolicy) : ViewModel() {
    private val mutablePreview = MutableStateFlow(false)
    val preview = mutablePreview.asStateFlow()
    fun enterPreview() {
        mutablePreview.value = policy.enterGuestPreview()
    }
    fun lock() {
        policy.lock()
        mutablePreview.value = false
    }
}
