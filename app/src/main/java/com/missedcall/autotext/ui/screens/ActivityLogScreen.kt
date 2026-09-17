package com.missedcall.autotext.ui.screens

import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.History
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.missedcall.autotext.data.db.CallLogEvent
import com.missedcall.autotext.data.db.LogStatus
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.ui.theme.AmberWarning
import com.missedcall.autotext.ui.theme.GrayPaused
import com.missedcall.autotext.ui.theme.PurpleVariant
import com.missedcall.autotext.ui.theme.RedError
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ActivityLogScreen(
    logs: List<CallLogEvent>,
    onClearLogs: () -> Unit
) {
    var showClearDialog by remember { mutableStateOf(false) }
    val context = LocalContext.current

    fun exportLogsToCsv() {
        if (logs.isEmpty()) {
            Toast.makeText(context, "No activity logs available to export.", Toast.LENGTH_SHORT).show()
            return
        }

        val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
        val sb = StringBuilder()
        sb.append("ID,Timestamp,Date,Phone Number,Status,Message Sent,Failure Reason\n")

        logs.forEach { log ->
            val dateStr = dateFormat.format(Date(log.timestamp))
            val msgEscaped = (log.messageSent ?: "").replace("\"", "\"\"")
            val reasonEscaped = (log.failureReason ?: "").replace("\"", "\"\"")
            sb.append("${log.id},${log.timestamp},\"$dateStr\",\"${log.phoneNumber}\",\"${log.status}\",\"$msgEscaped\",\"$reasonEscaped\"\n")
        }

        val sendIntent = Intent().apply {
            action = Intent.ACTION_SEND
            putExtra(Intent.EXTRA_TEXT, sb.toString())
            putExtra(Intent.EXTRA_SUBJECT, "Missed Call Auto SMS - Activity Log Export")
            type = "text/csv"
        }

        val shareIntent = Intent.createChooser(sendIntent, "Export Activity Log (CSV)")
        context.startActivity(shareIntent)
    }

    if (showClearDialog) {
        AlertDialog(
            onDismissRequest = { showClearDialog = false },
            title = { Text("Clear Activity Logs") },
            text = { Text("Are you sure you want to erase all call activity history?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        onClearLogs()
                        showClearDialog = false
                    }
                ) {
                    Text("Clear All", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showClearDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.History,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Event Log (${logs.size})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
            }

            if (logs.isNotEmpty()) {
                Row {
                    IconButton(onClick = { exportLogsToCsv() }) {
                        Icon(
                            imageVector = Icons.Default.Download,
                            contentDescription = "Export CSV",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                    IconButton(onClick = { showClearDialog = true }) {
                        Icon(
                            imageVector = Icons.Default.DeleteSweep,
                            contentDescription = "Clear Logs",
                            tint = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        if (logs.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Default.History,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "No missed call activity recorded yet",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.weight(1f)
            ) {
                items(logs, key = { it.id }) { log ->
                    LogEventCard(log = log)
                }
            }
        }
    }
}

@Composable
fun LogEventCard(log: CallLogEvent) {
    val dateFormat = remember { SimpleDateFormat("MMM dd, yyyy  hh:mm:ss a", Locale.getDefault()) }
    val formattedTime = remember(log.timestamp) { dateFormat.format(Date(log.timestamp)) }

    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = log.phoneNumber,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                StatusBadge(status = log.status)
            }

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = formattedTime,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            if (!log.messageSent.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "\"${log.messageSent}\"",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(8.dp)
                    )
                }
            }

            if (!log.failureReason.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Reason: ${log.failureReason}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
            }
        }
    }
}

@Composable
fun StatusBadge(status: LogStatus) {
    val (label, bgColor, textColor) = when (status) {
        LogStatus.SENT -> Triple("Sent", ActiveGreenContainer, ActiveGreenText)
        LogStatus.SKIPPED_IN_CONTACTS -> Triple("Skipped (Contact)", PurpleVariant.copy(alpha = 0.2f), PurpleVariant)
        LogStatus.SKIPPED_COOLDOWN -> Triple("Skipped (Cooldown)", AmberWarning.copy(alpha = 0.2f), AmberWarning)
        LogStatus.SKIPPED_OFF_HOURS -> Triple("Skipped (Off Hours)", GrayPaused.copy(alpha = 0.2f), GrayPaused)
        LogStatus.SKIPPED_UNLICENSED -> Triple("Locked (Unlicensed)", RedError.copy(alpha = 0.2f), RedError)
        LogStatus.FAILED_SIM_ERROR -> Triple("Failed (SIM)", RedError.copy(alpha = 0.2f), RedError)
        LogStatus.REMOTE_SENT -> Triple("n8n Sent", ActiveGreenContainer, ActiveGreenText)
        LogStatus.REMOTE_REJECTED -> Triple("n8n Unauthorized", RedError.copy(alpha = 0.2f), RedError)
        LogStatus.FORWARDED_TO_WEBHOOK -> Triple("Forwarded to n8n", PurpleVariant.copy(alpha = 0.2f), PurpleVariant)
    }

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = bgColor
    ) {
        Text(
            text = label,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = textColor,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
        )
    }
}
