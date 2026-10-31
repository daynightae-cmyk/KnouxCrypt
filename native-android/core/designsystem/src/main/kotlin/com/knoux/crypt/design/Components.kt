package com.knoux.crypt.design

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Home
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.TextStyle

enum class ServiceArt(val drawable: Int) {
    ENCRYPT(R.drawable.service_encrypt),
    VAULT(R.drawable.service_vault),
    NOTES(R.drawable.service_notes),
    PASSWORDS(R.drawable.service_passwords),
    KEY(R.drawable.service_key),
    AUTHENTICATOR(R.drawable.service_authenticator),
    PRIVACY(R.drawable.service_privacy),
    RECOVERY(R.drawable.service_recovery),
}

@Composable
fun ServiceArtImage(art: ServiceArt, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(art.drawable),
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = modifier,
    )
}

@Composable
fun StagHero(
    modifier: Modifier = Modifier,
    animated: Boolean = true,
    contentDescription: String? = null,
) {
    val reduced = LocalReducedMotion.current
    val glow = if (animated && !reduced) {
        val transition = rememberInfiniteTransition(label = "stag-glow")
        val value by transition.animateFloat(
            initialValue = 0.65f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(5_000, easing = FastOutSlowInEasing), RepeatMode.Reverse),
            label = "stag-glow-alpha",
        )
        value
    } else {
        remember { mutableFloatStateOf(0.8f) }.floatValue
    }
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        KnouxColors.Violet.copy(alpha = 0.26f * glow),
                        Color(0x33B75CE8).copy(alpha = 0.12f * glow),
                        Color.Transparent,
                    ),
                    center = center,
                    radius = size.minDimension * 0.62f,
                ),
                radius = size.minDimension * 0.62f,
                center = center,
            )
        }
        Image(
            painter = painterResource(R.drawable.knoux_stag),
            contentDescription = contentDescription,
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    alt: Boolean = false,
    borderColor: Color = KnouxColors.Line,
    contentPadding: PaddingValues = PaddingValues(16.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier = modifier
            .clip(shape)
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        if (alt) KnouxColors.CardTopAlt else KnouxColors.CardTop,
                        KnouxColors.CardBottom,
                    ),
                ),
            )
            .border(1.dp, borderColor, shape)
            .padding(contentPadding),
        content = content,
    )
}

@Composable
fun KnouxPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().height(52.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color(0xFF5C1DA0),
            contentColor = KnouxColors.Text,
            disabledContainerColor = Color(0xFF2A1B3B),
            disabledContentColor = KnouxColors.Faint,
        ),
    ) {
        Text(text, style = MaterialThemeHolder.label, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

/** Keeps typography lookups import-light inside design-system buttons. */
private object MaterialThemeHolder {
    val label: TextStyle
        @Composable get() = androidx.compose.material3.MaterialTheme.typography.labelLarge
}

@Composable
fun KnouxGhostButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().height(50.dp),
        shape = RoundedCornerShape(14.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, KnouxColors.LineHot.copy(alpha = 0.55f)),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = KnouxColors.Text,
            disabledContentColor = KnouxColors.Faint,
        ),
    ) {
        Text(text, style = androidx.compose.material3.MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun KnouxTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
    minLines: Int = 1,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    trailingContent: (@Composable () -> Unit)? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label, fontSize = 12.sp) },
        modifier = modifier.fillMaxWidth(),
        singleLine = singleLine,
        minLines = minLines,
        textStyle = androidx.compose.material3.MaterialTheme.typography.bodyMedium,
        visualTransformation = visualTransformation,
        keyboardOptions = keyboardOptions,
        trailingIcon = trailingContent,
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = KnouxColors.Text,
            unfocusedTextColor = KnouxColors.Text,
            focusedBorderColor = KnouxColors.LineHot,
            unfocusedBorderColor = KnouxColors.Line,
            focusedLabelColor = KnouxColors.Violet,
            unfocusedLabelColor = KnouxColors.Muted,
            cursorColor = KnouxColors.Violet,
            focusedContainerColor = Color(0x6613091F),
            unfocusedContainerColor = Color(0x6613091F),
        ),
    )
}

@Composable
fun BrandHeader(
    subtitle: String,
    onSearch: (() -> Unit)? = null,
    onSettings: (() -> Unit)? = null,
    searchDescription: String = "Search",
    settingsDescription: String = "Settings",
) {
    Row(
        Modifier.fillMaxWidth().padding(start = 8.dp, end = 8.dp, top = 4.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row {
                Text("Knoux ", style = androidx.compose.material3.MaterialTheme.typography.headlineSmall)
                Text("Crypt", style = androidx.compose.material3.MaterialTheme.typography.headlineSmall, color = KnouxColors.VioletSoft)
            }
            Text(
                subtitle.uppercase(),
                style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                letterSpacing = 2.sp,
            )
        }
        if (onSearch != null) RoundIconButton(Icons.Default.Search, searchDescription, onSearch)
        if (onSettings != null) {
            Spacer(Modifier.width(8.dp))
            RoundIconButton(Icons.Default.Settings, settingsDescription, onSettings)
        }
    }
}

@Composable
private fun RoundIconButton(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, onClick: () -> Unit) {
    Surface(
        shape = CircleShape,
        color = Color(0x99150B24),
        border = androidx.compose.foundation.BorderStroke(1.dp, KnouxColors.Line),
    ) {
        IconButton(onClick = onClick, modifier = Modifier.size(44.dp)) {
            Icon(icon, contentDescription = description, tint = KnouxColors.Violet, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
fun BackHeader(title: String, onBack: () -> Unit, backendDescription: String = "Back", actions: @Composable () -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(shape = CircleShape, color = Color(0x99150B24), border = androidx.compose.foundation.BorderStroke(1.dp, KnouxColors.Line)) {
            TextButton(onClick = onBack, modifier = Modifier.size(44.dp), contentPadding = PaddingValues(0.dp)) {
                Text("‹", fontSize = 26.sp, color = KnouxColors.Violet)
            }
        }
        Spacer(Modifier.width(12.dp))
        Text(title, style = androidx.compose.material3.MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
        actions()
    }
}

@Composable
fun StatusPill(text: String, tone: Color = KnouxColors.Warn, modifier: Modifier = Modifier) {
    Row(
        modifier
            .clip(CircleShape)
            .background(Color(0x661B0D2B))
            .border(1.dp, tone.copy(alpha = 0.5f), CircleShape)
            .padding(horizontal = 9.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Canvas(Modifier.size(5.dp)) { drawCircle(tone) }
        Text(text.uppercase(), fontSize = 8.sp, letterSpacing = 1.sp, color = tone, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(),
        modifier = modifier,
        style = androidx.compose.material3.MaterialTheme.typography.labelMedium,
        letterSpacing = 1.6.sp,
        color = KnouxColors.Violet.copy(alpha = 0.85f),
    )
}

@Composable
fun InfoRow(label: String, value: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(vertical = 5.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
        Text(value, style = androidx.compose.material3.MaterialTheme.typography.bodySmall, color = KnouxColors.Text, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun DividerLine(modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f).height(1.dp).background(Brush.horizontalGradient(listOf(Color.Transparent, Color(0x88A54CE8), Color.Transparent))))
    }
}

@Composable
fun GridGlyph(modifier: Modifier = Modifier, tint: Color) {
    Canvas(modifier) {
        val side = size.minDimension
        val gap = side * 0.16f
        val cell = (side - gap) / 2f
        val radius = androidx.compose.ui.geometry.CornerRadius(cell * 0.22f)
        val color = tint
        drawRoundRect(color, topLeft = Offset(0f, 0f), size = androidx.compose.ui.geometry.Size(cell, cell), cornerRadius = radius)
        drawRoundRect(color, topLeft = Offset(cell + gap, 0f), size = androidx.compose.ui.geometry.Size(cell, cell), cornerRadius = radius)
        drawRoundRect(color, topLeft = Offset(0f, cell + gap), size = androidx.compose.ui.geometry.Size(cell, cell), cornerRadius = radius)
        drawRoundRect(color, topLeft = Offset(cell + gap, cell + gap), size = androidx.compose.ui.geometry.Size(cell, cell), cornerRadius = radius)
    }
}

enum class KnouxTab { HOME, TOOLS, ACCOUNT }

@Composable
fun KnouxBottomBar(
    selected: KnouxTab,
    labels: List<String>,
    onSelect: (KnouxTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth().height(66.dp),
        shape = CircleShape,
        color = Color(0xF212091F),
        border = androidx.compose.foundation.BorderStroke(1.dp, KnouxColors.LineHot.copy(alpha = 0.55f)),
        tonalElevation = 0.dp,
    ) {
        Row(Modifier.fillMaxSize().padding(5.dp), verticalAlignment = Alignment.CenterVertically) {
            TabItem(KnouxTab.HOME, selected, labels.getOrElse(0) { "Home" }, onSelect, Modifier.weight(1f)) {
                Icon(Icons.Default.Home, contentDescription = null, modifier = Modifier.size(20.dp))
            }
            TabItem(KnouxTab.TOOLS, selected, labels.getOrElse(1) { "Tools" }, onSelect, Modifier.weight(1f)) {
                GridGlyph(Modifier.size(18.dp), tint = androidx.compose.material3.LocalContentColor.current)
            }
            TabItem(KnouxTab.ACCOUNT, selected, labels.getOrElse(2) { "Account" }, onSelect, Modifier.weight(1f)) {
                Icon(Icons.Default.Person, contentDescription = null, modifier = Modifier.size(20.dp))
            }
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.TabItem(
    tab: KnouxTab,
    selected: KnouxTab,
    label: String,
    onSelect: (KnouxTab) -> Unit,
    modifier: Modifier,
    icon: @Composable () -> Unit,
) {
    val active = tab == selected
    Column(
        modifier
            .clip(CircleShape)
            .background(if (active) Color(0x555B1CA9) else Color.Transparent)
            .clickable { onSelect(tab) }
            .padding(vertical = 7.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        androidx.compose.runtime.CompositionLocalProvider(androidx.compose.material3.LocalContentColor provides if (active) KnouxColors.Text else KnouxColors.Muted) {
            icon()
        }
        Spacer(Modifier.height(2.dp))
        Text(label, fontSize = 9.sp, color = if (active) KnouxColors.Text else KnouxColors.Muted)
    }
}
