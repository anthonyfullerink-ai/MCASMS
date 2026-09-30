package com.missedcall.autotext.ui.screens

import android.Manifest
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.RadioButtonChecked
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Sync
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
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.util.CalendarSyncManager
import com.missedcall.autotext.util.DeviceCalendarInfo
import com.missedcall.autotext.util.GoogleCalendarAccount

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoogleCalendarSetupDialog(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current

    var hasPermission by remember {
        mutableStateOf(CalendarSyncManager.hasCalendarPermissions(context))
    }

    var accountsWithCalendars by remember {
        mutableStateOf(if (hasPermission) CalendarSyncManager.getAccountsWithCalendars(context) else emptyList())
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { perms ->
        val granted = perms[Manifest.permission.READ_CALENDAR] == true &&
                perms[Manifest.permission.WRITE_CALENDAR] == true
        hasPermission = granted
        if (granted) {
            val loaded = CalendarSyncManager.getAccountsWithCalendars(context)
            accountsWithCalendars = loaded
            Toast.makeText(context, "✅ Calendar access granted. Found ${loaded.size} account(s).", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(context, "⚠️ Calendar permission required to list device Google accounts.", Toast.LENGTH_LONG).show()
        }
    }

    // Selected account name state
    var selectedAccountName by remember {
        mutableStateOf(
            settings.aiSmsCalendarAccountName.ifBlank {
                settings.aiSmsCalendarEmail.ifBlank {
                    accountsWithCalendars.firstOrNull { it.isGoogle }?.accountName
                        ?: accountsWithCalendars.firstOrNull()?.accountName
                        ?: ""
                }
            }
        )
    }

    // Selected calendar id & display name
    var selectedCalendarId by remember {
        mutableLongStateOf(settings.aiSmsCalendarId)
    }

    var selectedCalendarDisplayName by remember {
        mutableStateOf(settings.aiSmsCalendarDisplayName)
    }

    var selectedCalendarColor by remember {
        mutableIntStateOf(settings.aiSmsCalendarColor)
    }

    var manualCalendarEmail by remember {
        mutableStateOf(
            settings.aiSmsCalendarEmail.ifBlank {
                settings.customerEmail.ifBlank { "" }
            }
        )
    }

    var showManualInput by remember {
        mutableStateOf(accountsWithCalendars.isEmpty() && !hasPermission)
    }

    var slotDuration by remember { mutableIntStateOf(settings.aiSmsSlotDurationMinutes.coerceAtLeast(15)) }
    var travelBuffer by remember { mutableIntStateOf(settings.aiSmsTravelBufferMinutes.coerceAtLeast(0)) }
    var isConnected by remember { mutableStateOf(settings.aiSmsCalendarConnected) }

    // Auto-select calendar if only one or if primary calendar available
    LaunchedEffect(accountsWithCalendars, selectedAccountName) {
        val currentAccount = accountsWithCalendars.find { it.accountName == selectedAccountName }
            ?: accountsWithCalendars.firstOrNull()
        if (currentAccount != null && selectedAccountName.isBlank()) {
            selectedAccountName = currentAccount.accountName
        }
        if (currentAccount != null && selectedCalendarId <= 0) {
            val primary = currentAccount.calendars.firstOrNull { it.isPrimary } ?: currentAccount.calendars.firstOrNull()
            if (primary != null) {
                selectedCalendarId = primary.id
                selectedCalendarDisplayName = primary.displayName
                selectedCalendarColor = primary.color
            }
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .fillMaxHeight(0.92f)
                .clip(RoundedCornerShape(24.dp)),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A))
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp)
            ) {
                // ── Header ──
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0xFF2563EB).copy(alpha = 0.2f),
                            modifier = Modifier.size(40.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.CalendarMonth,
                                    contentDescription = null,
                                    tint = Color(0xFF60A5FA),
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                "Google Calendar Sync",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Text(
                                "Direct Account & Specific Calendar Connection",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFF94A3B8)
                            )
                        }
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close", tint = Color(0xFF94A3B8))
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))
                HorizontalDivider(color = Color(0xFF1E293B))
                Spacer(modifier = Modifier.height(12.dp))

                // ── Scrollable Content ──
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                ) {
                    // Sync Status Banner
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (isConnected) Color(0xFF064E3B).copy(alpha = 0.5f) else Color(0xFF1E293B),
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            if (isConnected) Color(0xFF10B981).copy(alpha = 0.4f) else Color(0xFF334155)
                        ),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                if (isConnected) Icons.Default.CheckCircle else Icons.Default.Schedule,
                                contentDescription = null,
                                tint = if (isConnected) Color(0xFF34D399) else Color(0xFF94A3B8),
                                modifier = Modifier.size(22.dp)
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Column {
                                Text(
                                    if (isConnected) "Connected: ${selectedCalendarDisplayName.ifBlank { selectedAccountName.ifBlank { "Google Calendar" } }}" else "Calendar Sync Ready",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = if (isConnected) Color(0xFF34D399) else Color.White
                                )
                                Text(
                                    if (isConnected)
                                        "Account: ${selectedAccountName.ifBlank { manualCalendarEmail }} • 2-way live sync active"
                                    else
                                        "Select your Google account and target calendar below.",
                                    fontSize = 12.sp,
                                    color = Color(0xFF94A3B8)
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(18.dp))

                    // ── Permission Notice If Not Granted ──
                    if (!hasPermission) {
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = Color(0xFF1E1B4B).copy(alpha = 0.8f),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF6366F1).copy(alpha = 0.5f)),
                            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Security, contentDescription = null, tint = Color(0xFF818CF8), modifier = Modifier.size(20.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Calendar Permissions Required", fontWeight = FontWeight.Bold, color = Color.White, fontSize = 14.sp)
                                }
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    "To discover your Google accounts, check availability, and insert bookings directly into your chosen Google Calendar, please grant Calendar permissions.",
                                    fontSize = 12.sp,
                                    color = Color(0xFFC7D2FE),
                                    lineHeight = 16.sp
                                )
                                Spacer(modifier = Modifier.height(12.dp))
                                Button(
                                    onClick = {
                                        permissionLauncher.launch(
                                            arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)
                                        )
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4F46E5)),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Allow Calendar Access", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                                }
                            }
                        }
                    }

                    // ── STEP 1: CHOOSE GOOGLE ACCOUNT ──
                    Text(
                        "1. Choose Google Account:",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFE2E8F0)
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    if (accountsWithCalendars.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            accountsWithCalendars.forEach { acc ->
                                val isSelected = selectedAccountName == acc.accountName
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = if (isSelected) Color(0xFF1E293B) else Color(0xFF0F172A),
                                    border = androidx.compose.foundation.BorderStroke(
                                        1.dp,
                                        if (isSelected) Color(0xFF3B82F6) else Color(0xFF334155)
                                    ),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            selectedAccountName = acc.accountName
                                            // Reset selected calendar to this account's primary
                                            val primary = acc.calendars.firstOrNull { it.isPrimary } ?: acc.calendars.firstOrNull()
                                            if (primary != null) {
                                                selectedCalendarId = primary.id
                                                selectedCalendarDisplayName = primary.displayName
                                                selectedCalendarColor = primary.color
                                            }
                                        }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(
                                            if (isSelected) Icons.Default.RadioButtonChecked else Icons.Default.RadioButtonUnchecked,
                                            contentDescription = null,
                                            tint = if (isSelected) Color(0xFF60A5FA) else Color(0xFF64748B),
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Spacer(modifier = Modifier.width(12.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Text(
                                                    acc.accountName,
                                                    fontWeight = FontWeight.Bold,
                                                    color = Color.White,
                                                    fontSize = 13.sp
                                                )
                                                if (acc.isGoogle) {
                                                    Spacer(modifier = Modifier.width(6.dp))
                                                    Surface(
                                                        shape = RoundedCornerShape(4.dp),
                                                        color = Color(0xFF2563EB).copy(alpha = 0.3f)
                                                    ) {
                                                        Text("Google", fontSize = 10.sp, color = Color(0xFF93C5FD), modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp), fontWeight = FontWeight.Bold)
                                                    }
                                                }
                                            }
                                            Text(
                                                "${acc.calendars.size} calendar${if (acc.calendars.size == 1) "" else "s"} available",
                                                fontSize = 11.sp,
                                                color = Color(0xFF94A3B8)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    } else if (hasPermission) {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFF1E293B),
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                        ) {
                            Text(
                                "No synced calendars detected on device. You can configure by entering your Google Calendar email below.",
                                fontSize = 12.sp,
                                color = Color(0xFF94A3B8),
                                modifier = Modifier.padding(12.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(18.dp))

                    // ── STEP 2: CHOOSE SPECIFIC CALENDAR ──
                    val activeAccountCalendars = accountsWithCalendars.find { it.accountName == selectedAccountName }?.calendars ?: emptyList()

                    if (activeAccountCalendars.isNotEmpty()) {
                        Text(
                            "2. Choose Target Calendar for Bookings:",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFE2E8F0)
                        )
                        Spacer(modifier = Modifier.height(8.dp))

                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            activeAccountCalendars.forEach { cal ->
                                val isCalSelected = selectedCalendarId == cal.id
                                val calColor = if (cal.color != 0) Color(cal.color) else Color(0xFF3B82F6)

                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = if (isCalSelected) Color(0xFF1E293B) else Color(0xFF0F172A),
                                    border = androidx.compose.foundation.BorderStroke(
                                        1.dp,
                                        if (isCalSelected) Color(0xFF10B981) else Color(0xFF334155)
                                    ),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            selectedCalendarId = cal.id
                                            selectedCalendarDisplayName = cal.displayName
                                            selectedCalendarColor = cal.color
                                        }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        // Calendar color badge
                                        Box(
                                            modifier = Modifier
                                                .size(14.dp)
                                                .clip(CircleShape)
                                                .background(calColor)
                                        )
                                        Spacer(modifier = Modifier.width(12.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Text(
                                                    cal.displayName,
                                                    fontWeight = if (isCalSelected) FontWeight.Bold else FontWeight.Medium,
                                                    color = Color.White,
                                                    fontSize = 13.sp
                                                )
                                                if (cal.isPrimary) {
                                                    Spacer(modifier = Modifier.width(6.dp))
                                                    Surface(
                                                        shape = RoundedCornerShape(4.dp),
                                                        color = Color(0xFF065F46).copy(alpha = 0.5f)
                                                    ) {
                                                        Text("Primary", fontSize = 10.sp, color = Color(0xFF34D399), modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp), fontWeight = FontWeight.Bold)
                                                    }
                                                }
                                            }
                                            Text(
                                                "ID: ${cal.id} • ${cal.ownerAccount}",
                                                fontSize = 11.sp,
                                                color = Color(0xFF64748B)
                                            )
                                        }

                                        if (isCalSelected) {
                                            Icon(
                                                Icons.Default.Check,
                                                contentDescription = "Selected",
                                                tint = Color(0xFF10B981),
                                                modifier = Modifier.size(20.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(18.dp))
                    }

                    // ── Optional Manual Fallback Toggle ──
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showManualInput = !showManualInput }
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            "Manual Calendar ID / Custom Email Override",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF94A3B8)
                        )
                        Icon(
                            if (showManualInput) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                            contentDescription = null,
                            tint = Color(0xFF94A3B8),
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    if (showManualInput) {
                        Spacer(modifier = Modifier.height(6.dp))
                        OutlinedTextField(
                            value = manualCalendarEmail,
                            onValueChange = { manualCalendarEmail = it },
                            modifier = Modifier.fillMaxWidth(),
                            placeholder = { Text("e.g. appointments@yourbusiness.com", color = Color(0xFF64748B)) },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color(0xFF2563EB),
                                unfocusedBorderColor = Color(0xFF334155),
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White
                            )
                        )
                        Text(
                            "Useful if syncing with a secondary shared Google Calendar or external cloud booking ID.",
                            fontSize = 11.sp,
                            color = Color(0xFF64748B),
                            modifier = Modifier.padding(start = 4.dp, top = 4.dp)
                        )
                        Spacer(modifier = Modifier.height(18.dp))
                    }

                    // ── 3. Appointment Slot Duration ──
                    Text(
                        "3. Appointment Slot Duration:",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFE2E8F0)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(15, 30, 45, 60, 90).forEach { mins ->
                            val isSelected = slotDuration == mins
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(if (isSelected) Color(0xFF2563EB) else Color(0xFF1E293B))
                                    .border(
                                        1.dp,
                                        if (isSelected) Color(0xFF60A5FA) else Color(0xFF334155),
                                        RoundedCornerShape(8.dp)
                                    )
                                    .clickable { slotDuration = mins }
                                    .padding(vertical = 10.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    "${mins}m",
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = 13.sp,
                                    color = if (isSelected) Color.White else Color(0xFF94A3B8)
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(18.dp))

                    // ── 4. Travel Buffer Time ──
                    Text(
                        "4. Travel Buffer / Arrival Padding:",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFE2E8F0)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(0 to "0m", 15 to "15m", 30 to "30m", 45 to "45m", 60 to "60m").forEach { (mins, label) ->
                            val isSelected = travelBuffer == mins
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(if (isSelected) Color(0xFF10B981) else Color(0xFF1E293B))
                                    .border(
                                        1.dp,
                                        if (isSelected) Color(0xFF34D399) else Color(0xFF334155),
                                        RoundedCornerShape(8.dp)
                                    )
                                    .clickable { travelBuffer = mins }
                                    .padding(vertical = 10.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    label,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = 13.sp,
                                    color = if (isSelected) Color.Black else Color(0xFF94A3B8)
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(18.dp))

                    // ── 5. Master Business Hours Sync Preview ──
                    val activeHoursDisplay = if (settings.businessHoursEnabled) {
                        "${settings.schedule.activeDays.joinToString(", ")} (${settings.schedule.startTime} - ${settings.schedule.endTime})"
                    } else {
                        "24/7 (Always Open)"
                    }

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xFF1E293B).copy(alpha = 0.6f),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF334155)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Schedule, contentDescription = null, tint = Color(0xFF38BDF8), modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Synced Master Working Window:", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                activeHoursDisplay,
                                fontSize = 12.sp,
                                color = Color(0xFF38BDF8),
                                fontWeight = FontWeight.SemiBold
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                "AI Booking respects this schedule to only offer slots during your active working hours.",
                                fontSize = 10.sp,
                                color = Color(0xFF94A3B8)
                            )
                        }
                    }

                    // Test Sync Button if calendar selected
                    if (selectedCalendarId > 0 && hasPermission) {
                        Spacer(modifier = Modifier.height(14.dp))
                        OutlinedButton(
                            onClick = {
                                val success = CalendarSyncManager.insertTestEvent(
                                    context = context,
                                    calendarId = selectedCalendarId,
                                    calendarTitle = selectedCalendarDisplayName.ifBlank { "Google Calendar" }
                                )
                                if (success) {
                                    Toast.makeText(context, "✅ Test appointment inserted into Google Calendar!", Toast.LENGTH_LONG).show()
                                } else {
                                    Toast.makeText(context, "⚠️ Could not insert test event. Check calendar write permissions.", Toast.LENGTH_SHORT).show()
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF60A5FA)),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF2563EB).copy(alpha = 0.6f)),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("🧪 Test Sync (Insert Sample Event into Calendar)", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))
                }

                // ── Footer Action Buttons ──
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    if (isConnected) {
                        OutlinedButton(
                            onClick = {
                                isConnected = false
                                onSettingsChanged(
                                    settings.copy(
                                        aiSmsCalendarConnected = false,
                                        aiSmsCalendarId = -1L,
                                        aiSmsCalendarAccountName = "",
                                        aiSmsCalendarDisplayName = ""
                                    )
                                )
                                Toast.makeText(context, "Google Calendar Disconnected", Toast.LENGTH_SHORT).show()
                                onDismiss()
                            },
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFEF4444)),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFEF4444).copy(alpha = 0.5f)),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(0.4f)
                        ) {
                            Text("Disconnect", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                        }
                    }

                    Button(
                        onClick = {
                            val finalAccount = selectedAccountName.trim().ifBlank { manualCalendarEmail.trim() }.ifBlank { settings.customerEmail.trim() }
                            val finalDisplayName = selectedCalendarDisplayName.ifBlank { "Primary Calendar" }

                            if (finalAccount.isBlank() && selectedCalendarId <= 0) {
                                Toast.makeText(context, "Please select a Google Account or enter your calendar email", Toast.LENGTH_SHORT).show()
                                return@Button
                            }

                            isConnected = true
                            onSettingsChanged(
                                settings.copy(
                                    aiSmsCalendarConnected = true,
                                    aiSmsCalendarEmail = finalAccount,
                                    aiSmsCalendarAccountName = finalAccount,
                                    aiSmsCalendarId = selectedCalendarId,
                                    aiSmsCalendarDisplayName = finalDisplayName,
                                    aiSmsCalendarColor = selectedCalendarColor,
                                    aiSmsSlotDurationMinutes = slotDuration,
                                    aiSmsTravelBufferMinutes = travelBuffer
                                )
                            )
                            Toast.makeText(context, "✅ Google Calendar Synced to: $finalDisplayName ($finalAccount)", Toast.LENGTH_SHORT).show()
                            onDismiss()
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(if (isConnected) 0.6f else 1f)
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            if (isConnected) "Save Calendar Sync" else "Connect Calendar Now",
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp
                        )
                    }
                }
            }
        }
    }
}
