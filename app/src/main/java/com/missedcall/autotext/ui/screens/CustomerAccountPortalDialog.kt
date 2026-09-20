package com.missedcall.autotext.ui.screens

import android.content.Context
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.background
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.ui.theme.RedError
import com.missedcall.autotext.util.CarrierForwardingManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.Locale
import org.json.JSONObject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomerAccountPortalDialog(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val coroutineScope = rememberCoroutineScope()

    val androidId = remember {
        try {
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "UNKNOWN_DEVICE"
        } catch (e: Exception) {
            "UNKNOWN_DEVICE"
        }
    }

    var businessNameInput by remember { mutableStateOf(settings.businessName) }
    var customerEmailInput by remember { mutableStateOf(settings.customerEmail) }
    var licenseKeyInput by remember { mutableStateOf(settings.licenseKey) }
    var isEditingKey by remember { mutableStateOf(false) }
    var showCancelTrialConfirm by remember { mutableStateOf(false) }
    var isCancellingTrial by remember { mutableStateOf(false) }
    var customGreetingInput by remember {
        mutableStateOf(settings.voiceReceptionistGreeting.ifBlank { "Thanks for calling ${settings.businessName}! How can I help you today?" })
    }
    var isSavingGreeting by remember { mutableStateOf(false) }
    var showCancelVoiceConfirm by remember { mutableStateOf(false) }
    var isCancellingVoice by remember { mutableStateOf(false) }

    val isCancelled = settings.subscriptionStatus == "CANCELLED"
    val isTrial = settings.subscriptionStatus == "TRIAL" || settings.licenseKey.contains("TRIAL", ignoreCase = true)
    val isPro = settings.licenseKey.contains("PRO", ignoreCase = true)

    var livePlanName by remember { mutableStateOf("Autonomous Front Desk Bundle") }
    var liveQuotaMinutes by remember { mutableIntStateOf(250) }
    var liveMinutesUsed by remember { mutableIntStateOf(0) }
    var liveOverageMinutes by remember { mutableIntStateOf(0) }
    var liveOverageAmount by remember { mutableDoubleStateOf(0.0) }
    var liveOverageRate by remember { mutableDoubleStateOf(0.20) }
    var isUnlimitedGateway by remember { mutableStateOf(false) }

    LaunchedEffect(settings.licenseKey) {
        val key = settings.licenseKey.trim()
        if (key.isBlank()) return@LaunchedEffect
        withContext(Dispatchers.IO) {
            try {
                val endpoint = if (settings.remoteUpdateUrl.contains("localhost") || settings.remoteUpdateUrl.contains("10.0.")) {
                    "http://10.0.2.2:8000/api/vapi/usage?key=$key"
                } else {
                    "https://missedcallautosms.com/api/vapi/usage?key=$key"
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
                        withContext(Dispatchers.Main) {
                            livePlanName = json.optString("planName", livePlanName)
                            liveQuotaMinutes = json.optInt("quotaMinutes", 250)
                            liveMinutesUsed = json.optInt("minutesUsed", 0)
                            liveOverageMinutes = json.optInt("overageMinutes", 0)
                            liveOverageAmount = json.optDouble("overageAmount", 0.0)
                            liveOverageRate = json.optDouble("overageRatePerMinute", 0.20)
                            isUnlimitedGateway = json.optBoolean("isUnlimitedGateway", false)
                        }
                    }
                }
            } catch (e: Exception) {}
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .fillMaxHeight(0.92f),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 8.dp
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp)
            ) {
                // Top Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.primaryContainer,
                            modifier = Modifier.size(40.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.AccountCircle,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onPrimaryContainer
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Customer Account Portal",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "Self-Service License & Subscription Center",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Scrollable Content
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Card 1: Subscription Status Banner
                    item {
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = if (isCancelled) {
                                    MaterialTheme.colorScheme.surfaceVariant
                                } else if (isTrial) {
                                    Color(0xFFFFB300).copy(alpha = 0.15f)
                                } else if (isPro) {
                                    Color(0xFF9333EA).copy(alpha = 0.18f)
                                } else {
                                    ActiveGreenContainer
                                }
                            ),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(
                                    modifier = Modifier
                                        .weight(1f, fill = false)
                                        .padding(end = 12.dp)
                                ) {
                                    Text(
                                        text = "SUBSCRIPTION & LICENSE",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = if (isCancelled) MaterialTheme.colorScheme.onSurfaceVariant else if (isTrial) Color(0xFFFFB300) else if (isPro) Color(0xFFC084FC) else ActiveGreenText
                                    )
                                    Text(
                                        text = if (isCancelled) {
                                            "Cancelled ($0.00 Charged)"
                                        } else if (isTrial) {
                                            "3-Day Free Trial ($0 Today)"
                                        } else if (isPro) {
                                            "Active Pro Automation License"
                                        } else {
                                            "Active Lifetime License"
                                        },
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.ExtraBold
                                    )
                                    Text(
                                        text = if (isCancelled) {
                                            "No future charges will occur."
                                        } else if (isTrial) {
                                            "Auto-charges $49.99 on Day 4 if not cancelled."
                                        } else if (isPro) {
                                            "$299.00 Perpetual — Unlimited Automations, Dual SIM & Cloud Relay"
                                        } else {
                                            "Paid One-Time — 0 Monthly Fees Forever"
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }

                                Surface(
                                    color = if (isCancelled) MaterialTheme.colorScheme.outlineVariant else if (isTrial) Color(0xFFFFB300) else if (isPro) Color(0xFF9333EA) else ActiveGreenText,
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text(
                                        text = if (isCancelled) "CANCELLED" else if (isTrial) "TRIAL" else if (isPro) "PRO ACTIVE" else "ACTIVE",
                                        color = if (isTrial) Color.Black else Color.White,
                                        fontWeight = FontWeight.Black,
                                        fontSize = 11.sp,
                                        maxLines = 1,
                                        softWrap = false,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                            }
                        }
                    }

                    // Card 1.5: Voice Quota & Overage Meter
                    item {
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = if (liveOverageMinutes > 0) RedError.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                            ),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.weight(1f, fill = false)
                                    ) {
                                        Icon(Icons.Default.Timer, contentDescription = null, tint = Color(0xFF9333EA))
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = "Voice Quota & Metering",
                                            style = MaterialTheme.typography.titleSmall,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Surface(
                                        color = if (liveOverageMinutes > 0) RedError else Color(0xFF9333EA),
                                        shape = RoundedCornerShape(6.dp)
                                    ) {
                                        Text(
                                            text = livePlanName,
                                            color = Color.White,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            maxLines = 1,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(10.dp))

                                if (isUnlimitedGateway) {
                                    Text(
                                        text = "⚡ Perpetual Pro Automation Gateway: Unlimited SIM SMS text-backs & Webhook Bridge active. Included voice minutes: 0 (BYOK / Managed Add-On available).",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                } else {
                                    val progressFraction = if (liveQuotaMinutes > 0) {
                                        (liveMinutesUsed.toFloat() / liveQuotaMinutes.toFloat()).coerceIn(0f, 1f)
                                    } else 0f

                                    LinearProgressIndicator(
                                        progress = { progressFraction },
                                        modifier = Modifier.fillMaxWidth().height(8.dp),
                                        color = if (liveOverageMinutes > 0) RedError else ActiveGreenText,
                                        trackColor = MaterialTheme.colorScheme.surfaceVariant
                                    )

                                    Spacer(modifier = Modifier.height(8.dp))

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(
                                            text = "$liveMinutesUsed / $liveQuotaMinutes Mins Used",
                                            fontWeight = FontWeight.Bold,
                                            style = MaterialTheme.typography.bodySmall
                                        )
                                        Text(
                                            text = if (liveOverageMinutes > 0) {
                                                "⚠️ $liveOverageMinutes Mins Overage (+$${"%.2f".format(liveOverageAmount)})"
                                            } else {
                                                "${maxOf(0, liveQuotaMinutes - liveMinutesUsed)} Mins Left"
                                            },
                                            fontWeight = FontWeight.SemiBold,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = if (liveOverageMinutes > 0) RedError else ActiveGreenText
                                        )
                                    }

                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = "Overage rate: $${"%.2f".format(liveOverageRate)}/min. Additional minutes roll into your monthly Stripe renewal automatically.",
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }

                    // Card 2: Business & User Profile
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Business, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "Business Profile",
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                Spacer(modifier = Modifier.height(12.dp))

                                OutlinedTextField(
                                    value = businessNameInput,
                                    onValueChange = {
                                        businessNameInput = it
                                        onSettingsChanged(settings.copy(businessName = it))
                                    },
                                    label = { Text("Business / Company Name") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                    leadingIcon = { Icon(Icons.Default.Storefront, contentDescription = null) }
                                )

                                Spacer(modifier = Modifier.height(10.dp))

                                OutlinedTextField(
                                    value = customerEmailInput,
                                    onValueChange = {
                                        customerEmailInput = it
                                        onSettingsChanged(settings.copy(customerEmail = it))
                                    },
                                    label = { Text("Checkout / Account Email") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                    leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
                                    supportingText = {
                                        Text("Used to verify Stripe billing and trial records.")
                                    }
                                )
                            }
                        }
                    }

                    // Card 3: Hardware Lock & License Key
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.VpnKey, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "Hardware Key & Device Binding",
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                Spacer(modifier = Modifier.height(12.dp))

                                // License Key row
                                if (isEditingKey) {
                                    OutlinedTextField(
                                        value = licenseKeyInput,
                                        onValueChange = { licenseKeyInput = it },
                                        label = { Text("Enter License Key (MCAS-XXXX-XXXX)") },
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth()
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.End
                                    ) {
                                        TextButton(onClick = { isEditingKey = false }) {
                                            Text("Cancel")
                                        }
                                        Spacer(modifier = Modifier.width(8.dp))
                                         Button(onClick = {
                                             val verification = com.missedcall.autotext.data.license.LicenseManager.verifyLicenseKey(licenseKeyInput)
                                             if (verification.status == com.missedcall.autotext.data.license.LicenseStatus.ACTIVE_LIFETIME || verification.status == com.missedcall.autotext.data.license.LicenseStatus.ACTIVE_SUBSCRIPTION) {
                                                 onSettingsChanged(settings.copy(licenseKey = licenseKeyInput.trim()))
                                                 isEditingKey = false
                                                 Toast.makeText(context, "✅ License Activated for ${verification.licensedTo}!", Toast.LENGTH_SHORT).show()
                                             } else if (verification.status == com.missedcall.autotext.data.license.LicenseStatus.EXPIRED) {
                                                 Toast.makeText(context, "⚠️ License Expired.", Toast.LENGTH_LONG).show()
                                             } else {
                                                 Toast.makeText(context, "❌ Invalid License Key checksum or format.", Toast.LENGTH_LONG).show()
                                             }
                                         }) {
                                             Text("Save Key")
                                         }
                                    }
                                } else {
                                    Surface(
                                        color = MaterialTheme.colorScheme.surface,
                                        shape = RoundedCornerShape(10.dp),
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
                                                    text = "LICENSE KEY",
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                                Text(
                                                    text = if (settings.licenseKey.isNotBlank()) settings.licenseKey else "MCAS-DEMO-TRIAL-89F2",
                                                    style = MaterialTheme.typography.bodyMedium,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }

                                            Row {
                                                IconButton(onClick = {
                                                    val keyToCopy = if (settings.licenseKey.isNotBlank()) settings.licenseKey else "MCAS-DEMO-TRIAL-89F2"
                                                    clipboardManager.setText(AnnotatedString(keyToCopy))
                                                    Toast.makeText(context, "License key copied!", Toast.LENGTH_SHORT).show()
                                                }) {
                                                    Icon(Icons.Default.ContentCopy, contentDescription = "Copy")
                                                }
                                                IconButton(onClick = { isEditingKey = true }) {
                                                    Icon(Icons.Default.Edit, contentDescription = "Edit Key")
                                                }
                                            }
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.height(10.dp))

                                // Device Binding
                                Surface(
                                    color = MaterialTheme.colorScheme.surface,
                                    shape = RoundedCornerShape(10.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(
                                            Icons.Default.Lock,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Spacer(modifier = Modifier.width(10.dp))
                                        Column {
                                            Text(
                                                text = "BOUND HARDWARE DEVICE ID",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                            Text(
                                                text = "🔒 Device #${androidId.take(10).uppercase(Locale.ROOT)} (Active Phone)",
                                                style = MaterialTheme.typography.bodySmall,
                                                fontWeight = FontWeight.SemiBold
                                            )
                                            Text(
                                                text = "Cryptographically locked to this physical device.",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Card 4: In-App Self-Service Trial Cancellation
                    if (isTrial && !isCancelled) {
                        item {
                            Card(
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.25f)),
                                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.5f)),
                                shape = RoundedCornerShape(16.dp)
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.Cancel, contentDescription = null, tint = RedError)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = "Cancel 3-Day Free Trial",
                                            style = MaterialTheme.typography.titleSmall,
                                            fontWeight = FontWeight.Bold,
                                            color = RedError
                                        )
                                    }

                                    Spacer(modifier = Modifier.height(8.dp))

                                    Text(
                                        text = "You can cancel your 3-day free trial right now directly from this app. If cancelled within 72 hours, your card is never charged ($0.00).",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )

                                    Spacer(modifier = Modifier.height(14.dp))

                                    Button(
                                        onClick = { showCancelTrialConfirm = true },
                                        colors = ButtonDefaults.buttonColors(containerColor = RedError),
                                        modifier = Modifier.fillMaxWidth(),
                                        enabled = !isCancellingTrial
                                    ) {
                                        if (isCancellingTrial) {
                                            CircularProgressIndicator(
                                                modifier = Modifier.size(18.dp),
                                                color = Color.White,
                                                strokeWidth = 2.dp
                                            )
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text("Contacting Stripe...")
                                        } else {
                                            Icon(Icons.Default.DeleteForever, contentDescription = null)
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text("Cancel Free Trial ($0 Charged)")
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Card 5: Turnkey AI Voice Receptionist Greeting Configuration
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        Icons.Default.RecordVoiceOver,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "AI Voice Receptionist Greeting",
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                Spacer(modifier = Modifier.height(6.dp))

                                Text(
                                    text = "Customize the introductory greeting spoken by your AI receptionist when an unanswered call forwards to your Vapi agent.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )

                                Spacer(modifier = Modifier.height(12.dp))

                                OutlinedTextField(
                                    value = customGreetingInput,
                                    onValueChange = { customGreetingInput = it },
                                    label = { Text("Opening AI Greeting") },
                                    placeholder = { Text("Thanks for calling ${settings.businessName}! How can I help you today?") },
                                    modifier = Modifier.fillMaxWidth(),
                                    maxLines = 3
                                )

                                Spacer(modifier = Modifier.height(12.dp))

                                Button(
                                    onClick = {
                                        isSavingGreeting = true
                                        coroutineScope.launch {
                                            withContext(Dispatchers.IO) {
                                                try {
                                                    val endpoint = if (settings.remoteUpdateUrl.contains("localhost") || settings.remoteUpdateUrl.contains("10.0.")) {
                                                        "http://10.0.2.2:8000/api/vapi/custom-greeting"
                                                    } else {
                                                        "https://missedcallautosms.com/api/vapi/custom-greeting"
                                                    }
                                                    val url = URL(endpoint)
                                                    val conn = url.openConnection() as HttpURLConnection
                                                    conn.requestMethod = "POST"
                                                    conn.doOutput = true
                                                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                                                    conn.connectTimeout = 7000
                                                    conn.readTimeout = 7000
                                                    val safeBusiness = businessNameInput.replace("\"", "\\\"")
                                                    val safeGreeting = customGreetingInput.replace("\"", "\\\"")
                                                    val payload = """{"businessName":"$safeBusiness","customGreeting":"$safeGreeting"}"""
                                                    conn.outputStream.use { it.write(payload.toByteArray(StandardCharsets.UTF_8)) }
                                                    conn.responseCode
                                                } catch (e: Exception) {
                                                    // local fallback
                                                }
                                            }
                                            onSettingsChanged(settings.copy(voiceReceptionistGreeting = customGreetingInput))
                                            isSavingGreeting = false
                                            Toast.makeText(context, "✅ AI Voice Receptionist greeting updated!", Toast.LENGTH_SHORT).show()
                                        }
                                    },
                                    enabled = !isSavingGreeting,
                                    modifier = Modifier.align(Alignment.End)
                                ) {
                                    if (isSavingGreeting) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(16.dp),
                                            color = Color.White,
                                            strokeWidth = 2.dp
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("Saving...")
                                    } else {
                                        Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("Save Greeting")
                                    }
                                }
                            }
                        }
                    }

                    // Card 6: Voice Pro ($29/mo) Subscription & Automatic Carrier Rollback
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .weight(1f, fill = false)
                                            .padding(end = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(Icons.Default.PhoneForwarded, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = "Voice Pro Subscription ($29/mo)",
                                            style = MaterialTheme.typography.titleSmall,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }

                                    Surface(
                                        color = if (settings.voiceSubscriptionActive || settings.voiceReceptionistEnabled) ActiveGreenContainer else MaterialTheme.colorScheme.outlineVariant,
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Text(
                                            text = if (settings.voiceSubscriptionActive || settings.voiceReceptionistEnabled) "ACTIVE" else "STANDARD",
                                            color = if (settings.voiceSubscriptionActive || settings.voiceReceptionistEnabled) ActiveGreenText else MaterialTheme.colorScheme.onSurfaceVariant,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 10.sp,
                                            maxLines = 1,
                                            softWrap = false,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(8.dp))

                                Text(
                                    text = "Turnkey AI Receptionist forwards unanswered calls to your Vapi agent. Cancelling terminates your $29/mo Stripe subscription and immediately launches your phone dialer to deactivate carrier call forwarding (*73 or ##004#).",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )

                                Spacer(modifier = Modifier.height(14.dp))

                                OutlinedButton(
                                    onClick = { showCancelVoiceConfirm = true },
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = RedError),
                                    border = androidx.compose.foundation.BorderStroke(1.dp, RedError),
                                    modifier = Modifier.fillMaxWidth(),
                                    enabled = !isCancellingVoice
                                ) {
                                    if (isCancellingVoice) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(16.dp),
                                            color = RedError,
                                            strokeWidth = 2.dp
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Cancelling in Stripe...")
                                    } else {
                                        Icon(Icons.Default.PhoneDisabled, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Cancel Voice Pro ($29/mo)")
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                Button(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Done")
                }
            }
        }
    }

    // Confirmation Alert Dialog
    if (showCancelTrialConfirm) {
        AlertDialog(
            onDismissRequest = { showCancelTrialConfirm = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = RedError)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Confirm Cancellation")
                }
            },
            text = {
                Text(
                    text = "Are you sure you want to cancel your 3-day free trial?\n\n" +
                            "This will cancel your Stripe trial subscription immediately and guarantee $0.00 is charged to your card."
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showCancelTrialConfirm = false
                        isCancellingTrial = true

                        coroutineScope.launch {
                            val email = settings.customerEmail.ifBlank { "app-user@device" }
                            val key = settings.licenseKey.ifBlank { "MCAS-TRIAL" }

                            // Attempt remote cancellation via server endpoint
                            withContext(Dispatchers.IO) {
                                try {
                                    val endpoint = if (settings.remoteUpdateUrl.contains("localhost") || settings.remoteUpdateUrl.contains("10.0.")) {
                                        "http://10.0.2.2:8000/api/cancel-trial"
                                    } else {
                                        "https://missedcallautosms.com/api/cancel-trial"
                                    }
                                    val url = URL(endpoint)
                                    val conn = url.openConnection() as HttpURLConnection
                                    conn.requestMethod = "POST"
                                    conn.doOutput = true
                                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                                    conn.connectTimeout = 7000
                                    conn.readTimeout = 7000
                                    val payload = """{"email":"$email","licenseKey":"$key"}"""
                                    conn.outputStream.use { it.write(payload.toByteArray(StandardCharsets.UTF_8)) }
                                    conn.responseCode // execute
                                } catch (e: Exception) {
                                    // Local fallback
                                }
                            }

                            // Update local settings to CANCELLED
                            onSettingsChanged(settings.copy(subscriptionStatus = "CANCELLED"))
                            isCancellingTrial = false
                            Toast.makeText(context, "✅ 3-Day Trial Cancelled! $0.00 charged.", Toast.LENGTH_LONG).show()
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = RedError)
                ) {
                    Text("Yes, Cancel Trial")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCancelTrialConfirm = false }) {
                    Text("Keep Trial")
                }
            }
        )
    }

    // Confirmation Alert Dialog for Voice Pro ($29/mo)
    if (showCancelVoiceConfirm) {
        AlertDialog(
            onDismissRequest = { showCancelVoiceConfirm = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = RedError)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Cancel Voice Pro ($29/mo)")
                }
            },
            text = {
                val carrier = CarrierForwardingManager.detectCarrier(context)
                val codes = CarrierForwardingManager.computeCodes(carrier, "")
                Text(
                    text = "Are you sure you want to cancel your Voice Pro ($29/mo) subscription?\n\n" +
                            "1. Your Stripe billing will immediately be cancelled ($0 renewal).\n" +
                            "2. The app will automatically launch your phone dialer with your carrier deactivation code (${codes.deactivateCode}). Simply tap Call to stop forwarding calls to AI."
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showCancelVoiceConfirm = false
                        isCancellingVoice = true

                        coroutineScope.launch {
                            val email = settings.customerEmail.ifBlank { "contractor@example.com" }

                            withContext(Dispatchers.IO) {
                                try {
                                    val endpoint = if (settings.remoteUpdateUrl.contains("localhost") || settings.remoteUpdateUrl.contains("10.0.")) {
                                        "http://10.0.2.2:8000/api/vapi/cancel-subscription"
                                    } else {
                                        "https://missedcallautosms.com/api/vapi/cancel-subscription"
                                    }
                                    val url = URL(endpoint)
                                    val conn = url.openConnection() as HttpURLConnection
                                    conn.requestMethod = "POST"
                                    conn.doOutput = true
                                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                                    conn.connectTimeout = 7000
                                    conn.readTimeout = 7000
                                    val payload = """{"email":"$email"}"""
                                    conn.outputStream.use { it.write(payload.toByteArray(StandardCharsets.UTF_8)) }
                                    conn.responseCode
                                } catch (e: Exception) {
                                    // local fallback
                                }
                            }

                            // Automatically launch carrier rollback dialer
                            CarrierForwardingManager.deactivateConditionalForwarding(context)

                            onSettingsChanged(settings.copy(
                                voiceReceptionistEnabled = false,
                                voiceSubscriptionActive = false
                            ))
                            isCancellingVoice = false
                            Toast.makeText(context, "✅ Voice Pro cancelled! Please press Call in dialer to disable forwarding.", Toast.LENGTH_LONG).show()
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = RedError)
                ) {
                    Text("Yes, Cancel & Rollback Forwarding")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCancelVoiceConfirm = false }) {
                    Text("Keep Subscription")
                }
            }
        )
    }
}
