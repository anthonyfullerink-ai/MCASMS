package com.missedcall.autotext.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.gson.Gson
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "app_settings")

class SettingsRepository(private val context: Context) {

    private val gson = Gson()

    companion object {
        val MASTER_ENABLED = booleanPreferencesKey("master_enabled")
        val MESSAGE_TEMPLATE = stringPreferencesKey("message_template")
        val BUSINESS_NAME = stringPreferencesKey("business_name")
        val JITTER_DELAY_SECONDS = intPreferencesKey("jitter_delay_seconds")
        val COOLDOWN_HOURS = intPreferencesKey("cooldown_hours")
        val EXCLUDE_SAVED_CONTACTS = booleanPreferencesKey("exclude_saved_contacts")
        val BUSINESS_HOURS_ENABLED = booleanPreferencesKey("business_hours_enabled")
        val SCHEDULE_JSON = stringPreferencesKey("schedule_json")
        val REMOTE_ACCESS_ENABLED = booleanPreferencesKey("remote_access_enabled")
        val REMOTE_ACCESS_PORT = intPreferencesKey("remote_access_port")
        val REMOTE_UPDATE_URL = stringPreferencesKey("remote_update_url")
        val LICENSE_KEY = stringPreferencesKey("license_key")
        val REVOCATION_MANIFEST_URL = stringPreferencesKey("revocation_manifest_url")
        val CUSTOMER_EMAIL = stringPreferencesKey("customer_email")
        val SUBSCRIPTION_STATUS = stringPreferencesKey("subscription_status")
        val WEBHOOK_ENABLED = booleanPreferencesKey("webhook_enabled")
        val WEBHOOK_API_SECRET = stringPreferencesKey("webhook_api_secret")
        val FCM_DEVICE_TOKEN = stringPreferencesKey("fcm_device_token")
        val PREFERRED_SIM_SLOT = intPreferencesKey("preferred_sim_slot")
        /** Stable Android subscriptionId — does not change across reboots like slot index */
        val PREFERRED_SIM_SUBSCRIPTION_ID = intPreferencesKey("preferred_sim_subscription_id")

        val OUTBOUND_WEBHOOK_ENABLED = booleanPreferencesKey("outbound_webhook_enabled")
        val MUTE_NATIVE_AUTO_REPLY = booleanPreferencesKey("mute_native_auto_reply")
        val SELECTED_OUTBOUND_WEBHOOK_URL = stringPreferencesKey("selected_outbound_webhook_url")
        val SAVED_OUTBOUND_WEBHOOKS_JSON = stringPreferencesKey("saved_outbound_webhooks_json")
        val VOICE_RECEPTIONIST_ENABLED = booleanPreferencesKey("voice_receptionist_enabled")
        val VOICE_FORWARDING_NUMBER = stringPreferencesKey("voice_forwarding_number")
        val VOICE_GREETING = stringPreferencesKey("voice_greeting")
        val VOICE_SUBSCRIPTION_ACTIVE = booleanPreferencesKey("voice_subscription_active")
        val VAPI_MODE = stringPreferencesKey("vapi_mode")
        val VAPI_API_KEY = stringPreferencesKey("vapi_api_key")
        val VAPI_ASSISTANT_ID = stringPreferencesKey("vapi_assistant_id")
        val VAPI_PHONE_NUMBER_ID = stringPreferencesKey("vapi_phone_number_id")
        val CONTRACTOR_STATUS = stringPreferencesKey("contractor_status")
        val CONTRACTOR_ACTIVITY = stringPreferencesKey("contractor_activity")
        val CONTRACTOR_GOAL = stringPreferencesKey("contractor_goal")
        val CONTRACTOR_GOAL_LINK = stringPreferencesKey("contractor_goal_link")
    }

    val settingsFlow: Flow<AppSettings> = context.dataStore.data.map { preferences ->
        val scheduleJson = preferences[SCHEDULE_JSON]
        val schedule = if (!scheduleJson.isNullOrEmpty()) {
            try {
                gson.fromJson(scheduleJson, AppSchedule::class.java) ?: AppSchedule()
            } catch (e: Exception) {
                AppSchedule()
            }
        } else {
            AppSchedule()
        }

        val savedWebhooksJson = preferences[SAVED_OUTBOUND_WEBHOOKS_JSON]
        val savedWebhooks = if (!savedWebhooksJson.isNullOrEmpty()) {
            try {
                gson.fromJson(savedWebhooksJson, Array<String>::class.java)?.toList() ?: emptyList()
            } catch (e: Exception) {
                emptyList()
            }
        } else {
            emptyList()
        }

        AppSettings(
            masterEnabled = preferences[MASTER_ENABLED] ?: true,
            messageTemplate = preferences[MESSAGE_TEMPLATE]
                ?: "Hey! Sorry I missed your call. How can I help you today? - {business_name}",
            businessName = preferences[BUSINESS_NAME] ?: "My Business",
            customerEmail = preferences[CUSTOMER_EMAIL] ?: "",
            jitterDelaySeconds = preferences[JITTER_DELAY_SECONDS] ?: 15,
            cooldownHours = preferences[COOLDOWN_HOURS] ?: 4,
            excludeSavedContacts = preferences[EXCLUDE_SAVED_CONTACTS] ?: true,
            businessHoursEnabled = preferences[BUSINESS_HOURS_ENABLED] ?: false,
            schedule = schedule,
            remoteAccessEnabled = preferences[REMOTE_ACCESS_ENABLED] ?: false,
            remoteAccessPort = preferences[REMOTE_ACCESS_PORT] ?: 8080,
            remoteUpdateUrl = preferences[REMOTE_UPDATE_URL] ?: "",
            licenseKey = preferences[LICENSE_KEY] ?: "",
            revocationManifestUrl = preferences[REVOCATION_MANIFEST_URL] ?: "",
            subscriptionStatus = preferences[SUBSCRIPTION_STATUS] ?: "ACTIVE",
            webhookEnabled = preferences[WEBHOOK_ENABLED] ?: true,
            webhookApiSecret = preferences[WEBHOOK_API_SECRET] ?: "",
            fcmDeviceToken = preferences[FCM_DEVICE_TOKEN] ?: "",
            preferredSimSlot = preferences[PREFERRED_SIM_SLOT] ?: 0,
            preferredSimSubscriptionId = preferences[PREFERRED_SIM_SUBSCRIPTION_ID] ?: -1,

            outboundWebhookEnabled = preferences[OUTBOUND_WEBHOOK_ENABLED] ?: false,
            muteNativeAutoReply = preferences[MUTE_NATIVE_AUTO_REPLY] ?: false,
            selectedOutboundWebhookUrl = preferences[SELECTED_OUTBOUND_WEBHOOK_URL] ?: "",
            savedOutboundWebhooks = savedWebhooks,
            voiceReceptionistEnabled = preferences[VOICE_RECEPTIONIST_ENABLED] ?: false,
            voiceReceptionistForwardingNumber = preferences[VOICE_FORWARDING_NUMBER] ?: "+18005550199",
            voiceReceptionistGreeting = preferences[VOICE_GREETING] ?: "",
            voiceSubscriptionActive = preferences[VOICE_SUBSCRIPTION_ACTIVE] ?: false,
            vapiMode = preferences[VAPI_MODE] ?: "MANAGED",
            vapiApiKey = preferences[VAPI_API_KEY] ?: "",
            vapiAssistantId = preferences[VAPI_ASSISTANT_ID] ?: "",
            vapiPhoneNumberId = preferences[VAPI_PHONE_NUMBER_ID] ?: "",
            contractorStatus = preferences[CONTRACTOR_STATUS] ?: "AVAILABLE",
            contractorActivity = preferences[CONTRACTOR_ACTIVITY] ?: "Hands Full",
            contractorGoal = preferences[CONTRACTOR_GOAL] ?: "BOOKING_LINK",
            contractorGoalLink = preferences[CONTRACTOR_GOAL_LINK] ?: ""
        )
    }

    suspend fun getSettings(): AppSettings {
        val settings = settingsFlow.first()
        if (settings.webhookApiSecret.isBlank()) {
            val newSecret = generateRandomSecret()
            context.dataStore.edit { preferences ->
                preferences[WEBHOOK_API_SECRET] = newSecret
            }
            return settings.copy(webhookApiSecret = newSecret)
        }
        return settings
    }

    private fun generateRandomSecret(): String {
        val chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        return (1..16).map { chars.random() }.joinToString("")
    }

    suspend fun setMasterEnabled(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[MASTER_ENABLED] = enabled
        }
    }

    suspend fun saveFcmToken(token: String) {
        context.dataStore.edit { preferences ->
            preferences[FCM_DEVICE_TOKEN] = token
        }
    }

    suspend fun regenerateWebhookSecret(): String {
        val newSecret = generateRandomSecret()
        context.dataStore.edit { preferences ->
            preferences[WEBHOOK_API_SECRET] = newSecret
        }
        return newSecret
    }

    suspend fun updateSettings(settings: AppSettings) {
        context.dataStore.edit { preferences ->
            preferences[MASTER_ENABLED] = settings.masterEnabled
            preferences[MESSAGE_TEMPLATE] = settings.messageTemplate
            preferences[BUSINESS_NAME] = settings.businessName
            preferences[CUSTOMER_EMAIL] = settings.customerEmail
            preferences[JITTER_DELAY_SECONDS] = settings.jitterDelaySeconds
            preferences[COOLDOWN_HOURS] = settings.cooldownHours
            preferences[EXCLUDE_SAVED_CONTACTS] = settings.excludeSavedContacts
            preferences[BUSINESS_HOURS_ENABLED] = settings.businessHoursEnabled
            preferences[SCHEDULE_JSON] = gson.toJson(settings.schedule)
            preferences[REMOTE_ACCESS_ENABLED] = settings.remoteAccessEnabled
            preferences[REMOTE_ACCESS_PORT] = settings.remoteAccessPort
            preferences[REMOTE_UPDATE_URL] = settings.remoteUpdateUrl
            preferences[LICENSE_KEY] = settings.licenseKey
            preferences[REVOCATION_MANIFEST_URL] = settings.revocationManifestUrl
            preferences[SUBSCRIPTION_STATUS] = settings.subscriptionStatus
            preferences[WEBHOOK_ENABLED] = settings.webhookEnabled
            if (settings.webhookApiSecret.isNotBlank()) {
                preferences[WEBHOOK_API_SECRET] = settings.webhookApiSecret
            }
            preferences[FCM_DEVICE_TOKEN] = settings.fcmDeviceToken
            preferences[PREFERRED_SIM_SLOT] = settings.preferredSimSlot
            preferences[PREFERRED_SIM_SUBSCRIPTION_ID] = settings.preferredSimSubscriptionId

            preferences[OUTBOUND_WEBHOOK_ENABLED] = settings.outboundWebhookEnabled
            preferences[MUTE_NATIVE_AUTO_REPLY] = settings.muteNativeAutoReply
            preferences[SELECTED_OUTBOUND_WEBHOOK_URL] = settings.selectedOutboundWebhookUrl
            preferences[SAVED_OUTBOUND_WEBHOOKS_JSON] = gson.toJson(settings.savedOutboundWebhooks)
            preferences[VOICE_RECEPTIONIST_ENABLED] = settings.voiceReceptionistEnabled
            preferences[VOICE_FORWARDING_NUMBER] = settings.voiceReceptionistForwardingNumber
            preferences[VOICE_GREETING] = settings.voiceReceptionistGreeting
            preferences[VOICE_SUBSCRIPTION_ACTIVE] = settings.voiceSubscriptionActive
            preferences[VAPI_MODE] = settings.vapiMode
            preferences[VAPI_API_KEY] = settings.vapiApiKey
            preferences[VAPI_ASSISTANT_ID] = settings.vapiAssistantId
            preferences[VAPI_PHONE_NUMBER_ID] = settings.vapiPhoneNumberId
            preferences[CONTRACTOR_STATUS] = settings.contractorStatus
            preferences[CONTRACTOR_ACTIVITY] = settings.contractorActivity
            preferences[CONTRACTOR_GOAL] = settings.contractorGoal
            preferences[CONTRACTOR_GOAL_LINK] = settings.contractorGoalLink
        }
    }
}
