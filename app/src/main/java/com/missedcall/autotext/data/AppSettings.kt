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
    val remoteUpdateUrl: String = "https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/version.json",
    val licenseKey: String = "",
    val revocationManifestUrl: String = "",
    val subscriptionStatus: String = "ACTIVE",
    val webhookEnabled: Boolean = true,
    val webhookApiSecret: String = "",
    val fcmDeviceToken: String = "",
    val preferredSimSlot: Int = 0,
    /** Cached Android SubscriptionManager subscriptionId for the preferred SIM slot.
     *  -1 = not set / use default. Stable across reboots unlike simSlotIndex. */
    val preferredSimSubscriptionId: Int = -1,
    val outboundWebhookEnabled: Boolean = false,
    val muteNativeAutoReply: Boolean = false,
    val selectedOutboundWebhookUrl: String = "",
    val savedOutboundWebhooks: List<String> = emptyList(),
    val webhookSubMissedCall: Boolean = true,
    val webhookSubSmsSent: Boolean = true,
    val webhookSubSmsReceived: Boolean = true,
    val webhookSubCallCompleted: Boolean = true,
    val webhookSubVoicemail: Boolean = true,
    val voiceReceptionistEnabled: Boolean = false,
    val voiceReceptionistForwardingNumber: String = "+1 (732) 660-9121",
    val voiceReceptionistGreeting: String = "",
    val voiceSubscriptionActive: Boolean = false,
    val vapiMode: String = "MANAGED", // "MANAGED", "BYOK", "OFF"
    val vapiApiKey: String = "",
    val vapiAssistantId: String = "",
    val vapiPhoneNumberId: String = "",
    val contractorStatus: String = "AVAILABLE", // "AVAILABLE", "AFTER_HOURS", "EMERGENCY"
    val contractorActivity: String = "Hands Full", // "cutting hair", "on a job", "in a meeting", etc.
    val contractorGoal: String = "BOOKING_LINK", // "BOOKING_LINK", "CALLBACK_PROMISE", "QUOTE_FORM"
    val contractorGoalLink: String = "",
    val postCallSmsEnabled: Boolean = true,
    val postCallSmsTemplate: String = "Hey {NAME}, this is {BUSINESS_NAME}. My AI assistant let me know about {SUMMARY}. I am wrapping up on a job and will reach out to you shortly!",
    val postCallEmergencyOnly: Boolean = false,
    val voiceAgentName: String = "Riley",
    val voiceIndustryTrade: String = "Home Services & Trades",
    val voiceEmergencyKeywords: String = "leak, flooding, no heat, sparking, gas smell, pipe burst",
    val voiceAfterHoursMode: String = "EMERGENCY_ONLY", // "24_7_SAME", "EMERGENCY_ONLY", "MESSAGE_ONLY"
    val voiceWizardCompleted: Boolean = false,
    val vapiPrompt: String = "",
    val vapiTemperature: Float = 0.3f,
    val vapiModel: String = "gpt-4o-mini",
    val vapiVoiceId: String = "21m00Tcm4TlvDq8ikWAM",
    val vapiVoiceProvider: String = "11labs",
    val dashboardCardOrder: String = "HERO,SMS_METRICS,VOICE_METRICS,COST_QUOTA,REVENUE,FOLLOW_UPS,HARDWARE",
    val dashboardHiddenCards: String = "",
    val permissionsOnboardingCompleted: Boolean = false,
    val aiSmsMasterEnabled: Boolean = true,
    val aiSmsVoicePostCallEnabled: Boolean = true,
    val aiSmsInboundAgentEnabled: Boolean = true,
    val aiSmsScope: String = "STRICT", // "STRICT", "ALL_UNKNOWN", "OFF"
    val aiSmsBusinessServiceType: String = "MOBILE", // "MOBILE", "IN_SHOP"
    val aiSmsShopAddress: String = "",
    val aiSmsShopInstructions: String = "",
    val aiSmsCalendarConnected: Boolean = false,
    val aiSmsCalendarEmail: String = "",
    val aiSmsCalendarWorkingHours: String = "08:00 - 17:00",
    val aiSmsSlotDurationMinutes: Int = 60,
    val aiSmsTravelBufferMinutes: Int = 30,
    val aiSmsAutoPauseOnHumanReply: Boolean = true,
    val aiSmsMaxRepliesPerContact: Int = 5,
    val aiSmsEmergencyAlertsEnabled: Boolean = true,
    val aiSmsTakeoverResetTimestamp: Long = 0L
)



