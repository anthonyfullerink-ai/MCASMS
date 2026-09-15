package com.missedcall.autotext.util

import android.content.Context
import android.net.Uri
import android.provider.ContactsContract
import android.util.Log

object ContactUtils {

    private const val TAG = "ContactUtils"

    fun getContactName(context: Context, phoneNumber: String): String? {
        if (phoneNumber.isBlank()) return null

        return try {
            val uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(phoneNumber)
            )
            val projection = arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME)

            context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIndex = cursor.getColumnIndex(ContactsContract.PhoneLookup.DISPLAY_NAME)
                    if (nameIndex != -1) {
                        return cursor.getString(nameIndex)
                    }
                }
            }
            null
        } catch (e: SecurityException) {
            Log.e(TAG, "Missing READ_CONTACTS permission", e)
            null
        } catch (e: Exception) {
            Log.e(TAG, "Error looking up contact", e)
            null
        }
    }

    fun isContactSaved(context: Context, phoneNumber: String): Boolean {
        return getContactName(context, phoneNumber) != null
    }
}
