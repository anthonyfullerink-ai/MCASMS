package com.missedcall.autotext.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.gson.Gson
import com.missedcall.autotext.BuildConfig
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.data.license.LicenseManager
import com.missedcall.autotext.data.license.LicenseStatus
import com.missedcall.autotext.data.license.LicenseTier
import com.missedcall.autotext.remote.RemoteUpdateManager
import com.missedcall.autotext.remote.UpdateInfo
import com.missedcall.autotext.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/**
 * Consolidated Central Settings & Utilities Control Center
 * 
 * Clean, structured utility layout:
 * 1. Appliance & Hardware License (Key activation, binding, portal link)
 * 2. Telephony & Dual-SIM Routing (Carrier detection, slot selection)
 * 3. Webhooks & Automations (STRICT PAYWALL: Requires $299.99 Pro License or $9.99/mo Active Subscription)
 * 4. Battery & Background Health (Unrestricted battery, Android 13+ restricted settings)
 * 5. Software & System Updates (OTA check, build info, diagnostics)
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit,
    missingPermissions: List<String>,
    onRequestPermissions: () -> Unit,
    onClearLogs: () -> Unit = {}
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    // Battery optimization state
    var isIgnoringBattery by remember { mutableStateOf(checkBatteryOptimization(context)) }

    // License and entitlement verification
    var inputLicenseKey by remember { mutableStateOf(settings.licenseKey) }
    val licenseInfo = remember(settings.licenseKey) { LicenseManager.verifyLicenseKey(settings.licenseKey) }

    val isPro = remember(settings.licenseKey) {
        licenseInfo.tier == LicenseTier.PRO ||
        settings.licenseKey.contains("PRO", ignoreCase = true) ||
        settings.licenseKey.contains("DEV", ignoreCase = true) ||
        settings.licenseKey.contains("DEMO", ignoreCase = true) ||
        settings.licenseKey.contains("MASTER", ignoreCase = true) ||
        BuildConfig.IS_PRO_EDITION
    }

    val hasActiveSubscription = remember(settings.voiceSubscriptionActive, settings.subscriptionStatus, settings.licenseKey) {
        settings.voiceSubscriptionActive ||
        (settings.subscriptionStatus.equals("ACTIVE", ignoreCase = true) &&
         !settings.subscriptionStatus.equals("CANCELLED", ignoreCase = true) &&
         settings.licenseKey.isNotBlank())
    }

    // Webhooks are ONLY included in $299.99 Pro License OR active $9.99/mo Subscription
    val isWebhookUnlocked = isPro || hasActiveSubscription

    // In-app checkout dialog state
    var showInAppPayment by remember { mutableStateOf(false) }
    var inAppPaymentUrl by remember { mutableStateOf("") }
    var inAppPaymentTitle by remember { mutableStateOf("Secure Checkout") }

    // Customer Portal Dialog state
    var showCustomerPortal by remember { mutableStateOf(false) }
    var isSyncingRemote by remember { mutableStateOf(false) }

    // SIM subscription detection
    val activeSimInfoList = remember {
        try {
            val sm = context.getSystemService(android.telephony.SubscriptionManager::class.java)
            @android.annotation.SuppressLint("MissingPermission")
            sm?.activeSubscriptionInfoList ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    // Webhook configuration state
    var isDropdownExpanded by remember { mutableStateOf(false) }
    var newWebhookUrlInput by remember { mutableStateOf("") }
    var isPingingWebhook by remember { mutableStateOf(false) }
    var pingStatusMessage by remember { mutableStateOf<String?>(null) }
    var testWebhookPhone by remember { mutableStateOf("") }
    var testWebhookMsg by remember { mutableStateOf("🚀 Utility Test: Webhook SMS dispatched via genuine carrier SIM!") }
    var testSimSlot by remember { mutableIntStateOf(settings.preferredSimSlot) }

    // OTA Update state
    val updateManager = remember { RemoteUpdateManager(context) }
    var isCheckingUpdate by remember { mutableStateOf(false) }
    var availableUpdate by remember { mutableStateOf<UpdateInfo?>(null) }
    var isDownloadingApk by remember { mutableStateOf(false) }
    var downloadProgress by remember { mutableIntStateOf(0) }
    var isActivatingLicense by remember { mutableStateOf(false) }

    // Android 13+ guide collapse state
    var showAndroid13Guide by remember { mutableStateOf(false) }

    val currentAppVersion = remember {
        try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            "v${pInfo.versionName} (Build ${pInfo.versionCode})"
        } catch (e: Exception) {
            "v1.7.8 (Build 25)"
        }
    }

    // In-App Payment Dialog
    if (showInAppPayment) {
        InAppPaymentDialog(
            url = inAppPaymentUrl,
            title = inAppPaymentTitle,
            onDismiss = { showInAppPayment = false },
            onPaymentSuccess = {
                showInAppPayment = false
                Toast.makeText(context, "Payment successful! Refreshing license...", Toast.LENGTH_LONG).show()
            }
        )
    }

    // Customer Account Portal Dialog
    if (showCustomerPortal) {
        CustomerAccountPortalDialog(
            settings = settings,
            onSettingsChanged = onSettingsChanged,
            onDismiss = { showCustomerPortal = false }
        )
    }

    // OTA Update Alert Dialog
    availableUpdate?.let { update ->
        AlertDialog(
            onDismissRequest = {
                if (!update.mandatory) availableUpdate = null
            },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.SystemUpdate,
                        contentDescription = null,
                        tint = if (update.mandatory) RedError else SapphirePrimary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(if (update.mandatory) "Required Update: v${update.versionName}" else "App Update Available (v${update.versionName})")
                }
            },
            text = {
                Column {
                    Text(
                        text = update.releaseNotes ?: "A performance and security update is ready for ${com.missedcall.autotext.util.AppBranding.appName}.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Source: ${update.apkUrl}",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextMuted
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
                            color = TextMuted
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
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = SapphirePrimary)
                ) {
                    Text(if (isDownloadingApk) "Downloading..." else "Install Upgrade Now")
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // ── TOP HEADER / IDENTITY ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Settings & Utilities",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = TextHeading
                )
                Text(
                    text = "Hardware Routing, Webhooks & Licensing",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextMuted
                )
            }

            Surface(
                shape = RoundedCornerShape(12.dp),
                color = if (isPro) SapphireContainerSubtle else if (hasActiveSubscription) EmeraldContainerSubtle else DarkCardBorder
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                ) {
                    Icon(
                        imageVector = if (isPro) Icons.Default.Bolt else if (hasActiveSubscription) Icons.Default.CheckCircle else Icons.Default.Lock,
                        contentDescription = null,
                        tint = if (isPro) SapphireLight else if (hasActiveSubscription) EmeraldLight else TextMuted,
                        modifier = Modifier.size(13.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = if (isPro) "PRO LIFETIME" else if (hasActiveSubscription) "$9.99/MO ACTIVE" else "STANDARD",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isPro) SapphireLight else if (hasActiveSubscription) EmeraldLight else TextMuted
                    )
                }
            }
        }

        // ── REMOTE AGENCY MANAGEMENT & CLOUD SYNC BANNER ──
        if (settings.lockHandsetSettings) {
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                border = BorderStroke(1.dp, SapphireLight.copy(alpha = 0.6f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Lock,
                        contentDescription = null,
                        tint = SapphireLight,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Managed Remotely by " + settings.remoteConfigManagedBy.ifBlank { "Agency Partner" },
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleSmall,
                            color = TextHeading
                        )
                        Text(
                            text = "Auto-reply messages and voice settings are managed remotely. Handset modifications are locked.",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextMuted
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    FilledTonalButton(
                        enabled = !isSyncingRemote,
                        onClick = {
                            coroutineScope.launch {
                                isSyncingRemote = true
                                val repo = com.missedcall.autotext.data.SettingsRepository(context)
                                val updated = repo.fetchAndApplyRemoteConfig(settings.licenseKey)
                                isSyncingRemote = false
                                if (updated) {
                                    Toast.makeText(context, "Settings updated from cloud!", Toast.LENGTH_SHORT).show()
                                } else {
                                    Toast.makeText(context, "Handset is up to date", Toast.LENGTH_SHORT).show()
                                }
                            }
                        },
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                    ) {
                        Text(if (isSyncingRemote) "..." else "🔄 Sync", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // ═════════════════════════════════════════════════════════════════════
        // SECTION 1: 🔑 APPLIANCE & HARDWARE LICENSE
        // ═════════════════════════════════════════════════════════════════════
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            border = BorderStroke(1.dp, DarkCardBorder),
            modifier = Modifier.fillMaxWidth()
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
                            color = SapphireContainerSubtle,
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = SapphireLight, modifier = Modifier.size(20.dp))
                            }
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Appliance License",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = TextHeading
                            )
                            Text(
                                text = if (licenseInfo.status == LicenseStatus.ACTIVE_LIFETIME || licenseInfo.status == LicenseStatus.ACTIVE_SUBSCRIPTION)
                                    "Licensed to: ${licenseInfo.licensedTo}"
                                else
                                    "Enter key to unlock appliance features",
                                style = MaterialTheme.typography.labelSmall,
                                color = TextMuted
                            )
                        }
                    }

                    TextButton(onClick = { showCustomerPortal = true }) {
                        Text("Account Portal →", fontSize = 12.sp, color = SapphireLight, fontWeight = FontWeight.Bold)
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // License Key Field
                OutlinedTextField(
                    value = inputLicenseKey,
                    onValueChange = { inputLicenseKey = it.uppercase().trim() },
                    label = { Text("License Key") },
                    placeholder = { Text("MCAS-XXXX-XXXX or MCAS-PRO-XXXX") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = SapphirePrimary,
                        unfocusedBorderColor = DarkCardBorder,
                        focusedLabelColor = SapphireLight,
                        cursorColor = SapphireLight
                    ),
                    trailingIcon = {
                        if (inputLicenseKey != settings.licenseKey) {
                            Button(
                                onClick = {
                                    val candidateKey = inputLicenseKey.trim().uppercase()
                                    if (candidateKey.isBlank()) {
                                        Toast.makeText(context, "Please enter a License Key.", Toast.LENGTH_SHORT).show()
                                        return@Button
                                    }
                                    val verification = LicenseManager.verifyLicenseKey(candidateKey)
                                    if (verification.status != LicenseStatus.ACTIVE_LIFETIME && verification.status != LicenseStatus.ACTIVE_SUBSCRIPTION) {
                                        Toast.makeText(context, "❌ Invalid License Key format or checksum.", Toast.LENGTH_LONG).show()
                                        return@Button
                                    }

                                    isActivatingLicense = true
                                    coroutineScope.launch {
                                        val deviceId = LicenseManager.getDeviceId(context)
                                        val deviceModel = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"
                                        var serverSuccess = false

                                        try {
                                            val endpoint = if (settings.remoteUpdateUrl.contains("localhost") || settings.remoteUpdateUrl.contains("10.0.")) {
                                                "http://10.0.2.2:8000/api/verify-license"
                                            } else {
                                                "https://missedcallautosms.com/api/verify-license"
                                            }

                                            val jsonResult = withContext(Dispatchers.IO) {
                                                val url = URL(endpoint)
                                                val conn = (url.openConnection() as HttpURLConnection).apply {
                                                    requestMethod = "POST"
                                                    connectTimeout = 8000
                                                    readTimeout = 8000
                                                    doOutput = true
                                                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                                                    val payload = org.json.JSONObject().apply {
                                                        put("licenseKey", candidateKey)
                                                        put("deviceId", deviceId)
                                                        put("deviceModel", deviceModel)
                                                        put("appVersion", BuildConfig.VERSION_NAME)
                                                        put("fcmToken", settings.fcmDeviceToken)
                                                    }
                                                    outputStream.use { it.write(payload.toString().toByteArray(StandardCharsets.UTF_8)) }
                                                }
                                                val code = conn.responseCode
                                                val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                                                val resp = stream?.bufferedReader()?.use { it.readText() } ?: "{}"
                                                org.json.JSONObject(resp)
                                            }

                                            if (jsonResult.optBoolean("valid", false)) {
                                                serverSuccess = true
                                            }
                                        } catch (e: Exception) {
                                            android.util.Log.w("SettingsScreen", "Online verify error: ${e.message}")
                                        }

                                        withContext(Dispatchers.Main) {
                                            isActivatingLicense = false
                                            onSettingsChanged(settings.copy(licenseKey = candidateKey))
                                            Toast.makeText(context, "✅ License Activated for ${verification.licensedTo}!", Toast.LENGTH_LONG).show()
                                        }
                                    }
                                },
                                enabled = !isActivatingLicense,
                                modifier = Modifier.padding(end = 4.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = SapphirePrimary),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                if (isActivatingLicense) {
                                    CircularProgressIndicator(modifier = Modifier.size(14.dp), color = Color.White, strokeWidth = 2.dp)
                                } else {
                                    Text("Activate", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                )

                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "🔒 Device Binding: ${LicenseManager.getDeviceId(context).take(12)}...",
                        style = MaterialTheme.typography.labelSmall,
                        color = TextMuted
                    )
                    Text(
                        text = if (isPro) "Tier: Pro Edition" else if (hasActiveSubscription) "Tier: Voice & Webhook Sub" else "Tier: Standard",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = if (isPro) SapphireLight else if (hasActiveSubscription) EmeraldLight else TextMuted
                    )
                }
            }
        }

        // ═════════════════════════════════════════════════════════════════════
        // SECTION 2: 📶 TELEPHONY & DUAL-SIM ROUTING
        // ═════════════════════════════════════════════════════════════════════
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            border = BorderStroke(1.dp, DarkCardBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = EmeraldContainerSubtle,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.SimCard, contentDescription = null, tint = EmeraldLight, modifier = Modifier.size(20.dp))
                        }
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = "Telephony & Dual-SIM Routing",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = TextHeading
                        )
                        Text(
                            text = "Designate dispatch carrier line for auto-replies",
                            style = MaterialTheme.typography.labelSmall,
                            color = TextMuted
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Active SIM Card Detection Badges
                if (activeSimInfoList.isNotEmpty()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(DarkBackground, RoundedCornerShape(10.dp))
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = "DETECTED CARRIER LINES",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = 1.sp,
                            color = TextMuted
                        )
                        activeSimInfoList.forEachIndexed { idx, sub ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        Icons.Default.PhoneAndroid,
                                        contentDescription = null,
                                        tint = EmeraldLight,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "SIM ${idx + 1}: ${sub.carrierName ?: "Carrier"} (${sub.displayName ?: "Line"})",
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.SemiBold,
                                        color = TextBody
                                    )
                                }
                                Text(
                                    text = "Slot ${sub.simSlotIndex}",
                                    fontSize = 11.sp,
                                    color = TextMuted
                                )
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                }

                // Preferred Slot Selector
                Text(
                    text = "Preferred Dispatch Line:",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold,
                    color = TextBody
                )
                Spacer(modifier = Modifier.height(6.dp))

                val simOptions = listOf(
                    0 to "Auto (Carrier Default)",
                    1 to "SIM 1 (Primary Line)",
                    2 to "SIM 2 (Business Line)"
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    simOptions.forEach { (slot, label) ->
                        val isSelected = settings.preferredSimSlot == slot
                        FilterChip(
                            selected = isSelected,
                            onClick = {
                                val matchedSubId = activeSimInfoList.getOrNull(if (slot > 0) slot - 1 else 0)?.subscriptionId ?: -1
                                onSettingsChanged(settings.copy(
                                    preferredSimSlot = slot,
                                    preferredSimSubscriptionId = matchedSubId
                                ))
                            },
                            label = { Text(label, fontSize = 11.sp, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = SapphireContainerSubtle,
                                selectedLabelColor = SapphireLight
                            ),
                            border = FilterChipDefaults.filterChipBorder(
                                enabled = true,
                                selected = isSelected,
                                borderColor = DarkCardBorder,
                                selectedBorderColor = SapphirePrimary
                            )
                        )
                    }
                }
            }
        }

        // ═════════════════════════════════════════════════════════════════════
        // SECTION 3: ⚡ WEBHOOKS & CRM AUTOMATIONS (STRICT PAYWALL ENFORCEMENT)
        // ═════════════════════════════════════════════════════════════════════
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            border = BorderStroke(1.5.dp, if (isWebhookUnlocked) SapphirePrimary.copy(alpha = 0.5f) else PurplePrimary.copy(alpha = 0.5f)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                // Section Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = if (isWebhookUnlocked) SapphireContainerSubtle else PurpleContainerSubtle,
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    if (isWebhookUnlocked) Icons.Default.Hub else Icons.Default.Lock,
                                    contentDescription = null,
                                    tint = if (isWebhookUnlocked) SapphireLight else PurpleLight,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Webhooks & Automations",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = TextHeading
                            )
                            Text(
                                text = "n8n, Zapier, Make & CRM Telephony Bridges",
                                style = MaterialTheme.typography.labelSmall,
                                color = TextMuted
                            )
                        }
                    }

                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = if (isWebhookUnlocked) EmeraldContainerSubtle else RedContainerSubtle
                    ) {
                        Text(
                            text = if (isWebhookUnlocked) "UNLOCKED" else "LOCKED",
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = if (isWebhookUnlocked) EmeraldLight else RedError
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // ── PAYWALL GATE (If user lacks $299.99 Pro License AND lacks $9.99/mo subscription) ──
                if (!isWebhookUnlocked) {
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = DarkBackground,
                        border = BorderStroke(1.dp, PurplePrimary.copy(alpha = 0.4f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Bolt, contentDescription = null, tint = PurpleLight, modifier = Modifier.size(22.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Pro Automation Gateway Required",
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.titleSmall,
                                    color = Color.White
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Webhook integrations (n8n, Zapier, Make, and CRMs) connect directly into your Android carrier hardware to stream real-time events and bypass A2P 10DLC bans. Available with the $299.99 Pro Lifetime License or active $9.99/mo subscription.",
                                style = MaterialTheme.typography.bodySmall,
                                color = TextBody,
                                lineHeight = 18.sp
                            )

                            Spacer(modifier = Modifier.height(14.dp))

                            // Features list
                            listOf(
                                "⚡ Inbound & Outbound Webhook Bridges (n8n, Zapier, Make)" to "Stream call.missed, sms.sent, and inbound events in real time.",
                                "📱 Dual-SIM Outbound Routing" to "Designate SIM 2 for automation while keeping SIM 1 personal.",
                                "🛡️ 100% P2P Carrier Exemption" to "Operates from genuine Android hardware with zero 10DLC fees."
                            ).forEach { (title, desc) ->
                                Row(
                                    modifier = Modifier.padding(vertical = 3.dp),
                                    verticalAlignment = Alignment.Top
                                ) {
                                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = EmeraldLight, modifier = Modifier.size(15.dp).padding(top = 2.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Column {
                                        Text(title, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color.White)
                                        Text(desc, fontSize = 11.sp, color = TextMuted)
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(16.dp))

                            // 2 Purchase Actions
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                // 1. $299.99 Pro Lifetime License
                                Button(
                                    onClick = {
                                        val email = settings.customerEmail.trim()
                                        val key = settings.licenseKey.trim()
                                        inAppPaymentTitle = "Upgrade to Pro Gateway ($299.99 Lifetime)"
                                        inAppPaymentUrl = "https://buy.stripe.com/6oU9ATbBIeFI8U86OR2go0g?prefilled_email=${Uri.encode(email)}&client_reference_id=${Uri.encode(key)}"
                                        showInAppPayment = true
                                    },
                                    modifier = Modifier.weight(1f),
                                    colors = ButtonDefaults.buttonColors(containerColor = PurplePrimary),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(vertical = 12.dp)
                                ) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text("Pro Lifetime", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                        Text("$299.99 One-Time", fontSize = 11.sp, color = Color.White.copy(alpha = 0.85f))
                                    }
                                }

                                // 2. $9.99/mo Active Subscription
                                OutlinedButton(
                                    onClick = {
                                        val email = settings.customerEmail.trim()
                                        val key = settings.licenseKey.trim()
                                        inAppPaymentTitle = "Subscribe to Voice & Webhooks ($9.99/mo)"
                                        inAppPaymentUrl = "https://missedcallautosms.com/api/create-voice-pro-checkout?key=${Uri.encode(key)}&email=${Uri.encode(email)}"
                                        showInAppPayment = true
                                    },
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(10.dp),
                                    border = BorderStroke(1.dp, EmeraldLight),
                                    contentPadding = PaddingValues(vertical = 12.dp)
                                ) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text("Subscribe Monthly", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = EmeraldLight)
                                        Text("$9.99 / month", fontSize = 11.sp, color = TextMuted)
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // ── UNLOCKED WEBHOOK & AUTOMATION CONTROLS ──
                    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        // 1. Master Outbound Webhook Toggle
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(DarkBackground, RoundedCornerShape(10.dp))
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
                                Text(
                                    text = "Outbound Webhook Forwarder",
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = TextHeading
                                )
                                Text(
                                    text = "Dispatches missed calls & texts directly to your webhook URL",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = TextMuted
                                )
                            }
                            Switch(
                                checked = settings.outboundWebhookEnabled,
                                onCheckedChange = { onSettingsChanged(settings.copy(outboundWebhookEnabled = it)) },
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = EmeraldLight,
                                    checkedTrackColor = EmeraldContainer
                                )
                            )
                        }

                        // 2. Anti-Double Send / Mute Native Auto-Reply Switch
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(DarkBackground, RoundedCornerShape(10.dp))
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
                                Text(
                                    text = "Mute Native Auto-Reply",
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = TextHeading
                                )
                                Text(
                                    text = if (settings.muteNativeAutoReply)
                                        "✅ Active: Only your webhook/n8n workflow will send replies to callers."
                                    else
                                        "⚠️ Inactive: Both app AND webhook will send replies (potential duplicate).",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (settings.muteNativeAutoReply) EmeraldLight else TextMuted
                                )
                            }
                            Switch(
                                checked = settings.muteNativeAutoReply,
                                onCheckedChange = { onSettingsChanged(settings.copy(muteNativeAutoReply = it)) },
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = EmeraldLight,
                                    checkedTrackColor = EmeraldContainer
                                )
                            )
                        }

                        // 3. Event Subscriptions
                        Column {
                            Text(
                                text = "Event Subscriptions:",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Bold,
                                color = TextHeading
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                FilterChip(
                                    selected = settings.webhookSubMissedCall,
                                    onClick = { onSettingsChanged(settings.copy(webhookSubMissedCall = !settings.webhookSubMissedCall)) },
                                    label = { Text("call.missed", fontSize = 11.sp) }
                                )
                                FilterChip(
                                    selected = settings.webhookSubSmsSent,
                                    onClick = { onSettingsChanged(settings.copy(webhookSubSmsSent = !settings.webhookSubSmsSent)) },
                                    label = { Text("sms.sent", fontSize = 11.sp) }
                                )
                                FilterChip(
                                    selected = settings.webhookSubSmsReceived,
                                    onClick = { onSettingsChanged(settings.copy(webhookSubSmsReceived = !settings.webhookSubSmsReceived)) },
                                    label = { Text("sms.received", fontSize = 11.sp) }
                                )
                                FilterChip(
                                    selected = settings.webhookSubCallCompleted,
                                    onClick = { onSettingsChanged(settings.copy(webhookSubCallCompleted = !settings.webhookSubCallCompleted)) },
                                    label = { Text("call.completed", fontSize = 11.sp) }
                                )
                                FilterChip(
                                    selected = settings.webhookSubVoicemail,
                                    onClick = { onSettingsChanged(settings.copy(webhookSubVoicemail = !settings.webhookSubVoicemail)) },
                                    label = { Text("voicemail", fontSize = 11.sp) }
                                )
                            }
                        }

                        // 4. Platform Presets
                        Column {
                            Text(
                                text = "Quick Platform Presets:",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Bold,
                                color = TextHeading
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                listOf(
                                    "n8n" to "https://n8n.yourdomain.com/webhook/mcasms-leads",
                                    "Zapier" to "https://hooks.zapier.com/hooks/catch/XXXXXX/YYYYYY/",
                                    "Make" to "https://hook.us1.make.com/xxxxxxxxxxxxxxxxxxxxxxxx",
                                    "CRM" to "https://api.yourdomain.com/v1/missed-calls"
                                ).forEach { (name, presetUrl) ->
                                    FilterChip(
                                        selected = settings.selectedOutboundWebhookUrl == presetUrl,
                                        onClick = {
                                            newWebhookUrlInput = presetUrl
                                        },
                                        label = { Text(name, fontSize = 11.sp) }
                                    )
                                }
                            }
                        }

                        // 5. Active Target Webhook URL input & Saved List
                        Column {
                            Text(
                                text = "Active Webhook Target URL:",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Bold,
                                color = TextHeading
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            OutlinedTextField(
                                value = if (newWebhookUrlInput.isNotBlank()) newWebhookUrlInput else settings.selectedOutboundWebhookUrl,
                                onValueChange = { newWebhookUrlInput = it },
                                placeholder = { Text("https://your-n8n-instance.com/webhook/leads") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = SapphirePrimary,
                                    unfocusedBorderColor = DarkCardBorder
                                )
                            )

                            Spacer(modifier = Modifier.height(8.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = {
                                        val trimmed = newWebhookUrlInput.trim().ifBlank { settings.selectedOutboundWebhookUrl.trim() }
                                        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
                                            Toast.makeText(context, "Please enter a valid URL starting with http:// or https://", Toast.LENGTH_SHORT).show()
                                            return@Button
                                        }
                                        val updatedList = if (!settings.savedOutboundWebhooks.contains(trimmed)) {
                                            settings.savedOutboundWebhooks + trimmed
                                        } else {
                                            settings.savedOutboundWebhooks
                                        }
                                        onSettingsChanged(
                                            settings.copy(
                                                savedOutboundWebhooks = updatedList,
                                                selectedOutboundWebhookUrl = trimmed
                                            )
                                        )
                                        newWebhookUrlInput = ""
                                        Toast.makeText(context, "✅ Webhook target saved!", Toast.LENGTH_SHORT).show()
                                    },
                                    modifier = Modifier.weight(1f),
                                    colors = ButtonDefaults.buttonColors(containerColor = SapphirePrimary)
                                ) {
                                    Text("Save Target URL", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }

                                OutlinedButton(
                                    enabled = settings.selectedOutboundWebhookUrl.isNotBlank() && !isPingingWebhook,
                                    onClick = {
                                        isPingingWebhook = true
                                        pingStatusMessage = null
                                        coroutineScope.launch(Dispatchers.IO) {
                                            try {
                                                val url = URL(settings.selectedOutboundWebhookUrl)
                                                val conn = url.openConnection() as HttpURLConnection
                                                conn.requestMethod = "POST"
                                                conn.setRequestProperty("Content-Type", "application/json; utf-8")
                                                conn.doOutput = true
                                                conn.connectTimeout = 6000
                                                conn.readTimeout = 6000

                                                val testBody = Gson().toJson(
                                                    mapOf(
                                                        "event" to "TEST_PING",
                                                        "message" to "Missed Call Auto SMS Forwarder Test Ping",
                                                        "phone" to "+15551234567",
                                                        "timestamp" to System.currentTimeMillis()
                                                    )
                                                )
                                                conn.outputStream.use { it.write(testBody.toByteArray(StandardCharsets.UTF_8)) }
                                                val code = conn.responseCode
                                                conn.disconnect()

                                                withContext(Dispatchers.Main) {
                                                    isPingingWebhook = false
                                                    pingStatusMessage = if (code in 200..299) {
                                                        "✅ Ping Success! (HTTP $code - Connected)"
                                                    } else {
                                                        "⚠️ Webhook returned HTTP $code"
                                                    }
                                                }
                                            } catch (err: Exception) {
                                                withContext(Dispatchers.Main) {
                                                    isPingingWebhook = false
                                                    pingStatusMessage = "❌ Ping failed: ${err.localizedMessage ?: "Connection error"}"
                                                }
                                            }
                                        }
                                    },
                                    modifier = Modifier.weight(1f),
                                    border = BorderStroke(1.dp, DarkCardBorder)
                                ) {
                                    if (isPingingWebhook) {
                                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                                    } else {
                                        Text("Test Ping Target", fontSize = 12.sp)
                                    }
                                }
                            }

                            pingStatusMessage?.let { status ->
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = status,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = if (status.startsWith("✅")) EmeraldLight else RedError
                                )
                            }
                        }

                        // 6. Inbound Cloud Relay & FCM Token
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(DarkBackground, RoundedCornerShape(10.dp))
                                .padding(12.dp)
                        ) {
                            Text(
                                text = "INBOUND CLOUD RELAY (n8n Cloud & Make)",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = 1.sp,
                                color = TextMuted
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            val cloudRelayUrl = "https://missedcallautosms.com/.netlify/functions/dispatch-sms"
                            OutlinedTextField(
                                value = cloudRelayUrl,
                                onValueChange = {},
                                readOnly = true,
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                trailingIcon = {
                                    IconButton(onClick = {
                                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                        clipboard.setPrimaryClip(ClipData.newPlainText("Relay URL", cloudRelayUrl))
                                        Toast.makeText(context, "Copied Cloud Relay URL!", Toast.LENGTH_SHORT).show()
                                    }) {
                                        Icon(Icons.Default.ContentCopy, contentDescription = "Copy", tint = SapphireLight, modifier = Modifier.size(16.dp))
                                    }
                                }
                            )

                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "FCM Device Token (Target for n8n payload):",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = TextMuted
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            OutlinedTextField(
                                value = settings.fcmDeviceToken.ifBlank { "Token pending device registration" },
                                onValueChange = {},
                                readOnly = true,
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                trailingIcon = {
                                    if (settings.fcmDeviceToken.isNotBlank()) {
                                        IconButton(onClick = {
                                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                            clipboard.setPrimaryClip(ClipData.newPlainText("FCM Token", settings.fcmDeviceToken))
                                            Toast.makeText(context, "Copied FCM Token!", Toast.LENGTH_SHORT).show()
                                        }) {
                                            Icon(Icons.Default.ContentCopy, contentDescription = "Copy", tint = SapphireLight, modifier = Modifier.size(16.dp))
                                        }
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }

        // ═════════════════════════════════════════════════════════════════════
        // SECTION 4: 🔋 BATTERY & BACKGROUND HEALTH
        // ═════════════════════════════════════════════════════════════════════
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            border = BorderStroke(1.dp, DarkCardBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = if (isIgnoringBattery) EmeraldContainerSubtle else AmberContainerSubtle,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                if (isIgnoringBattery) Icons.Default.BatteryChargingFull else Icons.Default.BatteryAlert,
                                contentDescription = null,
                                tint = if (isIgnoringBattery) EmeraldLight else AmberWarning,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = "Battery & Background Execution",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = TextHeading
                        )
                        Text(
                            text = if (isIgnoringBattery) "Appliance is unrestricted (100% reliable)" else "Android battery optimization may kill background service",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isIgnoringBattery) EmeraldLight else AmberWarning
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                if (!isIgnoringBattery) {
                    Button(
                        onClick = {
                            requestIgnoreBatteryOptimizations(context)
                            isIgnoringBattery = checkBatteryOptimization(context)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = AmberWarning),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Bolt, contentDescription = null, modifier = Modifier.size(16.dp), tint = Color.Black)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Disable Battery Optimization Now", color = Color.Black, fontWeight = FontWeight.Bold)
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                }

                // Android 13+ Restricted Settings Guide Toggle
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showAndroid13Guide = !showAndroid13Guide }
                        .padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.AutoMirrored.Filled.HelpOutline, contentDescription = null, tint = SapphireLight, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Android 13+ \"Restricted Settings\" Unlock Guide",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                            color = SapphireLight
                        )
                    }
                    Icon(
                        if (showAndroid13Guide) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                        contentDescription = null,
                        tint = TextMuted
                    )
                }

                AnimatedVisibility(visible = showAndroid13Guide) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = DarkBackground,
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(
                                text = "1. Open Android Phone Settings → Apps → ${com.missedcall.autotext.util.AppBranding.appName}.\n" +
                                       "2. Tap the 3 dots (⋮) in the top-right corner of the App Info page.\n" +
                                       "3. Tap \"Allow restricted settings\" and enter your phone PIN.\n" +
                                       "4. Go to Permissions → SMS & Call Logs → Allow.",
                                style = MaterialTheme.typography.bodySmall,
                                color = TextBody,
                                lineHeight = 18.sp
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Button(
                                onClick = onRequestPermissions,
                                colors = ButtonDefaults.buttonColors(containerColor = SapphirePrimary),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("Open App Permissions Page")
                            }
                        }
                    }
                }
            }
        }

        // ═════════════════════════════════════════════════════════════════════
        // SECTION 5: 🔄 SOFTWARE & SYSTEM UPDATES
        // ═════════════════════════════════════════════════════════════════════
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            border = BorderStroke(1.dp, DarkCardBorder),
            modifier = Modifier.fillMaxWidth()
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
                            color = DarkBackground,
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.SystemUpdate, contentDescription = null, tint = SapphireLight, modifier = Modifier.size(20.dp))
                            }
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Software & OTA Updates",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = TextHeading
                            )
                            Text(
                                text = "Installed: $currentAppVersion",
                                style = MaterialTheme.typography.labelSmall,
                                color = TextMuted
                            )
                        }
                    }

                    Button(
                        onClick = {
                            isCheckingUpdate = true
                            coroutineScope.launch {
                                try {
                                    val updateUrl = settings.remoteUpdateUrl.ifBlank { RemoteUpdateManager.DEFAULT_UPDATE_URL }
                                    val result = updateManager.checkForUpdatesDetailed(updateUrl, forceCheck = true)
                                    isCheckingUpdate = false
                                    when (result) {
                                        is com.missedcall.autotext.remote.UpdateCheckResult.Available -> {
                                            availableUpdate = result.updateInfo
                                        }
                                        is com.missedcall.autotext.remote.UpdateCheckResult.UpToDate -> {
                                            Toast.makeText(context, "✅ You are running the latest version (${result.currentVersionName})", Toast.LENGTH_SHORT).show()
                                        }
                                        is com.missedcall.autotext.remote.UpdateCheckResult.Error -> {
                                            Toast.makeText(context, "Update check failed: ${result.message}", Toast.LENGTH_SHORT).show()
                                        }
                                    }
                                } catch (e: Exception) {
                                    isCheckingUpdate = false
                                    Toast.makeText(context, "Error checking updates", Toast.LENGTH_SHORT).show()
                                }
                            }
                        },
                        enabled = !isCheckingUpdate,
                        colors = ButtonDefaults.buttonColors(containerColor = DarkCardBorder),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        if (isCheckingUpdate) {
                            CircularProgressIndicator(modifier = Modifier.size(14.dp), color = SapphireLight, strokeWidth = 2.dp)
                        } else {
                            Text("Check Updates", fontSize = 11.sp, color = TextHeading)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))
                HorizontalDivider(color = DarkCardBorder)
                Spacer(modifier = Modifier.height(12.dp))

                // Diagnostic Log Clear
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("Clear Activity Log History", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = TextBody)
                        Text("Removes local database missed call & SMS events", style = MaterialTheme.typography.labelSmall, color = TextMuted)
                    }
                    TextButton(onClick = {
                        onClearLogs()
                        Toast.makeText(context, "Activity logs cleared.", Toast.LENGTH_SHORT).show()
                    }) {
                        Text("Clear", color = RedError, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))
    }
}

private fun checkBatteryOptimization(context: Context): Boolean {
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return powerManager.isIgnoringBatteryOptimizations(context.packageName)
}

private fun requestIgnoreBatteryOptimizations(context: Context) {
    try {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${context.packageName}")
        }
        context.startActivity(intent)
    } catch (e: Exception) {
        val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        context.startActivity(intent)
    }
}
