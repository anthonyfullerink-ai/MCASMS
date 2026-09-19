package com.missedcall.autotext.util

import com.missedcall.autotext.data.AppSchedule
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeFormatterBuilder
import java.time.temporal.ChronoField
import java.util.Locale

data class ScheduleCheckResult(
    val isWithinHours: Boolean,
    val currentDay: String,
    val isDayActive: Boolean,
    val formattedCurrentTime: String,
    val reason: String
)

object ScheduleUtils {

    private val timeFormatters = listOf(
        DateTimeFormatter.ofPattern("HH:mm", Locale.US),
        DateTimeFormatter.ofPattern("H:mm", Locale.US),
        DateTimeFormatter.ofPattern("h:mm a", Locale.US),
        DateTimeFormatter.ofPattern("hh:mm a", Locale.US),
        DateTimeFormatter.ofPattern("h:mma", Locale.US),
        DateTimeFormatter.ofPattern("hh:mma", Locale.US),
        DateTimeFormatter.ofPattern("HH:mm:ss", Locale.US)
    )

    fun parseTimeFlexible(timeStr: String, defaultHour: Int, defaultMinute: Int): LocalTime {
        val trimmed = timeStr.trim()
        for (formatter in timeFormatters) {
            try {
                return LocalTime.parse(trimmed, formatter)
            } catch (e: Exception) {
                // try next format
            }
        }
        // Fallback: try splitting by colon
        try {
            val parts = trimmed.split(":")
            if (parts.size >= 2) {
                val hour = parts[0].filter { it.isDigit() }.toIntOrNull() ?: defaultHour
                val minute = parts[1].filter { it.isDigit() }.take(2).toIntOrNull() ?: defaultMinute
                val isPm = trimmed.uppercase().contains("PM")
                val finalHour = if (isPm && hour < 12) hour + 12 else if (!isPm && trimmed.uppercase().contains("AM") && hour == 12) 0 else hour
                return LocalTime.of(finalHour.coerceIn(0, 23), minute.coerceIn(0, 59))
            }
        } catch (e: Exception) {
            // Ignore
        }
        return LocalTime.of(defaultHour, defaultMinute)
    }

    fun checkScheduleDetailed(schedule: AppSchedule): ScheduleCheckResult {
        try {
            val now = LocalTime.now()
            val today = LocalDate.now().dayOfWeek.name.uppercase() // e.g. "SATURDAY"
            val isDayActive = schedule.activeDays.map { it.uppercase() }.contains(today)
            val currentTimeStr = now.format(DateTimeFormatter.ofPattern("h:mm a", Locale.US))

            if (!isDayActive) {
                return ScheduleCheckResult(
                    isWithinHours = false,
                    currentDay = today,
                    isDayActive = false,
                    formattedCurrentTime = currentTimeStr,
                    reason = "$today is not an active business day"
                )
            }

            val startTime = parseTimeFlexible(schedule.startTime, 9, 0)
            val endTime = parseTimeFlexible(schedule.endTime, 18, 0)

            val withinTime = if (endTime.isAfter(startTime)) {
                !now.isBefore(startTime) && !now.isAfter(endTime)
            } else {
                // Overnight window (e.g., 22:00 to 06:00)
                !now.isBefore(startTime) || !now.isAfter(endTime)
            }

            val reason = if (withinTime) {
                "Within business hours (${schedule.startTime} - ${schedule.endTime})"
            } else {
                "Outside business hours (${schedule.startTime} - ${schedule.endTime})"
            }

            return ScheduleCheckResult(
                isWithinHours = withinTime,
                currentDay = today,
                isDayActive = true,
                formattedCurrentTime = currentTimeStr,
                reason = reason
            )
        } catch (e: Exception) {
            return ScheduleCheckResult(
                isWithinHours = true,
                currentDay = "UNKNOWN",
                isDayActive = true,
                formattedCurrentTime = "",
                reason = "Schedule check fallback: ${e.message}"
            )
        }
    }

    fun isWithinBusinessHours(schedule: AppSchedule): Boolean {
        return checkScheduleDetailed(schedule).isWithinHours
    }
}
