package com.knoux.crypt.ui

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.SecurityEvent
import com.knoux.crypt.data.SecurityEventRepository
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.tr
import com.knoux.crypt.viewModelFactory
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class SecurityActivityViewModel(
    application: Application,
    private val container: AppContainer,
) : AndroidViewModel(application) {
    private val repo: SecurityEventRepository = container.securityEvents
    private val _events = MutableStateFlow<List<SecurityEvent>>(emptyList())
    val events: StateFlow<List<SecurityEvent>> = _events.asStateFlow()
    private val _category = MutableStateFlow("ALL")
    val category: StateFlow<String> = _category.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        reload()
    }

    fun setCategory(value: String) {
        _category.value = value
        reload()
    }

    fun reload() {
        viewModelScope.launch {
            runCatching {
                _events.value = repo.list(_category.value)
            }.onFailure { _error.value = it.message ?: "Could not load security activity." }
        }
    }

    fun clearAll(onDone: () -> Unit) {
        viewModelScope.launch {
            runCatching { repo.clear() }
                .onSuccess { _events.value = emptyList(); onDone() }
                .onFailure { _error.value = it.message ?: "Could not clear activity." }
        }
    }

    fun record(category: String, action: String, detail: String = "", severity: String = "INFO") {
        viewModelScope.launch {
            runCatching { repo.record(category, action, detail, severity) }
                .onSuccess { reload() }
                .onFailure { _error.value = it.message }
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
    val error by viewModel.error.collectAsStateWithLifecycle()
    var pendingClear by remember { mutableStateOf(false) }
    val formatter = remember { SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()) }

    val categories = listOf("ALL", "ACCESS", "KEY", "DATA", "PRIVACY", "TRANSFER")

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(tr("Security Activity", "???? ??????"), onBack)
        Spacer(Modifier.height(8.dp))
        Text(
            tr(
                "Local, non-secret audit timeline of actions performed in this app. No secret values, keys or ciphertext contents are stored. Clearing is irreversible.",
                "????? ????? ????? ????? ????? ???????? ?? ??? ??????. ?? ???? ????? ??????? ?? ?????? ?? ????? ??????? ??????. ????? ??? ???????.",
            ),
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            categories.forEach { option ->
                val active = option == category
                Text(
                    option,
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
        Spacer(Modifier.height(4.dp))
        error?.let {
            Text(it, color = KnouxColors.Alert, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(6.dp))
        }
        if (events.isEmpty()) {
            GlassCard(Modifier.fillMaxWidth()) {
                Text(
                    tr("No security events recorded yet.", "?? ???? ????? ?????? ????."),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        } else {
            LazyColumn(Modifier.weight(1f)) {
                items(events, key = { it.id }) { event ->
                    GlassCard(Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                event.category,
                                style = MaterialTheme.typography.labelSmall,
                                color = KnouxColors.Violet,
                                modifier = Modifier.padding(end = 8.dp),
                            )
                            Text(
                                event.action,
                                style = MaterialTheme.typography.titleSmall,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                event.severity,
                                style = MaterialTheme.typography.labelSmall,
                                color = if (event.severity == "ALERT") KnouxColors.Alert else KnouxColors.Muted,
                            )
                        }
                        if (event.detail.isNotBlank()) {
                            Text(
                                event.detail,
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 3,
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
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KnouxGhostButton(tr("Record test event", "????? ????? ??????"), {
                viewModel.record("PRIVACY", "MANUAL_CHECK", "User-initiated audit entry", "INFO")
            })
            KnouxGhostButton(tr("Clear all", "??? ???"), { pendingClear = true })
        }
        Spacer(Modifier.height(12.dp))
    }

    // category selection dialog-less: use chips clickable by wrapping above text in clickable
    // (handled below by re-rendering chips as clickable in a separate composable scope)
    if (pendingClear) {
        AlertDialog(
            onDismissRequest = { pendingClear = false },
            title = { Text(tr("Clear security activity?", "??? ????? ???????")) },
            text = { Text(tr("Deletes all local audit events from this device.", "???? ??? ????? ?????? ?? ??? ??????.")) },
            confirmButton = {
                TextButton(onClick = { pendingClear = false; viewModel.clearAll {} }) {
                    Text(tr("Clear", "???"), color = KnouxColors.Alert)
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingClear = false }) { Text(tr("Cancel", "?????")) }
            },
        )
    }
}
