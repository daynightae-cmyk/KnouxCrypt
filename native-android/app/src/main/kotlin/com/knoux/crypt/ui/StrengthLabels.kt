package com.knoux.crypt.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.security.StrengthLevel
import com.knoux.crypt.tr

/**
 * Shared rendering of the offline strength model's outcome, so the audit screen
 * and the credential detail screen describe a value the same way in both
 * languages.
 */
@Composable
internal fun levelLabel(level: StrengthLevel): String = when (level) {
    StrengthLevel.EMPTY -> tr("No secret stored", "لا يوجد سر مخزن")
    StrengthLevel.VERY_WEAK -> tr("Very weak", "ضعيفة جدًا")
    StrengthLevel.WEAK -> tr("Weak", "ضعيفة")
    StrengthLevel.FAIR -> tr("Fair", "مقبولة")
    StrengthLevel.STRONG -> tr("Strong", "قوية")
    StrengthLevel.EXCELLENT -> tr("Excellent", "قوية جدًا")
}

internal fun levelColor(level: StrengthLevel): Color = when (level) {
    StrengthLevel.EMPTY, StrengthLevel.VERY_WEAK -> KnouxColors.Alert
    StrengthLevel.WEAK, StrengthLevel.FAIR -> KnouxColors.Warn
    StrengthLevel.STRONG, StrengthLevel.EXCELLENT -> KnouxColors.Success
}
