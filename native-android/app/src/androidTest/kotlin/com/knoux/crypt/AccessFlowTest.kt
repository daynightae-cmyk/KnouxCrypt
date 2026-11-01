package com.knoux.crypt

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.knoux.crypt.data.SettingsRepository
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented entry flow, executed on the itel S686LN.
 *
 * The app renders in the language the owner selected, so the test pins English
 * through the app's own settings repository first — otherwise the assertions
 * depend on the device locale, which is exactly the kind of hidden coupling that
 * makes a UI test fail for the wrong reason. The steps also scroll to the
 * control before clicking, so the test does not depend on where the button
 * happens to sit on a particular screen height.
 */
@RunWith(AndroidJUnit4::class)
class AccessFlowTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    @Before
    fun pinEnglish() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        runBlocking { SettingsRepository(context).setLanguage("en") }
        rule.waitUntil(timeoutMillis = 10_000) {
            rule.onAllNodesWithText("Enter").fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun splashToGuestHomeIsHonestAndNavigable() {
        rule.onNodeWithText("Enter").assertIsDisplayed().performClick()
        rule.waitUntil(timeoutMillis = 10_000) {
            rule.onAllNodesWithText("Continue as guest", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        rule.onNodeWithText("Continue as guest", substring = true).performScrollTo().performClick()
        // The honest state must exist in the tree; whether the hero line is
        // inside the visible window depends on the screen height, so the
        // assertion stays about the state, not about the viewport.
        rule.waitUntil(timeoutMillis = 10_000) {
            rule.onAllNodesWithText("Your Vault is Locked").fetchSemanticsNodes().isNotEmpty()
        }
        rule.onAllNodesWithText("Tools").onFirst().assertExists()
    }
}
