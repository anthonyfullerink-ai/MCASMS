package com.missedcall.autotext.data.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

enum class LogStatus {
    SENT,
    SKIPPED_IN_CONTACTS,
    SKIPPED_COOLDOWN,
    SKIPPED_OFF_HOURS,
    SKIPPED_UNLICENSED,
    SKIPPED_CALL_ANSWERED,
    FAILED_SIM_ERROR,
    REMOTE_SENT,
    REMOTE_REJECTED,
    FORWARDED_TO_WEBHOOK
}

@Entity(tableName = "call_log_events")
data class CallLogEvent(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    @ColumnInfo(name = "phone_number")
    val phoneNumber: String,

    @ColumnInfo(name = "timestamp")
    val timestamp: Long = System.currentTimeMillis(),

    @ColumnInfo(name = "status")
    val status: LogStatus,

    @ColumnInfo(name = "failure_reason")
    val failureReason: String? = null,

    @ColumnInfo(name = "message_sent")
    val messageSent: String? = null
)
