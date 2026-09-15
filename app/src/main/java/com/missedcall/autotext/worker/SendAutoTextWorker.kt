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
import com.missedcall.autotext.util.ContactUtils
import com.missedcall.autotext.util.ScheduleUtils
import kotlinx.coroutines.delay

class SendAutoTextWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    companion object {
        const val TAG = "SendAutoTextWorker"
        const val KEY_PHONE_NUMBER = "key_phone_number"
    }

    override suspend fun doWork(): Result {
        val targetNumber = inputData.getString(KEY_PHONE_NUMBER)
        if (targetNumber.isNullOrBlank()) {
            Log.e(TAG, "No target phone number provided")
            return Result.failure()
        }

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

        // 2. Check Exclude Saved Contacts
        val contactName = ContactUtils.getContactName(applicationContext, targetNumber)
        if (settings.excludeSavedContacts && contactName != null) {
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

        // 3. Check Cooldown Window
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

        // 4. Check Business Hours / Day of Week
        if (settings.businessHoursEnabled && !ScheduleUtils.isWithinBusinessHours(settings.schedule)) {
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

        // Dynamic Template Substitution
        val displayName = contactName ?: "there"
        val messageBody = settings.messageTemplate
            .replace("{business_name}", settings.businessName)
            .replace("{name}", displayName)

        // Apply Random Jitter Delay
        val delayMillis = (settings.jitterDelaySeconds * 1000L).coerceAtLeast(0L)
        if (delayMillis > 0) {
            Log.d(TAG, "Applying jitter delay of ${settings.jitterDelaySeconds} seconds...")
            delay(delayMillis)
        }

        // Dispatch SMS using SmsManager
        return try {
            val smsManager = applicationContext.getSystemService(SmsManager::class.java)
                ?: @Suppress("DEPRECATION") SmsManager.getDefault()

            smsManager.sendTextMessage(targetNumber, null, messageBody, null, null)

            Log.i(TAG, "SMS successfully dispatched to $targetNumber")
            dao.insertLog(
                CallLogEvent(
                    phoneNumber = targetNumber,
                    status = LogStatus.SENT,
                    messageSent = messageBody
                )
            )
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
            Result.failure()
        }
    }
}
