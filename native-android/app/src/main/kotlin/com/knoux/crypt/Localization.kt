package com.knoux.crypt

import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.staticCompositionLocalOf

val LocalLanguage = staticCompositionLocalOf { "en" }

@Composable
fun tr(english: String, arabic: String): String = if (LocalLanguage.current == "ar") arabic else english

@Composable
fun isArabic(): Boolean = LocalLanguage.current == "ar"

/** Localized strings that are needed outside composition (navigation labels). */
fun trFor(language: String, english: String, arabic: String): String = if (language == "ar") arabic else english
