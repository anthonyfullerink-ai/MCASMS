package com.missedcall.autotext.data.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "voice_call_events")
data class VoiceCallEvent(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    @ColumnInfo(name = "phone_number")
    val phoneNumber: String,

    @ColumnInfo(name = "caller_name")
    val callerName: String? = null,

    @ColumnInfo(name = "timestamp")
    val timestamp: Long = System.currentTimeMillis(),

    @ColumnInfo(name = "duration_seconds")
    val durationSeconds: Int = 0,

    @ColumnInfo(name = "intent")
    val intent: String = "SERVICE_CALL", // "SERVICE_CALL", "QUOTE_REQUEST", "EMERGENCY", "GENERAL_INFO"

    @ColumnInfo(name = "summary")
    val summary: String = "",

    @ColumnInfo(name = "transcript")
    val transcript: String = "",

    @ColumnInfo(name = "recording_url")
    val recordingUrl: String? = null,

    @ColumnInfo(name = "follow_up_sms")
    val followUpSms: String? = null,

    @ColumnInfo(name = "contractor_status")
    val contractorStatus: String = "AVAILABLE", // "AVAILABLE", "AFTER_HOURS", "EMERGENCY"

    @ColumnInfo(name = "is_read")
    val isRead: Boolean = false
)
