package com.missedcall.autotext.util

import android.content.Context
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.worker.WebhookWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

object WebhookDispatcher {

    fun dispatchEvent(
        context: Context,
        settings: AppSettings,
        eventType: String,
        callId: String = UUID.randomUUID().toString(),
        callerNumber: String,
        durationSeconds: Int = 0,
        disposition: String = "",
        messageBody: String = "",
        errorReason: String = "",
        simSlot: Int = 0
    ) {
        val isPro = settings.licenseKey.contains("PRO", ignoreCase = true) ||
                settings.licenseKey.contains("DEV", ignoreCase = true) ||
                settings.licenseKey.contains("DEMO", ignoreCase = true) ||
                settings.licenseKey.contains("MASTER", ignoreCase = true) ||
                com.missedcall.autotext.BuildConfig.IS_PRO_EDITION

        if (!isPro || !settings.outboundWebhookEnabled) return

        // Check explicit event subscriptions
        val shouldFire = when (eventType) {
            "call.missed" -> settings.webhookSubMissedCall
            "sms.sent" -> settings.webhookSubSmsSent
            "sms.received" -> settings.webhookSubSmsReceived
            "call.completed" -> settings.webhookSubCallCompleted
            "voicemail.received" -> settings.webhookSubVoicemail
            "opt_out.received" -> true // Critical safeguard
            else -> true
        }

        if (!shouldFire) return

        val url = settings.selectedOutboundWebhookUrl
        if (url.isBlank()) return

        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        val timestamp = sdf.format(Date())
        val eventId = "evt_${UUID.randomUUID()}"

        val payload = JSONObject().apply {
            put("event", eventType)
            put("event_id", eventId)
            put("timestamp", timestamp)
            put("sim_slot", simSlot)
            
            val callObj = JSONObject().apply {
                put("id", callId)
                put("caller_number", callerNumber)
                put("duration_seconds", durationSeconds)
                if (disposition.isNotBlank()) put("disposition", disposition)
            }
            put("call", callObj)

            val businessObj = JSONObject().apply {
                put("name", settings.businessName)
                put("email", settings.customerEmail)
            }
            put("business", businessObj)

            if (messageBody.isNotBlank()) {
                val smsObj = JSONObject().apply {
                    put("body", messageBody)
                    if (errorReason.isNotBlank()) put("error", errorReason)
                }
                put("sms", smsObj)
            }
        }

        // Send to main webhook
        WebhookWorker.enqueue(context, url, payload.toString(), settings.webhookApiSecret)
    }

    /**
     * Dispatch an immediate, lightweight ring pulse to Netlify Central Cloud Bridge
     * so that the shared Vapi phone number correlates the incoming call with this user's account.
     */
    fun dispatchVoiceRingPulse(
        context: Context,
        settings: AppSettings,
        callerNumber: String
    ) {
        if (settings.licenseKey.isBlank() || callerNumber.isBlank()) return
        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
            try {
                val url = java.net.URL("https://missedcallautosms.com/.netlify/functions/vapi-webhook?action=ring_pulse")
                val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 4000
                    readTimeout = 4000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                }
                val payload = JSONObject().apply {
                    put("action", "ring_pulse")
                    put("licenseKey", settings.licenseKey)
                    put("callerPhone", callerNumber)
                    put("businessName", settings.businessName)
                    put("trade", settings.voiceIndustryTrade)
                    put("contractorActivity", settings.contractorActivity)
                    put("bookingLink", settings.contractorGoalLink)
                    put("agentName", settings.voiceAgentName)
                    put("emergencyKeywords", settings.voiceEmergencyKeywords)
                    put("timestamp", System.currentTimeMillis())
                }
                conn.outputStream.use { it.write(payload.toString().toByteArray(java.nio.charset.StandardCharsets.UTF_8)) }
                val code = conn.responseCode
                android.util.Log.d("WebhookDispatcher", "📡 Voice ring pulse dispatched: code $code for caller $callerNumber (License: ${settings.licenseKey})")
            } catch (e: Exception) {
                android.util.Log.w("WebhookDispatcher", "Voice ring pulse failed: ${e.message}")
            }
        }
    }
}
