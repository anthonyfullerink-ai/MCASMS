package com.missedcall.autotext.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = SapphirePrimary,
    onPrimary = Color.White,
    primaryContainer = SapphireContainerSubtle,
    onPrimaryContainer = SapphireLight,
    secondary = PurplePrimary,
    onSecondary = Color.White,
    tertiary = EmeraldSuccess,
    onTertiary = Color.White,
    background = DarkBackground,
    surface = DarkSurface,
    onBackground = TextHeading,
    onSurface = TextHeading,
    surfaceVariant = DarkSurfaceElevated,
    onSurfaceVariant = TextBody,
    outline = DarkCardBorder
)

private val LightColorScheme = lightColorScheme(
    primary = SapphirePrimary,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFEFF6FF),
    onPrimaryContainer = SapphireHover,
    secondary = PurplePrimary,
    onSecondary = Color.White,
    tertiary = EmeraldSuccess,
    onTertiary = Color.White,
    background = Color(0xFFF8FAFC),
    surface = Color.White,
    onBackground = Color(0xFF090E1A),
    onSurface = Color(0xFF090E1A),
    surfaceVariant = Color(0xFFF1F5F9),
    onSurfaceVariant = Color(0xFF334155),
    outline = Color(0xFFE2E8F0)
)

@Composable
fun MissedCallAutoTextTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
