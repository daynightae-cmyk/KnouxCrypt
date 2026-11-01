package com.knoux.crypt.ui

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.KeystoreKeyDetails
import com.knoux.crypt.data.KeyProtectionLevel
import com.knoux.crypt.data.RotationInventory
import com.knoux.crypt.data.VaultLockedException
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.design.StagHero
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class KeyDetailsStatus { LOADING, READY, NOT_PROVISIONED, LOCKED, ERROR }

data class KeyDetailsUiState(
    val status: KeyDetailsStatus = KeyDetailsStatus.LOADING,
    val details: KeystoreKeyDetails? = null,
    val inventory: RotationInventory? = null,
    val fingerprint: String? = null,
    val detail: String? = null,
)

/**
 * Key details for the vault's real key material (TASK 13).
 *
 * The screen reports what the platform actually states about the Keystore key:
 * alias, algorithm, size, purposes and the protection class reported by
 * [android.security.keystore.KeyInfo]. There is no public key for a symmetric
 * non-exportable secret, so the public-key and signature actions stay disabled
 * with the reason on screen, and rotation reuses the existing authorized
 * rotation wizard instead of a second engine.
 */
class KeyDetailsViewModel(
    application: Application,
    private val container: AppContainer,
) : AndroidViewModel(application) {
    private val _state = MutableStateFlow(KeyDetailsUiState())
    val state: StateFlow<KeyDetailsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            container.session.unlocked.collect { unlocked ->
                if (!unlocked) _state.value = KeyDetailsUiState(status = KeyDetailsStatus.LOCKED)
            }
        }
    }

    fun load() {
        val access = container.session.currentAccess()
        if (access == null) {
            _state.value = KeyDetailsUiState(status = KeyDetailsStatus.LOCKED)
            return
        }
        _state.value = KeyDetailsUiState(status = KeyDetailsStatus.LOADING)
        viewModelScope.launch {
            try {
                val details = container.keystore.masterKeyDetails()
                if (details == null) {
                    _state.value = KeyDetailsUiState(status = KeyDetailsStatus.NOT_PROVISIONED)
                    return@launch
                }
                val inventory = runCatching { container.keyRotation.inventory(access) }.getOrNull()
                val fingerprint = runCatching { container.vaultKeys.keyringFingerprint(access) }.getOrNull()
                _state.value = KeyDetailsUiState(
                    status = KeyDetailsStatus.READY,
                    details = details,
                    inventory = inventory,
                    fingerprint = fingerprint,
                )
            } catch (_: VaultLockedException) {
                _state.value = KeyDetailsUiState(status = KeyDetailsStatus.LOCKED)
            } catch (failure: Exception) {
                _state.value = KeyDetailsUiState(
                    status = KeyDetailsStatus.ERROR,
                    detail = failure.message ?: "KEYSTORE_UNAVAILABLE",
                )
            }
        }
    }
}

@Composable
fun KeyDetailsScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
    onOpenForge: () -> Unit,
    onOpenRotation: () -> Unit,
) {
    if (container.session.currentAccess() == null) {
        LockedScreen(tr("Key Details", "تفاصيل المفتاح"), onBack, onNeedUnlock)
        return
    }
    val application = LocalContext.current.applicationContext as Application
    val viewModel: KeyDetailsViewModel = viewModel(
        factory = viewModelFactory { KeyDetailsViewModel(application, container) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    val formatter = remember { SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()) }

    LaunchedEffect(Unit) { viewModel.load() }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Key Details", "تفاصيل المفتاح"), onBack)
        Spacer(Modifier.height(8.dp))
        StagHero(
            modifier = Modifier
                .fillMaxWidth()
                .height(190.dp),
            contentDescription = tr("KNOUX Crypt stag emblem", "شعار نوكس كريبت"),
        )
        Spacer(Modifier.height(6.dp))
        Text(
            tr("Key Details", "تفاصيل المفتاح"),
            style = MaterialTheme.typography.headlineLarge,
            color = KnouxColors.Text,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            tr(
                "Live metadata for the key material this vault actually holds.",
                "بيانات حية لمادة المفاتيح التي تملكها هذه الخزنة فعليًا.",
            ),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Muted,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))

        when (state.status) {
            KeyDetailsStatus.LOADING -> LinearProgressIndicator(Modifier.fillMaxWidth(), color = KnouxColors.Violet)

            KeyDetailsStatus.LOCKED -> {
                GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Alert.copy(alpha = 0.4f)) {
                    Text(
                        tr(
                            "The vault is locked, so key metadata is not shown. Unlock to inspect it.",
                            "الخزنة مقفلة، لذا لا تُعرض بيانات المفتاح. افتح الخزنة لفحصها.",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = KnouxColors.Alert,
                    )
                    Spacer(Modifier.height(8.dp))
                    KnouxGhostButton(tr("Unlock", "فتح"), onNeedUnlock)
                }
            }

            KeyDetailsStatus.NOT_PROVISIONED -> {
                GlassCard(Modifier.fillMaxWidth()) {
                    Text(
                        tr(
                            "No vault key exists yet. The Keystore master key is created the first time a vault is provisioned, and it is never exported.",
                            "لا يوجد مفتاح خزنة بعد. يُنشأ مفتاح Keystore الرئيسي عند تهيئة الخزنة أول مرة، ولا يُصدَّر أبدًا.",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(Modifier.height(8.dp))
                    KnouxGhostButton(tr("Open Key Forge", "فتح مصنع المفاتيح"), onOpenForge)
                }
            }

            KeyDetailsStatus.ERROR -> {
                GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Alert.copy(alpha = 0.4f)) {
                    Text(
                        tr(
                            "The Keystore did not answer. No metadata is shown and nothing was changed.",
                            "لم يستجب Keystore. لا تُعرض أي بيانات ولم يتغيّر شيء.",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = KnouxColors.Alert,
                    )
                    state.detail?.let {
                        Text(it, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Faint)
                    }
                    Spacer(Modifier.height(8.dp))
                    KnouxGhostButton(tr("Try again", "إعادة المحاولة"), { viewModel.load() })
                }
            }

            KeyDetailsStatus.READY -> {
                val details = state.details
                if (details != null) {
                    GlassCard(Modifier.fillMaxWidth()) {
                        SectionLabel(tr("Key details", "تفاصيل المفتاح"))
                        Spacer(Modifier.height(6.dp))
                        InfoRow(tr("Key alias", "اسم المفتاح"), details.alias)
                        InfoRow(tr("Purpose", "الغرض"), purposeLabel(details.purposes))
                        InfoRow(tr("Provider", "المزوّد"), "Android Keystore")
                        InfoRow(
                            tr("Algorithm", "الخوارزمية"),
                            details.algorithm + (details.keySizeBits?.let { " · $it bit" } ?: ""),
                        )
                        InfoRow(
                            tr("Hardware support", "الدعم العتادي"),
                            protectionLabel(details.protection),
                        )
                        InfoRow(
                            tr("User authentication", "مصادقة المستخدم"),
                            if (details.userAuthenticationRequired) {
                                tr(
                                    "Required per use (unlock gate key)",
                                    "مطلوبة لكل استخدام (مفتاح بوابة الفتح)",
                                )
                            } else {
                                tr(
                                    "Not per use (vault key is session-gated)",
                                    "ليست لكل استخدام (مفتاح الخزنة مقيد بالجلسة)",
                                )
                            },
                        )
                        InfoRow(
                            tr("Unlocked device required", "يلزم جهاز مفتوح"),
                            if (details.unlockedDeviceRequiredRequested) {
                                tr(
                                    "Requested at creation (not confirmed by KeyInfo)",
                                    "مطلوب عند الإنشاء (لا تؤكده KeyInfo)",
                                )
                            } else {
                                tr("Not requested", "غير مطلوب")
                            },
                        )
                        InfoRow(
                            tr("Lifecycle", "دورة الحياة"),
                            tr(
                                "Root key retained so KNF1 device files stay readable",
                                "يُحتفظ بالمفتاح الجذري ليبقى ملف KNF1 بمفتاح الجهاز قابلًا للقراءة",
                            ),
                        )
                        Spacer(Modifier.height(6.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            StatusPill(
                                text = when (details.protection) {
                                    KeyProtectionLevel.STRONGBOX -> tr("StrongBox", "StrongBox")
                                    KeyProtectionLevel.TRUSTED_ENVIRONMENT -> tr("TEE", "بيئة موثوقة")
                                    KeyProtectionLevel.SOFTWARE -> tr("Software", "برمجي")
                                    KeyProtectionLevel.UNKNOWN -> tr("Unknown", "غير معروف")
                                },
                                tone = when (details.protection) {
                                    KeyProtectionLevel.STRONGBOX, KeyProtectionLevel.TRUSTED_ENVIRONMENT -> KnouxColors.Success
                                    KeyProtectionLevel.SOFTWARE -> KnouxColors.Warn
                                    KeyProtectionLevel.UNKNOWN -> KnouxColors.Muted
                                },
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                tr(
                                    "Reported by the platform, not a hardware attestation",
                                    "مُبلَّغ من المنصة وليس إثباتًا عتاديًا",
                                ),
                                style = MaterialTheme.typography.labelSmall,
                                color = KnouxColors.Faint,
                            )
                        }
                    }
                    Spacer(Modifier.height(10.dp))

                    GlassCard(Modifier.fillMaxWidth()) {
                        SectionLabel(tr("Record data key", "مفتاح بيانات السجلات"))
                        Spacer(Modifier.height(6.dp))
                        val inventory = state.inventory
                        InfoRow(tr("Active version", "الإصدار النشط"), (inventory?.activeVersion ?: 0).toString())
                        InfoRow(
                            tr("Stored versions", "الإصدارات المخزنة"),
                            inventory?.storedKeyVersions?.joinToString(", ")?.ifBlank { "—" } ?: "—",
                        )
                        InfoRow(
                            tr("Rows per version", "الصفوف لكل إصدار"),
                            inventory?.versionCounts?.entries?.sortedBy { it.key }
                                ?.joinToString(", ") { "${it.key} → ${it.value}" } ?: "—",
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            tr(
                                "Records are sealed with a wrapped data key; the Keystore root stays in place and is never renamed or regenerated.",
                                "تُختم السجلات بمفتاح بيانات ملفوف؛ ويبقى الجذر في مكانه ولا يُعاد تسميته أو توليده.",
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            color = KnouxColors.Faint,
                        )
                    }
                    Spacer(Modifier.height(10.dp))

                    GlassCard(Modifier.fillMaxWidth()) {
                        SectionLabel(tr("Keyring fingerprint", "بصمة مخزن المفاتيح"))
                        Spacer(Modifier.height(6.dp))
                        Text(
                            state.fingerprint ?: tr("Not available yet", "غير متاحة بعد"),
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            tr(
                                "SHA-256 over the wrapped data keys as stored on this device. It detects local tampering or an unexpected re-wrap. It is not a shareable identity and is never transmitted.",
                                "بصمة SHA-256 على مفاتيح البيانات الملفوفة كما هي مخزنة على هذا الجهاز. تكشف التلاعب المحلي أو إعادة ملف غير متوقعة. ليست هوية قابلة للمشاركة ولا تُنقل أبدًا.",
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            color = KnouxColors.Faint,
                        )
                    }
                    Spacer(Modifier.height(10.dp))

                    GlassCard(Modifier.fillMaxWidth()) {
                        SectionLabel(tr("Public key and signatures", "المفتاح العام والتوقيعات"))
                        Spacer(Modifier.height(6.dp))
                        Text(
                            tr(
                                "The vault key is a symmetric, non-exportable Keystore secret, so it has no public key and no fingerprint to share. Signing and verification stay unavailable until a supported signing-key workflow exists.",
                                "مفتاح الخزنة سر متماثل غير قابل للتصدير من Keystore، لذا لا يملك مفتاحًا عامًا ولا بصمة للمشاركة. تبقى التوقيعات والتحقق غير متاحين حتى تتوفر آلية مفاتيح توقيع مدعومة.",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Spacer(Modifier.height(8.dp))
                        KnouxGhostButton(
                            tr("View public key", "عرض المفتاح العام"),
                            { },
                            enabled = false,
                        )
                        KnouxGhostButton(
                            tr("Verify a signature", "التحقق من توقيع"),
                            { },
                            enabled = false,
                        )
                    }
                    Spacer(Modifier.height(12.dp))

                    KnouxPrimaryButton(
                        text = tr("Rotate the record data key", "تدوير مفتاح بيانات السجلات"),
                        onClick = onOpenRotation,
                    )
                    Spacer(Modifier.height(8.dp))
                    KnouxGhostButton(tr("Open Key Forge", "فتح مصنع المفاتيح"), onOpenForge)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        tr(
                            "Rotation asks for a fresh biometric verification and keeps the root key, so existing KNF1 files keep working.",
                            "يطلب التدوير تحققًا بيومتريًا جديدًا ويحتفظ بالمفتاح الجذري، فتبقى ملفات KNF1 الحالية تعمل.",
                        ),
                        style = MaterialTheme.typography.labelSmall,
                        color = KnouxColors.Faint,
                    )
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun purposeLabel(purposes: List<String>): String {
    val labels = ArrayList<String>(purposes.size)
    purposes.forEach { purpose ->
        labels += when (purpose) {
            "encrypt" -> tr("Encrypt", "تشفير")
            "decrypt" -> tr("Decrypt", "فك تشفير")
            "sign" -> tr("Sign", "توقيع")
            "verify" -> tr("Verify", "تحقق")
            else -> purpose
        }
    }
    return labels.joinToString(" · ")
}

@Composable
private fun protectionLabel(level: KeyProtectionLevel): String = when (level) {
    KeyProtectionLevel.STRONGBOX -> tr("StrongBox hardware", "عتاد StrongBox")
    KeyProtectionLevel.TRUSTED_ENVIRONMENT -> tr("Trusted environment (TEE)", "بيئة موثوقة (TEE)")
    KeyProtectionLevel.SOFTWARE -> tr("Software keystore", "مخزن مفاتيح برمجي")
    KeyProtectionLevel.UNKNOWN -> tr("Not reported by this platform", "لم تبلّغ عنه المنصة")
}
