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
}
