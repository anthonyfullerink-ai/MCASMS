package com.missedcall.autotext.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Contacts
import androidx.compose.material.icons.filled.Message
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.missedcall.autotext.ui.MainActivity

data class PermissionStep(
    val title: String,
    val description: String,
    val icon: ImageVector,
    val permissions: List<String>
)


// Sentinel permission string used to identify the battery optimization step
private const val BATTERY_OPTIMIZATION_SENTINEL = "BATTERY_OPTIMIZATION"

@Composable
fun PermissionOnboardingDialog(
    missingPermissions: List<String>,
    onRequestPermissionBatch: (List<String>) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    var currentStepIndex by remember { mutableIntStateOf(0) }

    val steps = remember {
        val list = mutableListOf(
            PermissionStep(
                title = "1. Call & Phone State Detection",
                description = "Required to intercept incoming calls and detect when a call is missed or rejected.",
                icon = Icons.Default.Call,
                permissions = listOf(android.Manifest.permission.READ_PHONE_STATE, android.Manifest.permission.READ_CALL_LOG)
            ),
            PermissionStep(
                title = "2. SMS Auto-Reply & Delivery",
                description = "Required to dispatch the automated text reply from your device SIM card and verify message status.",
                icon = Icons.Default.Message,
                permissions = listOf(
                    android.Manifest.permission.SEND_SMS,
                    android.Manifest.permission.READ_SMS,
                    android.Manifest.permission.RECEIVE_SMS
                )
            ),
            PermissionStep(
                title = "3. Contacts Exclusion Filter",
                description = "Required to check your address book so saved contacts are not texted automatically.",
                icon = Icons.Default.Contacts,
                permissions = listOf(android.Manifest.permission.READ_CONTACTS)
            )
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            list.add(
                PermissionStep(
                    title = "4. Background Notifications",
                    description = "Required to display status alerts and persistent foreground service indicators.",
                    icon = Icons.Default.Notifications,
                    permissions = listOf(android.Manifest.permission.POST_NOTIFICATIONS)
                )
            )
        }
        list.add(
            PermissionStep(
                title = "${list.size + 1}. Disable Battery Optimization",
                description = "Android's battery manager can kill this app mid-call, causing missed texts. Tap 'Exempt App' to ensure 100% reliable auto-reply delivery — even while your phone is locked.",
                icon = Icons.Default.BatteryFull,
                permissions = listOf(BATTERY_OPTIMIZATION_SENTINEL)
            )
        )
        list.toList()
    }

    val currentStep = steps.getOrNull(currentStepIndex) ?: steps.last()
    val isBatteryStep = currentStep.permissions.firstOrNull() == BATTERY_OPTIMIZATION_SENTINEL

    // Check if battery optimization is already exempted (so we can skip this step)
    val isBatteryAlreadyExempted = remember {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(dismissOnBackPress = true, dismissOnClickOutside = false)
    ) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = currentStep.icon,
                    contentDescription = null,
                    tint = if (isBatteryStep) MaterialTheme.colorScheme.tertiary
                           else MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(48.dp)
                )

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = "App Setup: Essential Permissions",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = currentStep.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = currentStep.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Context-sensitive tip card
                if (isBatteryStep) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.5f),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text(
                                text = "🔋 Why This Matters:",
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.labelSmall
                            )
                            Text(
                                text = "Samsung, Xiaomi, OnePlus and other OEM Androids kill background apps aggressively. Without this exemption, the app may miss calls while your screen is off. See dontkillmyapp.com for device-specific guides.",
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                } else {
                    // Standard sideloaded restricted settings tip
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text(
                                text = "💡 Android Security Tip:",
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.labelSmall
                            )
                            Text(
                                text = "If SMS permission says 'Restricted Setting', tap 'Open App Info' below, tap the 3 dots (⋮) in App Info, and select 'Allow restricted settings'.",
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    if (isBatteryStep) {
                        // Battery step: open dontkillmyapp.com link
                        OutlinedButton(
                            onClick = {
                                try {
                                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://dontkillmyapp.com"))
                                    context.startActivity(intent)
                                } catch (e: Exception) { /* ignore */ }
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Device Guide")
                        }

                        Button(
                            onClick = {
                                // Request battery optimization exemption via system intent
                                try {
                                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                                        data = Uri.parse("package:${context.packageName}")
                                    }
                                    context.startActivity(intent)
                                } catch (e: Exception) {
                                    // Fallback to general battery settings on devices that block the direct intent
                                    try {
                                        context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                                    } catch (ex: Exception) { /* ignore */ }
                                }
                                // Advance to next step (or finish) regardless — user may skip
                                if (currentStepIndex < steps.size - 1) {
                                    currentStepIndex++
                                } else {
                                    onDismiss()
                                }
                            },
                            modifier = Modifier.weight(1.2f),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.tertiary
                            )
                        ) {
                            Text(if (isBatteryAlreadyExempted) "Already Exempt ✓" else "Exempt App")
                        }
                    } else {
                        // Standard permission step
                        OutlinedButton(
                            onClick = { MainActivity.openAppSettings(context) },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Open App Info")
                        }

                        Button(
                            onClick = {
                                onRequestPermissionBatch(currentStep.permissions)
                                if (currentStepIndex < steps.size - 1) {
                                    currentStepIndex++
                                } else {
                                    onDismiss()
                                }
                            },
                            modifier = Modifier.weight(1.2f)
                        ) {
                            Text(if (currentStepIndex < steps.size - 1) "Allow & Next" else "Allow & Finish")
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Skip for Now (Don't Ask Again)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

