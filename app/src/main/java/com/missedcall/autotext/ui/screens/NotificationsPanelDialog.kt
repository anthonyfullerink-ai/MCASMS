package com.missedcall.autotext.ui.screens

import android.text.format.DateUtils
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.missedcall.autotext.data.db.AppNotificationEvent

@Composable
fun NotificationsPanelDialog(
    notifications: List<AppNotificationEvent>,
    onDismiss: () -> Unit,
    onMarkAllRead: () -> Unit,
    onClearAll: () -> Unit,
    onMarkRead: (Long) -> Unit
) {
    var selectedFilter by remember { mutableStateOf("ALL") }

    val filteredList = remember(notifications, selectedFilter) {
        when (selectedFilter) {
            "CALLS" -> notifications.filter { it.type.startsWith("VOICE_CALL") }
            "BOOKINGS" -> notifications.filter { it.type == "APPOINTMENT_BOOKED" }
            "SMS" -> notifications.filter { it.type.startsWith("AI_SMS") || it.type == "HUMAN_TAKEOVER" }
            "ALERTS" -> notifications.filter { it.type == "EMERGENCY_ALERT" }
            else -> notifications
        }
    }

    val unreadCount = remember(notifications) {
        notifications.count { !it.isRead }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            shape = RoundedCornerShape(16.dp),
            color = Color(0xFF090B0E),
            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF222836))
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF7928CA).copy(alpha = 0.2f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                Icons.Default.Notifications,
                                contentDescription = null,
                                tint = Color(0xFFC084FC),
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "AI Activity Feed",
                                    color = Color.White,
                                    fontWeight = FontWeight.Black,
                                    fontSize = 18.sp
                                )
                                if (unreadCount > 0) {
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Surface(
                                        color = Color(0xFF00E676),
                                        shape = RoundedCornerShape(12.dp)
                                    ) {
                                        Text(
                                            "$unreadCount new",
                                            color = Color.Black,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 10.sp,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                            }
                            Text(
                                "Live background activity from your AI receptionist",
                                color = Color(0xFF94A3B8),
                                fontSize = 12.sp
                            )
                        }
                    }

                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close", tint = Color(0xFF94A3B8))
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Action Bar (Mark All Read / Clear)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Filter Chips
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        item {
                            FilterChip(
                                selected = selectedFilter == "ALL",
                                onClick = { selectedFilter = "ALL" },
                                label = { Text("All (${notifications.size})", fontSize = 11.sp) }
                            )
                        }
                        item {
                            FilterChip(
                                selected = selectedFilter == "BOOKINGS",
                                onClick = { selectedFilter = "BOOKINGS" },
                                label = { Text("📅 Bookings", fontSize = 11.sp) }
                            )
                        }
                        item {
                            FilterChip(
                                selected = selectedFilter == "CALLS",
                                onClick = { selectedFilter = "CALLS" },
                                label = { Text("🎙️ Calls", fontSize = 11.sp) }
                            )
                        }
                        item {
                            FilterChip(
                                selected = selectedFilter == "SMS",
                                onClick = { selectedFilter = "SMS" },
                                label = { Text("💬 SMS", fontSize = 11.sp) }
                            )
                        }
                        item {
                            FilterChip(
                                selected = selectedFilter == "ALERTS",
                                onClick = { selectedFilter = "ALERTS" },
                                label = { Text("🚨 Alerts", fontSize = 11.sp) }
                            )
                        }
                    }

                    Spacer(modifier = Modifier.width(8.dp))

                    if (notifications.isNotEmpty()) {
                        TextButton(onClick = onMarkAllRead) {
                            Text("Mark Read", fontSize = 11.sp, color = Color(0xFF38BDF8))
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))
                HorizontalDivider(color = Color(0xFF222836))
                Spacer(modifier = Modifier.height(10.dp))

                // Feed List
                if (filteredList.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                Icons.Default.NotificationsNone,
                                contentDescription = null,
                                tint = Color(0xFF475569),
                                modifier = Modifier.size(56.dp)
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                "No notifications yet",
                                color = Color(0xFF94A3B8),
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                "When your AI answers calls, chats with callers, or books slots, they will appear here.",
                                color = Color(0xFF64748B),
                                fontSize = 12.sp,
                                modifier = Modifier.padding(horizontal = 32.dp),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(filteredList, key = { it.id }) { item ->
                            NotificationCard(
                                item = item,
                                onMarkRead = { onMarkRead(item.id) }
                            )
                        }

                        item {
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.Center
                            ) {
                                TextButton(onClick = onClearAll) {
                                    Icon(Icons.Default.DeleteOutline, contentDescription = null, tint = Color(0xFFEF4444), modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Clear All Notification History", color = Color(0xFFEF4444), fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationCard(
    item: AppNotificationEvent,
    onMarkRead: () -> Unit
) {
    val accentColor = when (item.type) {
        "APPOINTMENT_BOOKED" -> Color(0xFF00E676)
        "EMERGENCY_ALERT" -> Color(0xFFEF4444)
        "VOICE_CALL_STARTED", "VOICE_CALL_COMPLETED" -> Color(0xFFC084FC)
        "AI_SMS_SENT", "AI_SMS_RECEIVED" -> Color(0xFF38BDF8)
        "HUMAN_TAKEOVER" -> Color(0xFFF59E0B)
        else -> Color(0xFF94A3B8)
    }

    val icon: ImageVector = when (item.type) {
        "APPOINTMENT_BOOKED" -> Icons.Default.EventAvailable
        "EMERGENCY_ALERT" -> Icons.Default.Warning
        "VOICE_CALL_STARTED" -> Icons.Default.Call
        "VOICE_CALL_COMPLETED" -> Icons.Default.CallEnd
        "AI_SMS_SENT" -> Icons.Default.Send
        "AI_SMS_RECEIVED" -> Icons.Default.ChatBubbleOutline
        "HUMAN_TAKEOVER" -> Icons.Default.PauseCircleFilled
        else -> Icons.Default.Notifications
    }

    val timeAgo = DateUtils.getRelativeTimeSpanString(
        item.timestamp,
        System.currentTimeMillis(),
        DateUtils.MINUTE_IN_MILLIS,
        DateUtils.FORMAT_ABBREV_RELATIVE
    ).toString()

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onMarkRead() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (!item.isRead) Color(0xFF131720) else Color(0xFF0D1017)
        ),
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            if (!item.isRead) accentColor.copy(alpha = 0.5f) else Color(0xFF1E2433)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(accentColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = accentColor, modifier = Modifier.size(18.dp))
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        item.title,
                        color = Color.White,
                        fontWeight = if (!item.isRead) FontWeight.Bold else FontWeight.SemiBold,
                        fontSize = 13.sp,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        timeAgo,
                        color = Color(0xFF64748B),
                        fontSize = 11.sp
                    )
                }

                if (item.phoneNumber.isNotBlank()) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        "Caller: ${item.phoneNumber}",
                        color = accentColor,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    item.message,
                    color = Color(0xFFCBD5E0),
                    fontSize = 12.sp,
                    lineHeight = 16.sp
                )
            }
        }
    }
}
