package com.missedcall.autotext.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import android.util.Log
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.missedcall.autotext.App
import com.missedcall.autotext.worker.SendAutoTextWorker
import kotlinx.coroutines.runBlocking
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
                }
                // Reset state machine flags
                isRinging.set(false)
                wasAnswered.set(false)
                incomingNumber = null
            }
        }
    }

    private fun enqueueAutoTextWorker(context: Context, phoneNumber: String) {
        val app = context.applicationContext as? App
        val settings = try {
            runBlocking { app?.settingsRepository?.getSettings() }
        } catch (e: Exception) {
            null
        }

        val cleanDigits = phoneNumber.filter { it.isDigit() }.takeLast(10)
        val isVoiceActive = settings?.voiceReceptionistEnabled == true

        val inputData = Data.Builder()
            .putString(SendAutoTextWorker.KEY_PHONE_NUMBER, phoneNumber)
            .build()

        val workRequestBuilder = OneTimeWorkRequestBuilder<SendAutoTextWorker>()
            .setInputData(inputData)

        if (isVoiceActive) {
            // Approach 2: Reconciliation Buffer (45s delay to allow carrier *71 handoff and Vapi engagement)
            workRequestBuilder
                .setInitialDelay(45, TimeUnit.SECONDS)
                .addTag("pending_missed_$cleanDigits")
                .addTag("all_pending_missed_calls")

            Log.i(TAG, "AI Voice Active: Queued native missed-call text for $cleanDigits with 45s reconciliation buffer (Tag: pending_missed_$cleanDigits)")

            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
                "pending_missed_$cleanDigits",
                ExistingWorkPolicy.REPLACE,
                workRequestBuilder.build()
            )
        } else {
            Log.i(TAG, "Standard Mode: Enqueued native missed-call text immediately for $phoneNumber")
            WorkManager.getInstance(context.applicationContext).enqueue(workRequestBuilder.build())
        }
    }
}
