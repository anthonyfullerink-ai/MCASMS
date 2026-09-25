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

        // 5. Business Hours & Operating Schedule Card
        item {
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
                            Text("Business Hours Filter", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                        }
                        Switch(
                            checked = settings.businessHoursEnabled,
                            onCheckedChange = { onSettingsChanged(settings.copy(businessHoursEnabled = it)) }
                        )
                    }

                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = if (settings.businessHoursEnabled)
                            "Auto-SMS only responds during your configured operating hours."
                        else
                            "24/7 Mode: Auto-SMS replies at all times of day and night.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    AnimatedVisibility(visible = settings.businessHoursEnabled) {
                        Column(modifier = Modifier.padding(top = 12.dp)) {
                            Text("Active Operating Days:", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                            Spacer(modifier = Modifier.height(8.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                daysOfWeek.forEach { day ->
                                    val isSelected = settings.schedule.activeDays.contains(day)
                                    FilterChip(
                                        selected = isSelected,
                                        onClick = {
                                            val currentDays = settings.schedule.activeDays.toMutableList()
                                            if (isSelected) currentDays.remove(day) else currentDays.add(day)
                                            onSettingsChanged(
                                                settings.copy(schedule = settings.schedule.copy(activeDays = currentDays))
                                            )
                                        },
                                        label = { Text(dayLabels[day] ?: day, fontSize = 10.sp) },
                                        modifier = Modifier.padding(horizontal = 2.dp)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                OutlinedTextField(
                                    value = settings.schedule.startTime,
                                    onValueChange = { newStart ->
                                        onSettingsChanged(settings.copy(schedule = settings.schedule.copy(startTime = newStart)))
                                    },
                                    modifier = Modifier.weight(1f),
                                    label = { Text("Start (e.g. 09:00)") },
                                    singleLine = true
                                )
                                OutlinedTextField(
                                    value = settings.schedule.endTime,
                                    onValueChange = { newEnd ->
                                        onSettingsChanged(settings.copy(schedule = settings.schedule.copy(endTime = newEnd)))
                                    },
                                    modifier = Modifier.weight(1f),
                                    label = { Text("End (e.g. 18:00)") },
                                    singleLine = true
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
