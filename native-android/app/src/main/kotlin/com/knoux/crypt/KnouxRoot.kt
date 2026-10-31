package com.knoux.crypt

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.rememberNavController
import com.knoux.crypt.data.AppSettings
import com.knoux.crypt.design.KnouxBackground
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxTheme
import com.knoux.crypt.tr

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
    val lifecycleOwner = LocalLifecycleOwner.current
    var appSwitchMasked by remember { mutableStateOf(false) }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> appSwitchMasked = true
                Lifecycle.Event.ON_RESUME -> appSwitchMasked = false
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

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
                    // Best-effort cover for the app-switch snapshot. FLAG_SECURE
                    // remains the platform guarantee when screenshots are blocked.
                    if (appSwitchMasked && settings.maskOnAppSwitch) {
                        AppSwitchMask()
                    }
                }
            }
        }
    }
}

@Composable
private fun AppSwitchMask() {
    Box(
        Modifier
            .fillMaxSize()
            .background(KnouxColors.Obsidian)
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                "KNOUX CRYPT",
                style = MaterialTheme.typography.headlineSmall,
                color = KnouxColors.Violet,
            )
            Text(
                tr(
                    "Vault content is hidden while the app is in the background.",
                    "محتوى الخزنة محجوب أثناء وجود التطبيق في الخلفية.",
                ),
                style = MaterialTheme.typography.bodySmall,
                color = KnouxColors.Text,
                textAlign = TextAlign.Center,
            )
        }
    }
}
