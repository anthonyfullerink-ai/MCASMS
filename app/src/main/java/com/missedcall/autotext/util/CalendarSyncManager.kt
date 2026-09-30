package com.missedcall.autotext.util

import android.Manifest
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.provider.CalendarContract
import android.util.Log
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.*

data class DeviceCalendarInfo(
    val id: Long,
    val accountName: String,
    val accountType: String,
    val displayName: String,
    val ownerAccount: String,
    val color: Int,
    val isPrimary: Boolean,
    val canModify: Boolean
)

data class GoogleCalendarAccount(
    val accountName: String,
    val accountType: String,
    val isGoogle: Boolean,
    val calendars: List<DeviceCalendarInfo>
)

object CalendarSyncManager {
    private const val TAG = "CalendarSyncManager"

    fun hasCalendarPermissions(context: Context): Boolean {
        val readGranted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.READ_CALENDAR
        ) == PackageManager.PERMISSION_GRANTED
        val writeGranted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.WRITE_CALENDAR
        ) == PackageManager.PERMISSION_GRANTED
        return readGranted && writeGranted
    }

    /**
     * Retrieves all available calendars grouped by authenticated account (Google and device accounts).
     */
    fun getAccountsWithCalendars(context: Context): List<GoogleCalendarAccount> {
        if (!hasCalendarPermissions(context)) {
            Log.w(TAG, "Calendar read/write permissions not granted.")
            return emptyList()
        }

        val calendars = mutableListOf<DeviceCalendarInfo>()
        val projection = arrayOf(
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.ACCOUNT_NAME,
            CalendarContract.Calendars.ACCOUNT_TYPE,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.OWNER_ACCOUNT,
            CalendarContract.Calendars.CALENDAR_COLOR,
            CalendarContract.Calendars.IS_PRIMARY,
            CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL
        )

        var cursor: Cursor? = null
        try {
            cursor = context.contentResolver.query(
                CalendarContract.Calendars.CONTENT_URI,
                projection,
                null,
                null,
                "${CalendarContract.Calendars.ACCOUNT_NAME} ASC, ${CalendarContract.Calendars.IS_PRIMARY} DESC, ${CalendarContract.Calendars.CALENDAR_DISPLAY_NAME} ASC"
            )

            cursor?.let { c ->
                val idIdx = c.getColumnIndexOrThrow(CalendarContract.Calendars._ID)
                val accNameIdx = c.getColumnIndexOrThrow(CalendarContract.Calendars.ACCOUNT_NAME)
                val accTypeIdx = c.getColumnIndexOrThrow(CalendarContract.Calendars.ACCOUNT_TYPE)
                val dispNameIdx = c.getColumnIndexOrThrow(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME)
                val ownerIdx = c.getColumnIndexOrThrow(CalendarContract.Calendars.OWNER_ACCOUNT)
                val colorIdx = c.getColumnIndexOrThrow(CalendarContract.Calendars.CALENDAR_COLOR)
                val primaryIdx = c.getColumnIndexOrThrow(CalendarContract.Calendars.IS_PRIMARY)
                val accessIdx = c.getColumnIndexOrThrow(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL)

                while (c.moveToNext()) {
                    val id = c.getLong(idIdx)
                    val accName = c.getString(accNameIdx) ?: "Default Account"
                    val accType = c.getString(accTypeIdx) ?: ""
                    val dispName = c.getString(dispNameIdx) ?: accName
                    val owner = c.getString(ownerIdx) ?: accName
                    val color = c.getInt(colorIdx)
                    val isPrimary = c.getInt(primaryIdx) == 1
                    val accessLevel = c.getInt(accessIdx)
                    val canModify = accessLevel >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR

                    calendars.add(
                        DeviceCalendarInfo(
                            id = id,
                            accountName = accName,
                            accountType = accType,
                            displayName = dispName,
                            ownerAccount = owner,
                            color = color,
                            isPrimary = isPrimary,
                            canModify = canModify
                        )
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error querying system calendar content provider", e)
        } finally {
            cursor?.close()
        }

        // Group by accountName
        return calendars.groupBy { it.accountName }.map { (accName, list) ->
            val first = list.first()
            val isGoogle = first.accountType.equals("com.google", ignoreCase = true) ||
                    accName.contains("@gmail.com", ignoreCase = true) ||
                    accName.contains("@google.com", ignoreCase = true)
            GoogleCalendarAccount(
                accountName = accName,
                accountType = first.accountType,
                isGoogle = isGoogle,
                calendars = list
            )
        }.sortedWith(compareByDescending<GoogleCalendarAccount> { it.isGoogle }.thenBy { it.accountName })
    }

    /**
     * Checks if a specified time slot is free on the chosen calendar.
     */
    fun checkSlotAvailability(context: Context, calendarId: Long, startMs: Long, endMs: Long): Boolean {
        if (!hasCalendarPermissions(context) || calendarId <= 0) return true

        val builder = CalendarContract.Instances.CONTENT_URI.buildUpon()
        ContentUris.appendId(builder, startMs)
        ContentUris.appendId(builder, endMs)

        val projection = arrayOf(CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.TITLE)
        val selection = "${CalendarContract.Instances.CALENDAR_ID} = ? AND ${CalendarContract.Instances.STATUS} != ?"
        val selectionArgs = arrayOf(calendarId.toString(), CalendarContract.Instances.STATUS_CANCELED.toString())

        var cursor: Cursor? = null
        return try {
            cursor = context.contentResolver.query(
                builder.build(),
                projection,
                selection,
                selectionArgs,
                null
            )
            val count = cursor?.count ?: 0
            count == 0
        } catch (e: Exception) {
            Log.w(TAG, "Error checking slot availability, defaulting to available: ${e.message}")
            true
        } finally {
            cursor?.close()
        }
    }

    /**
     * Inserts an appointment event directly into the selected Google Calendar.
     * Android automatically syncs this event upstream to Google Calendar cloud and all devices.
     */
    fun insertAppointmentEvent(
        context: Context,
        calendarId: Long,
        title: String,
        description: String,
        startMs: Long,
        endMs: Long,
        location: String = ""
    ): Long? {
        if (!hasCalendarPermissions(context)) {
            Log.e(TAG, "Cannot insert event: calendar write permission missing.")
            return null
        }

        try {
            val tz = TimeZone.getDefault().id
            val values = ContentValues().apply {
                put(CalendarContract.Events.CALENDAR_ID, calendarId)
                put(CalendarContract.Events.TITLE, title)
                put(CalendarContract.Events.DESCRIPTION, description)
                put(CalendarContract.Events.DTSTART, startMs)
                put(CalendarContract.Events.DTEND, endMs)
                put(CalendarContract.Events.EVENT_TIMEZONE, tz)
                put(CalendarContract.Events.EVENT_LOCATION, location)
                put(CalendarContract.Events.STATUS, CalendarContract.Events.STATUS_CONFIRMED)
                put(CalendarContract.Events.HAS_ALARM, 1)
            }

            val uri: Uri? = context.contentResolver.insert(CalendarContract.Events.CONTENT_URI, values)
            val eventId = uri?.lastPathSegment?.toLongOrNull()

            if (eventId != null) {
                Log.i(TAG, "✅ Successfully inserted appointment into calendar $calendarId (Event ID: $eventId)")
                // Add 30-minute reminder
                try {
                    val reminderValues = ContentValues().apply {
                        put(CalendarContract.Reminders.EVENT_ID, eventId)
                        put(CalendarContract.Reminders.MINUTES, 30)
                        put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT)
                    }
                    context.contentResolver.insert(CalendarContract.Reminders.CONTENT_URI, reminderValues)
                } catch (remErr: Exception) {
                    Log.w(TAG, "Notice adding reminder alarm: ${remErr.message}")
                }
                return eventId
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to insert appointment into Google Calendar", e)
        }
        return null
    }

    /**
     * Creates a quick test event 1 hour from now to verify sync and connectivity.
     */
    fun insertTestEvent(context: Context, calendarId: Long, calendarTitle: String): Boolean {
        val startMs = System.currentTimeMillis() + (60 * 60 * 1000)
        val endMs = startMs + (30 * 60 * 1000)
        val title = "⚡ Test Sync: ${AppBranding.appName}"
        val desc = "This is a test appointment created to verify live Google Calendar synchronization with $calendarTitle."
        return insertAppointmentEvent(context, calendarId, title, desc, startMs, endMs, "Your Office / Mobile") != null
    }
}
