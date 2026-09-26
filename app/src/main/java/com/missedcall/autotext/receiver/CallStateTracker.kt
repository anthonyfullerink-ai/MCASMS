package com.missedcall.autotext.receiver

import android.content.Context
import android.content.SharedPreferences
import android.util.Log

/**
 * CallStateTracker provides persistent state tracking for telephone call lifecycle.
 * Because BroadcastReceivers can be killed or re-initialized across process boundaries
 * while a call is ringing, answered, or in progress, this tracker writes active call states
 * directly to persistent SharedPreferences.
 */
object CallStateTracker {
    private const val TAG = "CallStateTracker"
    private const val PREFS_NAME = "call_state_tracker_prefs"
    private const val KEY_IS_RINGING = "key_is_ringing"
    private const val KEY_WAS_ANSWERED = "key_was_answered"
    private const val KEY_RING_TIMESTAMP = "key_ring_timestamp"
    private const val KEY_OFFHOOK_TIMESTAMP = "key_offhook_timestamp"
    private const val KEY_CALLER_NUMBER = "key_caller_number"

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun onRinging(context: Context, number: String?) {
        Log.d(TAG, "Tracking RINGING: number=$number")
        val editor = getPrefs(context).edit()
            .putBoolean(KEY_IS_RINGING, true)
            .putBoolean(KEY_WAS_ANSWERED, false)
            .putLong(KEY_RING_TIMESTAMP, System.currentTimeMillis())
            .putLong(KEY_OFFHOOK_TIMESTAMP, 0L)
        if (!number.isNullOrBlank()) {
            editor.putString(KEY_CALLER_NUMBER, number)
        }
        editor.apply()
    }

    fun onOffhook(context: Context, number: String?): Boolean {
        val prefs = getPrefs(context)
        val isRinging = prefs.getBoolean(KEY_IS_RINGING, false)
        val ringTime = prefs.getLong(KEY_RING_TIMESTAMP, 0L)
        val ageMs = System.currentTimeMillis() - ringTime

        // If currently flagged as ringing or rang within the last 90 seconds,
        // this OFFHOOK state represents an incoming call being answered by the user.
        val isIncomingAnswered = isRinging || (ringTime > 0L && ageMs < 90_000L)
        if (isIncomingAnswered) {
            Log.i(TAG, "Tracking OFFHOOK: Incoming call answered! (ringAge=${ageMs}ms)")
            val editor = prefs.edit()
                .putBoolean(KEY_WAS_ANSWERED, true)
                .putLong(KEY_OFFHOOK_TIMESTAMP, System.currentTimeMillis())
            if (!number.isNullOrBlank()) {
                editor.putString(KEY_CALLER_NUMBER, number)
            }
            editor.apply()
            return true
        } else {
            Log.d(TAG, "Tracking OFFHOOK: Outgoing call or non-ringing offhook.")
            return false
        }
    }

    data class CallStateSnapshot(
        val wasRinging: Boolean,
        val wasAnswered: Boolean,
        val ringTimestamp: Long,
        val offhookTimestamp: Long,
        val callerNumber: String?
    )

    fun onIdle(context: Context): CallStateSnapshot {
        val prefs = getPrefs(context)
        val wasRinging = prefs.getBoolean(KEY_IS_RINGING, false)
        val wasAnswered = prefs.getBoolean(KEY_WAS_ANSWERED, false)
        val ringTimestamp = prefs.getLong(KEY_RING_TIMESTAMP, 0L)
        val offhookTimestamp = prefs.getLong(KEY_OFFHOOK_TIMESTAMP, 0L)
        val callerNumber = prefs.getString(KEY_CALLER_NUMBER, null)

        // Clear active call state for next call
        prefs.edit().clear().apply()

        // Double check: if offhook happened after ring, it was answered
        val answeredComputed = wasAnswered || (ringTimestamp > 0L && offhookTimestamp > 0L && offhookTimestamp >= ringTimestamp)

        Log.d(TAG, "Tracking IDLE: wasRinging=$wasRinging, wasAnswered=$answeredComputed, number=$callerNumber")

        return CallStateSnapshot(
            wasRinging = wasRinging,
            wasAnswered = answeredComputed,
            ringTimestamp = ringTimestamp,
            offhookTimestamp = offhookTimestamp,
            callerNumber = callerNumber
        )
    }
}
