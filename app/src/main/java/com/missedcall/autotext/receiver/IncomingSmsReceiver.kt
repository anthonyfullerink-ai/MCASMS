package com.missedcall.autotext.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.missedcall.autotext.App
import com.missedcall.autotext.util.WebhookDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.Locale

class IncomingSmsReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "IncomingSmsReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (messages.isEmpty()) return

        // Group multipart messages
        val messageBodyBuilder = StringBuilder()
        var senderNumber = ""

        for (sms in messages) {
            senderNumber = sms.originatingAddress ?: continue
            messageBodyBuilder.append(sms.messageBody)
        }

        val fullMessage = messageBodyBuilder.toString()
        if (senderNumber.isBlank() || fullMessage.isBlank()) return

        Log.i(TAG, "Received SMS from $senderNumber: $fullMessage")

        val app = context.applicationContext as App
        val settingsRepo = app.settingsRepository

        CoroutineScope(Dispatchers.IO).launch {
            val settings = settingsRepo.getSettings()

            // 1. Check for Opt-Out Keywords (A2P 10DLC Compliance)
            val upperMsg = fullMessage.trim().uppercase(Locale.US)
            val isOptOut = upperMsg == "STOP" || upperMsg == "UNSUBSCRIBE" || upperMsg == "CANCEL" || upperMsg == "STOPALL" || upperMsg == "QUIT"
            
            if (isOptOut) {
                Log.w(TAG, "Opt-Out received from $senderNumber. Muting future automated SMS for this number.")
                WebhookDispatcher.dispatchEvent(
                    context = context,
                    settings = settings,
                    eventType = "opt_out.received",
                    callerNumber = senderNumber,
                    messageBody = fullMessage
                )
                return@launch
            }

            // 2. Fire sms.received webhook for external CRMs
            WebhookDispatcher.dispatchEvent(
                context = context,
                settings = settings,
                eventType = "sms.received",
                callerNumber = senderNumber,
                messageBody = fullMessage
            )

            // 3. Conversational AI SMS Engine
            if (settings.aiSmsMasterEnabled && settings.aiSmsInboundAgentEnabled) {
                // Rule A: Phone Contacts Exemption (Family, Crew & Saved Contacts Shield)
                val isSavedContact = com.missedcall.autotext.util.ContactUtils.getContactName(context, senderNumber) != null
                if (isSavedContact) {
                    Log.d(TAG, "Skipping AI SMS: $senderNumber is in saved Contacts.")
                    return@launch
                }

                // Rule B: 3-Way Scope Gate
                if (settings.aiSmsScope == "OFF") {
                    Log.d(TAG, "Skipping AI SMS: Scope is set to OFF.")
                    return@launch
                }

                if (settings.aiSmsScope == "STRICT") {
                    val hasHistory = app.database.callLogDao().getLastSentTimestamp(senderNumber) != null
                    if (!hasHistory) {
                        Log.d(TAG, "Skipping AI SMS (Strict Mode): $senderNumber has no prior missed-call history.")
                        return@launch
                    }
                }

                // Log in-app notification & dispatch to Cloud AI Brain
                com.missedcall.autotext.util.AiNotificationManager.notifyAiSmsActivity(
                    context = context,
                    callerPhone = senderNumber,
                    messageText = fullMessage,
                    isOutbound = false
                )

                dispatchToAiSmsEngine(
                    context = context,
                    licenseKey = settings.licenseKey,
                    senderNumber = senderNumber,
                    messageText = fullMessage,
                    fcmToken = settings.fcmDeviceToken
                )
            }
        }
    }

    private fun dispatchToAiSmsEngine(context: Context, licenseKey: String, senderNumber: String, messageText: String, fcmToken: String) {
        try {
            val url = java.net.URL("https://missedcallautosms.com/.netlify/functions/sms-chat")
            val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 6000
                readTimeout = 6000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
            val payload = org.json.JSONObject().apply {
                put("licenseKey", licenseKey)
                put("senderPhone", senderNumber)
                put("messageBody", messageText)
                put("fcmToken", fcmToken)
            }
            conn.outputStream.use { it.write(payload.toString().toByteArray(java.nio.charset.StandardCharsets.UTF_8)) }
            val code = conn.responseCode
            Log.i(TAG, "Dispatched inbound SMS to AI SMS engine: HTTP $code")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to dispatch inbound SMS to AI SMS engine: ${e.message}")
        }
    }
}
