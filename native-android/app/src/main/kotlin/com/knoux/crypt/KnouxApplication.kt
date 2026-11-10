package com.knoux.crypt

import android.app.Application

/**
 * Process-wide owner of the single [AppContainer].
 *
 * The container holds the in-memory [SessionManager], so MainActivity and
 * [autofill.KnouxAutofillService] must use the same instance. A service
 * started in a fresh process therefore sees a locked session and offers no
 * suggestions, which is the honest behavior.
 */
class KnouxApplication : Application() {
    val container: AppContainer by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        AppContainer(this)
    }
}
