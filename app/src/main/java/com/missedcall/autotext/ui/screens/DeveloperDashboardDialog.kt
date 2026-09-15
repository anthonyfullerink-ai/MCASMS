package com.missedcall.autotext.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCard
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.VpnKey
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
import com.missedcall.autotext.data.license.DeveloperLicenseRecord
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText
import com.missedcall.autotext.ui.theme.RedError
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeveloperDashboardDialog(
    records: List<DeveloperLicenseRecord>,
    onAddRecord: (String, String) -> Unit,
    onToggleRevoke: (String) -> Unit,
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit,
    onDismiss: () -> Unit
) {
    var devTabSelected by remember { mutableIntStateOf(0) }
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface
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
                        Icon(
                            imageVector = Icons.Default.Shield,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(
                                text = "Developer License Manager",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "$49.99 Commercial License Management",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    IconButton(onClick = onDismiss) {
                        Text("✕", fontWeight = FontWeight.Bold, fontSize = 20.sp)
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Navigation Tabs
                TabRow(selectedTabIndex = devTabSelected) {
                    Tab(
                        selected = devTabSelected == 0,
                        onClick = { devTabSelected = 0 },
                        text = { Text("License Holders (${records.size})") },
                        icon = { Icon(Icons.Default.People, contentDescription = null) }
                    )
                    Tab(
                        selected = devTabSelected == 1,
                        onClick = { devTabSelected = 1 },
                        text = { Text("Issue New Key") },
                        icon = { Icon(Icons.Default.AddCard, contentDescription = null) }
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                when (devTabSelected) {
                    0 -> LicenseHoldersListSection(
                        records = records,
                        onToggleRevoke = onToggleRevoke,
                        onCopyKey = { key ->
                            clipboardManager.setText(AnnotatedString(key))
                            Toast.makeText(context, "License Key copied!", Toast.LENGTH_SHORT).show()
                        },
                        onActivateOnDevice = { key ->
                            onSettingsChanged(settings.copy(licenseKey = key))
                            Toast.makeText(context, "Activated Key on this device!", Toast.LENGTH_LONG).show()
                        }
                    )
                    1 -> IssueNewKeySection(
                        onGenerate = { name ->
                            val generatedKey = generateMobileKey(name)
                            onAddRecord(name, generatedKey)
                            clipboardManager.setText(AnnotatedString(generatedKey))
                            Toast.makeText(context, "License Generated & Copied to Clipboard!", Toast.LENGTH_LONG).show()
                            devTabSelected = 0 // Switch to list
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun LicenseHoldersListSection(
    records: List<DeveloperLicenseRecord>,
    onToggleRevoke: (String) -> Unit,
    onCopyKey: (String) -> Unit,
    onActivateOnDevice: (String) -> Unit
) {
    if (records.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    imageVector = Icons.Default.VpnKey,
                    contentDescription = null,
                    modifier = Modifier.size(64.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "No client license keys issued yet",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = "Switch to 'Issue New Key' tab to create $49.99 licenses.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                )
            }
        }
    } else {
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(records, key = { it.id }) { record ->
                LicenseRecordCard(
                    record = record,
                    onToggleRevoke = { onToggleRevoke(record.licenseKey) },
                    onCopyKey = { onCopyKey(record.licenseKey) },
                    onActivateOnDevice = { onActivateOnDevice(record.licenseKey) }
                )
            }
        }
    }
}

@Composable
fun LicenseRecordCard(
    record: DeveloperLicenseRecord,
    onToggleRevoke: () -> Unit,
    onCopyKey: () -> Unit,
    onActivateOnDevice: () -> Unit
) {
    val dateFormat = remember { SimpleDateFormat("MMM dd, yyyy", Locale.getDefault()) }
    val formattedDate = remember(record.dateIssued) { dateFormat.format(Date(record.dateIssued)) }

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
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = record.customerName,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Issued: $formattedDate • ${record.priceText}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (record.isRevoked) RedError.copy(alpha = 0.2f) else ActiveGreenContainer
                ) {
                    Text(
                        text = if (record.isRevoked) "REVOKED" else "ACTIVE",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (record.isRevoked) RedError else ActiveGreenText,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Surface(
                shape = RoundedCornerShape(6.dp),
                color = MaterialTheme.colorScheme.surface,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = record.licenseKey,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(8.dp)
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = onCopyKey,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Copy Key", fontSize = 12.sp)
                }

                OutlinedButton(
                    onClick = onToggleRevoke,
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = if (record.isRevoked) ActiveGreenText else MaterialTheme.colorScheme.error
                    ),
                    modifier = Modifier.weight(1f)
                ) {
                    Text(if (record.isRevoked) "Reactivate" else "Revoke", fontSize = 12.sp)
                }

                Button(
                    onClick = onActivateOnDevice,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                    modifier = Modifier.weight(1.2f)
                ) {
                    Text("Activate Here", fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
fun IssueNewKeySection(
    onGenerate: (String) -> Unit
) {
    var customerNameInput by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(8.dp)
    ) {
        Text(
            text = "Issue $49.99 License Key",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = "Generates a cryptographically signed HMAC-SHA256 license key for commercial deployment.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = customerNameInput,
            onValueChange = { customerNameInput = it },
            label = { Text("Customer or Business Name") },
            placeholder = { Text("e.g. Apex Plumbing Services") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(20.dp))

        Button(
            enabled = customerNameInput.isNotBlank(),
            onClick = {
                onGenerate(customerNameInput.trim())
                customerNameInput = ""
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(Icons.Default.Key, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Generate $49.99 License Key")
        }
    }
}

private fun generateMobileKey(customerName: String): String {
    val payloadStr = "$customerName|0|${System.currentTimeMillis()}"
    val payloadHex = payloadStr.toByteArray(StandardCharsets.UTF_8).joinToString("") { "%02X".format(it) }
    val sig = generateHmac(payloadHex, "MCAT_SECRET_PROD_KEY_2026").take(8).uppercase()
    return "MCAT-$payloadHex-$sig"
}

private fun generateHmac(data: String, key: String): String {
    val mac = Mac.getInstance("HmacSHA256")
    val secretKey = SecretKeySpec(key.toByteArray(StandardCharsets.UTF_8), "HmacSHA256")
    mac.init(secretKey)
    val hash = mac.doFinal(data.toByteArray(StandardCharsets.UTF_8))
    return hash.joinToString("") { "%02X".format(it) }
}
