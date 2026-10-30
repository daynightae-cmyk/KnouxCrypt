package com.knoux.crypt.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.knoux.crypt.AppContainer
import com.knoux.crypt.BuildConfig
import com.knoux.crypt.Catalog
import com.knoux.crypt.LocalLanguage
import com.knoux.crypt.ServiceDef
import com.knoux.crypt.design.BrandHeader
import com.knoux.crypt.design.DividerLine
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxTab
import com.knoux.crypt.design.ServiceArtImage
import com.knoux.crypt.design.StagHero
import com.knoux.crypt.design.StatusPill
import com.knoux.crypt.tr

@Composable
fun HomeScreen(
    container: AppContainer,
    onOpenService: (ServiceDef) -> Unit,
    onSearch: () -> Unit,
    onSettings: () -> Unit,
    onTab: (KnouxTab) -> Unit,
    onUnlock: () -> Unit,
) {
    val unlocked by container.session.unlocked.collectAsStateWithLifecycle()
    val lang = LocalLanguage.current

    TabScreen(selected = KnouxTab.HOME, onTab = onTab) {
        Column(Modifier.fillMaxSize()) {
            BrandHeader(
                subtitle = tr("Private Encryption Suite", "مجموعة تشفير خاصة"),
                onSearch = onSearch,
                onSettings = onSettings,
                searchDescription = tr("Search tools", "بحث في الأدوات"),
                settingsDescription = tr("Account and settings", "الحساب والإعدادات"),
            )
            Column(
                Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = ScreenHorizontalPadding)
                    .padding(bottom = 96.dp),
            ) {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    StagHero(
                        modifier = Modifier.fillMaxWidth().height(156.dp),
                        contentDescription = tr("KNOUX Crypt stag emblem", "شعار نوكس كريبت"),
                    )
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text("Knoux ", style = MaterialTheme.typography.headlineMedium.copy(fontSize = 25.sp))
                        Text(
                            "Crypt",
                            style = MaterialTheme.typography.headlineMedium.copy(fontSize = 25.sp),
                            color = KnouxColors.VioletSoft,
                        )
                    }
                    DividerLine(Modifier.width(190.dp).padding(vertical = 5.dp))
                    Text(
                        tr("PRIVATE ENCRYPTION SUITE", "مجموعة تشفير خاصة"),
                        fontSize = 9.sp,
                        letterSpacing = 2.4.sp,
                        color = KnouxColors.Muted,
                    )
                    Spacer(Modifier.height(8.dp))
                    StatusPill(
                        text = if (unlocked) {
                            tr("Vault unlocked", "الخزنة مفتوحة")
                        } else {
                            tr("Guest preview", "معاينة الزائر")
                        },
                        tone = if (unlocked) KnouxColors.Success else KnouxColors.Warn,
                    )
                    Text(
                        if (unlocked) tr("Your Vault is Unlocked", "خزنتك مفتوحة")
                        else tr("Your Vault is Locked", "خزنتك مقفلة"),
                        style = MaterialTheme.typography.headlineSmall,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    Text(
                        if (unlocked) tr("End-to-End Encrypted", "تشفير من طرف إلى طرف")
                        else tr("No stored secrets are readable in guest mode", "لا يمكن قراءة الأسرار المخزنة في وضع الزائر"),
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 3.dp),
                    )
                    if (!unlocked) {
                        TextButton(onClick = onUnlock) {
                            Text(tr("Unlock to read stored data", "افتح لقراءة البيانات المخزنة"), color = KnouxColors.Violet)
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                Catalog.essentials.chunked(2).forEachIndexed { rowIndex, row ->
                    Row(Modifier.fillMaxWidth()) {
                        row.forEachIndexed { index, service ->
                            HomeServiceCard(
                                service = service,
                                alt = (rowIndex + index) % 2 == 1,
                                modifier = Modifier.weight(1f),
                                onClick = { onOpenService(service) },
                            )
                            if (index == 0) Spacer(Modifier.width(7.dp))
                        }
                    }
                    Spacer(Modifier.height(7.dp))
                }
                Text(
                    tr(
                        "Visual baseline PR #15 is the design source. Compiled screens are not production-verified security.",
                        "خط الأساس البصري PR #15 هو مصدر التصميم. الشاشات المترجمة ليست أمانًا إنتاجيًا موثقًا.",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp, start = 8.dp, end = 8.dp),
                )
                Text(
                    "v${BuildConfig.VERSION_NAME} · ${lang.uppercase()}",
                    style = MaterialTheme.typography.labelSmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun HomeServiceCard(
    service: ServiceDef,
    alt: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val lang = LocalLanguage.current
    val title = Catalog.title(service, lang)
    val chevron = if (LocalLayoutDirection.current == LayoutDirection.Rtl) "‹" else "›"
    GlassCard(
        modifier = modifier
            .height(78.dp)
            .clickable(role = Role.Button, onClickLabel = title, onClick = onClick),
        alt = alt,
        contentPadding = PaddingValues(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ServiceArtImage(service.art, Modifier.size(50.dp))
            Spacer(Modifier.width(7.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleSmall.copy(fontSize = 11.5.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    Catalog.description(service, lang),
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 9.sp, lineHeight = 12.sp),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                chevron,
                color = KnouxColors.Violet,
                fontSize = 20.sp,
                modifier = Modifier.padding(horizontal = 3.dp),
            )
        }
    }
}
