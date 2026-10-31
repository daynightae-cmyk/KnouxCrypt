package com.knoux.crypt.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.knoux.crypt.Catalog
import com.knoux.crypt.LocalLanguage
import com.knoux.crypt.ServiceDef
import com.knoux.crypt.ServiceStatus
import com.knoux.crypt.design.BrandHeader
import com.knoux.crypt.design.GlassCard
import com.knoux.crypt.design.KnouxColors
import com.knoux.crypt.design.KnouxTab
import com.knoux.crypt.design.KnouxTextField
import com.knoux.crypt.tr

@Composable
fun ToolsScreen(
    onOpenService: (ServiceDef) -> Unit,
    onTab: (KnouxTab) -> Unit,
    onSettings: () -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf("essentials") }
    val lang = LocalLanguage.current

    val filtered = remember(query, category, lang) {
        val group = Catalog.groups.firstOrNull { it.id == category } ?: Catalog.groups.first()
        val base = if (query.isBlank()) Catalog.all.filter { it.id in group.ids } else Catalog.all
        if (query.isBlank()) base
        else {
            val needle = normalizeSearch(query)
            base.filter {
                normalizeSearch("${it.titleEn} ${it.titleAr} ${it.descEn} ${it.descAr} ${it.id}").contains(needle)
            }
        }
    }

    TabScreen(selected = KnouxTab.TOOLS, onTab = onTab) {
        Column(Modifier.fillMaxSize().imePadding().padding(horizontal = ScreenHorizontalPadding)) {
            BrandHeader(
                subtitle = tr("Private Encryption Suite", "مجموعة تشفير خاصة"),
                onSettings = onSettings,
                settingsDescription = tr("Account and settings", "الحساب والإعدادات"),
            )
            Text(
                tr("Tools", "الأدوات"),
                style = MaterialTheme.typography.headlineMedium,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            )
            Text(
                tr("Choose a service to open", "اختر خدمة لفتحها"),
                style = MaterialTheme.typography.bodySmall,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
            )
            Spacer(Modifier.height(8.dp))
            KnouxTextField(
                value = query,
                onValueChange = { query = it },
                label = tr("Search tools", "بحث في الأدوات"),
                singleLine = true,
            )
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Catalog.groups.forEach { group ->
                    val active = group.id == category
                    Text(
                        if (lang == "ar") group.titleAr else group.titleEn,
                        fontSize = 10.sp,
                        color = if (active) KnouxColors.Text else KnouxColors.Muted,
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(if (active) KnouxColors.VioletDeep.copy(alpha = 0.55f) else KnouxColors.Raised)
                            .clickable(role = Role.Tab, onClickLabel = group.titleEn) {
                                category = group.id
                            }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "${tr("Matching services", "خدمات مطابقة")}: ${filtered.size}",
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
            Spacer(Modifier.height(6.dp))
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                modifier = Modifier.fillMaxWidth().weight(1f),
                contentPadding = PaddingValues(bottom = 100.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (filtered.isEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Text(
                            tr("No matching tools. Try another term.", "لا توجد أدوات مطابقة. جرّب كلمة أخرى."),
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.fillMaxWidth().padding(vertical = 28.dp),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        )
                    }
                } else {
                    items(filtered, key = { it.id }) { service ->
                        ToolCard(service = service, lang = lang, onClick = { onOpenService(service) })
                    }
                }
            }
        }
    }
}

@Composable
private fun ToolCard(service: ServiceDef, lang: String, onClick: () -> Unit) {
    val title = Catalog.title(service, lang)
    GlassCard(
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp)
            .clickable(role = Role.Button, onClickLabel = title, onClick = onClick),
        contentPadding = PaddingValues(horizontal = 11.dp, vertical = 8.dp),
    ) {
        Text(
            title,
            style = MaterialTheme.typography.titleSmall.copy(fontSize = 11.5.sp),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.weight(1f))
        Text(
            statusLabel(service.status, lang),
            fontSize = 8.sp,
            letterSpacing = 0.8.sp,
            color = statusColor(service.status),
        )
    }
}

@Composable
private fun statusLabel(status: ServiceStatus, lang: String): String = when (status) {
    ServiceStatus.IMPLEMENTED -> if (lang == "ar") "جاهز · غير موثق" else "READY · UNVERIFIED"
    ServiceStatus.DESIGN_ONLY -> if (lang == "ar") "تصميم فقط" else "DESIGN ONLY"
    ServiceStatus.BLOCKED -> if (lang == "ar") "محجوب" else "BLOCKED"
}

private fun statusColor(status: ServiceStatus) = when (status) {
    ServiceStatus.IMPLEMENTED -> KnouxColors.Success
    ServiceStatus.DESIGN_ONLY -> KnouxColors.Faint
    ServiceStatus.BLOCKED -> KnouxColors.Alert
}
