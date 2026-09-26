package com.missedcall.autotext.ui.screens

import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.VpnKey
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.missedcall.autotext.data.AppSettings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LicenseGateScreen(
    initialLicenseKey: String? = null,
    onActivationSuccess: (AppSettings.() -> AppSettings) -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var licenseInput by remember { mutableStateOf(initialLicenseKey?.trim()?.uppercase() ?: "") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var clipboardKey by remember { mutableStateOf<String?>(null) }

    val clipboardManager = remember {
        context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    }

    // Function to execute device provisioning
    fun executeActivation(targetKey: String) {
        val key = targetKey.trim().uppercase()
        if (key.isBlank()) {
            errorMessage = "Please enter a valid key."
            return
        }

        isLoading = true
        errorMessage = null

        coroutineScope.launch {
            try {
                val deviceId = com.missedcall.autotext.data.license.LicenseManager.getDeviceId(context)
                val deviceModel = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"
                val result = withContext(Dispatchers.IO) {
                    val url = URL("https://missedcallautosms.com/api/provision-device?key=${Uri.encode(key)}&deviceId=${Uri.encode(deviceId)}&deviceModel=${Uri.encode(deviceModel)}")
                    val connection = url.openConnection() as HttpURLConnection
                    connection.requestMethod = "GET"
                    connection.connectTimeout = 10000
                    connection.readTimeout = 10000

                    val responseCode = connection.responseCode
                    val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
                    val jsonStr = stream.bufferedReader().use { it.readText() }
                    JSONObject(jsonStr)
                }

                if (result.optBoolean("success", false)) {
                    val businessName = result.optString("businessName", "My Business")
                    val customerEmail = result.optString("customerEmail", "")
                    val trade = result.optString("trade", "")
                    val tier = result.optString("tier", "STANDARD")

                    val template = if (trade.isNotBlank()) {
                        "Hey! Sorry I missed your call. How can I help you today? - $businessName ($trade)"
                    } else {
                        "Hey! Sorry I missed your call. How can I help you today? - $businessName"
                    }

                    onActivationSuccess {
                        this.copy(
                            licenseKey = key,
                            businessName = businessName,
                            customerEmail = customerEmail,
                            voiceIndustryTrade = trade,
                            messageTemplate = template,
                            outboundWebhookEnabled = tier == "PRO",
                            remoteAccessEnabled = tier == "PRO",
                            permissionsOnboardingCompleted = false
                        )
                    }
                    Toast.makeText(context, "Provisioning Successful!", Toast.LENGTH_LONG).show()
                } else {
                    errorMessage = result.optString("error", "Invalid or revoked key.")
                }
            } catch (e: Exception) {
                // Offline Fallback for Local Testing & Demo Keys
                val localVerification = com.missedcall.autotext.data.license.LicenseManager.verifyLicenseKey(key)
                if (localVerification.status == com.missedcall.autotext.data.license.LicenseStatus.ACTIVE_LIFETIME || 
                    localVerification.status == com.missedcall.autotext.data.license.LicenseStatus.ACTIVE_SUBSCRIPTION) {

                    val tier = if (localVerification.tier == com.missedcall.autotext.data.license.LicenseTier.PRO) "PRO" else "STANDARD"
                    val businessName = localVerification.licensedTo.ifBlank { "Offline User" }

                    onActivationSuccess {
                        this.copy(
                            licenseKey = key,
                            businessName = businessName,
                            messageTemplate = "Hey! Sorry I missed your call. How can I help you today? - $businessName",
                            outboundWebhookEnabled = tier == "PRO",
                            remoteAccessEnabled = tier == "PRO",
                            permissionsOnboardingCompleted = false
                        )
                    }
                    Toast.makeText(context, "Offline Provisioning Successful!", Toast.LENGTH_LONG).show()
                } else {
                    errorMessage = "Network error. Could not reach provisioning server, and local key validation failed."
                }
            } finally {
                isLoading = false
            }
        }
    }

    // Inspect clipboard on launch for fast 1-tap activation
    LaunchedEffect(Unit) {
        try {
            val clipText = clipboardManager?.primaryClip?.getItemAt(0)?.text?.toString()?.trim()
            if (!clipText.isNullOrBlank() && clipText.contains("MCAS-", ignoreCase = true)) {
                val match = Regex("""MCAS-[A-Za-z0-9\-]+""").find(clipText)?.value?.uppercase()
                if (!match.isNullOrBlank()) {
                    clipboardKey = match
                    if (licenseInput.isBlank()) {
                        licenseInput = match
                    }
                }
            }
        } catch (e: Exception) {
            // Ignore clipboard permission or read errors
        }
    }

    // Auto-activate if deep-link license key was provided
    LaunchedEffect(initialLicenseKey) {
        if (!initialLicenseKey.isNullOrBlank()) {
            licenseInput = initialLicenseKey.trim().uppercase()
            executeActivation(initialLicenseKey)
        }
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.Default.VpnKey,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(64.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Activate Your Software",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Enter your License Key from your confirmation email, or tap below to paste automatically.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(28.dp))

            OutlinedTextField(
                value = licenseInput,
                onValueChange = { 
                    licenseInput = it.uppercase()
                    errorMessage = null 
                },
                label = { Text("License Key (e.g. MCAS-XXXX)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                isError = errorMessage != null,
                enabled = !isLoading,
                trailingIcon = {
                    IconButton(onClick = {
                        try {
                            val clip = clipboardManager?.primaryClip?.getItemAt(0)?.text?.toString()?.trim()
                            if (!clip.isNullOrBlank()) {
                                val match = Regex("""MCAS-[A-Za-z0-9\-]+""").find(clip)?.value?.uppercase() ?: clip.uppercase()
                                licenseInput = match
                                errorMessage = null
                            }
                        } catch (e: Exception) { /* ignore */ }
                    }) {
                        Icon(
                            imageVector = Icons.Default.ContentPaste,
                            contentDescription = "Paste from clipboard",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            )

            // 1-Tap Clipboard Detection Banner
            if (clipboardKey != null && licenseInput != clipboardKey) {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.7f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            licenseInput = clipboardKey!!
                            executeActivation(clipboardKey!!)
                        }
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.ContentPaste,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Detected Key in Clipboard: $clipboardKey (Tap to Apply)",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }
            }

            if (errorMessage != null) {
                Text(
                    text = errorMessage!!,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp, start = 4.dp)
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = { executeActivation(licenseInput) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                enabled = !isLoading,
                shape = RoundedCornerShape(12.dp)
            ) {
                if (isLoading) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(24.dp))
                } else {
                    Text("Securely Activate Device", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            TextButton(
                onClick = {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://missedcallautosms.com/flagship"))
                    context.startActivity(intent)
                }
            ) {
                Text("Don't have a key? Purchase one here.")
            }
        }
    }
}
