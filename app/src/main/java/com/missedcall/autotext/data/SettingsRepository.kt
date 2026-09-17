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
            preferredSimSlot = preferences[PREFERRED_SIM_SLOT] ?: 0
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
        }
    }
}
