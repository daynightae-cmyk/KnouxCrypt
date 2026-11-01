package com.knoux.crypt.ui

import android.app.Application
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.knoux.crypt.AppContainer
import com.knoux.crypt.data.ShareRecipientView
import com.knoux.crypt.design.BackHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.InfoRow
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxGhostButton
import com.knoux.crypt.design.KnouxPrimaryButton
import com.knoux.crypt.design.SectionLabel
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Local Transfer (TASK 22).
 *
 * The session protocol is implemented and tested in `TransferProtocol`, but a
 * protocol is not a transport. This screen reports what the handset can actually
 * do right now — adapter present, permission granted, peer bonded — and refuses
 * to start anything it cannot carry. There is no simulated transfer, no progress
 * bar that means nothing, and no "success" without a radio that moved bytes.
 */

enum class TransportAvailability { AVAILABLE, NO_HARDWARE, PERMISSION_REQUIRED, NOT_SUPPORTED_BY_BUILD }

data class TransportStatus(
    val name: String,
    val availability: TransportAvailability,
    val detail: String,
    val bondedPeers: List<String>,
)

private fun probeBluetooth(context: Context): TransportStatus {
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    val adapter: BluetoothAdapter? = manager?.adapter
    if (adapter == null) {
        return TransportStatus("Bluetooth", TransportAvailability.NO_HARDWARE, "this device exposes no Bluetooth adapter", emptyList())
    }
    if (!adapter.isEnabled) {
        return TransportStatus("Bluetooth", TransportAvailability.PERMISSION_REQUIRED, "Bluetooth is switched off", emptyList())
    }
    // Reading bonded devices needs BLUETOOTH_CONNECT, which this build does not
    // declare — there is no channel to use the answer for. Listing radios anyway
    // would ask the owner for a permission that buys nothing.
    return TransportStatus(
        "Bluetooth",
        TransportAvailability.NOT_SUPPORTED_BY_BUILD,
        "the adapter is present and on, but this build declares no BLUETOOTH_CONNECT permission and ships no RFCOMM channel, so no peer list is read and no transfer can start",
        emptyList(),
    )
}

private fun probeWifiDirect(context: Context): TransportStatus {
    val hasFeature = context.packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_WIFI_DIRECT)
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? android.net.wifi.WifiManager
    return when {
        !hasFeature -> TransportStatus("Wi-Fi Direct", TransportAvailability.NO_HARDWARE, "this device does not advertise Wi-Fi Direct", emptyList())
        wifi == null -> TransportStatus("Wi-Fi Direct", TransportAvailability.NO_HARDWARE, "no Wi-Fi service is available", emptyList())
        else -> TransportStatus(
            "Wi-Fi Direct",
            TransportAvailability.NOT_SUPPORTED_BY_BUILD,
            "the Wi-Fi Direct channel needs NEARBY_WIFI_DEVICES and a peer-to-peer group owner; this build ships the Bluetooth channel first",
            emptyList(),
        )
    }
}

@Composable
fun LocalTransferScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onNeedUnlock: () -> Unit,
) {
    val context = LocalContext.current
    val unlocked by container.session.unlocked.collectAsStateWithLifecycle()
    var packageUri by remember { mutableStateOf<Uri?>(null) }
    var packageName by remember { mutableStateOf("") }
    var packageBytes by remember { mutableStateOf<Long?>(null) }
    var sealedKind by remember { mutableStateOf<String?>(null) }
    var recipients by remember { mutableStateOf<List<ShareRecipientView>>(emptyList()) }
    var notice by remember { mutableStateOf<String?>(null) }
    var scanOpen by remember { mutableStateOf(false) }
    var keyText by remember { mutableStateOf("") }

    val bluetooth = remember { probeBluetooth(context) }
    val wifiDirect = remember { probeWifiDirect(context) }
    val usable = listOf(bluetooth, wifiDirect).firstOrNull { it.availability == TransportAvailability.AVAILABLE }

    val pickPackage = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            packageUri = uri
            val info = runCatching {
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
                    ?.use { cursor ->
                        if (!cursor.moveToFirst()) return@use null to null
                        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                        (if (nameIndex >= 0) cursor.getString(nameIndex) else null) to
                            (if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) cursor.getLong(sizeIndex) else null)
                    }
            }.getOrNull()
            packageName = info?.first ?: "selected package"
            packageBytes = info?.second
            sealedKind = null
            notice = null
        }
    }
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val text = uri?.let {
            runCatching { context.contentResolver.openInputStream(it)?.use { stream -> QrSupport.decodeImage(stream) } }.getOrNull()
        }
        if (!text.isNullOrBlank()) {
            keyText = text
            notice = if (unlocked) null else "unlock the vault to store this recipient"
        }
    }

    LaunchedEffect(unlocked, packageUri) {
        val access = container.session.currentAccess()
        if (access == null) {
            recipients = emptyList()
        } else {
            runCatching { container.share.observeRecipients(access).collect { rows -> recipients = rows } }
        }
        val uri = packageUri ?: return@LaunchedEffect
        if (sealedKind == null) {
            sealedKind = withContext(Dispatchers.IO) {
                runCatching {
                    context.contentResolver.openInputStream(uri)?.use { input ->
                        val magic = ByteArray(4)
                        if (input.read(magic) != 4) return@use null
                        when (String(magic, Charsets.US_ASCII)) {
                            "KSR1" -> "KSR1 sealed share package"
                            "KNF1", "KNF2" -> "KNF encrypted file"
                            "KNC1", "KNC2" -> "KNC record export"
                            else -> null
                        }
                    }
                }.getOrNull()
            }
        }
    }

    val confirmed = recipients.filter { it.verified }
    val title = tr("Local Transfer", "نقل محلي")

    val confirmedCount = tr("verified keys", "مفاتيح موثّقة") + ": " + confirmed.size
    val blockedNoTransport = tr(
        "Blocked: no transport on this device is usable right now. Nothing was sent.",
        "محظور: لا وصلة متاحة على هذا الجهاز الآن. لم يُرسل شيء.",
    )
    val blockedNoPackage = tr("Choose a sealed package first.", "اختر حزمة مغلقة أولًا.")
    val blockedNoRecipient = tr("Verify a recipient fingerprint first.", "تحقق من بصمة المستلم أولًا.")
    val blockedNoRadio = tr(
        "The protocol is ready, but this build has never carried a real radio transfer. Refusing to claim one.",
        "البروتوكول جاهز، لكن هذا البناء لم ينقل عبر لاسلكي فعليًا قط. نرفض الادعاء بذلك.",
    )

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        BackHeader(title, onBack)
        Spacer(Modifier.height(6.dp))
        Text(
            tr("Secure file transfer to a nearby device.", "نقل آمن للملفات إلى جهاز قريب."),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Muted,
        )
        Spacer(Modifier.height(12.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Selected package", "الحزمة المختارة"))
            Spacer(Modifier.height(6.dp))
            Text(
                packageName.ifBlank { tr("No package selected", "لم تُختر حزمة") },
                style = MaterialTheme.typography.bodyMedium,
                color = KnouxColors.Text,
            )
            Text(
                packageBytes?.let { "${formatBytes(it)} · " } + (sealedKind ?: tr("encrypted package", "حزمة مشفرة")),
                style = MaterialTheme.typography.labelSmall,
                color = if (sealedKind == null && packageUri != null) KnouxColors.Alert else KnouxColors.Faint,
            )
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                KnouxGhostButton(tr("Choose sealed package", "اختر حزمة مغلقة"), { pickPackage.launch(arrayOf("*/*")) }, Modifier.weight(1f))
                StatusPill(
                    text = tr("Not transferred yet", "لم تُنقل بعد"),
                    tone = KnouxColors.Warn,
                )
            }
            if (packageUri != null && sealedKind == null) {
                Spacer(Modifier.height(6.dp))
                Text(
                    tr(
                        "This file does not start with a KNOUX container magic. Only sealed packages are accepted; plaintext is never put on the wire.",
                        "هذا الملف لا يبدأ بترويسة حزمة KNOUX. تُقبل الحزم المغلقة فقط، ولا يُرسل نص صريح عبر الوصلة.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Alert,
                )
            }
        }
        Spacer(Modifier.height(10.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SectionLabel(tr("Nearby device", "جهاز قريب"))
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { notice = "re-probed" }) {
                    Text(tr("Refresh", "تحديث"), color = KnouxColors.Violet, fontSize = 11.sp)
                }
            }
            Spacer(Modifier.height(4.dp))
            listOf(bluetooth, wifiDirect).forEach { status ->
                InfoRow(
                    status.name,
                    when (status.availability) {
                        TransportAvailability.AVAILABLE -> tr("available", "متاح")
                        TransportAvailability.NO_HARDWARE -> tr("no hardware", "لا يوجد عتاد")
                        TransportAvailability.PERMISSION_REQUIRED -> tr("needs permission or pairing", "يحتاج إذنًا أو اقترانًا")
                        TransportAvailability.NOT_SUPPORTED_BY_BUILD -> tr("not in this build", "غير متاح في هذا البناء")
                    },
                )
                Text(
                    status.detail,
                    style = MaterialTheme.typography.labelSmall,
                    color = KnouxColors.Faint,
                )
                status.bondedPeers.forEach { peer ->
                    Text("· $peer", style = MaterialTheme.typography.labelSmall, color = KnouxColors.Muted)
                }
                Spacer(Modifier.height(4.dp))
            }
        }
        Spacer(Modifier.height(10.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            SectionLabel(tr("Transfer details", "تفاصيل النقل"))
            Spacer(Modifier.height(6.dp))
            InfoRow(
                tr("Recipient verification", "تحقق المستلم"),
                if (confirmed.isEmpty()) {
                    tr("Trust pending", "الثقة معلّقة")
                } else {
                    confirmedCount
                },
            )
            InfoRow(tr("Package size", "حجم الحزمة"), packageBytes?.let { formatBytes(it) } ?: "—")
            InfoRow(
                tr("Transfer mode", "نمط النقل"),
                usable?.name ?: tr("none usable on this device", "لا نمط متاح على هذا الجهاز"),
            )
            Spacer(Modifier.height(6.dp))
            Text(
                tr(
                    "Peer identity is confirmed by comparing the recipient fingerprint, exactly as in Secure Share. A bonded Bluetooth name is not an identity.",
                    "تُتحقق هوية الطرف الآخر بمقارنة بصمة المستلم كما في المشاركة الآمنة. اسم جهاز مقترن عبر البلوتوث ليس هوية.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
        }
        Spacer(Modifier.height(10.dp))

        KnouxPrimaryButton(
            text = tr("Prepare Secure Transfer", "جهّز النقل الآمن"),
            onClick = {
                notice = when {
                    usable == null -> blockedNoTransport
                    sealedKind == null -> blockedNoPackage
                    confirmed.isEmpty() -> blockedNoRecipient
                    else -> blockedNoRadio
                }
            },
        )
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KnouxGhostButton(
                tr("Scan Recipient QR", "امسح رمز المستلم"),
                { imagePicker.launch("image/*") },
                Modifier.weight(1f),
            )
            KnouxGhostButton(
                tr("Select Another Device", "اختر جهازًا آخر"),
                { notice = "pair a second handset in Android settings, then refresh" },
                Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(10.dp))

        GlassCard(Modifier.fillMaxWidth(), borderColor = KnouxColors.Warn.copy(alpha = 0.5f)) {
            SectionLabel(tr("Status of this service", "حالة هذه الخدمة"))
            Spacer(Modifier.height(4.dp))
            Text(
                tr(
                    "BLOCKED — transport unverified. KTX1 framing, key agreement, replay protection and the resume contract are implemented and JVM-tested; no Bluetooth or Wi-Fi Direct channel has ever moved a byte in this build, so no transfer has ever completed here.",
                    "محظور — الوصلة غير متحققة. تأطير KTX1 واتفاق المفاتيح وحماية التكرار وعقد الاستئناف منفذة ومختبرة على JVM، لكن لم تنقل أي وصلة بلوتوث أو واي-فاي بايتًا واحدًا في هذا البناء، لذا لم تكتمل أي عملية نقل هنا.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Warn,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                tr(
                    "To unblock it: implement and declare a real channel (RFCOMM with BLUETOOTH_CONNECT, or Wi-Fi Direct with NEARBY_WIFI_DEVICES), pair two handsets, and have the owner present to confirm both fingerprints. Until then this screen will not pretend to transfer.",
                    "لفكّ الحظر: تنفيذ وصلة حقيقية والإعلان عنها (RFCOMM مع إذن الاتصال بالبلوتوث، أو واي-فاي مباشر مع إذن أجهزة الاتصال)، ثم اقتران جهازين وحضور المالك لتأكيد البصمتين. وحتى يحدث ذلك لن يتظاهر هذا الشاشة بالنقل.",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = KnouxColors.Faint,
            )
            if (keyText.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    keyText.take(80),
                    style = MaterialTheme.typography.labelSmall,
                    fontFamily = FontFamily.Monospace,
                    color = KnouxColors.Muted,
                )
            }
            if (!unlocked) {
                Spacer(Modifier.height(6.dp))
                TextButton(onClick = onNeedUnlock) {
                    Text(tr("Unlock the vault to store recipients", "افتح الخزنة لحفظ المستلمين"), color = KnouxColors.Violet, fontSize = 11.sp)
                }
            }
        }
        notice?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, style = MaterialTheme.typography.labelSmall, color = KnouxColors.Violet)
        }
        Spacer(Modifier.height(10.dp))
        Text(
            tr("Encrypted. Direct. In Your Control.", "مشفّر. مباشر. تحت سيطرتك."),
            style = MaterialTheme.typography.labelSmall,
            color = KnouxColors.Faint,
            modifier = Modifier.fillMaxWidth(),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
    }
}
