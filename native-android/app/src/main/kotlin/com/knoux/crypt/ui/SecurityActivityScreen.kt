package com.knoux.crypt.ui

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.SecurityActivityPolicy
import com.knoux.crypt.data.SecurityEvent
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SecurityActivityViewModel(
    application: Application,
    private val container: AppContainer,
) : AndroidViewModel(application) {
    private val repo = container.securityEvents
    private val _category = MutableStateFlow("ALL")
    val category: StateFlow<String> = _category.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    /** Non-secret session state; the timeline policy decides what is allowed while locked. */
    val unlocked: StateFlow<Boolean> = container.session.unlocked

    @OptIn(ExperimentalCoroutinesApi::class)
    val events: StateFlow<List<SecurityEvent>> = _category
        .flatMapLatest { selected -> repo.observe(selected) }
        .catch { failure ->
            _error.value = failure.message ?: "Could not load security activity."
            emit(emptyList())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun setCategory(value: String) {
        _category.value = value
    }

    /**
     * Clearing is destructive and requires a live vault capability. The check is
     * enforced here even if the UI button were reachable while locked.
     */
    fun clearAll(onBlocked: () -> Unit, onDone: () -> Unit) {
        if (container.session.currentAccess() == null) {
            onBlocked()
            return
        }
        viewModelScope.launch {
            runCatching { repo.clear() }
                .onSuccess { onDone() }
                .onFailure { _error.value = it.message ?: "Could not clear security activity." }
        }
    }
}

@Composable
fun SecurityActivityScreen(container: AppContainer, onBack: () -> Unit, onNeedUnlock: () -> Unit) {
    val application = LocalContext.current.applicationContext as Application
    val viewModel: SecurityActivityViewModel = viewModel(
        factory = viewModelFactory { SecurityActivityViewModel(application, container) },
    )
    val events by viewModel.events.collectAsStateWithLifecycle()
    val category by viewModel.category.collectAsStateWithLifecycle()
    val unlocked by viewModel.unlocked.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    var pendingClear by remember { mutableStateOf(false) }
    var clearBlocked by remember { mutableStateOf(false) }
    val formatter = remember { SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()) }

    val categories = listOf("ALL", "ACCESS", "KEY", "DATA", "PRIVACY", "TRANSFER")

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Security Activity", "سجل الأمان"), onBack)
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "Local, non-secret audit timeline of actions performed in this app. No secret values, keys or ciphertext contents are stored. The newest ${SecurityActivityPolicy.MAX_RETAINED_EVENTS} events are kept for up to ${SecurityActivityPolicy.RETENTION_DAYS} days. Clearing is irreversible.",
                "سجل تدقيق محلي غير سري للإجراءات المنفذة داخل التطبيق. لا تُخزَّن أي قيم سرية أو مفاتيح أو محتويات مشفرة. يُحتفظ بأحدث ${SecurityActivityPolicy.MAX_RETAINED_EVENTS} حدثًا لمدة تصل إلى ${SecurityActivityPolicy.RETENTION_DAYS} يومًا. محو السجل نهائي ولا يمكن التراجع عنه.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(10.dp))
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            categories.forEach { option ->
                val active = option == category
                Text(
                    categoryLabel(option),
                    fontSize = 11.sp,
                    color = if (active) KnouxColors.Text else KnouxColors.Muted,
                    modifier = Modifier
                        .clip(RoundedCornerShape(9.dp))
                        .background(if (active) KnouxColors.VioletDeep.copy(alpha = 0.65f) else KnouxColors.Raised)
                        .clickable(role = Role.RadioButton) { viewModel.setCategory(option) }
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
        }
        Spacer(Modifier.height(6.dp))
        if (!unlocked) {
            GlassCard(
                Modifier.fillMaxWidth(),
                borderColor = KnouxColors.Warn.copy(alpha = 0.45f),
            ) {
                Text(
                    tr(
                        "The vault is locked. This timeline contains no secrets and stays readable, but clearing it requires an unlocked vault.",
                        "الخزنة مقفلة. لا يحتوي هذا السجل على أسرار ويبقى مقروءًا، لكن محوه يتطلب فتح الخزنة.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = KnouxColors.Warn,
                )
                Spacer(Modifier.height(6.dp))
                KnouxGhostButton(tr("Unlock to manage activity", "افتح الخزنة لإدارة السجل"), onNeedUnlock)
            }
            Spacer(Modifier.height(6.dp))
        }
        error?.let {
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(6.dp))
        }
        if (events.isEmpty()) {
            GlassCard(Modifier.fillMaxWidth()) {
                Text(
                    tr("No security events recorded yet.", "لا توجد أحداث أمنية مسجلة بعد."),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        } else {
            LazyColumn(Modifier.weight(1f)) {
                items(events, key = { it.id }) { event ->
                    GlassCard(Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                categoryLabel(event.category),
                                style = MaterialTheme.typography.labelSmall,
                                color = KnouxColors.Violet,
                                modifier = Modifier.padding(end = 8.dp),
                            )
                            Text(
                                eventLabel(event.action),
                                style = MaterialTheme.typography.titleSmall,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                severityLabel(event.severity),
                                style = MaterialTheme.typography.labelSmall,
                                color = if (event.severity == "ALERT") KnouxColors.Alert else KnouxColors.Muted,
                            )
                        }
                        if (event.detail.isNotBlank()) {
                            Text(
                                event.detail,
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                        }
                        Text(
                            formatter.format(Date(event.createdAt)),
                            style = MaterialTheme.typography.labelSmall,
                            color = KnouxColors.Faint,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        KnouxGhostButton(
            tr("Clear all activity", "محو كل السجل"),
            { if (unlocked) pendingClear = true else clearBlocked = true },
        )
        if (clearBlocked) {
            Text(
                tr(
                    "Unlock the vault before clearing its audit timeline.",
                    "افتح الخزنة قبل محو سجل التدقيق.",
                ),
                style = MaterialTheme.typography.bodySmall,
                color = KnouxColors.Warn,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        Spacer(Modifier.height(12.dp))
    }

    if (pendingClear) {
        AlertDialog(
            onDismissRequest = { pendingClear = false },
            title = { Text(tr("Clear security activity?", "محو سجل الأمان؟")) },
            text = {
                Text(
                    tr(
                        "Permanently deletes every local audit event on this device. This cannot be undone and the deletion itself is not recorded.",
                        "يحذف نهائيًا كل أحداث التدقيق المحلية على هذا الجهاز. لا يمكن التراجع عن ذلك، ولا تُسجَّل عملية الحذف نفسها.",
                    ),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        pendingClear = false
                        viewModel.clearAll(onBlocked = { clearBlocked = true }, onDone = {})
                    },
                ) {
                    Text(tr("Clear permanently", "محو نهائي"), color = KnouxColors.Alert)
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingClear = false }) { Text(tr("Cancel", "إلغاء")) }
            },
        )
    }
}

@Composable
private fun categoryLabel(code: String): String = when (code) {
    "ACCESS" -> tr("Access", "الوصول")
    "KEY" -> tr("Keys", "المفاتيح")
    "DATA" -> tr("Data", "البيانات")
    "PRIVACY" -> tr("Privacy", "الخصوصية")
    "TRANSFER" -> tr("Transfer", "النقل")
    else -> tr("All", "الكل")
}

@Composable
private fun severityLabel(code: String): String = when (code) {
    "ALERT" -> tr("Alert", "تنبيه")
    "NOTICE" -> tr("Notice", "ملاحظة")
    else -> tr("Info", "معلومة")
}

/** Stable storage codes are mapped to localized labels; unknown codes stay visible. */
@Composable
private fun eventLabel(action: String): String = when (action) {
    "UNLOCK_ENROLLED" -> tr("Vault access enrolled", "تم تهيئة الوصول للخزنة")
    "UNLOCK_SUCCEEDED" -> tr("Vault unlocked", "فُتحت الخزنة")
    "UNLOCK_REJECTED" -> tr("Unlock rejected", "رُفض فتح الخزنة")
    "UNLOCK_FAILED" -> tr("Unlock failed", "فشل فتح الخزنة")
    "UNLOCK_CANCELLED" -> tr("Unlock cancelled", "أُلغي فتح الخزنة")
    "UNLOCK_GATE_INVALIDATED" -> tr("Unlock key invalidated", "أُبطل مفتاح الفتح")
    "SESSION_LOCKED" -> tr("Session locked", "أُقفلت الجلسة")
    "GATE_ROTATED" -> tr("Unlock gate replaced", "استُبدلت بوابة الفتح")
    "GATE_ROTATION_FAILED" -> tr("Unlock gate replacement failed", "فشل استبدال بوابة الفتح")
    "GATE_ROTATION_CANCELLED" -> tr("Unlock gate replacement cancelled", "أُلغي استبدال بوابة الفتح")
    "OWNER_REVERIFIED" -> tr("Owner re-verified", "أُعيد التحقق من المالك")
    "KEY_ROTATION_STARTED" -> tr("Data-key rotation started", "بدأ تدوير مفتاح البيانات")
    "KEY_ROTATION_RESUMED" -> tr("Data-key rotation resumed", "استُؤنف تدوير مفتاح البيانات")
    "KEY_ROTATION_COMPLETED" -> tr("Data-key rotation completed", "اكتمل تدوير مفتاح البيانات")
    "KEY_ROTATION_CANCELLED" -> tr("Data-key rotation cancelled", "أُلغي تدوير مفتاح البيانات")
    "KEY_ROTATION_FAILED" -> tr("Data-key rotation failed", "فشل تدوير مفتاح البيانات")
    "DATA_WRITTEN" -> tr("Encrypted record saved", "حُفظ سجل مشفر")
    "DATA_WRITE_FAILED" -> tr("Encrypted record save failed", "فشل حفظ سجل مشفر")
    "DATA_WRITE_CANCELLED" -> tr("Encrypted record save cancelled", "أُلغي حفظ سجل مشفر")
    "DATA_DELETED" -> tr("Encrypted record deleted", "حُذف سجل مشفر")
    "DATA_DELETE_FAILED" -> tr("Encrypted record delete failed", "فشل حذف سجل مشفر")
    "DATA_DELETE_CANCELLED" -> tr("Encrypted record delete cancelled", "أُلغي حذف سجل مشفر")
    "DATA_UNREADABLE" -> tr("Encrypted record unreadable", "سجل مشفر غير قابل للقراءة")
    "MEDIA_IMPORTED" -> tr("Media imported and encrypted", "استُوردت وسائط وشُفّرت")
    "MEDIA_IMPORT_CANCELLED" -> tr("Media import cancelled", "أُلغي استيراد الوسائط")
    "MEDIA_IMPORT_FAILED" -> tr("Media import failed", "فشل استيراد الوسائط")
    "MEDIA_DELETED" -> tr("Encrypted media deleted", "حُذفت وسائط مشفرة")
    "MEDIA_EXPORTED" -> tr("Media exported after confirmation", "صُدّرت الوسائط بعد التأكيد")
    "MEDIA_EXPORT_FAILED" -> tr("Media export failed", "فشل تصدير الوسائط")
    "MEDIA_OPENED" -> tr("Encrypted media opened", "فُتحت وسائط مشفرة")
    "PRIVACY_SETTING_CHANGED" -> tr("Privacy setting changed", "تغيّر إعداد خصوصية")
    "SHARE_SEALED" -> tr("Share package sealed", "خُتمت حزمة مشاركة")
    "SHARE_OPENED" -> tr("Share package opened", "فُتحت حزمة مشاركة")
    "SHARE_FAILED" -> tr("Share package rejected", "رُفضت حزمة مشاركة")
    else -> action
}
