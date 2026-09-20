package com.missedcall.autotext.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.BorderStroke
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.data.license.LicenseManager
import com.missedcall.autotext.data.license.LicenseStatus
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.ui.theme.AmberWarning
import com.missedcall.autotext.ui.theme.DarkGreenPrimary
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
    val coroutineScope = rememberCoroutineScope()
    var isDropdownExpanded by remember { mutableStateOf(false) }
    var newWebhookUrlInput by remember { mutableStateOf("") }
    var isPingingWebhook by remember { mutableStateOf(false) }
    var pingStatusMessage by remember { mutableStateOf<String?>(null) }
    val updateManager = remember { com.missedcall.autotext.remote.RemoteUpdateManager(context) }
    var isCheckingUpdate by remember { mutableStateOf(false) }
    var availableUpdate by remember { mutableStateOf<com.missedcall.autotext.remote.UpdateInfo?>(null) }
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

        // 4. Business Name & Action Link Card
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
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedTextField(
                    value = settings.contractorGoalLink,
                    onValueChange = { onSettingsChanged(settings.copy(contractorGoalLink = it)) },
                    label = { Text("Direct Booking / Website Link") },
                    placeholder = { Text("https://yourbusiness.com/book") },
                    leadingIcon = {
                        Icon(Icons.Default.Link, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    },
                    singleLine = true,
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
                        onCheckedChange = { enabled ->
                            val check = com.missedcall.autotext.util.ScheduleUtils.checkScheduleDetailed(settings.schedule)
                            val newStatus = if (enabled && settings.contractorStatus != "EMERGENCY") {
                                if (check.isWithinHours) "AVAILABLE" else "AFTER_HOURS"
                            } else {
                                settings.contractorStatus
                            }
                            onSettingsChanged(
                                settings.copy(
                                    businessHoursEnabled = enabled,
                                    contractorStatus = newStatus
                                )
                            )
                        }
                    )
                }

                if (settings.businessHoursEnabled) {
                    Spacer(modifier = Modifier.height(14.dp))

                    val scheduleCheck = remember(settings.schedule, settings.businessHoursEnabled) {
                        com.missedcall.autotext.util.ScheduleUtils.checkScheduleDetailed(settings.schedule)
                    }

                    // Live auto-calculated schedule status card
                    Surface(
                        color = if (scheduleCheck.isWithinHours) Color(0xFF00E676).copy(alpha = 0.12f) else Color(0xFF38BDF8).copy(alpha = 0.12f),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(if (scheduleCheck.isWithinHours) "🟢" else "🌙", fontSize = 18.sp)
                            Spacer(modifier = Modifier.width(10.dp))
                            Column {
                                Text(
                                    text = if (scheduleCheck.isWithinHours) "Auto-Status: OPEN / AVAILABLE" else "Auto-Status: CLOSED / AFTER HOURS",
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.titleSmall,
                                    color = if (scheduleCheck.isWithinHours) Color(0xFF00E676) else Color(0xFF38BDF8)
                                )
                                Text(
                                    text = "Today is ${scheduleCheck.currentDay} (${if (scheduleCheck.isDayActive) "Active Day" else "Day Off"}). ${scheduleCheck.reason}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        OutlinedTextField(
                            value = settings.schedule.startTime,
                            onValueChange = { newTime ->
                                val newSchedule = settings.schedule.copy(startTime = newTime)
                                val check = com.missedcall.autotext.util.ScheduleUtils.checkScheduleDetailed(newSchedule)
                                val newStatus = if (settings.contractorStatus != "EMERGENCY") {
                                    if (check.isWithinHours) "AVAILABLE" else "AFTER_HOURS"
                                } else settings.contractorStatus
                                onSettingsChanged(
                                    settings.copy(
                                        schedule = newSchedule,
                                        contractorStatus = newStatus
                                    )
                                )
                            },
                            label = { Text("Start Time (HH:mm)") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = settings.schedule.endTime,
                            onValueChange = { newTime ->
                                val newSchedule = settings.schedule.copy(endTime = newTime)
                                val check = com.missedcall.autotext.util.ScheduleUtils.checkScheduleDetailed(newSchedule)
                                val newStatus = if (settings.contractorStatus != "EMERGENCY") {
                                    if (check.isWithinHours) "AVAILABLE" else "AFTER_HOURS"
                                } else settings.contractorStatus
                                onSettingsChanged(
                                    settings.copy(
                                        schedule = newSchedule,
                                        contractorStatus = newStatus
                                    )
                                )
                            },
                            label = { Text("End Time (HH:mm)") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(text = "Active Operating Days", fontWeight = FontWeight.Medium)
                        val allSevenDays = listOf("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY")
                        val hasAllSeven = settings.schedule.activeDays.containsAll(allSevenDays)
                        TextButton(
                            onClick = {
                                val newDays = if (hasAllSeven) {
                                    listOf("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY")
                                } else {
                                    allSevenDays
                                }
                                val newSchedule = settings.schedule.copy(activeDays = newDays)
                                val check = com.missedcall.autotext.util.ScheduleUtils.checkScheduleDetailed(newSchedule)
                                val newStatus = if (settings.contractorStatus != "EMERGENCY") {
                                    if (check.isWithinHours) "AVAILABLE" else "AFTER_HOURS"
                                } else settings.contractorStatus
                                onSettingsChanged(
                                    settings.copy(
                                        schedule = newSchedule,
                                        contractorStatus = newStatus
                                    )
                                )
                            }
                        ) {
                            Text(if (hasAllSeven) "Mon-Fri Only" else "Include Weekends (7 Days)", fontSize = 11.sp)
                        }
                    }
                    Spacer(modifier = Modifier.height(4.dp))

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
                                    val newSchedule = settings.schedule.copy(activeDays = newDays)
                                    val check = com.missedcall.autotext.util.ScheduleUtils.checkScheduleDetailed(newSchedule)
                                    val newStatus = if (settings.contractorStatus != "EMERGENCY") {
                                        if (check.isWithinHours) "AVAILABLE" else "AFTER_HOURS"
                                    } else settings.contractorStatus
                                    onSettingsChanged(
                                        settings.copy(
                                            schedule = newSchedule,
                                            contractorStatus = newStatus
                                        )
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

                    // Central Cloud Relay Card (Option C for n8n Cloud / Make.com)
                    Spacer(modifier = Modifier.height(14.dp))
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f),
                        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(text = "☁️", style = MaterialTheme.typography.titleMedium)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Central Cloud Relay (n8n Cloud & Make)",
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Zero setup required. Dispatches SMS to this phone anywhere in the world across cellular data or Wi-Fi without port forwarding or VPNs.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            Spacer(modifier = Modifier.height(10.dp))
                            val cloudRelayUrl = "https://missedcallautosms.com/.netlify/functions/dispatch-sms"
                            Text(text = "Cloud Relay Webhook URL:", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelMedium)
                            Spacer(modifier = Modifier.height(4.dp))
                            OutlinedTextField(
                                value = cloudRelayUrl,
                                onValueChange = {},
                                readOnly = true,
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                trailingIcon = {
                                    TextButton(onClick = {
                                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                                        val clip = android.content.ClipData.newPlainText("Cloud Relay URL", cloudRelayUrl)
                                        clipboard.setPrimaryClip(clip)
                                        Toast.makeText(context, "Copied Cloud Relay URL!", Toast.LENGTH_SHORT).show()
                                    }) {
                                        Text("Copy")
                                    }
                                }
                            )

                            Spacer(modifier = Modifier.height(8.dp))
                            val isRelayActive = settings.licenseKey.isNotBlank() && settings.fcmDeviceToken.isNotBlank()
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = if (isRelayActive) "🟢 Central Relay Status: Active (Device Paired)" else "🟡 Central Relay Status: Awaiting License / Token",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isRelayActive) DarkGreenPrimary else AmberWarning
                                )
                            }
                        }
                    }

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
                            val sanitizedPhone = testWebhookPhone.replace("[^0-9+]".toRegex(), "").trim()
                            if (sanitizedPhone.isBlank()) {
                                Toast.makeText(context, "Please enter a valid phone number to test", Toast.LENGTH_SHORT).show()
                                return@Button
                            }

                            val hasSmsPerm = androidx.core.content.ContextCompat.checkSelfPermission(
                                context, android.Manifest.permission.SEND_SMS
                            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
                            if (!hasSmsPerm) {
                                Toast.makeText(context, "⚠️ SMS Permission Missing! Please grant SMS permissions in Android Settings.", Toast.LENGTH_LONG).show()
                                return@Button
                            }

                            val licenseInfo = com.missedcall.autotext.data.license.LicenseManager.verifyLicenseKey(settings.licenseKey)
                            if (licenseInfo.status == com.missedcall.autotext.data.license.LicenseStatus.UNLICENSED) {
                                Toast.makeText(context, "⚠️ Appliance is Unlicensed! Enter your License Key (or Master Demo Key: MCAS-PRO-DEMO-89F2) in Settings.", Toast.LENGTH_LONG).show()
                                return@Button
                            }

                            val workData = androidx.work.Data.Builder()
                                .putString(com.missedcall.autotext.worker.SendAutoTextWorker.KEY_PHONE_NUMBER, sanitizedPhone)
                                .putString(com.missedcall.autotext.worker.SendAutoTextWorker.KEY_OVERRIDE_MESSAGE, testWebhookMsg.trim())
                                .putBoolean(com.missedcall.autotext.worker.SendAutoTextWorker.KEY_IS_REMOTE_TRIGGER, true)
                                .putInt(com.missedcall.autotext.worker.SendAutoTextWorker.KEY_SIM_SLOT, testSimSlot)
                                .build()

                            val workRequest = androidx.work.OneTimeWorkRequestBuilder<com.missedcall.autotext.worker.SendAutoTextWorker>()
                                .setInputData(workData)
                                .build()

                            androidx.work.WorkManager.getInstance(context).enqueue(workRequest)
                            val simLabel = if (testSimSlot == 0) "Auto Default SIM" else "SIM $testSimSlot"
                            Toast.makeText(context, "⚡ Webhook Simulated! SMS queued via $simLabel for $sanitizedPhone", Toast.LENGTH_LONG).show()
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                    ) {
                        Text("Simulate Webhook Dispatch ➔", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // 8.1 Outbound Missed Call Forwarding (n8n Automations)
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
                            contentDescription = "Outbound Webhook Icon",
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Missed Call n8n Forwarder",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Switch(
                        checked = settings.outboundWebhookEnabled,
                        onCheckedChange = { onSettingsChanged(settings.copy(outboundWebhookEnabled = it)) }
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "When a call is missed on this phone, instantly forward the event to your n8n workflow URL so your automated sequences can take over.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                if (settings.outboundWebhookEnabled) {
                    Spacer(modifier = Modifier.height(14.dp))

                    // Anti-Double-Send / Mute Native Template Switch
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (settings.muteNativeAutoReply) ActiveGreenContainer.copy(alpha = 0.35f) else MaterialTheme.colorScheme.surfaceVariant,
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            if (settings.muteNativeAutoReply) ActiveGreenText else MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
                        ),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
                                Text(
                                    text = "Mute Native Auto-Reply (No Double-Sends)",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = if (settings.muteNativeAutoReply) ActiveGreenText else MaterialTheme.colorScheme.onSurface
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = if (settings.muteNativeAutoReply)
                                        "✅ Active: Local SMS template is silenced. Only your n8n workflow will send messages to the caller."
                                    else
                                        "⚠️ Inactive: Both this app's template AND n8n will send a text (potential double text).",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Switch(
                                checked = settings.muteNativeAutoReply,
                                onCheckedChange = { onSettingsChanged(settings.copy(muteNativeAutoReply = it)) },
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = ActiveGreenText,
                                    checkedTrackColor = ActiveGreenContainer
                                )
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Webhook Selector Dropdown
                    Text(
                        text = "Active n8n Webhook Target",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleSmall
                    )
                    Spacer(modifier = Modifier.height(6.dp))

                    Box(modifier = Modifier.fillMaxWidth()) {
                        OutlinedCard(
                            onClick = { isDropdownExpanded = true },
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp, vertical = 12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = if (settings.selectedOutboundWebhookUrl.isNotBlank())
                                        settings.selectedOutboundWebhookUrl
                                    else if (settings.savedOutboundWebhooks.isNotEmpty())
                                        "Select an integrated webhook..."
                                    else
                                        "No webhooks saved yet (Add below)",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (settings.selectedOutboundWebhookUrl.isNotBlank())
                                        MaterialTheme.colorScheme.onSurface
                                    else
                                        MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    modifier = Modifier.weight(1f)
                                )
                                Icon(
                                    imageVector = Icons.Default.ArrowDropDown,
                                    contentDescription = "Open Webhook Dropdown"
                                )
                            }
                        }

                        DropdownMenu(
                            expanded = isDropdownExpanded,
                            onDismissRequest = { isDropdownExpanded = false },
                            modifier = Modifier.fillMaxWidth(0.9f)
                        ) {
                            if (settings.savedOutboundWebhooks.isNotEmpty()) {
                                settings.savedOutboundWebhooks.forEach { url ->
                                    val isSelected = settings.selectedOutboundWebhookUrl == url
                                    DropdownMenuItem(
                                        text = {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text(
                                                    text = url,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                                    modifier = Modifier.weight(1f),
                                                    maxLines = 1
                                                )
                                                if (isSelected) {
                                                    Spacer(modifier = Modifier.width(8.dp))
                                                    Icon(
                                                        imageVector = Icons.Default.CheckCircle,
                                                        contentDescription = "Selected",
                                                        tint = DarkGreenPrimary,
                                                        modifier = Modifier.size(16.dp)
                                                    )
                                                }
                                                IconButton(
                                                    onClick = {
                                                        val updatedList = settings.savedOutboundWebhooks - url
                                                        val updatedSelected = if (settings.selectedOutboundWebhookUrl == url) {
                                                            updatedList.firstOrNull() ?: ""
                                                        } else {
                                                            settings.selectedOutboundWebhookUrl
                                                        }
                                                        onSettingsChanged(
                                                            settings.copy(
                                                                savedOutboundWebhooks = updatedList,
                                                                selectedOutboundWebhookUrl = updatedSelected
                                                            )
                                                        )
                                                    },
                                                    modifier = Modifier.size(24.dp)
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Default.Delete,
                                                        contentDescription = "Remove Webhook",
                                                        tint = MaterialTheme.colorScheme.error,
                                                        modifier = Modifier.size(16.dp)
                                                    )
                                                }
                                            }
                                        },
                                        onClick = {
                                            onSettingsChanged(settings.copy(selectedOutboundWebhookUrl = url))
                                            isDropdownExpanded = false
                                        }
                                    )
                                }
                                HorizontalDivider()
                            }

                            DropdownMenuItem(
                                text = {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.Add, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("+ Add Webhook", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                                    }
                                },
                                onClick = {
                                    isDropdownExpanded = false
                                }
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Add Webhook Input Box
                    Text(
                        text = "Add Webhook URL",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    OutlinedTextField(
                        value = newWebhookUrlInput,
                        onValueChange = { newWebhookUrlInput = it },
                        label = { Text("https://your-n8n-instance.com/webhook/missed-call") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = {
                                val trimmed = newWebhookUrlInput.trim()
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
                                Toast.makeText(context, "✅ Webhook saved and selected as active target!", Toast.LENGTH_SHORT).show()
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Save Webhook")
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
                                                "caller_name" to "Test Caller",
                                                "timestamp" to System.currentTimeMillis()
                                            )
                                        )
                                        conn.outputStream.use { it.write(testBody.toByteArray(StandardCharsets.UTF_8)) }
                                        val code = conn.responseCode
                                        conn.disconnect()

                                        withContext(Dispatchers.Main) {
                                            isPingingWebhook = false
                                            pingStatusMessage = if (code in 200..299) {
                                                "✅ Ping Success! (HTTP $code - Connected to n8n)"
                                            } else {
                                                "⚠️ Webhook responded with HTTP $code"
                                            }
                                        }
                                    } catch (err: Exception) {
                                        withContext(Dispatchers.Main) {
                                            isPingingWebhook = false
                                            pingStatusMessage = "❌ Ping failed: ${err.localizedMessage ?: "Connection error"}"
                                        }
                                    }
                                }
                            }
                        ) {
                            if (isPingingWebhook) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            } else {
                                Text("Test Ping")
                            }
                        }
                    }

                    pingStatusMessage?.let { status ->
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = status,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Bold,
                            color = if (status.startsWith("✅")) DarkGreenPrimary else MaterialTheme.colorScheme.error
                        )
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
                            onClick = {
                                // Resolve and cache the stable subscriptionId for this slot
                                val resolvedSubId = if (slotValue == 0) {
                                    -1 // Auto/default — no cached ID needed
                                } else {
                                    val targetSlotIndex = slotValue - 1
                                    activeSimInfoList.firstOrNull { it.simSlotIndex == targetSlotIndex }?.subscriptionId ?: -1
                                }
                                onSettingsChanged(settings.copy(
                                    preferredSimSlot = slotValue,
                                    preferredSimSubscriptionId = resolvedSubId
                                ))
                            }
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

        // 10. Software & OTA Updates Card
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth()
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
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f))
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
                                val updateUrl = settings.remoteUpdateUrl.ifBlank { com.missedcall.autotext.remote.RemoteUpdateManager.DEFAULT_UPDATE_URL }
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
                                val updateUrl = settings.remoteUpdateUrl.ifBlank { com.missedcall.autotext.remote.RemoteUpdateManager.DEFAULT_UPDATE_URL }
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

        Spacer(modifier = Modifier.height(16.dp))
    }

    // OTA Update Modal Dialog if an update is initiated from Settings
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
