package com.missedcall.autotext.data.license

import android.content.Context
import android.provider.Settings
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object LicenseManager {

    private const val TAG = "LicenseManager"
    private const val SECRET_KEY = "MCAT_SECRET_PROD_KEY_2026"
    private const val KEY_PREFIX = "MCAT-"

    fun getDeviceId(context: Context): String {
        return try {
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "UNKNOWN_DEVICE"
        } catch (e: Exception) {
            "UNKNOWN_DEVICE"
        }
    }

    fun verifyLicenseKey(key: String): LicenseInfo {
        val trimmedKey = key.trim().uppercase()

        // 1. Authorized Master Demo / Reviewer Keys
        if (trimmedKey == "MCAS-DEMO-TRIAL-89F2" ||
            trimmedKey == "MCAT-DEMO-TRIAL-89F2" ||
            trimmedKey == "MCAS-DEMO-89F2" ||
            trimmedKey == "MCAT-DEMO-89F2") {
            return LicenseInfo(
                status = LicenseStatus.ACTIVE_LIFETIME,
                licenseKey = trimmedKey,
                licensedTo = "Owner & Reviewer Master Demo",
                expiryTimestamp = 0L,
                checksum = "89F2"
            )
        }

        // 2. Determine License Prefix (MCAS- or legacy MCAT-)
        val prefix = when {
            trimmedKey.startsWith("MCAS-") -> "MCAS-"
            trimmedKey.startsWith("MCAT-") -> "MCAT-"
            else -> return LicenseInfo(status = LicenseStatus.UNLICENSED, licenseKey = trimmedKey)
        }

        if (trimmedKey.length < 15) {
            return LicenseInfo(status = LicenseStatus.UNLICENSED, licenseKey = trimmedKey)
        }

        val parts = trimmedKey.substring(prefix.length).split("-")
        if (parts.size < 2) {
            return LicenseInfo(status = LicenseStatus.UNLICENSED, licenseKey = trimmedKey)
        }

        val payloadHex = parts[0]
        val expectedSig = parts[1]

        val calculatedSig = generateHmac(payloadHex, SECRET_KEY).take(expectedSig.length).uppercase()
        if (calculatedSig != expectedSig.uppercase()) {
            Log.w(TAG, "Invalid signature for key: $trimmedKey")
            return LicenseInfo(status = LicenseStatus.UNLICENSED, licenseKey = trimmedKey)
        }

        return try {
            val payloadStr = String(hexToBytes(payloadHex), StandardCharsets.UTF_8)
            val fields = payloadStr.split("|")
            val customerName = fields.getOrNull(0) ?: "Valued Customer"
            val expiryTime = fields.getOrNull(1)?.toLongOrNull() ?: 0L

            val isExpired = expiryTime in 1..<System.currentTimeMillis()
            val status = if (isExpired) {
                LicenseStatus.EXPIRED
            } else {
                LicenseStatus.ACTIVE_LIFETIME
            }

            LicenseInfo(
                status = status,
                licenseKey = trimmedKey,
                licensedTo = customerName,
                expiryTimestamp = expiryTime,
                checksum = expectedSig
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse license payload", e)
            LicenseInfo(status = LicenseStatus.UNLICENSED, licenseKey = trimmedKey)
        }
    }

    suspend fun checkOnlineRevocation(licenseKey: String, revocationUrl: String): Boolean = withContext(Dispatchers.IO) {
        if (revocationUrl.isBlank() || licenseKey.isBlank()) return@withContext false
        return@withContext try {
            val url = URL(revocationUrl)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 5000
            conn.readTimeout = 5000

            if (conn.responseCode == 200) {
                val json = conn.inputStream.bufferedReader().use { it.readText() }
                json.contains(licenseKey.uppercase())
            } else {
                false
            }
        } catch (e: Exception) {
            false
        }
    }

    private fun generateHmac(data: String, key: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        val secretKey = SecretKeySpec(key.toByteArray(StandardCharsets.UTF_8), "HmacSHA256")
        mac.init(secretKey)
        val hash = mac.doFinal(data.toByteArray(StandardCharsets.UTF_8))
        return bytesToHex(hash)
    }

    private fun bytesToHex(bytes: ByteArray): String {
        val sb = StringBuilder()
        for (b in bytes) {
            sb.append(String.format("%02X", b))
        }
        return sb.toString()
    }

    private fun hexToBytes(hex: String): ByteArray {
        val len = hex.length
        val data = ByteArray(len / 2)
        var i = 0
        while (i < len) {
            data[i / 2] = ((Character.digit(hex[i], 16) shl 4) + Character.digit(hex[i + 1], 16)).toByte()
            i += 2
        }
        return data
    }
}
