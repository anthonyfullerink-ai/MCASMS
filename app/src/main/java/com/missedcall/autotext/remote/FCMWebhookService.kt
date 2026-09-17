package com.missedcall.autotext.remote

import android.util.Log
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.missedcall.autotext.App
import com.missedcall.autotext.data.db.CallLogEvent
import com.missedcall.autotext.data.db.LogStatus
import com.missedcall.autotext.worker.SendAutoTextWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

class FCMWebhookService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "FCMWebhookService"
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "New FCM Registration Token generated: $token")
        val app = applicationContext as App
        serviceScope.launch {
            app.settingsRepository.saveFcmToken(token)
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

        val secret = data["secret"] ?: data["api_secret"] ?: data["auth_token"] ?: ""
        val targetPhone = data["phone"] ?: data["phone_number"] ?: data["recipientPhone"] ?: data["recipient_phone"] ?: ""
        val customMessage = data["message"] ?: data["message_text"] ?: data["text"] ?: ""
        val callbackUrl = data["callback_url"] ?: data["callbackUrl"] ?: ""

        // Validate Security Key
        if (settings.webhookApiSecret.isNotBlank() && secret != settings.webhookApiSecret) {
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

        Log.i(TAG, "Valid FCM Webhook payload verified! Dispatching SMS to $targetPhone")

        val workData = Data.Builder()
            .putString(SendAutoTextWorker.KEY_PHONE_NUMBER, targetPhone)
            .putString(SendAutoTextWorker.KEY_OVERRIDE_MESSAGE, customMessage)
            .putBoolean(SendAutoTextWorker.KEY_IS_REMOTE_TRIGGER, true)
            .putString(SendAutoTextWorker.KEY_CALLBACK_URL, callbackUrl)
            .build()

        val workRequest = OneTimeWorkRequestBuilder<SendAutoTextWorker>()
            .setInputData(workData)
            .build()

        WorkManager.getInstance(applicationContext).enqueue(workRequest)
    }
}
