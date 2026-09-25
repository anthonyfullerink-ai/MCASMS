package com.missedcall.autotext.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverter
import androidx.room.TypeConverters

class LogStatusConverter {
    @TypeConverter
    fun fromStatus(status: LogStatus): String = status.name

    @TypeConverter
    fun toStatus(value: String): LogStatus = try {
        LogStatus.valueOf(value)
    } catch (e: Exception) {
        LogStatus.FAILED_SIM_ERROR
    }
}

@Database(entities = [CallLogEvent::class, VoiceCallEvent::class, AppNotificationEvent::class], version = 3, exportSchema = false)
@TypeConverters(LogStatusConverter::class)
abstract class AppDatabase : RoomDatabase() {

    abstract fun callLogDao(): CallLogDao
    abstract fun voiceCallDao(): VoiceCallDao
    abstract fun appNotificationDao(): AppNotificationDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "missed_call_autotext_db"
                ).fallbackToDestructiveMigration().build()
                INSTANCE = instance
                instance
            }
        }
    }
}
