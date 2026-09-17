package com.missedcall.autotext.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryAlert
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.data.license.LicenseManager
import com.missedcall.autotext.data.license.LicenseStatus
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.ui.theme.AmberWarning
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit,
    missingPermissions: List<String>,
    onRequestPermissions: () -> Unit
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    var isIgnoringBattery by remember { mutableStateOf(checkBatteryOptimization(context)) }
    var inputLicenseKey by remember { mutableStateOf(settings.licenseKey) }
    val licenseInfo = remember(settings.licenseKey) { LicenseManager.verifyLicenseKey(settings.licenseKey) }
    val isPro = com.missedcall.autotext.BuildConfig.IS_PRO_EDITION || licenseInfo.tier == com.missedcall.autotext.data.license.LicenseTier.PRO || licenseInfo.licenseKey.contains("PRO")
    var testWebhookPhone by remember { mutableStateOf("") }
    var testWebhookMsg by remember { mutableStateOf("🚀 End-to-End™ Test: n8n automation SMS dispatched via phone SIM!") }
    var testSimSlot by remember { mutableStateOf(settings.preferredSimSlot) }
    val activeSimInfoList = remember {
        try {
            val sm = context.getSystemService(android.telephony.SubscriptionManager::class.java)
            @android.annotation.SuppressLint("MissingPermission")
            sm?.activeSubscriptionInfoList ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {

        // 1. App Appliance License Card
        val isLicenseActive = licenseInfo.status == LicenseStatus.ACTIVE_LIFETIME || licenseInfo.status == LicenseStatus.ACTIVE_SUBSCRIPTION
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = if (isLicenseActive) ActiveGreenContainer else MaterialTheme.colorScheme.surfaceVariant
            ),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = if (isLicenseActive) Icons.Default.VerifiedUser else Icons.Default.Key,
                            contentDescription = "License Icon",
                            tint = if (isLicenseActive) ActiveGreenText else MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Appliance License",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (isLicenseActive) ActiveGreenText else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    val badgeText = when (licenseInfo.status) {
                        LicenseStatus.ACTIVE_LIFETIME -> if (isPro) "PRO ACTIVE" else "ACTIVE"
                        LicenseStatus.ACTIVE_SUBSCRIPTION -> if (isPro) "PRO TRIAL" else "TRIAL ACTIVE"
                        LicenseStatus.EXPIRED -> "EXPIRED"
                        LicenseStatus.REVOKED -> "REVOKED"
                        else -> "UNLICENSED"
                    }

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (isLicenseActive) {
                            if (isPro) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.primary
                        } else MaterialTheme.colorScheme.error
                    ) {
                        Text(
                            text = badgeText,
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                if (isLicenseActive) {
                    Text(
                        text = "Licensed to: ${licenseInfo.licensedTo}",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                        color = ActiveGreenText
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Key: ${licenseInfo.licenseKey}",
                        style = MaterialTheme.typography.bodySmall,
                        color = ActiveGreenText.copy(alpha = 0.8f)
                    )
                } else {
                    Text(
                        text = "Enter your License Key to activate auto-text appliance features.",
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    OutlinedTextField(
                        value = inputLicenseKey,
                        onValueChange = { inputLicenseKey = it.uppercase() },
                        label = { Text("License Key (e.g. MCAS-XXXX-XXXX)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    Button(
                        onClick = {
                            val verification = LicenseManager.verifyLicenseKey(inputLicenseKey)
                            if (verification.status == LicenseStatus.ACTIVE_LIFETIME || verification.status == LicenseStatus.ACTIVE_SUBSCRIPTION) {
                                onSettingsChanged(settings.copy(licenseKey = inputLicenseKey.trim()))
                                Toast.makeText(context, "✅ License Activated for ${verification.licensedTo}!", Toast.LENGTH_LONG).show()
                            } else if (verification.status == LicenseStatus.EXPIRED) {
                                Toast.makeText(context, "⚠️ License Expired. Please issue a new key.", Toast.LENGTH_LONG).show()
                            } else {
                                Toast.makeText(context, "❌ Invalid License Key format or checksum.", Toast.LENGTH_LONG).show()
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Activate License")
                    }
                }
            }
        }

        // 2. Permissions Status Card (With Sideloaded Restricted Settings Unlock Guide)
        if (missingPermissions.isNotEmpty()) {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Security,
                            contentDescription = "Permission Warning",
                            tint = MaterialTheme.colorScheme.onErrorContainer
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Action Required: Grant Telephony & SMS",
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Auto Text requires Telephony, SMS, and Contacts permissions to intercept calls and auto-reply.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )

                    Spacer(modifier = Modifier.height(12.dp))
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.15f),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text(
                                text = "🔒 If SMS Permission says \"Restricted Setting\" (Android 13+):",
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "1. Tap \"Open Phone Settings\" below.\n" +
                                       "2. Tap the 3 dots (⋮) in the top-right corner of the App Info page.\n" +
                                       "3. Tap \"Allow restricted settings\" & enter your phone PIN.\n" +
                                       "4. Tap Permissions -> SMS -> Allow.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = onRequestPermissions,
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                    ) {
                        Text("Open Phone Settings")
                    }
                }
            }
        }

        // 3. Battery Optimization Exempt Card
        Card(
            colors = CardDefaults.cardColors(
                containerColor = if (isIgnoringBattery) ActiveGreenContainer else MaterialTheme.colorScheme.surfaceVariant
            ),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (isIgnoringBattery) Icons.Default.CheckCircle else Icons.Default.BatteryAlert,
                        contentDescription = "Battery Status",
                        tint = if (isIgnoringBattery) ActiveGreenText else AmberWarning
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isIgnoringBattery) "Battery Optimization Disabled" else "Battery Optimization Active",
                        fontWeight = FontWeight.Bold,
                        color = if (isIgnoringBattery) ActiveGreenText else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = if (isIgnoringBattery)
                        "Background execution is optimized. The appliance will reliably send text replies even when the screen is locked."
                    else
                        "Android may restrict background execution when screen is off. Request battery exemption for 100% reliability.",
                    style = MaterialTheme.typography.bodySmall
                )
                if (!isIgnoringBattery) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = {
                            requestIgnoreBatteryOptimizations(context)
                            isIgnoringBattery = checkBatteryOptimization(context)
                        }
                    ) {
                        Text("Disable Battery Optimization")
                    }
                }
            }
        }

        // 4. Business Name Card
        Card(
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Business Information",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = settings.businessName,
                    onValueChange = { onSettingsChanged(settings.copy(businessName = it)) },
                    label = { Text("Business Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // 5. Message Template Card
        Card(
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Auto-Reply Template",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Use token placeholders to dynamic replace text dynamically.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(8.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = false,
                        onClick = {
                            onSettingsChanged(
                                settings.copy(messageTemplate = settings.messageTemplate + " {business_name}")
                            )
                        },
                        label = { Text("+ {business_name}") }
                    )
                    FilterChip(
                        selected = false,
                        onClick = {
                            onSettingsChanged(
                                settings.copy(messageTemplate = settings.messageTemplate + " {name}")
                            )
                        },
                        label = { Text("+ {name}") }
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = settings.messageTemplate,
                    onValueChange = { onSettingsChanged(settings.copy(messageTemplate = it)) },
                    minLines = 3,
                    maxLines = 5,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // 6. Jitter Delay & Cooldown Window Card
        Card(
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Dispatch Timing & Rules",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Random Jitter Delay: ${settings.jitterDelaySeconds} seconds",
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = "Simulates human response time before sending SMS.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Slider(
                    value = settings.jitterDelaySeconds.toFloat(),
                    onValueChange = { onSettingsChanged(settings.copy(jitterDelaySeconds = it.roundToInt())) },
                    valueRange = 5f..60f,
                    steps = 11
                )

                HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

                Text(
                    text = "Cooldown Window: ${settings.cooldownHours} hour(s)",
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = "Prevents spamming repeat callers within this time window.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(8.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(1, 4, 12, 24).forEach { hours ->
                        FilterChip(
                            selected = settings.cooldownHours == hours,
                            onClick = { onSettingsChanged(settings.copy(cooldownHours = hours)) },
                            label = { Text("${hours}h") }
                        )
                    }
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Exclude Saved Contacts",
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = "Do not text callers existing in phone contacts.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = settings.excludeSavedContacts,
                        onCheckedChange = { onSettingsChanged(settings.copy(excludeSavedContacts = it)) }
                    )
                }
            }
        }

        // 7. Business Hours Schedule Card
        Card(
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Schedule, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Business Hours Filter",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Switch(
                        checked = settings.businessHoursEnabled,
                        onCheckedChange = { onSettingsChanged(settings.copy(businessHoursEnabled = it)) }
                    )
                }

                if (settings.businessHoursEnabled) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        OutlinedTextField(
                            value = settings.schedule.startTime,
                            onValueChange = { newTime ->
                                onSettingsChanged(
                                    settings.copy(schedule = settings.schedule.copy(startTime = newTime))
                                )
                            },
                            label = { Text("Start Time (HH:mm)") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = settings.schedule.endTime,
                            onValueChange = { newTime ->
                                onSettingsChanged(
                                    settings.copy(schedule = settings.schedule.copy(endTime = newTime))
                                )
                            },
                            label = { Text("End Time (HH:mm)") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    Text(text = "Active Days", fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.height(6.dp))

                    val daysOfWeek = listOf("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY")
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        daysOfWeek.forEach { day ->
                            val isSelected = settings.schedule.activeDays.contains(day)
                            FilterChip(
                                selected = isSelected,
                                onClick = {
                                    val newDays = if (isSelected) {
                                        settings.schedule.activeDays - day
                                    } else {
                                        settings.schedule.activeDays + day
                                    }
                                    onSettingsChanged(
                                        settings.copy(schedule = settings.schedule.copy(activeDays = newDays))
                                    )
                                },
                                label = { Text(day.take(3)) }
                            )
                        }
                    }
                }
            }
        }

        // 8. n8n & Remote Webhook Integration Card
        Card(
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Security,
                            contentDescription = "n8n Webhook Icon",
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "n8n Webhook SMS Engine",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Switch(
                        checked = settings.webhookEnabled,
                        onCheckedChange = { onSettingsChanged(settings.copy(webhookEnabled = it)) }
                    )
                }

                if (settings.webhookEnabled) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Trigger custom SMS texts directly from n8n workflows through this phone's SIM card using Firebase Cloud Messaging (FCM) or Local Wi-Fi API. Built-in SIM Burn Safeguard™ automatically paces outbound carrier queues (3.5s minimum pacing) to protect your line from spam flags.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(16.dp))
                    Text(text = "FCM Device Token (n8n Target)", fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(4.dp))
                    OutlinedTextField(
                        value = if (settings.fcmDeviceToken.isNotBlank()) settings.fcmDeviceToken else "Token pending registration (starts on launch)",
                        onValueChange = {},
                        readOnly = true,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        trailingIcon = {
                            if (settings.fcmDeviceToken.isNotBlank()) {
                                TextButton(onClick = {
                                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                                    val clip = android.content.ClipData.newPlainText("FCM Token", settings.fcmDeviceToken)
                                    clipboard.setPrimaryClip(clip)
                                    Toast.makeText(context, "Copied FCM Token to Clipboard!", Toast.LENGTH_SHORT).show()
                                }) {
                                    Text("Copy")
                                }
                            }
                        }
                    )

                    Spacer(modifier = Modifier.height(16.dp))
                    Text(text = "Webhook Security Secret Key", fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(4.dp))
                    OutlinedTextField(
                        value = settings.webhookApiSecret,
                        onValueChange = { onSettingsChanged(settings.copy(webhookApiSecret = it)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        trailingIcon = {
                            TextButton(onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                                val clip = android.content.ClipData.newPlainText("Webhook Secret", settings.webhookApiSecret)
                                clipboard.setPrimaryClip(clip)
                                Toast.makeText(context, "Copied Webhook Secret to Clipboard!", Toast.LENGTH_SHORT).show()
                            }) {
                                Text("Copy")
                            }
                        }
                    )

                    Spacer(modifier = Modifier.height(16.dp))
                    val localIp = remember { com.missedcall.autotext.util.NetworkUtils.getLocalIpAddress() }
                    val localWebhookUrl = "http://${localIp ?: "PHONE_IP"}:${settings.remoteAccessPort}/api/send-sms"
                    Text(text = "Local Wi-Fi / VPN Webhook (No Firebase Required)", fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(4.dp))
                    OutlinedTextField(
                        value = localWebhookUrl,
                        onValueChange = {},
                        readOnly = true,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        trailingIcon = {
                            TextButton(onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                                val clip = android.content.ClipData.newPlainText("Local Webhook", localWebhookUrl)
                                clipboard.setPrimaryClip(clip)
                                Toast.makeText(context, "Copied Local Webhook URL to Clipboard!", Toast.LENGTH_SHORT).show()
                            }) {
                                Text("Copy")
                            }
                        }
                    )

                    Spacer(modifier = Modifier.height(12.dp))
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(
                                text = "n8n Webhook JSON Payload Spec:",
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.labelMedium
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "{\n" +
                                       "  \"secret\": \"${if (settings.webhookApiSecret.isNotBlank()) settings.webhookApiSecret else "YOUR_SECRET_KEY"}\",\n" +
                                       "  \"phone\": \"+15551234567\",\n" +
                                       "  \"message\": \"Hi John, quote confirmed!\",\n" +
                                       "  \"sim_slot\": 2,\n" +
                                       "  \"callback_url\": \"https://your-n8n.com/webhook/status\"\n" +
                                       "}",
                                style = MaterialTheme.typography.bodySmall,
                                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))
                    HorizontalDivider()
                    Spacer(modifier = Modifier.height(12.dp))

                    Text(text = "⚡ In-App Webhook Simulator (Test Dispatch)", fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Simulate an incoming n8n webhook right on your device to test SIM dispatch & log status.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    OutlinedTextField(
                        value = testWebhookPhone,
                        onValueChange = { testWebhookPhone = it },
                        label = { Text("Target Phone Number (e.g. +15551234567)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    OutlinedTextField(
                        value = testWebhookMsg,
                        onValueChange = { testWebhookMsg = it },
                        label = { Text("Simulated Payload Message") },
                        maxLines = 3,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Dispatch SIM:", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                        listOf(0 to "Auto", 1 to "SIM 1", 2 to "SIM 2").forEach { (slot, name) ->
                            FilterChip(
                                selected = testSimSlot == slot,
                                onClick = { testSimSlot = slot },
                                label = { Text(name) }
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Button(
                        onClick = {
                            if (testWebhookPhone.isBlank()) {
                                Toast.makeText(context, "Please enter a phone number to test", Toast.LENGTH_SHORT).show()
                            } else {
                                val workData = androidx.work.Data.Builder()
                                    .putString(com.missedcall.autotext.worker.SendAutoTextWorker.KEY_PHONE_NUMBER, testWebhookPhone.trim())
                                    .putString(com.missedcall.autotext.worker.SendAutoTextWorker.KEY_OVERRIDE_MESSAGE, testWebhookMsg.trim())
                                    .putBoolean(com.missedcall.autotext.worker.SendAutoTextWorker.KEY_IS_REMOTE_TRIGGER, true)
                                    .putInt(com.missedcall.autotext.worker.SendAutoTextWorker.KEY_SIM_SLOT, testSimSlot)
                                    .build()

                                val workRequest = androidx.work.OneTimeWorkRequestBuilder<com.missedcall.autotext.worker.SendAutoTextWorker>()
                                    .setInputData(workData)
                                    .build()

                                androidx.work.WorkManager.getInstance(context).enqueue(workRequest)
                                val simLabel = if (testSimSlot == 0) "Auto Default SIM" else "SIM $testSimSlot"
                                Toast.makeText(context, "⚡ Webhook Simulated! SMS queued via $simLabel for ${testWebhookPhone.trim()}", Toast.LENGTH_LONG).show()
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                    ) {
                        Text("Simulate Webhook Dispatch ➔", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // 9. Dual SIM Selector (Pro Feature) Card
        Card(
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Call,
                            contentDescription = "Dual SIM Icon",
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Dual SIM Selector",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                    ) {
                        Text(
                            text = "PRO FEATURE",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Designate which physical or eSIM line dispatches automated text-backs (e.g. keep personal calls on SIM 1 and automated texts on SIM 2 Business eSIM). n8n can also pass 'sim_slot': 1 or 2 dynamically in webhooks.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(14.dp))

                val simOptions = listOf(
                    0 to "Auto / Carrier Default SIM",
                    1 to "SIM 1 (Primary / Personal)",
                    2 to "SIM 2 (Business / eSIM)"
                )

                simOptions.forEach { (slotValue, label) ->
                    val isSelected = settings.preferredSimSlot == slotValue
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = isSelected,
                            onClick = { onSettingsChanged(settings.copy(preferredSimSlot = slotValue)) }
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = label,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                        )
                    }
                }

                if (activeSimInfoList.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text(
                                text = "Detected Subscriptions on Device:",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            activeSimInfoList.forEach { sub ->
                                val slotIndex = sub.simSlotIndex + 1
                                Text(
                                    text = "• SIM $slotIndex: ${sub.displayName ?: sub.carrierName ?: "Carrier"} (Slot Index: ${sub.simSlotIndex})",
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                    }
                }
            }
        }
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
