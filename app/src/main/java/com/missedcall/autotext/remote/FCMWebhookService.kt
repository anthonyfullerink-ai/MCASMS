package com.missedcall.autotext.remote

import android.util.Log
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.missedcall.autotext.App
import com.missedcall.autotext.BuildConfig
import com.missedcall.autotext.data.db.CallLogEvent
import com.missedcall.autotext.data.db.LogStatus
import com.missedcall.autotext.data.license.LicenseManager
import com.missedcall.autotext.worker.SendAutoTextWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import android.content.Context
import android.content.Intent
import com.missedcall.autotext.data.db.VoiceCallEvent
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

class FCMWebhookService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "FCMWebhookService"
        const val REGISTER_ENDPOINT = "https://missedcallautosms.com/.netlify/functions/register-device"

        suspend fun registerDeviceToken(context: Context, fcmToken: String, licenseKey: String): Boolean = withContext(Dispatchers.IO) {
            if (fcmToken.isBlank() || licenseKey.isBlank()) return@withContext false
            try {
                val url = URL(REGISTER_ENDPOINT)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.connectTimeout = 8000
                conn.readTimeout = 8000

                val payload = """
                    {
                        "license_key": "$licenseKey",
                        "fcm_token": "$fcmToken",
                        "device_id": "${LicenseManager.getDeviceId(context)}",
                        "app_version": "${BuildConfig.VERSION_NAME}",
                        "is_pro": ${BuildConfig.IS_PRO_EDITION}
                    }
                """.trimIndent()

                conn.outputStream.use { it.write(payload.toByteArray(StandardCharsets.UTF_8)) }
                val code = conn.responseCode
                Log.i(TAG, "Device registration with central bridge response: $code")
                code in 200..299
            } catch (e: Exception) {
                Log.w(TAG, "Failed to register device token with central bridge", e)
                false
            }
        }
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "New FCM Registration Token generated: $token")
        val app = applicationContext as App
        serviceScope.launch {
            app.settingsRepository.saveFcmToken(token)
            val settings = app.settingsRepository.getSettings()
            if (settings.licenseKey.isNotBlank()) {
                registerDeviceToken(applicationContext, token, settings.licenseKey)
            }
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "FCM Remote Message Received from: ${remoteMessage.from}")

        val data = remoteMessage.data
        if (data.isEmpty()) {
            Log.w(TAG, "Received FCM message with empty data payload. Ignoring.")
            return
        }

        val app = applicationContext as App
        val settings = runBlocking { app.settingsRepository.getSettings() }

        if (!settings.webhookEnabled) {
            Log.w(TAG, "Webhook processing is disabled in App Settings. Ignoring FCM payload.")
            return
        }

        val isCentralRelay = data["source"] == "central_cloud_relay"
        val secret = data["secret"] ?: data["api_secret"] ?: data["auth_token"] ?: ""
        val targetPhone = data["phone"] ?: data["phone_number"] ?: data["recipientPhone"] ?: data["recipient_phone"] ?: ""
        val customMessage = data["message"] ?: data["message_text"] ?: data["text"] ?: ""
        val callbackUrl = data["callback_url"] ?: data["callbackUrl"] ?: ""
        val simSlot = data["sim_slot"]?.toIntOrNull() ?: data["simSlot"]?.toIntOrNull() ?: 0

        // Validate Security Key (bypassed if pre-authenticated by Central Cloud Relay via Pro License Key)
        if (!isCentralRelay && settings.webhookApiSecret.isNotBlank() && secret != settings.webhookApiSecret) {
            Log.e(TAG, "Unauthorized Webhook attempt! Incoming secret '$secret' does not match configured API secret.")
            serviceScope.launch {
                app.database.callLogDao().insertLog(
                    CallLogEvent(
                        phoneNumber = if (targetPhone.isNotBlank()) targetPhone else "UNKNOWN",
                        status = LogStatus.REMOTE_REJECTED,
                        failureReason = "Unauthorized Webhook Payload (Invalid Secret Key)",
                        messageSent = customMessage
                    )
                )
            }
            return
        }

        // Handle AI Voice Receptionist In-Progress Call Notification (Approach 2: Instant Cancellation)
        val eventType = data["type"] ?: data["event"] ?: ""
        if (eventType == "voice_call_started") {
            val callerPhone = data["caller_phone"] ?: data["phone"] ?: targetPhone
            if (callerPhone.isNotBlank()) {
                val cleanDigits = callerPhone.filter { it.isDigit() }.takeLast(10)
                Log.i(TAG, "AI Call In-Progress from $callerPhone: Cancelling pending native missed-call auto-text for $cleanDigits")
                WorkManager.getInstance(applicationContext).cancelUniqueWork("pending_missed_$cleanDigits")
                WorkManager.getInstance(applicationContext).cancelAllWorkByTag("pending_missed_$cleanDigits")
            }
            return
        }

        // Handle AI Voice Receptionist Completed Call Notifications
        if (eventType == "voice_call_completed" || eventType == "voice_notification") {
            val callerPhone = data["caller_phone"] ?: data["phone"] ?: targetPhone
            val callerName = data["caller_name"] ?: data["name"]
            val summary = data["summary"] ?: data["notes"] ?: ""
            val transcript = data["transcript"] ?: ""
            val intent = data["intent"] ?: "SERVICE_CALL"
            val durationSeconds = data["duration_seconds"]?.toIntOrNull() ?: 0
            val followUpSms = data["follow_up_sms"] ?: data["sms_text"]
            val recordingUrl = data["recording_url"]

            // Cancel any lingering pending native auto-text for this caller
            val cleanDigits = callerPhone.filter { it.isDigit() }.takeLast(10)
            if (cleanDigits.isNotEmpty()) {
                WorkManager.getInstance(applicationContext).cancelUniqueWork("pending_missed_$cleanDigits")
                WorkManager.getInstance(applicationContext).cancelAllWorkByTag("pending_missed_$cleanDigits")
            }

            serviceScope.launch {
                app.database.voiceCallDao().insert(
                    VoiceCallEvent(
                        phoneNumber = callerPhone,
                        callerName = callerName,
                        durationSeconds = durationSeconds,
                        intent = intent,
                        summary = summary,
                        transcript = transcript,
                        recordingUrl = recordingUrl,
                        followUpSms = followUpSms,
                        contractorStatus = settings.contractorStatus,
                        isRead = false
                    )
                )
            }
            postVoiceCallNotification(applicationContext, callerName ?: callerPhone, summary, intent)

            // Automated Post-Call SMS Dispatch via Device SIM
            if (settings.postCallSmsEnabled && callerPhone.isNotBlank()) {
                val keywords = settings.voiceEmergencyKeywords
                    .split(",")
                    .map { it.trim().lowercase() }
                    .filter { it.isNotEmpty() }
                val content = "$summary $transcript".lowercase()
                val isUrgent = keywords.any { content.contains(it) } || intent.equals("EMERGENCY", ignoreCase = true)

                val shouldSend = !settings.postCallEmergencyOnly || isUrgent
                if (shouldSend) {
                    val finalMsg = if (!followUpSms.isNullOrBlank() && !followUpSms.contains("{")) {
                        followUpSms
                    } else {
                        val template = settings.postCallSmsTemplate.ifBlank {
                            "Hey {NAME}, this is {BUSINESS_NAME}. My assistant {AGENT_NAME} let me know about {SUMMARY}. I am wrapping up on a job and will reach out to you shortly!"
                        }
                        template
                            .replace("{NAME}", callerName ?: "there")
                            .replace("{BUSINESS_NAME}", settings.businessName.ifBlank { "our team" })
                            .replace("{SUMMARY}", summary.ifBlank { "your call" })
                            .replace("{BOOKING_LINK}", settings.contractorGoalLink.ifBlank { "" })
                            .replace("{AGENT_NAME}", settings.voiceAgentName.ifBlank { "Riley" })
                    }

                    Log.i(TAG, "Dispatching automated post-call SMS to $callerPhone: '$finalMsg'")
                    val workData = Data.Builder()
                        .putString(SendAutoTextWorker.KEY_PHONE_NUMBER, callerPhone)
                        .putString(SendAutoTextWorker.KEY_OVERRIDE_MESSAGE, finalMsg)
                        .putBoolean(SendAutoTextWorker.KEY_IS_REMOTE_TRIGGER, true)
                        .putInt(SendAutoTextWorker.KEY_SIM_SLOT, simSlot)
                        .build()

                    val workRequest = OneTimeWorkRequestBuilder<SendAutoTextWorker>()
                        .setInputData(workData)
                        .build()

                    WorkManager.getInstance(applicationContext).enqueue(workRequest)
                }
            }
            return
        }

        if (targetPhone.isBlank()) {
            Log.e(TAG, "FCM data payload missing target phone number. Payload keys: ${data.keys}")
            return
        }

        Log.i(TAG, "Valid FCM Webhook payload verified! Dispatching SMS to $targetPhone (SIM Slot: $simSlot)")

        val workData = Data.Builder()
            .putString(SendAutoTextWorker.KEY_PHONE_NUMBER, targetPhone)
            .putString(SendAutoTextWorker.KEY_OVERRIDE_MESSAGE, customMessage)
            .putBoolean(SendAutoTextWorker.KEY_IS_REMOTE_TRIGGER, true)
            .putString(SendAutoTextWorker.KEY_CALLBACK_URL, callbackUrl)
            .putInt(SendAutoTextWorker.KEY_SIM_SLOT, simSlot)
            .build()

        val workRequest = OneTimeWorkRequestBuilder<SendAutoTextWorker>()
            .setInputData(workData)
            .build()

        WorkManager.getInstance(applicationContext).enqueue(workRequest)
    }

    private fun postVoiceCallNotification(context: Context, caller: String, summary: String, intent: String) {
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            val channelId = "voice_call_notifications"
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                val channel = android.app.NotificationChannel(
                    channelId,
                    "AI Voice Call Notifications",
                    android.app.NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Notifies when your AI receptionist finishes speaking with a caller"
                }
                notificationManager.createNotificationChannel(channel)
            }

            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            val pendingIntent = android.app.PendingIntent.getActivity(
                context,
                0,
                launchIntent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or (if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) android.app.PendingIntent.FLAG_IMMUTABLE else 0)
            )

            val notification = androidx.core.app.NotificationCompat.Builder(context, channelId)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("🎙️ AI Call: $caller ($intent)")
                .setContentText(summary.ifBlank { "Tap to view conversation details" })
                .setStyle(androidx.core.app.NotificationCompat.BigTextStyle().bigText(summary))
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .build()

            notificationManager.notify(System.currentTimeMillis().toInt(), notification)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to display voice call notification", e)
        }
    }
}
