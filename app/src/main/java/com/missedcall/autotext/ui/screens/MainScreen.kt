package com.missedcall.autotext.ui.screens

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.data.db.CallLogEvent
import com.missedcall.autotext.data.license.DeveloperLicenseRecord
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.ui.theme.GrayPaused

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit,
    logs: List<CallLogEvent>,
    onClearLogs: () -> Unit,
    devRecords: List<DeveloperLicenseRecord>,
    onAddDevRecord: (String, String) -> Unit,
    onToggleDevRevoke: (String) -> Unit,
    missingPermissions: List<String>,
    onRequestPermissions: () -> Unit,
    onRequestPermissionBatch: (List<String>) -> Unit = {}
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    var devTapCount by remember { mutableIntStateOf(0) }
    var showPasswordDialog by remember { mutableStateOf(false) }
    var showDevDashboardDialog by remember { mutableStateOf(false) }
    var showOnboardingDialog by remember { mutableStateOf(false) }

    val context = LocalContext.current
    val devPasswordSecret = "2026"

    // Trigger onboarding dialog if missing permissions exist
    LaunchedEffect(missingPermissions) {
        if (missingPermissions.isNotEmpty()) {
            showOnboardingDialog = true
        }
    }

    if (showOnboardingDialog && missingPermissions.isNotEmpty()) {
        PermissionOnboardingDialog(
            missingPermissions = missingPermissions,
            onRequestPermissionBatch = onRequestPermissionBatch,
            onDismiss = { showOnboardingDialog = false }
        )
    }

    // Password Prompt Dialog for Secret Developer Admin Portal
    if (showPasswordDialog) {
        var inputPassword by remember { mutableStateOf("") }
        var passwordError by remember { mutableStateOf(false) }

        AlertDialog(
            onDismissRequest = { showPasswordDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Developer Password")
                }
            },
            text = {
                Column {
                    Text(
                        text = "Enter Developer Password (default: 2026) to access Developer License Manager.",
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = inputPassword,
                        onValueChange = {
                            inputPassword = it
                            passwordError = false
                        },
                        label = { Text("Developer Password") },
                        singleLine = true,
                        isError = passwordError,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (passwordError) {
                        Text(
                            text = "Incorrect Password",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (inputPassword == devPasswordSecret) {
                            showPasswordDialog = false
                            showDevDashboardDialog = true
                        } else {
                            passwordError = true
                        }
                    }
                ) {
                    Text("Unlock Developer Dashboard")
                }
            },
            dismissButton = {
                TextButton(onClick = { showPasswordDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // Full Mobile Developer Dashboard Dialog
    if (showDevDashboardDialog) {
        DeveloperDashboardDialog(
            records = devRecords,
            onAddRecord = onAddDevRecord,
            onToggleRevoke = onToggleDevRevoke,
            settings = settings,
            onSettingsChanged = onSettingsChanged,
            onDismiss = { showDevDashboardDialog = false }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column(
                        modifier = Modifier.clickable {
                            devTapCount++
                            if (devTapCount >= 5) {
                                devTapCount = 0
                                showPasswordDialog = true
                            }
                        }
                    ) {
                        Text(
                            text = "Missed Call Auto SMS",
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = if (settings.masterEnabled) "Appliance: ACTIVE" else "Appliance: PAUSED",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (settings.masterEnabled) ActiveGreenText else GrayPaused
                        )
                    }
                },
                actions = {
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = if (settings.masterEnabled) ActiveGreenContainer else GrayPaused.copy(alpha = 0.2f),
                        modifier = Modifier.padding(end = 12.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.PowerSettingsNew,
                                contentDescription = "Master Switch",
                                tint = if (settings.masterEnabled) ActiveGreenText else GrayPaused,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Switch(
                                checked = settings.masterEnabled,
                                onCheckedChange = { isChecked ->
                                    onSettingsChanged(settings.copy(masterEnabled = isChecked))
                                },
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = ActiveGreenText,
                                    checkedTrackColor = ActiveGreenContainer
                                )
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            TabRow(selectedTabIndex = selectedTab) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Dashboard") },
                    icon = { Icon(Icons.Default.Dashboard, contentDescription = null) }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("Settings") },
                    icon = { Icon(Icons.Default.Settings, contentDescription = null) }
                )
                Tab(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    text = { Text("Log (${logs.size})") },
                    icon = { Icon(Icons.Default.History, contentDescription = null) }
                )
            }

            when (selectedTab) {
                0 -> DashboardScreen(
                    settings = settings,
                    onSettingsChanged = onSettingsChanged,
                    logs = logs
                )
                1 -> SettingsScreen(
                    settings = settings,
                    onSettingsChanged = onSettingsChanged,
                    missingPermissions = missingPermissions,
                    onRequestPermissions = onRequestPermissions
                )
                2 -> ActivityLogScreen(
                    logs = logs,
                    onClearLogs = onClearLogs
                )
            }
        }
    }
}
