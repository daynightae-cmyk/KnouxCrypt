package com.knoux.crypt

import androidx.compose.ui.test.assertDoesNotExist
import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Written but not executed in the remote sandbox: SDK/device unavailable. */
@RunWith(AndroidJUnit4::class)
class FoundationNavigationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun previewRequiresExplicitDebugEntry() {
        fun text(id: Int) = compose.activity.getString(id)
        compose.onNodeWithText(text(R.string.home_preview)).assertDoesNotExist()
        compose.onNodeWithText(text(R.string.enter)).performClick()
        compose.onNodeWithText(text(R.string.auth_unavailable)).assertExists()
        compose.onNodeWithText(text(R.string.preview)).performClick()
        compose.onNodeWithText(text(R.string.home_preview)).assertExists()
        compose.onNodeWithText(text(R.string.back)).performClick()
        compose.onNodeWithText(text(R.string.foundation_title)).assertExists()
    }
}
