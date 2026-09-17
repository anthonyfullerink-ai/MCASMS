package com.missedcall.autotext.util

import android.util.Log
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * SIM Burn Safeguard™
 * Protects carrier SIMs (Verizon, AT&T, T-Mobile, etc.) from carrier-level spam throttling
 * or suspension caused by rapid webhook loops or runaway automation bursts.
 *
 * Automatically spaces all outbound SMS dispatches by at least 3.5 seconds, and caps
 * burst velocity to a safe peer-to-peer volume.
 */
object SmsRateLimiter {

    private const val TAG = "SmsRateLimiter"
    private val mutex = Mutex()
    private var lastDispatchedTime = 0L

    // Minimum carrier interval between successive outbound SMS dispatches
    const val MIN_DISPATCH_INTERVAL_MS = 3500L // 3.5 seconds

    // Burst window limits
    private val recentDispatchTimestamps = mutableListOf<Long>()
    private const val BURST_WINDOW_MS = 60_000L // 1 minute
    private const val MAX_PER_WINDOW = 20 // Safe 20 SMS per minute max

    suspend fun acquireSendSlot(isRemoteTrigger: Boolean): Boolean {
        mutex.withLock {
            val now = System.currentTimeMillis()

            // 1. Prune timestamps older than 60-second window
            recentDispatchTimestamps.removeAll { now - it > BURST_WINDOW_MS }

            // 2. Velocity burst throttle (Prevents accidental n8n infinite loops from burning SIM)
            if (recentDispatchTimestamps.size >= MAX_PER_WINDOW) {
                Log.w(TAG, "⚠️ SIM Burn Safeguard Active: ${recentDispatchTimestamps.size} SMS sent in last 60s. Cooling down for 4s...")
                delay(4000L)
            }

            // 3. Sequential Carrier Pacing: Ensure at least MIN_DISPATCH_INTERVAL_MS has elapsed
            val elapsed = System.currentTimeMillis() - lastDispatchedTime
            if (elapsed < MIN_DISPATCH_INTERVAL_MS) {
                val delayNeeded = MIN_DISPATCH_INTERVAL_MS - elapsed
                Log.d(TAG, "🛡️ SIM Burn Safeguard: Pacing carrier queue by ${delayNeeded}ms...")
                delay(delayNeeded)
            }

            val finalTimestamp = System.currentTimeMillis()
            lastDispatchedTime = finalTimestamp
            recentDispatchTimestamps.add(finalTimestamp)
            return true
        }
    }
}
