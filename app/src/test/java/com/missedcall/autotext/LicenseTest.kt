package com.missedcall.autotext

import com.missedcall.autotext.data.license.LicenseManager
import com.missedcall.autotext.data.license.LicenseStatus
import org.junit.Assert.*
import org.junit.Test
import java.nio.charset.StandardCharsets
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class LicenseTest {

    @Test
    fun testLicenseGenerationAndVerification() {
        val customerName = "Test Customer"
        val payloadStr = "$customerName|0|${System.currentTimeMillis()}"
        val payloadHex = bytesToHex(payloadStr.toByteArray(StandardCharsets.UTF_8))
        val sig = generateHmac(payloadHex, "MCAT_SECRET_PROD_KEY_2026").take(8).uppercase()

        val generatedKey = "MCAT-$payloadHex-$sig"
        println("Generated License Key: $generatedKey")

        val verification = LicenseManager.verifyLicenseKey(generatedKey)
        assertEquals(LicenseStatus.ACTIVE_LIFETIME, verification.status)
        assertEquals(customerName, verification.licensedTo)
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
}
