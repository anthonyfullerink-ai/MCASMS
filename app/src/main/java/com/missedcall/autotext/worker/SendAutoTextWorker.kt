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
    }

    override suspend fun doWork(): Result {
        val targetNumber = inputData.getString(KEY_PHONE_NUMBER)
        if (targetNumber.isNullOrBlank()) {
            Log.e(TAG, "No target phone number provided")
            return Result.failure()
        }

        val overrideMessage = inputData.getString(KEY_OVERRIDE_MESSAGE)
        val isRemoteTrigger = inputData.getBoolean(KEY_IS_REMOTE_TRIGGER, false)
        val callbackUrl = inputData.getString(KEY_CALLBACK_URL)

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

        // 1. Check Master Switch
        if (!settings.masterEnabled) {
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

        // Determine message body
        val displayName = contactName ?: "there"
        val messageBody = if (!overrideMessage.isNullOrBlank()) {
            overrideMessage
        } else {
            settings.messageTemplate
                .replace("{business_name}", settings.businessName)
                .replace("{name}", displayName)
        }

        // Apply Random Jitter Delay (only if not explicit remote trigger)
        val delayMillis = if (!isRemoteTrigger) (settings.jitterDelaySeconds * 1000L).coerceAtLeast(0L) else 0L
        if (delayMillis > 0) {
            Log.d(TAG, "Applying jitter delay of ${settings.jitterDelaySeconds} seconds...")
            delay(delayMillis)
        }

        // Dispatch SMS using SmsManager with multi-part support
        return try {
            val smsManager = applicationContext.getSystemService(SmsManager::class.java)
                ?: @Suppress("DEPRECATION") SmsManager.getDefault()

            val parts = smsManager.divideMessage(messageBody)
            if (parts.size > 1) {
                Log.d(TAG, "Message exceeds single SMS limit, sending ${parts.size} multipart segments to $targetNumber")
                smsManager.sendMultipartTextMessage(targetNumber, null, parts, null, null)
            } else {
                smsManager.sendTextMessage(targetNumber, null, messageBody, null, null)
            }

            Log.i(TAG, "SMS successfully dispatched to $targetNumber")
            dao.insertLog(
                CallLogEvent(
                    phoneNumber = targetNumber,
                    status = if (isRemoteTrigger) LogStatus.REMOTE_SENT else LogStatus.SENT,
                    messageSent = messageBody
                )
            )

            if (!callbackUrl.isNullOrBlank()) {
                sendDeliveryCallback(callbackUrl, "SENT", targetNumber, messageBody, null)
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
                sendDeliveryCallback(callbackUrl, "FAILED", targetNumber, messageBody, e.localizedMessage)
            }

            Result.failure()
        }
    }

    private suspend fun sendDeliveryCallback(callbackUrl: String, status: String, phone: String, message: String?, reason: String?) {
        withContext(Dispatchers.IO) {
            try {
                Log.d(TAG, "Posting delivery callback to $callbackUrl with status $status...")
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
            } catch (e: Exception) {
                Log.w(TAG, "Failed to send delivery callback to $callbackUrl: ${e.localizedMessage}")
            }
        }
    }
}
