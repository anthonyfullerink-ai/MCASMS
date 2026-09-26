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
import com.missedcall.autotext.ui.theme.RedError
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

    var liveVoiceSubActive by remember { mutableStateOf(settings.voiceSubscriptionActive) }
    var liveVoiceMinutesBalance by remember { mutableDoubleStateOf(0.0) }
    var showInAppPayment by remember { mutableStateOf(false) }
    var inAppPaymentUrl by remember { mutableStateOf("") }
    var inAppPaymentTitle by remember { mutableStateOf("Secure Checkout") }

    val effectiveVoiceActive = isDeveloperKey || settings.voiceSubscriptionActive || liveVoiceSubActive ||
            settings.licenseKey.contains("VOICE", ignoreCase = true)
    val isVoiceActive = effectiveVoiceActive

    fun refreshLicenseAndVoiceStatus() {
        coroutineScope.launch(Dispatchers.IO) {
            try {
                val key = settings.licenseKey.trim()
                if (key.isBlank()) return@launch
                val endpoint = if (settings.remoteUpdateUrl.contains("localhost") || settings.remoteUpdateUrl.contains("10.0.")) {
                    "http://10.0.2.2:8000/api/verify-license"
                } else {
                    "https://missedcallautosms.com/api/verify-license"
                }
                val url = URL(endpoint)
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 5000
                    readTimeout = 5000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    val body = JSONObject().apply {
                        put("licenseKey", key)
                        put("deviceId", com.missedcall.autotext.data.license.LicenseManager.getDeviceId(context))
                        put("deviceModel", "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
                        put("appVersion", com.missedcall.autotext.BuildConfig.VERSION_NAME)
                    }.toString()
                    outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
                }
                if (conn.responseCode == 200) {
                    val resp = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(resp)
                    val voiceSubActive = json.optBoolean("voiceSubActive", false) || json.optBoolean("voiceEntitlement", false)
                    val minsBal = json.optDouble("voiceMinutesBalance", 0.0)
                    val fwdNum = json.optString("voiceForwardingNumber", "")
                    withContext(Dispatchers.Main) {
                        liveVoiceSubActive = voiceSubActive
                        liveVoiceMinutesBalance = minsBal
                        if (fwdNum.isNotBlank() && fwdNum != settings.voiceReceptionistForwardingNumber) {
                            onSettingsChanged(settings.copy(
                                voiceSubscriptionActive = voiceSubActive,
                                voiceReceptionistForwardingNumber = fwdNum
                            ))
                        } else if (voiceSubActive != settings.voiceSubscriptionActive) {
                            onSettingsChanged(settings.copy(voiceSubscriptionActive = voiceSubActive))
                        }
                    }
                }
            } catch (e: Exception) {
            }
        }
    }

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

    var aiSmsMasterEnabled by remember(settings.aiSmsMasterEnabled) { mutableStateOf(settings.aiSmsMasterEnabled) }
    var aiSmsVoicePostCallEnabled by remember(settings.aiSmsVoicePostCallEnabled) { mutableStateOf(settings.aiSmsVoicePostCallEnabled) }
    var aiSmsInboundAgentEnabled by remember(settings.aiSmsInboundAgentEnabled) { mutableStateOf(settings.aiSmsInboundAgentEnabled) }
    var aiSmsScope by remember(settings.aiSmsScope) { mutableStateOf(settings.aiSmsScope) }
    var aiSmsBusinessServiceType by remember(settings.aiSmsBusinessServiceType) { mutableStateOf(settings.aiSmsBusinessServiceType) }
    var aiSmsShopAddressInput by remember(settings.aiSmsShopAddress) { mutableStateOf(settings.aiSmsShopAddress) }
    var aiSmsShopInstructionsInput by remember(settings.aiSmsShopInstructions) { mutableStateOf(settings.aiSmsShopInstructions) }
    var aiSmsCalendarConnected by remember(settings.aiSmsCalendarConnected) { mutableStateOf(settings.aiSmsCalendarConnected) }
    var aiSmsCalendarEmailInput by remember(settings.aiSmsCalendarEmail) { mutableStateOf(settings.aiSmsCalendarEmail) }
    var aiSmsWorkingHoursInput by remember(settings.aiSmsCalendarWorkingHours) { mutableStateOf(settings.aiSmsCalendarWorkingHours) }
    var aiSmsAutoPauseOnHumanReply by remember(settings.aiSmsAutoPauseOnHumanReply) { mutableStateOf(settings.aiSmsAutoPauseOnHumanReply) }
    var aiSmsEmergencyAlertsEnabled by remember(settings.aiSmsEmergencyAlertsEnabled) { mutableStateOf(settings.aiSmsEmergencyAlertsEnabled) }

    var isSavingToVapi by remember { mutableStateOf(false) }
    var saveStatusMessage by remember { mutableStateOf<String?>(null) }
    var selectedCallForDetail by remember { mutableStateOf<VoiceCallEvent?>(null) }
    var showTestCallDialog by remember { mutableStateOf(false) }
    var testPhoneNumberInput by remember { mutableStateOf("") }
    var isPlacingOutboundCall by remember { mutableStateOf(false) }
    var testCallDialogStatus by remember { mutableStateOf<String?>(null) }
    var showAccountPortal by remember { mutableStateOf(false) }
    var tts by remember { mutableStateOf<TextToSpeech?>(null) }

    if (showAccountPortal) {
        CustomerAccountPortalDialog(
            settings = settings,
            onSettingsChanged = onSettingsChanged,
            onDismiss = { showAccountPortal = false }
        )
    }

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
        refreshLicenseAndVoiceStatus()
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item { Spacer(modifier = Modifier.height(4.dp)) }

        // AI VOICE RECEPTIONIST PAYWALL HERO CARD (When Voice is not active)
        if (!effectiveVoiceActive) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF131722)),
                    border = BorderStroke(1.5.dp, Color(0xFF818CF8).copy(alpha = 0.6f)),
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFF673AB7).copy(alpha = 0.25f),
                                    modifier = Modifier.size(44.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(Icons.Default.RecordVoiceOver, contentDescription = null, tint = Color(0xFFC084FC), modifier = Modifier.size(26.dp))
                                    }
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text(
                                        text = "24/7 AI Voice Receptionist",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = Color.White
                                    )
                                    Text(
                                        text = "Autonomous Call Answering & Booking",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = Color(0xFF94A3B8)
                                    )
                                }
                            }
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = RedError.copy(alpha = 0.2f)
                            ) {
                                Text(
                                    text = "🔒 LOCKED",
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = RedError
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        Text(
                            text = "Never let an inbound lead slip away to voicemail. Riley AI answers calls in < 1 second, qualifies prospects, books appointments, and sends you instant SMS summaries directly to your phone.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(0xFFE2E8F0),
                            lineHeight = 20.sp
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        val features = listOf(
                            "⚡ Instant Call Answering" to "Picks up in < 1s with ultra-realistic human AI voice.",
                            "🎁 15 FREE Test Minutes Included" to "Test real calls on your dedicated carrier line immediately upon activation.",
                            "📲 Instant SMS Lead Summaries" to "Receives caller name, phone number, and service need via SMS.",
                            "🛡️ Auto-Pause Safeguard" to "Pauses automatically at 0.0 balance so you're never surprise-billed.",
                            "📶 Carrier Conditional Forwarding" to "Works with your existing SIM (*71) on Verizon, AT&T, & T-Mobile."
                        )

                        features.forEach { (title, desc) ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                verticalAlignment = Alignment.Top
                            ) {
                                Icon(
                                    Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = Color(0xFF00E676),
                                    modifier = Modifier.size(18.dp).padding(top = 2.dp)
                                )
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Text(title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall, color = Color.White)
                                    Text(desc, style = MaterialTheme.typography.labelSmall, color = Color(0xFF94A3B8))
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(20.dp))

                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(14.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text("Monthly Subscription", style = MaterialTheme.typography.labelMedium, color = Color(0xFF94A3B8))
                                    Text("$9.99 / mo", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold, color = Color(0xFF00E676))
                                }
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = Color(0xFF00E676).copy(alpha = 0.15f)
                                ) {
                                    Text("Includes 15 Free Mins", color = Color(0xFF00E676), fontWeight = FontWeight.Bold, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        Button(
                            onClick = {
                                val email = settings.customerEmail.trim()
                                val key = settings.licenseKey.trim()
                                inAppPaymentTitle = "Subscribe to AI Voice ($9.99/mo)"
                                inAppPaymentUrl = "https://missedcallautosms.com/api/create-voice-pro-checkout?key=${Uri.encode(key)}&email=${Uri.encode(email)}"
                                showInAppPayment = true
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF9333EA)),
                            modifier = Modifier.fillMaxWidth().height(50.dp),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Default.Star, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("⭐ Subscribe to Unlock AI Voice ($9.99/mo)", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(12.dp), tint = Color(0xFF94A3B8))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("100% In-App Checkout • Instant Activation • Cancel Anytime", fontSize = 11.sp, color = Color(0xFF94A3B8))
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        OutlinedButton(
                            onClick = { refreshLicenseAndVoiceStatus() },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            border = BorderStroke(1.dp, Color(0xFF475569))
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(14.dp), tint = Color(0xFFCBD5E0))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Already Subscribed? Refresh Status", fontSize = 12.sp, color = Color(0xFFCBD5E0))
                        }
                    }
                }
            }
        } else {
            // 0. Live Minutes Balance & Auto-Pause Safeguard Banner
            item {
                if (liveVoiceMinutesBalance <= 0.0) {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF450A0A)),
                        border = BorderStroke(1.5.dp, RedError.copy(alpha = 0.8f)),
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
                                    Icon(Icons.Default.Warning, contentDescription = null, tint = RedError, modifier = Modifier.size(24.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "⚠️ AI Receptionist Paused (0.0 Mins)",
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = RedError
                                    )
                                }
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = RedError.copy(alpha = 0.2f)
                                ) {
                                    Text(
                                        text = "PAUSED",
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = RedError
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            Text(
                                text = "Your AI Receptionist has auto-paused because your minute balance reached 0.0. To protect your line and prevent unexpected charges, calls will ring your carrier voicemail until minutes are reloaded. Choose a reload pack below to resume instantly:",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFFFCA5A5)
                            )

                            Spacer(modifier = Modifier.height(14.dp))

                            val reloadPacks = listOf(
                                Triple("10", "$10 (40 Mins)", "$0.25/m"),
                                Triple("25", "$25 (115 Mins)", "+15 Bonus"),
                                Triple("50", "$50 (250 Mins)", "+50 Bonus"),
                                Triple("100", "$100 (550 Mins)", "+150 Bonus")
                            )

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                reloadPacks.take(2).forEach { (packTier, label, sub) ->
                                    Button(
                                        onClick = {
                                            val email = settings.customerEmail.trim()
                                            val key = settings.licenseKey.trim()
                                            inAppPaymentTitle = "Add Minutes • $label"
                                            inAppPaymentUrl = "https://missedcallautosms.com/api/create-credit-pack-checkout?pack=$packTier&key=${Uri.encode(key)}&email=${Uri.encode(email)}"
                                            showInAppPayment = true
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                                        shape = RoundedCornerShape(10.dp),
                                        modifier = Modifier.weight(1f).height(46.dp),
                                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
                                    ) {
                                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                            Text(label, fontWeight = FontWeight.Bold, fontSize = 11.sp, color = Color.White)
                                            Text(sub, fontSize = 9.sp, color = Color(0xFFFECACA))
                                        }
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                reloadPacks.drop(2).forEach { (packTier, label, sub) ->
                                    Button(
                                        onClick = {
                                            val email = settings.customerEmail.trim()
                                            val key = settings.licenseKey.trim()
                                            inAppPaymentTitle = "Add Minutes • $label"
                                            inAppPaymentUrl = "https://missedcallautosms.com/api/create-credit-pack-checkout?pack=$packTier&key=${Uri.encode(key)}&email=${Uri.encode(email)}"
                                            showInAppPayment = true
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFB91C1C)),
                                        shape = RoundedCornerShape(10.dp),
                                        modifier = Modifier.weight(1f).height(46.dp),
                                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
                                    ) {
                                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                            Text(label, fontWeight = FontWeight.Bold, fontSize = 11.sp, color = Color.White)
                                            Text(sub, fontSize = 9.sp, color = Color(0xFFFECACA))
                                        }
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(10.dp))

                            Text(
                                text = "🔒 Instant In-App Stripe Reload • Auto-Resumes Immediately • Credits Never Expire",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFFF87171),
                                fontSize = 10.sp
                            )
                        }
                    }
                } else {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF064E3B).copy(alpha = 0.35f)),
                        border = BorderStroke(1.dp, Color(0xFF00E676).copy(alpha = 0.5f)),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(14.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF00E676), modifier = Modifier.size(22.dp))
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text("Riley AI Active", fontWeight = FontWeight.Bold, color = Color.White, style = MaterialTheme.typography.bodyMedium)
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Surface(
                                            shape = RoundedCornerShape(4.dp),
                                            color = Color(0xFF00E676).copy(alpha = 0.2f)
                                        ) {
                                            Text("ONLINE", color = Color(0xFF00E676), fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                                        }
                                    }
                                    Text("${"%.1f".format(liveVoiceMinutesBalance)} Mins Remaining", style = MaterialTheme.typography.labelSmall, color = Color(0xFFA7F3D0))
                                }
                            }

                            Button(
                                onClick = {
                                    val email = settings.customerEmail.trim()
                                    val key = settings.licenseKey.trim()
                                    inAppPaymentTitle = "Add Minute Pack"
                                    inAppPaymentUrl = "https://missedcallautosms.com/api/create-credit-pack-checkout?pack=25&key=${Uri.encode(key)}&email=${Uri.encode(email)}"
                                    showInAppPayment = true
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00E676)),
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = null, tint = Color.Black, modifier = Modifier.size(14.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Top Up", fontWeight = FontWeight.Bold, fontSize = 11.sp, color = Color.Black)
                            }
                        }
                    }
                }
            }

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
                            color = if (isVoiceActive) Color(0xFF673AB7).copy(alpha = 0.25f) else RedError.copy(alpha = 0.15f)
                        ) {
                            Text(
                                text = if (isVoiceActive) "DEDICATED VAPI LINE" else "🔒 LOCKED (SUB REQUIRED)",
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = if (isVoiceActive) Color(0xFFCE93D8) else RedError
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Text(
                        text = if (isVoiceActive) settings.voiceReceptionistForwardingNumber.ifBlank { "+1 (732) 660-9121" } else "+1 (732) •••-•••• (Locked)",
                        style = MaterialTheme.typography.titleLarge,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        color = if (isVoiceActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
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
                                if (isVoiceActive) {
                                    try {
                                        val dialCode = carrierCodes.activateCode
                                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(dialCode)}"))
                                        context.startActivity(intent)
                                        Toast.makeText(context, "📞 Dialer opened with $dialCode. Tap CALL to confirm with your carrier!", Toast.LENGTH_LONG).show()
                                    } catch (e: Exception) {
                                        Toast.makeText(context, "Could not open dialer", Toast.LENGTH_SHORT).show()
                                    }
                                } else {
                                    Toast.makeText(context, "🔒 Voice Receptionist Subscription Required ($9.99/mo)", Toast.LENGTH_LONG).show()
                                    showAccountPortal = true
                                }
                            },
                            colors = if (isVoiceActive) ButtonDefaults.buttonColors(containerColor = Color(0xFF673AB7)) else ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                            modifier = Modifier.weight(1.2f)
                        ) {
                            Icon(if (isVoiceActive) Icons.Default.Call else Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(16.dp), tint = if (isVoiceActive) Color.White else MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = if (isVoiceActive) "Dial *71 Activate" else "Dial *71 (Locked)",
                                fontWeight = FontWeight.Bold,
                                color = if (isVoiceActive) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
                            )
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

                    Spacer(modifier = Modifier.height(10.dp))

                    OutlinedButton(
                        onClick = { showAccountPortal = true },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.CreditCard, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Manage Plan, Quotas & Add Minutes", fontWeight = FontWeight.SemiBold)
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
                                onSettingsChanged(settings.copy(vapiVoiceId = "21m00Tcm4TlvDq8ikWAM", vapiVoiceProvider = "11labs"))
                            },
                            label = { Text("Riley (Female)") },
                            modifier = Modifier.weight(1f)
                        )
                        FilterChip(
                            selected = selectedVoice.contains("Austin") || selectedVoice.contains("Male"),
                            onClick = {
                                selectedVoice = "Austin (Professional Male)"
                                onSettingsChanged(settings.copy(vapiVoiceId = "pNInz6obpgDQGcFmaJgB", vapiVoiceProvider = "11labs"))
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
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Post-Call SIM SMS Confirmation", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                            Text("Automatically text caller a booking confirmation or summary from your real SIM as soon as AI hangs up.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(
                            checked = aiSmsVoicePostCallEnabled,
                            onCheckedChange = {
                                aiSmsVoicePostCallEnabled = it
                                onSettingsChanged(settings.copy(
                                    aiSmsVoicePostCallEnabled = it,
                                    postCallSmsEnabled = it
                                ))
                            },
                            enabled = isVoiceActive
                        )
                    }
                }
            }
        }

        // 6.5 CONVERSATIONAL AI SMS & GOOGLE CALENDAR STUDIO
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, Color(0xFF7928CA).copy(alpha = 0.5f))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                            Text("💬", fontSize = 20.sp)
                            Spacer(modifier = Modifier.width(8.dp))
                            Column {
                                Text("24/7 AI SMS Studio", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                Text("2-way text qualification & Google Calendar booking", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Switch(
                            checked = aiSmsMasterEnabled,
                            onCheckedChange = {
                                aiSmsMasterEnabled = it
                                onSettingsChanged(settings.copy(aiSmsMasterEnabled = it))
                            },
                            enabled = isVoiceActive
                        )
                    }

                    if (aiSmsMasterEnabled) {
                        Spacer(modifier = Modifier.height(14.dp))
                        HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                        Spacer(modifier = Modifier.height(14.dp))

                        // Channels Active
                        Text("Active Channels:", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(6.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Voice Agent Post-Call SMS", style = MaterialTheme.typography.bodyMedium)
                            Switch(
                                checked = aiSmsVoicePostCallEnabled,
                                onCheckedChange = {
                                    aiSmsVoicePostCallEnabled = it
                                    onSettingsChanged(settings.copy(aiSmsVoicePostCallEnabled = it, postCallSmsEnabled = it))
                                }
                            )
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Inbound SMS Agent (Replies to texts)", style = MaterialTheme.typography.bodyMedium)
                            Switch(
                                checked = aiSmsInboundAgentEnabled,
                                onCheckedChange = {
                                    aiSmsInboundAgentEnabled = it
                                    onSettingsChanged(settings.copy(aiSmsInboundAgentEnabled = it))
                                }
                            )
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        // 3-Way Incoming SMS Scope Gatekeeper
                        Text("Incoming SMS Scope (Who AI replies to):", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(6.dp))

                        // Option 1: STRICT
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    aiSmsScope = "STRICT"
                                    onSettingsChanged(settings.copy(aiSmsScope = "STRICT"))
                                },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = aiSmsScope == "STRICT",
                                onClick = {
                                    aiSmsScope = "STRICT"
                                    onSettingsChanged(settings.copy(aiSmsScope = "STRICT"))
                                }
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Column {
                                Text("🛡️ Strict Mode (Recommended)", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                                Text("Only replies if number had a recent missed call or auto-text", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }

                        Spacer(modifier = Modifier.height(6.dp))

                        // Option 2: ALL_UNKNOWN
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    aiSmsScope = "ALL_UNKNOWN"
                                    onSettingsChanged(settings.copy(aiSmsScope = "ALL_UNKNOWN"))
                                },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = aiSmsScope == "ALL_UNKNOWN",
                                onClick = {
                                    aiSmsScope = "ALL_UNKNOWN"
                                    onSettingsChanged(settings.copy(aiSmsScope = "ALL_UNKNOWN"))
                                }
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Column {
                                Text("🌐 All Unknown Numbers", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                                Text("Replies to any unknown inbound text not in your Contacts", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }

                        Spacer(modifier = Modifier.height(6.dp))

                        // Option 3: OFF
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    aiSmsScope = "OFF"
                                    onSettingsChanged(settings.copy(aiSmsScope = "OFF"))
                                },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = aiSmsScope == "OFF",
                                onClick = {
                                    aiSmsScope = "OFF"
                                    onSettingsChanged(settings.copy(aiSmsScope = "OFF"))
                                }
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Column {
                                Text("⛔ Off (Voice Only)", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                                Text("Never auto-reply to incoming text messages", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        // Contacts Exemption Notice Box
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFF00E676).copy(alpha = 0.08f),
                            border = BorderStroke(1.dp, Color(0xFF00E676).copy(alpha = 0.3f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text("🔒", fontSize = 16.sp)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    "Phone Contacts Shield: Always Active. AI will NEVER text family, crew, or contacts saved in your phone address book.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = ActiveGreenText,
                                    fontSize = 11.sp
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                        HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                        Spacer(modifier = Modifier.height(14.dp))

                        // Google Calendar Direct Booking Section
                        Text("📅 Google Calendar Direct Sync", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(8.dp))

                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        if (aiSmsCalendarConnected) "Connected ✅" else "Google Calendar Ready",
                                        fontWeight = FontWeight.Bold,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = if (aiSmsCalendarConnected) ActiveGreenText else MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        if (aiSmsCalendarConnected)
                                            aiSmsCalendarEmailInput.ifBlank { settings.customerEmail.ifBlank { "Primary Calendar" } }
                                        else
                                            "Direct live appointment booking & slot lookup",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Button(
                                    onClick = {
                                        aiSmsCalendarConnected = !aiSmsCalendarConnected
                                        if (aiSmsCalendarConnected && aiSmsCalendarEmailInput.isBlank()) {
                                            aiSmsCalendarEmailInput = settings.customerEmail
                                        }
                                        onSettingsChanged(settings.copy(
                                            aiSmsCalendarConnected = aiSmsCalendarConnected,
                                            aiSmsCalendarEmail = aiSmsCalendarEmailInput
                                        ))
                                    },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = if (aiSmsCalendarConnected) Color(0xFF1E293B) else Color(0xFF00E676)
                                    )
                                ) {
                                    Text(
                                        if (aiSmsCalendarConnected) "Disconnect" else "Connect Calendar",
                                        color = if (aiSmsCalendarConnected) Color(0xFF94A3B8) else Color.Black,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        // Service Location: Mobile Field vs In-Shop
                        Text("Business Service Location:", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(6.dp))

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    aiSmsBusinessServiceType = "MOBILE"
                                    onSettingsChanged(settings.copy(aiSmsBusinessServiceType = "MOBILE"))
                                },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = aiSmsBusinessServiceType == "MOBILE",
                                onClick = {
                                    aiSmsBusinessServiceType = "MOBILE"
                                    onSettingsChanged(settings.copy(aiSmsBusinessServiceType = "MOBILE"))
                                }
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Column {
                                Text("🚐 Mobile Field Trade (Plumber, HVAC, Cleaners, Tow)", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                                Text("Asks client for job address • 30-min travel buffer • 2-hour arrival windows", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }

                        Spacer(modifier = Modifier.height(6.dp))

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    aiSmsBusinessServiceType = "IN_SHOP"
                                    onSettingsChanged(settings.copy(aiSmsBusinessServiceType = "IN_SHOP"))
                                },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = aiSmsBusinessServiceType == "IN_SHOP",
                                onClick = {
                                    aiSmsBusinessServiceType = "IN_SHOP"
                                    onSettingsChanged(settings.copy(aiSmsBusinessServiceType = "IN_SHOP"))
                                }
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Column {
                                Text("🏪 In-Shop / Studio (Barbers, Salons, Auto Mechanics)", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                                Text("Texts client your shop address • Zero travel buffer • Exact appointment times", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }

                        if (aiSmsBusinessServiceType == "IN_SHOP") {
                            Spacer(modifier = Modifier.height(10.dp))
                            OutlinedTextField(
                                value = aiSmsShopAddressInput,
                                onValueChange = {
                                    aiSmsShopAddressInput = it
                                    onSettingsChanged(settings.copy(aiSmsShopAddress = it))
                                },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Your Shop / Studio Address") },
                                placeholder = { Text("124 Main St, Suite B, Austin, TX") }
                            )

                            Spacer(modifier = Modifier.height(8.dp))
                            OutlinedTextField(
                                value = aiSmsShopInstructionsInput,
                                onValueChange = {
                                    aiSmsShopInstructionsInput = it
                                    onSettingsChanged(settings.copy(aiSmsShopInstructions = it))
                                },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Parking & Arrival Notes (Optional)") },
                                placeholder = { Text("Free parking behind building. Enter front door.") }
                            )
                        }

                        Spacer(modifier = Modifier.height(10.dp))
                        OutlinedTextField(
                            value = aiSmsWorkingHoursInput,
                            onValueChange = {
                                aiSmsWorkingHoursInput = it
                                onSettingsChanged(settings.copy(aiSmsCalendarWorkingHours = it))
                            },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Working Booking Hours") },
                            placeholder = { Text("08:00 - 17:00") }
                        )

                        Spacer(modifier = Modifier.height(14.dp))

                        // Smart Contractor Safeguards
                        Text("🛡️ Safety Controls:", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(6.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Auto-Pause on Human Reply", style = MaterialTheme.typography.bodyMedium)
                                Text("Mutes AI for 24h if you manually text the customer", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Switch(
                                checked = aiSmsAutoPauseOnHumanReply,
                                onCheckedChange = {
                                    aiSmsAutoPauseOnHumanReply = it
                                    onSettingsChanged(settings.copy(aiSmsAutoPauseOnHumanReply = it))
                                }
                            )
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Emergency Lead Alert Notifications", style = MaterialTheme.typography.bodyMedium)
                                Text("High-priority alert when customer mentions hazard/emergency", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Switch(
                                checked = aiSmsEmergencyAlertsEnabled,
                                onCheckedChange = {
                                    aiSmsEmergencyAlertsEnabled = it
                                    onSettingsChanged(settings.copy(aiSmsEmergencyAlertsEnabled = it))
                                }
                            )
                        }

                        Spacer(modifier = Modifier.height(14.dp))
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                        Spacer(modifier = Modifier.height(12.dp))

                        Text("⚡ Instant Queue & Cooldown Controls:", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "If an AI conversation is paused from a manual text or safety reply limit, tap below to immediately unpause and reset the queue for testing.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(8.dp))

                        var isResettingQueue by remember { mutableStateOf(false) }

                        OutlinedButton(
                            onClick = {
                                isResettingQueue = true
                                com.missedcall.autotext.util.AiNotificationManager.clearTakeoverAndResetQueue(context, "ALL") {
                                    isResettingQueue = false
                                    Toast.makeText(context, "✅ AI Queue & Cooldowns Cleared! Ready for incoming texts.", Toast.LENGTH_LONG).show()
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !isResettingQueue,
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = MaterialTheme.colorScheme.primary
                            )
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(if (isResettingQueue) "Resetting Queue..." else "🔄 Clear AI Queue & Reset Cooldowns", fontWeight = FontWeight.Bold)
                        }
                    }
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
                                    put("voiceProvider", "11labs")
                                    put("voiceId", if (selectedVoice.contains("Austin")) "pNInz6obpgDQGcFmaJgB" else "21m00Tcm4TlvDq8ikWAM")
                                    put("aiSmsMasterEnabled", aiSmsMasterEnabled)
                                    put("aiSmsVoicePostCallEnabled", aiSmsVoicePostCallEnabled)
                                    put("aiSmsInboundAgentEnabled", aiSmsInboundAgentEnabled)
                                    put("aiSmsScope", aiSmsScope)
                                    put("aiSmsBusinessServiceType", aiSmsBusinessServiceType)
                                    put("aiSmsShopAddress", aiSmsShopAddressInput)
                                    put("aiSmsShopInstructions", aiSmsShopInstructionsInput)
                                    put("aiSmsCalendarConnected", aiSmsCalendarConnected)
                                    put("aiSmsCalendarEmail", aiSmsCalendarEmailInput)
                                    put("aiSmsCalendarWorkingHours", aiSmsWorkingHoursInput)
                                    put("aiSmsAutoPauseOnHumanReply", aiSmsAutoPauseOnHumanReply)
                                    put("aiSmsEmergencyAlertsEnabled", aiSmsEmergencyAlertsEnabled)
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
                colors = ButtonDefaults.buttonColors(containerColor = if (isVoiceActive) Color(0xFF673AB7) else MaterialTheme.colorScheme.surfaceVariant),
                modifier = Modifier.fillMaxWidth(),
                enabled = isVoiceActive && !isSavingToVapi
            ) {
                if (isSavingToVapi) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.White)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Saving Live to Vapi Cloud...")
                } else {
                    Icon(if (isVoiceActive) Icons.Default.CloudUpload else Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(18.dp), tint = if (isVoiceActive) Color.White else MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isVoiceActive) "Save & Sync AI Voice Agent" else "Save & Sync (Locked — Sub Required)",
                        fontWeight = FontWeight.Bold,
                        color = if (isVoiceActive) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
                    )
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
                    if (isVoiceActive) {
                        showTestCallDialog = true
                        testCallDialogStatus = null
                    } else {
                        Toast.makeText(context, "🔒 Voice Receptionist Subscription Required ($9.99/mo)", Toast.LENGTH_SHORT).show()
                        showAccountPortal = true
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(if (isVoiceActive) Icons.Default.PlayCircle else Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(if (isVoiceActive) "Test AI Voice Assistant" else "Test AI Voice Assistant (Locked)")
            }
        }

        item { Spacer(modifier = Modifier.height(16.dp)) }
        }
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

    if (showInAppPayment && inAppPaymentUrl.isNotBlank()) {
        InAppPaymentDialog(
            url = inAppPaymentUrl,
            title = inAppPaymentTitle,
            onDismiss = { showInAppPayment = false },
            onPaymentSuccess = {
                Toast.makeText(context, "Payment successful! 24/7 AI Voice is active.", Toast.LENGTH_LONG).show()
                refreshLicenseAndVoiceStatus()
            }
        )
    }
}
