package com.knoux.crypt

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Instrumented entry flow. NOT RUN in this session: no device or emulator was available. */
@RunWith(AndroidJUnit4::class)
class AccessFlowTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun splashToGuestHomeIsHonestAndNavigable() {
        rule.onNodeWithText("Enter").assertIsDisplayed().performClick()
        rule.onNodeWithText("Continue as guest", substring = true).assertIsDisplayed().performClick()
        rule.onNodeWithText("Your Vault is Locked").assertIsDisplayed()
        rule.onAllNodesWithText("Tools").onFirst().assertIsDisplayed()
    }
}
