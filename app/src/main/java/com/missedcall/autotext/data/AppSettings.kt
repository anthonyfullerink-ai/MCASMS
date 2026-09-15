package com.missedcall.autotext.data

data class AppSchedule(
    val startTime: String = "09:00",
    val endTime: String = "18:00",
    val activeDays: List<String> = listOf("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY")
)

data class AppSettings(
    val masterEnabled: Boolean = true,
    val messageTemplate: String = "Hey! Sorry I missed your call. How can I help you today? - {business_name}",
    val businessName: String = "My Business",
    val customerEmail: String = "",
    val averageJobValue: Double = 450.0,
    val jitterDelaySeconds: Int = 15,
    val cooldownHours: Int = 4,
    val excludeSavedContacts: Boolean = true,
    val businessHoursEnabled: Boolean = false,
    val schedule: AppSchedule = AppSchedule(),
    val remoteAccessEnabled: Boolean = false,
    val remoteAccessPort: Int = 8080,
    val remoteUpdateUrl: String = "http://localhost:8000/api/version.json",
    val licenseKey: String = "",
    val revocationManifestUrl: String = "",
    val subscriptionStatus: String = "ACTIVE"
)
