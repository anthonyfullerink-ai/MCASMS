package com.missedcall.autotext.ui.screens

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
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
    onActivationSuccess: (AppSettings.() -> AppSettings) -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var licenseInput by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

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
                text = "Please enter the unique License Key you received via email to provision your device and unlock features.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            
            Spacer(modifier = Modifier.height(32.dp))
            
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
                enabled = !isLoading
            )
            
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
                onClick = {
                    val key = licenseInput.trim()
                    if (key.isBlank()) {
                        errorMessage = "Please enter a valid key."
                        return@Button
                    }
                    
                    isLoading = true
                    errorMessage = null
                    
                    coroutineScope.launch {
                        try {
                            val result = withContext(Dispatchers.IO) {
                                val url = URL("https://missedcallautosms.com/api/provision-device?key=${Uri.encode(key)}")
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
                                
                                // Generate a template based on trade if possible
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
                                        // Auto-disable advanced webhook options if they didn't buy PRO
                                        outboundWebhookEnabled = tier == "PRO",
                                        remoteAccessEnabled = tier == "PRO"
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
                                        remoteAccessEnabled = tier == "PRO"
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
                },
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
