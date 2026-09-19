package com.missedcall.autotext.ui.screens

import android.provider.Settings
import android.widget.Toast
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.data.db.CallLogEvent
import com.missedcall.autotext.data.db.LogStatus
import com.missedcall.autotext.remote.RemoteUpdateManager
import com.missedcall.autotext.remote.UpdateInfo
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.ui.theme.GrayPaused
import com.missedcall.autotext.util.CarrierForwardingManager
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit,
    logs: List<CallLogEvent>
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val updateManager = remember { RemoteUpdateManager(context) }

    var isCheckingUpdate by remember { mutableStateOf(false) }
    var availableUpdate by remember { mutableStateOf<UpdateInfo?>(null) }
    var isDownloadingApk by remember { mutableStateOf(false) }
    var downloadProgress by remember { mutableIntStateOf(0) }
    var showAccountPortal by remember { mutableStateOf(false) }

    val androidId = remember {
        try {
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "UNKNOWN_DEVICE"
        } catch (e: Exception) {
            "UNKNOWN_DEVICE"
        }
    }

    val currentAppVersion = remember {
        try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            "v${pInfo.versionName} (Build ${pInfo.versionCode})"
        } catch (e: Exception) {
            "v1.1.2 (Build 4)"
        }
    }

    val successfulReplies = logs.count { it.status == LogStatus.SENT }
    // 33% estimated conversion rate on instant auto-text response
    val estimatedSavedRevenue = (successfulReplies * 0.33 * settings.averageJobValue).roundToInt()
    val currencyFormat = NumberFormat.getCurrencyInstance(Locale.US)

    // Pulsing animation for active status
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )

    // Automatic Background OTA Update Check on Startup
    LaunchedEffect(Unit) {
        try {
            val updateUrl = settings.remoteUpdateUrl.ifBlank { RemoteUpdateManager.DEFAULT_UPDATE_URL }
            val result = updateManager.checkForUpdatesDetailed(updateUrl, forceCheck = false)
            if (result is com.missedcall.autotext.remote.UpdateCheckResult.Available) {
                availableUpdate = result.updateInfo
            }
        } catch (e: Exception) {
            // Ignore background error
        }
    }

    // OTA Update Dialog
    availableUpdate?.let { update ->
        AlertDialog(
            onDismissRequest = {
                if (!update.mandatory) {
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
                    Text(if (update.mandatory) "Mandatory Update: v${update.versionName}" else "App Update Available (v${update.versionName})")
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
                                text = "⚠️ This is a required critical update (Build ${update.versionCode}). Please install to continue using Missed Call Auto SMS.",
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(8.dp)
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
                    Text(if (isDownloadingApk) "Downloading..." else "Download & Install Upgrade")
                }
            },
            dismissButton = {
                if (!isDownloadingApk && !update.mandatory) {
                    TextButton(onClick = { availableUpdate = null }) {
                        Text("Later")
                    }
                }
            }
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // 1. Live Hero Status Card
        item {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = if (settings.masterEnabled) ActiveGreenContainer.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surfaceVariant
                ),
                border = androidx.compose.foundation.BorderStroke(
                    width = 1.dp,
                    color = if (settings.masterEnabled) ActiveGreenText else MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
                ),
                shape = RoundedCornerShape(20.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(14.dp)
                                    .clip(CircleShape)
                                    .background(
                                        if (settings.masterEnabled) ActiveGreenText.copy(alpha = pulseAlpha) else GrayPaused
                                    )
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = if (settings.masterEnabled) "APPLIANCE ACTIVE" else "APPLIANCE PAUSED",
                                fontWeight = FontWeight.Black,
                                fontSize = 14.sp,
                                color = if (settings.masterEnabled) ActiveGreenText else GrayPaused,
                                letterSpacing = 0.5.sp
                            )
                        }

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

                    Spacer(modifier = Modifier.height(12.dp))

                    Text(
                        text = if (settings.masterEnabled)
                            "Listening for missed calls. Instant auto-replies will dispatch via SIM line."
                        else
                            "Appliance paused. Switch ON to resume auto-text replies.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        // Strategic In-App Upgrade / Feature Spotlight Banner
        item {
            InAppPromoBannerCard(
                settings = settings,
                isProEdition = com.missedcall.autotext.BuildConfig.IS_PRO_EDITION
            )
        }

        // AI Receptionist Conditional Call Forwarding Card
        item {
            val carrier = remember { CarrierForwardingManager.detectCarrier(context) }
            val carrierCodes = remember(carrier, settings.voiceReceptionistForwardingNumber) {
                CarrierForwardingManager.computeCodes(carrier, settings.voiceReceptionistForwardingNumber)
            }

            Card(
                colors = CardDefaults.cardColors(
                    containerColor = if (settings.voiceReceptionistEnabled)
                        Color(0xFF673AB7).copy(alpha = 0.12f)
                    else
                        MaterialTheme.colorScheme.surface
                ),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    if (settings.voiceReceptionistEnabled) Color(0xFF9C27B0).copy(alpha = 0.5f) else MaterialTheme.colorScheme.outlineVariant
                ),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = if (settings.voiceReceptionistEnabled) Color(0xFF9C27B0) else MaterialTheme.colorScheme.primaryContainer,
                                modifier = Modifier.size(36.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.RecordVoiceOver,
                                        contentDescription = null,
                                        tint = if (settings.voiceReceptionistEnabled) Color.White else MaterialTheme.colorScheme.onPrimaryContainer,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.width(10.dp))
                            Column {
                                Text(
                                    text = "AI Voice Receptionist",
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.titleMedium
                                )
                                Text(
                                    text = if (settings.voiceReceptionistEnabled) "Forwarding Active (15s Ring)" else "Carrier Forwarding Disabled",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (settings.voiceReceptionistEnabled) Color(0xFF9C27B0) else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }

                        Switch(
                            checked = settings.voiceReceptionistEnabled,
                            onCheckedChange = { isChecked ->
                                if (isChecked) {
                                    val codes = CarrierForwardingManager.activateConditionalForwarding(context, settings.voiceReceptionistForwardingNumber)
                                    onSettingsChanged(settings.copy(voiceReceptionistEnabled = true))
                                    Toast.makeText(context, "Dialing carrier activation (${codes.activateCode}). Press Call to confirm.", Toast.LENGTH_LONG).show()
                                } else {
                                    val codes = CarrierForwardingManager.deactivateConditionalForwarding(context)
                                    onSettingsChanged(settings.copy(voiceReceptionistEnabled = false))
                                    Toast.makeText(context, "Dialing carrier deactivation (${codes.deactivateCode}). Press Call to turn off forwarding.", Toast.LENGTH_LONG).show()
                                }
                            }
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Text(
                        text = if (settings.voiceReceptionistEnabled)
                            "Unanswered calls ring your phone for 15 seconds, then forward automatically to your AI voice receptionist."
                        else
                            "Toggle ON to auto-forward unanswered calls to your AI receptionist. Toggle OFF anytime to revert to standard carrier voicemail.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Carrier: ${carrierCodes.carrierName} (${if (settings.voiceReceptionistEnabled) carrierCodes.activateCode else carrierCodes.deactivateCode})",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            TextButton(
                                onClick = { showAccountPortal = true },
                                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)
                            ) {
                                Text("Greeting & Plan", fontSize = 11.sp)
                            }
                        }
                    }
                }
            }
        }

        // 2. Activity Counters & Revenue Grid
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Card(
                    modifier = Modifier.weight(1f),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Auto-Text Replies",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "$successfulReplies",
                            fontSize = 28.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = "Missed calls answered",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Card(
                    modifier = Modifier.weight(1f),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Est. Saved Revenue",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = currencyFormat.format(estimatedSavedRevenue),
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold,
                            color = ActiveGreenText
                        )
                        Text(
                            text = "Based on $${settings.averageJobValue.toInt()} job avg",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }

        // 3. Average Job Value Control Card
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column {
                            Text(
                                text = "Average Client Job Value ($)",
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.titleSmall
                            )
                            Text(
                                text = "Used to calculate your saved monthly revenue.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(250.0, 450.0, 750.0, 1200.0).forEach { preset ->
                            FilterChip(
                                selected = settings.averageJobValue == preset,
                                onClick = { onSettingsChanged(settings.copy(averageJobValue = preset)) },
                                label = { Text("$${preset.toInt()}") }
                            )
                        }
                    }
                }
            }
        }

        // 4. Hardware License & Account Subscription Portal
        item {
            val isCancelled = settings.subscriptionStatus == "CANCELLED"
            val isTrial = settings.subscriptionStatus == "TRIAL" || settings.licenseKey.contains("TRIAL", ignoreCase = true)

            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.AccountCircle,
                                contentDescription = null,
                                tint = if (isCancelled) MaterialTheme.colorScheme.onSurfaceVariant else if (isTrial) Color(0xFFFFB300) else ActiveGreenText
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Account & Subscription Portal",
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.titleSmall
                            )
                        }

                        Surface(
                            color = if (isCancelled) MaterialTheme.colorScheme.outlineVariant else if (isTrial) Color(0xFFFFB300) else ActiveGreenContainer,
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text(
                                text = if (isCancelled) "CANCELLED" else if (isTrial) "3-DAY TRIAL" else "LIFETIME",
                                color = if (isCancelled) MaterialTheme.colorScheme.onSurfaceVariant else if (isTrial) Color.Black else ActiveGreenText,
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(text = "BUSINESS NAME", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(
                                text = settings.businessName.ifBlank { "My Business" },
                                fontWeight = FontWeight.SemiBold,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }

                        Column(horizontalAlignment = Alignment.End) {
                            Text(text = "LICENSE KEY", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(
                                text = if (settings.licenseKey.isNotBlank()) settings.licenseKey else "MCAS-DEMO-89F2",
                                fontWeight = FontWeight.SemiBold,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Text(text = "HARDWARE BINDING", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        text = "🔒 Locked to Device #${androidId.take(10).uppercase(Locale.ROOT)} (Active Phone)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedButton(
                        onClick = { showAccountPortal = true },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.ManageAccounts, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Manage Account & Subscription")
                    }
                }
            }
        }

        // 5. In-App OTA Software Update Check Card
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.SystemUpdate,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(20.dp)
                            )
                            Text(
                                text = "Software & OTA Updates",
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.titleSmall
                            )
                        }

                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f))
                        ) {
                            Text(
                                text = currentAppVersion,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = "Check cloud servers for the latest feature releases, security updates, and instant over-the-air patches.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(14.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            modifier = Modifier.weight(1.25f),
                            enabled = !isCheckingUpdate,
                            shape = RoundedCornerShape(10.dp),
                            onClick = {
                                isCheckingUpdate = true
                                coroutineScope.launch {
                                    val updateUrl = settings.remoteUpdateUrl.ifBlank { RemoteUpdateManager.DEFAULT_UPDATE_URL }
                                    when (val res = updateManager.checkForUpdatesDetailed(updateUrl, forceCheck = false)) {
                                        is com.missedcall.autotext.remote.UpdateCheckResult.Available -> {
                                            availableUpdate = res.updateInfo
                                            Toast.makeText(context, "🚀 New Update Available: v${res.updateInfo.versionName} (Build ${res.updateInfo.versionCode})!", Toast.LENGTH_LONG).show()
                                        }
                                        is com.missedcall.autotext.remote.UpdateCheckResult.UpToDate -> {
                                            Toast.makeText(context, "✅ App is up to date (v${res.currentVersionName}, Build ${res.currentVersionCode})!", Toast.LENGTH_SHORT).show()
                                        }
                                        is com.missedcall.autotext.remote.UpdateCheckResult.Error -> {
                                            Toast.makeText(context, "⚠️ Update Check Failed: ${res.message}", Toast.LENGTH_LONG).show()
                                        }
                                    }
                                    isCheckingUpdate = false
                                }
                            }
                        ) {
                            if (isCheckingUpdate) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = Color.White)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Checking...", style = MaterialTheme.typography.labelMedium)
                            } else {
                                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Check Updates", style = MaterialTheme.typography.labelMedium)
                            }
                        }

                        OutlinedButton(
                            modifier = Modifier.weight(1f),
                            enabled = !isCheckingUpdate,
                            shape = RoundedCornerShape(10.dp),
                            onClick = {
                                isCheckingUpdate = true
                                coroutineScope.launch {
                                    val updateUrl = settings.remoteUpdateUrl.ifBlank { RemoteUpdateManager.DEFAULT_UPDATE_URL }
                                    when (val res = updateManager.checkForUpdatesDetailed(updateUrl, forceCheck = true)) {
                                        is com.missedcall.autotext.remote.UpdateCheckResult.Available -> {
                                            availableUpdate = res.updateInfo
                                            Toast.makeText(context, "🚀 Forcing OTA Update to v${res.updateInfo.versionName} (Build ${res.updateInfo.versionCode})!", Toast.LENGTH_LONG).show()
                                        }
                                        is com.missedcall.autotext.remote.UpdateCheckResult.Error -> {
                                            Toast.makeText(context, "⚠️ Connection Error: ${res.message}", Toast.LENGTH_LONG).show()
                                        }
                                        is com.missedcall.autotext.remote.UpdateCheckResult.UpToDate -> {
                                            Toast.makeText(context, "✅ App is on Build ${res.currentVersionCode}", Toast.LENGTH_SHORT).show()
                                        }
                                    }
                                    isCheckingUpdate = false
                                }
                            }
                        ) {
                            Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Force OTA", style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
            }
        }

        // 6. Recent Auto-Responses Feed Header
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Recent Auto-Responses",
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = "${logs.size} total entries",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // Recent Logs List
        if (logs.isEmpty()) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Text(
                        text = "No missed calls recorded yet. Auto-replies will appear here in real time.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }
        } else {
            items(logs.take(3)) { log ->
                val dateFormat = SimpleDateFormat("MMM dd, h:mm a", Locale.getDefault())
                val timeStr = dateFormat.format(Date(log.timestamp))

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = log.phoneNumber,
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Text(
                                text = timeStr,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        Surface(
                            color = if (log.status == LogStatus.SENT) ActiveGreenContainer else MaterialTheme.colorScheme.errorContainer,
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text(
                                text = if (log.status == LogStatus.SENT) "Replied via SIM" else log.status.name,
                                color = if (log.status == LogStatus.SENT) ActiveGreenText else MaterialTheme.colorScheme.error,
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                }
            }
        }
    }

    if (showAccountPortal) {
        CustomerAccountPortalDialog(
            settings = settings,
            onSettingsChanged = onSettingsChanged,
            onDismiss = { showAccountPortal = false }
        )
    }
}
