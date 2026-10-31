package com.knoux.crypt

import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.knoux.crypt.design.KnouxTab
import com.knoux.crypt.ui.AccessScreen
import com.knoux.crypt.ui.AccountScreen
import com.knoux.crypt.ui.AuthenticatorScreen
import com.knoux.crypt.ui.FileCipherScreen
import com.knoux.crypt.ui.HashIntegrityScreen
import com.knoux.crypt.ui.HomeScreen
import com.knoux.crypt.ui.KeyDerivationScreen
import com.knoux.crypt.ui.KeyForgeScreen
import com.knoux.crypt.ui.NotesScreen
import com.knoux.crypt.ui.PasswordsScreen
import com.knoux.crypt.ui.PrivacyScreen
import com.knoux.crypt.ui.RecoveryScreen
import com.knoux.crypt.ui.SecureRandomScreen
import com.knoux.crypt.ui.SplashScreen
import com.knoux.crypt.ui.TextCipherScreen
import com.knoux.crypt.ui.ToolPlaceholderScreen
import com.knoux.crypt.ui.ToolsScreen
import com.knoux.crypt.ui.VaultKeyRotationScreen
import kotlinx.coroutines.launch

@Composable
fun KnouxNavHost(
    nav: NavHostController,
    container: AppContainer,
    accessViewModel: AccessViewModel,
    onRequestUnlock: (Boolean) -> Unit,
    onRequestGateRotation: () -> Unit,
    onRequestRotationAuth: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val lockSession: () -> Unit = { scope.launch { container.session.lock() } }

    fun openTab(tab: KnouxTab) {
        val route = when (tab) {
            KnouxTab.HOME -> "home"
            KnouxTab.TOOLS -> "tools"
            KnouxTab.ACCOUNT -> "account"
        }
        if (route == "home") {
            nav.navigate("home") {
                popUpTo("home") { inclusive = true }
                launchSingleTop = true
            }
        } else {
            nav.navigate(route) {
                popUpTo("home") { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        }
    }

    fun openService(service: ServiceDef) {
        if (service.requiresUnlock && !container.session.isUnlocked) {
            nav.navigate("access") { launchSingleTop = true }
            return
        }
        nav.navigate(Catalog.routeFor(service))
    }

    val enterHome: () -> Unit = {
        nav.navigate("home") {
            popUpTo(0) { inclusive = true }
            launchSingleTop = true
        }
    }

    NavHost(navController = nav, startDestination = "splash") {
        composable("splash") {
            SplashScreen(
                onEnter = { nav.navigate("access") { launchSingleTop = true } },
            )
        }
        composable("access") {
            AccessScreen(
                viewModel = accessViewModel,
                onRequestUnlock = onRequestUnlock,
                onGuest = enterHome,
                onUnlocked = enterHome,
            )
        }
        composable("home") {
            HomeScreen(
                container = container,
                onOpenService = ::openService,
                onSearch = { nav.navigate("tools") { launchSingleTop = true } },
                onSettings = { nav.navigate("account") { launchSingleTop = true } },
                onTab = ::openTab,
                onUnlock = { nav.navigate("access") { launchSingleTop = true } },
            )
        }
        composable("tools") {
            ToolsScreen(
                onOpenService = ::openService,
                onTab = ::openTab,
                onSettings = { nav.navigate("account") { launchSingleTop = true } },
            )
        }
        composable("account") {
            AccountScreen(
                container = container,
                accessViewModel = accessViewModel,
                onTab = ::openTab,
                onPrivacy = { nav.navigate("privacy") },
                onRotateUnlock = onRequestGateRotation,
                onKeyRotation = { nav.navigate("key_rotation") },
                onLock = lockSession,
            )
        }
        composable("file_cipher") {
            FileCipherScreen(
                container = container,
                onBack = { nav.popBackStack() },
                onNeedUnlock = { nav.navigate("access") { launchSingleTop = true } },
            )
        }
        composable("text_cipher") {
            TextCipherScreen(onBack = { nav.popBackStack() })
        }
        composable("hash") {
            HashIntegrityScreen(onBack = { nav.popBackStack() })
        }
        composable("random") {
            SecureRandomScreen(onBack = { nav.popBackStack() })
        }
        composable("notes") {
            NotesScreen(
                container = container,
                onBack = { nav.popBackStack() },
                onNeedUnlock = { nav.navigate("access") { launchSingleTop = true } },
            )
        }
        composable("passwords") {
            PasswordsScreen(
                container = container,
                onBack = { nav.popBackStack() },
                onNeedUnlock = { nav.navigate("access") { launchSingleTop = true } },
            )
        }
        composable("key_forge") {
            KeyForgeScreen(
                onBack = { nav.popBackStack() },
                onNeedUnlock = { nav.navigate("access") { launchSingleTop = true } },
                isUnlocked = container.session.isUnlocked,
            )
        }
        composable("key_derivation") {
            KeyDerivationScreen(onBack = { nav.popBackStack() })
        }
        composable("authenticator") {
            AuthenticatorScreen(
                container = container,
                onBack = { nav.popBackStack() },
                onNeedUnlock = { nav.navigate("access") { launchSingleTop = true } },
            )
        }
        composable("privacy") {
            PrivacyScreen(
                container = container,
                onBack = { nav.popBackStack() },
                onLock = lockSession,
            )
        }
        composable("key_rotation") {
            VaultKeyRotationScreen(
                container = container,
                onBack = { nav.popBackStack() },
                onNeedUnlock = { nav.navigate("access") { launchSingleTop = true } },
                onRequestRotationAuth = onRequestRotationAuth,
            )
        }
        composable("recovery") {
            RecoveryScreen(
                container = container,
                onBack = { nav.popBackStack() },
                onNeedUnlock = { nav.navigate("access") { launchSingleTop = true } },
            )
        }
        composable(
            route = "tool/{toolId}",
            arguments = listOf(navArgument("toolId") { type = NavType.StringType }),
        ) { entry ->
            val id = entry.arguments?.getString("toolId").orEmpty()
            val service = Catalog.byId(id)
            ToolPlaceholderScreen(
                service = service,
                onBack = { nav.popBackStack() },
            )
        }
    }
}
