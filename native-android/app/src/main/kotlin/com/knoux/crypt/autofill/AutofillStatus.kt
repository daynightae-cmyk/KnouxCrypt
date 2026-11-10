package com.knoux.crypt.autofill

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.autofill.AutofillManager

object AutofillStatus {
    fun isSupported(context: Context): Boolean =
        context.getSystemService(AutofillManager::class.java) != null

    fun isSelected(context: Context): Boolean {
        val manager = context.getSystemService(AutofillManager::class.java) ?: return false
        val expected = ComponentName(context, KnouxAutofillService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return manager.autofillServiceComponentName == expected
        }
        val value = Settings.Secure.getString(context.contentResolver, "autofill_service")
        return ComponentName.unflattenFromString(value) == expected
    }

    fun settingsIntent(context: Context): Intent {
        return Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).apply {
            data = Uri.parse("package:${context.packageName}")
        }
    }
}
