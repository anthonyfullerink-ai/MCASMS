package com.missedcall.autotext.remote

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.util.Log
import android.widget.Toast
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
    val proDownloadUrl: String? = null,
    val releaseNotes: String? = null,
    val mandatory: Boolean = false,
    val minSupportedVersion: Int = 1
)

sealed class UpdateCheckResult {
    data class Available(val updateInfo: UpdateInfo, val sourceUrl: String) : UpdateCheckResult()
    data class UpToDate(val currentVersionCode: Int, val currentVersionName: String, val remoteVersionCode: Int, val sourceUrl: String) : UpdateCheckResult()
    data class Error(val message: String, val attemptedUrls: List<String>) : UpdateCheckResult()
}

class RemoteUpdateManager(private val context: Context) {

    companion object {
        private const val TAG = "RemoteUpdateManager"
        const val DEFAULT_UPDATE_URL = "https://missedcallautosms.com/version.json"

        val CANDIDATE_URLS = listOf(
            "https://missedcallautosms.com/version.json",
            "https://missedcallautosms.com/api/version.json",
            "https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/version.json",
            "https://cdn.jsdelivr.net/gh/anthonyfullerink-ai/MCASMS@main/version.json",
            "http://10.0.0.65:8000/api/version.json",
            "http://10.0.0.65:8000/version.json",
            "http://10.0.2.2:8000/api/version.json"
        )
    }

    private val gson = Gson()

    suspend fun checkForUpdatesDetailed(manifestUrl: String = DEFAULT_UPDATE_URL, forceCheck: Boolean = false): UpdateCheckResult = withContext(Dispatchers.IO) {
        // Prioritize production domain endpoints first for instant real-time version updates
        val targets = mutableListOf<String>()
        targets.add("https://missedcallautosms.com/version.json")
        targets.add("https://missedcallautosms.com/api/version.json")
        targets.add("https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/version.json")
        targets.add("https://cdn.jsdelivr.net/gh/anthonyfullerink-ai/MCASMS@main/version.json")

        // If a custom HTTPS manifest was provided and isn't already present, prioritize it
        if (manifestUrl.isNotBlank() && manifestUrl.startsWith("https://") && !targets.contains(manifestUrl)) {
            targets.add(0, manifestUrl)
        }

        // Add remaining candidate URLs (e.g. LAN fallbacks) with low priority
        CANDIDATE_URLS.forEach { candidate ->
            if (!targets.contains(candidate) && !candidate.contains("localhost")) {
                targets.add(candidate)
            }
        }

        val currentVersionCode = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(context.packageName, 0).versionCode
            }
        } catch (e: Exception) {
            1
        }
        val currentVersionName = try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "1.0.0"
        } catch (e: Exception) {
            "1.0.0"
        }

        var lastError: String? = null

        for (targetUrl in targets) {
            try {
                // Add timestamp query parameter to bypass CDN/HTTP caches
                val cacheBustUrl = if (targetUrl.contains("?")) {
                    "$targetUrl&_t=${System.currentTimeMillis()}"
                } else {
                    "$targetUrl?_t=${System.currentTimeMillis()}"
                }

                // Short timeout for LAN IPs (e.g. 10.0.0.x) to avoid hanging mobile devices
                val isLocalLan = targetUrl.contains("10.0.0.") || targetUrl.contains("10.0.2.") || targetUrl.contains("192.168.")
                val connTimeout = if (isLocalLan) 2500 else 8000

                Log.d(TAG, "Checking live OTA updates from: $cacheBustUrl")
                val headers = mapOf(
                    "Cache-Control" to "no-cache, no-store, must-revalidate",
                    "Pragma" to "no-cache",
                    "Expires" to "0"
                )
                val connection = openConnectionWithRedirects(
                    initialUrl = cacheBustUrl,
                    method = "GET",
                    connectTimeoutMs = connTimeout,
                    readTimeoutMs = 8000,
                    headers = headers
                )

                if (connection.responseCode in 200..299) {
                    val json = connection.inputStream.bufferedReader().use { it.readText() }
                    val updateInfo = gson.fromJson(json, UpdateInfo::class.java)

                    if (updateInfo != null && updateInfo.versionCode > 0) {
                        Log.i(TAG, "Retrieved update manifest from $targetUrl: remote v${updateInfo.versionName} (${updateInfo.versionCode}) vs current v$currentVersionName ($currentVersionCode)")
                        val targetApkUrl = if (com.missedcall.autotext.BuildConfig.IS_PRO_EDITION && !updateInfo.proDownloadUrl.isNullOrBlank()) {
                            updateInfo.proDownloadUrl
                        } else {
                            updateInfo.apkUrl
                        }
                        val resolvedApk = resolveApkUrl(targetApkUrl, targetUrl)
                        val isMandatory = updateInfo.mandatory || (currentVersionCode < updateInfo.minSupportedVersion)
                        val finalUpdateInfo = updateInfo.copy(apkUrl = resolvedApk, mandatory = isMandatory)

                        if (updateInfo.versionCode > currentVersionCode || forceCheck) {
                            return@withContext UpdateCheckResult.Available(finalUpdateInfo, targetUrl)
                        } else {
                            return@withContext UpdateCheckResult.UpToDate(currentVersionCode, currentVersionName, updateInfo.versionCode, targetUrl)
                        }
                    }
                } else {
                    lastError = "HTTP ${connection.responseCode} from $targetUrl"
                    Log.w(TAG, lastError)
                }
            } catch (e: Exception) {
                lastError = "${e.javaClass.simpleName}: ${e.message}"
                Log.w(TAG, "Failed check from $targetUrl: $lastError")
            }
        }

        UpdateCheckResult.Error(lastError ?: "Could not connect to any update servers", targets)
    }

    suspend fun checkForUpdates(manifestUrl: String = DEFAULT_UPDATE_URL, forceCheck: Boolean = false): UpdateInfo? {
        return when (val result = checkForUpdatesDetailed(manifestUrl, forceCheck)) {
            is UpdateCheckResult.Available -> result.updateInfo
            else -> null
        }
    }

    private fun resolveApkUrl(rawUrl: String, manifestUrl: String): String {
        val defaultApk = if (com.missedcall.autotext.BuildConfig.IS_PRO_EDITION) {
            "https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS-Pro.apk"
        } else {
            "https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS.apk"
        }
        if (rawUrl.isBlank()) return defaultApk
        
        // If manifest was fetched from GitHub, always ensure APK points to GitHub raw
        if (manifestUrl.contains("githubusercontent.com") || manifestUrl.contains("jsdelivr.net")) {
            if (rawUrl.contains("localhost") || rawUrl.contains("10.0.0.") || rawUrl.startsWith("/")) {
                return defaultApk
            }
        }

        if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
            if (rawUrl.contains("localhost") || rawUrl.contains("10.0.2.2")) {
                try {
                    val u = URL(manifestUrl)
                    val portPart = if (u.port != -1) ":${u.port}" else ""
                    val hostBase = "${u.protocol}://${u.host}$portPart"
                    return rawUrl.replace(Regex("https?://[^/]+"), hostBase)
                } catch (e: Exception) {
                    return rawUrl
                }
            }
            return rawUrl
        }
        return try {
            URL(URL(manifestUrl), rawUrl).toString()
        } catch (e: Exception) {
            rawUrl
        }
    }

    suspend fun downloadAndInstallApk(apkUrl: String, onProgress: (Int) -> Unit = {}): Boolean = withContext(Dispatchers.IO) {
        return@withContext try {
            Log.i(TAG, "Downloading APK update from: $apkUrl")
            val connection = openConnectionWithRedirects(
                initialUrl = apkUrl,
                method = "GET",
                connectTimeoutMs = 20000,
                readTimeoutMs = 35000
            )

            val fileLength = connection.contentLength
            val externalDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.cacheDir
            val apkFile = File(externalDir, "update.apk")
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

            if (!apkFile.exists() || apkFile.length() == 0L) {
                Log.e(TAG, "Downloaded APK is missing or 0 bytes")
                withContext(Dispatchers.Main) {
                    Toast.makeText(context, "Downloaded update APK is invalid.", Toast.LENGTH_LONG).show()
                }
                return@withContext false
            }

            Log.i(TAG, "APK downloaded successfully (${apkFile.length()} bytes). Launching package installer...")
            installApk(apkFile)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error downloading APK update from $apkUrl", e)
            withContext(Dispatchers.Main) {
                Toast.makeText(context, "Download Error: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
            }
            false
        }
    }

    private fun openConnectionWithRedirects(
        initialUrl: String,
        method: String = "GET",
        connectTimeoutMs: Int = 10000,
        readTimeoutMs: Int = 15000,
        headers: Map<String, String> = emptyMap()
    ): HttpURLConnection {
        var currentUrl = initialUrl
        var redirects = 0
        while (redirects < 5) {
            val url = URL(currentUrl)
            val connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = connectTimeoutMs
                readTimeout = readTimeoutMs
                instanceFollowRedirects = false
                setRequestProperty("User-Agent", "MissedCallAutoText-Android")
                headers.forEach { (k, v) -> setRequestProperty(k, v) }
            }
            connection.connect()

            val status = connection.responseCode
            if (status in listOf(301, 302, 303, 307, 308)) {
                val newUrl = connection.getHeaderField("Location")
                connection.disconnect()
                if (!newUrl.isNullOrBlank()) {
                    currentUrl = if (newUrl.startsWith("http")) newUrl else URL(URL(currentUrl), newUrl).toString()
                    redirects++
                    continue
                }
            }
            return connection
        }
        val finalConn = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            setRequestProperty("User-Agent", "MissedCallAutoText-Android")
            headers.forEach { (k, v) -> setRequestProperty(k, v) }
        }
        finalConn.connect()
        return finalConn
    }

    private suspend fun installApk(apkFile: File) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            Log.w(TAG, "Install Unknown Apps permission not granted. Prompting user...")
            withContext(Dispatchers.Main) {
                Toast.makeText(
                    context,
                    "Please enable 'Allow from this source' for Missed Call Text-Back to complete update.",
                    Toast.LENGTH_LONG
                ).show()
                try {
                    val settingsIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:${context.packageName}")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(settingsIntent)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to launch unknown app sources settings", e)
                }
            }
            return
        }

        withContext(Dispatchers.Main) {
            try {
                val authority = "${context.packageName}.fileprovider"
                val apkUri: Uri = FileProvider.getUriForFile(context, authority, apkFile)

                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(apkUri, "application/vnd.android.package-archive")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
                }

                context.startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to launch package installer", e)
                Toast.makeText(context, "Installation Error: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
            }
        }
    }
}
