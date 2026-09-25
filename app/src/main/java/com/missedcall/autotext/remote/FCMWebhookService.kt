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
import com.missedcall.autotext.data.db.VoiceCallEvent
import com.missedcall.autotext.data.license.LicenseManager
import com.missedcall.autotext.worker.SendAutoTextWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import android.content.Context
import android.content.Intent
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.os.Build
import androidx.core.app.NotificationCompat
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

        // Handle Remote OTA Update Broadcast Signal
        val isOtaUpdate = data["type"] == "ota_update" ||
                data["action"] == "check_update" ||
                data["type"] == "update" ||
                data["event"] == "ota_published"

        if (isOtaUpdate) {
            Log.i(TAG, "🚀 [FCM OTA PUSH RECEIVED] Remote OTA update signal received! Querying manifest immediately.")
            serviceScope.launch {
                try {
                    val updateMgr = RemoteUpdateManager(applicationContext)
                    val checkResult = updateMgr.checkForUpdatesDetailed(forceCheck = true)
                    if (checkResult is UpdateCheckResult.Available) {
                        val update = checkResult.updateInfo
                        Log.i(TAG, "🚀 New OTA update verified: v${update.versionName} (${update.versionCode}). Showing high-priority notification.")
                        showOtaUpdateNotification(applicationContext, update)
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to process remote OTA update signal: ${e.message}")
                }
            }
            return
        }

        // Handle AI Voice & SMS Notifications from Cloud
        val eventType = data["type"] ?: ""
        if (eventType == "voice_call_started") {
            val callerPhone = data["caller_phone"] ?: data["phone"] ?: "Unknown"
            com.missedcall.autotext.util.AiNotificationManager.notifyVoiceCallStarted(applicationContext, callerPhone)
            return
        }

        if (eventType == "voice_call_completed") {
            val callerPhone = data["caller_phone"] ?: data["phone"] ?: "Unknown"
            val callerName = data["caller_name"] ?: ""
            val summary = data["summary"] ?: "Voice call recorded."
            val transcript = data["transcript"] ?: ""
            val durationSec = data["duration_seconds"]?.toIntOrNull() ?: 60
            val intent = data["intent"] ?: "SERVICE_CALL"
            val isUrgent = intent == "EMERGENCY"

            // Save to VoiceCallDao so it appears in Voice Call History
            serviceScope.launch {
                try {
                    val app = applicationContext as App
                    app.database.voiceCallDao().insert(
                        VoiceCallEvent(
                            phoneNumber = callerPhone,
                            callerName = callerName.ifBlank { null },
                            timestamp = System.currentTimeMillis(),
                            durationSeconds = durationSec,
                            intent = intent,
                            summary = summary,
                            transcript = transcript
                        )
                    )
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to insert voice call event: ${e.message}")
                }
            }

            com.missedcall.autotext.util.AiNotificationManager.notifyVoiceCallCompleted(
                context = applicationContext,
                callerPhone = callerPhone,
                durationSec = durationSec,
                summary = summary,
                isUrgent = isUrgent
            )
            return
        }

        if (eventType == "appointment_booked") {
            val customerName = data["customer_name"] ?: "Customer"
            val callerPhone = data["phone"] ?: data["caller_phone"] ?: ""
            val dateTimeStr = data["date_time"] ?: data["time_slot"] ?: "Upcoming Slot"
            val address = data["address"] ?: ""

            com.missedcall.autotext.util.AiNotificationManager.notifyAppointmentBooked(
                context = applicationContext,
                customerName = customerName,
                callerPhone = callerPhone,
                dateTimeStr = dateTimeStr,
                address = address
            )
            return
        }

        if (eventType == "ai_sms_event") {
            val callerPhone = data["phone"] ?: data["caller_phone"] ?: ""
            val msgText = data["message"] ?: data["text"] ?: ""
            val isOutbound = data["is_outbound"]?.toBoolean() ?: true

            com.missedcall.autotext.util.AiNotificationManager.notifyAiSmsActivity(
                context = applicationContext,
                callerPhone = callerPhone,
                messageText = msgText,
                isOutbound = isOutbound
            )
            return
        }

        if (eventType == "human_takeover") {
            val callerPhone = data["phone"] ?: data["caller_phone"] ?: ""
            com.missedcall.autotext.util.AiNotificationManager.notifyHumanTakeover(applicationContext, callerPhone)
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

    private fun showOtaUpdateNotification(context: Context, update: UpdateInfo) {
        val channelId = "mcas_ota_updates"
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "App Updates",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Critical system and software update alerts"
                enableLights(true)
                enableVibration(true)
            }
            notificationManager.createNotificationChannel(channel)
        }

        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("FORCE_CHECK_UPDATE", true)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            1001,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("🚀 App Update Available: v${update.versionName}")
            .setContentText("Build ${update.versionCode} is ready. Tap to install now.")
            .setStyle(NotificationCompat.BigTextStyle().bigText(
                "A new update (v${update.versionName}, Build ${update.versionCode}) is available.\n${update.releaseNotes ?: "Tap to download and install immediately."}"
            ))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        notificationManager.notify(9001, notification)
    }
}
