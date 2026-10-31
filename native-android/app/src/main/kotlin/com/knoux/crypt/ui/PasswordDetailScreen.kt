package com.knoux.crypt.ui

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.CredentialDiff
import com.knoux.crypt.data.CredentialOrigins
import com.knoux.crypt.data.CredentialRevealPolicy
import com.knoux.crypt.data.OriginVerdict
import com.knoux.crypt.data.PasswordPayload
import com.knoux.crypt.data.PasswordRevisions
import com.knoux.crypt.data.RevealGate
import com.knoux.crypt.data.SecretKinds
import com.knoux.crypt.data.SecretsJson
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
import com.knoux.crypt.security.PasswordGenerator
import com.knoux.crypt.security.PasswordStrength
import com.knoux.crypt.security.StrengthFlag
import com.knoux.crypt.security.StrengthLevel
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** What the detail screen knows about the stored record right now. */
enum class CredentialStatus { LOADING, READY, MISSING, UNREADABLE, LOCKED }

data class AccessEvent(val atMillis: Long, val kind: String)

data class CredentialDetailState(
    val status: CredentialStatus = CredentialStatus.LOADING,
    val recordId: String? = null,
    val stored: PasswordPayload? = null,
    val updatedAt: Long = 0L,
    val revealedAtMillis: Long? = null,
    val sessionAgeMillis: Long? = null,
    val busy: Boolean = false,
    val message: String? = null,
    val savedOnce: Boolean = false,
    val events: List<AccessEvent> = emptyList(),
)

/**
 * Detail ViewModel for one encrypted credential.
 *
 * The record is read through [com.knoux.crypt.data.SecretRepository], which
 * revalidates the session capability before and after every decrypt, so a
 * capability that outlived its session yields [CredentialStatus.LOCKED] instead
 * of plaintext. Nothing here is written to SavedState: the only navigation
 * argument is the record UUID, and the plaintext lives in ordinary composition
 * state that Compose discards when the screen leaves the back stack.
 */
class CredentialDetailViewModel(
    application: Application,
    private val container: AppContainer,
) : AndroidViewModel(application) {
    private val _state = MutableStateFlow(CredentialDetailState())
    val state: StateFlow<CredentialDetailState> = _state.asStateFlow()

    fun load(recordId: String) {
        val access = container.session.currentAccess()
        if (access == null) {
            _state.value = CredentialDetailState(status = CredentialStatus.LOCKED)
            return
        }
        _state.value = _state.value.copy(status = CredentialStatus.LOADING, recordId = recordId)
        viewModelScope.launch {
            try {
                val record = container.secrets.find(access, recordId)
                if (record == null) {
                    _state.value = CredentialDetailState(status = CredentialStatus.MISSING, recordId = recordId)
                    return@launch
                }
                val payload = record.payloadJson
                    .takeUnless { record.decryptionFailed }
                    ?.let { SecretsJson.decodePassword(it) }
                if (payload == null) {
                    _state.value = CredentialDetailState(
                        status = CredentialStatus.UNREADABLE,
                        recordId = recordId,
                        updatedAt = record.updatedAt,
                    )
                    return@launch
                }
                _state.value = CredentialDetailState(
                    status = CredentialStatus.READY,
                    recordId = recordId,
                    stored = payload,
                    updatedAt = record.updatedAt,
                    sessionAgeMillis = container.session.sessionAgeMillis(),
                )
            } catch (_: VaultLockedException) {
                _state.value = CredentialDetailState(status = CredentialStatus.LOCKED, recordId = recordId)
            }
        }
    }

    fun reveal() {
        val current = _state.value
        if (current.status != CredentialStatus.READY) return
        when (CredentialRevealPolicy.gate(container.session.sessionAgeMillis())) {
            RevealGate.NO_SESSION -> _state.update {
                it.copy(status = CredentialStatus.LOCKED, revealedAtMillis = null)
            }
            RevealGate.SESSION_TOO_OLD -> _state.update {
                it.copy(
                    message = "SESSION_TOO_OLD",
                    sessionAgeMillis = container.session.sessionAgeMillis(),
                )
            }
            RevealGate.ALLOWED -> _state.update {
                it.copy(
                    revealedAtMillis = System.currentTimeMillis(),
                    sessionAgeMillis = container.session.sessionAgeMillis(),
                    message = null,
                    events = it.events + AccessEvent(System.currentTimeMillis(), "reveal"),
                )
            }
        }
    }

    fun hide() {
        _state.update { it.copy(revealedAtMillis = null) }
    }

    /** Drops the reveal once the auto-hide window passes. */
    fun expireRevealIfDue(nowMillis: Long) {
        val revealedAt = _state.value.revealedAtMillis ?: return
        if (!CredentialRevealPolicy.stillVisible(revealedAt, nowMillis)) {
            _state.update { it.copy(revealedAtMillis = null) }
        }
    }

    fun copySecret() {
        val secret = _state.value.stored?.password.orEmpty()
        if (secret.isEmpty()) return
        viewModelScope.launch {
            container.clipboard.copySensitive(secret, "KNOUX credential")
            _state.update {
                it.copy(events = it.events + AccessEvent(System.currentTimeMillis(), "copy-secret"))
            }
        }
    }

    fun copyField(value: String, kind: String) {
        if (value.isEmpty()) return
        viewModelScope.launch {
            container.clipboard.copySensitive(value, "KNOUX credential field")
            _state.update { it.copy(events = it.events + AccessEvent(System.currentTimeMillis(), kind)) }
        }
    }

    fun save(edited: PasswordPayload) {
        val access = container.session.currentAccess()
        if (access == null) {
            _state.update { it.copy(status = CredentialStatus.LOCKED, busy = false) }
            return
        }
        val recordId = _state.value.recordId ?: return
        val before = _state.value.stored ?: return
        val verdict = CredentialOrigins.validate(edited.url)
        if (verdict is OriginVerdict.Invalid || edited.title.isBlank()) {
            _state.update { it.copy(message = "VALIDATION", busy = false) }
            return
        }
        val changed = CredentialDiff.changedFields(before, edited)
        if (changed.isEmpty()) {
            _state.update { it.copy(message = null, savedOnce = true) }
            return
        }
        val metric = PasswordStrength.evaluate(edited.password)
        val revision = PasswordRevisions.entry(System.currentTimeMillis(), metric.level, changed)
        val withHistory = edited.copy(revisions = PasswordRevisions.append(before.revisions, revision))
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            try {
                container.secrets.save(access, SecretKinds.PASSWORD, recordId, SecretsJson.encodePassword(withHistory))
                _state.value = CredentialDetailState(
                    status = CredentialStatus.READY,
                    recordId = recordId,
                    stored = withHistory,
                    updatedAt = System.currentTimeMillis(),
                    savedOnce = true,
                    sessionAgeMillis = container.session.sessionAgeMillis(),
                    events = _state.value.events + AccessEvent(System.currentTimeMillis(), "save"),
                )
            } catch (_: VaultLockedException) {
                _state.value = _state.value.copy(status = CredentialStatus.LOCKED, busy = false)
            } catch (failure: Exception) {
                _state.update { it.copy(busy = false, message = failure.message ?: "SAVE_FAILED") }
            }
        }
    }

    fun delete() {
        val access = container.session.currentAccess() ?: return
        val recordId = _state.value.recordId ?: return
        viewModelScope.launch {
            try {
                container.secrets.delete(access, recordId)
                _state.value = CredentialDetailState(status = CredentialStatus.MISSING, recordId = recordId)
            } catch (_: VaultLockedException) {
                _state.value = CredentialDetailState(status = CredentialStatus.LOCKED, recordId = recordId)
            }
        }
    }

    fun generate(options: PasswordGenerator.Options): String = PasswordGenerator.generate(options)

    fun clearMessage() = _state.update { it.copy(message = null) }

    init {
        viewModelScope.launch {
            container.session.unlocked.collect { unlocked ->
                if (!unlocked) {
                    // Drop every decrypted field the moment the session dies.
                    _state.value = CredentialDetailState(
                        status = CredentialStatus.LOCKED,
                        recordId = _state.value.recordId,
                    )
                }
            }
        }
    }
}

@Composable
fun PasswordDetailScreen(
    container: AppContainer,
    recordId: String,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
    onOpenAudit: () -> Unit,
) {
    if (container.session.currentAccess() == null) {
        LockedScreen(tr("Password Detail", "تفاصيل كلمة المرور"), onBack, onNeedUnlock)
        return
    }
    val application = LocalContext.current.applicationContext as Application
    val viewModel: CredentialDetailViewModel = viewModel(
        factory = viewModelFactory { CredentialDetailViewModel(application, container) },
    )
    LaunchedEffect(recordId) { viewModel.load(recordId) }
    val state by viewModel.state.collectAsStateWithLifecycle()

    // Composition-only edit buffer: never rememberSaveable, never persisted.
    var title by remember(recordId) { mutableStateOf("") }
    var username by remember(recordId) { mutableStateOf("") }
    var secret by remember(recordId) { mutableStateOf("") }
    var origin by remember(recordId) { mutableStateOf("") }
    var notes by remember(recordId) { mutableStateOf("") }
    var seeded by remember(recordId) { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var showGenerator by remember { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf(false) }
    var copiedField by remember { mutableStateOf<String?>(null) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val formatter = remember { SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()) }

    val stored = state.stored
    if (stored != null && !seeded) {
        title = stored.title
        username = stored.username
        secret = stored.password
        origin = stored.url
        notes = stored.notes
        seeded = true
    }
    val revealed = state.revealedAtMillis != null &&
        CredentialRevealPolicy.stillVisible(state.revealedAtMillis!!, now)
    LaunchedEffect(state.revealedAtMillis) {
        while (state.revealedAtMillis != null) {
            delay(1_000)
            now = System.currentTimeMillis()
            viewModel.expireRevealIfDue(now)
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Password Detail", "تفاصيل كلمة المرور"), onBack)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            when (state.status) {
                CredentialStatus.LOADING -> StatusPill(tr("Loading", "جارٍ التحميل"), tone = KnouxColors.Violet)
                CredentialStatus.READY -> StatusPill(tr("Unlocked session", "جلسة مفتوحة"), tone = KnouxColors.Success)
                CredentialStatus.MISSING -> StatusPill(tr("Not found", "غير موجود"), tone = KnouxColors.Warn)
                CredentialStatus.UNREADABLE -> StatusPill(tr("Unreadable", "غير قابل للقراءة"), tone = KnouxColors.Alert)
                CredentialStatus.LOCKED -> StatusPill(tr("Locked", "مقفل"), tone = KnouxColors.Alert)
            }
            Spacer(Modifier.width(6.dp))
            Text(
                state.sessionAgeMillis?.let { tr("session ${it / 1000}s", "الجلسة ${it / 1000}ث") }
                    ?: tr("no session", "لا جلسة"),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Muted,
            )
        }
        Spacer(Modifier.height(10.dp))

        when (state.status) {
            CredentialStatus.LOADING -> LinearProgressIndicator(Modifier.fillMaxWidth(), color = KnouxColors.Violet)

            CredentialStatus.LOCKED -> {
                GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Alert.copy(alpha = 0.4f)) {
                    Text(
                        tr(
                            "The vault locked, so this credential is no longer readable. Nothing was deleted. Unlock again to open it.",
                            "أُقفلت الخزنة، لذلك لم تعد هذه كلمة المرور مقروءة. لم يُحذف أي شيء. افتح الخزنة مجددًا للوصول إليها.",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = KnouxColors.Alert,
                    )
                    Spacer(Modifier.height(8.dp))
                    KnouxGhostButton(tr("Unlock", "فتح"), onNeedUnlock)
                }
            }

            CredentialStatus.MISSING -> {
                GlassCard(Modifier.fillMaxWidth()) {
                    Text(
                        tr(
                            "This record no longer exists in the vault. It may have been deleted or restored away.",
                            "لم يعد هذا السجل موجودًا في الخزنة. ربما حُذف أو استُبدل أثناء الاستعادة.",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(Modifier.height(8.dp))
                    KnouxGhostButton(tr("Back to passwords", "العودة إلى كلمات المرور"), onBack)
                }
            }

            CredentialStatus.UNREADABLE -> {
                GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Alert.copy(alpha = 0.4f)) {
                    Text(
                        tr(
                            "This record could not be decrypted with any available vault key. The ciphertext is untouched; no placeholder data is shown.",
                            "تعذر فك تشفير هذا السجل بأي مفتاح خزنة متاح. النص المشفر لم يُمس؛ لا تُعرض أي بيانات بديلة.",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = KnouxColors.Alert,
                    )
                }
            }

            CredentialStatus.READY -> {
                val payload = stored ?: return@Column
                val metric = remember(payload.password) { PasswordStrength.evaluate(payload.password) }
                val verdict = CredentialOrigins.validate(if (editing) origin else payload.url)

                GlassCard(Modifier.fillMaxWidth()) {
                    SectionLabel(tr("Identity", "الهوية"))
                    Spacer(Modifier.height(6.dp))
                    Text(
                        (if (editing) title else payload.title).ifBlank { tr("Untitled", "بلا عنوان") },
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Spacer(Modifier.height(6.dp))
                    InfoRow(
                        tr("Username", "اسم المستخدم"),
                        payload.username.ifBlank { tr("not set", "غير معرّف") },
                    )
                    if (payload.username.isNotBlank()) {
                        TextButton(onClick = {
                            viewModel.copyField(payload.username, "copy-username")
                            copiedField = "username"
                        }) {
                            Text(
                                if (copiedField == "username") tr("Copied", "تم النسخ") else tr("Copy username", "نسخ اسم المستخدم"),
                                color = KnouxColors.Violet,
                                fontSize = 11.sp,
                            )
                        }
                    }
                    InfoRow(
                        tr("Origin", "المصدر"),
                        when (verdict) {
                            is OriginVerdict.Valid -> verdict.host
                            OriginVerdict.Empty -> tr("not set", "غير معرّف")
                            is OriginVerdict.Invalid -> tr("rejected", "مرفوض")
                        },
                    )
                    if (payload.url.isNotBlank() && verdict is OriginVerdict.Valid) {
                        TextButton(onClick = {
                            viewModel.copyField(payload.url, "copy-origin")
                            copiedField = "origin"
                        }) {
                            Text(
                                if (copiedField == "origin") tr("Copied", "تم النسخ") else tr("Copy origin", "نسخ المصدر"),
                                color = KnouxColors.Violet,
                                fontSize = 11.sp,
                            )
                        }
                    }
                    InfoRow(tr("Updated", "آخر تحديث"), formatter.format(Date(state.updatedAt)))
                    InfoRow(
                        tr("Secret length", "طول السر"),
                        payload.password.length.toString(),
                    )
                }
                Spacer(Modifier.height(10.dp))

                GlassCard(Modifier.fillMaxWidth()) {
                    SectionLabel(tr("Secret", "السر"))
                    Spacer(Modifier.height(6.dp))
                    Text(
                        if (revealed) payload.password.ifBlank { tr("empty", "فارغة") }
                        else "•".repeat(payload.password.length.coerceIn(6, 24)),
                        style = MaterialTheme.typography.bodyLarge,
                        color = KnouxColors.Text,
                    )
                    Spacer(Modifier.height(4.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton(onClick = { if (revealed) viewModel.hide() else viewModel.reveal() }) {
                            Text(
                                if (revealed) tr("Hide", "إخفاء") else tr("Reveal", "إظهار"),
                                color = KnouxColors.Violet,
                                fontSize = 11.sp,
                            )
                        }
                        TextButton(onClick = {
                            viewModel.copySecret()
                            copiedField = "secret"
                        }) {
                            Text(
                                if (copiedField == "secret") tr("Copied", "تم النسخ") else tr("Copy", "نسخ"),
                                color = KnouxColors.Violet,
                                fontSize = 11.sp,
                            )
                        }
                    }
                    if (state.message == "SESSION_TOO_OLD") {
                        Text(
                            tr(
                                "This session has been open longer than the reveal window. Lock and unlock again to reveal it.",
                                "هذه الجلسة مفتوحة أطول من نافذة الإظهار. أقفل الخزنة وافتحها مجددًا للإظهار.",
                            ),
                            color = KnouxColors.Warn,
                            style = MaterialTheme.typography.labelSmall,
                        )
                        TextButton(onClick = viewModel::clearMessage) {
                            Text(tr("Dismiss", "إغلاق"), color = KnouxColors.Violet, fontSize = 11.sp)
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StatusPill(levelLabel(metric.level), tone = levelColor(metric.level))
                        Spacer(Modifier.width(6.dp))
                        Text(
                            tr(
                                "${metric.effectiveEntropyBits.toInt()} effective bits · pool ${metric.poolSize}",
                                "${metric.effectiveEntropyBits.toInt()} بت فعلي · مجموعة ${metric.poolSize}",
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            color = KnouxColors.Muted,
                        )
                    }
                    val reasons = metricReasons(metric.flags)
                    if (reasons.isNotEmpty()) {
                        Text(
                            reasons.joinToString(" · "),
                            style = MaterialTheme.typography.labelSmall,
                            color = KnouxColors.Faint,
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        tr(
                            "Reveal needs a session authenticated within the last ${CredentialRevealPolicy.RECENT_SESSION_MILLIS / 1000}s and hides again after ${CredentialRevealPolicy.AUTO_HIDE_MILLIS / 1000}s. Copy follows the Privacy Center clipboard timeout; Android may retain clipboard data after process death.",
                            "يتطلب الإظهار جلسة موثّقة خلال ${CredentialRevealPolicy.RECENT_SESSION_MILLIS / 1000} ثانية ماضية ويختفي بعد ${CredentialRevealPolicy.AUTO_HIDE_MILLIS / 1000} ثانية. يتبع النسخ مهلة الحافظة في مركز الخصوصية؛ قد يحتفظ أندرويد ببيانات الحافظة بعد إنهاء العملية.",
                        ),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Faint,
                    )
                }
                Spacer(Modifier.height(10.dp))

                if (payload.notes.isNotBlank()) {
                    GlassCard(Modifier.fillMaxWidth()) {
                        SectionLabel(tr("Notes", "ملاحظات"))
                        Spacer(Modifier.height(6.dp))
                        Text(payload.notes, style = MaterialTheme.typography.bodySmall)
                    }
                    Spacer(Modifier.height(10.dp))
                }

                if (editing) {
                    GlassCard(Modifier.fillMaxWidth()) {
                        SectionLabel(tr("Edit", "تعديل"))
                        Spacer(Modifier.height(6.dp))
                        KnouxTextField(title, { title = it }, tr("Title", "العنوان"), singleLine = true)
                        Spacer(Modifier.height(6.dp))
                        KnouxTextField(username, { username = it }, tr("Username", "اسم المستخدم"), singleLine = true)
                        Spacer(Modifier.height(6.dp))
                        KnouxTextField(
                            secret,
                            { secret = it },
                            tr("Password", "كلمة المرور"),
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                        )
                        Spacer(Modifier.height(6.dp))
                        KnouxTextField(
                            origin,
                            { origin = it },
                            tr("Origin (https://…)", "المصدر (https://…)"),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        )
                        val editVerdict = CredentialOrigins.validate(origin)
                        if (editVerdict is OriginVerdict.Invalid) {
                            Text(
                                originReason(editVerdict.reason),
                                color = KnouxColors.Alert,
                                style = MaterialTheme.typography.labelSmall,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                        KnouxTextField(notes, { notes = it }, tr("Notes", "ملاحظات"), minLines = 2)
                        Spacer(Modifier.height(8.dp))
                        val preview = PasswordStrength.evaluate(secret)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            StatusPill(levelLabel(preview.level), tone = levelColor(preview.level))
                            Spacer(Modifier.width(6.dp))
                            Text(
                                tr("new value strength", "قوة القيمة الجديدة"),
                                style = MaterialTheme.typography.labelSmall,
                                color = KnouxColors.Muted,
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        KnouxGhostButton(tr("Generate", "توليد"), { showGenerator = !showGenerator })
                        if (showGenerator) {
                            GeneratorPanel(
                                onUse = { value ->
                                    secret = value
                                    showGenerator = false
                                },
                                generate = { options -> viewModel.generate(options) },
                            )
                        }
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            KnouxPrimaryButton(
                                text = if (state.busy) tr("Saving…", "جارٍ الحفظ…") else tr("Save changes", "حفظ التغييرات"),
                                onClick = {
                                    viewModel.save(
                                        PasswordPayload(
                                            title = title.trim(),
                                            username = username.trim(),
                                            password = secret,
                                            url = origin.trim(),
                                            notes = notes,
                                            revisions = payload.revisions,
                                        ),
                                    )
                                    editing = false
                                },
                                enabled = !state.busy && title.isNotBlank() &&
                                    CredentialOrigins.validate(origin).isAccepted,
                            )
                        }
                        TextButton(onClick = {
                            editing = false
                            if (stored != null) {
                                title = stored.title
                                username = stored.username
                                secret = stored.password
                                origin = stored.url
                                notes = stored.notes
                            }
                        }) { Text(tr("Cancel without saving", "إلغاء دون حفظ"), color = KnouxColors.Muted) }
                        if (state.savedOnce && !state.busy) {
                            Text(
                                tr("Saved as a new encrypted revision.", "حُفظت نسخة مشفرة جديدة."),
                                color = KnouxColors.Success,
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                } else {
                    KnouxGhostButton(tr("Edit credential", "تعديل الاعتماد"), { editing = true; state.message?.let { viewModel.clearMessage() } })
                    Spacer(Modifier.height(8.dp))
                }

                if (payload.revisions.isNotEmpty()) {
                    GlassCard(Modifier.fillMaxWidth()) {
                        SectionLabel(tr("History", "السجل"))
                        Spacer(Modifier.height(6.dp))
                        Text(
                            tr(
                                "Metadata only: previous secret values are never stored, so no past password can be shown or recovered here.",
                                "بيانات وصفية فقط: قيم الأسرار السابقة لا تُخزن أبدًا، لذلك لا يمكن عرض أي كلمة مرور سابقة أو استعادتها هنا.",
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            color = KnouxColors.Faint,
                        )
                        Spacer(Modifier.height(6.dp))
                        payload.revisions.forEach { revision ->
                            InfoRow(
                                formatter.format(Date(revision.savedAt)),
                                "${revision.strength} · ${revision.changed.joinToString(", ")}",
                            )
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                }

                if (state.events.isNotEmpty()) {
                    GlassCard(Modifier.fillMaxWidth()) {
                        SectionLabel(tr("This session", "هذه الجلسة"))
                        Spacer(Modifier.height(6.dp))
                        Text(
                            tr(
                                "Reveal, copy and save events are held in memory only and are cleared when the vault locks. They are never written to disk.",
                                "تُحتفظ أحداث الإظهار والنسخ والحفظ في الذاكرة فقط وتُمسح عند قفل الخزنة. ولا تُكتب على القرص أبدًا.",
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            color = KnouxColors.Faint,
                        )
                        Spacer(Modifier.height(6.dp))
                        state.events.takeLast(8).reversed().forEach { event ->
                            InfoRow(eventKind(event.kind), formatter.format(Date(event.atMillis)))
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = onOpenAudit) {
                        Text(tr("Run password audit", "تشغيل تدقيق كلمات المرور"), color = KnouxColors.Violet, fontSize = 11.sp)
                    }
                    TextButton(onClick = { pendingDelete = true }) {
                        Text(tr("Delete record", "حذف السجل"), color = KnouxColors.Alert, fontSize = 11.sp)
                    }
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Text(
            tr(
                "Plaintext never enters SavedStateHandle, logs, database columns or the clipboard outside the managed lease. Screenshots are blocked while that policy is on.",
                "لا يدخل النص الصريح إلى SavedStateHandle أو السجلات أو أعمدة قاعدة البيانات أو الحافظة خارج العقد المُدار. وتُحجب لقطات الشاشة ما دامت هذه السياسة مفعّلة.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Faint,
        )
        Spacer(Modifier.height(24.dp))
    }

    if (pendingDelete) {
        AlertDialog(
            onDismissRequest = { pendingDelete = false },
            title = { Text(tr("Delete this credential?", "حذف هذا الاعتماد؟")) },
            text = {
                Text(
                    tr(
                        "Deletes the encrypted record. Original data is not replaced by anything, and this cannot be undone from inside the app.",
                        "يحذف السجل المشفر. البيانات الأصلية لا تُستبدل بشيء، ولا يمكن التراجع عن ذلك من داخل التطبيق.",
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = false
                    viewModel.delete()
                }) { Text(tr("Delete", "حذف"), color = KnouxColors.Alert) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = false }) { Text(tr("Cancel", "إلغاء")) }
            },
        )
    }
}

@Composable
private fun GeneratorPanel(onUse: (String) -> Unit, generate: (PasswordGenerator.Options) -> String) {
    var length by remember { mutableStateOf(20f) }
    var upper by remember { mutableStateOf(true) }
    var lower by remember { mutableStateOf(true) }
    var digits by remember { mutableStateOf(true) }
    var symbols by remember { mutableStateOf(true) }
    var value by remember { mutableStateOf("") }
    val options = PasswordGenerator.Options(length.toInt(), lower, upper, digits, symbols)

    Column(Modifier.fillMaxWidth()) {
        SectionLabel(tr("Local generator", "مولّد محلي"))
        Text(
            tr(
                "java.security.SecureRandom, uniform over the selected classes, at least one character from each. No hardware RNG claim. The value stays in memory until you use it.",
                "java.security.SecureRandom، توزيع منتظم على الفئات المختارة، وحرف واحد على الأقل من كل فئة. لا ادعاء بعتاد مولّد. تبقى القيمة في الذاكرة حتى تستخدمها.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Faint,
        )
        Spacer(Modifier.height(6.dp))
        Slider(
            value = length,
            onValueChange = { length = it },
            valueRange = PasswordGenerator.MIN_LENGTH.toFloat()..PasswordGenerator.MAX_LENGTH.toFloat(),
            steps = PasswordGenerator.MAX_LENGTH - PasswordGenerator.MIN_LENGTH - 1,
            colors = SliderDefaults.colors(thumbColor = KnouxColors.Violet, activeTrackColor = KnouxColors.VioletDeep),
        )
        Text(
            tr("Length: ${length.toInt()}", "الطول: ${length.toInt()}"),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ToggleChip(tr("UPPER", "أحرف كبيرة"), upper) { upper = it }
            ToggleChip(tr("lower", "أحرف صغيرة"), lower) { lower = it }
            ToggleChip(tr("123", "أرقام"), digits) { digits = it }
            ToggleChip(tr("!@#", "رموز"), symbols) { symbols = it }
        }
        Spacer(Modifier.height(6.dp))
        KnouxGhostButton(
            tr("Generate", "توليد"),
            { value = if (options.anyClass) generate(options) else "" },
            enabled = options.anyClass,
        )
        if (value.isNotEmpty()) {
            Spacer(Modifier.height(6.dp))
            Text(value, style = MaterialTheme.typography.bodySmall, color = KnouxColors.Text)
            Spacer(Modifier.height(4.dp))
            TextButton(onClick = { onUse(value) }) {
                Text(tr("Use this value", "استخدم هذه القيمة"), color = KnouxColors.Violet, fontSize = 11.sp)
            }
        }
        if (!options.anyClass) {
            Text(
                tr("Select at least one character class.", "اختر فئة أحرف واحدة على الأقل."),
                color = KnouxColors.Alert,
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}

@Composable
private fun ToggleChip(label: String, selected: Boolean, onChange: (Boolean) -> Unit) {
    TextButton(onClick = { onChange(!selected) }) {
        Text(
            label,
            color = if (selected) KnouxColors.Violet else KnouxColors.Faint,
            fontSize = 11.sp,
        )
    }
}

@Composable
private fun eventKind(kind: String): String = when (kind) {
    "reveal" -> tr("revealed", "أُظهر")
    "copy-secret" -> tr("secret copied", "نُسخ السر")
    "copy-username" -> tr("username copied", "نُسخ اسم المستخدم")
    "copy-origin" -> tr("origin copied", "نُسخ المصدر")
    "save" -> tr("saved", "حُفظ")
    else -> tr("accessed", "وُصل إليه")
}

@Composable
private fun originReason(reason: String): String = when (reason) {
    CredentialOrigins.REASON_UNSUPPORTED_SCHEME ->
        tr("Only http or https origins are accepted.", "تُقبل مصادر http أو https فقط.")
    CredentialOrigins.REASON_MISSING_HOST ->
        tr("The origin needs a host name.", "يحتاج المصدر إلى اسم مضيف.")
    CredentialOrigins.REASON_EMBEDDED_CREDENTIALS ->
        tr("An origin must not embed a user name or password.", "يجب ألا يضمّن المصدر اسم مستخدم أو كلمة مرور.")
    CredentialOrigins.REASON_BLANK_HOST ->
        tr("The origin has no host.", "المصدر بلا مضيف.")
    CredentialOrigins.REASON_TOO_LONG ->
        tr("The origin is too long.", "المصدر طويل جدًا.")
    CredentialOrigins.REASON_CONTROL_CHARS ->
        tr("The origin contains control characters.", "يحتوي المصدر على أحرف تحكم.")
    CredentialOrigins.REASON_SPACES ->
        tr("The origin contains spaces.", "يحتوي المصدر على مسافات.")
    else -> tr("The origin is not valid.", "المصدر غير صالح.")
}

@Composable
private fun metricReasons(flags: Set<StrengthFlag>): List<String> = flags.mapNotNull { flag ->
    when (flag) {
        StrengthFlag.BLANK -> tr("no secret stored", "لا يوجد سر مخزن")
        StrengthFlag.VERY_SHORT -> tr("very short", "قصيرة جدًا")
        StrengthFlag.SHORT -> tr("short", "قصيرة")
        StrengthFlag.LOW_CHARSET -> tr("single character class", "فئة أحرف واحدة")
        StrengthFlag.REPEATED_RUN -> tr("repeated characters", "أحرف مكررة متتالية")
        StrengthFlag.SEQUENTIAL_RUN -> tr("alphabetical or numeric run", "تتابع أبجدي أو رقمي")
        StrengthFlag.KEYBOARD_RUN -> tr("keyboard row", "نمط لوحة مفاتيح")
        StrengthFlag.YEAR_LIKE -> tr("year-like digits", "أرقام تشبه سنة")
        StrengthFlag.SYMBOL_ONLY -> tr("symbols only", "رموز فقط")
        StrengthFlag.REPEATED_UNIT -> tr("repeated fragment", "مقطع مكرر")
        StrengthFlag.COMMON_WORD -> tr("known weak secret", "سر ضعيف معروف")
        StrengthFlag.COMMON_WORD_WRAPPED -> tr("known weak secret with affixes", "سر ضعيف معروف مع إضافات")
        StrengthFlag.NON_ASCII -> null
    }
}
