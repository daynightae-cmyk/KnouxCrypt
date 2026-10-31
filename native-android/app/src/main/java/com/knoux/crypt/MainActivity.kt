package com.knoux.crypt

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.*

class MainActivity : ComponentActivity() {
    private val container = AppContainer()
    private val model: FoundationViewModel by viewModels { container.factory }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(
                primary = Color(0xffbc86f3), background = Color(0xff080411),
                surface = Color(0xff1c0d2c), onBackground = Color(0xfff4edff),
                onSurface = Color(0xfff4edff)
            )) { FoundationNavigation(model) }
        }
    }
    override fun onStop() {
        model.lock() // No persisted unlock/preview; returning must explicitly re-enter.
        super.onStop()
    }
}
@Composable
private fun FoundationNavigation(model: FoundationViewModel) {
    val nav = rememberNavController()
    val preview by model.preview.collectAsStateWithLifecycle()
    NavHost(navController = nav, startDestination = "entry") {
        composable("entry") {
            FoundationPanel(stringResource(R.string.foundation_title)) {
                Text(stringResource(R.string.foundation_notice))
                Button(onClick = { nav.navigate("access") { launchSingleTop = true } }) {
                    Text(stringResource(R.string.enter))
                }
            }
        }
        composable("access") {
            FoundationPanel(stringResource(R.string.auth_title)) {
                Text(stringResource(R.string.auth_unavailable))
                // Compiled-out route action in release, never an authentication bypass.
                if (BuildConfig.DEBUG) Button(onClick = {
                    model.enterPreview()
                    nav.navigate("preview") { launchSingleTop = true }
                }) { Text(stringResource(R.string.preview)) }
            }
        }
        composable("preview") {
            LaunchedEffect(preview) {
                if (!preview) nav.navigate("access") {
                    popUpTo("entry")
                    launchSingleTop = true
                }
            }
            if (preview && BuildConfig.DEBUG) FoundationPanel(stringResource(R.string.home_preview)) {
                Text(stringResource(R.string.foundation_notice))
                Button(onClick = {
                    model.lock()
                    nav.navigate("entry") { popUpTo("entry") { inclusive = true } }
                }) { Text(stringResource(R.string.back)) }
            }
        }
    }
}
@Composable
private fun FoundationPanel(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)
        .safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Text(title, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onBackground)
        content()
    }
}
