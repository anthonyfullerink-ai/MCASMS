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
                    // SECTION 1: n8n & External Webhook Integration
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Share, contentDescription = null, tint = Color(0xFFA855F7), modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("n8n / Make / CRM Webhook Bridge", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                "Completely separate from your Vapi AI backend. Forwards missed calls directly into your private n8n workflows or CRM for custom lead automations.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            // Outbound Missed Call Forwarding Toggle
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                                    Text("Forward Missed Calls to Webhook", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                                    Text("Posts JSON payload of missed calls to your custom URL.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Switch(
                                    checked = settings.outboundWebhookEnabled,
                                    onCheckedChange = { onSettingsChanged(settings.copy(outboundWebhookEnabled = it)) }
                                )
                            }

                            if (settings.outboundWebhookEnabled) {
                                Spacer(modifier = Modifier.height(10.dp))
                                OutlinedTextField(
                                    value = outboundUrlInput,
                                    onValueChange = {
                                        outboundUrlInput = it
                                        onSettingsChanged(settings.copy(selectedOutboundWebhookUrl = it))
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                    label = { Text("Your n8n / Make Webhook URL") },
                                    placeholder = { Text("https://your-n8n.instance/webhook/missed-call") },
                                    singleLine = true
                                )

                                Spacer(modifier = Modifier.height(8.dp))

                                Button(
                                    onClick = {
                                        if (outboundUrlInput.isBlank()) {
                                            Toast.makeText(context, "Please enter a valid webhook URL first", Toast.LENGTH_SHORT).show()
                                            return@Button
                                        }
                                        isPingingWebhook = true
                                        pingStatusMessage = null
                                        coroutineScope.launch(Dispatchers.IO) {
                                            try {
                                                val url = URL(outboundUrlInput.trim())
                                                val conn = (url.openConnection() as HttpURLConnection).apply {
                                                    requestMethod = "POST"
                                                    connectTimeout = 5000
                                                    readTimeout = 5000
                                                    doOutput = true
                                                    setRequestProperty("Content-Type", "application/json")
                                                    val testPayload = """{"event":"ping_test","timestamp":${System.currentTimeMillis()},"source":"MissedCallAutoSMS_Pro"}"""
                                                    outputStream.use { os -> os.write(testPayload.toByteArray(StandardCharsets.UTF_8)) }
                                                }
                                                val code = conn.responseCode
                                                withContext(Dispatchers.Main) {
                                                    isPingingWebhook = false
                                                    pingStatusMessage = if (code in 200..299) "✅ Webhook Ping Success (HTTP $code)" else "⚠️ Webhook Ping Returned HTTP $code"
                                                }
                                            } catch (e: Exception) {
                                                withContext(Dispatchers.Main) {
                                                    isPingingWebhook = false
                                                    pingStatusMessage = "❌ Ping Failed: ${e.message}"
                                                }
                                            }
                                        }
                                    },
                                    enabled = !isPingingWebhook,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    if (isPingingWebhook) {
                                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Pinging Webhook...")
                                    } else {
                                        Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("Send Test Ping to n8n")
                                    }
                                }

                                pingStatusMessage?.let { msg ->
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        text = msg,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = if (msg.startsWith("✅")) ActiveGreenText else AmberWarning,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }

                            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

                            // Inbound SMS Dispatch API Secret
                            Text("Inbound SMS Dispatch Secret (Optional)", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                            Text("Use this API secret when triggering SMS from your n8n workflow to this phone.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.height(6.dp))
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = MaterialTheme.colorScheme.surface,
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = settings.webhookApiSecret.ifBlank { "Unconfigured" },
                                        style = MaterialTheme.typography.bodySmall,
                                        fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                                    )
                                }
                            }
                        }
                    }

                    // SECTION 2: Dual SIM Configuration
                    Card(
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.SimCard, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Dual SIM Slot Routing", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text("Choose which physical SIM slot will dispatch outbound auto-texts.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

                            Spacer(modifier = Modifier.height(12.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                FilterChip(
                                    selected = settings.preferredSimSlot == 0,
                                    onClick = { onSettingsChanged(settings.copy(preferredSimSlot = 0)) },
                                    label = { Text("SIM 1 (Default)") },
                                    modifier = Modifier.weight(1f)
                                )
                                FilterChip(
                                    selected = settings.preferredSimSlot == 1,
                                    onClick = { onSettingsChanged(settings.copy(preferredSimSlot = 1)) },
                                    label = { Text("SIM 2") },
                                    modifier = Modifier.weight(1f)
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
