package com.knoux.crypt

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.rememberNavController
import com.knoux.crypt.data.AppSettings
import com.knoux.crypt.design.KnouxBackground
import com.knoux.crypt.design.KnouxTheme

@Composable
fun KnouxRoot(
    container: AppContainer,
    accessViewModel: AccessViewModel,
    onRequestUnlock: (Boolean) -> Unit,
    onRequestGateRotation: () -> Unit,
    onRequestRotationAuth: () -> Unit,
) {
    val settings by container.settings.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    val unlocked by container.session.unlocked.collectAsStateWithLifecycle()
    val direction = if (settings.language == "ar") LayoutDirection.Rtl else LayoutDirection.Ltr

    KnouxTheme(reducedMotion = settings.reducedMotion) {
        CompositionLocalProvider(
            LocalLanguage provides settings.language,
            LocalLayoutDirection provides direction,
        ) {
            KnouxBackground(reducedMotion = settings.reducedMotion) {
                val nav = rememberNavController()
                LaunchedEffect(unlocked) {
                    if (!unlocked) {
                        val route = nav.currentDestination?.route
                        if (route != null && route != "splash" && route != "access") {
                            nav.navigate("access") {
                                popUpTo(0) { inclusive = true }
                                launchSingleTop = true
                            }
                        }
                    }
                }
                Box(Modifier.fillMaxSize()) {
                    KnouxNavHost(
                        nav = nav,
                        container = container,
                        accessViewModel = accessViewModel,
                        onRequestUnlock = onRequestUnlock,
                        onRequestGateRotation = onRequestGateRotation,
                        onRequestRotationAuth = onRequestRotationAuth,
                    )
                }
            }
        }
    }
}
