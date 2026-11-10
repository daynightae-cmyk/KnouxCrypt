package com.knoux.crypt.autofill

import android.app.assist.AssistStructure
import android.content.Context
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import com.knoux.crypt.R
import com.knoux.crypt.KnouxApplication
import com.knoux.crypt.data.SecretKinds
import com.knoux.crypt.data.SecretsJson
import com.knoux.crypt.data.VaultLockedException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Real Android Autofill service.
 *
 * Suggestions come from the encrypted password store and are only offered while
 * the KNOUX vault session is unlocked. The service never captures or saves a
 * form, and it never touches the network.
 */
class KnouxAutofillService : AutofillService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback,
    ) {
        val context = this
        val structure = request.fillContexts.lastOrNull()?.structure
        if (structure == null) {
            if (!cancellationSignal.isCanceled) callback.onSuccess(null)
            return
        }
        val form = AutofillFieldParser.parse(structure)
        if (form == null) {
            if (!cancellationSignal.isCanceled) callback.onSuccess(null)
            return
        }

        val container = (application as? KnouxApplication)?.container
        val access = container?.session?.currentAccess()
        if (container == null || access == null) {
            if (!cancellationSignal.isCanceled) callback.onSuccess(null)
            return
        }

        serviceScope.launch {
            val response = runCatching {
                val records = container.secrets.list(access, SecretKinds.PASSWORD)
                val credentials = records.mapNotNull { record ->
                    val payload = SecretsJson.decodePassword(record.payloadJson) ?: return@mapNotNull null
                    if (payload.password.isBlank()) return@mapNotNull null
                    AutofillCredential(record.id, payload.title, payload.username, payload.password, payload.url)
                }
                val query = AutofillMatcher.buildQuery(form.webDomain, form.packageName)
                val suggestions = AutofillMatcher.suggestions(credentials, query)
                buildResponse(context, form, suggestions)
            }.getOrNull()

            if (cancellationSignal.isCanceled) return@launch
            withContext(Dispatchers.Main) {
                if (!cancellationSignal.isCanceled) callback.onSuccess(response)
            }
        }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        // KNOUX Crypt never captures or stores credentials from an autofill form.
        callback.onSuccess()
    }

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }

    private fun buildResponse(
        context: Context,
        form: AutofillForm,
        suggestions: List<AutofillCredential>,
    ): FillResponse? {
        if (suggestions.isEmpty()) return null
        val builder = FillResponse.Builder()
        for (credential in suggestions) {
            val presentation = buildPresentation(context, credential)
            val datasetBuilder = Dataset.Builder(presentation)
            if (form.usernameId != null && credential.username.isNotBlank()) {
                datasetBuilder.setValue(
                    form.usernameId,
                    AutofillValue.forText(credential.username),
                    presentation,
                )
            }
            datasetBuilder.setValue(
                form.passwordId,
                AutofillValue.forText(credential.password),
                presentation,
            )
            builder.addDataset(datasetBuilder.build())
        }
        return builder.build()
    }

    private fun buildPresentation(context: Context, credential: AutofillCredential): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.autofill_dataset)
        val title = credential.title.ifBlank { context.getString(R.string.app_name) }
        views.setTextViewText(R.id.autofill_title, title)
        val subtitle = credential.username.ifBlank { "KNOUX Crypt" }
        views.setTextViewText(R.id.autofill_subtitle, subtitle)
        return views
    }
}
