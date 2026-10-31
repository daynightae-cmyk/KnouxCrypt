package com.knoux.crypt.ui

import android.app.Application
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.SecretKinds
import com.knoux.crypt.data.SecretRecord
import com.knoux.crypt.data.SecretsJson
import com.knoux.crypt.data.VaultLockedException
import com.knoux.crypt.data.TotpPayload
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxTextField
import com.knoux.crypt.security.Base32
import com.knoux.crypt.security.Totp
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class AuthenticatorViewModel(application: Application, private val container: AppContainer) : AndroidViewModel(application) {
    private val _records = MutableStateFlow<List<SecretRecord>>(emptyList())
    val records: StateFlow<List<SecretRecord>> = _records.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        viewModelScope.launch {
            container.session.unlocked.collect { unlocked ->
                if (!unlocked) {
                    // The session capability is gone; drop every decrypted payload
                    // held by this ViewModel instead of leaving it on screen.
                    _records.value = emptyList()
                    _error.value = null
                }
            }
        }
        val access = container.session.currentAccess()
        if (access != null) {
            viewModelScope.launch {
                try {
                    container.secrets.observe(access, SecretKinds.TOTP).collect { _records.value = it }
                } catch (_: VaultLockedException) {
                    _records.value = emptyList()
                }
            }
        }
    }

    fun add(issuer: String, account: String, secretInput: String, onDone: () -> Unit) {
        val access = container.session.currentAccess()
        if (access == null) {
            _error.value = "The vault locked before saving."
            return
        }
        val secret = runCatching { Base32.decode(secretInput) }.getOrElse {
            _error.value = "The secret is not valid Base32."
            return
        }
        if (secret.size < 10) {
            _error.value = "The TOTP secret is too short (minimum 10 bytes)."
            return
        }
        val payload = TotpPayload(
            issuer = issuer.trim(),
            account = account.trim(),
            secretBase32 = Base32.encode(secret),
            algorithm = "SHA1",
            digits = 6,
            period = 30,
        )
        viewModelScope.launch {
            runCatching {
                container.secrets.save(access, SecretKinds.TOTP, null, SecretsJson.encodeTotp(payload))
            }.onSuccess {
                _error.value = null
                onDone()
            }.onFailure { _error.value = it.message ?: "Could not save the authenticator entry." }
        }
    }

    fun delete(record: SecretRecord) {
        val access = container.session.currentAccess() ?: return
        viewModelScope.launch {
            runCatching { container.secrets.delete(access, record.id) }
                .onFailure { _error.value = it.message }
        }
    }

    fun payload(record: SecretRecord): TotpPayload? = SecretsJson.decodeTotp(record.payloadJson)
}

private fun algorithmFor(name: String): Totp.Algorithm = when (name.uppercase()) {
    "SHA256" -> Totp.Algorithm.SHA256
    "SHA512" -> Totp.Algorithm.SHA512
    else -> Totp.Algorithm.SHA1
}

@Composable
fun AuthenticatorScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
    onOpenImport: () -> Unit = {},
) {
    if (container.session.currentAccess() == null) {
        LockedScreen(tr("Authenticator", "المصادقة"), onBack, onNeedUnlock)
        return
    }
    val application = LocalContext.current.applicationContext as Application
    val viewModel: AuthenticatorViewModel = viewModel(
        factory = viewModelFactory { AuthenticatorViewModel(application, container) },
    )
    val records by viewModel.records.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()

    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
    }

    var dialogOpen by remember { mutableStateOf(false) }
    var issuer by remember { mutableStateOf("") }
    var account by remember { mutableStateOf("") }
    var secret by remember { mutableStateOf("") }
    var pendingDelete by remember { mutableStateOf<SecretRecord?>(null) }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Authenticator", "المصادقة"), onBack)
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "TOTP codes are derived locally from encrypted seeds (RFC 6238). No network request is made.",
                "تُشتق رموز TOTP محليًا من بذور مشفرة (RFC 6238). لا يتم إجراء أي طلب شبكة.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(10.dp))
        KnouxGhostButton(tr("Import accounts (QR / backup)", "استيراد الحسابات (QR / نسخة)"), onOpenImport)
        Spacer(Modifier.height(8.dp))
        KnouxGhostButton(tr("Add TOTP entry", "إضافة إدخال TOTP"), {
            issuer = ""
            account = ""
            secret = ""
            dialogOpen = true
        })
        Spacer(Modifier.height(10.dp))
        error?.let {
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }
        if (records.isEmpty()) {
            GlassCard(Modifier.fillMaxWidth()) {
                Text(tr("No TOTP entries yet.", "لا توجد إدخالات TOTP بعد."), style = MaterialTheme.typography.bodySmall)
            }
        }
        records.forEach { record ->
            val payload = viewModel.payload(record)
            val code = payload?.let {
                runCatching {
                    val bytes = Base32.decode(it.secretBase32)
                    Totp.generate(bytes, now / 1000, it.period, it.digits, algorithmFor(it.algorithm))
                }.getOrNull()
            }
            val remaining = payload?.let { Totp.remainingSeconds(now, it.period) }
            GlassCard(Modifier.fillMaxWidth()) {
                Text(
                    listOfNotNull(payload?.issuer?.takeIf { it.isNotBlank() }, payload?.account?.takeIf { it.isNotBlank() })
                        .joinToString(" · ")
                        .ifBlank { tr("Unreadable entry", "إدخال غير قابل للقراءة") },
                    style = MaterialTheme.typography.titleMedium,
                )
                if (payload == null || code == null) {
                    Text(
                        tr("The encrypted seed could not be decoded.", "تعذر فك تشفير البذرة."),
                        style = MaterialTheme.typography.bodySmall,
                        color = KnouxColors.Alert,
                    )
                } else {
                    Text(
                        code.chunked(if (payload.digits > 6) 4 else 3).joinToString(" "),
                        style = MaterialTheme.typography.headlineMedium.copy(
                            fontFamily = FontFamily.Monospace,
                            fontSize = 30.sp,
                            letterSpacing = 4.sp,
                        ),
                        color = KnouxColors.Text,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                    Spacer(Modifier.height(6.dp))
                    LinearProgressIndicator(
                        progress = { (remaining ?: 0).toFloat() / (payload.period.coerceAtLeast(1)) },
                        modifier = Modifier.fillMaxWidth(),
                        color = KnouxColors.Violet,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            tr("Expires in", "ينتهي خلال") + " ${remaining}s",
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(onClick = { pendingDelete = record }) {
                            Text(tr("Delete", "حذف"), color = KnouxColors.Alert, fontSize = 11.sp)
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        Spacer(Modifier.height(24.dp))
    }

    if (dialogOpen) {
        AlertDialog(
            onDismissRequest = { dialogOpen = false },
            title = { Text(tr("Add TOTP entry", "إضافة إدخال TOTP")) },
            text = {
                Column {
                    KnouxTextField(issuer, { issuer = it }, tr("Issuer (optional)", "الجهة (اختياري)"), singleLine = true)
                    Spacer(Modifier.height(6.dp))
                    KnouxTextField(account, { account = it }, tr("Account (optional)", "الحساب (اختياري)"), singleLine = true)
                    Spacer(Modifier.height(6.dp))
                    KnouxTextField(secret, { secret = it }, tr("Base32 secret", "البذرة Base32"), singleLine = true)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        tr(
                            "The seed is validated, then encrypted before storage. It is never logged.",
                            "تُتحقق البذرة ثم تُشفر قبل التخزين. لا تُسجل أبدًا.",
                        ),
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.add(issuer, account, secret) { dialogOpen = false }
                    },
                    enabled = secret.isNotBlank(),
                ) { Text(tr("Add", "إضافة"), color = KnouxColors.Violet) }
            },
            dismissButton = {
                TextButton(onClick = { dialogOpen = false }) { Text(tr("Cancel", "إلغاء")) }
            },
        )
    }

    pendingDelete?.let { record ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(tr("Delete TOTP entry?", "حذف إدخال TOTP؟")) },
            text = { Text(tr("Removes the encrypted seed from this device.", "يزيل البذرة المشفرة من هذا الجهاز.")) },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = null
                    viewModel.delete(record)
                }) { Text(tr("Delete", "حذف"), color = KnouxColors.Alert) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text(tr("Cancel", "إلغاء")) }
            },
        )
    }
}
