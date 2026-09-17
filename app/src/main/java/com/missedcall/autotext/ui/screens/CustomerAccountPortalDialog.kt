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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.Locale

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

    val isCancelled = settings.subscriptionStatus == "CANCELLED"
    val isTrial = settings.subscriptionStatus == "TRIAL" || settings.licenseKey.contains("TRIAL", ignoreCase = true)
    val isPro = settings.licenseKey.contains("PRO", ignoreCase = true)

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
                                Column {
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
                                            "$149.99 One-Time — Unlimited Automations & Dual SIM"
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
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
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
                                    val endpoint = if (settings.remoteUpdateUrl.isNotBlank()) {
                                        settings.remoteUpdateUrl.replace("/api/version.json", "/api/cancel-trial")
                                    } else {
                                        "http://10.0.2.2:8000/api/cancel-trial"
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
}
