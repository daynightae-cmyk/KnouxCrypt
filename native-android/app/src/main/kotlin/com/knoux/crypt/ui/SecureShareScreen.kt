package com.knoux.crypt.ui

import android.Manifest
import android.app.Application
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.AddRecipientOutcome
import com.knoux.crypt.data.ReceiveOutcome
import com.knoux.crypt.data.SealOutcome
import com.knoux.crypt.data.ShareFailure
import com.knoux.crypt.data.ShareRecipientView
import com.knoux.crypt.data.ShareReceiptPayload
import com.knoux.crypt.data.ShareService
import com.knoux.crypt.data.VaultLockedException
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.KnouxTextField
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.security.SecureSharePackage
import com.knoux.crypt.isArabic
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class ShareTab { SEND, RECEIVE, KEYS }

enum class ShareExpiry(val millis: Long) {
    NONE(0L),
    ONE_HOUR(3_600_000L),
    ONE_DAY(86_400_000L),
    ONE_WEEK(604_800_000L),
}

/** Failures the share flow can name, in both languages. */
enum class ShareError(val labelEn: String, val labelAr: String) {
    NO_RECIPIENTS("Choose at least one recipient.", "اختر مستلمًا واحدًا على الأقل."),
    UNVERIFIED("Verify the recipient fingerprint before sealing.", "تحقق من بصمة المستلم قبل الإغلاق."),
    BAD_KEY("That key cannot receive a share package.", "هذا المفتاح لا يمكنه استلام حزمة مشاركة."),
    BAD_REQUEST("The package settings are not valid.", "إعدادات الحزمة غير صالحة."),
    IDENTITY("No usable sharing identity is available on this device.", "لا توجد هوية مشاركة صالحة على هذا الجهاز."),
    NOT_FOR_YOU("This package was sealed for a different key.", "هذه الحزمة مغلقة لمفتاح مختلف."),
    TAMPERED("The package did not authenticate. Nothing was written.", "لم تثبت الحزمة صحتها، ولم يُكتب أي شيء."),
    NOT_A_PACKAGE("This file is not a KNOUX share package.", "هذا الملف ليس حزمة مشاركة KNOUX."),
    EXPIRED("The expiry label has passed, so the content stays sealed.", "انتهت مدة الصلاحية، لذا بقي المحتوى مغلقًا."),
    INPUT("The selected file could not be read.", "تعذرت قراءة الملف المحدد."),
    OUTPUT("The destination could not be written.", "تعذرت الكتابة إلى الوجهة."),
    LOCKED("Unlock the vault to use Secure Share.", "افتح الخزنة لاستخدام المشاركة الآمنة."),
    DENIED("Camera permission is required to scan a key.", "الإذن بالكاميرا مطلوب لمسح رمز المفتاح."),
}

/** Honest outcomes that are not failures. */
enum class ShareNotice(val labelEn: String, val labelAr: String) {
    CANCELLED("Cancelled. Nothing was shared.", "أُلغيت العملية، ولم تُشارك أي شيء."),
    SEALED("The package is sealed and ready to hand off.", "الحزمة مغلقة وجاهزة للتسليم."),
    EXPORTED("The sealed package was saved where you chose.", "حُفظت الحزمة المغلقة في المكان الذي اخترته."),
    SHARED("The sealed package was handed to the Android Sharesheet.", "سُلّمت الحزمة المغلقة إلى قائمة مشاركة أندرويد."),
    OPENED("The package authenticated and was written where you chose.", "ثبتت صحة الحزمة وكُتبت في المكان الذي اخترته."),
    RECIPIENT_ADDED("Recipient key stored. Its fingerprint still needs verifying.", "حُفظ مفتاح المستلم، وما زالت بصمته بحاجة إلى تحقق."),
    DUPLICATE("That recipient key is already stored.", "مفتاح هذا المستلم محفوظ مسبقًا."),
    VERIFIED("Fingerprint confirmed. This recipient can now be sealed to.", "تمت مطابقة البصمة، ويمكن الإغلاق لهذا المستلم."),
}

/** One message type for both kinds, so the UI never renders a raw platform string. */
data class ShareMessage(
    val error: ShareError? = null,
    val notice: ShareNotice? = null,
    val detail: String? = null,
)

data class IncomingPackage(
    val uri: Uri,
    val summary: SecureSharePackage.Summary,
    val displayName: String,
)

data class SealedPackage(
    val displayName: String,
    val packageIdHex: String,
    val digestHex: String,
    val packageBytes: Long,
    val plaintextBytes: Long,
    val receiptId: String,
    val recipientCount: Int,
)

data class SecureShareUiState(
    val tab: ShareTab = ShareTab.SEND,
    val unlocked: Boolean = false,
    val inputUri: Uri? = null,
    val inputName: String = "",
    val inputSize: Long? = null,
    val recipients: List<ShareRecipientView> = emptyList(),
    val selected: Set<String> = emptySet(),
    val expiry: ShareExpiry = ShareExpiry.NONE,
    val note: String = "",
    val senderLabel: String = "KNOUX",
    val busy: Boolean = false,
    val progress: Float = 0f,
    val sealed: SealedPackage? = null,
    val incoming: IncomingPackage? = null,
    val opened: ReceiveOutcome.Opened? = null,
    val identityFingerprint: String = "",
    val identityUri: String = "",
    val receipts: List<ShareReceiptPayload> = emptyList(),
    val message: ShareMessage? = null,
    val notice: ShareMessage? = null,
)

class SecureShareViewModel(application: Application, private val container: AppContainer) :
    AndroidViewModel(application) {

    private val _state = MutableStateFlow(SecureShareUiState())
    val state: StateFlow<SecureShareUiState> = _state.asStateFlow()
    private var job: Job? = null
    private var sealedFile: File? = null
    private var openedTemp: File? = null

    init {
        // A lock must end any in-flight package and remove every plaintext copy
        // this screen created, not just hide the UI.
        container.session.addOnLockListener {
            job?.cancel()
            job = null
            deleteQuietly(sealedFile)
            deleteQuietly(openedTemp)
            sealedFile = null
            openedTemp = null
            _state.update {
                it.copy(
                    unlocked = false,
                    busy = false,
                    progress = 0f,
                    sealed = null,
                    incoming = null,
                    opened = null,
                    recipients = emptyList(),
                    receipts = emptyList(),
                    selected = emptySet(),
                    identityFingerprint = "",
                    identityUri = "",
                    message = ShareMessage(error = ShareError.LOCKED),
                )
            }
        }
    }

    fun selectTab(tab: ShareTab) = _state.update { it.copy(tab = tab, message = null, notice = null) }
    fun setExpiry(expiry: ShareExpiry) = _state.update { it.copy(expiry = expiry) }
    fun setNote(note: String) = _state.update { it.copy(note = note.take(ShareService.MAX_NOTE_CHARS)) }
    fun setSenderLabel(label: String) = _state.update { it.copy(senderLabel = label.take(60)) }
    fun clearMessages() = _state.update { it.copy(message = null, notice = null) }

    fun toggleRecipient(id: String) = _state.update { current ->
        val verified = current.recipients.firstOrNull { it.id == id }?.verified == true
        if (!verified) current
        else current.copy(selected = if (id in current.selected) current.selected - id else current.selected + id)
    }

    /** Binds the vault flows while the session is open; call again after unlocking. */
    fun attach() {
        val access = container.session.currentAccess()
        if (access == null) {
            _state.update { it.copy(unlocked = false) }
            return
        }
        _state.update { it.copy(unlocked = true) }
        viewModelScope.launch {
            runCatching { container.share.observeRecipients(access).collect { rows ->
                _state.update { current ->
                    current.copy(
                        recipients = rows,
                        selected = current.selected.filter { id -> rows.any { it.id == id && it.verified } }.toSet(),
                    )
                }
            } }
        }
        viewModelScope.launch {
            runCatching { container.share.observeReceipts(access).collect { rows ->
                _state.update { it.copy(receipts = rows) }
            } }
        }
        refreshIdentity()
    }

    fun refreshIdentity() {
        val access = container.session.currentAccess() ?: return
        viewModelScope.launch {
            runCatching {
                val payload = container.share.identity(access)
                payload.fingerprint to container.share.identityUri(access, _state.value.senderLabel)
            }.onSuccess { (fingerprint, uri) ->
                _state.update { it.copy(identityFingerprint = fingerprint, identityUri = uri) }
            }.onFailure { failure ->
                if (failure !is VaultLockedException) {
                    _state.update { it.copy(message = ShareMessage(error = ShareError.IDENTITY)) }
                }
            }
        }
    }

    // --- sending ------------------------------------------------------------

    fun pickInput(uri: Uri?) {
        if (uri == null) return
        val app = getApplication<Application>()
        viewModelScope.launch {
            var name: String? = null
            var size: Long? = null
            runCatching {
                app.contentResolver.query(
                    uri,
                    arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
                    null,
                    null,
                    null,
                )?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                        if (nameIndex >= 0) name = cursor.getString(nameIndex)
                        if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
                    }
                }
            }
            _state.update {
                it.copy(
                    inputUri = uri,
                    inputName = name ?: "selected file",
                    inputSize = size,
                    sealed = null,
                    message = null,
                    notice = null,
                )
            }
            deleteQuietly(sealedFile)
            sealedFile = null
        }
    }

    fun clearInput() {
        _state.update { it.copy(inputUri = null, inputName = "", inputSize = null, sealed = null, progress = 0f) }
        deleteQuietly(sealedFile)
        sealedFile = null
    }

    fun suggestedShareName(): String =
        _state.value.inputName.substringBeforeLast('.').ifBlank { "knoux-share" } + ".knoxshare"

    fun cancel() {
        job?.cancel()
        job = null
        deleteQuietly(sealedFile)
        sealedFile = null
        _state.update { it.copy(busy = false, progress = 0f, notice = ShareMessage(notice = ShareNotice.CANCELLED)) }
    }

    /** Seals the chosen file to the chosen verified recipients. Ciphertext only leaves. */
    fun seal() {
        val current = _state.value
        val access = container.session.currentAccess()
        if (access == null) {
            _state.update { it.copy(message = ShareMessage(error = ShareError.LOCKED)) }
            return
        }
        val input = current.inputUri
        val length = current.inputSize
        if (input == null || length == null) {
            _state.update { it.copy(message = ShareMessage(error = ShareError.INPUT)) }
            return
        }
        if (current.selected.isEmpty()) {
            _state.update { it.copy(message = ShareMessage(error = ShareError.NO_RECIPIENTS)) }
            return
        }
        val app = getApplication<Application>()
        job?.cancel()
        job = viewModelScope.launch {
            _state.update { it.copy(busy = true, progress = 0f, message = null, notice = null, sealed = null) }
            val target = File(sharesDir(app), "share-${UUID.randomUUID()}.knoxshare")
            try {
                val outcome = withContext(Dispatchers.IO) {
                    app.contentResolver.openInputStream(input).use { source ->
                        if (source == null) {
                            SealOutcome.Rejected(ShareFailure.BAD_REQUEST, "unreadable input")
                        } else {
                            FileOutputStream(target).use { sink ->
                                container.share.seal(
                                    access = access,
                                    input = source,
                                    output = sink,
                                    recipientIds = current.selected.toList(),
                                    fileName = current.inputName,
                                    mimeType = app.contentResolver.getType(input) ?: "application/octet-stream",
                                    note = current.note,
                                    senderLabel = current.senderLabel,
                                    plaintextLength = length,
                                    expiresAt = current.expiry.millis.takeIf { it > 0L }
                                        ?.let { System.currentTimeMillis() + it },
                                    onProgress = { progress ->
                                        _state.update { it.copy(progress = progress.fraction) }
                                    },
                                )
                            }
                        }
                    }
                }
                when (outcome) {
                    is SealOutcome.Sealed -> {
                        sealedFile = target
                        _state.update {
                            it.copy(
                                busy = false,
                                progress = 1f,
                                sealed = SealedPackage(
                                    displayName = current.inputName,
                                    packageIdHex = outcome.packageIdHex,
                                    digestHex = outcome.digestHex,
                                    packageBytes = outcome.packageBytes,
                                    plaintextBytes = outcome.plaintextBytes,
                                    receiptId = outcome.receiptId,
                                    recipientCount = outcome.recipientCount,
                                ),
                                notice = ShareMessage(notice = ShareNotice.SEALED),
                            )
                        }
                    }

                    is SealOutcome.Rejected -> {
                        deleteQuietly(target)
                        _state.update { it.copy(busy = false, progress = 0f, message = outcome.toMessage()) }
                    }
                }
            } catch (failure: VaultLockedException) {
                deleteQuietly(target)
                _state.update { it.copy(busy = false, progress = 0f, message = ShareMessage(error = ShareError.LOCKED)) }
            } catch (failure: CancellationException) {
                deleteQuietly(target)
                _state.update { it.copy(busy = false, progress = 0f, notice = ShareMessage(notice = ShareNotice.CANCELLED)) }
                throw failure
            } catch (failure: IOException) {
                deleteQuietly(target)
                _state.update { it.copy(busy = false, progress = 0f, message = ShareMessage(error = ShareError.INPUT)) }
            }
        }
    }

    /** Copies the sealed package to a document the user chooses. */
    fun exportSealedTo(uri: Uri?) {
        val sealed = _state.value.sealed
        val source = sealedFile?.takeIf { it.exists() }
        if (uri == null || sealed == null || source == null) {
            _state.update { it.copy(message = ShareMessage(error = ShareError.OUTPUT)) }
            return
        }
        val app = getApplication<Application>()
        viewModelScope.launch {
            _state.update { it.copy(busy = true, message = null) }
            val copied = withContext(Dispatchers.IO) {
                runCatching {
                    app.contentResolver.openOutputStream(uri, "w").use { sink ->
                        requireNotNull(sink).use { output ->
                            source.inputStream().use { it.copyTo(output, 64 * 1024) }
                        }
                    }
                }.isSuccess
            }
            if (copied) {
                markDelivery(sealed.receiptId, "exported")
            }
            _state.update {
                it.copy(
                    busy = false,
                    message = if (copied) null else ShareMessage(error = ShareError.OUTPUT),
                    notice = if (copied) ShareMessage(notice = ShareNotice.EXPORTED) else it.notice,
                )
            }
        }
    }

    /**
     * Builds the Sharesheet intent for the sealed package. The grant covers one
     * read of one ciphertext file in `cache/shares`; plaintext is never handed to
     * an Intent, and a package whose header is not KSR1 is refused.
     */
    fun shareIntent(): Intent? {
        val path = sealedFile?.takeIf { it.exists() } ?: return null
        val app = getApplication<Application>()
        val magic = runCatching {
            FileInputStream(path).use { stream -> ByteArray(4).also { read -> stream.read(read) } }
        }.getOrNull() ?: return null
        if (String(magic, Charsets.US_ASCII) != "KSR1") return null
        val uri = FileProvider.getUriForFile(app, "${app.packageName}.fileprovider", path)
        return Intent(Intent.ACTION_SEND).apply {
            type = "application/octet-stream"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    fun markShared() {
        val receiptId = _state.value.sealed?.receiptId ?: return
        markDelivery(receiptId, "sharesheet")
        _state.update { it.copy(notice = ShareMessage(notice = ShareNotice.SHARED)) }
    }

    private fun markDelivery(receiptId: String, delivery: String) {
        val access = container.session.currentAccess() ?: return
        viewModelScope.launch { runCatching { container.share.markDelivery(access, receiptId, delivery) } }
    }

    // --- receiving ----------------------------------------------------------

    fun pickIncoming(uri: Uri?) {
        if (uri == null) return
        val app = getApplication<Application>()
        viewModelScope.launch {
            _state.update { it.copy(busy = true, message = null, notice = null, opened = null, incoming = null) }
            val parsed = withContext(Dispatchers.IO) {
                runCatching {
                    val name = runCatching {
                        app.contentResolver.query(
                            uri,
                            arrayOf(OpenableColumns.DISPLAY_NAME),
                            null,
                            null,
                            null,
                        )?.use { cursor ->
                            if (cursor.moveToFirst() && cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME) >= 0) {
                                cursor.getString(0)
                            } else {
                                null
                            }
                        }
                    }.getOrNull()
                    app.contentResolver.openInputStream(uri).use { source ->
                        requireNotNull(source) { "unreadable" }
                        container.share.summarize(source) to (name ?: "received package")
                    }
                }
            }
            val ok = parsed.getOrNull()
            _state.update {
                it.copy(
                    busy = false,
                    incoming = ok?.let { (summary, name) -> IncomingPackage(uri, summary, name) },
                    message = if (ok == null) {
                        ShareMessage(error = ShareError.NOT_A_PACKAGE)
                    } else {
                        null
                    },
                )
            }
        }
    }

    fun suggestedOutputName(): String =
        (_state.value.incoming?.displayName?.substringBeforeLast('.') ?: "knoux-decrypted").ifBlank { "knoux-decrypted" }

    fun openIncomingTo(uri: Uri?) {
        val incoming = _state.value.incoming
        if (uri == null || incoming == null) {
            _state.update { it.copy(message = ShareMessage(error = ShareError.OUTPUT)) }
            return
        }
        val access = container.session.currentAccess()
        if (access == null) {
            _state.update { it.copy(message = ShareMessage(error = ShareError.LOCKED)) }
            return
        }
        val app = getApplication<Application>()
        job?.cancel()
        job = viewModelScope.launch {
            _state.update { it.copy(busy = true, progress = 0f, message = null, notice = null) }
            val temp = File(app.cacheDir, "knx-open-${UUID.randomUUID()}.tmp")
            openedTemp = temp
            try {
                val outcome = withContext(Dispatchers.IO) {
                    app.contentResolver.openInputStream(incoming.uri).use { source ->
                        FileOutputStream(temp).use { sink ->
                            container.share.open(access, requireNotNull(source), sink) { progress ->
                                _state.update { it.copy(progress = progress.fraction) }
                            }
                        }
                    }
                }
                if (outcome is ReceiveOutcome.Opened) {
                    val copied = withContext(Dispatchers.IO) {
                        runCatching {
                            app.contentResolver.openOutputStream(uri, "w").use { sink ->
                                requireNotNull(sink).use { output ->
                                    temp.inputStream().use { it.copyTo(output, 64 * 1024) }
                                }
                            }
                        }.isSuccess
                    }
                    deleteQuietly(temp)
                    openedTemp = null
                    _state.update {
                        it.copy(
                            busy = false,
                            progress = if (copied) 1f else 0f,
                            opened = if (copied) outcome else null,
                            message = if (copied) null else ShareMessage(error = ShareError.OUTPUT),
                            notice = if (copied) ShareMessage(notice = ShareNotice.OPENED) else null,
                        )
                    }
                } else {
                    deleteQuietly(temp)
                    openedTemp = null
                    _state.update {
                        it.copy(
                            busy = false,
                            progress = 0f,
                            message = outcome.toMessage(),
                        )
                    }
                }
            } catch (failure: VaultLockedException) {
                deleteQuietly(temp)
                _state.update { it.copy(busy = false, message = ShareMessage(error = ShareError.LOCKED)) }
            } catch (failure: CancellationException) {
                deleteQuietly(temp)
                _state.update { it.copy(busy = false, notice = ShareMessage(notice = ShareNotice.CANCELLED)) }
                throw failure
            } catch (failure: IOException) {
                deleteQuietly(temp)
                _state.update { it.copy(busy = false, message = ShareMessage(error = ShareError.INPUT)) }
            }
        }
    }

    // --- keys ---------------------------------------------------------------

    fun addRecipient(label: String, keyText: String) {
        val access = container.session.currentAccess()
        if (access == null) {
            _state.update { it.copy(message = ShareMessage(error = ShareError.LOCKED)) }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(busy = true) }
            val outcome = runCatching { container.share.addRecipient(access, label, keyText) }
            _state.update { it.copy(busy = false) }
            when {
                outcome.isFailure -> {
                    val failure = outcome.exceptionOrNull()
                    if (failure is VaultLockedException) {
                        _state.update { it.copy(message = ShareMessage(error = ShareError.LOCKED)) }
                    }
                }

                outcome.getOrNull() is AddRecipientOutcome.Added ->
                    _state.update { it.copy(notice = ShareMessage(notice = ShareNotice.RECIPIENT_ADDED), message = null) }

                outcome.getOrNull() is AddRecipientOutcome.Duplicate ->
                    _state.update {
                        it.copy(
                            notice = ShareMessage(
                                notice = ShareNotice.DUPLICATE,
                                detail = (outcome.getOrNull() as AddRecipientOutcome.Duplicate).existingLabel,
                            ),
                        )
                    }

                else -> {
                    val rejected = outcome.getOrNull() as AddRecipientOutcome.Rejected
                    _state.update {
                        it.copy(
                            message = ShareMessage(
                                error = if (rejected.failure == ShareFailure.BAD_RECIPIENT_KEY) {
                                    ShareError.BAD_KEY
                                } else {
                                    ShareError.BAD_REQUEST
                                },
                                detail = rejected.detail,
                            ),
                        )
                    }
                }
            }
        }
    }

    /**
     * Confirms a recipient only when the typed fingerprint equals the stored one,
     * so a confirmation cannot be attached without the out-of-band value.
     */
    fun confirmRecipient(id: String, typedFingerprint: String) {
        val access = container.session.currentAccess() ?: return
        viewModelScope.launch {
            val ok = runCatching { container.share.confirmRecipient(access, id, typedFingerprint) }
                .getOrDefault(false)
            _state.update {
                if (ok) {
                    it.copy(notice = ShareMessage(notice = ShareNotice.VERIFIED), message = null)
                } else {
                    it.copy(message = ShareMessage(error = ShareError.UNVERIFIED))
                }
            }
        }
    }

    fun removeRecipient(id: String) {
        val access = container.session.currentAccess() ?: return
        viewModelScope.launch {
            runCatching { container.share.removeRecipient(access, id) }
            _state.update { it.copy(selected = it.selected - id) }
        }
    }

    override fun onCleared() {
        job?.cancel()
        deleteQuietly(sealedFile)
        deleteQuietly(openedTemp)
        super.onCleared()
    }

    private fun sharesDir(app: Application): File =
        File(app.cacheDir, "shares").apply { mkdirs() }

    private fun deleteQuietly(file: File?) {
        runCatching { file?.delete() }
    }
}

private fun SealOutcome.Rejected.toMessage(): ShareMessage = when (failure) {
    ShareFailure.NO_RECIPIENTS -> ShareMessage(error = ShareError.NO_RECIPIENTS)
    ShareFailure.UNVERIFIED_RECIPIENTS -> ShareMessage(error = ShareError.UNVERIFIED, detail = detail)
    ShareFailure.BAD_RECIPIENT_KEY -> ShareMessage(error = ShareError.BAD_KEY, detail = detail)
    ShareFailure.BAD_REQUEST -> ShareMessage(error = ShareError.BAD_REQUEST, detail = detail)
    ShareFailure.IDENTITY_UNAVAILABLE -> ShareMessage(error = ShareError.IDENTITY, detail = detail)
}

private fun ReceiveOutcome.toMessage(): ShareMessage = when (this) {
    is ReceiveOutcome.Expired -> ShareMessage(error = ShareError.EXPIRED, detail = fileName)
    is ReceiveOutcome.RecipientMismatch -> ShareMessage(
        error = ShareError.NOT_FOR_YOU,
        detail = "sealed for ${sealedForKeyIds.joinToString()}; this identity is $ourKeyId",
    )

    is ReceiveOutcome.Tampered -> ShareMessage(error = ShareError.TAMPERED, detail = detail)
    is ReceiveOutcome.Unsupported -> ShareMessage(error = ShareError.NOT_A_PACKAGE, detail = detail)
    is ReceiveOutcome.Rejected -> ShareMessage(
        error = if (failure == ShareFailure.IDENTITY_UNAVAILABLE) ShareError.IDENTITY else ShareError.BAD_REQUEST,
        detail = detail,
    )

    is ReceiveOutcome.Opened -> ShareMessage(notice = ShareNotice.OPENED)
}

/**
 * Secure Share (TASK 16).
 *
 * Three panels, one service behind them: seal a file to a verified recipient key,
 * open a package addressed to this device, and manage the keys that make both
 * honest. Only KSR1 ciphertext ever leaves through the Sharesheet or a SAF
 * document, and every failure says what did *not* happen.
 */
@Composable
fun SecureShareScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
) {
    val context = LocalContext.current
    val application = context.applicationContext as Application
    val viewModel: SecureShareViewModel = viewModel(
        factory = viewModelFactory { SecureShareViewModel(application, container) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    val unlocked by container.session.unlocked.collectAsStateWithLifecycle()

    var scanOpen by remember { mutableStateOf(false) }
    var verifyTarget by remember { mutableStateOf<ShareRecipientView?>(null) }
    var verifyInput by remember { mutableStateOf("") }

    val openInput = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        viewModel.pickInput(uri)
    }
    val exportPackage = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        viewModel.exportSealedTo(uri)
    }
    val openPackage = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        viewModel.pickIncoming(uri)
    }
    val decryptTo = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        viewModel.openIncomingTo(uri)
    }
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val text = uri?.let { runCatching { context.contentResolver.openInputStream(it)?.use { stream -> QrSupport.decodeImage(stream) } }.getOrNull() }
        if (text.isNullOrBlank()) {
            viewModel.clearMessages()
        } else {
            viewModel.addRecipient("", text)
        }
    }
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) scanOpen = true
    }

    LaunchedEffect(unlocked) { viewModel.attach() }

    val title = tr("Secure Share", "مشاركة آمنة")
    val addKeyLabel = tr("Add or verify a recipient key", "أضف مفتاح مستلم أو تحقق منه")
    val chooseFileLabel = tr("Choose a file", "اختر ملفًا")
    val choosePackageLabel = tr("Choose a share package", "اختر حزمة مشاركة")
    val noRecipients = tr("No recipient keys are stored yet.", "لا توجد مفاتيح مستلمين محفوظة بعد.")
    val sealedTitle = tr("Sealed package", "الحزمة المغلقة")
    val shareNowLabel = tr("Share sealed package", "شارك الحزمة المغلقة")
    val saveToFileLabel = tr("Save to a file", "احفظ في ملف")
    val startOverLabel = tr("Start over", "ابدأ من جديد")
    val decryptLabel = tr("Decrypt to a file", "فك التشفير إلى ملف")
    val verifyLabel = tr("Verify fingerprint", "تحقق من البصمة")
    val deleteLabel = tr("Remove", "إزالة")
    val cancelLabel = tr("Cancel", "إلغاء")
    val closeLabel = tr("Close", "إغلاق")
    val copyUriLabel = tr("Copy my key URI", "انسخ رابط مفتاحي")
    val scanLabel = tr("Scan a QR code", "امسح رمز QR")
    val pickImageLabel = tr("Read a QR image", "اقرأ صورة QR")
    val addFromTextLabel = tr("Add from text", "أضف من نص")
    val confirmLabel = tr("Confirm", "أكد")
    val shareSheetTitle = tr("Send the sealed package", "أرسل الحزمة المغلقة")
    val tabs = listOf(
        ShareTab.SEND to tr("Send", "إرسال"),
        ShareTab.RECEIVE to tr("Receive", "استلام"),
        ShareTab.KEYS to tr("Keys", "مفاتيح"),
    )

    if (!unlocked) {
        LockedScreen(title, onBack, onNeedUnlock)
        return
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(title, onBack)
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "End-to-end encrypted sharing for a more private world.",
                "مشاركة مشفرة من الطرف إلى الطرف من أجل عالم أكثر خصوصية.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Muted,
        )
        Spacer(Modifier.height(12.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            tabs.forEach { (tab, label) ->
                val selected = state.tab == tab
                Surface(
                    shape = MaterialTheme.shapes.small,
                    color = if (selected) KnouxColors.VioletDeep.copy(alpha = 0.32f) else Color(0x33150B24),
                    border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) KnouxColors.LineHot else KnouxColors.Line),
                ) {
                    TextButton(onClick = { viewModel.selectTab(tab) }) {
                        Text(label, color = if (selected) KnouxColors.Text else KnouxColors.Faint, fontSize = 13.sp)
                    }
                }
            }
        }
        Spacer(Modifier.height(14.dp))

        when (state.tab) {
            ShareTab.SEND -> SendPanel(
                state = state,
                viewModel = viewModel,
                container = container,
                chooseFileLabel = chooseFileLabel,
                addKeyLabel = addKeyLabel,
                noRecipients = noRecipients,
                sealedTitle = sealedTitle,
                shareNowLabel = shareNowLabel,
                saveToFileLabel = saveToFileLabel,
                startOverLabel = startOverLabel,
                cancelLabel = cancelLabel,
                shareSheetTitle = shareSheetTitle,
                onChooseFile = { openInput.launch(arrayOf("*/*")) },
                onExport = { exportPackage.launch(viewModel.suggestedShareName()) },
                onOpenKeys = { viewModel.selectTab(ShareTab.KEYS) },
            )

            ShareTab.RECEIVE -> ReceivePanel(
                state = state,
                viewModel = viewModel,
                choosePackageLabel = choosePackageLabel,
                decryptLabel = decryptLabel,
                cancelLabel = cancelLabel,
                onChoosePackage = { openPackage.launch(arrayOf("*/*")) },
                onDecryptTo = { decryptTo.launch(viewModel.suggestedOutputName()) },
            )

            ShareTab.KEYS -> KeysPanel(
                state = state,
                viewModel = viewModel,
                container = container,
                scanLabel = scanLabel,
                pickImageLabel = pickImageLabel,
                addFromTextLabel = addFromTextLabel,
                copyUriLabel = copyUriLabel,
                verifyLabel = verifyLabel,
                deleteLabel = deleteLabel,
                closeLabel = closeLabel,
                onScan = { cameraPermission.launch(Manifest.permission.CAMERA) },
                onPickImage = { imagePicker.launch("image/*") },
                onVerify = { recipient ->
                    verifyInput = ""
                    verifyTarget = recipient
                },
            )
        }

        if (verifyTarget != null) {
            val recipient = verifyTarget!!
            VerifyFingerprintDialog(
                recipient = recipient,
                input = verifyInput,
                onInput = { verifyInput = it },
                onDismiss = { verifyTarget = null },
                onConfirm = {
                    viewModel.confirmRecipient(recipient.id, verifyInput)
                    verifyTarget = null
                },
                confirmLabel = confirmLabel,
                cancelLabel = cancelLabel,
            )
        }

        MessageBlock(message = state.message, notice = state.notice, onDismiss = { viewModel.clearMessages() })
        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun SendPanel(
    state: SecureShareUiState,
    viewModel: SecureShareViewModel,
    container: AppContainer,
    chooseFileLabel: String,
    addKeyLabel: String,
    noRecipients: String,
    sealedTitle: String,
    shareNowLabel: String,
    saveToFileLabel: String,
    startOverLabel: String,
    cancelLabel: String,
    shareSheetTitle: String,
    onChooseFile: () -> Unit,
    onExport: () -> Unit,
    onOpenKeys: () -> Unit,
) {
    val context = LocalContext.current
    val expiryOptions = listOf(
        ShareExpiry.NONE to tr("No label", "بدون مدة"),
        ShareExpiry.ONE_HOUR to tr("1 hour", "ساعة"),
        ShareExpiry.ONE_DAY to tr("24 hours", "24 ساعة"),
        ShareExpiry.ONE_WEEK to tr("7 days", "7 أيام"),
    )
    val encryptLabel = tr("Verify & Encrypt", "تحقق وأغلق بالتشفير")
    val reviewLabel = tr("Share Review", "مراجعة المشاركة")
    val recipientLabel = tr("Recipient Public Key", "المفتاح العام للمستلم")
    val fileLabel = tr("File", "الملف")
    val encryptionValue = tr("Recipient-key protected (X25519 + AES-256-GCM)", "محمي بمفتاح المستلم (X25519 + AES-256-GCM)")
    val exportValue = tr("Encrypted package only", "حزمة مشفرة فقط")
    val deliveryValue = when {
        state.sealed != null && state.sealed.recipientCount > 1 ->
            tr("Sealed for ${state.sealed.recipientCount} keys", "مغلقة لـ ${state.sealed.recipientCount} مفاتيح")

        state.selected.isNotEmpty() -> tr("Ready to seal", "جاهز للإغلاق")
        else -> tr("Not initiated", "لم يبدأ")
    }
    val expiryValue = when (state.expiry) {
        ShareExpiry.NONE -> tr("none", "بدون")
        ShareExpiry.ONE_HOUR -> tr("1 hour from now", "ساعة من الآن")
        ShareExpiry.ONE_DAY -> tr("24 hours from now", "24 ساعة من الآن")
        ShareExpiry.ONE_WEEK -> tr("7 days from now", "7 أيام من الآن")
    }
    val expiryTruth = tr(
        "An expiry label stops this app from opening the package again after the date. It cannot recall a copy the recipient already has, and it is not a revocation.",
        "مدة الصلاحية تمنع هذا التطبيق من إعادة فتح الحزمة بعد انتهائها، لكنها لا تسترجع نسخة يملكها المستلم بالفعل وليست إلغاءً للصلاحية.",
    )
    val noteLabel = tr("Note to the recipient (encrypted)", "ملاحظة للمستلم (مشفرة)")
    val senderLabel = tr("Your label", "تسميتك")

    GlassCard(Modifier.fillMaxWidth()) {
        SectionLabel(fileLabel)
        Spacer(Modifier.height(6.dp))
        if (state.inputUri == null) {
            Text(
                tr("Pick a document, image or archive to seal.", "اختر مستندًا أو صورة أو أرشيفًا لإغلاقه."),
                style = MaterialTheme.typography.bodySmall,
                color = KnouxColors.Faint,
            )
        } else {
            Text(state.inputName, style = MaterialTheme.typography.bodyMedium, color = KnouxColors.Text)
            Text(
                state.inputSize?.let { formatBytes(it) } ?: tr("size unknown", "الحجم غير معروف"),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Muted,
            )
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KnouxGhostButton(chooseFileLabel, onChooseFile, Modifier.weight(1f))
            if (state.inputUri != null) {
                TextButton(onClick = { viewModel.clearInput() }) {
                    Text(startOverLabel, color = KnouxColors.Faint, fontSize = 11.sp)
                }
            }
        }
    }
    Spacer(Modifier.height(10.dp))

    GlassCard(Modifier.fillMaxWidth()) {
        SectionLabel(recipientLabel)
        Spacer(Modifier.height(6.dp))
        if (state.recipients.isEmpty()) {
            Text(noRecipients, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Faint)
            Spacer(Modifier.height(8.dp))
            KnouxGhostButton(addKeyLabel, onOpenKeys)
        } else {
            state.recipients.forEach { recipient ->
                RecipientRow(
                    recipient = recipient,
                    checked = recipient.id in state.selected,
                    onToggle = { viewModel.toggleRecipient(recipient.id) },
                )
            }
            Spacer(Modifier.height(8.dp))
            KnouxGhostButton(addKeyLabel, onOpenKeys)
        }
    }
    Spacer(Modifier.height(10.dp))

    GlassCard(Modifier.fillMaxWidth()) {
        SectionLabel(reviewLabel)
        Spacer(Modifier.height(6.dp))
        InfoRow(tr("Encryption", "التشفير"), encryptionValue)
        InfoRow(tr("Export", "التصدير"), exportValue)
        InfoRow(tr("Delivery", "التسليم"), deliveryValue)
        InfoRow(tr("Expiry", "الصلاحية"), expiryValue)
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            expiryOptions.forEach { (option, label) ->
                val active = state.expiry == option
                Surface(
                    shape = MaterialTheme.shapes.small,
                    color = if (active) KnouxColors.VioletDeep.copy(alpha = 0.30f) else Color(0x33150B24),
                    border = androidx.compose.foundation.BorderStroke(1.dp, if (active) KnouxColors.LineHot else KnouxColors.Line),
                ) {
                    TextButton(onClick = { viewModel.setExpiry(option) }) {
                        Text(label, color = if (active) KnouxColors.Text else KnouxColors.Faint, fontSize = 11.sp)
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(expiryTruth, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Warn)
        Spacer(Modifier.height(10.dp))
        KnouxTextField(
            value = state.senderLabel,
            onValueChange = { viewModel.setSenderLabel(it) },
            label = senderLabel,
        )
        Spacer(Modifier.height(8.dp))
        KnouxTextField(
            value = state.note,
            onValueChange = { viewModel.setNote(it) },
            label = noteLabel,
            minLines = 2,
        )
    }
    Spacer(Modifier.height(10.dp))

    if (state.busy) {
        LinearProgressIndicator(
            progress = { state.progress },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(6.dp))
        KnouxGhostButton(cancelLabel, { viewModel.cancel() })
        Spacer(Modifier.height(10.dp))
    }

    if (state.sealed == null) {
        KnouxPrimaryButton(
            text = encryptLabel,
            onClick = { viewModel.seal() },
            enabled = state.inputUri != null && state.inputSize != null && state.selected.isNotEmpty() && !state.busy,
        )
    } else {
        val sealed = state.sealed!!
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(sealedTitle)
            Spacer(Modifier.height(6.dp))
            InfoRow(tr("Package", "الحزمة"), sealed.packageIdHex)
            InfoRow(tr("Size", "الحجم"), formatBytes(sealed.packageBytes))
            InfoRow(tr("SHA-256", "SHA-256"), sealed.digestHex.take(32) + "…")
            Text(
                tr("This file is ciphertext. Handing it over reveals nothing without a recipient key.", "هذا الملف نص مشفر، ولا يكشف تسليمه شيئًا بدون مفتاح المستلم."),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                KnouxPrimaryButton(
                    text = shareNowLabel,
                    onClick = {
                        val intent = viewModel.shareIntent()
                        if (intent != null) {
                            context.startActivity(Intent.createChooser(intent, shareSheetTitle))
                            viewModel.markShared()
                        }
                    },
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(6.dp))
            KnouxGhostButton(saveToFileLabel, onExport, enabled = !state.busy)
            Spacer(Modifier.height(6.dp))
            TextButton(onClick = { viewModel.clearInput() }) {
                Text(startOverLabel, color = KnouxColors.Violet, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun ReceivePanel(
    state: SecureShareUiState,
    viewModel: SecureShareViewModel,
    choosePackageLabel: String,
    decryptLabel: String,
    cancelLabel: String,
    onChoosePackage: () -> Unit,
    onDecryptTo: () -> Unit,
) {
    val incoming = state.incoming
    GlassCard(Modifier.fillMaxWidth()) {
        SectionLabel(tr("Receive", "استلام"))
        Spacer(Modifier.height(6.dp))
        Text(
            tr(
                "A package opens only for the key it was sealed to, and only after its metadata authenticates.",
                "لا تُفتح الحزمة إلا للمفتاح الذي أُغلقت له، وبعد ثبوت صحة بياناتها الوصفية.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Faint,
        )
        Spacer(Modifier.height(8.dp))
        KnouxGhostButton(choosePackageLabel, onChoosePackage, enabled = !state.busy)
    }
    Spacer(Modifier.height(10.dp))

    if (incoming != null) {
        val summary = incoming.summary
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Package header", "ترويسة الحزمة"))
            Spacer(Modifier.height(6.dp))
            InfoRow(tr("File", "الملف"), incoming.displayName)
            InfoRow(tr("Package", "الحزمة"), summary.packageIdHex)
            InfoRow(tr("Sealed size", "الحجم المغلق"), formatBytes(summary.plaintextLength))
            InfoRow(tr("Recipients", "المستلمون"), summary.recipientKeyIds.joinToString(" "))
            InfoRow(tr("Created", "أُنشئت"), formatTime(summary.createdAt))
            InfoRow(
                tr("Expires", "تنتهي"),
                summary.expiresAt?.let { formatTime(it) } ?: tr("no label", "بدون مدة"),
            )
            Spacer(Modifier.height(8.dp))
            Text(
                tr(
                    "Recipient ids are selectors, not identities. The package opens only if this device holds the matching private key.",
                    "معرّفات المستلمين هي دلائل بحث وليست هويات. لا تُفتح الحزمة إلا إذا كان هذا الجهاز يحمل المفتاح الخاص المطابق.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
            Spacer(Modifier.height(10.dp))
            KnouxPrimaryButton(decryptLabel, onDecryptTo, enabled = !state.busy)
        }
        Spacer(Modifier.height(10.dp))
    }

    if (state.busy) {
        LinearProgressIndicator(progress = { state.progress }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(6.dp))
        KnouxGhostButton(cancelLabel, { viewModel.cancel() })
        Spacer(Modifier.height(10.dp))
    }

    state.opened?.let { opened ->
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Opened", "تم الفتح"))
            Spacer(Modifier.height(6.dp))
            InfoRow(tr("File", "الملف"), opened.fileName)
            InfoRow(tr("Type", "النوع"), opened.mimeType)
            InfoRow(tr("Size", "الحجم"), formatBytes(opened.bytes))
            InfoRow(tr("From", "من"), opened.senderLabel)
            Spacer(Modifier.height(4.dp))
            Text(
                groupedFingerprint(opened.senderFingerprint),
                style = MaterialTheme.typography.labelSmall,
                fontFamily = FontFamily.Monospace,
                color = KnouxColors.Muted,
            )
            if (opened.note.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(opened.note, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Text)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                tr(
                    "The sender label is what the other device typed. It is not proof of who sent the file.",
                    "تسمية المرسل هي ما كتبه الجهاز الآخر، وليست دليلًا على هوية من أرسل الملف.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Warn,
            )
        }
        Spacer(Modifier.height(10.dp))
    }
}

@Composable
private fun KeysPanel(
    state: SecureShareUiState,
    viewModel: SecureShareViewModel,
    container: AppContainer,
    scanLabel: String,
    pickImageLabel: String,
    addFromTextLabel: String,
    copyUriLabel: String,
    verifyLabel: String,
    deleteLabel: String,
    closeLabel: String,
    onScan: () -> Unit,
    onPickImage: () -> Unit,
    onVerify: (ShareRecipientView) -> Unit,
) {
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var label by remember { mutableStateOf("") }
    var keyText by remember { mutableStateOf("") }
    val myKeyTruth = tr(
        "This is a software identity key: the handset's Keystore offers no asymmetric algorithm, so it is protected by the vault key rather than by hardware. That is stated here rather than assumed.",
        "هذه هوية برمجية: مخزن هذا الجهاز لا يوفر خوارزمية غير متماثلة، لذا يحميها مفتاح الخزنة لا العتاد. يُذكر ذلك صراحة بدلًا من افتراضه.",
    )
    val qr = remember(state.identityUri) {
        state.identityUri.takeIf { it.isNotBlank() }?.let { encodeQrBitmap(it, 640) }
    }

    GlassCard(Modifier.fillMaxWidth()) {
        SectionLabel(tr("My sharing key", "مفتاح المشاركة الخاص بي"))
        Spacer(Modifier.height(6.dp))
        if (state.identityFingerprint.isBlank()) {
            Text(
                tr("The identity is being prepared…", "يتم تجهيز الهوية…"),
                style = MaterialTheme.typography.bodySmall,
                color = KnouxColors.Warn,
            )
        } else {
            Text(
                groupedFingerprint(state.identityFingerprint),
                style = MaterialTheme.typography.bodySmall,
                fontFamily = FontFamily.Monospace,
                color = KnouxColors.Text,
            )
            Spacer(Modifier.height(8.dp))
            if (qr != null) {
                Image(
                    bitmap = qr.asImageBitmap(),
                    contentDescription = tr("QR code carrying the sharing public key", "رمز QR يحمل مفتاح المشاركة العام"),
                    modifier = Modifier.fillMaxWidth(0.72f).aspectRatio(1f),
                )
                Spacer(Modifier.height(6.dp))
            }
            TextButton(onClick = {
                scope.launch { container.clipboard.copySensitive(state.identityUri, "KNOUX share key") }
            }) { Text(copyUriLabel, color = KnouxColors.Violet, fontSize = 11.sp) }
            Text(myKeyTruth, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Faint)
        }
    }
    Spacer(Modifier.height(10.dp))

    GlassCard(Modifier.fillMaxWidth()) {
        SectionLabel(tr("Add a recipient", "أضف مستلمًا"))
        Spacer(Modifier.height(6.dp))
        KnouxTextField(label, { label = it }, tr("Label", "التسمية"))
        Spacer(Modifier.height(6.dp))
        KnouxTextField(
            keyText,
            { keyText = it },
            tr("knouxkey:v2 URI or base64 X25519 key", "رابط knouxkey:v2 أو مفتاح X25519 بصيغة base64"),
            minLines = 2,
        )
        Spacer(Modifier.height(8.dp))
        KnouxPrimaryButton(
            text = addFromTextLabel,
            onClick = {
                viewModel.addRecipient(label, keyText)
                keyText = ""
                label = ""
            },
            enabled = keyText.isNotBlank() && !state.busy,
        )
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KnouxGhostButton(scanLabel, onScan, Modifier.weight(1f))
            KnouxGhostButton(pickImageLabel, onPickImage, Modifier.weight(1f))
        }
        Text(
            tr(
                "A signing key is refused on purpose: an ECDSA key is not automatically safe for encryption.",
                "يُرفض مفتاح التوقيع عن قصد: مفتاح ECDSA ليس آمنًا بالضرورة للتشفير.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Faint,
        )
    }
    Spacer(Modifier.height(10.dp))

    if (state.recipients.isNotEmpty()) {
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Stored recipients", "المستلمون المحفوظون"))
            Spacer(Modifier.height(6.dp))
            state.recipients.forEach { recipient ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(recipient.label, style = MaterialTheme.typography.bodyMedium, color = KnouxColors.Text)
                        Text(
                            groupedFingerprint(recipient.fingerprint),
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = FontFamily.Monospace,
                            color = KnouxColors.Muted,
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        if (recipient.verified) {
                            StatusPill(tr("Verified", "موثّق"), KnouxColors.Success)
                        } else {
                            StatusPill(tr("Verification required", "يلزم التحقق"), KnouxColors.Warn)
                        }
                        Spacer(Modifier.height(4.dp))
                        TextButton(onClick = { onVerify(recipient) }) {
                            Text(verifyLabel, color = KnouxColors.Violet, fontSize = 11.sp)
                        }
                        TextButton(onClick = { viewModel.removeRecipient(recipient.id) }) {
                            Text(deleteLabel, color = KnouxColors.Alert, fontSize = 11.sp)
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(10.dp))
    }

    if (state.receipts.isNotEmpty()) {
        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Recent shares", "أحدث المشاركات"))
            Spacer(Modifier.height(6.dp))
            state.receipts.take(8).forEach { receipt ->
                InfoRow(
                    if (receipt.direction == ShareService.DIRECTION_INCOMING) {
                        tr("Incoming", "واردة")
                    } else {
                        tr("Outgoing", "صادرة")
                    },
                    "${receipt.displayName} · ${formatBytes(receipt.plaintextLength)} · ${receipt.delivery}",
                )
            }
        }
        Spacer(Modifier.height(10.dp))
    }

    if (state.tab == ShareTab.KEYS) {
        val granted = ContextCompat.checkSelfPermission(
            LocalContext.current,
            Manifest.permission.CAMERA,
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            Text(
                tr(
                    "Camera scanning needs the camera permission; pasting a key or reading an image works without it.",
                    "مسح الكاميرا يحتاج إذن الكاميرا، أما لصق المفتاح أو قراءة صورة فيعملان بدونه.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
        }
    }
}

@Composable
private fun RecipientRow(recipient: ShareRecipientView, checked: Boolean, onToggle: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = checked && recipient.verified, onCheckedChange = { onToggle() })
        Column(Modifier.weight(1f)) {
            Text(recipient.label, style = MaterialTheme.typography.bodyMedium, color = KnouxColors.Text)
            Text(
                groupedFingerprint(recipient.fingerprint),
                style = MaterialTheme.typography.labelSmall,
                fontFamily = FontFamily.Monospace,
                color = KnouxColors.Muted,
            )
        }
        if (!recipient.verified) {
            StatusPill(tr("Verification required", "يلزم التحقق"), KnouxColors.Warn)
        }
    }
}

@Composable
private fun VerifyFingerprintDialog(
    recipient: ShareRecipientView,
    input: String,
    onInput: (String) -> Unit,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    confirmLabel: String,
    cancelLabel: String,
) {
    val explanation = tr(
        "Compare this fingerprint with your recipient over another channel, then type what they read to you. A match proves you hold the same key; it does not prove who they are.",
        "قارن هذه البصمة مع المستلم عبر قناة أخرى، ثم اكتب ما قرأه لك. التطابق يثبت أنك تحمل نفس المفتاح، ولا يثبت من هو.",
    )
    GlassCard(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
        borderColor = KnouxColors.LineHot,
    ) {
        SectionLabel(tr("Confirm recipient fingerprint", "تأكيد بصمة المستلم"))
        Spacer(Modifier.height(6.dp))
        Text(recipient.label, style = MaterialTheme.typography.bodyMedium, color = KnouxColors.Text)
        Spacer(Modifier.height(4.dp))
        Text(
            groupedFingerprint(recipient.fingerprint),
            style = MaterialTheme.typography.bodySmall,
            fontFamily = FontFamily.Monospace,
            color = KnouxColors.Violet,
        )
        Spacer(Modifier.height(6.dp))
        Text(explanation, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Faint)
        Spacer(Modifier.height(8.dp))
        KnouxTextField(
            value = input,
            onValueChange = onInput,
            label = tr("Type the full fingerprint", "اكتب البصمة كاملة"),
            minLines = 2,
        )
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KnouxPrimaryButton(
                text = confirmLabel,
                onClick = onConfirm,
                modifier = Modifier.weight(1f),
                enabled = input.isNotBlank(),
            )
            KnouxGhostButton(cancelLabel, onDismiss, Modifier.weight(1f))
        }
    }
}

@Composable
private fun MessageBlock(message: ShareMessage?, notice: ShareMessage?, onDismiss: () -> Unit) {
    val shown = message ?: notice
    if (shown == null) return
    val isWarning = message != null
    val text = message?.error?.let { if (isArabic()) it.labelAr else it.labelEn }
        ?: shown.notice?.let { if (isArabic()) it.labelAr else it.labelEn }
        ?: return
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 10.dp),
        shape = MaterialTheme.shapes.medium,
        color = if (isWarning) Color(0x33FF586D) else Color(0x2E5FE0C8),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (isWarning) KnouxColors.Alert else KnouxColors.Success),
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(
                text,
                style = MaterialTheme.typography.bodySmall,
                color = if (isWarning) KnouxColors.Alert else KnouxColors.Success,
            )
            shown.detail?.let {
                Spacer(Modifier.height(4.dp))
                Text(it, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Muted)
            }
            Spacer(Modifier.height(4.dp))
            TextButton(onClick = onDismiss) {
                Text(tr("Dismiss", "تجاهل"), color = KnouxColors.Violet, fontSize = 11.sp)
            }
        }
    }
}

/** Groups a fingerprint into readable blocks, the way the reference shows it. */
internal fun groupedFingerprint(value: String): String {
    if (value.isBlank()) return ""
    val body = value.removePrefix("SHA256:")
    return body.chunked(4).joinToString(" ")
}

internal fun formatBytes(value: Long): String = when {
    value >= 1_048_576 -> "%.1f MB".format(value / 1_048_576.0)
    value >= 1024 -> "%.1f KB".format(value / 1024.0)
    else -> "$value B"
}

internal fun formatTime(millis: Long): String =
    if (millis <= 0L) "—" else java.text.DateFormat
        .getDateTimeInstance(java.text.DateFormat.MEDIUM, java.text.DateFormat.SHORT)
        .format(java.util.Date(millis))
