package com.missedcall.autotext.data.license

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

data class DeveloperLicenseRecord(
    val id: String = java.util.UUID.randomUUID().toString(),
    val customerName: String,
    val licenseKey: String,
    val dateIssued: Long = System.currentTimeMillis(),
    val isRevoked: Boolean = false,
    val priceText: String = if (licenseKey.contains("PRO")) "$299.00 Pro Gateway" else "$49.99 Lifetime"
)

private val Context.devDataStore: DataStore<Preferences> by preferencesDataStore(name = "developer_license_registry")

class DeveloperLicenseRegistry(private val context: Context) {

    private val gson = Gson()

    companion object {
        val RECORDS_JSON = stringPreferencesKey("developer_license_records_json")
    }

    val recordsFlow: Flow<List<DeveloperLicenseRecord>> = context.devDataStore.data.map { preferences ->
        val json = preferences[RECORDS_JSON]
        if (!json.isNullOrEmpty()) {
            try {
                val type = object : TypeToken<List<DeveloperLicenseRecord>>() {}.type
                gson.fromJson<List<DeveloperLicenseRecord>>(json, type) ?: emptyList()
            } catch (e: Exception) {
                emptyList()
            }
        } else {
            emptyList()
        }
    }

    suspend fun getRecords(): List<DeveloperLicenseRecord> {
        return recordsFlow.first()
    }

    suspend fun addRecord(customerName: String, licenseKey: String): DeveloperLicenseRecord {
        val newRecord = DeveloperLicenseRecord(
            customerName = customerName,
            licenseKey = licenseKey
        )
        val currentList = getRecords().toMutableList()
        currentList.add(0, newRecord)
        saveRecords(currentList)
        return newRecord
    }

    suspend fun toggleRevokeRecord(licenseKey: String) {
        val currentList = getRecords().map { record ->
            if (record.licenseKey.equals(licenseKey, ignoreCase = true)) {
                record.copy(isRevoked = !record.isRevoked)
            } else {
                record
            }
        }
        saveRecords(currentList)
    }

    private suspend fun saveRecords(records: List<DeveloperLicenseRecord>) {
        context.devDataStore.edit { preferences ->
            preferences[RECORDS_JSON] = gson.toJson(records)
        }
    }
}
