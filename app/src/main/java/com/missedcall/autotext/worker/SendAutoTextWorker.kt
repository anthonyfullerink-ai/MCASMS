package com.missedcall.autotext.worker

import android.content.Context
import android.telephony.SmsManager
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.missedcall.autotext.App
import com.missedcall.autotext.data.db.CallLogEvent
import com.missedcall.autotext.data.db.LogStatus
import com.missedcall.autotext.data.license.LicenseManager
import com.missedcall.autotext.data.license.LicenseStatus
import com.google.gson.Gson
import com.missedcall.autotext.util.ContactUtils
import com.missedcall.autotext.util.ScheduleUtils
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

class SendAutoTextWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    companion object {
        const val TAG = "SendAutoTextWorker"
        const val KEY_PHONE_NUMBER = "key_phone_number"
        const val KEY_OVERRIDE_MESSAGE = "key_override_message"
        const val KEY_IS_REMOTE_TRIGGER = "key_is_remote_trigger"
        const val KEY_CALLBACK_URL = "key_callback_url"
        const val KEY_SIM_SLOT = "key_sim_slot"

        private val recentDispatches = java.util.concurrent.ConcurrentHashMap<String, Long>()
    }

    override suspend fun doWork(): Result {
        val rawNumber = inputData.getString(KEY_PHONE_NUMBER)
        val targetNumber = rawNumber?.replace("[^0-9+]".toRegex(), "")?.trim()
        if (targetNumber.isNullOrBlank()) {
            Log.e(TAG, "No target phone number provided")
            return Result.failure()
        }

        val overrideMessage = inputData.getString(KEY_OVERRIDE_MESSAGE)
        val isRemoteTrigger = inputData.getBoolean(KEY_IS_REMOTE_TRIGGER, false)
        val callbackUrl = inputData.getString(KEY_CALLBACK_URL)
        val requestedSimSlot = inputData.getInt(KEY_SIM_SLOT, 0)

        // Deduplication safeguard: Prevent duplicate dispatch if both direct HTTP and FCM trigger
        val dedupKey = "$targetNumber:${overrideMessage?.hashCode() ?: 0}"
        val now = System.currentTimeMillis()
        val lastDispatched = recentDispatches[dedupKey] ?: 0L
        if (now - lastDispatched < 20_000L) {
            Log.i(TAG, "Suppressing duplicate SMS dispatch for $targetNumber within 20s window.")
            return Result.success()
        }
        recentDispatches[dedupKey] = now

        val app = applicationContext as App
        val settingsRepo = app.settingsRepository
        val db = app.database
        val dao = db.callLogDao()

        val settings = settingsRepo.getSettings()

        // Step 0: Check Appliance License Status
        val licenseInfo = LicenseManager.verifyLicenseKey(settings.licenseKey)
        val isRevoked = LicenseManager.checkOnlineRevocation(settings.licenseKey, settings.revocationManifestUrl)
        if (licenseInfo.status == LicenseStatus.UNLICENSED || licenseInfo.status == LicenseStatus.EXPIRED || isRevoked) {
            val reason = if (isRevoked) "License Revoked" else if (licenseInfo.status == LicenseStatus.EXPIRED) "License Expired" else "Appliance Unlicensed"
            Log.w(TAG, "SMS dispatch locked: $reason for $targetNumber")
            dao.insertLog(
                CallLogEvent(
                    phoneNumber = targetNumber,
                    status = LogStatus.SKIPPED_UNLICENSED,
                    failureReason = reason,
                    messageSent = null
                )
            )
            return Result.success()
        }

        // 1. Check Master Switch (Skip for explicit remote webhook triggers)
        if (!isRemoteTrigger && !settings.masterEnabled) {
            Log.d(TAG, "Master switch is disabled. Skipping auto-text for $targetNumber")
            return Result.success()
        }

        // 2. Check Exclude Saved Contacts (Only for automatic missed call triggers, skip if remote override message is explicit)
        val contactName = ContactUtils.getContactName(applicationContext, targetNumber)
        if (!isRemoteTrigger && settings.excludeSavedContacts && contactName != null) {
            Log.d(TAG, "Number $targetNumber is in contacts ($contactName). Skipping.")
            dao.insertLog(
                CallLogEvent(
                    phoneNumber = targetNumber,
                    status = LogStatus.SKIPPED_IN_CONTACTS,
                    messageSent = null
                )
            )
            com.missedcall.autotext.util.AiNotificationManager.notifyAiSmsIgnored(
                applicationContext,
                targetNumber,
                "Missed call auto-text to $targetNumber was skipped: Number is saved in your contacts ($contactName)."
            )
            return Result.success()
        }

        // 3. Check Cooldown Window (Skip for explicit remote webhook triggers)
        if (!isRemoteTrigger) {
            val lastSentTimestamp = dao.getLastSentTimestamp(targetNumber)
            if (lastSentTimestamp != null) {
                val cooldownMillis = settings.cooldownHours * 3600 * 1000L
                val timeElapsed = System.currentTimeMillis() - lastSentTimestamp
                if (timeElapsed < cooldownMillis) {
                    val remainingMins = ((cooldownMillis - timeElapsed) / 60000L).coerceAtLeast(1L)
                    Log.d(TAG, "Cooldown active for $targetNumber. Time elapsed: ${timeElapsed / 1000}s, Cooldown: ${settings.cooldownHours}h")
                    dao.insertLog(
                        CallLogEvent(
                            phoneNumber = targetNumber,
                            status = LogStatus.SKIPPED_COOLDOWN,
                            messageSent = null
                        )
                    )
                    com.missedcall.autotext.util.AiNotificationManager.notifyAiSmsIgnored(
                        applicationContext,
                        targetNumber,
                        "Missed call auto-text to $targetNumber was skipped: Cooldown is active ($remainingMins mins remaining in your ${settings.cooldownHours}h window)."
                    )
                    return Result.success()
                }
            }
        }

        // 4. Check Business Hours / Day of Week (Skip for explicit remote webhook triggers)
        if (!isRemoteTrigger && settings.businessHoursEnabled && !ScheduleUtils.isWithinBusinessHours(settings.schedule)) {
            Log.d(TAG, "Outside business hours. Skipping auto-text for $targetNumber")
            dao.insertLog(
                CallLogEvent(
                    phoneNumber = targetNumber,
                    status = LogStatus.SKIPPED_OFF_HOURS,
                    messageSent = null
                )
            )
            com.missedcall.autotext.util.AiNotificationManager.notifyAiSmsIgnored(
                applicationContext,
                targetNumber,
                "Missed call auto-text to $targetNumber was skipped: Call occurred outside configured Business Hours."
            )
            return Result.success()
        }

        val effectiveSimSlot = if (requestedSimSlot > 0) requestedSimSlot else settings.preferredSimSlot

        // 5. Outbound Missed Call Forwarding (e.g. to n8n Webhook)
        if (!isRemoteTrigger) {
            com.missedcall.autotext.util.WebhookDispatcher.dispatchEvent(
                context = applicationContext,
                settings = settings,
                eventType = "call.missed",
                callerNumber = targetNumber,
                simSlot = effectiveSimSlot,
                disposition = "no-answer"
            )
        }

        // 5.5 Check AI Voice Receptionist Forwarding (Approach 2: Event-Driven Reconciliation Buffer)
        if (!isRemoteTrigger && settings.voiceReceptionistEnabled) {
            val cleanDigits = targetNumber.filter { it.isDigit() }.takeLast(10)
            val recentCutoff = System.currentTimeMillis() - 10 * 60 * 1000L // last 10 minutes
            val hasRecentVoiceCall = try {
                app.database.voiceCallDao().countRecentVoiceCalls(cleanDigits, recentCutoff) > 0
            } catch (e: Exception) {
                false
            }

            if (hasRecentVoiceCall) {
                Log.i(TAG, "AI Voice Receptionist handled call for $targetNumber. Suppressing native canned SMS.")
                dao.insertLog(
                    CallLogEvent(
                        phoneNumber = targetNumber,
                        status = LogStatus.FORWARDED_TO_WEBHOOK,
                        messageSent = "[Muted - Handed over to AI Voice Receptionist]"
                    )
                )
                return Result.success()
            } else {
                Log.i(TAG, "Reconciliation Buffer expired for $targetNumber: No AI voice session detected (caller hung up early). Proceeding with native auto-reply!")
            }
        }

        // 6. Check Mute Native Auto-Reply (If user uses n8n to respond, avoid double-texting)
        if (!isRemoteTrigger && settings.muteNativeAutoReply) {
            Log.i(TAG, "Native auto-reply template is MUTED (n8n automation active). Skipping local SMS for $targetNumber")
            dao.insertLog(
                CallLogEvent(
                    phoneNumber = targetNumber,
                    status = LogStatus.FORWARDED_TO_WEBHOOK,
                    messageSent = "[Muted - Forwarded to n8n Webhook]"
                )
            )
            return Result.success()
        }

        // Determine message body
        val displayName = contactName ?: "there"
        val messageBody = if (!overrideMessage.isNullOrBlank()) {
            overrideMessage
        } else {
            val cleanAct = settings.contractorActivity.ifBlank { "hands full" }
            val cleanLink = settings.contractorGoalLink.ifBlank { "https://missedcallautosms.com" }
            val cleanAgent = settings.voiceAgentName.ifBlank { "Riley" }
            settings.messageTemplate
                .replace("{business_name}", settings.businessName, ignoreCase = true)
                .replace("{name}", displayName, ignoreCase = true)
                .replace("{activity}", cleanAct, ignoreCase = true)
                .replace("{booking_link}", cleanLink, ignoreCase = true)
                .replace("{agent_name}", cleanAgent, ignoreCase = true)
        }

        // Apply 40-Second Delay (Human pacing simulation requested by user)
        val delayMillis = 40_000L
        Log.d(TAG, "Applying human pacing 40-second delay before sending SMS to $targetNumber...")
        delay(delayMillis)

        // Carrier Anti-Spam & SIM Burn Safeguard™ (Minimum 3.5s pacing + burst protection)
        com.missedcall.autotext.util.SmsRateLimiter.acquireSendSlot(isRemoteTrigger)

        // Dispatch SMS using SmsManager with multi-part and Dual SIM support
        return try {
            val smsManager = getSmsManager(effectiveSimSlot, settings.preferredSimSubscriptionId)

            val parts = smsManager.divideMessage(messageBody)
            if (parts.size > 1) {
                Log.d(TAG, "Message exceeds single SMS limit, sending ${parts.size} multipart segments to $targetNumber (SIM Slot: $effectiveSimSlot)")
                smsManager.sendMultipartTextMessage(targetNumber, null, parts, null, null)
            } else {
                Log.d(TAG, "Sending single SMS to $targetNumber (SIM Slot: $effectiveSimSlot)")
                smsManager.sendTextMessage(targetNumber, null, messageBody, null, null)
            }

            Log.i(TAG, "SMS successfully dispatched to $targetNumber via SIM slot $effectiveSimSlot")
            dao.insertLog(
                CallLogEvent(
                    phoneNumber = targetNumber,
                    status = if (isRemoteTrigger) LogStatus.REMOTE_SENT else LogStatus.SENT,
                    messageSent = messageBody
                )
            )

            com.missedcall.autotext.util.AiNotificationManager.notifyAiSmsActivity(
                context = applicationContext,
                callerPhone = targetNumber,
                messageText = messageBody,
                isOutbound = true
            )

            com.missedcall.autotext.util.WebhookDispatcher.dispatchEvent(
                context = applicationContext,
                settings = settings,
                eventType = "sms.sent",
                callerNumber = targetNumber,
                simSlot = effectiveSimSlot,
                messageBody = messageBody
            )
            
            if (!callbackUrl.isNullOrBlank()) {
                sendDeliveryCallback(callbackUrl, "SENT", targetNumber, messageBody, null, effectiveSimSlot)
            }

            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send SMS to $targetNumber", e)
            dao.insertLog(
                CallLogEvent(
                    phoneNumber = targetNumber,
                    status = LogStatus.FAILED_SIM_ERROR,
                    failureReason = e.localizedMessage ?: "SIM/Telephony Error",
                    messageSent = messageBody
                )
            )

            com.missedcall.autotext.util.WebhookDispatcher.dispatchEvent(
                context = applicationContext,
                settings = settings,
                eventType = "sms.sent",
                callerNumber = targetNumber,
                simSlot = effectiveSimSlot,
                messageBody = messageBody,
                errorReason = e.localizedMessage ?: "Unknown Error"
            )

            if (!callbackUrl.isNullOrBlank()) {
                sendDeliveryCallback(callbackUrl, "FAILED", targetNumber, messageBody, e.localizedMessage, effectiveSimSlot)
            }

            Result.failure()
        }
    }

    private fun getSmsManager(slot: Int, cachedSubscriptionId: Int = -1): SmsManager {
        if (cachedSubscriptionId >= 0) {
            Log.i(TAG, "Using cached subscriptionId: $cachedSubscriptionId (bypassing slot lookup)")
            return try {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                    applicationContext.getSystemService(SmsManager::class.java).createForSubscriptionId(cachedSubscriptionId)
                } else {
                    @Suppress("DEPRECATION")
                    SmsManager.getSmsManagerForSubscriptionId(cachedSubscriptionId)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Cached subscriptionId $cachedSubscriptionId is no longer valid: ${e.localizedMessage}. Falling back to slot lookup.")
                getSmsManagerBySlot(slot)
            }
        }
        return getSmsManagerBySlot(slot)
    }

    private fun getSmsManagerBySlot(slot: Int): SmsManager {
        if (slot > 0) {
            val targetSlotIndex = slot - 1
            try {
                val subscriptionManager = applicationContext.getSystemService(android.telephony.SubscriptionManager::class.java)
                @android.annotation.SuppressLint("MissingPermission")
                val activeSubs = subscriptionManager?.activeSubscriptionInfoList
                val targetSub = activeSubs?.firstOrNull { it.simSlotIndex == targetSlotIndex }
                if (targetSub != null) {
                    val subId = targetSub.subscriptionId
                    Log.i(TAG, "Targeting SIM Slot $slot (${targetSub.displayName ?: targetSub.carrierName}, SubscriptionId: $subId)")
                    return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                        applicationContext.getSystemService(SmsManager::class.java).createForSubscriptionId(subId)
                    } else {
                        @Suppress("DEPRECATION")
                        SmsManager.getSmsManagerForSubscriptionId(subId)
                    }
                } else {
                    Log.w(TAG, "Requested SIM slot $slot, but no active subscription found for slot index $targetSlotIndex. Falling back to default SIM.")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Could not resolve Dual SIM subscription for slot $slot: ${e.localizedMessage}. Falling back to default SMS manager.")
            }
        }
        return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            applicationContext.getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }
    }


    private fun sendDeliveryCallback(callbackUrl: String, status: String, phoneNumber: String, message: String, error: String?, simSlot: Int) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = URL(callbackUrl)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.connectTimeout = 10000
                conn.readTimeout = 10000

                val payload = """
                    {
                        "status": "$status",
                        "phoneNumber": "$phoneNumber",
                        "message": "$message",
                        "error": "${error ?: ""}",
                        "simSlot": $simSlot,
                        "timestamp": "${System.currentTimeMillis()}"
                    }
                """.trimIndent()

                conn.outputStream.use { it.write(payload.toByteArray(StandardCharsets.UTF_8)) }
                val code = conn.responseCode
                Log.i(TAG, "Delivery callback sent for $phoneNumber. Response: $code")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send delivery callback for $phoneNumber", e)
            }
        }
    }
}
