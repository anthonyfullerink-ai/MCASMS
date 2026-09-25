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
                val ringingNumber = incomingNumber
                if (!ringingNumber.isNullOrBlank()) {
                    CoroutineScope(Dispatchers.IO).launch {
                        try {
                            val settings = (context.applicationContext as App).settingsRepository.getSettings()
                            if (settings.voiceReceptionistEnabled || settings.voiceSubscriptionActive) {
                                com.missedcall.autotext.util.WebhookDispatcher.dispatchVoiceRingPulse(
                                    context = context,
                                    settings = settings,
                                    callerNumber = ringingNumber
                                )
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Ring pulse dispatch exception: ${e.message}")
                        }
                    }
                }
            }
            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                if (isRinging.get()) {
                    wasAnswered.set(true)
                }
            }
            TelephonyManager.EXTRA_STATE_IDLE -> {
                val wasRinging = isRinging.getAndSet(false)
                val answered = wasAnswered.getAndSet(false)
                val capturedNumber = incomingNumber
                incomingNumber = null

                if (wasRinging && answered && !capturedNumber.isNullOrBlank()) {
                    Log.d(TAG, "Completed call detected with: $capturedNumber")
                    CoroutineScope(Dispatchers.IO).launch {
                        val settingsRepo = (context.applicationContext as App).settingsRepository
                        com.missedcall.autotext.util.WebhookDispatcher.dispatchEvent(
                            context = context,
                            settings = settingsRepo.getSettings(),
                            eventType = "call.completed",
                            callerNumber = capturedNumber,
                            disposition = "answered"
                        )
                    }
                } else {
                    // Missed, rejected, or unanswered call
                    val pendingResult = goAsync()
                    CoroutineScope(Dispatchers.IO).launch {
                        try {
                            var targetNumber = capturedNumber
                            if (targetNumber.isNullOrBlank()) {
                                // Modern Android takes 300-1500ms to insert missed call into CallLog after IDLE broadcast
                                for (attempt in 1..8) {
                                    val logNumber = getRecentMissedOrRejectedCall(context)
                                    if (!logNumber.isNullOrBlank()) {
                                        targetNumber = logNumber
                                        break
                                    }
                                    kotlinx.coroutines.delay(400)
                                }
                            }

                            if (!targetNumber.isNullOrBlank()) {
                                Log.i(TAG, "Missed / Rejected call confirmed from: $targetNumber. Triggering auto-text.")
                                enqueueAutoTextWorker(context, targetNumber)
                            } else {
                                Log.w(TAG, "IDLE reached but no caller number could be identified.")
                            }
                        } finally {
                            pendingResult.finish()
                        }
                    }
                }
            }
        }
    }

    private fun getRecentMissedOrRejectedCall(context: Context): String? {
        try {
            if (androidx.core.content.ContextCompat.checkSelfPermission(
                    context,
                    android.Manifest.permission.READ_CALL_LOG
                ) != android.content.pm.PackageManager.PERMISSION_GRANTED
            ) {
                return null
            }
            val cursor = context.contentResolver.query(
                android.provider.CallLog.Calls.CONTENT_URI,
                arrayOf(
                    android.provider.CallLog.Calls.NUMBER,
                    android.provider.CallLog.Calls.TYPE,
                    android.provider.CallLog.Calls.DATE
                ),
                null,
                null,
                "${android.provider.CallLog.Calls.DATE} DESC"
            ) ?: return null

            cursor.use {
                var count = 0
                while (it.moveToNext() && count < 5) {
                    count++
                    val numberIdx = it.getColumnIndex(android.provider.CallLog.Calls.NUMBER)
                    val typeIdx = it.getColumnIndex(android.provider.CallLog.Calls.TYPE)
                    val dateIdx = it.getColumnIndex(android.provider.CallLog.Calls.DATE)

                    if (numberIdx >= 0 && typeIdx >= 0 && dateIdx >= 0) {
                        val number = it.getString(numberIdx)
                        val type = it.getInt(typeIdx)
                        val date = it.getLong(dateIdx)
                        val ageMs = System.currentTimeMillis() - date

                        // If call was within last 45 seconds and was missed (3), rejected (5), or blocked (6)
                        if (ageMs < 45_000L && (type == android.provider.CallLog.Calls.MISSED_TYPE ||
                                               type == android.provider.CallLog.Calls.REJECTED_TYPE ||
                                               type == android.provider.CallLog.Calls.BLOCKED_TYPE)) {
                            Log.d(TAG, "Resolved missed/rejected call from CallLog: $number (type: $type, age: ${ageMs}ms)")
                            return number
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "CallLog query fallback error: ${e.message}")
        }
        return null
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
