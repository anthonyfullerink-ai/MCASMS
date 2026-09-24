package com.missedcall.autotext.ui.screens

import android.provider.Settings
import android.widget.Toast
import androidx.compose.animation.core.*
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.data.db.CallLogEvent
import com.missedcall.autotext.data.db.LogStatus
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.ui.theme.AmberWarning
import com.missedcall.autotext.ui.theme.GrayPaused
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.NumberFormat
import java.util.*
import kotlin.math.roundToInt

/**
 * Modular, Reorderable Analytics Dashboard
 * Features:
 * - Missed calls retrieved by SMS
 * - Missed calls retrieved by AI Virtual Agent (if subscribed)
 * - Cost accumulated by AI VA & Minute Quota
 * - Estimated saved revenue
 * - Total SMS & voice auto-replies / follow-ups
 * - User capability to customize, toggle, and reorder dashboard cards
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit,
    logs: List<CallLogEvent>,
    onNavigateToTab: (Int) -> Unit = {}
) {
    val context = LocalContext.current
    var showCustomizeCardsDialog by remember { mutableStateOf(false) }

    val successfulSmsReplies = logs.count { it.status == LogStatus.SENT }
    val totalMissedCalls = logs.size
    val estimatedSavedRevenue = (successfulSmsReplies * 0.33 * settings.averageJobValue).roundToInt()
    val currencyFormat = NumberFormat.getCurrencyInstance(Locale.US)

    // Live Vapi minute usage state
    var liveMinutesUsed by remember { mutableIntStateOf(0) }
    var liveQuotaMinutes by remember { mutableIntStateOf(250) }
    var liveOverageAmount by remember { mutableDoubleStateOf(0.0) }
    var liveAiCallsCount by remember { mutableIntStateOf(0) }

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
                            liveMinutesUsed = json.optInt("minutesUsed", 0)
                            liveQuotaMinutes = json.optInt("quotaMinutes", 250)
                            liveOverageAmount = json.optDouble("overageAmount", 0.0)
                            liveAiCallsCount = json.optInt("callsCount", Math.max(1, liveMinutesUsed / 2))
                        }
                    }
                }
            } catch (e: Exception) {}
        }
    }

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

    val defaultCardOrder = listOf("HERO", "SMS_METRICS", "VOICE_METRICS", "COST_QUOTA", "REVENUE", "FOLLOW_UPS", "HARDWARE")
    val cardOrder = remember(settings.dashboardCardOrder) {
        val raw = settings.dashboardCardOrder.split(",").map { it.trim() }.filter { it.isNotBlank() }
        val mapped = raw.map { if (it == "QUOTA") "COST_QUOTA" else it }
        val filtered = mapped.filter { defaultCardOrder.contains(it) }.distinct()
        val missing = defaultCardOrder.filter { !filtered.contains(it) }
        val result = filtered + missing
        if (result.isEmpty()) defaultCardOrder else result
    }
    val hiddenCards = remember(settings.dashboardHiddenCards) {
        settings.dashboardHiddenCards.split(",").map { it.trim() }
            .map { if (it == "QUOTA") "COST_QUOTA" else it }
            .filter { it.isNotBlank() }
            .toSet()
    }

    if (showCustomizeCardsDialog) {
        CustomizeCardsDialog(
            currentOrder = cardOrder,
            hiddenCards = hiddenCards,
            onSaveOrder = { newOrder, newHidden ->
                val cleanOrder = newOrder.map { if (it == "QUOTA") "COST_QUOTA" else it }.distinct()
                val cleanHidden = newHidden.map { if (it == "QUOTA") "COST_QUOTA" else it }.toSet()
                onSettingsChanged(
                    settings.copy(
                        dashboardCardOrder = cleanOrder.joinToString(","),
                        dashboardHiddenCards = cleanHidden.joinToString(",")
                    )
                )
                showCustomizeCardsDialog = false
            },
            onDismiss = { showCustomizeCardsDialog = false }
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item { Spacer(modifier = Modifier.height(2.dp)) }

        // Top customize action bar
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Performance Overview",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                TextButton(
                    onClick = { showCustomizeCardsDialog = true },
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    Icon(Icons.Default.Tune, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Customize Cards", fontSize = 12.sp)
                }
            }
        }

        // Render cards dynamically according to user's custom sort order
        cardOrder.forEach { cardId ->
            if (!hiddenCards.contains(cardId)) {
                item(key = cardId) {
                    when (cardId) {
                        "HERO" -> HeroApplianceCard(
                            settings = settings,
                            pulseAlpha = pulseAlpha,
                            onToggle = { isChecked -> onSettingsChanged(settings.copy(masterEnabled = isChecked)) }
                        )
                        "SMS_METRICS" -> SmsMetricsCard(
                            successfulSmsReplies = successfulSmsReplies,
                            totalMissedCalls = totalMissedCalls,
                            settings = settings
                        )
                        "VOICE_METRICS" -> VoiceMetricsCard(
                            aiCallsCount = liveAiCallsCount,
                            minutesUsed = liveMinutesUsed,
                            settings = settings,
                            onNavigateToVoice = { onNavigateToTab(2) }
                        )
                        "COST_QUOTA", "QUOTA" -> CostAndQuotaCard(
                            minutesUsed = liveMinutesUsed,
                            quotaMinutes = liveQuotaMinutes,
                            overageAmount = liveOverageAmount,
                            settings = settings
                        )
                        "REVENUE" -> SavedRevenueCard(
                            estimatedSavedRevenue = estimatedSavedRevenue,
                            currencyFormat = currencyFormat,
                            settings = settings,
                            onUpdateJobValue = { newVal -> onSettingsChanged(settings.copy(averageJobValue = newVal)) }
                        )
                        "FOLLOW_UPS" -> FollowUpsCard(
                            smsReplies = successfulSmsReplies,
                            voiceCalls = liveAiCallsCount
                        )
                        "HARDWARE" -> HardwareStatusCard(
                            settings = settings
                        )
                    }
                }
            }
        }

        item { Spacer(modifier = Modifier.height(16.dp)) }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun HeroApplianceCard(
    settings: AppSettings,
    pulseAlpha: Float,
    onToggle: (Boolean) -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (settings.masterEnabled) ActiveGreenContainer.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
        ),
        border = BorderStroke(
            1.dp,
            if (settings.masterEnabled) ActiveGreenText.copy(alpha = 0.6f) else MaterialTheme.colorScheme.outlineVariant
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
                            text = if (settings.masterEnabled) "Listening for missed calls via phone SIM" else "Auto-replies suspended",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Switch(
                    checked = settings.masterEnabled,
                    onCheckedChange = onToggle,
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = ActiveGreenText,
                        checkedTrackColor = ActiveGreenContainer
                    )
                )
            }
        }
    }
}

@Composable
fun SmsMetricsCard(
    successfulSmsReplies: Int,
    totalMissedCalls: Int,
    settings: AppSettings
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.ChatBubble, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Missed Calls Rescued by SMS", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        text = "$successfulSmsReplies",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black,
                        color = ActiveGreenText
                    )
                    Text("Auto-Texts Dispatched", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = if (totalMissedCalls > 0) "${((successfulSmsReplies.toDouble() / totalMissedCalls) * 100).toInt()}%" else "100%",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Text("Delivery Success Rate", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun VoiceMetricsCard(
    aiCallsCount: Int,
    minutesUsed: Int,
    settings: AppSettings,
    onNavigateToVoice: () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF673AB7).copy(alpha = 0.08f)),
        border = BorderStroke(1.dp, Color(0xFF9C27B0).copy(alpha = 0.3f)),
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
                    Icon(Icons.Default.RecordVoiceOver, contentDescription = null, tint = Color(0xFFAB47BC), modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("AI Virtual Agent Calls", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                }
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = Color(0xFF673AB7).copy(alpha = 0.2f)
                ) {
                    Text(
                        text = "VAPI LIVE",
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFCE93D8)
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        text = "$aiCallsCount",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black,
                        color = Color(0xFFAB47BC)
                    )
                    Text("Calls Answered & Triaged", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "$minutesUsed mins",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text("Total Talk Time", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun CostAndQuotaCard(
    minutesUsed: Int,
    quotaMinutes: Int,
    overageAmount: Double,
    settings: AppSettings
) {
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
                    Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("AI VA Minute Quota & Accumulated Cost", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            val progress = if (quotaMinutes > 0) (minutesUsed.toFloat() / quotaMinutes.toFloat()).coerceIn(0f, 1f) else 0f
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp))
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "$minutesUsed / $quotaMinutes included mins used",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = if (overageAmount > 0) "Overage: $${String.format("%.2f", overageAmount)}" else "No Overage ($0.00)",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold,
                    color = if (overageAmount > 0) AmberWarning else ActiveGreenText
                )
            }
        }
    }
}

@Composable
fun SavedRevenueCard(
    estimatedSavedRevenue: Int,
    currencyFormat: NumberFormat,
    settings: AppSettings,
    onUpdateJobValue: (Double) -> Unit
) {
    var showDialog by remember { mutableStateOf(false) }
    var tempVal by remember(settings.averageJobValue) { mutableStateOf(settings.averageJobValue.toInt().toString()) }

    if (showDialog) {
        AlertDialog(
            onDismissRequest = { showDialog = false },
            title = { Text("Average Job / Customer Value") },
            text = {
                Column {
                    Text("Enter the estimated revenue of an average booked customer or job:")
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = tempVal,
                        onValueChange = { tempVal = it },
                        label = { Text("Dollar Amount ($)") },
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    val d = tempVal.toDoubleOrNull() ?: 450.0
                    onUpdateJobValue(d)
                    showDialog = false
                }) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDialog = false }) { Text("Cancel") }
            }
        )
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
                    Icon(Icons.Default.MonetizationOn, contentDescription = null, tint = ActiveGreenText, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Estimated Rescued Revenue", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                }
                IconButton(onClick = { showDialog = true }, modifier = Modifier.size(24.dp)) {
                    Icon(Icons.Default.Edit, contentDescription = "Edit Job Value", modifier = Modifier.size(16.dp))
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = currencyFormat.format(estimatedSavedRevenue),
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Black,
                color = ActiveGreenText
            )

            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Calculated at ~33% lead conversion on instant response ($${settings.averageJobValue.toInt()}/job)",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
fun FollowUpsCard(
    smsReplies: Int,
    voiceCalls: Int
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.SyncAlt, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Total Automated Touchpoints", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        text = "${smsReplies + voiceCalls}",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Text("Total Rescues", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "$smsReplies SMS / $voiceCalls Voice",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text("Breakdown", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun HardwareStatusCard(
    settings: AppSettings
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Smartphone, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Hardware Appliance Details", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "Dispatch Route: SIM ${settings.preferredSimSlot + 1} • Jitter Delay: ${settings.jitterDelaySeconds}s • Cooldown: ${settings.cooldownHours}h",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMIZE & SORT CARDS DIALOG
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun CustomizeCardsDialog(
    currentOrder: List<String>,
    hiddenCards: Set<String>,
    onSaveOrder: (List<String>, Set<String>) -> Unit,
    onDismiss: () -> Unit
) {
    val cardTitles = mapOf(
        "HERO" to "Master Appliance Switch",
        "SMS_METRICS" to "Missed Calls Rescued by SMS",
        "VOICE_METRICS" to "AI Virtual Agent Calls",
        "COST_QUOTA" to "AI VA Minute Quota & Costs",
        "QUOTA" to "AI VA Minute Quota & Costs",
        "REVENUE" to "Estimated Rescued Revenue",
        "FOLLOW_UPS" to "Total Automated Touchpoints",
        "HARDWARE" to "Hardware Appliance Details"
    )

    var orderList by remember(currentOrder) { 
        mutableStateOf(currentOrder.map { if (it == "QUOTA") "COST_QUOTA" else it }.distinct().toMutableList()) 
    }
    var hiddenSet by remember(hiddenCards) { 
        mutableStateOf(hiddenCards.map { if (it == "QUOTA") "COST_QUOTA" else it }.toMutableSet()) 
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(0.92f).fillMaxHeight(0.80f),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 6.dp
        ) {
            Column(modifier = Modifier.fillMaxSize().padding(20.dp)) {
                Text("Customize & Sort Dashboard Cards", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                Text("Use arrows to reorder and checkbox to show or hide cards.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

                Spacer(modifier = Modifier.height(14.dp))

                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(orderList.size) { idx ->
                        val cardId = orderList[idx]
                        val isVisible = !hiddenSet.contains(cardId)
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                                    Checkbox(
                                        checked = isVisible,
                                        onCheckedChange = { checked ->
                                            val next = hiddenSet.toMutableSet()
                                            if (checked) next.remove(cardId) else next.add(cardId)
                                            hiddenSet = next
                                        }
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = cardTitles[cardId] ?: cardId,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = if (isVisible) FontWeight.SemiBold else FontWeight.Normal,
                                        color = if (isVisible) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }

                                Row {
                                    IconButton(
                                        onClick = {
                                            if (idx > 0) {
                                                val next = orderList.toMutableList()
                                                val temp = next[idx - 1]
                                                next[idx - 1] = next[idx]
                                                next[idx] = temp
                                                orderList = next
                                            }
                                        },
                                        enabled = idx > 0,
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Icon(Icons.Default.ArrowUpward, contentDescription = "Move Up", modifier = Modifier.size(18.dp))
                                    }

                                    IconButton(
                                        onClick = {
                                            if (idx < orderList.size - 1) {
                                                val next = orderList.toMutableList()
                                                val temp = next[idx + 1]
                                                next[idx + 1] = next[idx]
                                                next[idx] = temp
                                                orderList = next
                                            }
                                        },
                                        enabled = idx < orderList.size - 1,
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Icon(Icons.Default.ArrowDownward, contentDescription = "Move Down", modifier = Modifier.size(18.dp))
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Button(
                        onClick = { onSaveOrder(orderList, hiddenSet) },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Save Layout")
                    }
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Cancel")
                    }
                }
            }
        }
    }
}
