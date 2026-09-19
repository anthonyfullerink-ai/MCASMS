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
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.data.db.VoiceCallEvent
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.util.CarrierForwardingManager
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
    var showConfigDialog by remember { mutableStateOf(false) }
    var selectedCallForDetail by remember { mutableStateOf<VoiceCallEvent?>(null) }

    val isByok = settings.vapiMode.equals("BYOK", ignoreCase = true)
    val hasByokConfigured = isByok && settings.vapiApiKey.isNotBlank()
    val isManagedActive = settings.voiceSubscriptionActive || settings.licenseKey.contains("VOICE-PRO", ignoreCase = true)
    val isVoiceActive = isManagedActive || hasByokConfigured || settings.voiceReceptionistEnabled

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

            // If user has NOT activated voice (neither Managed nor BYOK)
            if (!isVoiceActive) {
                item {
                    VoiceReceptionistPromoCard(
                        onStartTrial = {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(InAppPromoController.STRIPE_VOICE_PRO_URL))
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
                        onStatusSelected = { newStatus ->
                            onSettingsChanged(settings.copy(contractorStatus = newStatus))
                            val label = when (newStatus) {
                                "AVAILABLE" -> "🟢 Available / On a Job"
                                "AFTER_HOURS" -> "🌙 After Hours"
                                else -> "🚨 Emergency Only"
                            }
                            Toast.makeText(context, "Status set to $label. AI greeting and triggers updated.", Toast.LENGTH_SHORT).show()
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
    onStatusSelected: (String) -> Unit
) {
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
                    subtitle = if (businessHoursEnabled && isWithinHours) "Active" else "Hands Full",
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

            Spacer(modifier = Modifier.height(10.dp))

            val desc = when (currentStatus) {
                "AFTER_HOURS" -> "🌙 After Hours: AI informs caller the office is closed, captures job needs, and texts booking link for next morning."
                "EMERGENCY" -> "🚨 Emergency Only: AI screens for active leaks or hazards. Routine callers are filtered; emergencies alert you immediately."
                else -> "🟢 Available / On a Job: AI explains you have hands full on a job site, gathers details, and promises a prompt callback."
            }

            Text(
                text = desc,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
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
    onStartTrial: () -> Unit,
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

            Button(
                onClick = onStartTrial,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF9C27B0)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.FlashOn, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Start Turnkey Free Trial ($29/mo)")
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
    var mode by remember { mutableStateOf(settings.vapiMode) }
    var apiKeyInput by remember { mutableStateOf(settings.vapiApiKey) }
    var assistantIdInput by remember { mutableStateOf(settings.vapiAssistantId) }
    var phoneIdInput by remember { mutableStateOf(settings.vapiPhoneNumberId) }
    var forwardNumInput by remember { mutableStateOf(settings.voiceReceptionistForwardingNumber) }
    var greetingInput by remember { mutableStateOf(settings.voiceReceptionistGreeting) }

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
                                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text("Vapi Credentials", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                    OutlinedTextField(
                                        value = apiKeyInput,
                                        onValueChange = { apiKeyInput = it },
                                        label = { Text("Vapi Private API Key") },
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth()
                                    )
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
                                        label = { Text("Phone Number ID") },
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
