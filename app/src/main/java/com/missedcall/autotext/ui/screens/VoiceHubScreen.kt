package com.missedcall.autotext.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.speech.tts.TextToSpeech
import android.widget.Toast
import java.util.Locale
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.missedcall.autotext.App
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.data.db.VoiceCallEvent
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.ui.theme.AmberWarning
import com.missedcall.autotext.util.CarrierForwardingManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/**
 * Complete AI Voice Receptionist Studio
 * Central command center where users customize all aspects of their dedicated Vapi AI agent:
 * - Assigned Inbound Line & 1-Tap Carrier Forwarding (*71 / *73)
 * - Intro Greeting (First Message spoken upon connection)
 * - System Persona & Prompt Editor with Trade Templates
 * - AI Model Selector (GPT-4o-mini, GPT-4o, Claude 3.5) & Temperature Slider
 * - Voice Profile Settings (Cartesia / ElevenLabs voices)
 * - Function Calls & Emergency Triage Triggers
 * - Post-Call Authentic SIM SMS
 * - Live Cloud Sync to Vapi backend via /api/vapi/user-assistant
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun VoiceHubScreen(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit,
    voiceCalls: List<VoiceCallEvent>,
    onMarkVoiceCallRead: (Long) -> Unit,
    onClearVoiceCalls: () -> Unit,
    onNavigateToPrompts: () -> Unit = {}
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    val isDeveloperKey = settings.licenseKey.contains("DEV", ignoreCase = true) ||
            settings.licenseKey.startsWith("MCAS-DEV") ||
            settings.licenseKey.contains("DEMO", ignoreCase = true) ||
            settings.licenseKey.contains("MASTER", ignoreCase = true)

    val isVoiceActive = isDeveloperKey || settings.voiceSubscriptionActive ||
            settings.voiceReceptionistEnabled || settings.licenseKey.contains("VOICE", ignoreCase = true)

    val carrier = remember { CarrierForwardingManager.detectCarrier(context) }
    val carrierCodes = remember(carrier, settings.voiceReceptionistForwardingNumber) {
        CarrierForwardingManager.computeCodes(carrier, settings.voiceReceptionistForwardingNumber)
    }

    // Studio Editing State
    var firstMessageInput by remember(settings.voiceReceptionistGreeting) {
        mutableStateOf(
            settings.voiceReceptionistGreeting.ifBlank {
                "Thanks for calling ${settings.businessName}! How can I help you today?"
            }
        )
    }

    var systemPromptInput by remember(settings.vapiPrompt) {
        mutableStateOf(
            settings.vapiPrompt.ifBlank {
                "You are Riley, a friendly and professional AI receptionist for ${settings.businessName}. Warmly answer incoming calls, find out how you can help the caller, capture their name, phone number, and service need, and let them know someone from the team will reach out shortly."
            }
        )
    }

    var selectedModel by remember(settings.vapiModel) {
        mutableStateOf(settings.vapiModel.ifBlank { "gpt-4o-mini" })
    }

    var temperatureVal by remember(settings.vapiTemperature) {
        mutableFloatStateOf(settings.vapiTemperature)
    }

    var selectedVoice by remember(settings.vapiVoiceId) {
        mutableStateOf(settings.vapiVoiceId.ifBlank { "Riley (Natural Female)" })
    }

    var contractorGoalLinkInput by remember(settings.contractorGoalLink) {
        mutableStateOf(settings.contractorGoalLink)
    }

    var emergencyKeywordsInput by remember(settings.voiceEmergencyKeywords) {
        mutableStateOf(settings.voiceEmergencyKeywords)
    }

    var postCallTemplateInput by remember(settings.postCallSmsTemplate) {
        mutableStateOf(settings.postCallSmsTemplate)
    }

    var isSavingToVapi by remember { mutableStateOf(false) }
    var saveStatusMessage by remember { mutableStateOf<String?>(null) }
    var selectedCallForDetail by remember { mutableStateOf<VoiceCallEvent?>(null) }
    var showTestCallDialog by remember { mutableStateOf(false) }
    var testPhoneNumberInput by remember { mutableStateOf("") }
    var isPlacingOutboundCall by remember { mutableStateOf(false) }
    var testCallDialogStatus by remember { mutableStateOf<String?>(null) }
    var tts by remember { mutableStateOf<TextToSpeech?>(null) }

    DisposableEffect(context) {
        var localTts: TextToSpeech? = null
        localTts = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                localTts?.language = Locale.US
            }
        }
        tts = localTts
        onDispose {
            localTts.stop()
            localTts.shutdown()
        }
    }

    // Fetch live assistant data from backend on first launch
    LaunchedEffect(settings.licenseKey) {
        if (settings.licenseKey.isBlank()) return@LaunchedEffect
        withContext(Dispatchers.IO) {
            try {
                val endpoint = if (settings.remoteUpdateUrl.contains("localhost") || settings.remoteUpdateUrl.contains("10.0.")) {
                    "http://10.0.2.2:8000/api/vapi/user-assistant?key=${settings.licenseKey}"
                } else {
                    "https://missedcallautosms.com/api/vapi/user-assistant?key=${settings.licenseKey}"
                }
                val url = URL(endpoint)
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 4000
                    readTimeout = 4000
                }
                if (conn.responseCode == 200) {
                    val body = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(body)
                    if (json.optBoolean("success", false)) {
                        val asst = json.optJSONObject("assistant")
                        val fwdNum = json.optString("forwardingNumber", "")
                        withContext(Dispatchers.Main) {
                            if (fwdNum.isNotBlank() && fwdNum != settings.voiceReceptionistForwardingNumber) {
                                onSettingsChanged(settings.copy(voiceReceptionistForwardingNumber = fwdNum))
                            }
                            if (asst != null) {
                                val serverPrompt = asst.optString("systemPrompt", "")
                                val serverFirstMsg = asst.optString("firstMessage", "")
                                val serverTemp = asst.optDouble("temperature", 0.3).toFloat()
                                val serverModel = asst.optString("model", "gpt-4o-mini")
                                if (serverPrompt.isNotBlank()) systemPromptInput = serverPrompt
                                if (serverFirstMsg.isNotBlank()) firstMessageInput = serverFirstMsg
                                temperatureVal = serverTemp
                                selectedModel = serverModel
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                // Background fetch note
            }
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item { Spacer(modifier = Modifier.height(4.dp)) }

        // 1. Assigned Inbound Line & 1-Tap Carrier Forwarding (*71 / *73)
        item {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = Color(0xFF673AB7).copy(alpha = 0.12f)
                ),
                border = BorderStroke(1.dp, Color(0xFF9C27B0).copy(alpha = 0.4f)),
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
                            Icon(Icons.Default.PhoneCallback, contentDescription = null, tint = Color(0xFFAB47BC), modifier = Modifier.size(22.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Assigned Inbound AI Line", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                        }
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFF673AB7).copy(alpha = 0.25f)
                        ) {
                            Text(
                                text = "DEDICATED VAPI LINE",
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFCE93D8)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Text(
                        text = settings.voiceReceptionistForwardingNumber.ifBlank { "+1 (732) 660-9121" },
                        style = MaterialTheme.typography.titleLarge,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )

                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Unanswered calls forward to this line via your carrier (*71). AI answers immediately, captures customer details, and sends you instant alerts.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = {
                                try {
                                    val dialCode = carrierCodes.activateCode
                                    val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(dialCode)}"))
                                    context.startActivity(intent)
                                } catch (e: Exception) {
                                    Toast.makeText(context, "Could not open dialer", Toast.LENGTH_SHORT).show()
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF673AB7)),
                            modifier = Modifier.weight(1.2f)
                        ) {
                            Icon(Icons.Default.Call, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Dial *71 Activate", fontWeight = FontWeight.Bold)
                        }

                        OutlinedButton(
                            onClick = {
                                try {
                                    val deactCode = carrierCodes.deactivateCode
                                    val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(deactCode)}"))
                                    context.startActivity(intent)
                                } catch (e: Exception) {
                                    Toast.makeText(context, "Could not open dialer", Toast.LENGTH_SHORT).show()
                                }
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Revert (*73)")
                        }
                    }
                }
            }
        }

        // 2. First Message / Intro Spoken Greeting
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.RecordVoiceOver, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Intro Greeting (First Spoken Message)", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "The very first sentence your AI speaks as soon as an incoming call connects.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    OutlinedTextField(
                        value = firstMessageInput,
                        onValueChange = {
                            firstMessageInput = it
                            onSettingsChanged(settings.copy(voiceReceptionistGreeting = it))
                        },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                        maxLines = 4,
                        label = { Text("Spoken Intro Greeting") }
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        AssistChip(
                            onClick = {
                                val g = "Thanks for calling ${settings.businessName}! How can I help you today?"
                                firstMessageInput = g
                                onSettingsChanged(settings.copy(voiceReceptionistGreeting = g))
                            },
                            label = { Text("Contractor Standard") }
                        )
                        AssistChip(
                            onClick = {
                                val g = "Hi! You've reached ${settings.businessName}. Are you calling for a new service quote or an existing job?"
                                firstMessageInput = g
                                onSettingsChanged(settings.copy(voiceReceptionistGreeting = g))
                            },
                            label = { Text("Lead Capture") }
                        )
                        AssistChip(
                            onClick = {
                                val g = "Hi, thank you for calling ${settings.businessName}! Everyone is currently on a job, but I can help schedule your service right now."
                                firstMessageInput = g
                                onSettingsChanged(settings.copy(voiceReceptionistGreeting = g))
                            },
                            label = { Text("Hands Full") }
                        )
                    }
                }
            }
        }

        // 3. AI Persona & System Prompt Editor
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("AI Receptionist Persona & Instructions", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Give instructions, policies, and behavior rules to your AI receptionist.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    OutlinedTextField(
                        value = systemPromptInput,
                        onValueChange = {
                            systemPromptInput = it
                            onSettingsChanged(settings.copy(vapiPrompt = it))
                        },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 6,
                        maxLines = 14,
                        label = { Text("System Prompt & Instructions") }
                    )

                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Insert Preset Template:", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(6.dp))

                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        FilterChip(
                            selected = false,
                            onClick = {
                                val t = "You are Riley, a professional AI receptionist for ${settings.businessName}. We specialize in home services, plumbing, HVAC, and electrical repairs. Greet callers warmly, determine their urgent service issue, collect their name and address, reassure them that a certified tech will call them within 15 minutes, and offer to send our booking link."
                                systemPromptInput = t
                                onSettingsChanged(settings.copy(vapiPrompt = t))
                            },
                            label = { Text("Trades / Contractor") }
                        )
                        FilterChip(
                            selected = false,
                            onClick = {
                                val t = "You are Riley, an after-hours triage agent for ${settings.businessName}. Inquire if the caller is experiencing an active emergency (leak, flooding, no heat, or power outage). If it is an emergency, mark it high priority and promise an immediate technician callback. If routine, offer next-day scheduling."
                                systemPromptInput = t
                                onSettingsChanged(settings.copy(vapiPrompt = t))
                            },
                            label = { Text("24/7 Emergency Triage") }
                        )
                        FilterChip(
                            selected = false,
                            onClick = {
                                val t = "You are Riley, a friendly digital receptionist for ${settings.businessName}. Answer questions about our hours and services, take accurate messages, verify the caller's phone number, and let them know the owner will reach out shortly."
                                systemPromptInput = t
                                onSettingsChanged(settings.copy(vapiPrompt = t))
                            },
                            label = { Text("General Business") }
                        )
                    }
                }
            }
        }

        // 4. AI Model Selector & Temperature Slider
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Tune, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("AI Model & Temperature", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Text("AI Language Model:", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(6.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        FilterChip(
                            selected = selectedModel == "gpt-4o-mini",
                            onClick = {
                                selectedModel = "gpt-4o-mini"
                                onSettingsChanged(settings.copy(vapiModel = "gpt-4o-mini"))
                            },
                            label = { Text("GPT-4o-mini (Included)") },
                            modifier = Modifier.weight(1f)
                        )
                        FilterChip(
                            selected = selectedModel == "gpt-4o",
                            onClick = {
                                selectedModel = "gpt-4o"
                                onSettingsChanged(settings.copy(vapiModel = "gpt-4o"))
                            },
                            label = { Text("GPT-4o (Premium LLM)") },
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = if (selectedModel == "gpt-4o") {
                            "⚡ Frontier model with deep reasoning. +1.5% markup applies strictly to overage minutes if quota is exceeded."
                        } else {
                            "⚡ Recommended default: <300ms ultra-low latency, zero hallucinations, included at standard rate ($0.20/min overage)."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = if (selectedModel == "gpt-4o") Color(0xFFCE93D8) else ActiveGreenText
                    )

                    Spacer(modifier = Modifier.height(14.dp))

                    // Temperature Slider
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Creativity / Temperature:", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                            Text(
                                text = if (temperatureVal <= 0.2f) "Strict & Deterministic" else if (temperatureVal <= 0.5f) "Balanced & Professional" else "Warm & Conversational",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.primaryContainer
                        ) {
                            Text(
                                text = String.format("%.2f", temperatureVal),
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                    }

                    Slider(
                        value = temperatureVal,
                        onValueChange = {
                            temperatureVal = it
                            onSettingsChanged(settings.copy(vapiTemperature = it))
                        },
                        valueRange = 0.0f..1.0f,
                        steps = 9,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("0.0 (Strict)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("0.3 (Recommended)", style = MaterialTheme.typography.labelSmall, color = ActiveGreenText, fontWeight = FontWeight.Bold)
                        Text("1.0 (Creative)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        // 5. Voice Profile & Personality
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Hearing, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Voice Profile & Audio Persona", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Select the spoken voice timbre and tone used by the AI.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        FilterChip(
                            selected = selectedVoice.contains("Riley") || selectedVoice.contains("Female"),
                            onClick = {
                                selectedVoice = "Riley (Natural Female)"
                                onSettingsChanged(settings.copy(vapiVoiceId = "248be419-c632-4f23-adf1-5324ed7dbf10", vapiVoiceProvider = "cartesia"))
                            },
                            label = { Text("Riley (Female)") },
                            modifier = Modifier.weight(1f)
                        )
                        FilterChip(
                            selected = selectedVoice.contains("Austin") || selectedVoice.contains("Male"),
                            onClick = {
                                selectedVoice = "Austin (Professional Male)"
                                onSettingsChanged(settings.copy(vapiVoiceId = "a0e998e3-182d-4f23-adf1-5324ed7dbf11", vapiVoiceProvider = "cartesia"))
                            },
                            label = { Text("Austin (Male)") },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }

        // 6. Function Calls, Triggers & Emergency Rules
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Bolt, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Triggers, Functions & Triage Rules", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Booking Link Trigger
                    OutlinedTextField(
                        value = contractorGoalLinkInput,
                        onValueChange = {
                            contractorGoalLinkInput = it
                            onSettingsChanged(settings.copy(contractorGoalLink = it))
                        },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Online Booking / Quote Link (Optional)") },
                        placeholder = { Text("https://yourcompany.com/book") },
                        singleLine = true
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    // Emergency Keywords Trigger
                    OutlinedTextField(
                        value = emergencyKeywordsInput,
                        onValueChange = {
                            emergencyKeywordsInput = it
                            onSettingsChanged(settings.copy(voiceEmergencyKeywords = it))
                        },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Emergency Triage Keywords (Comma separated)") },
                        placeholder = { Text("leak, flooding, no heat, sparking, pipe burst") }
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    // Post-Call Authentic SIM SMS
                    Text("Post-Call SIM SMS Follow-Up:", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                    Text("Sent automatically from your real SIM phone number as soon as the AI hangs up.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(6.dp))

                    OutlinedTextField(
                        value = postCallTemplateInput,
                        onValueChange = {
                            postCallTemplateInput = it
                            onSettingsChanged(settings.copy(postCallSmsTemplate = it))
                        },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                        maxLines = 4,
                        label = { Text("Follow-Up Text Template") }
                    )
                }
            }
        }

        // 7. SAVE TO VAPI CLOUD BUTTON
        item {
            Button(
                onClick = {
                    isSavingToVapi = true
                    saveStatusMessage = null
                    coroutineScope.launch(Dispatchers.IO) {
                        try {
                            val endpoint = if (settings.remoteUpdateUrl.contains("localhost") || settings.remoteUpdateUrl.contains("10.0.")) {
                                "http://10.0.2.2:8000/api/vapi/user-assistant"
                            } else {
                                "https://missedcallautosms.com/api/vapi/user-assistant"
                            }
                            val url = URL(endpoint)
                            val conn = (url.openConnection() as HttpURLConnection).apply {
                                requestMethod = "POST"
                                connectTimeout = 8000
                                readTimeout = 8000
                                doOutput = true
                                setRequestProperty("Content-Type", "application/json")
                                val payload = JSONObject().apply {
                                    put("licenseKey", settings.licenseKey)
                                    put("firstMessage", firstMessageInput)
                                    put("systemPrompt", systemPromptInput)
                                    put("model", selectedModel)
                                    put("temperature", temperatureVal)
                                    put("voiceProvider", "cartesia")
                                    put("voiceId", if (selectedVoice.contains("Austin")) "a0e998e3-182d-4f23-adf1-5324ed7dbf11" else "248be419-c632-4f23-adf1-5324ed7dbf10")
                                }
                                outputStream.use { os -> os.write(payload.toString().toByteArray(StandardCharsets.UTF_8)) }
                            }

                            val code = conn.responseCode
                            withContext(Dispatchers.Main) {
                                isSavingToVapi = false
                                if (code in 200..299) {
                                    saveStatusMessage = "✅ Assistant Settings Saved & Synced Live!"
                                    Toast.makeText(context, "AI Voice Assistant Synced Live!", Toast.LENGTH_SHORT).show()
                                } else {
                                    saveStatusMessage = "⚠️ Saved locally (Vapi Cloud returned HTTP $code)"
                                }
                            }
                        } catch (e: Exception) {
                            withContext(Dispatchers.Main) {
                                isSavingToVapi = false
                                saveStatusMessage = "Saved locally on device (Offline: ${e.message})"
                            }
                        }
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF673AB7)),
                modifier = Modifier.fillMaxWidth(),
                enabled = !isSavingToVapi
            ) {
                if (isSavingToVapi) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.White)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Saving Live to Vapi Cloud...")
                } else {
                    Icon(Icons.Default.CloudUpload, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Save & Sync AI Voice Agent", fontWeight = FontWeight.Bold)
                }
            }

            saveStatusMessage?.let { msg ->
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = msg,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (msg.startsWith("✅")) ActiveGreenText else AmberWarning,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        // 8. Test Call Simulator Button
        item {
            OutlinedButton(
                onClick = {
                    showTestCallDialog = true
                    testCallDialogStatus = null
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.PlayCircle, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Test AI Voice Assistant")
            }
        }

        item { Spacer(modifier = Modifier.height(16.dp)) }
    }

    // Dual-Mode Test Call Dialog
    if (showTestCallDialog) {
        AlertDialog(
            onDismissRequest = {
                if (!isPlacingOutboundCall) {
                    showTestCallDialog = false
                    testCallDialogStatus = null
                }
            },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.HeadsetMic, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Test AI Voice Assistant", fontWeight = FontWeight.Bold)
                }
            },
            text = {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        "Verify your AI receptionist's spoken greeting, triage logic, and follow-up messaging:",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(14.dp))

                    // Option 1: Instant In-App Speaker Audio Test
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.VolumeUp, contentDescription = null, tint = ActiveGreenText, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Option 1: Instant In-App Speaker Test", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                "Speaks your customized greeting out loud through this phone's speaker right now and logs a test call to your local inbox. (Zero voice minutes used).",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Button(
                                onClick = {
                                    val textToSpeak = firstMessageInput.ifBlank {
                                        "Thanks for calling ${settings.businessName}! How can I help you today?"
                                    }
                                    tts?.speak(textToSpeak, TextToSpeech.QUEUE_FLUSH, null, "vapi_test_speaker")

                                    coroutineScope.launch(Dispatchers.IO) {
                                        val app = context.applicationContext as? App
                                        val simEvent = VoiceCallEvent(
                                            phoneNumber = "+1 (732) 555-0199",
                                            callerName = "John Doe (Simulation)",
                                            durationSeconds = 42,
                                            intent = "SERVICE_CALL",
                                            summary = "Caller reached digital receptionist and requested an emergency estimate for service.",
                                            transcript = "Caller: 'Hi, I need someone to come check my system.'\nAI Receptionist: '${textToSpeak}'\nCaller: 'Sounds great, please send the link!'",
                                            recordingUrl = null,
                                            followUpSms = "Hey John! Thanks for calling ${settings.businessName}. As discussed with our digital assistant, here is our booking link: ${contractorGoalLinkInput.ifBlank { "https://missedcallautosms.com" }}",
                                            contractorStatus = settings.contractorStatus,
                                            isRead = false
                                        )
                                        app?.database?.voiceCallDao()?.insert(simEvent)

                                        try {
                                            val endpoint = if (settings.remoteUpdateUrl.contains("localhost") || settings.remoteUpdateUrl.contains("10.0.")) {
                                                "http://10.0.2.2:8000/api/vapi/test-call"
                                            } else {
                                                "https://missedcallautosms.com/api/vapi/test-call"
                                            }
                                            val url = URL(endpoint)
                                            val conn = (url.openConnection() as HttpURLConnection).apply {
                                                requestMethod = "POST"
                                                connectTimeout = 4000
                                                readTimeout = 4000
                                                doOutput = true
                                                setRequestProperty("Content-Type", "application/json")
                                                val p = JSONObject().apply {
                                                    put("licenseKey", settings.licenseKey)
                                                    put("firstMessage", textToSpeak)
                                                    put("callerName", "John Doe (Simulation)")
                                                }
                                                outputStream.use { os -> os.write(p.toString().toByteArray(StandardCharsets.UTF_8)) }
                                            }
                                            conn.responseCode
                                        } catch (e: Exception) {}
                                    }

                                    testCallDialogStatus = "✅ Audio playing through speaker! Test call logged."
                                    Toast.makeText(context, "Playing greeting through speaker...", Toast.LENGTH_SHORT).show()
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Play Audio Through Speaker")
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Option 2: Live Cellular Phone Call
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.PhoneAndroid, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Option 2: Live Cellular Call to Cell", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                "Vapi calls your cell phone directly so you can talk with your AI assistant live. (Uses 1 pooled minute).",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(8.dp))

                            OutlinedTextField(
                                value = testPhoneNumberInput,
                                onValueChange = { testPhoneNumberInput = it },
                                modifier = Modifier.fillMaxWidth(),
                                placeholder = { Text("Your phone number (e.g. +17325550199)") },
                                label = { Text("Cell Number to Ring") },
                                singleLine = true
                            )

                            Spacer(modifier = Modifier.height(8.dp))

                            Button(
                                onClick = {
                                    val dest = testPhoneNumberInput.trim()
                                    if (dest.isBlank()) {
                                        testCallDialogStatus = "⚠️ Please enter your phone number first."
                                        return@Button
                                    }
                                    isPlacingOutboundCall = true
                                    testCallDialogStatus = "Initiating live call from Vapi..."

                                    coroutineScope.launch(Dispatchers.IO) {
                                        try {
                                            val endpoint = if (settings.remoteUpdateUrl.contains("localhost") || settings.remoteUpdateUrl.contains("10.0.")) {
                                                "http://10.0.2.2:8000/api/vapi/outbound-test-call"
                                            } else {
                                                "https://missedcallautosms.com/api/vapi/outbound-test-call"
                                            }
                                            val url = URL(endpoint)
                                            val conn = (url.openConnection() as HttpURLConnection).apply {
                                                requestMethod = "POST"
                                                connectTimeout = 8000
                                                readTimeout = 8000
                                                doOutput = true
                                                setRequestProperty("Content-Type", "application/json")
                                                val p = JSONObject().apply {
                                                    put("phoneNumber", dest)
                                                    put("licenseKey", settings.licenseKey)
                                                }
                                                outputStream.use { os -> os.write(p.toString().toByteArray(StandardCharsets.UTF_8)) }
                                            }

                                            val code = conn.responseCode
                                            val respBody = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
                                            val jsonResp = try { JSONObject(respBody) } catch (e: Exception) { JSONObject() }

                                            withContext(Dispatchers.Main) {
                                                isPlacingOutboundCall = false
                                                if (code in 200..299 && jsonResp.optBoolean("success", true)) {
                                                    testCallDialogStatus = "✅ Calling $dest now! Pick up when your phone rings."
                                                    Toast.makeText(context, "📞 Ringing your phone now!", Toast.LENGTH_LONG).show()
                                                } else {
                                                    val err = jsonResp.optString("error", "HTTP $code")
                                                    testCallDialogStatus = "⚠️ Could not place call: $err"
                                                }
                                            }
                                        } catch (e: Exception) {
                                            withContext(Dispatchers.Main) {
                                                isPlacingOutboundCall = false
                                                testCallDialogStatus = "⚠️ Call failed: ${e.message}"
                                            }
                                        }
                                    }
                                },
                                enabled = !isPlacingOutboundCall,
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF673AB7)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                if (isPlacingOutboundCall) {
                                    CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White)
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Placing Call...")
                                } else {
                                    Icon(Icons.Default.PhoneForwarded, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Call My Phone Now")
                                }
                            }
                        }
                    }

                    testCallDialogStatus?.let { status ->
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = status,
                            style = MaterialTheme.typography.bodySmall,
                            color = if (status.startsWith("✅")) ActiveGreenText else AmberWarning,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showTestCallDialog = false
                        testCallDialogStatus = null
                    }
                ) {
                    Text("Close")
                }
            }
        )
    }
}
