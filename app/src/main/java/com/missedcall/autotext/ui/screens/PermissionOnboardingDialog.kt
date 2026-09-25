package com.missedcall.autotext.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Contacts
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Message
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.missedcall.autotext.ui.MainActivity

private const val BATTERY_OPTIMIZATION_SENTINEL = "BATTERY_OPTIMIZATION"

@Composable
fun PermissionOnboardingDialog(
    missingPermissions: List<String>,
    onRequestPermissionBatch: (List<String>) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    // Identify standard runtime permissions that can be requested in a batch
    val runtimePermissionsToRequest = remember(missingPermissions) {
        val list = mutableListOf(
            android.Manifest.permission.READ_PHONE_STATE,
            android.Manifest.permission.READ_CALL_LOG,
            android.Manifest.permission.SEND_SMS,
            android.Manifest.permission.READ_SMS,
            android.Manifest.permission.RECEIVE_SMS,
            android.Manifest.permission.READ_CONTACTS
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            list.add(android.Manifest.permission.POST_NOTIFICATIONS)
        }
        list.filter { missingPermissions.contains(it) }
    }

    // Check battery optimization exemption
    var isBatteryExempted by remember {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        mutableStateOf(pm.isIgnoringBatteryOptimizations(context.packageName))
    }

    // Check if SMS permissions are blocked (often due to Android 13+ restricted settings)
    val hasSmsMissing = missingPermissions.any {
        it == android.Manifest.permission.SEND_SMS || it == android.Manifest.permission.RECEIVE_SMS || it == android.Manifest.permission.READ_SMS
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(dismissOnBackPress = true, dismissOnClickOutside = false)
    ) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .verticalScroll(scrollState),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = Icons.Default.VerifiedUser,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(48.dp)
                )

                Spacer(modifier = Modifier.height(10.dp))

                Text(
                    text = "Quick Device Setup",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = "Grant permissions below so Missed Call Auto SMS can detect missed calls and auto-reply via SIM.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Summary of required permissions
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    PermissionFeatureRow(
                        icon = Icons.Default.Call,
                        title = "Phone & Call Logs",
                        subtitle = "Detect incoming missed & rejected calls instantly",
                        isGranted = !missingPermissions.contains(android.Manifest.permission.READ_PHONE_STATE) &&
                                    !missingPermissions.contains(android.Manifest.permission.READ_CALL_LOG)
                    )
                    PermissionFeatureRow(
                        icon = Icons.Default.Message,
                        title = "SMS Auto-Reply",
                        subtitle = "Send auto-text replies directly from your phone's SIM",
                        isGranted = !hasSmsMissing
                    )
                    PermissionFeatureRow(
                        icon = Icons.Default.Contacts,
                        title = "Contacts Exclusion",
                        subtitle = "Prevent texting saved family, friends, or VIPs",
                        isGranted = !missingPermissions.contains(android.Manifest.permission.READ_CONTACTS)
                    )
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        PermissionFeatureRow(
                            icon = Icons.Default.Notifications,
                            title = "Status Alerts",
                            subtitle = "Show live foreground service & dispatch status",
                            isGranted = !missingPermissions.contains(android.Manifest.permission.POST_NOTIFICATIONS)
                        )
                    }
                    PermissionFeatureRow(
                        icon = Icons.Default.BatteryFull,
                        title = "Battery Unrestricted",
                        subtitle = "Ensures texts send even when screen is locked",
                        isGranted = isBatteryExempted
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Android 13+ Sideload Restricted Settings Guidance Banner
                if (hasSmsMissing && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.7f),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.Security,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "Android 13+ Sideload Security Notice:",
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onErrorContainer
                                )
                            }
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "If Android shows 'Restricted Setting' or denies SMS access:\n1. Tap 'Open App Info' below.\n2. Tap the 3 dots (⋮) in the top-right corner.\n3. Tap 'Allow restricted settings'.\n4. Return here and tap 'Grant All Permissions'.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                lineHeight = 18.sp
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            OutlinedButton(
                                onClick = { MainActivity.openAppSettings(context) },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("Open App Info (Tap ⋮ for Restricted Settings)")
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(14.dp))
                }

                // Primary 1-Tap Action: Batch Grant
                if (runtimePermissionsToRequest.isNotEmpty()) {
                    Button(
                        onClick = {
                            onRequestPermissionBatch(runtimePermissionsToRequest)
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("🚀 Grant All Required Permissions (1-Tap)", fontWeight = FontWeight.Bold)
                    }
                } else if (!isBatteryExempted) {
                    // All runtime permissions granted, only battery exemption remains
                    Button(
                        onClick = {
                            try {
                                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                                    data = Uri.parse("package:${context.packageName}")
                                }
                                context.startActivity(intent)
                            } catch (e: Exception) {
                                try {
                                    context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                                } catch (ex: Exception) { /* ignore */ }
                            }
                            // Refresh battery status
                            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                            isBatteryExempted = pm.isIgnoringBatteryOptimizations(context.packageName)
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.tertiary
                        ),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("🔋 Exempt App from Battery Saver", fontWeight = FontWeight.Bold)
                    }
                } else {
                    // All permissions completely granted!
                    Button(
                        onClick = onDismiss,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("✓ All Setup Complete! Continue to App", fontWeight = FontWeight.Bold)
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextButton(onClick = { MainActivity.openAppSettings(context) }) {
                        Text("App Settings", style = MaterialTheme.typography.bodySmall)
                    }
                    TextButton(onClick = onDismiss) {
                        Text("Skip / Finish Later", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun PermissionFeatureRow(
    icon: ImageVector,
    title: String,
    subtitle: String,
    isGranted: Boolean
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = if (isGranted) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp
            )
        }
        if (isGranted) {
            Icon(
                imageVector = Icons.Default.CheckCircle,
                contentDescription = "Granted",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}
