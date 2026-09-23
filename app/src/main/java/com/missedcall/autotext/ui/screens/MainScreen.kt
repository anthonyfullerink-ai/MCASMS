package com.missedcall.autotext.ui.screens

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.data.db.CallLogEvent
import com.missedcall.autotext.data.db.VoiceCallEvent
import com.missedcall.autotext.data.license.DeveloperLicenseRecord
import com.missedcall.autotext.remote.RemoteUpdateManager
import com.missedcall.autotext.remote.UpdateInfo
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.ui.theme.GrayPaused
import kotlinx.coroutines.launch

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
    onClearVoiceCalls: () -> Unit = {}
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    var showCustomerPortalDialog by remember { mutableStateOf(false) }
    var showOnboardingDialog by remember { mutableStateOf(false) }

    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val updateManager = remember { RemoteUpdateManager(context) }

    var availableUpdate by remember { mutableStateOf<UpdateInfo?>(null) }
    var isDownloadingApk by remember { mutableStateOf(false) }
    var downloadProgress by remember { mutableIntStateOf(0) }
    var activePromo by remember { mutableStateOf<PromoType?>(null) }

    // Check for mandatory updates and record launch on open
    LaunchedEffect(Unit) {
        InAppPromoController.onAppOpened(context)
        try {
            val updateUrl = settings.remoteUpdateUrl.ifBlank { RemoteUpdateManager.DEFAULT_UPDATE_URL }
            val result = updateManager.checkForUpdatesDetailed(updateUrl, forceCheck = false)
            if (result is com.missedcall.autotext.remote.UpdateCheckResult.Available) {
                availableUpdate = result.updateInfo
            } else {
                // If no update pending, evaluate strategic in-app ad/promo
                val eligible = InAppPromoController.shouldShowPromoPopup(
                    context = context,
                    settings = settings,
                    isMandatoryUpdatePending = false
                )
                if (eligible != null) {
                    activePromo = eligible
                }
            }
        } catch (e: Exception) {
            // Background check failure
        }
    }

    // Trigger onboarding dialog if missing permissions exist and user hasn't completed/dismissed onboarding
    LaunchedEffect(missingPermissions, settings.permissionsOnboardingCompleted) {
        if (!settings.permissionsOnboardingCompleted && missingPermissions.isNotEmpty()) {
            showOnboardingDialog = true
        } else if (settings.permissionsOnboardingCompleted) {
            showOnboardingDialog = false
        }
    }

    if (showOnboardingDialog && !settings.permissionsOnboardingCompleted && missingPermissions.isNotEmpty()) {
        PermissionOnboardingDialog(
            missingPermissions = missingPermissions,
            onRequestPermissionBatch = onRequestPermissionBatch,
            onDismiss = {
                showOnboardingDialog = false
                onSettingsChanged(settings.copy(permissionsOnboardingCompleted = true))
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
                                text = "⚠️ This is a required critical update (v${update.versionName}, Build ${update.versionCode}). You must install this update to continue using Missed Call Auto SMS with the updated telecom routing & 24/7 AI Voice features.",
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(10.dp)
                            )
                        }
                    }
                    Text(
                        text = update.releaseNotes ?: "A new performance and feature update is ready for Missed Call Auto SMS.",
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

    // Strategic In-App Ad / Promotion Dialog
    if (availableUpdate == null && activePromo != null) {
        InAppPromoDialog(
            promoType = activePromo!!,
            licenseKey = settings.licenseKey,
            onDismiss = { activePromo = null }
        )
    }

    var showProfileDialog by remember { mutableStateOf(false) }
    var showGlobalSettingsDialog by remember { mutableStateOf(false) }

    if (showProfileDialog) {
        ProfileDialog(
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

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column(
                        modifier = Modifier.clickable { showProfileDialog = true }
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
                    // Profile Dialog Icon
                    IconButton(
                        onClick = { showProfileDialog = true }
                    ) {
                        Icon(
                            Icons.Default.AccountCircle,
                            contentDescription = "My Profile & Account",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(26.dp)
                        )
                    }

                    // Global Settings (n8n Webhooks, Dual SIM, Battery, OTA)
                    IconButton(
                        onClick = { showGlobalSettingsDialog = true }
                    ) {
                        Icon(
                            Icons.Default.Settings,
                            contentDescription = "Global Settings & n8n",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(24.dp)
                        )
                    }

                    // Master Power Toggle
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = if (settings.masterEnabled) ActiveGreenContainer else GrayPaused.copy(alpha = 0.2f),
                        modifier = Modifier.padding(start = 2.dp, end = 10.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.PowerSettingsNew,
                                contentDescription = "Master Switch",
                                tint = if (settings.masterEnabled) ActiveGreenText else GrayPaused,
                                modifier = Modifier.size(18.dp)
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
        val unreadVoiceCalls = remember(voiceCalls) { voiceCalls.count { !it.isRead } }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            TabRow(selectedTabIndex = selectedTab) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Dashboard", fontSize = 12.sp, fontWeight = if (selectedTab == 0) FontWeight.Bold else FontWeight.Normal) },
                    icon = { Icon(Icons.Default.Dashboard, contentDescription = null, modifier = Modifier.size(20.dp)) }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("Auto-SMS", fontSize = 12.sp, fontWeight = if (selectedTab == 1) FontWeight.Bold else FontWeight.Normal) },
                    icon = { Icon(Icons.Default.ChatBubble, contentDescription = null, modifier = Modifier.size(20.dp)) }
                )
                Tab(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    text = {
                        Text(if (unreadVoiceCalls > 0) "Voice ($unreadVoiceCalls)" else "Voice", fontSize = 12.sp, fontWeight = if (selectedTab == 2) FontWeight.Bold else FontWeight.Normal)
                    },
                    icon = { Icon(Icons.Default.RecordVoiceOver, contentDescription = null, modifier = Modifier.size(20.dp)) }
                )
                Tab(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    text = { Text("Logs", fontSize = 12.sp, fontWeight = if (selectedTab == 3) FontWeight.Bold else FontWeight.Normal) },
                    icon = { Icon(Icons.Default.History, contentDescription = null, modifier = Modifier.size(20.dp)) }
                )
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
            }
        }
    }
}
