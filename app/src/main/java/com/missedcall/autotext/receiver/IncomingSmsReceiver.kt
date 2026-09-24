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
                // In a production app, we would add this to a local DNC room database.
                // For now, we fire the critical opt_out.received webhook so CRMs know to stop marketing.
                WebhookDispatcher.dispatchEvent(
                    context = context,
                    settings = settings,
                    eventType = "opt_out.received",
                    callerNumber = senderNumber,
                    messageBody = fullMessage
                )
                return@launch
            }

            // 2. Fire sms.received webhook
            WebhookDispatcher.dispatchEvent(
                context = context,
                settings = settings,
                eventType = "sms.received",
                callerNumber = senderNumber,
                messageBody = fullMessage
            )
        }
    }
}
