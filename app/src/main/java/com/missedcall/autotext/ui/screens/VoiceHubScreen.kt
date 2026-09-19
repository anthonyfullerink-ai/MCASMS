package com.missedcall.autotext.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.missedcall.autotext.App
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.data.db.VoiceCallEvent
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.util.CarrierForwardingManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VoiceHubScreen(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit,
    voiceCalls: List<VoiceCallEvent>,
    onMarkVoiceCallRead: (Long) -> Unit,
    onClearVoiceCalls: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var showConfigDialog by remember { mutableStateOf(false) }
    var selectedCallForDetail by remember { mutableStateOf<VoiceCallEvent?>(null) }

    val isDeveloperKey = settings.licenseKey.contains("DEV", ignoreCase = true) ||
            settings.licenseKey.startsWith("MCAS-DEV") ||
            settings.licenseKey.contains("DEMO", ignoreCase = true) ||
            settings.licenseKey.contains("MASTER", ignoreCase = true)

    val isByok = settings.vapiMode.equals("BYOK", ignoreCase = true)
    val hasByokConfigured = isByok && settings.vapiApiKey.isNotBlank()
    val isManagedActive = isDeveloperKey || settings.voiceSubscriptionActive || settings.licenseKey.contains("VOICE-PRO", ignoreCase = true)
    val isVoiceActive = isDeveloperKey || isManagedActive || hasByokConfigured || settings.voiceReceptionistEnabled

    val carrier = remember { CarrierForwardingManager.detectCarrier(context) }
    val carrierCodes = remember(carrier, settings.voiceReceptionistForwardingNumber) {
        CarrierForwardingManager.computeCodes(carrier, settings.voiceReceptionistForwardingNumber)
    }

    Scaffold(
        topBar = {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 2.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = if (isVoiceActive) Color(0xFF673AB7) else MaterialTheme.colorScheme.primaryContainer,
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.RecordVoiceOver,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "AI Voice Receptionist",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = if (isByok) "Mode: Bring-Your-Own-Key (Free)" else if (isManagedActive) "Mode: Turnkey Managed ($29/mo)" else "Status: Add-On Available",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isVoiceActive) Color(0xFFAB47BC) else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    IconButton(onClick = { showConfigDialog = true }) {
                        Icon(
                            Icons.Default.Tune,
                            contentDescription = "Voice Settings",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item { Spacer(modifier = Modifier.height(4.dp)) }

            // Developer Master Voice Mode banner & Call Simulator
            if (isDeveloperKey) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1B4B)),
                        border = BorderStroke(1.dp, Color(0xFF818CF8)),
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
                                    Icon(Icons.Default.Engineering, contentDescription = null, tint = Color(0xFFA5B4FC), modifier = Modifier.size(20.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "Developer Master Voice Mode",
                                        fontWeight = FontWeight.Bold,
                                        style = MaterialTheme.typography.titleSmall,
                                        color = Color.White
                                    )
                                }
                                Surface(
                                    color = Color(0xFF312E81),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Text(
                                        text = "DEV-UNLOCKED",
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFFA5B4FC)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "Full AI Voice Receptionist backend features, status dial controls, and call simulation are unlocked on this build.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFFCBD5E1)
                            )

                            Spacer(modifier = Modifier.height(10.dp))

                            Button(
                                onClick = {
                                    coroutineScope.launch(Dispatchers.IO) {
                                        val app = context.applicationContext as? App
                                        val currentAct = settings.contractorActivity.ifBlank { "hands full" }
                                        val simEvent = VoiceCallEvent(
                                            phoneNumber = "+1 (732) 552-3896",
                                            callerName = "Sarah Jenkins",
                                            durationSeconds = 54,
                                            intent = if (settings.contractorStatus == "EMERGENCY") "EMERGENCY" else if (settings.contractorStatus == "AFTER_HOURS") "AFTER_HOURS" else "SERVICE_CALL",
                                            summary = if (settings.contractorStatus == "AFTER_HOURS") {
                                                "Caller reached after-hours line and requested next-day service appointment."
                                            } else {
                                                "Caller requested priority appointment while staff was $currentAct."
                                            },
                                            transcript = "Caller: 'Hi, I need an appointment as soon as possible.'\nAI Receptionist: 'Thanks for calling ${settings.businessName}! Everyone currently has their hands full $currentAct, but I can dispatch a technician or send our priority booking link right away.'\nCaller: 'Please send the link, thank you!'",
                                            recordingUrl = null,
                                            followUpSms = "Hey! Thanks for calling ${settings.businessName}. As discussed with our digital assistant while we were $currentAct, here is our priority link: ${settings.contractorGoalLink.ifBlank { "https://missedcallautosms.com" }}",
                                            contractorStatus = settings.contractorStatus,
                                            isRead = false
                                        )
                                        app?.database?.voiceCallDao()?.insert(simEvent)
                                    }
                                    Toast.makeText(context, "Inbound call event recorded to AI Voice Hub!", Toast.LENGTH_SHORT).show()
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4F46E5)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(Icons.Default.PlayCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Simulate Inbound AI Call & Transcript")
                            }
                        }
                    }
                }
            }

            // If user has NOT activated voice (neither Managed nor BYOK)
            if (!isVoiceActive) {
                item {
                    val isProApp = com.missedcall.autotext.BuildConfig.IS_PRO_EDITION || settings.licenseKey.contains("PRO", ignoreCase = true)
                    VoiceReceptionistPromoCard(
                        isProApp = isProApp,
                        onStartTrial = {
                            val targetUrl = if (settings.licenseKey.isNotBlank()) {
                                "${InAppPromoController.STRIPE_VOICE_PRO_URL}?client_reference_id=${settings.licenseKey}"
                            } else {
                                InAppPromoController.STRIPE_VOICE_PRO_URL
                            }
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl))
                            context.startActivity(intent)
                        },
                        onUpgradeToPro = {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(InAppPromoController.STRIPE_PRO_UPGRADE_URL))
                            context.startActivity(intent)
                        },
                        onConfigureByok = {
                            showConfigDialog = true
                        }
                    )
                }
            } else {
                // 1. Quick Status Dial (Control Dial)
                item {
                    Text(
                        text = "1. CONTRACTOR STATUS DIAL",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.height(6.dp))

                    val isWithinHours = remember(settings.schedule, settings.businessHoursEnabled) {
                        com.missedcall.autotext.util.ScheduleUtils.isWithinBusinessHours(settings.schedule)
                    }
                    val effectiveStatus = if (settings.businessHoursEnabled && settings.contractorStatus != "EMERGENCY") {
                        if (isWithinHours) "AVAILABLE" else "AFTER_HOURS"
                    } else {
                        settings.contractorStatus
                    }

                    ContractorStatusDial(
                        currentStatus = effectiveStatus,
                        businessHoursEnabled = settings.businessHoursEnabled,
                        isWithinHours = isWithinHours,
                        schedule = settings.schedule,
                        contractorActivity = settings.contractorActivity,
                        businessName = settings.businessName,
                        contractorGoalLink = settings.contractorGoalLink,
                        onStatusSelected = { newStatus ->
                            onSettingsChanged(settings.copy(contractorStatus = newStatus))
                            val label = when (newStatus) {
                                "AVAILABLE" -> "🟢 Available"
                                "AFTER_HOURS" -> "🌙 After Hours"
                                else -> "🚨 Emergency Only"
                            }
                            Toast.makeText(context, "Status set to $label. AI greeting and triggers updated.", Toast.LENGTH_SHORT).show()
                        },
                        onActivitySelected = { newActivity ->
                            val cleanAct = newActivity.trim().ifBlank { "hands full" }
                            val generatedGreeting = "Thanks for calling ${settings.businessName}! Everyone currently has their hands full $cleanAct, but I'm the digital assistant and I can help book your appointment right now or take down your information for a prompt callback. What day works best for you?"
                            onSettingsChanged(
                                settings.copy(
                                    contractorActivity = newActivity,
                                    voiceReceptionistGreeting = generatedGreeting
                                )
                            )
                            Toast.makeText(context, "Activity updated to '$newActivity'. AI voice intro updated!", Toast.LENGTH_SHORT).show()
                        }
                    )
                }

                // 2. Carrier Call Forwarding Switch
                item {
                    Text(
                        text = "2. CARRIER CALL FORWARDING",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    CarrierForwardingControlCard(
                        enabled = settings.voiceReceptionistEnabled,
                        forwardingNumber = settings.voiceReceptionistForwardingNumber,
                        carrierName = carrierCodes.carrierName,
                        activateCode = carrierCodes.activateCode,
                        deactivateCode = carrierCodes.deactivateCode,
                        onToggle = { isChecked ->
                            if (isChecked) {
                                val codes = CarrierForwardingManager.activateConditionalForwarding(context, settings.voiceReceptionistForwardingNumber)
                                onSettingsChanged(settings.copy(voiceReceptionistEnabled = true))
                                Toast.makeText(context, "Opening dialer with ${codes.activateCode}. Press Call to enable 15s forward to AI.", Toast.LENGTH_LONG).show()
                            } else {
                                val codes = CarrierForwardingManager.deactivateConditionalForwarding(context)
                                onSettingsChanged(settings.copy(voiceReceptionistEnabled = false))
                                Toast.makeText(context, "Opening dialer with ${codes.deactivateCode}. Press Call to restore standard carrier voicemail.", Toast.LENGTH_LONG).show()
                            }
                        }
                    )
                }

                // 3. Contractor Outcome & Dynamic Follow-Up Trigger
                item {
                    Text(
                        text = "3. AGENT OUTCOME & POST-CALL SMS",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    ContractorGoalCard(
                        settings = settings,
                        onSettingsChanged = onSettingsChanged
                    )
                }

                // 4. Voice Call Notifications & Inbox Header
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "4. CALL INBOX & NOTIFICATIONS (${voiceCalls.size})",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        if (voiceCalls.isNotEmpty()) {
                            TextButton(onClick = onClearVoiceCalls) {
                                Text("Clear Inbox", fontSize = 12.sp)
                            }
                        }
                    }
                }

                // Call Inbox items
                if (voiceCalls.isEmpty()) {
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(28.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(
                                    Icons.Default.PhoneCallback,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.6f),
                                    modifier = Modifier.size(36.dp)
                                )
                                Spacer(modifier = Modifier.height(10.dp))
                                Text(
                                    text = "AI Receptionist Standing By",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "When an unanswered call forwards to your AI, caller details, full transcript, and genuine follow-up text will appear here.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                )
                            }
                        }
                    }
                } else {
                    items(voiceCalls) { callEvent ->
                        VoiceCallInboxCard(
                            callEvent = callEvent,
                            onClick = {
                                onMarkVoiceCallRead(callEvent.id)
                                selectedCallForDetail = callEvent
                            }
                        )
                    }
                }
            }

            item { Spacer(modifier = Modifier.height(24.dp)) }
        }
    }

    // Detail Conversation Dialog
    selectedCallForDetail?.let { call ->
        VoiceCallDetailDialog(
            callEvent = call,
            onDismiss = { selectedCallForDetail = null },
            onCallBack = {
                val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${call.phoneNumber}"))
                context.startActivity(dialIntent)
            }
        )
    }

    // Settings / BYOK Configuration Dialog
    if (showConfigDialog) {
        VoiceReceptionistConfigDialog(
            settings = settings,
            onSettingsChanged = onSettingsChanged,
            onDismiss = { showConfigDialog = false }
        )
    }
}

/**
 * Contractor Status Dial (Available / After Hours / Emergency Only)
 */
@Composable
fun ContractorStatusDial(
    currentStatus: String,
    businessHoursEnabled: Boolean = false,
    isWithinHours: Boolean = true,
    schedule: com.missedcall.autotext.data.AppSchedule = com.missedcall.autotext.data.AppSchedule(),
    contractorActivity: String = "Hands Full",
    businessName: String = "My Business",
    contractorGoalLink: String = "",
    onStatusSelected: (String) -> Unit,
    onActivitySelected: (String) -> Unit
) {
    var showCustomActivityDialog by remember { mutableStateOf(false) }
    var customActivityInput by remember { mutableStateOf(contractorActivity) }

    val cleanActivity = contractorActivity.ifBlank { "hands full" }
    val generatedVoiceIntro = "Thanks for calling $businessName! Everyone currently has their hands full $cleanActivity, but I'm the digital assistant and I can help book your appointment right now or take down your information for a prompt callback. What day works best for you?"
    val generatedSmsPreview = "Hey! Sorry we missed your call while $cleanActivity. Here is our direct booking link: ${contractorGoalLink.ifBlank { "https://missedcallautosms.com" }} - $businessName"

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            if (businessHoursEnabled) {
                Surface(
                    color = if (isWithinHours) Color(0xFF00E676).copy(alpha = 0.12f) else Color(0xFF38BDF8).copy(alpha = 0.12f),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(if (isWithinHours) "⚡" else "🌙", fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = if (isWithinHours)
                                "Auto-Sync: Open (${schedule.startTime} - ${schedule.endTime})"
                            else
                                "Auto-Sync: After Hours (Closed until ${schedule.startTime})",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = if (isWithinHours) Color(0xFF00E676) else Color(0xFF38BDF8)
                        )
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // 1. Available / On a Job
                StatusChip(
                    modifier = Modifier.weight(1f),
                    title = "Available",
                    subtitle = cleanActivity.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.ROOT) else it.toString() },
                    icon = "🟢",
                    isSelected = currentStatus == "AVAILABLE" || currentStatus.isBlank(),
                    activeColor = Color(0xFF00E676),
                    onClick = { onStatusSelected("AVAILABLE") }
                )

                // 2. After Hours
                StatusChip(
                    modifier = Modifier.weight(1f),
                    title = "After Hours",
                    subtitle = if (businessHoursEnabled && !isWithinHours) "Auto-Active" else "Closed",
                    icon = "🌙",
                    isSelected = currentStatus == "AFTER_HOURS",
                    activeColor = Color(0xFF38BDF8),
                    onClick = { onStatusSelected("AFTER_HOURS") }
                )

                // 3. Emergency Only
                StatusChip(
                    modifier = Modifier.weight(1f),
                    title = "Emergency",
                    subtitle = "Priority",
                    icon = "🚨",
                    isSelected = currentStatus == "EMERGENCY",
                    activeColor = Color(0xFFEF4444),
                    onClick = { onStatusSelected("EMERGENCY") }
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // When Available is selected, provide activity chooser & dynamic AI intro preview
            if (currentStatus == "AVAILABLE" || currentStatus.isBlank()) {
                Surface(
                    color = MaterialTheme.colorScheme.surface,
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Current Activity / Trade Focus:",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            TextButton(
                                onClick = {
                                    customActivityInput = contractorActivity
                                    showCustomActivityDialog = true
                                },
                                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)
                            ) {
                                Text("✏️ Custom", fontSize = 11.sp)
                            }
                        }

                        // Preset trade chips
                        val presets = listOf("cutting hair", "hands full", "on a job", "on the road", "in a consultation")
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            presets.forEach { act ->
                                val isSelected = cleanActivity.equals(act, ignoreCase = true)
                                FilterChip(
                                    selected = isSelected,
                                    onClick = { onActivitySelected(act) },
                                    label = {
                                        Text(
                                            when (act) {
                                                "cutting hair" -> "✂️ Hair"
                                                "hands full" -> "🛠️ Hands Full"
                                                "on a job" -> "🏗️ On Job"
                                                "on the road" -> "🚗 Driving"
                                                else -> "🤝 Meeting"
                                            },
                                            fontSize = 11.sp
                                        )
                                    },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        // Opening AI Voice Intro preview
                        Surface(
                            color = Color(0xFF673AB7).copy(alpha = 0.1f),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.RecordVoiceOver, contentDescription = null, tint = Color(0xFFAB47BC), modifier = Modifier.size(14.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("AI Opening Voice Greeting (Auto-Generated)", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = Color(0xFFAB47BC))
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "\"$generatedVoiceIntro\"",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        // Context-aware SMS preview
                        Surface(
                            color = Color(0xFF00E676).copy(alpha = 0.08f),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Sms, contentDescription = null, tint = ActiveGreenText, modifier = Modifier.size(14.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Context-Aware Post-Call SMS", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = ActiveGreenText)
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "\"$generatedSmsPreview\"",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            } else if (currentStatus == "AFTER_HOURS") {
                Surface(
                    color = Color(0xFF38BDF8).copy(alpha = 0.08f),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("🌙", fontSize = 14.sp)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("After Hours Closed Script Active", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = Color(0xFF38BDF8))
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "\"Thanks for calling $businessName! Our office is currently closed for the day. I can capture your request for our morning team or text you a priority booking link right now. What can we help you with?\"",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            } else {
                Surface(
                    color = Color(0xFFEF4444).copy(alpha = 0.08f),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("🚨", fontSize = 14.sp)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Emergency Priority Filter Active", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = Color(0xFFEF4444))
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "\"Thanks for calling $businessName emergency line! Are you currently experiencing an active emergency hazard or urgent issue?\"",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }

    if (showCustomActivityDialog) {
        AlertDialog(
            onDismissRequest = { showCustomActivityDialog = false },
            title = { Text("Custom Trade Activity") },
            text = {
                Column {
                    Text(
                        "Enter what you or your staff are busy doing (e.g. 'cutting hair', 'under a sink', 'with a patient', 'operating crane'):",
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    OutlinedTextField(
                        value = customActivityInput,
                        onValueChange = { customActivityInput = it },
                        label = { Text("Busy Activity") },
                        placeholder = { Text("cutting hair") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    val trimmed = customActivityInput.trim()
                    if (trimmed.isNotBlank()) {
                        onActivitySelected(trimmed)
                    }
                    showCustomActivityDialog = false
                }) {
                    Text("Save & Generate Intro")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCustomActivityDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
fun StatusChip(
    modifier: Modifier = Modifier,
    title: String,
    subtitle: String,
    icon: String,
    isSelected: Boolean,
    activeColor: Color,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier.clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        color = if (isSelected) activeColor.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surface,
        border = BorderStroke(
            width = if (isSelected) 2.dp else 1.dp,
            color = if (isSelected) activeColor else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)
        )
    ) {
        Column(
            modifier = Modifier.padding(vertical = 10.dp, horizontal = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(text = icon, fontSize = 20.sp)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                color = if (isSelected) activeColor else MaterialTheme.colorScheme.onSurface,
                maxLines = 1
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.labelSmall,
                fontSize = 10.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1
            )
        }
    }
}

/**
 * Carrier Call Forwarding Control Card
 */
@Composable
fun CarrierForwardingControlCard(
    enabled: Boolean,
    forwardingNumber: String,
    carrierName: String,
    activateCode: String,
    deactivateCode: String,
    onToggle: (Boolean) -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (enabled) Color(0xFF673AB7).copy(alpha = 0.12f) else MaterialTheme.colorScheme.surface
        ),
        border = BorderStroke(
            1.dp,
            if (enabled) Color(0xFF9C27B0).copy(alpha = 0.5f) else MaterialTheme.colorScheme.outlineVariant
        ),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                    Text(
                        text = if (enabled) "Forwarding to AI (Active)" else "Carrier Forwarding Disabled",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleSmall,
                        color = if (enabled) Color(0xFFAB47BC) else MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = if (enabled)
                            "Unanswered calls forward via *71 after 15 seconds"
                        else
                            "Calls ring normal voicemail. Toggle ON to route to AI.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Switch(
                    checked = enabled,
                    onCheckedChange = onToggle
                )
            }

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
                        text = "Carrier: $carrierName (${if (enabled) activateCode else deactivateCode})",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = "Line: $forwardingNumber",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}

/**
 * Contractor Outcome & Goal Card
 */
@Composable
fun ContractorGoalCard(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit
) {
    var isEditingLink by remember { mutableStateOf(false) }
    var linkInput by remember { mutableStateOf(settings.contractorGoalLink) }

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
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
                    Icon(Icons.Default.Flag, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Primary AI Post-Call Goal",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                }

                TextButton(onClick = { isEditingLink = !isEditingLink }) {
                    Text(if (isEditingLink) "Close" else "Configure Link", fontSize = 11.sp)
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                GoalFilterChip(
                    modifier = Modifier.weight(1f),
                    title = "📅 Booking Link",
                    isSelected = settings.contractorGoal == "BOOKING_LINK",
                    onClick = { onSettingsChanged(settings.copy(contractorGoal = "BOOKING_LINK")) }
                )
                GoalFilterChip(
                    modifier = Modifier.weight(1f),
                    title = "⏱️ 30m Callback",
                    isSelected = settings.contractorGoal == "CALLBACK_PROMISE",
                    onClick = { onSettingsChanged(settings.copy(contractorGoal = "CALLBACK_PROMISE")) }
                )
                GoalFilterChip(
                    modifier = Modifier.weight(1f),
                    title = "📝 Quote Form",
                    isSelected = settings.contractorGoal == "QUOTE_FORM",
                    onClick = { onSettingsChanged(settings.copy(contractorGoal = "QUOTE_FORM")) }
                )
            }

            if (isEditingLink || (settings.contractorGoal != "CALLBACK_PROMISE" && settings.contractorGoalLink.isBlank())) {
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedTextField(
                    value = linkInput,
                    onValueChange = {
                        linkInput = it
                        onSettingsChanged(settings.copy(contractorGoalLink = it))
                    },
                    label = { Text("Your Booking / Quote URL") },
                    placeholder = { Text("https://cal.com/your-name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "The AI dynamically writes genuine SMS messages including this link when taking calls.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
fun GoalFilterChip(
    modifier: Modifier = Modifier,
    title: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier.clickable { onClick() },
        shape = RoundedCornerShape(10.dp),
        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        border = BorderStroke(
            1.dp,
            if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
        )
    ) {
        Box(
            modifier = Modifier.padding(vertical = 8.dp, horizontal = 4.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

/**
 * Call Inbox Card
 */
@Composable
fun VoiceCallInboxCard(
    callEvent: VoiceCallEvent,
    onClick: () -> Unit
) {
    val dateFormat = remember { SimpleDateFormat("h:mm a • MMM d", Locale.getDefault()) }
    val timeFormatted = remember(callEvent.timestamp) { dateFormat.format(Date(callEvent.timestamp)) }

    val intentLabel = when (callEvent.intent) {
        "QUOTE_REQUEST" -> "💬 Quote Request"
        "EMERGENCY" -> "🚨 Emergency"
        "GENERAL_INFO" -> "❓ General Info"
        else -> "🔧 Service Call"
    }

    val intentColor = when (callEvent.intent) {
        "EMERGENCY" -> Color(0xFFEF4444)
        "QUOTE_REQUEST" -> Color(0xFF10B981)
        else -> Color(0xFF3B82F6)
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (callEvent.isRead) MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f)
        ),
        border = BorderStroke(
            1.dp,
            if (!callEvent.isRead) MaterialTheme.colorScheme.primary.copy(alpha = 0.5f) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f)
        )
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier.weight(1f, fill = false).padding(end = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (!callEvent.isRead) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.primary)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                    }
                    Text(
                        text = callEvent.callerName ?: callEvent.phoneNumber,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "${callEvent.durationSeconds}s",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Surface(
                    color = intentColor.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        text = intentLabel,
                        color = intentColor,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = timeFormatted,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = if (callEvent.summary.isNotBlank()) callEvent.summary else "Call answered by AI receptionist. Details logged.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            if (!callEvent.followUpSms.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(8.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Text("💬", fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Sent: \"${callEvent.followUpSms}\"",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }
    }
}

/**
 * Detail Conversation Dialog with Full Transcript
 */
@Composable
fun VoiceCallDetailDialog(
    callEvent: VoiceCallEvent,
    onDismiss: () -> Unit,
    onCallBack: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .fillMaxHeight(0.85f),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 8.dp
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
                    Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                        Text(
                            text = callEvent.callerName ?: "Caller Details",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "${callEvent.phoneNumber} • Duration: ${callEvent.durationSeconds}s",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Summary Box
                    item {
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Text(
                                    text = "AI Call Summary",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = callEvent.summary.ifBlank { "No summary available." },
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                    }

                    // Genuine Follow-Up SMS
                    if (!callEvent.followUpSms.isNullOrBlank()) {
                        item {
                            Surface(
                                color = ActiveGreenContainer.copy(alpha = 0.2f),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(14.dp)) {
                                    Text(
                                        text = "Genuine Follow-Up Text Sent to Customer",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = ActiveGreenText
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = callEvent.followUpSms,
                                        style = MaterialTheme.typography.bodySmall
                                    )
                                }
                            }
                        }
                    }

                    // Full Conversation Transcript
                    item {
                        Text(
                            text = "Full Conversation Transcript",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = callEvent.transcript.ifBlank { "Full audio transcript is processing or was brief." },
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(14.dp)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Bottom Call Back Button
                Button(
                    onClick = onCallBack,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Phone, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Call Back ${callEvent.phoneNumber}")
                }
            }
        }
    }
}

/**
 * Preview Promo Card shown when user hasn't opted into Voice yet
 */
@Composable
fun VoiceReceptionistPromoCard(
    isProApp: Boolean = true,
    onStartTrial: () -> Unit,
    onUpgradeToPro: () -> Unit,
    onConfigureByok: () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF131720)),
        border = BorderStroke(1.dp, Color(0xFF9C27B0).copy(alpha = 0.4f)),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = Color(0xFF9C27B0),
                    modifier = Modifier.size(40.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.RecordVoiceOver, contentDescription = null, tint = Color.White)
                    }
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = "24/7 AI Voice Receptionist",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = "Answers when you have hands full on a job",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFF8B949E)
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            Text(
                text = "When you can't pick up, carrier call forwarding (*71) routes unanswered calls after 15 seconds to a human-sounding AI assistant configured for your trade.",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFFCBD5E0)
            )

            Spacer(modifier = Modifier.height(14.dp))

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                VoiceBenefitRow("🟢", "Quick Status Dial: Available, After Hours, or Emergency.")
                VoiceBenefitRow("📅", "Sends genuine follow-up SMS with your booking or quote link.")
                VoiceBenefitRow("📱", "In-App Notifications: Caller intent, audio summary & transcripts.")
                VoiceBenefitRow("🛡️", "Smart Handover: Never double-texts or clashes with native SMS.")
            }

            Spacer(modifier = Modifier.height(18.dp))

            if (isProApp) {
                Button(
                    onClick = onStartTrial,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF9C27B0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.FlashOn, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Start Turnkey Free Trial ($29/mo)")
                }
            } else {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFF7928CA).copy(alpha = 0.15f),
                    border = BorderStroke(1.dp, Color(0xFF9C27B0).copy(alpha = 0.4f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("⭐", fontSize = 16.sp)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "Pro Automation Edition Required",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFC084FC)
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "The AI Voice Receptionist add-on is exclusive to MissedCallAutoSMS Pro ($149). Standard Edition ($49) does not support telephony routing or webhooks.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFFE2E8F0)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Button(
                    onClick = onUpgradeToPro,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF7928CA)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.RocketLaunch, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("⚡ Upgrade to Pro Automation ($149.99)")
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedButton(
                onClick = onConfigureByok,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Key, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Bring Your Own Key (DIY Free)")
            }
        }
    }
}

@Composable
fun VoiceBenefitRow(icon: String, text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Text(icon, fontSize = 14.sp)
        Spacer(modifier = Modifier.width(8.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = Color(0xFFE2E8F0))
    }
}

data class VapiAssistantSummary(val id: String, val name: String, val model: String = "")
data class VapiPhoneNumberSummary(val id: String, val number: String, val name: String = "")

/**
 * BYOK & Custom Greeting Configuration Modal Dialog
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VoiceReceptionistConfigDialog(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var mode by remember { mutableStateOf(settings.vapiMode) }
    var apiKeyInput by remember { mutableStateOf(settings.vapiApiKey) }
    var assistantIdInput by remember { mutableStateOf(settings.vapiAssistantId) }
    var phoneIdInput by remember { mutableStateOf(settings.vapiPhoneNumberId) }
    var forwardNumInput by remember { mutableStateOf(settings.voiceReceptionistForwardingNumber) }
    var greetingInput by remember { mutableStateOf(settings.voiceReceptionistGreeting) }

    var isFetchingVapi by remember { mutableStateOf(false) }
    var vapiAssistants by remember { mutableStateOf<List<VapiAssistantSummary>>(emptyList()) }
    var vapiPhoneNumbers by remember { mutableStateOf<List<VapiPhoneNumberSummary>>(emptyList()) }
    var vapiFetchError by remember { mutableStateOf<String?>(null) }
    var vapiFetchSuccess by remember { mutableStateOf<String?>(null) }

    fun fetchVapiData(apiKey: String) {
        if (apiKey.isBlank()) {
            vapiFetchError = "Please enter your Vapi Private API Key first."
            return
        }
        isFetchingVapi = true
        vapiFetchError = null
        vapiFetchSuccess = null
        coroutineScope.launch(Dispatchers.IO) {
            try {
                // 1. Fetch Assistants
                val asstConn = URL("https://api.vapi.ai/assistant").openConnection() as HttpURLConnection
                asstConn.requestMethod = "GET"
                asstConn.setRequestProperty("Authorization", "Bearer ${apiKey.trim()}")
                asstConn.setRequestProperty("Content-Type", "application/json")
                asstConn.connectTimeout = 8000
                asstConn.readTimeout = 8000

                val fetchedAssistants = mutableListOf<VapiAssistantSummary>()
                if (asstConn.responseCode in 200..299) {
                    val respText = asstConn.inputStream.bufferedReader().use { it.readText() }
                    val jsonArr = JSONArray(respText)
                    for (i in 0 until jsonArr.length()) {
                        val obj = jsonArr.getJSONObject(i)
                        val id = obj.optString("id", "")
                        val name = obj.optString("name", "Unnamed Assistant")
                        val modelObj = obj.optJSONObject("model")
                        val modelName = modelObj?.optString("model", "") ?: ""
                        if (id.isNotBlank()) {
                            fetchedAssistants.add(VapiAssistantSummary(id, name, modelName))
                        }
                    }
                } else {
                    val errBody = try { asstConn.errorStream?.bufferedReader()?.use { it.readText() } } catch (e: Exception) { null }
                    throw Exception("Vapi Assistants API returned HTTP ${asstConn.responseCode}${if (errBody != null) ": $errBody" else ""}")
                }

                // 2. Fetch Phone Numbers
                val phoneConn = URL("https://api.vapi.ai/phone-number").openConnection() as HttpURLConnection
                phoneConn.requestMethod = "GET"
                phoneConn.setRequestProperty("Authorization", "Bearer ${apiKey.trim()}")
                phoneConn.setRequestProperty("Content-Type", "application/json")
                phoneConn.connectTimeout = 8000
                phoneConn.readTimeout = 8000

                val fetchedPhoneNumbers = mutableListOf<VapiPhoneNumberSummary>()
                if (phoneConn.responseCode in 200..299) {
                    val respText = phoneConn.inputStream.bufferedReader().use { it.readText() }
                    val jsonArr = JSONArray(respText)
                    for (i in 0 until jsonArr.length()) {
                        val obj = jsonArr.getJSONObject(i)
                        val id = obj.optString("id", "")
                        val num = obj.optString("number", "")
                        val name = obj.optString("name", "")
                        if (id.isNotBlank() || num.isNotBlank()) {
                            fetchedPhoneNumbers.add(VapiPhoneNumberSummary(id, num, name))
                        }
                    }
                }

                withContext(Dispatchers.Main) {
                    vapiAssistants = fetchedAssistants
                    vapiPhoneNumbers = fetchedPhoneNumbers
                    isFetchingVapi = false
                    if (fetchedAssistants.isEmpty() && fetchedPhoneNumbers.isEmpty()) {
                        vapiFetchError = "Connected to Vapi, but no assistants or phone numbers were found in this account."
                    } else {
                        vapiFetchSuccess = "Found ${fetchedAssistants.size} assistant(s) and ${fetchedPhoneNumbers.size} number(s)!"
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    isFetchingVapi = false
                    vapiFetchError = "Failed to load Vapi agents: ${e.message}"
                }
            }
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .fillMaxHeight(0.85f),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 8.dp
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "AI Voice Configuration",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    // Integration Mode Selection
                    item {
                        Text("Integration Mode", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(
                                selected = mode == "MANAGED",
                                onClick = { mode = "MANAGED" },
                                label = { Text("Turnkey Managed ($29)") },
                                modifier = Modifier.weight(1f)
                            )
                            FilterChip(
                                selected = mode == "BYOK",
                                onClick = { mode = "BYOK" },
                                label = { Text("BYOK Vapi (Free)") },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }

                    // BYOK Fields
                    if (mode == "BYOK") {
                        item {
                            Surface(
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text("Vapi BYOK Integration", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                                        Surface(
                                            color = MaterialTheme.colorScheme.primaryContainer,
                                            shape = RoundedCornerShape(8.dp)
                                        ) {
                                            Text(
                                                text = "FREE / DIRECT",
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                                style = MaterialTheme.typography.labelSmall,
                                                fontWeight = FontWeight.Bold,
                                                color = MaterialTheme.colorScheme.primary
                                            )
                                        }
                                    }

                                    Text(
                                        text = "Connect your private Vapi account. If you have multiple assistants configured, tap 'Fetch Assistants & Numbers' to select your agent.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )

                                    OutlinedTextField(
                                        value = apiKeyInput,
                                        onValueChange = {
                                            apiKeyInput = it
                                            vapiFetchError = null
                                            vapiFetchSuccess = null
                                        },
                                        label = { Text("Vapi Private API Key") },
                                        placeholder = { Text("e.g. 4d8b2f91-...") },
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth()
                                    )

                                    Button(
                                        onClick = { fetchVapiData(apiKeyInput) },
                                        enabled = !isFetchingVapi && apiKeyInput.isNotBlank(),
                                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        if (isFetchingVapi) {
                                            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text("Loading Vapi Account...", fontSize = 12.sp)
                                        } else {
                                            Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text("Fetch Assistants & Numbers", fontSize = 12.sp)
                                        }
                                    }

                                    if (vapiFetchError != null) {
                                        Text(vapiFetchError!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
                                    }
                                    if (vapiFetchSuccess != null) {
                                        Text(vapiFetchSuccess!!, color = ActiveGreenText, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                    }

                                    // Assistants list picker
                                    if (vapiAssistants.isNotEmpty()) {
                                        Text("Select Your Assistant / Agent:", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                            vapiAssistants.forEach { asst ->
                                                val isSelected = assistantIdInput == asst.id
                                                Surface(
                                                    shape = RoundedCornerShape(8.dp),
                                                    color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                                                    border = BorderStroke(1.dp, if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .clickable { assistantIdInput = asst.id }
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Column(modifier = Modifier.weight(1f)) {
                                                            Text(asst.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                                                            Text("ID: ${asst.id} ${if (asst.model.isNotBlank()) "• ${asst.model}" else ""}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                                        }
                                                        if (isSelected) {
                                                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // Phone lines list picker
                                    if (vapiPhoneNumbers.isNotEmpty()) {
                                        Text("Select Inbound Phone Line (*71 Forwarding Target):", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                            vapiPhoneNumbers.forEach { phone ->
                                                val isSelected = phoneIdInput == phone.id || forwardNumInput == phone.number
                                                Surface(
                                                    shape = RoundedCornerShape(8.dp),
                                                    color = if (isSelected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface,
                                                    border = BorderStroke(1.dp, if (isSelected) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.outlineVariant),
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .clickable {
                                                            phoneIdInput = phone.id
                                                            if (phone.number.isNotBlank()) {
                                                                forwardNumInput = phone.number
                                                            }
                                                        }
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Column(modifier = Modifier.weight(1f)) {
                                                            Text(phone.number.ifBlank { "Phone ID: ${phone.id}" }, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                                                            if (phone.name.isNotBlank()) {
                                                                Text(phone.name, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                                            }
                                                        }
                                                        if (isSelected) {
                                                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(18.dp))
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    OutlinedTextField(
                                        value = assistantIdInput,
                                        onValueChange = { assistantIdInput = it },
                                        label = { Text("Assistant ID") },
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth()
                                    )

                                    OutlinedTextField(
                                        value = phoneIdInput,
                                        onValueChange = { phoneIdInput = it },
                                        label = { Text("Phone Number ID (Optional)") },
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth()
                                    )
                                }
                            }
                        }
                    }

                    // Forwarding Number
                    item {
                        OutlinedTextField(
                            value = forwardNumInput,
                            onValueChange = { forwardNumInput = it },
                            label = { Text("Assigned AI Inbound Number (*71 Target)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    // Custom Opening Greeting
                    item {
                        OutlinedTextField(
                            value = greetingInput,
                            onValueChange = { greetingInput = it },
                            label = { Text("Opening AI Voice Greeting") },
                            placeholder = { Text("Thanks for calling ${settings.businessName}! How can I help you today?") },
                            maxLines = 3,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                Button(
                    onClick = {
                        onSettingsChanged(
                            settings.copy(
                                vapiMode = mode,
                                vapiApiKey = apiKeyInput.trim(),
                                vapiAssistantId = assistantIdInput.trim(),
                                vapiPhoneNumberId = phoneIdInput.trim(),
                                voiceReceptionistForwardingNumber = forwardNumInput.trim(),
                                voiceReceptionistGreeting = greetingInput.trim()
                            )
                        )
                        Toast.makeText(context, "✅ AI Voice settings saved!", Toast.LENGTH_SHORT).show()
                        onDismiss()
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Save Voice Settings")
                }
            }
        }
    }
}
