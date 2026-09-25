package com.missedcall.autotext.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface CallLogDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLog(event: CallLogEvent): Long

    @Query("SELECT MAX(timestamp) FROM call_log_events WHERE phone_number = :phoneNumber AND status = 'SENT'")
    suspend fun getLastSentTimestamp(phoneNumber: String): Long?

    @Query("SELECT MAX(timestamp) FROM call_log_events WHERE (phone_number = :phoneNumber OR phone_number LIKE '%' || :last7Digits) AND status = 'SENT'")
    suspend fun getLastSentTimestampFlexible(phoneNumber: String, last7Digits: String): Long?

    @Query("SELECT * FROM call_log_events WHERE (phone_number = :phoneNumber OR phone_number LIKE '%' || :last7Digits) AND status IN ('SENT', 'REMOTE_SENT') AND timestamp > :cutoffTime ORDER BY timestamp DESC")
    suspend fun getRecentAiSentLogs(phoneNumber: String, last7Digits: String, cutoffTime: Long): List<CallLogEvent>

    @Query("SELECT * FROM call_log_events ORDER BY timestamp DESC")
    fun getAllLogsFlow(): Flow<List<CallLogEvent>>

    @Query("DELETE FROM call_log_events")
    suspend fun clearLogs()
}
