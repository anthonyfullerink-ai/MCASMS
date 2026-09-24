package com.missedcall.autotext.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import android.util.Log
import androidx.work.*
import com.missedcall.autotext.App
import com.missedcall.autotext.worker.SendAutoTextWorker
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.launch
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class CallStateReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "CallStateReceiver"

        // Thread-safe state tracking across broadcast receiver instances
        private val isRinging = AtomicBoolean(false)
        private val wasAnswered = AtomicBoolean(false)
        @Volatile private var incomingNumber: String? = null
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return

        val stateStr = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
        val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)

        if (!number.isNullOrEmpty()) {
            incomingNumber = number
        }

        Log.d(TAG, "Phone State Changed: $stateStr, Number: $incomingNumber")

        when (stateStr) {
            TelephonyManager.EXTRA_STATE_RINGING -> {
                isRinging.set(true)
                wasAnswered.set(false)
            }
            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                if (isRinging.get()) {
                    wasAnswered.set(true)
                }
            }
            TelephonyManager.EXTRA_STATE_IDLE -> {
                if (isRinging.get() && !wasAnswered.get()) {
                    val targetNumber = incomingNumber
                    Log.d(TAG, "Missed / Rejected call detected from: $targetNumber")

                    if (!targetNumber.isNullOrBlank()) {
                        enqueueAutoTextWorker(context, targetNumber)
                    }
                } else if (isRinging.get() && wasAnswered.get()) {
                    val targetNumber = incomingNumber
                    Log.d(TAG, "Completed call detected with: $targetNumber")
                    if (!targetNumber.isNullOrBlank()) {
                        CoroutineScope(Dispatchers.IO).launch {
                            val settingsRepo = (context.applicationContext as App).settingsRepository
                            com.missedcall.autotext.util.WebhookDispatcher.dispatchEvent(
                                context = context,
                                settings = settingsRepo.getSettings(),
                                eventType = "call.completed",
                                callerNumber = targetNumber,
                                disposition = "answered"
                            )
                        }
                    }
                }
                // Reset state machine flags
                isRinging.set(false)
                wasAnswered.set(false)
                incomingNumber = null
            }
        }
    }

    private fun enqueueAutoTextWorker(context: Context, phoneNumber: String) {
        val inputData = Data.Builder()
            .putString(SendAutoTextWorker.KEY_PHONE_NUMBER, phoneNumber)
            .build()

        val workRequest = OneTimeWorkRequestBuilder<SendAutoTextWorker>()
            .setInputData(inputData)
            .build()

        WorkManager.getInstance(context.applicationContext).enqueue(workRequest)
    }
}
