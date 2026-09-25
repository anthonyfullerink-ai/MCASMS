package com.missedcall.autotext.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "app_notifications")
data class AppNotificationEvent(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val title: String,
    val message: String,
    val type: String, // "VOICE_CALL_STARTED", "VOICE_CALL_COMPLETED", "APPOINTMENT_BOOKED", "AI_SMS_SENT", "AI_SMS_RECEIVED", "EMERGENCY_ALERT", "HUMAN_TAKEOVER"
    val phoneNumber: String = "",
    val timestamp: Long = System.currentTimeMillis(),
    val isRead: Boolean = false,
    val metadataJson: String = ""
)
