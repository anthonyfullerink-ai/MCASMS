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
        val trimmedKey = key.trim().replace(" ", "").uppercase()

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
                checksum = "89F2",
                tier = LicenseTier.STANDARD
            )
        }
        if (trimmedKey == "MCAS-PRO-DEMO-89F2" ||
            trimmedKey == "MCAT-PRO-DEMO-89F2" ||
            trimmedKey == "MCAS-PRO-DEMO-TRIAL-89F2") {
            return LicenseInfo(
                status = LicenseStatus.ACTIVE_LIFETIME,
                licenseKey = trimmedKey,
                licensedTo = "Owner & Reviewer Master Pro Demo",
                expiryTimestamp = 0L,
                checksum = "89F2",
                tier = LicenseTier.PRO
            )
        }

        // 2. Determine License Prefix (MCAS-PRO-, MCAS-, or legacy MCAT-)
        val (prefix, tier) = when {
            trimmedKey.startsWith("MCAS-PRO-") -> "MCAS-PRO-" to LicenseTier.PRO
            trimmedKey.startsWith("MCAT-PRO-") -> "MCAT-PRO-" to LicenseTier.PRO
            trimmedKey.startsWith("MCAS-") -> "MCAS-" to LicenseTier.STANDARD
            trimmedKey.startsWith("MCAT-") -> "MCAT-" to LicenseTier.STANDARD
            else -> return LicenseInfo(status = LicenseStatus.UNLICENSED, licenseKey = trimmedKey)
        }

        if (trimmedKey.length < prefix.length + 8) {
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
            val customerName = fields.getOrNull(0)?.ifBlank { "Valued Customer" } ?: "Valued Customer"
            val expiryTimeRaw = fields.getOrNull(1)?.toLongOrNull() ?: 0L
            // fields[2] = issuedAt timestamp (ignored here — server-side only)
            // fields[3] = agencyId attribution tag (optional, 4th segment for agency-issued child keys)
            // Backward-compatible: retail keys have 3 segments, agency keys have 4
            
            // Normalize epoch timestamp: if <= 10 billion, it's in seconds -> convert to ms
            val expiryTimeMs = if (expiryTimeRaw in 1..<10_000_000_000L) {
                expiryTimeRaw * 1000L
            } else {
                expiryTimeRaw
            }

            val isExpired = expiryTimeMs in 1..<System.currentTimeMillis()
            val status = when {
                isExpired -> LicenseStatus.EXPIRED
                expiryTimeMs > 0 -> LicenseStatus.ACTIVE_SUBSCRIPTION
                else -> LicenseStatus.ACTIVE_LIFETIME
            }

            LicenseInfo(
                status = status,
                licenseKey = trimmedKey,
                licensedTo = customerName,
                expiryTimestamp = expiryTimeMs,
                checksum = expectedSig,
                tier = tier
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse license payload", e)
            LicenseInfo(status = LicenseStatus.UNLICENSED, licenseKey = trimmedKey)
        }
    }

    /**
     * Checks the live revocation endpoint at https://missedcallautosms.com/api/agency/revoked
     * Returns true if the key has been revoked by the agency operator.
     * Returns false on any network error (fail-open to avoid falsely blocking valid keys offline).
     */
    suspend fun checkOnlineRevocation(licenseKey: String, revocationUrl: String): Boolean = withContext(Dispatchers.IO) {
        if (revocationUrl.isBlank() || licenseKey.isBlank()) return@withContext false
        return@withContext try {
            val encodedKey = java.net.URLEncoder.encode(licenseKey, "UTF-8")
            val fullUrl = if (revocationUrl.contains("?")) "$revocationUrl&key=$encodedKey"
                         else "$revocationUrl?key=$encodedKey"
            val url = URL(fullUrl)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 5000
            conn.readTimeout = 5000

            if (conn.responseCode == 200) {
                val json = conn.inputStream.bufferedReader().use { it.readText() }
                // Parse {"revoked": true} response from /api/agency/revoked
                json.contains("\"revoked\":true") || json.contains("\"revoked\": true")
            } else {
                false // Non-200 response — fail open (don't block user)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Online revocation check failed (network error): ${e.message}")
            false // Network error — fail open (don't block valid users who are offline)
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
