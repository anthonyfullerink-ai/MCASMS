package com.missedcall.autotext.worker

import android.content.Context
import android.util.Log
import androidx.work.*
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class WebhookWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    companion object {
        private const val TAG = "WebhookWorker"
        private const val KEY_URL = "webhook_url"
        private const val KEY_PAYLOAD = "webhook_payload"
        private const val KEY_SECRET = "webhook_secret"

        fun enqueue(context: Context, url: String, payload: String, secret: String) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val data = Data.Builder()
                .putString(KEY_URL, url)
                .putString(KEY_PAYLOAD, payload)
                .putString(KEY_SECRET, secret)
                .build()

            val request = OneTimeWorkRequestBuilder<WebhookWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS
                )
                .setInputData(data)
                .build()

            WorkManager.getInstance(context).enqueue(request)
            Log.d(TAG, "Enqueued webhook to: $url")
        }

        fun generateSignature(payload: String, secret: String): String {
            if (secret.isBlank()) return ""
            return try {
                val mac = Mac.getInstance("HmacSHA256")
                val secretKey = SecretKeySpec(secret.toByteArray(StandardCharsets.UTF_8), "HmacSHA256")
                mac.init(secretKey)
                val hash = mac.doFinal(payload.toByteArray(StandardCharsets.UTF_8))
                hash.joinToString("") { "%02x".format(it) }
            } catch (e: Exception) {
                ""
            }
        }
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val urlString = inputData.getString(KEY_URL) ?: return@withContext Result.failure()
        val payload = inputData.getString(KEY_PAYLOAD) ?: return@withContext Result.failure()
        val secret = inputData.getString(KEY_SECRET) ?: ""

        val attempt = runAttemptCount
        Log.i(TAG, "Attempting webhook delivery (Attempt #$attempt) to: $urlString")

        try {
            val url = URL(urlString)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            
            val signature = generateSignature(payload, secret)
            if (signature.isNotEmpty()) {
                conn.setRequestProperty("X-Signature", signature)
            }

            conn.connectTimeout = 15000
            conn.readTimeout = 15000

            conn.outputStream.use { it.write(payload.toByteArray(StandardCharsets.UTF_8)) }

            val code = conn.responseCode
            if (code in 200..299) {
                Log.i(TAG, "Webhook delivered successfully! Status: $code")
                Result.success()
            } else {
                Log.w(TAG, "Webhook failed with status: $code. Retrying...")
                Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Webhook exception: ${e.localizedMessage}. Retrying...", e)
            Result.retry()
        }
    }
}
