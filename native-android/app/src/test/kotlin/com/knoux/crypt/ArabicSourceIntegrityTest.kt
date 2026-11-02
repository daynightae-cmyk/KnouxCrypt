package com.knoux.crypt

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression guard for Arabic source corruption.
 *
 * TASK 39 originally shipped with literal `???? ??????` sequences where Arabic
 * text belonged. The strings were valid UTF-8 but no longer Arabic, so a simple
 * encoding check did not catch them. This test scans the real Kotlin sources:
 * - no run of two or more question marks (the corruption signature),
 * - no Unicode replacement character,
 * - every non-empty Arabic argument to `tr(...)` contains Arabic script.
 */
class ArabicSourceIntegrityTest {
    @Test
    fun sourcesKeepRealArabicText() {
        val root = findNativeRoot()
        val files = listOf(
            File(root, "app/src/main/kotlin"),
            File(root, "core/designsystem/src/main/kotlin"),
            File(root, "core/data/src/main/kotlin"),
            File(root, "core/security/src/main/kotlin"),
        ).flatMap { directory -> directory.walkTopDown().filter { it.isFile && it.extension == "kt" }.toList() }

        assertTrue("No Kotlin sources found under $root", files.size > 20)

        val problems = mutableListOf<String>()
        files.forEach { file ->
            val text = file.readText(Charsets.UTF_8)
            if (text.contains('\uFFFD')) problems += "${file.name}: replacement character"
            Regex("""\?{2,}""").findAll(text).forEach { match ->
                problems += "${file.name}:${text.lineAt(match.range.first)}: corrupted question-mark sequence"
            }
            // Arabic literals passed to tr("English", "Arabic"). Identical
            // technical tokens (StrongBox, SHA-256) are deliberately untranslated.
            Regex("""tr\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)""")
                .findAll(text)
                .forEach { match ->
                    val english = match.groupValues[1]
                    val arabic = match.groupValues[2]
                    if (
                        arabic.isNotBlank() &&
                        arabic != english &&
                        !arabic.any { it in '\u0600'..'\u06FF' }
                    ) {
                        problems += "${file.name}: tr() Arabic argument has no Arabic script: $arabic"
                    }
                }
        }

        assertTrue(
            "Arabic/source integrity failures:\n" + problems.joinToString("\n"),
            problems.isEmpty(),
        )
    }

    private fun String.lineAt(index: Int): Int = substring(0, index.coerceAtMost(length)).count { it == '\n' } + 1

    private fun findNativeRoot(): File {
        var directory: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (directory != null) {
            if (File(directory, "settings.gradle.kts").isFile && File(directory, "app").isDirectory) {
                return directory
            }
            val nested = File(directory, "native-android")
            if (File(nested, "settings.gradle.kts").isFile) return nested
            directory = directory.parentFile
        }
        error("Could not locate native-android from ${System.getProperty("user.dir")}")
    }
}
