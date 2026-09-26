package com.missedcall.autotext.ui.screens

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.missedcall.autotext.data.AppSchedule
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.ui.theme.GrayPaused

/**
 * Dedicated Auto-SMS Configuration Screen
 * Focuses strictly on the core native SIM Auto-SMS appliance features:
 * - Master Appliance Switch
 * - Missed Call SMS Template with dynamic tag chips
 * - Dispatch Timing / Jitter Delay rules
 * - Cooldown Window
 * - Exclude Saved Contacts
 * - Business Hours filter & After-Hours template
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AutoSmsScreen(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit
) {
    val context = LocalContext.current
    var messageTemplateInput by remember(settings.messageTemplate) { mutableStateOf(settings.messageTemplate) }
    var businessNameInput by remember(settings.businessName) { mutableStateOf(settings.businessName) }

    val daysOfWeek = listOf("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY")
    val dayLabels = mapOf(
        "MONDAY" to "Mon",
        "TUESDAY" to "Tue",
        "WEDNESDAY" to "Wed",
        "THURSDAY" to "Thu",
        "FRIDAY" to "Fri",
        "SATURDAY" to "Sat",
        "SUNDAY" to "Sun"
    )

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item { Spacer(modifier = Modifier.height(4.dp)) }

        // 1. Master Switch Card
        item {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = if (settings.masterEnabled) ActiveGreenContainer.copy(alpha = 0.2f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                ),
                border = BorderStroke(
                    1.dp,
                    if (settings.masterEnabled) ActiveGreenText.copy(alpha = 0.5f) else MaterialTheme.colorScheme.outlineVariant
                ),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.PowerSettingsNew,
                                contentDescription = null,
                                tint = if (settings.masterEnabled) ActiveGreenText else GrayPaused,
                                modifier = Modifier.size(22.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = if (settings.masterEnabled) "Auto-SMS Appliance: ACTIVE" else "Auto-SMS Appliance: PAUSED",
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.titleSmall,
                                color = if (settings.masterEnabled) ActiveGreenText else MaterialTheme.colorScheme.onSurface
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = if (settings.masterEnabled) "Automatically replying to missed calls via your phone SIM" else "Missed call text dispatch is currently suspended",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
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
            }
        }

        // 2. Missed Call Auto-Text Template Card
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.ChatBubble, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Missed Call SMS Template", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "This exact text is sent from your Android SIM card whenever a phone call is missed.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(
                        value = messageTemplateInput,
                        onValueChange = {
                            messageTemplateInput = it
                            onSettingsChanged(settings.copy(messageTemplate = it))
                        },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3,
                        maxLines = 5,
                        label = { Text("SMS Message Template") },
                        placeholder = { Text("Hey! Sorry I missed your call. How can I help you today? - {business_name}") }
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    Text("Tap variable chip to insert:", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(6.dp))

                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        AssistChip(
                            onClick = {
                                val updated = if (messageTemplateInput.contains("{business_name}")) messageTemplateInput else "$messageTemplateInput - {business_name}"
                                messageTemplateInput = updated
                                onSettingsChanged(settings.copy(messageTemplate = updated))
                            },
                            label = { Text("{business_name}") },
                            leadingIcon = { Icon(Icons.Default.Business, contentDescription = null, modifier = Modifier.size(14.dp)) }
                        )

                        AssistChip(
                            onClick = {
                                val resetVal = "Hey! Sorry I missed your call. How can I help you today? - {business_name}"
                                messageTemplateInput = resetVal
                                onSettingsChanged(settings.copy(messageTemplate = resetVal))
                                Toast.makeText(context, "Template reset to default", Toast.LENGTH_SHORT).show()
                            },
                            label = { Text("Reset to Default") },
                            leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(14.dp)) }
                        )
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    OutlinedTextField(
                        value = businessNameInput,
                        onValueChange = {
                            businessNameInput = it
                            onSettingsChanged(settings.copy(businessName = it))
                        },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Business Name (replaces {business_name})") },
                        singleLine = true
                    )
                }
            }
        }

        // 3. Dispatch Timing & Jitter Delay Rules Card
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Timer, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Dispatch Timing & Natural Delay", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                    }

                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        "Adds human pacing before the SMS fires. Avoids instant robotic delivery and protects your carrier SIM from velocity filters.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Delay Before Texting:", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.primaryContainer
                        ) {
                            Text(
                                text = if (settings.jitterDelaySeconds == 0) "Instant (0s)" else "${settings.jitterDelaySeconds} Seconds",
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                    }

                    Slider(
                        value = settings.jitterDelaySeconds.toFloat(),
                        onValueChange = { onSettingsChanged(settings.copy(jitterDelaySeconds = it.toInt())) },
                        valueRange = 0f..60f,
                        steps = 11, // 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60
                        modifier = Modifier.fillMaxWidth()
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Instant (0s)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("Recommended (15s)", style = MaterialTheme.typography.labelSmall, color = ActiveGreenText, fontWeight = FontWeight.Bold)
                        Text("60s", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        // 4. Cooldown Window & Exclude Saved Contacts Card
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Security, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Spam & Cooldown Protection", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Exclude Saved Contacts Toggle
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                            Text("Exclude Saved Contacts", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "Never send automated texts to numbers already in your phone contacts (family, friends, suppliers).",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Switch(
                            checked = settings.excludeSavedContacts,
                            onCheckedChange = { onSettingsChanged(settings.copy(excludeSavedContacts = it)) }
                        )
                    }

                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

                    // Cooldown Window Slider
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                            Text("Caller Cooldown Window", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "Prevents repeat auto-texts to the same number within this window.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.primaryContainer
                        ) {
                            Text(
                                text = if (settings.cooldownHours == 0) "Disabled (0 hrs)" else "${settings.cooldownHours} hr(s)",
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                    }

                    Slider(
                        value = settings.cooldownHours.toFloat(),
                        onValueChange = { onSettingsChanged(settings.copy(cooldownHours = it.toInt())) },
                        valueRange = 0f..24f,
                        steps = 23,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("0 hrs (Off)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("4 hrs (Recommended)", style = MaterialTheme.typography.labelSmall, color = ActiveGreenText, fontWeight = FontWeight.Bold)
                        Text("24 hrs", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        // 5. Unified Master Business Hours & Operating Schedule Card
        item {
            var showStartTimeDialog by remember { mutableStateOf(false) }
            var showEndTimeDialog by remember { mutableStateOf(false) }

            val formattedStart = remember(settings.schedule.startTime) {
                com.missedcall.autotext.util.ScheduleUtils.format12Hour(settings.schedule.startTime, 9)
            }
            val formattedEnd = remember(settings.schedule.endTime) {
                com.missedcall.autotext.util.ScheduleUtils.format12Hour(settings.schedule.endTime, 18)
            }

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
                            Icon(Icons.Default.AccessTime, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Master Operating Hours", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                        }
                        Switch(
                            checked = settings.businessHoursEnabled,
                            onCheckedChange = { onSettingsChanged(settings.copy(businessHoursEnabled = it)) }
                        )
                    }

                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = if (settings.businessHoursEnabled)
                            "Master Schedule Active: Governs Auto-SMS dispatch, 24/7 AI Voice reception (*71), and AI appointment booking."
                        else
                            "24/7 Always-Open Mode: Auto-SMS and Voice AI handle callers at all hours of day and night.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    AnimatedVisibility(visible = settings.businessHoursEnabled) {
                        Column(modifier = Modifier.padding(top = 14.dp)) {
                            // Quick Schedule Presets
                            Text("Quick Presets:", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.height(6.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                val standardDays = listOf("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY")
                                val sixDays = listOf("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY")
                                val allSevenDays = daysOfWeek

                                Button(
                                    onClick = {
                                        onSettingsChanged(
                                            settings.copy(
                                                schedule = settings.schedule.copy(
                                                    activeDays = standardDays,
                                                    startTime = "09:00",
                                                    endTime = "17:00"
                                                )
                                            )
                                        )
                                        Toast.makeText(context, "Set to Mon-Fri (9 AM - 5 PM)", Toast.LENGTH_SHORT).show()
                                    },
                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp),
                                    modifier = Modifier.weight(1f),
                                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                                ) {
                                    Text("Mon-Fri (9-5)", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurface)
                                }

                                Button(
                                    onClick = {
                                        onSettingsChanged(
                                            settings.copy(
                                                schedule = settings.schedule.copy(
                                                    activeDays = sixDays,
                                                    startTime = "08:00",
                                                    endTime = "18:00"
                                                )
                                            )
                                        )
                                        Toast.makeText(context, "Set to Mon-Sat (8 AM - 6 PM)", Toast.LENGTH_SHORT).show()
                                    },
                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp),
                                    modifier = Modifier.weight(1f),
                                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                                ) {
                                    Text("Mon-Sat (8-6)", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurface)
                                }

                                Button(
                                    onClick = {
                                        onSettingsChanged(
                                            settings.copy(
                                                schedule = settings.schedule.copy(
                                                    activeDays = allSevenDays,
                                                    startTime = "08:00",
                                                    endTime = "20:00"
                                                )
                                            )
                                        )
                                        Toast.makeText(context, "Set to 7 Days (8 AM - 8 PM)", Toast.LENGTH_SHORT).show()
                                    },
                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp),
                                    modifier = Modifier.weight(1f),
                                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                                ) {
                                    Text("7 Days (8-8)", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurface)
                                }
                            }

                            Spacer(modifier = Modifier.height(14.dp))

                            // Responsive 7-Day Badges (Guaranteed to fit without clipping)
                            Text("Active Operating Days:", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                            Spacer(modifier = Modifier.height(8.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                daysOfWeek.forEach { day ->
                                    val isSelected = settings.schedule.activeDays.contains(day)
                                    Surface(
                                        shape = RoundedCornerShape(10.dp),
                                        color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                                        border = BorderStroke(
                                            1.dp,
                                            if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
                                        ),
                                        modifier = Modifier
                                            .weight(1f)
                                            .clickable {
                                                val currentDays = settings.schedule.activeDays.toMutableList()
                                                if (isSelected) currentDays.remove(day) else currentDays.add(day)
                                                onSettingsChanged(
                                                    settings.copy(schedule = settings.schedule.copy(activeDays = currentDays))
                                                )
                                            }
                                    ) {
                                        Column(
                                            modifier = Modifier.padding(vertical = 8.dp),
                                            horizontalAlignment = Alignment.CenterHorizontally
                                        ) {
                                            Text(
                                                dayLabels[day]?.take(1) ?: "",
                                                fontWeight = FontWeight.Black,
                                                fontSize = 13.sp,
                                                color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                                            )
                                            Text(
                                                dayLabels[day] ?: "",
                                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                                fontSize = 9.sp,
                                                color = if (isSelected) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.85f) else MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(14.dp))

                            // Interactive Time Pickers with 12-Hour Display
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)),
                                    modifier = Modifier
                                        .weight(1f)
                                        .clickable { showStartTimeDialog = true }
                                ) {
                                    Column(modifier = Modifier.padding(12.dp)) {
                                        Text("Opening Time", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Spacer(modifier = Modifier.height(2.dp))
                                        Text(formattedStart, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = MaterialTheme.colorScheme.primary)
                                    }
                                }

                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)),
                                    modifier = Modifier
                                        .weight(1f)
                                        .clickable { showEndTimeDialog = true }
                                ) {
                                    Column(modifier = Modifier.padding(12.dp)) {
                                        Text("Closing Time", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Spacer(modifier = Modifier.height(2.dp))
                                        Text(formattedEnd, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = MaterialTheme.colorScheme.primary)
                                    }
                                }
                            }

                            // Start Time Selection Dialog
                            if (showStartTimeDialog) {
                                AlertDialog(
                                    onDismissRequest = { showStartTimeDialog = false },
                                    title = { Text("Select Opening Time") },
                                    text = {
                                        Column(modifier = Modifier.fillMaxWidth()) {
                                            val options = listOf("06:00", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00")
                                            options.chunked(2).forEach { rowOptions ->
                                                Row(
                                                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                                ) {
                                                    rowOptions.forEach { opt ->
                                                        val label12 = com.missedcall.autotext.util.ScheduleUtils.format12Hour(opt, 9)
                                                        val isCurr = settings.schedule.startTime == opt
                                                        Button(
                                                            onClick = {
                                                                onSettingsChanged(settings.copy(schedule = settings.schedule.copy(startTime = opt)))
                                                                showStartTimeDialog = false
                                                            },
                                                            modifier = Modifier.weight(1f),
                                                            colors = if (isCurr) ButtonDefaults.buttonColors() else ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                                                        ) {
                                                            Text(label12, fontSize = 13.sp, color = if (isCurr) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface)
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    confirmButton = {
                                        TextButton(onClick = { showStartTimeDialog = false }) {
                                            Text("Close")
                                        }
                                    }
                                )
                            }

                            // End Time Selection Dialog
                            if (showEndTimeDialog) {
                                AlertDialog(
                                    onDismissRequest = { showEndTimeDialog = false },
                                    title = { Text("Select Closing Time") },
                                    text = {
                                        Column(modifier = Modifier.fillMaxWidth()) {
                                            val options = listOf("16:00", "17:00", "17:30", "18:00", "18:30", "19:00", "20:00", "21:00")
                                            options.chunked(2).forEach { rowOptions ->
                                                Row(
                                                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                                ) {
                                                    rowOptions.forEach { opt ->
                                                        val label12 = com.missedcall.autotext.util.ScheduleUtils.format12Hour(opt, 18)
                                                        val isCurr = settings.schedule.endTime == opt
                                                        Button(
                                                            onClick = {
                                                                onSettingsChanged(settings.copy(schedule = settings.schedule.copy(endTime = opt)))
                                                                showEndTimeDialog = false
                                                            },
                                                            modifier = Modifier.weight(1f),
                                                            colors = if (isCurr) ButtonDefaults.buttonColors() else ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                                                        ) {
                                                            Text(label12, fontSize = 13.sp, color = if (isCurr) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface)
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    confirmButton = {
                                        TextButton(onClick = { showEndTimeDialog = false }) {
                                            Text("Close")
                                        }
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }

        item { Spacer(modifier = Modifier.height(16.dp)) }
    }
}
