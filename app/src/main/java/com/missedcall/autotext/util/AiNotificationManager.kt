package com.missedcall.autotext.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.missedcall.autotext.App
import com.missedcall.autotext.R
import com.missedcall.autotext.data.db.AppNotificationEvent
import com.missedcall.autotext.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

object AiNotificationManager {

    private const val CHANNEL_ACTIVITY_ID = "mcas_ai_activity"
    private const val CHANNEL_ACTIVITY_NAME = "AI Receptionist & SMS Activity"

    private const val CHANNEL_BOOKINGS_ID = "mcas_ai_bookings"
    private const val CHANNEL_BOOKINGS_NAME = "Appointments & Bookings"

    private const val CHANNEL_EMERGENCY_ID = "mcas_ai_emergency"
    private const val CHANNEL_EMERGENCY_NAME = "Emergency Lead Alerts"

    private val scope = CoroutineScope(Dispatchers.IO)

    fun initChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return

            // Activity Channel
            val activityChannel = NotificationChannel(
                CHANNEL_ACTIVITY_ID,
                CHANNEL_ACTIVITY_NAME,
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Live updates when AI answers calls, chats with callers, or sends follow-up texts"
                enableLights(true)
            }

            // Bookings Channel
            val bookingsChannel = NotificationChannel(
                CHANNEL_BOOKINGS_ID,
                CHANNEL_BOOKINGS_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "High-priority alerts when appointments are scheduled in your calendar"
                enableLights(true)
                enableVibration(true)
            }

            // Emergency Channel
            val emergencyChannel = NotificationChannel(
                CHANNEL_EMERGENCY_ID,
                CHANNEL_EMERGENCY_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Critical alerts when callers mention urgent keywords like leaks, outages, or hazards"
                enableLights(true)
                enableVibration(true)
            }

            notificationManager.createNotificationChannels(listOf(activityChannel, bookingsChannel, emergencyChannel))
        }
    }

    fun notifyVoiceCallStarted(context: Context, callerPhone: String) {
        val title = "🎙️ AI Receptionist Answering"
        val message = "Live call connected with $callerPhone. Qualifying lead..."
        postNotificationAndSave(
            context = context,
            title = title,
            message = message,
            type = "VOICE_CALL_STARTED",
            phoneNumber = callerPhone,
            channelId = CHANNEL_ACTIVITY_ID,
            notificationId = 1001
        )
    }

    fun notifyVoiceCallCompleted(
        context: Context,
        callerPhone: String,
        durationSec: Int,
        summary: String,
        isUrgent: Boolean = false
    ) {
        val durationFormatted = "${durationSec / 60}m ${durationSec % 60}s"
        val title = if (isUrgent) "🚨 Urgent Call: $callerPhone" else "✅ AI Call Complete: $callerPhone ($durationFormatted)"
        val message = summary.ifBlank { "Caller requested service callback." }

        postNotificationAndSave(
            context = context,
            title = title,
            message = message,
            type = if (isUrgent) "EMERGENCY_ALERT" else "VOICE_CALL_COMPLETED",
            phoneNumber = callerPhone,
            channelId = if (isUrgent) CHANNEL_EMERGENCY_ID else CHANNEL_ACTIVITY_ID,
            notificationId = (2000 + (System.currentTimeMillis() % 1000)).toInt()
        )
    }

    fun notifyAppointmentBooked(
        context: Context,
        customerName: String,
        callerPhone: String,
        dateTimeStr: String,
        address: String = ""
    ) {
        val title = "📅 New Booking: $customerName"
        val locationStr = if (address.isNotBlank()) " • $address" else ""
        val message = "Appointment confirmed for $dateTimeStr$locationStr. Added to Google Calendar."

        postNotificationAndSave(
            context = context,
            title = title,
            message = message,
            type = "APPOINTMENT_BOOKED",
            phoneNumber = callerPhone,
            channelId = CHANNEL_BOOKINGS_ID,
            notificationId = (3000 + (System.currentTimeMillis() % 1000)).toInt()
        )
    }

    fun notifyAiSmsActivity(
        context: Context,
        callerPhone: String,
        messageText: String,
        isOutbound: Boolean
    ) {
        val title = if (isOutbound) "💬 AI Replied to $callerPhone" else "💬 Incoming SMS from $callerPhone"
        val type = if (isOutbound) "AI_SMS_SENT" else "AI_SMS_RECEIVED"

        postNotificationAndSave(
            context = context,
            title = title,
            message = messageText,
            type = type,
            phoneNumber = callerPhone,
            channelId = CHANNEL_ACTIVITY_ID,
            notificationId = (4000 + (System.currentTimeMillis() % 1000)).toInt()
        )
    }

    fun notifyHumanTakeover(context: Context, callerPhone: String) {
        val title = "🛑 AI Paused for $callerPhone"
        val message = "You manually replied to this customer. AI text autopilot is muted for 24 hours."

        postNotificationAndSave(
            context = context,
            title = title,
            message = message,
            type = "HUMAN_TAKEOVER",
            phoneNumber = callerPhone,
            channelId = CHANNEL_ACTIVITY_ID,
            notificationId = (5000 + (System.currentTimeMillis() % 1000)).toInt()
        )
    }

    fun notifyAiSmsIgnored(context: Context, callerPhone: String, reason: String) {
        postNotificationAndSave(
            context = context,
            title = "💬 AI SMS Filtered: $callerPhone",
            message = reason,
            type = "SMS_ACTIVITY",
            phoneNumber = callerPhone,
            channelId = CHANNEL_ACTIVITY_ID,
            notificationId = (4000 + (System.currentTimeMillis() % 1000)).toInt()
        )
    }

    private fun postNotificationAndSave(
        context: Context,
        title: String,
        message: String,
        type: String,
        phoneNumber: String,
        channelId: String,
        notificationId: Int
    ) {
        initChannels(context)

        // 1. Post Android System Notification
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        if (notificationManager != null) {
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("OPEN_NOTIFICATIONS_PANEL", true)
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                notificationId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val builder = NotificationCompat.Builder(context, channelId)
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle(title)
                .setContentText(message)
                .setStyle(NotificationCompat.BigTextStyle().bigText(message))
                .setPriority(
                    if (channelId == CHANNEL_EMERGENCY_ID || channelId == CHANNEL_BOOKINGS_ID)
                        NotificationCompat.PRIORITY_HIGH
                    else
                        NotificationCompat.PRIORITY_DEFAULT
                )
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)

            try {
                notificationManager.notify(notificationId, builder.build())
            } catch (e: Exception) {
                android.util.Log.w("AiNotificationManager", "Failed to post system notification: ${e.message}")
            }
        }

        // 2. Persist to In-App Room Database
        scope.launch {
            try {
                val app = context.applicationContext as? App ?: return@launch
                app.database.appNotificationDao().insertNotification(
                    AppNotificationEvent(
                        title = title,
                        message = message,
                        type = type,
                        phoneNumber = phoneNumber,
                        timestamp = System.currentTimeMillis(),
                        isRead = false
                    )
                )
            } catch (e: Exception) {
                android.util.Log.w("AiNotificationManager", "Failed to insert notification into database: ${e.message}")
            }
        }
    }

    fun clearTakeoverAndResetQueue(context: Context, phoneNumber: String = "ALL", onDone: (() -> Unit)? = null) {
        scope.launch {
            try {
                val app = context.applicationContext as? App ?: return@launch
                val settingsRepo = app.settingsRepository
                val settings = settingsRepo.getSettings()

                // 1. Reset local timestamp so IncomingSmsReceiver ignores earlier sent texts
                settingsRepo.resetAiSmsTakeoverCooldowns()

                // 2. Clear takeover in Cloud Firestore
                val postJson = org.json.JSONObject().apply {
                    put("action", "clear_takeover")
                    put("licenseKey", settings.licenseKey)
                    put("senderPhone", phoneNumber)
                }

                val conn = java.net.URL("https://missedcallautosms.com/api/sms-chat").openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.connectTimeout = 8000
                conn.readTimeout = 8000
                conn.doOutput = true
                conn.outputStream.use { os ->
                    os.write(postJson.toString().toByteArray(Charsets.UTF_8))
                }
                val code = conn.responseCode
                android.util.Log.i("AiNotificationManager", "Cleared takeover in cloud, HTTP $code")
            } catch (e: Exception) {
                android.util.Log.w("AiNotificationManager", "Could not sync cloud takeover reset: ${e.message}")
            } finally {
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                    onDone?.invoke()
                }
            }
        }
    }
}
