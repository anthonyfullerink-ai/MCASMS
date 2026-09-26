package com.missedcall.autotext.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import android.util.Log
import androidx.work.*
import com.missedcall.autotext.App
import com.missedcall.autotext.worker.SendAutoTextWorker
import kotlinx.coroutines.launch
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import java.util.concurrent.atomic.AtomicBoolean

class CallStateReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "CallStateReceiver"

        // Thread-safe in-memory state tracking across broadcast receiver instances
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
                CallStateTracker.onRinging(context, incomingNumber)

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
                val answeredInTracker = CallStateTracker.onOffhook(context, incomingNumber)
                if (isRinging.get() || answeredInTracker) {
                    wasAnswered.set(true)
                    Log.i(TAG, "Call answered (OFFHOOK). wasAnswered marked true.")
                }
            }
            TelephonyManager.EXTRA_STATE_IDLE -> {
                val memoryRinging = isRinging.getAndSet(false)
                val memoryAnswered = wasAnswered.getAndSet(false)
                val memoryNumber = incomingNumber
                incomingNumber = null

                val snapshot = CallStateTracker.onIdle(context)

                val wasRinging = memoryRinging || snapshot.wasRinging
                val wasAnsweredFlag = memoryAnswered || snapshot.wasAnswered
                val targetNumberHint = (if (!memoryNumber.isNullOrBlank()) memoryNumber else snapshot.callerNumber)?.trim()

                Log.i(TAG, "IDLE reached: wasRinging=$wasRinging, wasAnswered=$wasAnsweredFlag, targetNumberHint=$targetNumberHint")

                // Step 1: If receiver or tracker detected call was answered during OFFHOOK, immediately suppress auto-text
                if (wasAnsweredFlag) {
                    Log.i(TAG, "Call was explicitly ANSWERED by user (OFFHOOK tracked). Suppressing auto-text.")
                    if (!targetNumberHint.isNullOrBlank()) {
                        CoroutineScope(Dispatchers.IO).launch {
                            try {
                                val settingsRepo = (context.applicationContext as App).settingsRepository
                                com.missedcall.autotext.util.WebhookDispatcher.dispatchEvent(
                                    context = context,
                                    settings = settingsRepo.getSettings(),
                                    eventType = "call.completed",
                                    callerNumber = targetNumberHint,
                                    disposition = "answered"
                                )
                            } catch (e: Exception) {
                                Log.w(TAG, "Call completed webhook dispatch failed: ${e.message}")
                            }
                        }
                    }
                    return
                }

                // Step 2: If wasAnsweredFlag is false, verify against Android CallLog before doing anything
                val pendingResult = goAsync()
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        var resolvedRecord: CallLogRecord? = null

                        // Poll CallLog for up to 3 seconds (up to 7 attempts: 250ms, 450ms, 450ms, 500ms, 500ms, 500ms, 500ms)
                        for (attempt in 1..7) {
                            resolvedRecord = queryRecentCallRecord(context, targetNumberHint)
                            if (resolvedRecord != null) {
                                break
                            }
                            kotlinx.coroutines.delay(if (attempt == 1) 250L else 450L)
                        }

                        if (resolvedRecord != null) {
                            Log.i(TAG, "CallLog record resolved: number=${resolvedRecord.number}, type=${resolvedRecord.type}, duration=${resolvedRecord.duration}s, age=${resolvedRecord.ageMs}ms")

                            // Safeguard 1: Was this call answered, connected, or outgoing?
                            if (resolvedRecord.isAnsweredOrConnected()) {
                                Log.i(TAG, "CallLog confirms call was ANSWERED/CONNECTED (type=${resolvedRecord.type}, duration=${resolvedRecord.duration}s). Suppressing auto-text.")
                                val settingsRepo = (context.applicationContext as App).settingsRepository
                                com.missedcall.autotext.util.WebhookDispatcher.dispatchEvent(
                                    context = context,
                                    settings = settingsRepo.getSettings(),
                                    eventType = "call.completed",
                                    callerNumber = resolvedRecord.number,
                                    disposition = "answered"
                                )
                                return@launch
                            }

                            // Safeguard 2: Is this a confirmed Missed or Rejected call?
                            if (resolvedRecord.isMissedOrRejected()) {
                                Log.i(TAG, "Confirmed MISSED / REJECTED call from: ${resolvedRecord.number} (type=${resolvedRecord.type}). Triggering auto-text.")
                                enqueueAutoTextWorker(context, resolvedRecord.number)
                                return@launch
                            }

                            Log.w(TAG, "CallLog record type ${resolvedRecord.type} is not eligible for auto-text. Suppressing.")
                            return@launch
                        }

                        // Fallback: If no CallLog record could be read (e.g. permission missing or OEM delay):
                        // Only trigger if it was actively ringing AND we captured a valid phone number AND it was not marked answered!
                        if (wasRinging && !targetNumberHint.isNullOrBlank()) {
                            Log.w(TAG, "CallLog query timed out. Enqueueing auto-text worker for $targetNumberHint with secondary safeguard.")
                            enqueueAutoTextWorker(context, targetNumberHint)
                        } else {
                            Log.d(TAG, "IDLE reached without confirmed missed call or ringing target. No SMS dispatched.")
                        }
                    } finally {
                        pendingResult.finish()
                    }
                }
            }
        }
    }

    data class CallLogRecord(
        val number: String,
        val type: Int,
        val duration: Long,
        val date: Long,
        val ageMs: Long
    ) {
        fun isAnsweredOrConnected(): Boolean {
            return type == android.provider.CallLog.Calls.INCOMING_TYPE ||
                   type == android.provider.CallLog.Calls.OUTGOING_TYPE ||
                   type == android.provider.CallLog.Calls.ANSWERED_EXTERNALLY_TYPE ||
                   duration > 0L
        }

        fun isMissedOrRejected(): Boolean {
            return (type == android.provider.CallLog.Calls.MISSED_TYPE ||
                    type == android.provider.CallLog.Calls.REJECTED_TYPE ||
                    type == android.provider.CallLog.Calls.BLOCKED_TYPE) && duration == 0L
        }
    }

    private fun queryRecentCallRecord(context: Context, targetNumberHint: String?): CallLogRecord? {
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
                    android.provider.CallLog.Calls.DATE,
                    android.provider.CallLog.Calls.DURATION
                ),
                null,
                null,
                "${android.provider.CallLog.Calls.DATE} DESC"
            ) ?: return null

            cursor.use {
                var count = 0
                var fallbackRecentRecord: CallLogRecord? = null

                while (it.moveToNext() && count < 15) {
                    count++
                    val numberIdx = it.getColumnIndex(android.provider.CallLog.Calls.NUMBER)
                    val typeIdx = it.getColumnIndex(android.provider.CallLog.Calls.TYPE)
                    val dateIdx = it.getColumnIndex(android.provider.CallLog.Calls.DATE)
                    val durationIdx = it.getColumnIndex(android.provider.CallLog.Calls.DURATION)

                    if (numberIdx >= 0 && typeIdx >= 0 && dateIdx >= 0 && durationIdx >= 0) {
                        val number = it.getString(numberIdx) ?: ""
                        val type = it.getInt(typeIdx)
                        val date = it.getLong(dateIdx)
                        val duration = it.getLong(durationIdx)
                        val ageMs = System.currentTimeMillis() - date

                        // Only consider calls within the last 90 seconds
                        if (ageMs < 90_000L) {
                            val record = CallLogRecord(
                                number = number,
                                type = type,
                                duration = duration,
                                date = date,
                                ageMs = ageMs
                            )

                            if (!targetNumberHint.isNullOrBlank()) {
                                if (isSamePhoneNumber(number, targetNumberHint)) {
                                    return record
                                }
                            } else {
                                // If no hint was provided, the very first recent call within 90s is our candidate
                                if (fallbackRecentRecord == null) {
                                    fallbackRecentRecord = record
                                }
                            }
                        }
                    }
                }
                return fallbackRecentRecord
            }
        } catch (e: Exception) {
            Log.w(TAG, "CallLog query error: ${e.message}")
        }
        return null
    }

    private fun isSamePhoneNumber(num1: String?, num2: String?): Boolean {
        if (num1.isNullOrBlank() || num2.isNullOrBlank()) return false
        val d1 = num1.filter { it.isDigit() }
        val d2 = num2.filter { it.isDigit() }
        if (d1.isEmpty() || d2.isEmpty()) return false
        if (d1 == d2) return true
        val minLen = minOf(d1.length, d2.length)
        if (minLen >= 7) {
            val compareLen = minOf(10, minLen)
            return d1.takeLast(compareLen) == d2.takeLast(compareLen)
        }
        return false
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
