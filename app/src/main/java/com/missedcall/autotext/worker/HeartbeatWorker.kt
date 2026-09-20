package com.missedcall.autotext.worker

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.telephony.SubscriptionManager
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.gson.Gson
import com.missedcall.autotext.App
import com.missedcall.autotext.data.license.LicenseManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

class HeartbeatWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    companion object {
        const val TAG = "HeartbeatWorker"
    }

    override suspend fun doWork(): Result {
        Log.d(TAG, "Starting heartbeat pulse...")

        val app = applicationContext as App
        val settings = app.settingsRepository.getSettings()

        // We need a target URL for the heartbeat.
        // In a real scenario, this might be a dedicated HEARTBEAT_URL in settings.
        // For now, we'll use the selectedOutboundWebhookUrl as the base or a hardcoded system URL.
        val heartbeatUrl = "https://your-api-domain.com/api/devices/heartbeat"

        val deviceId = LicenseManager.getDeviceId(applicationContext)
        val secretKey = settings.licenseKey // Using license key as secretKey for simplicity

        val batteryLevel = getBatteryLevel()
        val simStatus = getSimStatus()

        val result = sendHeartbeat(
            url = heartbeatUrl,
            deviceId = deviceId,
            secretKey = secretKey,
            batteryLevel = batteryLevel,
            simStatus = simStatus,
            appVersion = "1.5.0"
        )

        return if (result) {
            Log.i(TAG, "Heartbeat pulse successful for $deviceId")
            Result.success()
        } else {
            Log.w(TAG, "Heartbeat pulse failed for $deviceId")
            Result.retry()
        }
    }

    private suspend fun sendHeartbeat(
        url: String,
        deviceId: String,
        secretKey: String,
        batteryLevel: Int,
        simStatus: String,
        appVersion: String
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json; utf-8")
            connection.setRequestProperty("Accept", "application/json")
            connection.doOutput = true
            connection.connectTimeout = 10000
            connection.readTimeout = 10000

            val payload = mapOf(
                "deviceId" to deviceId,
                "secretKey" to secretKey,
                "metrics" to mapOf(
                    "batteryLevel" to batteryLevel,
                    "simStatus" to simStatus,
                    "appVersion" to appVersion
                )
            )

            val jsonBody = Gson().toJson(payload)
            connection.outputStream.use { os ->
                os.write(jsonBody.toByteArray(StandardCharsets.UTF_8))
            }

            val responseCode = connection.responseCode
            connection.disconnect()

            responseCode in 200..299
        } catch (e: Exception) {
            Log.e(TAG, "Error sending heartbeat pulse", e)
            false
        }
    }

    private fun getBatteryLevel(): Int {
        return try {
            val bm = applicationContext.getSystemService(android.content.Context.BATTERY_SERVICE) as BatteryManager
            bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        } catch (e: Exception) {
            -1
        }
    }

    private fun getSimStatus(): String {
        return try {
            val sm = applicationContext.getSystemService(android.telephony.SubscriptionManager::class.java)
            val activeSubs = sm?.activeSubscriptionInfoList
            if (activeSubs.isNullOrEmpty()) "no_sim" else "active"
        } catch (e: Exception) {
            "error"
        }
    }
}
