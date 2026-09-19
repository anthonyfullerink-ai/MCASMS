package com.missedcall.autotext.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface VoiceCallDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(event: VoiceCallEvent): Long

    @Query("SELECT * FROM voice_call_events ORDER BY timestamp DESC")
    fun getAllVoiceCallsFlow(): Flow<List<VoiceCallEvent>>

    @Query("SELECT * FROM voice_call_events ORDER BY timestamp DESC")
    suspend fun getAllVoiceCallsList(): List<VoiceCallEvent>

    @Query("UPDATE voice_call_events SET is_read = 1 WHERE id = :id")
    suspend fun markAsRead(id: Long)

    @Query("UPDATE voice_call_events SET is_read = 1")
    suspend fun markAllAsRead()

    @Query("DELETE FROM voice_call_events")
    suspend fun clearAll()
}
