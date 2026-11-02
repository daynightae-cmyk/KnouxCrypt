package com.knoux.crypt.ui

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.Capsule
import com.knoux.crypt.data.CapsuleFailure
import com.knoux.crypt.data.CapsulePolicy
import com.knoux.crypt.data.CapsuleRejectedException
import com.knoux.crypt.data.CapsuleState
import com.knoux.crypt.data.CapsuleService
import com.knoux.crypt.data.VaultAccess
import com.knoux.crypt.data.VaultLockedException
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class SecretCapsuleViewModel(
    application: Application,
    private val container: AppContainer,
) : AndroidViewModel(application) {
    private val service: CapsuleService = container.secretCapsule

    private val _capsules = MutableStateFlow<List<Capsule>>(emptyList())
    val capsules: StateFlow<List<Capsule>> = _capsules.asStateFlow()

    private val _message = MutableStateFlow<BilingualText?>(null)
    val message: StateFlow<BilingualText?> = _message.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    val unlocked: StateFlow<Boolean> = container.session.unlocked

    init {
        viewModelScope.launch {
            container.session.unlocked.collectLatest { isUnlocked ->
                if (!isUnlocked) {
                    _capsules.value = emptyList()
                    return@collectLatest
                }
                val access = container.session.currentAccess() ?: return@collectLatest
                runCatching {
                    service.observe(access).collect { rows -> _capsules.value = rows }
                }
            }
        }
    }

    fun create(label: String, secret: String, ttlMillis: Long, maxOpens: Int) {
        val access = container.session.currentAccess() ?: return say(locked)
        viewModelScope.launch {
            _busy.value = true
            val outcome = runCatching { service.create(access, label, secret, ttlMillis, maxOpens) }
            _busy.value = false
            outcome.onSuccess { say(BilingualText("Capsule created.", "أُنشئت الكبسولة.")) }
                .onFailure { say(BilingualText(describe(it), describeAr(it))) }
        }
    }

    fun reveal(capsule: Capsule, onSecret: (String) -> Unit) {
        val access = container.session.currentAccess() ?: return say(locked)
        viewModelScope.launch {
            _busy.value = true
            val outcome = runCatching { service.reveal(access, capsule.id) }
            _busy.value = false
            outcome.onSuccess { secret ->
                onSecret(secret)
                say(
                    BilingualText(
                        "One open consumed. The secret is shown in memory only and is not copied anywhere.",
                        "استُهلك فتح واحد. يُعرض السر في الذاكرة فقط ولا يُنسخ إلى أي مكان.",
                    ),
                )
            }.onFailure { say(BilingualText(describe(it), describeAr(it))) }
        }
    }

    fun revoke(capsule: Capsule) {
        val access = container.session.currentAccess() ?: return say(locked)
        viewModelScope.launch {
            runCatching { service.revoke(access, capsule.id) }
                .onSuccess {
                    say(
                        BilingualText(
                            "Revoked on this device. Any package you already shared is unaffected and cannot be recalled.",
                            "أُلغيت على هذا الجهاز. أي حزمة شاركتها سابقًا لا تتأثر ولا يمكن استرجاعها.",
                        ),
                    )
                }
                .onFailure { say(BilingualText(describe(it), describeAr(it))) }
        }
    }

    fun delete(capsule: Capsule) {
        val access = container.session.currentAccess() ?: return say(locked)
        viewModelScope.launch {
            runCatching { service.delete(access, capsule.id) }
                .onSuccess { say(BilingualText("Capsule record deleted.", "حُذف سجل الكبسولة.")) }
                .onFailure { say(BilingualText(describe(it), describeAr(it))) }
        }
    }

    /**
     * Seals the capsule and writes it only to the document location the user chose
     * through the Storage Access Framework. Nothing is written to shared storage
     * implicitly, and a partial write is reported rather than hidden.
     */
    fun shareTo(target: android.net.Uri, capsuleId: String, passphrase: String) {
        val access = container.session.currentAccess() ?: return say(locked)
        viewModelScope.launch {
            _busy.value = true
            val outcome = runCatching {
                val bytes = service.sharePackage(access, capsuleId, passphrase.toCharArray())
                val stream = getApplication<Application>().contentResolver.openOutputStream(target)
                    ?: error("The chosen destination could not be opened")
                stream.use { it.write(bytes) }
                bytes.size
            }
            _busy.value = false
            outcome.onSuccess { size ->
                say(
                    BilingualText(
                        "Sealed package written ($size bytes) to the location you chose. A recipient who keeps a copy cannot be stopped from opening it before the stated expiry, and a copied ciphertext cannot be revoked.",
                        "كُتبت الحزمة المختومة ($size بايت) في الموقع الذي اخترته. لا يمكن منع من احتفظ بنسخة من فتحها قبل تاريخ الانتهاء المعلن، ولا يمكن إلغاء نسخة مشفرة مُسلَّمة.",
                    ),
                )
            }.onFailure {
                say(
                    BilingualText(
                        "The package was not written: ${it.javaClass.simpleName}",
                        "لم تُكتب الحزمة: ${it.javaClass.simpleName}",
                    ),
                )
            }
        }
    }

    private val locked = BilingualText("The vault is locked.", "الخزنة مقفلة.")

    private fun say(text: BilingualText) { _message.value = text }

    fun consumeMessage() { _message.value = null }

    private fun describe(failure: Throwable): String = when {
        failure is CapsuleRejectedException -> when (failure.failure) {
            CapsuleFailure.EXPIRED -> "The capsule has expired, so nothing was revealed."
            CapsuleFailure.SPENT -> "This capsule has used all of its allowed opens."
            CapsuleFailure.REVOKED -> "This capsule was revoked."
            CapsuleFailure.NOT_FOUND -> "The capsule record no longer exists."
            CapsuleFailure.UNREADABLE -> "The capsule ciphertext failed authentication."
            CapsuleFailure.CONCURRENT_UPDATE -> "Another open changed this capsule first; try again."
            CapsuleFailure.LOCKED -> "The vault locked during the operation."
            else -> "The capsule could not be opened: ${failure.failure.name}"
        }
        failure is VaultLockedException -> "The vault locked during the operation."
        failure is IllegalArgumentException -> "The capsule settings were rejected: ${failure.message}"
        else -> "The capsule could not be processed: ${failure.javaClass.simpleName}"
    }

    private fun describeAr(failure: Throwable): String = when {
        failure is CapsuleRejectedException -> when (failure.failure) {
            CapsuleFailure.EXPIRED -> "انتهت صلاحية الكبسولة، لذلك لم يُكشف شيء."
            CapsuleFailure.SPENT -> "استهلكت هذه الكبسولة كل عمليات الفتح المسموحة."
            CapsuleFailure.REVOKED -> "أُلغيت هذه الكبسولة."
            CapsuleFailure.NOT_FOUND -> "لم يعد سجل الكبسولة موجودًا."
            CapsuleFailure.UNREADABLE -> "فشل التحقق من نص الكبسولة المشفر."
            CapsuleFailure.CONCURRENT_UPDATE -> "غيّر فتح آخر هذه الكبسولة أولًا؛ أعد المحاولة."
            CapsuleFailure.LOCKED -> "أُقفلت الخزنة أثناء العملية."
            else -> "تعذر فتح الكبسولة: ${failure.failure.name}"
        }
        failure is VaultLockedException -> "أُقفلت الخزنة أثناء العملية."
        failure is IllegalArgumentException -> "رُفضت إعدادات الكبسولة: ${failure.message}"
        else -> "تعذرت معالجة الكبسولة: ${failure.javaClass.simpleName}"
    }
}

@Composable
fun SecretCapsuleScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
    onOpenShare: () -> Unit,
) {
    val application = LocalContext.current.applicationContext as Application
    val viewModel: SecretCapsuleViewModel = viewModel(
        factory = viewModelFactory { SecretCapsuleViewModel(application, container) },
    )
    val capsules by viewModel.capsules.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val unlocked by viewModel.unlocked.collectAsStateWithLifecycle()

    var showCreate by remember { mutableStateOf(false) }
    var revealed by remember { mutableStateOf<Pair<String, String>?>(null) }
    var pendingDelete by remember { mutableStateOf<Capsule?>(null) }
    var pendingRevoke by remember { mutableStateOf<Capsule?>(null) }
    var shareTarget by remember { mutableStateOf<Capsule?>(null) }
    var pendingShare by remember { mutableStateOf<Pair<Capsule, String>?>(null) }

    val savePackage = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream"),
    ) { uri ->
        val pair = pendingShare
        pendingShare = null
        if (uri != null && pair != null) {
            viewModel.shareTo(uri, pair.first.id, pair.second)
        }
    }

    LaunchedEffect(message) {
        if (message != null) {
            kotlinx.coroutines.delay(9_000)
            viewModel.consumeMessage()
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Expiring Secret", "سر منتهٍ"), onBack)
        Text(
            tr("SHARE / EXPIRY", "مشاركة / انتهاء").uppercase(),
            style = MaterialTheme.typography.labelSmall,
            letterSpacing = 2.sp,
            color = KnouxColors.Violet,
        )
        Text(
            tr("Expiring secret", "سر منتهٍ"),
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            tr(
                "Prepare a time-limited encrypted message for sharing.",
                "جهّز رسالة مشفرة محدودة الزمن للمشاركة.",
            ),
            style = MaterialTheme.typography.bodySmall,
            color = KnouxColors.Muted,
        )
        Spacer(Modifier.height(10.dp))

        message?.let {
            Text(
                tr(it.english, it.arabic),
                style = MaterialTheme.typography.bodySmall,
                color = KnouxColors.Warn,
            )
            Spacer(Modifier.height(8.dp))
        }

        if (!unlocked) {
            GlassCard(Modifier.fillMaxWidth()) {
                Text(
                    tr(
                        "Authenticate to create or open capsules. Capsules are stored as encrypted vault records, so their expiry and open limit are protected by the same authentication as the secret itself.",
                        "صادق لإنشاء أو فتح الكبسولات. تُحفظ الكبسولات كسجلات خزنة مشفرة، لذا يحمي التحقق تاريخ الانتهاء وحد الفتح كما يحمي السر نفسه.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(Modifier.height(8.dp))
                KnouxPrimaryButton(tr("Authenticate", "المصادقة"), onNeedUnlock)
            }
            return@Column
        }

        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item(key = "hero") { HeroBand(capsules.size) }
            item(key = "compose") {
                ComposeCard(onCreate = { showCreate = true }, busy = busy, count = capsules.size)
            }
            item(key = "policy") { PolicyCard() }
            item(key = "list-header") {
                SectionLabel(tr("Your capsules", "كبسولاتك"))
            }
            if (capsules.isEmpty()) {
                item(key = "empty") {
                    GlassCard(Modifier.fillMaxWidth()) {
                        Text(
                            tr(
                                "No capsule created yet. Nothing is stored until you create one.",
                                "لم تُنشأ أي كبسولة بعد. لا يُخزن شيء قبل الإنشاء.",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
            items(capsules, key = { it.id }) { capsule ->
                CapsuleRow(
                    capsule = capsule,
                    revealed = revealed?.first == capsule.id,
                    onReveal = { viewModel.reveal(capsule) { secret -> revealed = capsule.id to secret } },
                    onRevoke = { pendingRevoke = capsule },
                    onDelete = { pendingDelete = capsule },
                    onShare = { shareTarget = capsule },
                    onHide = { revealed = null },
                )
            }
            item(key = "delivery") {
                DeliveryCard(onOpenShare = onOpenShare)
            }
            item(key = "warning") { LimitationCard() }
            item(key = "spacer") { Spacer(Modifier.height(12.dp)) }
        }
    }

    if (showCreate) {
        CreateCapsuleDialog(
            busy = busy,
            onConfirm = { label, secret, ttl, maxOpens ->
                showCreate = false
                viewModel.create(label, secret, ttl, maxOpens)
            },
            onDismiss = { showCreate = false },
        )
    }

    pendingRevoke?.let { capsule ->
        ConfirmDialog(
            title = tr("Revoke this capsule?", "إلغاء هذه الكبسولة؟"),
            body = tr(
                "This stops this device from ever revealing it again. It does not delete the record, and it cannot recall a package you already shared.",
                "يمنع هذا الجهاز من كشفها مجددًا. لا يحذف السجل، ولا يستطيع استرجاع حزمة شاركتها بالفعل.",
            ),
            confirmLabel = tr("Revoke", "إلغاء الترخيص"),
            onConfirm = {
                pendingRevoke = null
                viewModel.revoke(capsule)
            },
            onDismiss = { pendingRevoke = null },
        )
    }

    pendingDelete?.let { capsule ->
        ConfirmDialog(
            title = tr("Delete the capsule record?", "حذف سجل الكبسولة؟"),
            body = tr(
                "Removes the encrypted record from this vault. This cannot be undone here, and any package already shared still exists elsewhere.",
                "يزيل السجل المشفر من هذه الخزنة. لا يمكن التراجع هنا، وأي حزمة شُاركت سابقًا تبقى في مكان آخر.",
            ),
            confirmLabel = tr("Delete", "حذف"),
            onConfirm = {
                pendingDelete = null
                viewModel.delete(capsule)
            },
            onDismiss = { pendingDelete = null },
        )
    }

    shareTarget?.let { capsule ->
        ShareCapsuleDialog(
            capsule = capsule,
            busy = busy,
            onConfirm = { passphrase ->
                // A suggested name only; the user picks the real destination.
                val name = (capsule.payload?.label?.take(24)?.replace(Regex("[^A-Za-z0-9._-]"), "_") ?: "capsule") + ".knp"
                shareTarget = null
                pendingShare = capsule to passphrase
                savePackage.launch(name)
            },
            onDismiss = { shareTarget = null },
        )
    }
}

@Composable
private fun HeroBand(count: Int) {
    val shape = RoundedCornerShape(20.dp)
    // Hoisted: tr() is a composable function and cannot be called inside semantics {}.
    val heroDescription = if (count == 1) {
        tr("One capsule stored", "كبسولة واحدة محفوظة")
    } else {
        tr("$count capsules stored", "$count كبسولة محفوظة")
    }
    Box(
        Modifier
            .fillMaxWidth()
            .height(120.dp)
            .clip(shape)
            .background(
                Brush.radialGradient(
                    listOf(KnouxColors.Violet.copy(alpha = 0.45f), KnouxColors.Sealed, Color.Transparent),
                ),
            )
            .border(1.dp, KnouxColors.Line, shape)
            .semantics { contentDescription = heroDescription },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("⚿", color = KnouxColors.VioletSoft, fontSize = 34.sp, modifier = Modifier.clearAndSetSemantics { })
            Spacer(Modifier.height(6.dp))
            Box(
                Modifier
                    .clip(CircleShape)
                    .background(Color(0x661B0D2B))
                    .border(1.dp, KnouxColors.Violet.copy(alpha = 0.5f), CircleShape)
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            ) {
                Text(
                    tr("Expire by policy", "تنتهي بالسياسة"),
                    fontSize = 9.sp,
                    letterSpacing = 1.sp,
                    color = KnouxColors.Violet,
                )
            }
        }
    }
}

@Composable
private fun ComposeCard(onCreate: () -> Unit, busy: Boolean, count: Int) {
    GlassCard(
        Modifier.fillMaxWidth(),
        borderColor = KnouxColors.Violet.copy(alpha = 0.45f),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                tr("SECRET CAPSULE", "كبسولة سرية").uppercase(),
                style = MaterialTheme.typography.labelMedium,
                letterSpacing = 1.5.sp,
                modifier = Modifier.weight(1f),
            )
            StatusPill(
                text = if (count == 0) tr("Not created", "لم تُنشأ") else tr("$count stored", "$count محفوظة"),
                tone = if (count == 0) KnouxColors.Faint else KnouxColors.Success,
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "The secret is stored only inside an encrypted vault record. It is never shown in this list until you deliberately spend an open.",
                "لا يُخزن السر إلا داخل سجل خزنة مشفر. ولا يُعرض في هذه القائمة حتى تستهلك عملية فتح عمدًا.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Faint,
        )
        Spacer(Modifier.height(10.dp))
        KnouxPrimaryButton(
            text = tr("Configure secret capsule", "إعداد كبسولة سرية"),
            onClick = onCreate,
            enabled = !busy,
        )
    }
}

@Composable
private fun PolicyCard() {
    // Precomputed outside the joinToString lambda, which is not a composable context.
    val ttlLabels = CapsulePolicy.TTL_CHOICES_MILLIS.map { ttlLabel(it) }.joinToString(" ")
    GlassCard(Modifier.fillMaxWidth()) {
        Text(tr("Access policy", "سياسة الوصول"), style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(8.dp))
        PolicyLine(
            "◷",
            tr("Expires after", "تنتهي بعد"),
            tr("Measured against this device's clock", "تُقاس بساعة هذا الجهاز"),
            ttlLabels,
        )
        PolicyLine(
            "◉",
            tr("Maximum opens", "أقصى عدد للفتح"),
            tr("Enforced by an authenticated record update", "يُفرض بتحديث سجل موثَّق"),
            CapsulePolicy.MAX_OPEN_CHOICES.joinToString(" / "),
        )
        PolicyLine(
            "⚿",
            tr("Recipient protection", "حماية المستلم"),
            tr("There is no recipient directory or verification service", "لا يوجد دليل مستلمين ولا خدمة تحقق"),
            tr("Passphrase (KNP2 / Argon2id)", "عبارة مرور (KNP2 / Argon2id)"),
        )
        PolicyLine(
            "⛓",
            tr("Delivery method", "طريقة التسليم"),
            tr("You carry the sealed package yourself", "تنقل الحزمة المختومة بنفسك"),
            tr("Save a sealed package", "حفظ حزمة مختومة"),
        )
    }
}

@Composable
private fun PolicyLine(glyph: String, title: String, subtitle: String, value: String) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(30.dp)
                .clip(CircleShape)
                .background(KnouxColors.Sealed)
                .clearAndSetSemantics { },
            contentAlignment = Alignment.Center,
        ) {
            Text(glyph, color = KnouxColors.Violet, fontSize = 13.sp)
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium)
            Text(subtitle, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Faint)
        }
        Text(
            value,
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Violet,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.End,
            modifier = Modifier.width(140.dp),
        )
    }
}

@Composable
private fun CapsuleRow(
    capsule: Capsule,
    revealed: Boolean,
    onReveal: () -> Unit,
    onRevoke: () -> Unit,
    onDelete: () -> Unit,
    onShare: () -> Unit,
    onHide: () -> Unit,
) {
    val shape = RoundedCornerShape(16.dp)
    val tone = stateColor(capsule.state)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Color(0x66150B24))
            .border(1.dp, KnouxColors.Line, shape)
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    capsule.payload?.label ?: tr("Unreadable capsule", "كبسولة غير قابلة للقراءة"),
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    stateDetail(capsule),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
            }
            StatusPill(stateLabel(capsule.state), tone)
        }
        if (revealed) {
            Spacer(Modifier.height(8.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(KnouxColors.Obsidian)
                    .padding(10.dp),
            ) {
                Text(
                    capsule.payload?.let { "•".repeat(12) } ?: "—",
                    style = MaterialTheme.typography.bodySmall,
                    color = KnouxColors.Muted,
                )
            }
            Text(
                tr(
                    "The revealed value is held in memory on this screen only. It is not written to disk, the clipboard or logs, and it disappears when you hide it or leave.",
                    "تُحتفظ القيمة المكشوفة في ذاكرة هذه الشاشة فقط. ولا تُكتب على القرص أو في الحافظة أو السجلات، وتزول عند الإخفاء أو المغادرة.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
            TextButton(onClick = onHide) { Text(tr("Hide", "إخفاء"), color = KnouxColors.Violet) }
        }
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            TextButton(onClick = onReveal, enabled = capsule.state == CapsuleState.ACTIVE) {
                Text(tr("Open once", "فتح مرة"), color = if (capsule.state == CapsuleState.ACTIVE) KnouxColors.Violet else KnouxColors.Faint)
            }
            TextButton(onClick = onShare, enabled = capsule.state == CapsuleState.ACTIVE) {
                Text(tr("Seal package", "ختم حزمة"), color = if (capsule.state == CapsuleState.ACTIVE) KnouxColors.Violet else KnouxColors.Faint)
            }
            TextButton(onClick = onRevoke, enabled = capsule.state == CapsuleState.ACTIVE) {
                Text(tr("Revoke", "إلغاء"), color = if (capsule.state == CapsuleState.ACTIVE) KnouxColors.Warn else KnouxColors.Faint)
            }
            TextButton(onClick = onDelete) { Text(tr("Delete", "حذف"), color = KnouxColors.Alert) }
        }
    }
}

@Composable
private fun DeliveryCard(onOpenShare: () -> Unit) {
    GlassCard(Modifier.fillMaxWidth()) {
        Text(tr("Secret delivery", "تسليم السر"), style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(6.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0x44150B24))
                .border(1.dp, KnouxColors.Line, RoundedCornerShape(12.dp))
                .padding(12.dp),
        ) {
            Column {
                Text(
                    tr("No package written yet", "لم تُكتب أي حزمة بعد"),
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                )
                Text(
                    tr(
                        "This app does not host links, run a server, or verify recipients.",
                        "لا يستضيف هذا التطبيق روابط ولا يشغّل خادمًا ولا يتحقق من المستلمين.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        TextButton(onClick = onOpenShare) {
            Text(tr("Open Secure Share", "فتح المشاركة الآمنة"), color = KnouxColors.Violet)
        }
    }
}

@Composable
private fun LimitationCard() {
    val shape = RoundedCornerShape(14.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Color(0x551B0D2B))
            .border(1.dp, KnouxColors.Line, shape)
            .padding(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text("⚠", color = KnouxColors.Warn, fontSize = 15.sp, modifier = Modifier.clearAndSetSemantics { })
        Spacer(Modifier.width(10.dp))
        Text(
            tr(
                "Expiry cannot revoke screenshots or copies already made by recipients. Local expiry and open counts are enforced against this device's clock and this device's record; a recipient who sets their clock back can reopen a copy they hold.",
                "لا يستطيع الانتهاء إلغاء لقطات الشاشة أو النسخ التي صنعها المستلمون. يُطبق الانتهاء المحلي وحد الفتح على ساعة هذا الجهاز وسجله؛ ويمكن لمن يحتفظ بنسخة إعادة فتحها بتقديم ساعة جهازه.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Muted,
        )
    }
}

@Composable
private fun CreateCapsuleDialog(
    busy: Boolean,
    onConfirm: (String, String, Long, Int) -> Unit,
    onDismiss: () -> Unit,
) {
    var label by remember { mutableStateOf("") }
    var secret by remember { mutableStateOf("") }
    var ttl by remember { mutableStateOf(CapsulePolicy.TTL_CHOICES_MILLIS[3]) }
    var maxOpens by remember { mutableStateOf(CapsulePolicy.MAX_OPEN_CHOICES[0]) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(tr("New expiring capsule", "كبسولة منتهية جديدة")) },
        text = {
            Column {
                OutlinedTextField(
                    value = label,
                    onValueChange = { if (it.length <= CapsulePolicy.MAX_LABEL_CHARS) label = it },
                    label = { Text(tr("Label", "التسمية")) },
                    singleLine = true,
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = secret,
                    onValueChange = { if (it.length <= CapsulePolicy.MAX_SECRET_CHARS) secret = it },
                    label = { Text(tr("Secret", "السر")) },
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                    minLines = 2,
                )
                Spacer(Modifier.height(10.dp))
                Text(tr("Expires after", "تنتهي بعد"), style = MaterialTheme.typography.labelSmall)
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CapsulePolicy.TTL_CHOICES_MILLIS.forEach { choice ->
                        ChoiceChip(ttlLabel(choice), ttl == choice) { ttl = choice }
                    }
                }
                Text(tr("Maximum opens", "أقصى عدد للفتح"), style = MaterialTheme.typography.labelSmall)
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CapsulePolicy.MAX_OPEN_CHOICES.forEach { choice ->
                        ChoiceChip("$choice", maxOpens == choice) { maxOpens = choice }
                    }
                }
                Text(
                    tr(
                        "The label and the secret are stored only inside the encrypted vault record, authenticated together with the expiry and the open limit.",
                        "تُحفظ التسمية والسر داخل سجل الخزنة المشفر فقط، ويُوثَّقان معًا مع تاريخ الانتهاء وحد الفتح.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(label, secret, ttl, maxOpens) },
                enabled = !busy && label.isNotBlank() && secret.isNotEmpty(),
            ) {
                Text(tr("Create", "إنشاء"), color = KnouxColors.Violet)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("Cancel", "إلغاء")) } },
    )
}

@Composable
private fun ShareCapsuleDialog(capsule: Capsule, busy: Boolean, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var passphrase by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(tr("Seal a copy for sharing", "ختم نسخة للمشاركة")) },
        text = {
            Column {
                OutlinedTextField(
                    value = passphrase,
                    onValueChange = { passphrase = it },
                    label = { Text(tr("Recipient passphrase", "عبارة مرور المستلم")) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    tr(
                        "The package carries its own expiry inside the authenticated ciphertext, so altering it fails authentication. It cannot be revoked after you hand it over, and the open limit is not enforceable on a copy.",
                        "تحمل الحزمة تاريخ انتهائها داخل النص المشفر الموثَّق، لذا يعدّلها يفشل التحقق. ولا يمكن إلغاؤها بعد التسليم، كما لا يمكن فرض حد الفتح على نسخة.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Warn,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(passphrase) },
                enabled = !busy && passphrase.isNotEmpty(),
            ) {
                Text(tr("Choose where to save", "اختيار موقع الحفظ"), color = KnouxColors.Violet)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("Cancel", "إلغاء")) } },
    )
}

@Composable
private fun ConfirmDialog(
    title: String,
    body: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body, style = MaterialTheme.typography.bodySmall) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(confirmLabel, color = KnouxColors.Alert) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("Cancel", "إلغاء")) } },
    )
}

@Composable
private fun ChoiceChip(text: String, selected: Boolean, onSelect: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Box(
        Modifier
            .clip(shape)
            .background(if (selected) KnouxColors.Violet.copy(alpha = 0.32f) else Color(0x55150B24))
            .border(1.dp, if (selected) KnouxColors.Violet else KnouxColors.Line, shape)
            .clickable(onClick = onSelect)
            .padding(horizontal = 8.dp, vertical = 5.dp),
    ) {
        Text(text, style = MaterialTheme.typography.labelSmall, color = if (selected) KnouxColors.Text else KnouxColors.Muted)
    }
}

@Composable
private fun stateLabel(state: CapsuleState): String = when (state) {
    CapsuleState.ACTIVE -> tr("Active", "نشطة")
    CapsuleState.EXPIRED -> tr("Expired", "منتهية")
    CapsuleState.SPENT -> tr("Opens used", "استُهلك الفتح")
    CapsuleState.REVOKED -> tr("Revoked", "ملغا")
    CapsuleState.UNREADABLE -> tr("Unreadable", "غير مقروء")
}

private fun stateColor(state: CapsuleState): Color = when (state) {
    CapsuleState.ACTIVE -> KnouxColors.Success
    CapsuleState.EXPIRED -> KnouxColors.Warn
    CapsuleState.SPENT -> KnouxColors.Warn
    CapsuleState.REVOKED -> KnouxColors.Alert
    CapsuleState.UNREADABLE -> KnouxColors.Alert
}

@Composable
private fun stateDetail(capsule: Capsule): String {
    val payload = capsule.payload ?: return tr("Ciphertext failed authentication", "فشل التحقق من النص المشفر")
    val formatter = remember { SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()) }
    val expiry = formatter.format(Date(payload.expiresAtMillis))
    return when (capsule.state) {
        CapsuleState.ACTIVE -> tr(
            "$expiry · ${capsule.opensRemaining} of ${payload.maxOpens} opens left",
            "$expiry · بقي ${capsule.opensRemaining} من ${payload.maxOpens} فتحًا",
        )
        CapsuleState.EXPIRED -> tr("Expired at $expiry", "انتهت في $expiry")
        CapsuleState.SPENT -> tr("All ${payload.maxOpens} opens used", "استُخدمت كل الفتحات (${payload.maxOpens})")
        CapsuleState.REVOKED -> tr(
            "Revoked at ${formatter.format(Date(payload.revokedAtMillis))}",
            "أُلغيت في ${formatter.format(Date(payload.revokedAtMillis))}",
        )
        CapsuleState.UNREADABLE -> tr("Ciphertext failed authentication", "فشل التحقق من النص المشفر")
    }
}

@Composable
private fun ttlLabel(millis: Long): String = when {
    millis >= 24L * 60 * 60 * 1000 && millis % (24L * 60 * 60 * 1000) == 0L ->
        tr("${millis / (24L * 60 * 60 * 1000)} d", "${millis / (24L * 60 * 60 * 1000)} يوم")
    millis >= 60L * 60 * 1000 -> tr("${millis / (60L * 60 * 1000)} h", "${millis / (60L * 60 * 1000)} ساعة")
    else -> tr("${millis / 60_000} min", "${millis / 60_000} دقيقة")
}
