package com.missedcall.autotext.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.remote.RemoteUpdateManager
import com.missedcall.autotext.remote.UpdateInfo
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.ui.theme.AmberWarning
import com.missedcall.autotext.ui.theme.RedError
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/**
 * Global App Settings Dialog
 * Houses:
 * - n8n / Make / CRM Webhook Integration (completely separate from Vapi backend)
 * - Dual SIM Slot Selector
 * - Android Battery Optimization & Permissions
 * - Software & OTA Updates
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GlobalSettingsDialog(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    val isPro = remember(settings.licenseKey) {
        settings.licenseKey.contains("PRO", ignoreCase = true) ||
        settings.licenseKey.contains("DEV", ignoreCase = true) ||
        settings.licenseKey.contains("DEMO", ignoreCase = true) ||
        settings.licenseKey.contains("MASTER", ignoreCase = true) ||
        com.missedcall.autotext.BuildConfig.IS_PRO_EDITION
    }

    var outboundUrlInput by remember(settings.selectedOutboundWebhookUrl) {
        mutableStateOf(settings.selectedOutboundWebhookUrl)
    }
    var isPingingWebhook by remember { mutableStateOf(false) }
    var pingStatusMessage by remember { mutableStateOf<String?>(null) }

    val updateManager = remember { RemoteUpdateManager(context) }
    var isCheckingUpdate by remember { mutableStateOf(false) }
    var availableUpdate by remember { mutableStateOf<UpdateInfo?>(null) }
    var isDownloadingApk by remember { mutableStateOf(false) }
    var downloadProgress by remember { mutableIntStateOf(0) }

    val currentAppVersion = remember {
        try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            "v${pInfo.versionName} (Build ${pInfo.versionCode})"
        } catch (e: Exception) {
            "v1.6.0 (Build 14)"
        }
    }

    val isIgnoringBattery = remember {
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            pm.isIgnoringBatteryOptimizations(context.packageName)
        } catch (e: Exception) {
            false
        }
    }

    val activeSimInfoList = remember {
        try {
            val sm = context.getSystemService(android.telephony.SubscriptionManager::class.java)
            @android.annotation.SuppressLint("MissingPermission")
            sm?.activeSubscriptionInfoList ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .fillMaxHeight(0.92f),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 6.dp
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.primaryContainer,
                            modifier = Modifier.size(38.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.Settings,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text("Global Settings", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                            Text("n8n Automations, Dual SIM & Telephony", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }

                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .verticalScroll(scrollState),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // SECTION 1: Platform Automations Notice
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Hub, contentDescription = null, tint = Color(0xFFA855F7), modifier = Modifier.size(24.dp))
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text("Platform Integrations & Webhooks", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                                Text("All bi-directional n8n, Make, Zapier, GoHighLevel presets and webhook settings are now managed in the dedicated 'Automations' tab at the bottom of the screen.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }

                    // SECTION 2: Dual SIM Configuration
                    Card(
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.SimCard, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Dual SIM Slot Routing", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                                }
                                if (!isPro) {
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = RedError.copy(alpha = 0.15f)
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        ) {
                                            Icon(Icons.Default.Lock, contentDescription = null, tint = RedError, modifier = Modifier.size(10.dp))
                                            Spacer(modifier = Modifier.width(3.dp))
                                            Text("PRO ONLY", fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, color = RedError)
                                        }
                                    }
                                }
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                if (isPro) "Choose which physical SIM slot will dispatch outbound auto-texts."
                                else "Choose which physical SIM slot will dispatch outbound auto-texts (Requires Pro Gateway License).",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                FilterChip(
                                    selected = settings.preferredSimSlot == 0,
                                    onClick = {
                                        if (isPro) {
                                            onSettingsChanged(settings.copy(preferredSimSlot = 0))
                                        } else {
                                            Toast.makeText(context, "Dual SIM routing requires Pro Gateway ($249.99 upgrade)", Toast.LENGTH_SHORT).show()
                                        }
                                    },
                                    enabled = isPro,
                                    label = { Text("SIM 1 (Default)") },
                                    modifier = Modifier.weight(1f)
                                )
                                FilterChip(
                                    selected = settings.preferredSimSlot == 1,
                                    onClick = {
                                        if (isPro) {
                                            onSettingsChanged(settings.copy(preferredSimSlot = 1))
                                        } else {
                                            Toast.makeText(context, "Dual SIM routing requires Pro Gateway ($249.99 upgrade)", Toast.LENGTH_SHORT).show()
                                        }
                                    },
                                    enabled = isPro,
                                    label = { Text("SIM 2") },
                                    modifier = Modifier.weight(1f)
                                )
                            }

                            if (!isPro) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    "🔒 Dual SIM slot selection requires Pro Automation Gateway ($249.99).",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = RedError,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }

                            if (activeSimInfoList.isNotEmpty()) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = "Active Carrier: ${activeSimInfoList.firstOrNull()?.carrierName ?: "Carrier SIM Active"}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }

                    // SECTION 3: Battery Optimization & Service Guard
                    Card(
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.BatteryChargingFull, contentDescription = null, tint = if (isIgnoringBattery) ActiveGreenText else AmberWarning, modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Battery Optimization Exemption", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                if (isIgnoringBattery)
                                    "✅ Unrestricted: Android will not kill the Missed Call Auto SMS background listener."
                                else
                                    "⚠️ Restricted: Please disable battery optimization so Android doesn't pause the appliance while the screen is locked.",
                                style = MaterialTheme.typography.bodySmall,
                                color = if (isIgnoringBattery) MaterialTheme.colorScheme.onSurfaceVariant else AmberWarning
                            )

                            if (!isIgnoringBattery) {
                                Spacer(modifier = Modifier.height(10.dp))
                                Button(
                                    onClick = {
                                        try {
                                            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                                                data = Uri.parse("package:${context.packageName}")
                                            }
                                            context.startActivity(intent)
                                        } catch (e: Exception) {
                                            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                                            context.startActivity(intent)
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text("Grant Unrestricted Battery Access")
                                }
                            }
                        }
                    }

                    // SECTION 4: Software & OTA Updates
                    Card(
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.SystemUpdate, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Software & OTA Updates", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text("Current App Version: $currentAppVersion", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

                            Spacer(modifier = Modifier.height(10.dp))

                            Button(
                                onClick = {
                                    isCheckingUpdate = true
                                    coroutineScope.launch {
                                        val url = settings.remoteUpdateUrl.ifBlank { RemoteUpdateManager.DEFAULT_UPDATE_URL }
                                        val result = updateManager.checkForUpdatesDetailed(url, forceCheck = true)
                                        isCheckingUpdate = false
                                        if (result is com.missedcall.autotext.remote.UpdateCheckResult.Available) {
                                            availableUpdate = result.updateInfo
                                        } else {
                                            Toast.makeText(context, "You are running the latest version ($currentAppVersion)", Toast.LENGTH_SHORT).show()
                                        }
                                    }
                                },
                                enabled = !isCheckingUpdate,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                if (isCheckingUpdate) {
                                    CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Checking for Updates...")
                                } else {
                                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Check for Software Updates")
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                Button(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Done")
                }
            }
        }
    }
}
