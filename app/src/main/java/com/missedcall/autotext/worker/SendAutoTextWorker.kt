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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
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
        const val MAX_WEBHOOK_RETRIES = 5
        const val KEY_AI_INTENT = "key_ai_intent"
        const val KEY_AI_SUMMARY = "key_ai_summary"
    }

    sealed class WebhookResult {
        object Success : WebhookResult()
        object TransientFailure : WebhookResult()
        object PermanentFailure : WebhookResult()
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
            return Result.success()
        }

        // 3. Check Cooldown Window (Skip for explicit remote webhook triggers)
        if (!isRemoteTrigger) {
            val lastSentTimestamp = dao.getLastSentTimestamp(targetNumber)
            if (lastSentTimestamp != null) {
                val cooldownMillis = settings.cooldownHours * 3600 * 1000L
                val timeElapsed = System.currentTimeMillis() - lastSentTimestamp
                if (timeElapsed < cooldownMillis) {
                    Log.d(TAG, "Cooldown active for $targetNumber. Time elapsed: ${timeElapsed / 1000}s, Cooldown: ${settings.cooldownHours}h")
                    dao.insertLog(
                        CallLogEvent(
                            phoneNumber = targetNumber,
                            status = LogStatus.SKIPPED_COOLDOWN,
                            messageSent = null
                        )
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
            return Result.success()
        }

        val effectiveSimSlot = if (requestedSimSlot > 0) requestedSimSlot else settings.preferredSimSlot

        // 5. Outbound Missed Call Forwarding (e.g. to n8n Webhook)
        if (!isRemoteTrigger && settings.outboundWebhookEnabled && settings.selectedOutboundWebhookUrl.isNotBlank()) {
            Log.i(TAG, "Forwarding missed call from $targetNumber to n8n webhook: ${settings.selectedOutboundWebhookUrl}")
            val webhookResult = sendOutboundMissedCallWebhook(
                webhookUrl = settings.selectedOutboundWebhookUrl,
                phoneNumber = targetNumber,
                callerName = contactName ?: "Unknown",
                simSlot = effectiveSimSlot,
                deviceId = LicenseManager.getDeviceId(applicationContext)
            )
            if (webhookResult is WebhookResult.TransientFailure) {
                if (runAttemptCount < MAX_WEBHOOK_RETRIES) {
                    Log.w(TAG, "Transient failure sending webhook for $targetNumber. Retrying (Attempt $runAttemptCount)...")
                    return Result.retry()
                } else {
                    Log.e(TAG, "Max retries ($MAX_WEBHOOK_RETRIES) reached for outbound webhook for $targetNumber. Proceeding with SMS.")
                }
            } else if (webhookResult is WebhookResult.PermanentFailure) {
                Log.e(TAG, "Permanent failure sending webhook for $targetNumber. Skipping retry.")
            }
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

        // PRIORITY 1: Explicit Override Message (Direct API trigger)
        val messageBody = if (!overrideMessage.isNullOrBlank()) {
            overrideMessage
        } else {
            // PRIORITY 2: AI Intent-Based Template
            val aiIntent = inputData.getString(KEY_AI_INTENT)
            val aiSummary = inputData.getString(KEY_AI_SUMMARY)

            if (!aiIntent.isNullOrBlank()) {
                val category = com.missedcall.autotext.util.IntentMapper.mapIntentToCategory(aiIntent)
                val clientId = settings.licenseKey // Using license key as clientId for Firestore mapping
                val template = com.missedcall.autotext.data.repository.TemplateRepository.getTemplate(clientId, category)

                template
                    .replace("{business_name}", settings.businessName, ignoreCase = true)
                    .replace("{name}", displayName, ignoreCase = true)
                    .replace("{activity}", settings.contractorActivity.ifBlank { "hands full" }, ignoreCase = true)
                    .replace("{booking_link}", settings.contractorGoalLink.ifBlank { "https://missedcallautosms.com" }, ignoreCase = true)
                    .replace("{agent_name}", settings.voiceAgentName.ifBlank { "Riley" }, ignoreCase = true)
                    .replace("{ai_summary}", aiSummary ?: "your call", ignoreCase = true)
            } else {
                // PRIORITY 3: Standard Canned Response
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
        }


        // Apply Random Jitter Delay (only if not explicit remote trigger)
        val delayMillis = if (!isRemoteTrigger) (settings.jitterDelaySeconds * 1000L).coerceAtLeast(0L) else 0L
        if (delayMillis > 0) {
            Log.d(TAG, "Applying jitter delay of ${settings.jitterDelaySeconds} seconds...")
            delay(delayMillis)
        }

        // Carrier Anti-Spam & SIM Burn Safeguard™ (Minimum 3.5s pacing + burst protection)
        com.missedcall.autotext.util.SmsRateLimiter.acquireSendSlot(isRemoteTrigger)

        // Dispatch SMS using SmsManager with multi-part and Dual SIM support
        // Item 8: Pass cached subscriptionId to bypass fragile slot-index lookup
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

            if (!callbackUrl.isNullOrBlank()) {
                val callbackResult = sendDeliveryCallback(callbackUrl, "SENT", targetNumber, messageBody, null, effectiveSimSlot)
                if (callbackResult is WebhookResult.TransientFailure) {
                    if (runAttemptCount < MAX_WEBHOOK_RETRIES) {
                        Log.w(TAG, "Transient failure sending delivery callback for $targetNumber. Retrying (Attempt $runAttemptCount)...")
                        return Result.retry()
                    } else {
                        Log.e(TAG, "Max retries reached for delivery callback for $targetNumber.")
                    }
                }
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

            if (!callbackUrl.isNullOrBlank()) {
                val callbackResult = sendDeliveryCallback(callbackUrl, "FAILED", targetNumber, messageBody, e.localizedMessage, effectiveSimSlot)
                if (callbackResult is WebhookResult.TransientFailure) {
                    if (runAttemptCount < MAX_WEBHOOK_RETRIES) {
                        Log.w(TAG, "Transient failure sending failure callback for $targetNumber. Retrying (Attempt $runAttemptCount)...")
                        return Result.retry()
                    } else {
                        Log.e(TAG, "Max retries reached for failure callback for $targetNumber.")
                    }
                }
            }

            Result.failure()
        }
    }

    private fun getSmsManager(slot: Int, cachedSubscriptionId: Int = -1): SmsManager {
        // Item 8: Use cached subscriptionId directly if available (stable across reboots)
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
                Log.w(TAG, "Could not resolve Dual SIM subscription for slot $slot: ${e.localizedMessage}. Using default SIM.")
            }
        }

        return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            applicationContext.getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }
    }



    private suspend fun sendDeliveryCallback(
        callbackUrl: String,
        status: String,
        phone: String,
        message: String?,
        reason: String?,
        simSlot: Int = 0
    ): WebhookResult = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "Posting delivery callback to $callbackUrl with status $status (SIM Slot: $simSlot)...")
            val url = URL(callbackUrl)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json; utf-8")
            conn.setRequestProperty("Accept", "application/json")
            conn.doOutput = true
            conn.connectTimeout = 8000
            conn.readTimeout = 8000

            val payloadMap = mutableMapOf<String, Any>(
                "status" to status,
                "phone" to phone,
                "timestamp" to System.currentTimeMillis()
            )
            if (simSlot > 0) payloadMap["sim_slot"] = simSlot
            if (!message.isNullOrBlank()) payloadMap["message"] = message
            if (!reason.isNullOrBlank()) payloadMap["reason"] = reason

            val jsonBody = Gson().toJson(payloadMap)
            conn.outputStream.use { os ->
                val input = jsonBody.toByteArray(StandardCharsets.UTF_8)
                os.write(input, 0, input.size)
            }

            val responseCode = conn.responseCode
            Log.i(TAG, "Delivery callback sent to $callbackUrl. HTTP response: $responseCode")
            conn.disconnect()

            if (responseCode in 200..299) {
                WebhookResult.Success
            } else if (responseCode >= 500) {
                WebhookResult.TransientFailure
            } else {
                WebhookResult.PermanentFailure
            }
        } catch (e: java.io.IOException) {
            Log.w(TAG, "Network error during delivery callback to $callbackUrl: ${e.localizedMessage}")
            WebhookResult.TransientFailure
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error during delivery callback to $callbackUrl", e)
            WebhookResult.PermanentFailure
        }
    }

    private suspend fun sendOutboundMissedCallWebhook(
        webhookUrl: String,
        phoneNumber: String,
        callerName: String,
        simSlot: Int,
        deviceId: String
    ): WebhookResult = withContext(Dispatchers.IO) {
        try {
            val url = URL(webhookUrl)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json; utf-8")
            conn.setRequestProperty("Accept", "application/json")
            conn.doOutput = true
            conn.connectTimeout = 8000
            conn.readTimeout = 8000

            val payloadMap = mutableMapOf<String, Any>(
                "event" to "MISSED_CALL",
                "phone" to phoneNumber,
                "caller_name" to callerName,
                "timestamp" to System.currentTimeMillis(),
                "device_id" to deviceId
            )
            if (simSlot > 0) payloadMap["sim_slot"] = simSlot

            val jsonBody = Gson().toJson(payloadMap)
            conn.outputStream.use { os ->
                val input = jsonBody.toByteArray(StandardCharsets.UTF_8)
                os.write(input, 0, input.size)
            }

            val responseCode = conn.responseCode
            Log.i(TAG, "Outbound missed call event forwarded to $webhookUrl. HTTP response: $responseCode")
            conn.disconnect()

            if (responseCode in 200..299) {
                WebhookResult.Success
            } else if (responseCode >= 500) {
                WebhookResult.TransientFailure
            } else {
                WebhookResult.PermanentFailure
            }
        } catch (e: java.io.IOException) {
            Log.w(TAG, "Network error forwarding missed call to $webhookUrl: ${e.localizedMessage}")
            WebhookResult.TransientFailure
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error forwarding missed call to $webhookUrl", e)
            WebhookResult.PermanentFailure
        }
    }
}
