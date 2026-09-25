package com.missedcall.autotext.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.missedcall.autotext.App
import com.missedcall.autotext.util.AiNotificationManager
import com.missedcall.autotext.util.WebhookDispatcher
import com.missedcall.autotext.worker.SendAutoTextWorker
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

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
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
                    com.missedcall.autotext.util.AiNotificationManager.notifyAiSmsIgnored(
                        context = context,
                        callerPhone = senderNumber,
                        reason = "Inbound text from $senderNumber was bypassed: Number is saved in your Android Contacts (Contacts Shield is active)."
                    )
                    return@launch
                }

                // Rule B: 3-Way Scope Gate
                if (settings.aiSmsScope == "OFF") {
                    Log.d(TAG, "Skipping AI SMS: Scope is set to OFF.")
                    com.missedcall.autotext.util.AiNotificationManager.notifyAiSmsIgnored(
                        context = context,
                        callerPhone = senderNumber,
                        reason = "Inbound text from $senderNumber was bypassed: AI SMS Scope is set to 'Off'."
                    )
                    return@launch
                }

                if (settings.aiSmsScope == "STRICT") {
                    val rawDigits = senderNumber.filter { it.isDigit() }
                    val last7Digits = if (rawDigits.length >= 7) rawDigits.takeLast(7) else rawDigits
                    val hasHistory = app.database.callLogDao().getLastSentTimestampFlexible(senderNumber, last7Digits) != null
                    if (!hasHistory) {
                        Log.d(TAG, "Skipping AI SMS (Strict Mode): $senderNumber has no prior missed-call history.")
                        com.missedcall.autotext.util.AiNotificationManager.notifyAiSmsIgnored(
                            context = context,
                            callerPhone = senderNumber,
                            reason = "Inbound text from $senderNumber was bypassed: Strict Mode is active (no prior missed call from this number). Set Scope to 'All Unknown Numbers' to reply to cold texts."
                        )
                        return@launch
                    }
                }

                // Rule C: Auto-Pause on Human Reply (24-Hour Takeover Protection with AI Safeguard)
                if (settings.aiSmsAutoPauseOnHumanReply) {
                    val humanSentRecently = hasHumanSentSmsRecently(
                        context = context,
                        callLogDao = app.database.callLogDao(),
                        phoneNumber = senderNumber,
                        windowMillis = 24 * 60 * 60 * 1000L,
                        resetTimestamp = settings.aiSmsTakeoverResetTimestamp
                    )
                    if (humanSentRecently) {
                        Log.i(TAG, "Skipping AI SMS: Human manual takeover detected within last 24h for $senderNumber.")
                        com.missedcall.autotext.util.AiNotificationManager.notifyHumanTakeover(context, senderNumber)
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

                // Resolve FCM token
                var resolvedToken = settings.fcmDeviceToken
                if (resolvedToken.isBlank()) {
                    try {
                        resolvedToken = com.google.android.gms.tasks.Tasks.await(
                            com.google.firebase.messaging.FirebaseMessaging.getInstance().token,
                            3,
                            java.util.concurrent.TimeUnit.SECONDS
                        )
                        if (!resolvedToken.isNullOrBlank()) {
                            settingsRepo.saveFcmToken(resolvedToken)
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Could not resolve live FCM token: ${e.message}")
                    }
                }

                dispatchToAiSmsEngine(
                    context = context,
                    settings = settings,
                    senderNumber = senderNumber,
                    messageText = fullMessage,
                    fcmToken = resolvedToken ?: ""
                )
            }
        } finally {
            pendingResult.finish()
        }
    }
}

    private fun dispatchToAiSmsEngine(
        context: Context,
        settings: com.missedcall.autotext.data.AppSettings,
        senderNumber: String,
        messageText: String,
        fcmToken: String
    ) {
        try {
            val url = java.net.URL("https://missedcallautosms.com/.netlify/functions/sms-chat")
            val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 12000
                readTimeout = 15000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
            val payload = org.json.JSONObject().apply {
                put("licenseKey", settings.licenseKey)
                put("senderPhone", senderNumber)
                put("messageBody", messageText)
                put("fcmToken", fcmToken)
                put("scope", settings.aiSmsScope)
                put("businessType", settings.aiSmsBusinessServiceType)
                put("shopAddress", settings.aiSmsShopAddress)
                put("shopInstructions", settings.aiSmsShopInstructions)
                put("maxReplies", settings.aiSmsMaxRepliesPerContact)
                put("emergencyAlertsEnabled", settings.aiSmsEmergencyAlertsEnabled)
            }
            conn.outputStream.use { it.write(payload.toString().toByteArray(java.nio.charset.StandardCharsets.UTF_8)) }
            val code = conn.responseCode
            Log.i(TAG, "Dispatched inbound SMS to AI SMS engine: HTTP $code")

            if (code in 200..299) {
                val responseStr = conn.inputStream.bufferedReader().use { it.readText() }
                val json = org.json.JSONObject(responseStr)
                if (json.optBoolean("success", false) && json.optBoolean("replied", false)) {
                    val aiReply = json.optString("reply", "").trim()
                    if (aiReply.isNotBlank()) {
                        Log.i(TAG, "AI SMS engine returned reply directly: '$aiReply'. Dispatching via SIM!")

                        val workData = Data.Builder()
                            .putString(SendAutoTextWorker.KEY_PHONE_NUMBER, senderNumber)
                            .putString(SendAutoTextWorker.KEY_OVERRIDE_MESSAGE, aiReply)
                            .putBoolean(SendAutoTextWorker.KEY_IS_REMOTE_TRIGGER, true)
                            .putInt(SendAutoTextWorker.KEY_SIM_SLOT, 1)
                            .build()

                        val workRequest = OneTimeWorkRequestBuilder<SendAutoTextWorker>()
                            .setInputData(workData)
                            .build()

                        WorkManager.getInstance(context).enqueue(workRequest)

                        // Post in-app outbound notification
                        AiNotificationManager.notifyAiSmsActivity(
                            context = context,
                            callerPhone = senderNumber,
                            messageText = aiReply,
                            isOutbound = true
                        )
                    }
                }
            } else {
                val errStr = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                Log.w(TAG, "AI SMS engine returned HTTP $code: $errStr")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to dispatch inbound SMS to AI SMS engine: ${e.message}")
        }
    }

    private suspend fun hasHumanSentSmsRecently(
        context: Context,
        callLogDao: com.missedcall.autotext.data.db.CallLogDao,
        phoneNumber: String,
        windowMillis: Long,
        resetTimestamp: Long = 0L
    ): Boolean {
        val cleanDigits = phoneNumber.filter { it.isDigit() }
        val last7 = if (cleanDigits.length >= 7) cleanDigits.takeLast(7) else cleanDigits
        val cutoffTime = maxOf(System.currentTimeMillis() - windowMillis, resetTimestamp)

        // Retrieve all AI-dispatched messages recorded in our database during this window
        val aiLogs = try {
            callLogDao.getRecentAiSentLogs(phoneNumber, last7, cutoffTime)
        } catch (e: Exception) {
            Log.w(TAG, "Could not fetch AI logs for human takeover verification: ${e.message}")
            emptyList()
        }

        val projection = arrayOf(
            Telephony.Sms.Sent.ADDRESS,
            Telephony.Sms.Sent.DATE,
            Telephony.Sms.Sent.BODY
        )
        val selection = "${Telephony.Sms.Sent.DATE} > ?"
        val selectionArgs = arrayOf(cutoffTime.toString())

        return try {
            context.contentResolver.query(
                Telephony.Sms.Sent.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                "${Telephony.Sms.Sent.DATE} DESC"
            )?.use { cursor ->
                val addressIdx = cursor.getColumnIndex(Telephony.Sms.Sent.ADDRESS)
                val dateIdx = cursor.getColumnIndex(Telephony.Sms.Sent.DATE)
                val bodyIdx = cursor.getColumnIndex(Telephony.Sms.Sent.BODY)

                while (cursor.moveToNext()) {
                    val address = if (addressIdx != -1) cursor.getString(addressIdx) else null
                    if (address != null) {
                        val addrDigits = address.filter { it.isDigit() }
                        if (addrDigits.endsWith(last7) || addrDigits == cleanDigits) {
                            val sentDate = if (dateIdx != -1) cursor.getLong(dateIdx) else 0L
                            val sentBody = if (bodyIdx != -1) cursor.getString(bodyIdx)?.trim() ?: "" else ""

                            // Verify if this sent text was generated & dispatched by the AI agent
                            val isAiDispatched = aiLogs.any { ai ->
                                val timeDiff = Math.abs(ai.timestamp - sentDate)
                                val bodyMatches = !ai.messageSent.isNullOrBlank() && sentBody.isNotBlank() &&
                                        (sentBody.contains(ai.messageSent.take(20)) || ai.messageSent.contains(sentBody.take(20)))
                                timeDiff < 45_000L || bodyMatches
                            }

                            if (!isAiDispatched) {
                                Log.i(TAG, "Genuine human manual reply detected to $phoneNumber: '${sentBody.take(30)}...'. Pausing AI.")
                                return true
                            } else {
                                Log.d(TAG, "Sent SMS to $phoneNumber matched AI dispatch history. Allowing automated conversation to continue.")
                            }
                        }
                    }
                }
                false
            } ?: false
        } catch (e: Exception) {
            Log.w(TAG, "Could not query sent SMS table for human takeover check: ${e.message}")
            false
        }
    }
}
