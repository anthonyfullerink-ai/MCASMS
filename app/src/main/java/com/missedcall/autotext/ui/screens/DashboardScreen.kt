package com.missedcall.autotext.ui.screens

import android.provider.Settings
import android.widget.Toast
import androidx.compose.animation.core.*
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.data.db.CallLogEvent
import com.missedcall.autotext.data.db.LogStatus
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.ui.theme.GrayPaused
import com.missedcall.autotext.ui.theme.AmberWarning
import com.missedcall.autotext.ui.theme.RedError
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit,
    logs: List<CallLogEvent>,
    onNavigateToTab: (Int) -> Unit = {}
) {
    val context = LocalContext.current
    var showAccountPortal by remember { mutableStateOf(false) }
    var showJobValueDialog by remember { mutableStateOf(false) }

    val successfulReplies = logs.count { it.status == LogStatus.SENT }
    // 33% estimated conversion rate on instant auto-text response
    val estimatedSavedRevenue = (successfulReplies * 0.33 * settings.averageJobValue).roundToInt()
    val currencyFormat = NumberFormat.getCurrencyInstance(Locale.US)

    // Pulsing animation for active status
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item { Spacer(modifier = Modifier.height(2.dp)) }

        // 1. Live Hero Appliance Switch Card
        item {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = if (settings.masterEnabled) ActiveGreenContainer.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
                ),
                border = BorderStroke(
                    width = 1.dp,
                    color = if (settings.masterEnabled) ActiveGreenText.copy(alpha = 0.6f) else MaterialTheme.colorScheme.outlineVariant
                ),
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(12.dp)
                                    .clip(CircleShape)
                                    .background(
                                        if (settings.masterEnabled) ActiveGreenText.copy(alpha = pulseAlpha) else GrayPaused
                                    )
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Column {
                                Text(
                                    text = if (settings.masterEnabled) "APPLIANCE ACTIVE" else "APPLIANCE PAUSED",
                                    fontWeight = FontWeight.Black,
                                    fontSize = 14.sp,
                                    color = if (settings.masterEnabled) ActiveGreenText else GrayPaused,
                                    letterSpacing = 0.5.sp
                                )
                                Text(
                                    text = if (settings.masterEnabled) "Listening for missed calls" else "Auto-replies suspended",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
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

                    Spacer(modifier = Modifier.height(10.dp))

                    Text(
                        text = if (settings.masterEnabled)
                            "Instant auto-replies will dispatch via carrier SIM line. 24/7 AI Voice reception is standing by."
                        else
                            "Appliance paused. Switch ON to resume automated text replies and AI call handling.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        // 2. Real-Time Minute Quota & Metering Card
        item {
            VoiceMinuteMeterCard(
                settings = settings,
                onOpenAccountPortal = { showAccountPortal = true }
            )
        }

        // 3. 2x2 Mission Control Metric Grid
        item {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Row 1: Replies & Saved Revenue
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // Metric 1: Replies
                    Card(
                        modifier = Modifier.weight(1f),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Auto-Replies",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Icon(
                                    Icons.Default.Sms,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "$successfulReplies",
                                fontSize = 26.sp,
                                fontWeight = FontWeight.Black,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Text(
                                text = "Sent via SIM line",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    // Metric 2: Est Saved Revenue
                    Card(
                        modifier = Modifier
                            .weight(1f)
                            .clickable { showJobValueDialog = true },
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Saved Revenue",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Icon(
                                    Icons.Default.AttachMoney,
                                    contentDescription = null,
                                    tint = ActiveGreenText,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = currencyFormat.format(estimatedSavedRevenue),
                                fontSize = 22.sp,
                                fontWeight = FontWeight.Black,
                                color = ActiveGreenText
                            )
                            Text(
                                text = "$${settings.averageJobValue.toInt()} avg job ✎",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                // Row 2: Voice Forwarding & SIM Line
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // Metric 3: AI Voice Receptionist Status
                    Card(
                        modifier = Modifier
                            .weight(1f)
                            .clickable { onNavigateToTab(1) },
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "AI Receptionist",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Icon(
                                    Icons.Default.RecordVoiceOver,
                                    contentDescription = null,
                                    tint = if (settings.voiceReceptionistEnabled) Color(0xFF9C27B0) else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = if (settings.voiceReceptionistEnabled) "FORWARDING" else "STANDBY",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (settings.voiceReceptionistEnabled) Color(0xFF9C27B0) else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = if (settings.voiceReceptionistEnabled) "*71 15s Ring Active" else "Carrier standard ➔",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    // Metric 4: SIM Line Slot
                    Card(
                        modifier = Modifier
                            .weight(1f)
                            .clickable { onNavigateToTab(3) },
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "SIM Line",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Icon(
                                    Icons.Default.SimCard,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = when (settings.preferredSimSlot) {
                                    1 -> "SIM 1"
                                    2 -> "SIM 2 (eSIM)"
                                    else -> "AUTO SIM"
                                },
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Text(
                                text = "Carrier routing ➔",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }

        // 4. Quick Navigation Actions Bar
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Action 1: Voice Hub
                    TextButton(
                        onClick = { onNavigateToTab(1) },
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.RecordVoiceOver, contentDescription = null, tint = Color(0xFF9C27B0), modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.height(2.dp))
                            Text("Voice Hub", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                        }
                    }

                    Box(modifier = Modifier.height(24.dp).width(1.dp).background(MaterialTheme.colorScheme.outlineVariant))

                    // Action 2: Prompt Studio
                    TextButton(
                        onClick = { onNavigateToTab(2) },
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.height(2.dp))
                            Text("Prompts Studio", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                        }
                    }

                    Box(modifier = Modifier.height(24.dp).width(1.dp).background(MaterialTheme.colorScheme.outlineVariant))

                    // Action 3: Account & Billing
                    TextButton(
                        onClick = { showAccountPortal = true },
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.AccountCircle, contentDescription = null, tint = ActiveGreenText, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.height(2.dp))
                            Text("Account Portal", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                        }
                    }
                }
            }
        }

        // 5. Recent Activity Stream Header
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Recent Auto-Responses",
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleMedium
                )
                TextButton(
                    onClick = { onNavigateToTab(4) },
                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)
                ) {
                    Text("View All (${logs.size}) ➔", fontSize = 12.sp)
                }
            }
        }

        // Recent Logs List (Top 4)
        if (logs.isEmpty()) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Info, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = "No missed calls recorded yet. When a call is missed, instant auto-replies will appear here in real time.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        } else {
            items(logs.take(4)) { log ->
                val dateFormat = SimpleDateFormat("MMM dd, h:mm a", Locale.getDefault())
                val timeStr = dateFormat.format(Date(log.timestamp))

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = log.phoneNumber,
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Text(
                                text = timeStr,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        Surface(
                            color = if (log.status == LogStatus.SENT) ActiveGreenContainer else MaterialTheme.colorScheme.errorContainer,
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text(
                                text = if (log.status == LogStatus.SENT) "Replied via SIM" else log.status.name,
                                color = if (log.status == LogStatus.SENT) ActiveGreenText else MaterialTheme.colorScheme.error,
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                    }
                }
            }
        }

        item { Spacer(modifier = Modifier.height(16.dp)) }
    }

    // Average Job Value Config Dialog
    if (showJobValueDialog) {
        AlertDialog(
            onDismissRequest = { showJobValueDialog = false },
            title = { Text("Average Job Value") },
            text = {
                Column {
                    Text(
                        text = "Select your average client job revenue to accurately estimate recovered revenue from instant auto-text responses.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(250.0, 450.0, 750.0, 1200.0).forEach { preset ->
                            FilterChip(
                                selected = settings.averageJobValue == preset,
                                onClick = {
                                    onSettingsChanged(settings.copy(averageJobValue = preset))
                                    showJobValueDialog = false
                                },
                                label = { Text("$${preset.toInt()}") }
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showJobValueDialog = false }) {
                    Text("Done")
                }
            }
        )
    }

    if (showAccountPortal) {
        CustomerAccountPortalDialog(
            settings = settings,
            onSettingsChanged = onSettingsChanged,
            onDismiss = { showAccountPortal = false }
        )
    }
}

/**
 * Real-Time Minute Quota & Overage Meter Card
 * Connects directly to /api/vapi/usage to display pooled minutes, remaining quota,
 * active overage tracking, and direct access to billing.
 */
@Composable
fun VoiceMinuteMeterCard(
    settings: AppSettings,
    onOpenAccountPortal: () -> Unit
) {
    val coroutineScope = rememberCoroutineScope()
    var isLoading by remember { mutableStateOf(false) }
    var planName by remember { mutableStateOf("Autonomous Front Desk Bundle") }
    var quotaMinutes by remember { mutableIntStateOf(250) }
    var minutesUsed by remember { mutableIntStateOf(0) }
    var overageMinutes by remember { mutableIntStateOf(0) }
    var overageAmount by remember { mutableDoubleStateOf(0.0) }
    var isUnlimitedGateway by remember { mutableStateOf(false) }

    fun fetchUsage() {
        val key = settings.licenseKey.trim()
        if (key.isBlank()) return
        isLoading = true
        coroutineScope.launch {
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
                                planName = json.optString("planName", planName)
                                quotaMinutes = json.optInt("quotaMinutes", 250)
                                minutesUsed = json.optInt("minutesUsed", 0)
                                overageMinutes = json.optInt("overageMinutes", 0)
                                overageAmount = json.optDouble("overageAmount", 0.0)
                                isUnlimitedGateway = json.optBoolean("isUnlimitedGateway", false)
                            }
                        }
                    }
                } catch (e: Exception) {
                    // Graceful offline fallback
                } finally {
                    withContext(Dispatchers.Main) {
                        isLoading = false
                    }
                }
            }
        }
    }

    LaunchedEffect(settings.licenseKey) {
        fetchUsage()
    }

    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (overageMinutes > 0) {
                RedError.copy(alpha = 0.12f)
            } else {
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
            }
        ),
        border = BorderStroke(
            1.dp,
            if (overageMinutes > 0) RedError.copy(alpha = 0.6f) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
        ),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header: Plan Title & Action Icon
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = if (overageMinutes > 0) RedError else Color(0xFF9333EA),
                        modifier = Modifier.size(32.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                if (overageMinutes > 0) Icons.Default.Warning else Icons.Default.Timer,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = planName,
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleSmall
                        )
                        Text(
                            text = if (isUnlimitedGateway) "Perpetual License • Cloud Relay API" else "Live Monthly Voice Quota Meter",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                IconButton(
                    onClick = { fetchUsage() },
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        Icons.Default.Refresh,
                        contentDescription = "Refresh Usage",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            if (isUnlimitedGateway) {
                Surface(
                    color = Color(0xFF9333EA).copy(alpha = 0.15f),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "⚡ Unlimited local SIM SMS automations active. Voice reception requires BYOK key or Pooled Minutes Add-On.",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            } else {
                // Progress Bar
                val progressFraction = if (quotaMinutes > 0) {
                    (minutesUsed.toFloat() / quotaMinutes.toFloat()).coerceIn(0f, 1f)
                } else 0f

                val barColor = when {
                    overageMinutes > 0 -> RedError
                    minutesUsed >= (quotaMinutes * 0.8f) -> AmberWarning
                    else -> ActiveGreenText
                }

                LinearProgressIndicator(
                    progress = { progressFraction },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp),
                    color = barColor,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )

                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "$minutesUsed / $quotaMinutes Mins Used",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.bodyMedium
                    )

                    val remaining = maxOf(0, quotaMinutes - minutesUsed)
                    Text(
                        text = if (overageMinutes > 0) {
                            "⚠️ $overageMinutes Mins Overage (+$${"%.2f".format(overageAmount)})"
                        } else {
                            "$remaining Mins Left"
                        },
                        fontWeight = FontWeight.SemiBold,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (overageMinutes > 0) RedError else ActiveGreenText
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                TextButton(
                    onClick = onOpenAccountPortal,
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    Text("Manage Billing & Quota ➔", fontSize = 12.sp)
                }
            }
        }
    }
}
