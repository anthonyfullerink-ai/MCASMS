package com.missedcall.autotext.util

import android.util.Log

object IntentMapper {
    /**
     * Maps a raw AI intent string to a system Template Category.
     */
    fun mapIntentToCategory(intent: String?): String {
        return when (intent?.uppercase()) {
            "EMERGENCY" -> "EMERGENCY"
            "SERVICE_CALL", "BOOKING", "SCHEDULE" -> "SERVICE_CALL"
            "QUOTE", "PRICING", "ESTIMATE" -> "QUOTE_REQUEST"
            "GENERAL_INFO", "QUESTION" -> "GENERAL_INFO"
            else -> "DEFAULT"
        }
    }
}
