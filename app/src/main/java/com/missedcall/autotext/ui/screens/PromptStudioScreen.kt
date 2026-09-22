package com.missedcall.autotext.ui.screens

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.ui.theme.PurpleVariant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/**
 * Unified Prompt & AI Messaging Studio
 * Consolidates all SMS auto-replies, voice receptionist greetings, system personas,
 * triage rules, and post-call summaries into one intuitive screen.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PromptStudioScreen(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var selectedStudioTab by remember { mutableIntStateOf(0) }

    val defaultMissedCallTemplate = "Hey! Sorry I missed your call. How can I help you today? - {business_name}"
    val defaultPostCallTemplate = "Hey {NAME}, this is {BUSINESS_NAME}. My AI assistant let me know about {SUMMARY}. I am wrapping up on a job and will reach out to you shortly!"

    /**
     * Pushes an updated greeting + activity to the server's /api/vapi/custom-greeting endpoint.
     * Called immediately when the user taps a busy-status chip or saves the greeting field.
     */
    suspend fun pushGreetingToVapi(newSettings: AppSettings) {
        withContext(Dispatchers.IO) {
            try {
                val endpoint = if (newSettings.remoteUpdateUrl.contains("localhost") || newSettings.remoteUpdateUrl.contains("10.0.")) {
                    "http://10.0.2.2:8000/api/vapi/custom-greeting"
                } else {
                    "https://missedcallautosms.com/api/vapi/custom-greeting"
                }
                val url = URL(endpoint)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.connectTimeout = 6000
                conn.readTimeout = 6000
                val safeBusiness = newSettings.businessName.replace("\"", "\\\"")
                val safeGreeting = newSettings.voiceReceptionistGreeting
                    .ifBlank { "Thanks for calling $safeBusiness! Everyone currently has their ${newSettings.contractorActivity.ifBlank { "hands full" }}, but I'm ${newSettings.voiceAgentName.ifBlank { "Riley" }}, your AI receptionist. How can I help?" }
                    .replace("\"", "\\\"")
                val safeActivity = newSettings.contractorActivity.replace("\"", "\\\"")
                val payload = """{"businessName":"$safeBusiness","customGreeting":"$safeGreeting","contractorActivity":"$safeActivity","agentName":"${newSettings.voiceAgentName.replace("\"","\\\"") }"}"""
                conn.outputStream.use { it.write(payload.toByteArray(StandardCharsets.UTF_8)) }
                conn.responseCode
            } catch (_: Exception) { /* silent fail — offline or local fallback */ }
        }
    }


    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Prompt & AI Studio",
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = "One Unified Hub for SMS & AI Voice Personality",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Secondary Segmented Navigation for Studio Sections
            TabRow(
                selectedTabIndex = selectedStudioTab,
                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
            ) {
                Tab(
                    selected = selectedStudioTab == 0,
                    onClick = { selectedStudioTab = 0 },
                    text = { Text("1. Missed Call SMS", fontSize = 12.sp, fontWeight = FontWeight.SemiBold) },
                    icon = { Icon(Icons.Default.ChatBubble, contentDescription = null, modifier = Modifier.size(18.dp)) }
                )
                Tab(
                    selected = selectedStudioTab == 1,
                    onClick = { selectedStudioTab = 1 },
                    text = { Text("2. AI Voice Persona", fontSize = 12.sp, fontWeight = FontWeight.SemiBold) },
                    icon = { Icon(Icons.Default.RecordVoiceOver, contentDescription = null, modifier = Modifier.size(18.dp)) }
                )
                Tab(
                    selected = selectedStudioTab == 2,
                    onClick = { selectedStudioTab = 2 },
                    text = { Text("3. Post-Call SMS", fontSize = 12.sp, fontWeight = FontWeight.SemiBold) },
                    icon = { Icon(Icons.Default.AutoAwesome, contentDescription = null, modifier = Modifier.size(18.dp)) }
                )
            }

            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // TAB 0: MISSED CALL SMS TEMPLATE
                if (selectedStudioTab == 0) {
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Sms, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "Instant Missed Call Auto-Text (SIM SMS)",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "This text is dispatched directly from your Android phone's real SIM card within 5–15 seconds of a missed call. Bypasses carrier A2P 10DLC registration.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )

                                Spacer(modifier = Modifier.height(14.dp))
                                Text(
                                    text = "Tap tag to insert into template:",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                FlowRow(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    PromptTagChip("+ {business_name}") {
                                        onSettingsChanged(settings.copy(messageTemplate = settings.messageTemplate + " {business_name}"))
                                    }
                                    PromptTagChip("+ {name}") {
                                        onSettingsChanged(settings.copy(messageTemplate = settings.messageTemplate + " {name}"))
                                    }
                                    PromptTagChip("+ {activity}") {
                                        onSettingsChanged(settings.copy(messageTemplate = settings.messageTemplate + " {activity}"))
                                    }
                                    PromptTagChip("+ {booking_link}") {
                                        onSettingsChanged(settings.copy(messageTemplate = settings.messageTemplate + " {booking_link}"))
                                    }
                                }

                                Spacer(modifier = Modifier.height(12.dp))
                                OutlinedTextField(
                                    value = settings.messageTemplate,
                                    onValueChange = { onSettingsChanged(settings.copy(messageTemplate = it)) },
                                    label = { Text("Missed Call SMS Template") },
                                    modifier = Modifier.fillMaxWidth(),
                                    minLines = 3,
                                    maxLines = 6
                                )

                                Spacer(modifier = Modifier.height(10.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    TextButton(onClick = {
                                        onSettingsChanged(settings.copy(messageTemplate = defaultMissedCallTemplate))
                                        Toast.makeText(context, "Reset to standard template", Toast.LENGTH_SHORT).show()
                                    }) {
                                        Text("Reset to High-Converting Default", fontSize = 12.sp)
                                    }

                                    Text(
                                        text = "${settings.messageTemplate.length} chars (~1 SMS)",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }

                    // Live SMS Simulation Bubble
                    item {
                        SmsPreviewChatCard(
                            senderTitle = "Caller Phone Screen (Live Preview)",
                            message = settings.messageTemplate
                                .replace("{business_name}", settings.businessName.ifBlank { "Apex Services" })
                                .replace("{name}", "Sarah")
                                .replace("{activity}", settings.contractorActivity.ifBlank { "hands full" })
                                .replace("{booking_link}", settings.contractorGoalLink.ifBlank { "https://cal.com/apex-quote" })
                        )
                    }
                }

                // TAB 1: AI VOICE RECEPTIONIST PERSONA & GREETING
                if (selectedStudioTab == 1) {
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.RecordVoiceOver, contentDescription = null, tint = PurpleVariant)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "AI Voice Receptionist Identity & Persona",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "When *71 conditional forwarding rings to AI, Riley answers your callers, qualifies high-ticket leads, and triages emergencies.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )

                                Spacer(modifier = Modifier.height(14.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    OutlinedTextField(
                                        value = settings.voiceAgentName,
                                        onValueChange = { onSettingsChanged(settings.copy(voiceAgentName = it)) },
                                        label = { Text("AI Assistant Name") },
                                        singleLine = true,
                                        modifier = Modifier.weight(1f)
                                    )
                                    OutlinedTextField(
                                        value = settings.voiceIndustryTrade,
                                        onValueChange = { onSettingsChanged(settings.copy(voiceIndustryTrade = it)) },
                                        label = { Text("Trade / Business Industry") },
                                        singleLine = true,
                                        modifier = Modifier.weight(1f)
                                    )
                                }

                                Spacer(modifier = Modifier.height(12.dp))
                                var isSavingGreeting by remember { mutableStateOf(false) }
                                OutlinedTextField(
                                    value = settings.voiceReceptionistGreeting,
                                    onValueChange = { onSettingsChanged(settings.copy(voiceReceptionistGreeting = it)) },
                                    label = { Text("First Spoken Greeting (Optional Custom)") },
                                    placeholder = {
                                        Text("Thanks for calling ${settings.businessName.ifBlank { "our office" }}! My name is ${settings.voiceAgentName.ifBlank { "Riley" }}. How can I assist you today?")
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                    minLines = 2,
                                    maxLines = 4
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Button(
                                    onClick = {
                                        isSavingGreeting = true
                                        coroutineScope.launch {
                                            pushGreetingToVapi(settings)
                                            withContext(Dispatchers.Main) {
                                                isSavingGreeting = false
                                                Toast.makeText(context, "✅ Greeting saved & pushed to AI!", Toast.LENGTH_SHORT).show()
                                            }
                                        }
                                    },
                                    enabled = !isSavingGreeting,
                                    modifier = Modifier.align(Alignment.End)
                                ) {
                                    if (isSavingGreeting) {
                                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("Saving...")
                                    } else {
                                        Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("Save Greeting")
                                    }
                                }

                                Spacer(modifier = Modifier.height(14.dp))

                                Text(
                                    text = "Current Busy Status / Activity Phrase:",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = "Tap to update — instantly changes what Riley tells callers.",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                FlowRow(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    StatusActivityChip("Hands Full", settings.contractorActivity) {
                                        val updated = settings.copy(contractorActivity = "Hands Full")
                                        onSettingsChanged(updated)
                                        coroutineScope.launch {
                                            pushGreetingToVapi(updated)
                                            withContext(Dispatchers.Main) {
                                                Toast.makeText(context, "🤙 Status updated: Hands Full", Toast.LENGTH_SHORT).show()
                                            }
                                        }
                                    }
                                    StatusActivityChip("On a Job", settings.contractorActivity) {
                                        val updated = settings.copy(contractorActivity = "on a job")
                                        onSettingsChanged(updated)
                                        coroutineScope.launch {
                                            pushGreetingToVapi(updated)
                                            withContext(Dispatchers.Main) {
                                                Toast.makeText(context, "🔧 Status updated: On a Job", Toast.LENGTH_SHORT).show()
                                            }
                                        }
                                    }
                                    StatusActivityChip("In Consultation", settings.contractorActivity) {
                                        val updated = settings.copy(contractorActivity = "in a consultation")
                                        onSettingsChanged(updated)
                                        coroutineScope.launch {
                                            pushGreetingToVapi(updated)
                                            withContext(Dispatchers.Main) {
                                                Toast.makeText(context, "💬 Status updated: In Consultation", Toast.LENGTH_SHORT).show()
                                            }
                                        }
                                    }
                                    StatusActivityChip("After Hours", settings.contractorActivity) {
                                        val updated = settings.copy(contractorActivity = "closed for the day")
                                        onSettingsChanged(updated)
                                        coroutineScope.launch {
                                            pushGreetingToVapi(updated)
                                            withContext(Dispatchers.Main) {
                                                Toast.makeText(context, "🌙 Status updated: After Hours", Toast.LENGTH_SHORT).show()
                                            }
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.height(14.dp))
                                OutlinedTextField(
                                    value = settings.voiceEmergencyKeywords,
                                    onValueChange = { onSettingsChanged(settings.copy(voiceEmergencyKeywords = it)) },
                                    label = { Text("Emergency Triage Keywords (Comma Separated)") },
                                    modifier = Modifier.fillMaxWidth(),
                                    singleLine = false
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "Keywords that trigger high-priority alerts and emergency follow-up logic.",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }

                    // Voice Spoken Simulation Card
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1B4B).copy(alpha = 0.6f)),
                            border = BorderStroke(1.dp, Color(0xFF6366F1).copy(alpha = 0.5f)),
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.VolumeUp, contentDescription = null, tint = Color(0xFFA5B4FC))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "Spoken Audio Simulation",
                                        fontWeight = FontWeight.Bold,
                                        style = MaterialTheme.typography.titleSmall,
                                        color = Color.White
                                    )
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                val simulatedGreeting = if (settings.voiceReceptionistGreeting.isNotBlank()) {
                                    settings.voiceReceptionistGreeting
                                } else {
                                    "Thanks for calling ${settings.businessName.ifBlank { "our team" }}! Everyone currently has their ${settings.contractorActivity.ifBlank { "hands full" }}, but I'm ${settings.voiceAgentName.ifBlank { "Riley" }}, the AI receptionist. I can book your appointment or notify the crew immediately. What service do you need?"
                                }
                                Text(
                                    text = "\"$simulatedGreeting\"",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = Color(0xFFE0E7FF)
                                )
                            }
                        }
                    }
                }

                // TAB 2: POST-CALL SUMMARY SMS
                if (selectedStudioTab == 2) {
                    item {
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
                                        Icon(Icons.Default.SendToMobile, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = "AI Post-Call SMS Dispatch",
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                    Switch(
                                        checked = settings.postCallSmsEnabled,
                                        onCheckedChange = { onSettingsChanged(settings.copy(postCallSmsEnabled = it)) }
                                    )
                                }

                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "Automatically texts the caller from your real phone SIM line immediately after they hang up with your AI voice receptionist.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )

                                Spacer(modifier = Modifier.height(14.dp))
                                Text(
                                    text = "Tap tag to insert into template:",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                FlowRow(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    PromptTagChip("+ {NAME}") {
                                        onSettingsChanged(settings.copy(postCallSmsTemplate = settings.postCallSmsTemplate + " {NAME}"))
                                    }
                                    PromptTagChip("+ {SUMMARY}") {
                                        onSettingsChanged(settings.copy(postCallSmsTemplate = settings.postCallSmsTemplate + " {SUMMARY}"))
                                    }
                                    PromptTagChip("+ {AGENT_NAME}") {
                                        onSettingsChanged(settings.copy(postCallSmsTemplate = settings.postCallSmsTemplate + " {AGENT_NAME}"))
                                    }
                                    PromptTagChip("+ {BOOKING_LINK}") {
                                        onSettingsChanged(settings.copy(postCallSmsTemplate = settings.postCallSmsTemplate + " {BOOKING_LINK}"))
                                    }
                                }

                                Spacer(modifier = Modifier.height(12.dp))
                                OutlinedTextField(
                                    value = settings.postCallSmsTemplate,
                                    onValueChange = { onSettingsChanged(settings.copy(postCallSmsTemplate = it)) },
                                    label = { Text("Post-Call SMS Template") },
                                    modifier = Modifier.fillMaxWidth(),
                                    minLines = 3,
                                    maxLines = 6
                                )

                                Spacer(modifier = Modifier.height(10.dp))
                                OutlinedTextField(
                                    value = settings.contractorGoalLink,
                                    onValueChange = { onSettingsChanged(settings.copy(contractorGoalLink = it)) },
                                    label = { Text("Booking / Quote URL ({BOOKING_LINK})") },
                                    placeholder = { Text("https://cal.com/apex-booking") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth()
                                )

                                Spacer(modifier = Modifier.height(12.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "Emergency Calls Only",
                                            fontWeight = FontWeight.SemiBold,
                                            style = MaterialTheme.typography.bodyMedium
                                        )
                                        Text(
                                            text = "Only send follow-up SMS if the caller mentioned an urgent triage keyword.",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Switch(
                                        checked = settings.postCallEmergencyOnly,
                                        onCheckedChange = { onSettingsChanged(settings.copy(postCallEmergencyOnly = it)) }
                                    )
                                }
                            }
                        }
                    }

                    // Live Post-Call SMS Preview Bubble
                    item {
                        SmsPreviewChatCard(
                            senderTitle = "Caller Phone Screen (Post-Call SMS Preview)",
                            message = settings.postCallSmsTemplate
                                .replace("{NAME}", "Marcus")
                                .replace("{BUSINESS_NAME}", settings.businessName.ifBlank { "Apex Services" })
                                .replace("{AGENT_NAME}", settings.voiceAgentName.ifBlank { "Riley" })
                                .replace("{SUMMARY}", "water heater leaking in basement")
                                .replace("{BOOKING_LINK}", settings.contractorGoalLink.ifBlank { "https://cal.com/apex-booking" })
                        )
                    }
                }

                item { Spacer(modifier = Modifier.height(16.dp)) }
            }
        }
    }
}

@Composable
private fun PromptTagChip(
    label: String,
    onClick: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.7f),
        modifier = Modifier.clickable { onClick() }
    ) {
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

@Composable
private fun StatusActivityChip(
    label: String,
    currentActivity: String,
    onClick: () -> Unit
) {
    val isSelected = currentActivity.equals(label, ignoreCase = true)
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = if (isSelected) PurpleVariant.copy(alpha = 0.25f) else MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, if (isSelected) PurpleVariant else MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.clickable { onClick() }
    ) {
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
            color = if (isSelected) PurpleVariant else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp)
        )
    }
}

@Composable
private fun SmsPreviewChatCard(
    senderTitle: String,
    message: String
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.PhoneAndroid, contentDescription = null, tint = ActiveGreenText, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = senderTitle,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Realistic Chat Bubble
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Start
            ) {
                Surface(
                    shape = RoundedCornerShape(topStart = 4.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 16.dp),
                    color = ActiveGreenContainer.copy(alpha = 0.35f),
                    border = BorderStroke(1.dp, ActiveGreenText.copy(alpha = 0.3f)),
                    modifier = Modifier.fillMaxWidth(0.92f)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            text = message,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Just now • Sent via Carrier SIM",
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
