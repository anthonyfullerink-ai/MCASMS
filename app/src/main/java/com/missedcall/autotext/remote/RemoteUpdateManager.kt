package com.missedcall.autotext.remote

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.core.content.FileProvider
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

data class UpdateInfo(
    val versionCode: Int,
    val versionName: String,
    @SerializedName("downloadUrl", alternate = ["apkUrl"])
    val apkUrl: String,
    val releaseNotes: String? = null,
    val mandatory: Boolean = false
)

class RemoteUpdateManager(private val context: Context) {

    companion object {
        private const val TAG = "RemoteUpdateManager"
        const val DEFAULT_UPDATE_URL = "https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/version.json"

        val CANDIDATE_URLS = listOf(
            "https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/version.json",
            "https://missedcallautosms.com/version.json",
            "https://missedcallautosms.com/api/version.json",
            "http://10.0.2.2:8000/api/version.json",
            "http://localhost:8000/api/version.json"
        )
    }

    private val gson = Gson()

    suspend fun checkForUpdates(manifestUrl: String = DEFAULT_UPDATE_URL, forceCheck: Boolean = false): UpdateInfo? = withContext(Dispatchers.IO) {
        val targets = mutableListOf<String>()
        if (manifestUrl.isNotBlank() && !manifestUrl.contains("localhost")) {
            targets.add(manifestUrl)
        }
        CANDIDATE_URLS.forEach { if (!targets.contains(it)) targets.add(it) }

        val currentVersionCode = try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionCode
        } catch (e: Exception) {
            1
        }

        for (targetUrl in targets) {
            try {
                Log.d(TAG, "Checking updates from: $targetUrl")
                val connection = openConnectionWithRedirects(targetUrl).apply {
                    requestMethod = "GET"
                    connectTimeout = 7000
                    readTimeout = 7000
                    setRequestProperty("Cache-Control", "no-cache")
                    setRequestProperty("User-Agent", "MissedCallAutoText-Android")
                }

                if (connection.responseCode in 200..299) {
                    val json = connection.inputStream.bufferedReader().use { it.readText() }
                    val updateInfo = gson.fromJson(json, UpdateInfo::class.java)

                    if (updateInfo != null && updateInfo.versionCode > 0) {
                        Log.i(TAG, "Successfully retrieved update manifest from $targetUrl: remote v${updateInfo.versionCode} vs current v$currentVersionCode")
                        if (updateInfo.versionCode > currentVersionCode || forceCheck) {
                            return@withContext updateInfo
                        } else {
                            // Successfully checked, no newer version
                            return@withContext null
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed check from $targetUrl: ${e.message}")
            }
        }
        null
    }

    suspend fun downloadAndInstallApk(apkUrl: String, onProgress: (Int) -> Unit = {}): Boolean = withContext(Dispatchers.IO) {
        return@withContext try {
            Log.i(TAG, "Downloading APK update from: $apkUrl")
            val connection = openConnectionWithRedirects(apkUrl).apply {
                connectTimeout = 20000
                readTimeout = 30000
                setRequestProperty("User-Agent", "MissedCallAutoText-Android")
            }

            val fileLength = connection.contentLength
            val apkFile = File(context.cacheDir, "update.apk")
            if (apkFile.exists()) apkFile.delete()

            connection.inputStream.use { input ->
                FileOutputStream(apkFile).use { output ->
                    val data = ByteArray(16384)
                    var total: Long = 0
                    var count: Int
                    while (input.read(data).also { count = it } != -1) {
                        total += count
                        if (fileLength > 0) {
                            onProgress((total * 100 / fileLength).toInt())
                        }
                        output.write(data, 0, count)
                    }
                }
            }

            Log.i(TAG, "APK downloaded successfully (${apkFile.length()} bytes). Launching package installer...")
            installApk(apkFile)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error downloading APK update from $apkUrl", e)
            false
        }
    }

    private fun openConnectionWithRedirects(initialUrl: String): HttpURLConnection {
        var currentUrl = initialUrl
        var redirects = 0
        while (redirects < 5) {
            val url = URL(currentUrl)
            val connection = url.openConnection() as HttpURLConnection
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 12000
            connection.readTimeout = 15000
            connection.setRequestProperty("User-Agent", "MissedCallAutoText-Android")
            connection.connect()

            val status = connection.responseCode
            if (status in listOf(301, 302, 303, 307, 308)) {
                val newUrl = connection.getHeaderField("Location")
                if (!newUrl.isNullOrBlank()) {
                    currentUrl = if (newUrl.startsWith("http")) newUrl else URL(URL(currentUrl), newUrl).toString()
                    redirects++
                    continue
                }
            }
            return connection
        }
        return URL(currentUrl).openConnection() as HttpURLConnection
    }

    private fun installApk(apkFile: File) {
        val authority = "${context.packageName}.fileprovider"
        val apkUri: Uri = FileProvider.getUriForFile(context, authority, apkFile)

        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(apkUri, "application/vnd.android.package-archive")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
        }

        context.startActivity(intent)
    }
}
