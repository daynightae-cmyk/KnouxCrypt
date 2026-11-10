package com.knoux.crypt.autofill

import android.app.assist.AssistStructure
import android.view.View
import android.view.inputmethod.EditorInfo

/**
 * Extracts the fillable fields and request metadata from an AssistStructure.
 *
 * Returns null when the form is not a simple login form (for example a
 * change-password or sign-up form), so credentials are never written into the
 * wrong fields.
 */
data class AutofillForm(
    val usernameId: android.view.autofill.AutofillId?,
    val passwordId: android.view.autofill.AutofillId,
    val webDomain: String?,
    val packageName: String?,
)

object AutofillFieldParser {
    private val passwordNames = listOf("password", "passwd", "passcode")
    private val usernameNames = listOf("username", "user", "email", "login", "account")

    fun parse(structure: AssistStructure): AutofillForm? {
        val passwordIds = mutableListOf<android.view.autofill.AutofillId>()
        val usernameIds = mutableListOf<android.view.autofill.AutofillId>()
        var webDomain: String? = null
        var sawNewPassword = false

        fun visit(node: AssistStructure.ViewNode) {
            if (webDomain == null && !node.webDomain.isNullOrBlank()) webDomain = node.webDomain
            val id = node.autofillId
            if (id != null && node.visibility == View.VISIBLE &&
                node.autofillType == View.AUTOFILL_TYPE_TEXT
            ) {
                val kind = classify(node)
                when (kind) {
                    FieldKind.PASSWORD -> passwordIds += id
                    FieldKind.NEW_PASSWORD -> sawNewPassword = true
                    FieldKind.USERNAME -> usernameIds += id
                    FieldKind.NONE -> Unit
                }
            }
            for (i in 0 until node.childCount) visit(node.getChildAt(i))
        }

        for (i in 0 until structure.windowNodeCount) visit(structure.getWindowNodeAt(i).rootViewNode)

        if (sawNewPassword) return null
        if (passwordIds.size != 1) return null

        val usernameId = usernameIds.firstOrNull()
        val packageName = structure.activityComponent?.packageName
        return AutofillForm(usernameId, passwordIds.first(), webDomain, packageName)
    }

    private enum class FieldKind { PASSWORD, NEW_PASSWORD, USERNAME, NONE }

    private fun classify(node: AssistStructure.ViewNode): FieldKind {
        val hint = node.hint?.lowercase().orEmpty()
        val attrs = node.htmlInfo?.attributes?.associate { it.first.lowercase() to it.second.lowercase() } ?: emptyMap()
        val autocomplete = attrs["autocomplete"].orEmpty()
        val htmlType = attrs["type"].orEmpty()
        val idEntry = listOfNotNull(node.idEntry, node.hintIdEntry, node.textIdEntry)
            .joinToString(" ").lowercase()

        if (autocomplete.contains("new-password") || autocomplete.contains("new password")) {
            return FieldKind.NEW_PASSWORD
        }

        val isPassword = hint == View.AUTOFILL_HINT_PASSWORD ||
            htmlType == "password" ||
            autocomplete.contains("current-password") ||
            autocomplete.contains("current password") ||
            passwordNames.any { name -> idEntry.contains(name) } ||
            isPasswordInputType(node.inputType)
        if (isPassword) return FieldKind.PASSWORD

        val isUsername = hint == View.AUTOFILL_HINT_USERNAME ||
            hint == View.AUTOFILL_HINT_EMAIL_ADDRESS ||
            autocomplete.contains("username") ||
            autocomplete.contains("email") ||
            usernameNames.any { name -> idEntry.contains(name) } ||
            node.inputType and EditorInfo.TYPE_MASK_VARIATION == EditorInfo.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        if (isUsername) return FieldKind.USERNAME

        return FieldKind.NONE
    }

    private fun isPasswordInputType(inputType: Int): Boolean {
        val cls = inputType and android.text.InputType.TYPE_MASK_CLASS
        if (cls != android.text.InputType.TYPE_CLASS_TEXT) return false
        return when (inputType and android.text.InputType.TYPE_MASK_VARIATION) {
            android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD,
            android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
            android.text.InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD -> true
            else -> false
        }
    }
}
