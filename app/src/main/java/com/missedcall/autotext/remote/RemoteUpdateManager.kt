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
        const val DEFAULT_UPDATE_URL = "http://localhost:8000/api/version.json"
    }

    private val gson = Gson()

    suspend fun checkForUpdates(manifestUrl: String = DEFAULT_UPDATE_URL): UpdateInfo? = withContext(Dispatchers.IO) {
        if (manifestUrl.isBlank()) return@withContext null
        return@withContext try {
            val url = URL(manifestUrl)
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 10000
            connection.readTimeout = 10000

            if (connection.responseCode == 200) {
                val json = connection.inputStream.bufferedReader().use { it.readText() }
                val updateInfo = gson.fromJson(json, UpdateInfo::class.java)

                val currentVersionCode = try {
                    context.packageManager.getPackageInfo(context.packageName, 0).versionCode
                } catch (e: Exception) {
                    1
                }

                if (updateInfo.versionCode > currentVersionCode) {
                    updateInfo
                } else {
                    null
                }
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check remote update from $manifestUrl", e)
            null
        }
    }

    suspend fun downloadAndInstallApk(apkUrl: String, onProgress: (Int) -> Unit = {}): Boolean = withContext(Dispatchers.IO) {
        return@withContext try {
            val url = URL(apkUrl)
            val connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            connection.connect()

            val fileLength = connection.contentLength
            val apkFile = File(context.cacheDir, "update.apk")
            if (apkFile.exists()) apkFile.delete()

            connection.inputStream.use { input ->
                FileOutputStream(apkFile).use { output ->
                    val data = ByteArray(8192)
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

            installApk(apkFile)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error downloading APK update from $apkUrl", e)
            false
        }
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
