package com.missedcall.autotext.util

import com.missedcall.autotext.data.AppSchedule
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter

object ScheduleUtils {

    fun isWithinBusinessHours(schedule: AppSchedule): Boolean {
        try {
            val today = LocalDate.now().dayOfWeek.name // e.g. "MONDAY"
            if (!schedule.activeDays.contains(today.uppercase())) {
                return false
            }

            val formatter = DateTimeFormatter.ofPattern("HH:mm")
            val startTime = LocalTime.parse(schedule.startTime, formatter)
            val endTime = LocalTime.parse(schedule.endTime, formatter)
            val now = LocalTime.now()

            return if (endTime.isAfter(startTime)) {
                !now.isBefore(startTime) && !now.isAfter(endTime)
            } else {
                // Overnight window (e.g., 22:00 to 06:00)
                !now.isBefore(startTime) || !now.isAfter(endTime)
            }
        } catch (e: Exception) {
            return true // Fallback to allowed if parsing fails
        }
    }
}
