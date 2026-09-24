package com.missedcall.autotext.ui.screens

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.ui.theme.AmberWarning
import com.missedcall.autotext.ui.theme.RedError
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.UUID

data class PlatformPreset(
    val id: String,
    val name: String,
    val subtitle: String,
    val iconColor: Color,
    val defaultUrl: String
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AutomationsScreen(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val coroutineScope = rememberCoroutineScope()

    val isPro = remember(settings.licenseKey) {
        settings.licenseKey.contains("PRO", ignoreCase = true) ||
        settings.licenseKey.contains("DEV", ignoreCase = true) ||
        settings.licenseKey.contains("DEMO", ignoreCase = true) ||
        settings.licenseKey.contains("MASTER", ignoreCase = true) ||
        com.missedcall.autotext.BuildConfig.IS_PRO_EDITION
    }

    var liveIsPro by remember { mutableStateOf(isPro) }
    var showInAppPayment by remember { mutableStateOf(false) }
    var inAppPaymentUrl by remember { mutableStateOf("") }
    var inAppPaymentTitle by remember { mutableStateOf("Secure Checkout") }

    val effectiveIsPro = isPro || liveIsPro

    fun refreshLicense() {
        coroutineScope.launch(Dispatchers.IO) {
            try {
                val candidateKey = settings.licenseKey.trim()
                if (candidateKey.isBlank()) return@launch

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
                    setRequestProperty("Content-Type", "application/json")
                    val payload = JSONObject().apply { put("licenseKey", candidateKey) }
                    outputStream.use { it.write(payload.toString().toByteArray(StandardCharsets.UTF_8)) }
                }

                if (conn.responseCode == 200) {
                    val resp = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(resp)
                    if (json.optBoolean("valid", false)) {
                        val proStatus = json.optBoolean("isPro", false) || json.optString("tier", "") == "PRO"
                        withContext(Dispatchers.Main) {
                            liveIsPro = proStatus
                        }
                    }
                }
            } catch (e: Exception) {
            }
        }
    }

    var outboundUrlInput by remember { mutableStateOf(settings.selectedOutboundWebhookUrl) }
    var isPingingWebhook by remember { mutableStateOf(false) }
    var pingStatusMessage by remember { mutableStateOf<String?>(null) }
    var showCurlSnippet by remember { mutableStateOf(false) }

    fun launchProUpgrade() {
        val email = settings.customerEmail.trim()
        val key = settings.licenseKey.trim()
        inAppPaymentTitle = "Upgrade to Pro Gateway ($249.99)"
        inAppPaymentUrl = "https://buy.stripe.com/bJe14neNU9loc6kehj2go0h?prefilled_email=${Uri.encode(email)}&client_reference_id=${Uri.encode(key)}"
        showInAppPayment = true
    }

    val presets = remember {
        listOf(
            PlatformPreset("n8n", "n8n Automation", "Self-hosted & Cloud workflows", Color(0xFFFF6D5A), "https://n8n.yourdomain.com/webhook/mcasms-leads"),
            PlatformPreset("zapier", "Zapier", "Catch Hook triggers & Multi-app Zaps", Color(0xFFFF4F00), "https://hooks.zapier.com/hooks/catch/XXXXXX/YYYYYY/"),
            PlatformPreset("make", "Make.com", "Integromat visual scenarios", Color(0xFF6D28D9), "https://hook.us1.make.com/xxxxxxxxxxxxxxxxxxxxxxxx"),
            PlatformPreset("ghl", "GoHighLevel", "Inbound lead webhooks & Workflows", Color(0xFF2563EB), "https://services.leadconnectorhq.com/hooks/XXXXXXXX"),
            PlatformPreset("crm", "Custom CRM / REST API", "Direct JSON payload to your server", Color(0xFF10B981), "https://api.yourdomain.com/v1/missed-calls")
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // HEADER TITLE
        item {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                        Text(
                            text = "Platform Integrations",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Bi-directional Inbound & Outbound Telephony Bridges",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (isPro) ActiveGreenContainer else RedError.copy(alpha = 0.15f)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Icon(
                                if (isPro) Icons.Default.Bolt else Icons.Default.Lock,
                                contentDescription = null,
                                tint = if (isPro) ActiveGreenText else RedError,
                                modifier = Modifier.size(12.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = if (isPro) "PRO ACTIVE" else "PRO LOCKED",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                softWrap = false,
                                color = if (isPro) ActiveGreenText else RedError
                            )
                        }
                    }
                }
            }
        }

        // PRO UPGRADE PAYWALL GATE (If not already unlocked)
        if (!effectiveIsPro) {
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
                                    color = Color(0xFF7C3AED).copy(alpha = 0.25f),
                                    modifier = Modifier.size(44.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(Icons.Default.Bolt, contentDescription = null, tint = Color(0xFFC084FC), modifier = Modifier.size(26.dp))
                                    }
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text(
                                        text = "Pro Automation Gateway",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = Color.White
                                    )
                                    Text(
                                        text = "A2P 10DLC Bypass & Central Telephony Bridge",
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
                                    text = "🔒 PRO REQUIRED",
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = RedError
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        Text(
                            text = "Connect your Android carrier SIM directly into n8n, Make, Zapier, and custom CRMs. Stream inbound leads in real time, trigger two-way automated SMS, and bypass A2P 10DLC bans completely.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(0xFFE2E8F0),
                            lineHeight = 20.sp
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        val proFeatures = listOf(
                            "⚡ Central Webhook Bridge" to "Stream every incoming SMS and missed call directly to your webhook URL in real time.",
                            "🔄 Bi-Directional HTTP REST API" to "Send carrier SMS and fetch phone status via local or cloud API endpoints.",
                            "📱 Dual SIM Business Slotting" to "Route business missed calls to SIM 2 while preserving your personal SIM 1.",
                            "🛡️ 100% P2P Carrier Exemption" to "Operates from genuine Android hardware. Zero 10DLC registration, zero per-SMS carrier markups.",
                            "🚀 One-Time Lifetime License" to "Perpetual hardware unlock. No monthly software subscriptions."
                        )

                        proFeatures.forEach { (title, desc) ->
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
                                    Text("Lifetime Hardware License", style = MaterialTheme.typography.labelMedium, color = Color(0xFF94A3B8))
                                    Text("$249.99 One-Time", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold, color = Color(0xFF00E676))
                                }
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = Color(0xFF00E676).copy(alpha = 0.15f)
                                ) {
                                    Text("Zero Monthly Fees", color = Color(0xFF00E676), fontWeight = FontWeight.Bold, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        Button(
                            onClick = { launchProUpgrade() },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF9333EA)),
                            modifier = Modifier.fillMaxWidth().height(50.dp),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Default.Bolt, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("⭐ Upgrade to Pro Gateway ($249.99)", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(12.dp), tint = Color(0xFF94A3B8))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("100% In-App Checkout • Instant Hardware Unlock", fontSize = 11.sp, color = Color(0xFF94A3B8))
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        OutlinedButton(
                            onClick = { refreshLicense() },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            border = BorderStroke(1.dp, Color(0xFF475569))
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(14.dp), tint = Color(0xFFCBD5E0))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Already Upgraded? Refresh Status", fontSize = 12.sp, color = Color(0xFFCBD5E0))
                        }
                    }
                }
            }
        } else {

        // SECTION 1: PLATFORM PRESETS
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
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
                                text = "1. Select Platform Preset",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "Choose your destination platform to quickly pre-populate connection endpoints.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        if (!isPro) {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = RedError.copy(alpha = 0.15f)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Icon(Icons.Default.Lock, contentDescription = null, tint = RedError, modifier = Modifier.size(10.dp))
                                    Spacer(modifier = Modifier.width(3.dp))
                                    Text("PRO ONLY", fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, color = RedError)
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        presets.forEach { preset ->
                            val isSelected = outboundUrlInput.contains(preset.id, ignoreCase = true)
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = if (isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f) else MaterialTheme.colorScheme.surface,
                                border = BorderStroke(
                                    1.dp,
                                    if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                                ),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        if (isPro) {
                                            outboundUrlInput = preset.defaultUrl
                                            onSettingsChanged(settings.copy(selectedOutboundWebhookUrl = preset.defaultUrl))
                                            Toast.makeText(context, "Loaded ${preset.name} Preset", Toast.LENGTH_SHORT).show()
                                        } else {
                                            Toast.makeText(context, "🔒 Pro Automation Edition Required ($249.99 upgrade)", Toast.LENGTH_SHORT).show()
                                        }
                                    }
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(12.dp)
                                            .clip(CircleShape)
                                            .background(preset.iconColor)
                                    )
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(preset.name, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                        Text(preset.subtitle, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Icon(
                                        Icons.Default.ArrowForwardIos,
                                        contentDescription = null,
                                        modifier = Modifier.size(12.dp),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // SECTION 2: OUTBOUND WEBHOOK DISPATCH BRIDGE
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
                        Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = "2. Outbound Event Dispatch Bridge",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                if (!isPro) {
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = RedError.copy(alpha = 0.15f)
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        ) {
                                            Icon(Icons.Default.Lock, contentDescription = null, tint = RedError, modifier = Modifier.size(10.dp))
                                            Spacer(modifier = Modifier.width(3.dp))
                                            Text("PRO", fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, color = RedError)
                                        }
                                    }
                                }
                            }
                            Text(
                                text = "Posts real-time JSON payloads from this phone directly to your workflow URL.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Switch(
                            checked = if (isPro) settings.outboundWebhookEnabled else false,
                            enabled = isPro,
                            onCheckedChange = { isChecked ->
                                if (isPro) {
                                    onSettingsChanged(settings.copy(outboundWebhookEnabled = isChecked))
                                } else {
                                    Toast.makeText(context, "🔒 Pro Automation Edition Required ($249.99 upgrade)", Toast.LENGTH_SHORT).show()
                                }
                            }
                        )
                    }

                    if (!isPro) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = RedError.copy(alpha = 0.08f),
                            border = BorderStroke(1.dp, RedError.copy(alpha = 0.3f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Lock, contentDescription = null, tint = RedError, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Locked: Outbound Webhook Relay requires a Pro Gateway license.",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = RedError,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }

                    if (settings.outboundWebhookEnabled && isPro) {
                        Spacer(modifier = Modifier.height(14.dp))

                        OutlinedTextField(
                            value = outboundUrlInput,
                            onValueChange = {
                                outboundUrlInput = it
                                onSettingsChanged(settings.copy(selectedOutboundWebhookUrl = it))
                            },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Destination Webhook URL") },
                            placeholder = { Text("https://your-webhook-endpoint.com/webhook") },
                            singleLine = true,
                            trailingIcon = {
                                if (outboundUrlInput.isNotBlank()) {
                                    IconButton(onClick = {
                                        outboundUrlInput = ""
                                        onSettingsChanged(settings.copy(selectedOutboundWebhookUrl = ""))
                                    }) {
                                        Icon(Icons.Default.Clear, contentDescription = "Clear")
                                    }
                                }
                            }
                        )

                        Spacer(modifier = Modifier.height(12.dp))

                        Text(
                            text = "Event Subscriptions:",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.height(6.dp))

                        // Event checkboxes
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = settings.webhookSubMissedCall,
                                onCheckedChange = { onSettingsChanged(settings.copy(webhookSubMissedCall = it)) }
                            )
                            Text("📞 Missed Call Event (Instant lead capture)", fontSize = 12.sp)
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = settings.webhookSubSmsSent,
                                onCheckedChange = { onSettingsChanged(settings.copy(webhookSubSmsSent = it)) }
                            )
                            Text("💬 Outbound Auto-SMS Dispatched", fontSize = 12.sp)
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = settings.webhookSubSmsReceived,
                                onCheckedChange = { onSettingsChanged(settings.copy(webhookSubSmsReceived = it)) }
                            )
                            Text("📥 Customer Inbound SMS Reply Received", fontSize = 12.sp)
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = settings.webhookSubCallCompleted,
                                onCheckedChange = { onSettingsChanged(settings.copy(webhookSubCallCompleted = it)) }
                            )
                            Text("🎙️ AI Voice Call Completed & Transcript Ready", fontSize = 12.sp)
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = settings.webhookSubVoicemail,
                                onCheckedChange = { onSettingsChanged(settings.copy(webhookSubVoicemail = it)) }
                            )
                            Text("📼 Voicemail / Audio Lead Event", fontSize = 12.sp)
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        // Mute native auto-reply option
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                                Text("Mute Phone's Native Auto-SMS", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                                Text("Let your external n8n/CRM workflow exclusively handle the SMS reply instead of sending duplicate texts.", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Switch(
                                checked = settings.muteNativeAutoReply,
                                onCheckedChange = { onSettingsChanged(settings.copy(muteNativeAutoReply = it)) }
                            )
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        // Test Ping Button
                        Button(
                            onClick = {
                                if (outboundUrlInput.isBlank()) {
                                    Toast.makeText(context, "Please enter a valid webhook URL first", Toast.LENGTH_SHORT).show()
                                    return@Button
                                }
                                isPingingWebhook = true
                                pingStatusMessage = null
                                coroutineScope.launch(Dispatchers.IO) {
                                    try {
                                        val url = URL(outboundUrlInput.trim())
                                        val conn = (url.openConnection() as HttpURLConnection).apply {
                                            requestMethod = "POST"
                                            connectTimeout = 5000
                                            readTimeout = 5000
                                            doOutput = true
                                            setRequestProperty("Content-Type", "application/json")
                                            val testPayload = """{
                                                "event": "mcasms.ping_test",
                                                "timestamp": ${System.currentTimeMillis()},
                                                "source": "MissedCallAutoSMS_Pro",
                                                "device": "Android Telephony Gateway",
                                                "licenseKey": "${settings.licenseKey}",
                                                "business": "${settings.businessName}"
                                            }""".trimIndent()
                                            outputStream.use { os -> os.write(testPayload.toByteArray(StandardCharsets.UTF_8)) }
                                        }
                                        val code = conn.responseCode
                                        withContext(Dispatchers.Main) {
                                            isPingingWebhook = false
                                            pingStatusMessage = if (code in 200..299) "✅ Webhook Ping Success (HTTP $code)" else "⚠️ Webhook Ping Returned HTTP $code"
                                        }
                                    } catch (e: Exception) {
                                        withContext(Dispatchers.Main) {
                                            isPingingWebhook = false
                                            pingStatusMessage = "❌ Ping Failed: ${e.message}"
                                        }
                                    }
                                }
                            },
                            enabled = !isPingingWebhook,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            if (isPingingWebhook) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Pinging Destination...")
                            } else {
                                Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Send Live Test Event Payload")
                            }
                        }

                        pingStatusMessage?.let { msg ->
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = msg,
                                style = MaterialTheme.typography.bodySmall,
                                color = if (msg.startsWith("✅")) ActiveGreenText else AmberWarning,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }
        }

        // SECTION 3: INBOUND REMOTE ACTIONS & DISPATCH GATEWAY
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
                        Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = "3. Inbound Remote Actions Gateway",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                if (!isPro) {
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = RedError.copy(alpha = 0.15f)
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        ) {
                                            Icon(Icons.Default.Lock, contentDescription = null, tint = RedError, modifier = Modifier.size(10.dp))
                                            Spacer(modifier = Modifier.width(3.dp))
                                            Text("PRO", fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, color = RedError)
                                        }
                                    }
                                }
                            }
                            Text(
                                text = "Allow external n8n/Zapier/CRM workflows to trigger actions on this phone.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Switch(
                            checked = if (isPro) settings.remoteAccessEnabled else false,
                            enabled = isPro,
                            onCheckedChange = { isChecked ->
                                if (isPro) {
                                    onSettingsChanged(settings.copy(remoteAccessEnabled = isChecked))
                                } else {
                                    Toast.makeText(context, "🔒 Pro Automation Edition Required ($249.99 upgrade)", Toast.LENGTH_SHORT).show()
                                }
                            }
                        )
                    }

                    if (!isPro) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = RedError.copy(alpha = 0.08f),
                            border = BorderStroke(1.dp, RedError.copy(alpha = 0.3f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Lock, contentDescription = null, tint = RedError, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Locked: Inbound HTTP SMS Dispatch API requires a Pro Gateway license.",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = RedError,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }

                    if (settings.remoteAccessEnabled && isPro) {
                        Spacer(modifier = Modifier.height(12.dp))

                        Text(
                            text = "Inbound Gateway Security API Key",
                            fontWeight = FontWeight.SemiBold,
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Text(
                            text = "Include this secret header to authenticate incoming requests from your CRM/n8n to this device.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        Spacer(modifier = Modifier.height(6.dp))

                        val currentSecret = remember(settings.webhookApiSecret) {
                            if (settings.webhookApiSecret.isBlank()) {
                                val generated = "mcasms_" + UUID.randomUUID().toString().replace("-", "").take(16)
                                onSettingsChanged(settings.copy(webhookApiSecret = generated))
                                generated
                            } else {
                                settings.webhookApiSecret
                            }
                        }

                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = currentSecret,
                                    style = MaterialTheme.typography.bodySmall,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold
                                )
                                Row {
                                    IconButton(
                                        onClick = {
                                            clipboardManager.setText(AnnotatedString(currentSecret))
                                            Toast.makeText(context, "API Secret Copied!", Toast.LENGTH_SHORT).show()
                                        },
                                        modifier = Modifier.size(28.dp)
                                    ) {
                                        Icon(Icons.Default.ContentCopy, contentDescription = "Copy", modifier = Modifier.size(16.dp))
                                    }
                                    IconButton(
                                        onClick = {
                                            val newSecret = "mcasms_" + UUID.randomUUID().toString().replace("-", "").take(16)
                                            onSettingsChanged(settings.copy(webhookApiSecret = newSecret))
                                            Toast.makeText(context, "Generated New Secret", Toast.LENGTH_SHORT).show()
                                        },
                                        modifier = Modifier.size(28.dp)
                                    ) {
                                        Icon(Icons.Default.Refresh, contentDescription = "Regenerate", modifier = Modifier.size(16.dp))
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        // INBOUND CAPABILITIES EXPLANATION
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Available Inbound Capabilities:", fontWeight = FontWeight.Bold, fontSize = 12.sp)

                            Row(verticalAlignment = Alignment.Top) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(14.dp), tint = ActiveGreenText)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Remote SMS Dispatch: Trigger this phone to send a real carrier SMS to any contact via local SIM card.", fontSize = 11.sp)
                            }
                            Row(verticalAlignment = Alignment.Top) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(14.dp), tint = ActiveGreenText)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Remote Power Control: Toggle appliance ON/OFF or pause auto-replies remotely when you are off duty.", fontSize = 11.sp)
                            }
                            Row(verticalAlignment = Alignment.Top) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(14.dp), tint = ActiveGreenText)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Hardware Telemetry Ping: Monitor appliance battery %, SIM signal strength, and network reachability.", fontSize = 11.sp)
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        TextButton(
                            onClick = { showCurlSnippet = !showCurlSnippet }
                        ) {
                            Icon(if (showCurlSnippet) Icons.Default.ExpandLess else Icons.Default.Code, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(if (showCurlSnippet) "Hide Integration Code" else "View Sample n8n / cURL Request")
                        }

                        if (showCurlSnippet) {
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = Color(0xFF0F172A),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(
                                        text = """curl -X POST "http://<PHONE_IP>:8080/api/sms/send" \
  -H "Content-Type: application/json" \
  -H "X-API-Secret: $currentSecret" \
  -d '{
    "to": "+15551234567",
    "message": "Hey John, your estimate is ready!"
  }'""",
                                        fontFamily = FontFamily.Monospace,
                                        fontSize = 10.sp,
                                        color = Color(0xFF38BDF8)
                                    )
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        text = "In n8n or Zapier, use an 'HTTP Request' node pointing to this phone's LAN IP or tailscale endpoint.",
                                        fontSize = 10.sp,
                                        color = Color(0xFF94A3B8)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // SECTION 4: DUAL SIM HARDWARE ROUTING
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
                            Icon(Icons.Default.SimCard, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("4. Telephony & Dual-SIM Slot Routing", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                        }
                        if (!isPro) {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = RedError.copy(alpha = 0.15f)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Icon(Icons.Default.Lock, contentDescription = null, tint = RedError, modifier = Modifier.size(10.dp))
                                    Spacer(modifier = Modifier.width(3.dp))
                                    Text("PRO ONLY", fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, color = RedError)
                                }
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Configure which hardware carrier SIM slot is utilized when dispatching automated or remote SMS.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(0 to "SIM 1 (Default)", 1 to "SIM 2 (Secondary)").forEach { (slot, label) ->
                            val isSelected = settings.preferredSimSlot == slot
                            OutlinedButton(
                                onClick = {
                                    if (isPro) {
                                        onSettingsChanged(settings.copy(preferredSimSlot = slot))
                                    } else {
                                        Toast.makeText(context, "Dual SIM routing requires Pro Gateway ($249.99 upgrade)", Toast.LENGTH_SHORT).show()
                                    }
                                },
                                enabled = isPro,
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp),
                                colors = if (isSelected) ButtonDefaults.outlinedButtonColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)) else ButtonDefaults.outlinedButtonColors()
                            ) {
                                Text(label, fontSize = 11.sp, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal)
                            }
                        }
                    }

                    if (!isPro) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "🔒 Dual SIM slot selection requires Pro Automation Gateway ($249.99).",
                            style = MaterialTheme.typography.labelSmall,
                            color = RedError,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(30.dp))
        }
        }
    }

    if (showInAppPayment && inAppPaymentUrl.isNotBlank()) {
        InAppPaymentDialog(
            url = inAppPaymentUrl,
            title = inAppPaymentTitle,
            onDismiss = { showInAppPayment = false },
            onPaymentSuccess = {
                Toast.makeText(context, "Payment successful! Pro Automation Gateway unlocked.", Toast.LENGTH_LONG).show()
                refreshLicense()
            }
        )
    }
}
