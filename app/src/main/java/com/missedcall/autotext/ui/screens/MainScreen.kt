package com.missedcall.autotext.ui.screens

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.draw.scale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.data.db.CallLogEvent
import com.missedcall.autotext.data.db.VoiceCallEvent
import com.missedcall.autotext.data.license.DeveloperLicenseRecord
import com.missedcall.autotext.remote.RemoteUpdateManager
import com.missedcall.autotext.remote.UpdateInfo
import com.missedcall.autotext.ui.theme.*
import kotlinx.coroutines.launch

import androidx.compose.ui.graphics.Color
import com.missedcall.autotext.data.db.AppNotificationEvent
import com.missedcall.autotext.util.AppBranding

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
    onRequestPermissionBatch: (List<String>) -> Unit = {},
    voiceCalls: List<VoiceCallEvent> = emptyList(),
    onMarkVoiceCallRead: (Long) -> Unit = {},
    onClearVoiceCalls: () -> Unit = {},
    notifications: List<AppNotificationEvent> = emptyList(),
    onMarkAllNotificationsRead: () -> Unit = {},
    onClearNotifications: () -> Unit = {},
    onMarkNotificationRead: (Long) -> Unit = {},
    initialOpenNotifications: Boolean = false
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    var showCustomerPortalDialog by remember { mutableStateOf(false) }
    var showOnboardingDialog by remember { mutableStateOf(false) }
    var showNotificationsPanel by remember { mutableStateOf(initialOpenNotifications) }

    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val updateManager = remember { RemoteUpdateManager(context) }

    var availableUpdate by remember { mutableStateOf<UpdateInfo?>(null) }
    var isDownloadingApk by remember { mutableStateOf(false) }
    var downloadProgress by remember { mutableIntStateOf(0) }

    // Check for mandatory updates and record launch on open
    LaunchedEffect(Unit) {
        try {
            val updateUrl = settings.remoteUpdateUrl.ifBlank { RemoteUpdateManager.DEFAULT_UPDATE_URL }
            val result = updateManager.checkForUpdatesDetailed(updateUrl, forceCheck = false)
            if (result is com.missedcall.autotext.remote.UpdateCheckResult.Available) {
                availableUpdate = result.updateInfo
            }
        } catch (e: Exception) {
            // Background check failure
        }
    }

    // Remote Configuration Sync: Pull latest agency/cloud settings into handset
    val settingsRepo = remember { com.missedcall.autotext.data.SettingsRepository(context) }
    LaunchedEffect(settings.licenseKey) {
        if (settings.licenseKey.isNotBlank()) {
            try {
                settingsRepo.fetchAndApplyRemoteConfig(settings.licenseKey)
            } catch (e: Exception) {
                // Background sync fail-safe
            }
        }
    }

    val hasCriticalMissing = remember(missingPermissions) {
        missingPermissions.any {
            it == android.Manifest.permission.SEND_SMS ||
            it == android.Manifest.permission.READ_CALL_LOG ||
            it == android.Manifest.permission.RECEIVE_SMS
        }
    }

    // Trigger onboarding dialog if critical permissions are missing or user hasn't completed onboarding
    LaunchedEffect(missingPermissions, settings.permissionsOnboardingCompleted) {
        if (hasCriticalMissing || (!settings.permissionsOnboardingCompleted && missingPermissions.isNotEmpty())) {
            showOnboardingDialog = true
        } else if (missingPermissions.isEmpty()) {
            showOnboardingDialog = false
        }
    }

    val isMandatoryUpdatePending = availableUpdate != null && availableUpdate!!.mandatory

    if (showOnboardingDialog && !isMandatoryUpdatePending && missingPermissions.isNotEmpty()) {
        PermissionOnboardingDialog(
            missingPermissions = missingPermissions,
            onRequestPermissionBatch = onRequestPermissionBatch,
            onDismiss = {
                showOnboardingDialog = false
                if (!hasCriticalMissing) {
                    onSettingsChanged(settings.copy(permissionsOnboardingCompleted = true))
                }
            }
        )
    }

    val isDeveloperKey = remember(settings.licenseKey) {
        settings.licenseKey.contains("DEV", ignoreCase = true) ||
        settings.licenseKey.startsWith("MCAS-DEV") ||
        settings.licenseKey.contains("DEMO", ignoreCase = true) ||
        settings.licenseKey.contains("MASTER", ignoreCase = true)
    }

    // Root-Level OTA Update Dialog (Forced / Mandatory when mandatory == true)
    availableUpdate?.let { update ->
        AlertDialog(
            onDismissRequest = {
                if (!update.mandatory || isDeveloperKey) {
                    availableUpdate = null
                }
            },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.SystemUpdate,
                        contentDescription = null,
                        tint = if (update.mandatory) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (update.mandatory) "🚨 Required Update (v${update.versionName})" else "App Update Available (v${update.versionName})",
                        fontWeight = FontWeight.Bold
                    )
                }
            },
            text = {
                Column {
                    if (update.mandatory) {
                        Surface(
                            color = MaterialTheme.colorScheme.errorContainer,
                            shape = MaterialTheme.shapes.small,
                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                        ) {
                            Text(
                                text = "⚠️ This is a required critical update (v${update.versionName}, Build ${update.versionCode}). You must install this update to continue using ${AppBranding.appName} with the updated telecom routing & 24/7 AI Voice features.",
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(10.dp)
                            )
                        }
                    }
                    Text(
                        text = update.releaseNotes ?: "A new performance and feature update is ready for ${AppBranding.appName}.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Source: ${update.apkUrl}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (isDownloadingApk) {
                        Spacer(modifier = Modifier.height(16.dp))
                        LinearProgressIndicator(
                            progress = { downloadProgress / 100f },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Downloading APK: $downloadProgress%",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    enabled = !isDownloadingApk,
                    colors = if (update.mandatory) ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error) else ButtonDefaults.buttonColors(),
                    onClick = {
                        isDownloadingApk = true
                        coroutineScope.launch {
                            val success = updateManager.downloadAndInstallApk(update.apkUrl) { progress ->
                                downloadProgress = progress
                            }
                            isDownloadingApk = false
                            if (!success) {
                                Toast.makeText(context, "Failed to download update APK", Toast.LENGTH_SHORT).show()
                            }
                            if (!update.mandatory) {
                                availableUpdate = null
                            }
                        }
                    }
                ) {
                    Text(
                        text = if (isDownloadingApk) "Downloading ($downloadProgress%)..." else if (update.mandatory) "⚡ Install Required Update Now" else "Download & Install Upgrade",
                        fontWeight = FontWeight.Bold
                    )
                }
            },
            dismissButton = {
                if (!isDownloadingApk) {
                    if (isDeveloperKey) {
                        TextButton(onClick = { availableUpdate = null }) {
                            Text("🛠️ Developer Bypass", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                        }
                    } else if (!update.mandatory) {
                        TextButton(onClick = { availableUpdate = null }) {
                            Text("Later")
                        }
                    }
                }
            }
        )
    }

    var showProfileDialog by remember { mutableStateOf(false) }
    var showGlobalSettingsDialog by remember { mutableStateOf(false) }

    if (showProfileDialog) {
        CustomerAccountPortalDialog(
            settings = settings,
            onSettingsChanged = onSettingsChanged,
            onDismiss = { showProfileDialog = false }
        )
    }

    if (showGlobalSettingsDialog) {
        GlobalSettingsDialog(
            settings = settings,
            onSettingsChanged = onSettingsChanged,
            onDismiss = { showGlobalSettingsDialog = false }
        )
    }

    if (showNotificationsPanel) {
        NotificationsPanelDialog(
            notifications = notifications,
            onDismiss = { showNotificationsPanel = false },
            onMarkAllRead = onMarkAllNotificationsRead,
            onClearAll = onClearNotifications,
            onMarkRead = onMarkNotificationRead
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column(
                        modifier = Modifier
                            .clickable { showProfileDialog = true }
                            .padding(vertical = 2.dp)
                    ) {
                        Text(
                            text = AppBranding.appName,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            maxLines = 1,
                            softWrap = false,
                            overflow = TextOverflow.Ellipsis
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(top = 1.dp)
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = if (settings.masterEnabled) EmeraldSuccess else GrayPaused,
                                modifier = Modifier.size(6.dp)
                            ) {}
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = if (settings.masterEnabled) "Appliance: ACTIVE" else "Appliance: PAUSED",
                                style = MaterialTheme.typography.bodySmall,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (settings.masterEnabled) EmeraldLight else GrayPaused
                            )
                        }
                    }
                },
                actions = {
                    // AI Activity Notifications Bell Icon
                    val unreadNotifs = remember(notifications) { notifications.count { !it.isRead } }
                    IconButton(
                        onClick = { showNotificationsPanel = true },
                        modifier = Modifier.size(36.dp)
                    ) {
                        BadgedBox(
                            badge = {
                                if (unreadNotifs > 0) {
                                    Badge(
                                        containerColor = SapphirePrimary,
                                        contentColor = Color.White
                                    ) {
                                        Text("$unreadNotifs", fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        ) {
                            Icon(
                                Icons.Default.Notifications,
                                contentDescription = "AI Activity Feed",
                                tint = if (unreadNotifs > 0) SapphireLight else TextMuted,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }

                    // Profile / Account Dialog Icon
                    IconButton(
                        onClick = { showProfileDialog = true },
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            Icons.Default.AccountCircle,
                            contentDescription = "My Profile & Account",
                            tint = SapphireLight,
                            modifier = Modifier.size(22.dp)
                        )
                    }

                    // Master Power Toggle
                    Switch(
                        checked = settings.masterEnabled,
                        onCheckedChange = { isChecked ->
                            onSettingsChanged(settings.copy(masterEnabled = isChecked))
                        },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = EmeraldLight,
                            checkedTrackColor = EmeraldContainer,
                            uncheckedThumbColor = GrayPaused,
                            uncheckedTrackColor = DarkSurfaceElevated
                        ),
                        modifier = Modifier
                            .padding(end = 6.dp)
                            .scale(0.8f)
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        bottomBar = {
            NavigationBar(
                containerColor = DarkSurface,
                tonalElevation = 8.dp
            ) {
                // Tab 0: Status Hub
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = {
                        Icon(
                            imageVector = Icons.Default.Speed,
                            contentDescription = "Status Hub"
                        )
                    },
                    label = { Text("Status", fontSize = 11.sp, fontWeight = if (selectedTab == 0) FontWeight.Bold else FontWeight.Normal) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = SapphireLight,
                        selectedTextColor = SapphireLight,
                        indicatorColor = SapphireContainerSubtle,
                        unselectedIconColor = TextMuted,
                        unselectedTextColor = TextMuted
                    )
                )

                // Tab 1: Auto-SMS
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = {
                        Icon(
                            imageVector = Icons.Default.ChatBubble,
                            contentDescription = "Auto-SMS"
                        )
                    },
                    label = { Text("Auto-SMS", fontSize = 11.sp, fontWeight = if (selectedTab == 1) FontWeight.Bold else FontWeight.Normal) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = SapphireLight,
                        selectedTextColor = SapphireLight,
                        indicatorColor = SapphireContainerSubtle,
                        unselectedIconColor = TextMuted,
                        unselectedTextColor = TextMuted
                    )
                )

                // Tab 2: Voice AI
                val unreadVoiceCalls = remember(voiceCalls) { voiceCalls.count { !it.isRead } }
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = {
                        BadgedBox(
                            badge = {
                                if (unreadVoiceCalls > 0) {
                                    Badge(containerColor = SapphirePrimary, contentColor = Color.White) {
                                        Text("$unreadVoiceCalls", fontSize = 9.sp)
                                    }
                                }
                            }
                        ) {
                            Icon(
                                imageVector = Icons.Default.RecordVoiceOver,
                                contentDescription = "Voice AI"
                            )
                        }
                    },
                    label = { Text("Voice AI", fontSize = 11.sp, fontWeight = if (selectedTab == 2) FontWeight.Bold else FontWeight.Normal) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = SapphireLight,
                        selectedTextColor = SapphireLight,
                        indicatorColor = SapphireContainerSubtle,
                        unselectedIconColor = TextMuted,
                        unselectedTextColor = TextMuted
                    )
                )

                // Tab 3: Activity Logs
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = {
                        Icon(
                            imageVector = Icons.Default.History,
                            contentDescription = "Activity Logs"
                        )
                    },
                    label = { Text("Logs", fontSize = 11.sp, fontWeight = if (selectedTab == 3) FontWeight.Bold else FontWeight.Normal) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = SapphireLight,
                        selectedTextColor = SapphireLight,
                        indicatorColor = SapphireContainerSubtle,
                        unselectedIconColor = TextMuted,
                        unselectedTextColor = TextMuted
                    )
                )

                // Tab 4: Central Settings Control Center
                NavigationBarItem(
                    selected = selectedTab == 4,
                    onClick = { selectedTab = 4 },
                    icon = {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = "Settings"
                        )
                    },
                    label = { Text("Settings", fontSize = 11.sp, fontWeight = if (selectedTab == 4) FontWeight.Bold else FontWeight.Normal) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = SapphireLight,
                        selectedTextColor = SapphireLight,
                        indicatorColor = SapphireContainerSubtle,
                        unselectedIconColor = TextMuted,
                        unselectedTextColor = TextMuted
                    )
                )
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            if (missingPermissions.isNotEmpty()) {
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onRequestPermissions() }
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "⚠️ Action Required: Missing App Permissions",
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                            Text(
                                text = "SMS & Call Log permissions are required to detect calls and send auto-replies.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                fontSize = 11.sp
                            )
                        }
                        Spacer(modifier = Modifier.width(6.dp))
                        FilledTonalButton(
                            onClick = onRequestPermissions,
                            colors = ButtonDefaults.filledTonalButtonColors(
                                containerColor = MaterialTheme.colorScheme.error,
                                contentColor = MaterialTheme.colorScheme.onError
                            ),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Text("Enable", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            when (selectedTab) {
                0 -> DashboardScreen(
                    settings = settings,
                    onSettingsChanged = onSettingsChanged,
                    logs = logs,
                    onNavigateToTab = { selectedTab = it }
                )
                1 -> AutoSmsScreen(
                    settings = settings,
                    onSettingsChanged = onSettingsChanged
                )
                2 -> VoiceHubScreen(
                    settings = settings,
                    onSettingsChanged = onSettingsChanged,
                    voiceCalls = voiceCalls,
                    onMarkVoiceCallRead = onMarkVoiceCallRead,
                    onClearVoiceCalls = onClearVoiceCalls
                )
                3 -> ActivityLogScreen(
                    logs = logs,
                    onClearLogs = onClearLogs
                )
                4 -> SettingsScreen(
                    settings = settings,
                    onSettingsChanged = onSettingsChanged,
                    missingPermissions = missingPermissions,
                    onRequestPermissions = onRequestPermissions,
                    onClearLogs = onClearLogs
                )
            }
        }
    }
}
