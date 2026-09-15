package com.missedcall.autotext.ui.screens

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Contacts
import androidx.compose.material.icons.filled.Message
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

@Composable
fun PermissionOnboardingDialog(
    missingPermissions: List<String>,
    onRequestPermissionBatch: (List<String>) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    var currentStepIndex by remember { mutableIntStateOf(0) }

    val steps = remember {
        listOf(
            PermissionStep(
                title = "1. Call & Phone State Detection",
                description = "Required to intercept incoming calls and detect when a call is missed or rejected.",
                icon = Icons.Default.Call,
                permissions = listOf(android.Manifest.permission.READ_PHONE_STATE, android.Manifest.permission.READ_CALL_LOG)
            ),
            PermissionStep(
                title = "2. Automatic SMS Reply Dispatch",
                description = "Required to send the automated text reply from your device SIM card.",
                icon = Icons.Default.Message,
                permissions = listOf(android.Manifest.permission.SEND_SMS)
            ),
            PermissionStep(
                title = "3. Contacts Exclusion Filter",
                description = "Required to check your address book so saved contacts are not texted automatically.",
                icon = Icons.Default.Contacts,
                permissions = listOf(android.Manifest.permission.READ_CONTACTS)
            )
        )
    }

    val currentStep = steps.getOrNull(currentStepIndex) ?: steps.last()

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
                    tint = MaterialTheme.colorScheme.primary,
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

                // Sideloaded Restricted Settings Tip
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
                            text = "If SMS permission says 'Restricted Setting', tap 'Open Phone Settings' below, tap the 3 dots (⋮) in App Info, and select 'Allow restricted settings'.",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
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
        }
    }
}
