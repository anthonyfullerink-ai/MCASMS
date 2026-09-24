package com.missedcall.autotext.ui.screens

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import com.missedcall.autotext.data.AppSettings

/**
 * Profile & Account Dialog
 * Seamlessly presents the complete Self-Service License, Subscription & Upgrades Center.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileDialog(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit,
    onDismiss: () -> Unit
) {
    CustomerAccountPortalDialog(
        settings = settings,
        onSettingsChanged = onSettingsChanged,
        onDismiss = onDismiss
    )
}
