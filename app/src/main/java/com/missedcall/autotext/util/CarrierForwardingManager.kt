package com.missedcall.autotext.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.telephony.TelephonyManager
import android.util.Log

enum class CarrierType(val displayName: String) {
    VERIZON("Verizon / US Cellular / Visible"),
    ATT("AT&T / Cricket"),
    TMOBILE("T-Mobile / Mint Mobile / Metro"),
    GENERIC("Standard US Carrier")
}

data class CarrierForwardingCodes(
    val carrier: CarrierType,
    val carrierName: String,
    val activateCode: String,
    val deactivateCode: String,
    val explanation: String
)

object CarrierForwardingManager {

    private const val TAG = "CarrierForwarding"

    fun detectCarrier(context: Context): CarrierType {
        return try {
            val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            val simOperator = tm?.simOperatorName?.lowercase() ?: ""
            val networkOperator = tm?.networkOperatorName?.lowercase() ?: ""
            val combined = "$simOperator $networkOperator"

            when {
                combined.contains("verizon") || combined.contains("visible") || combined.contains("spectrum") || combined.contains("xfinity") || combined.contains("us cellular") -> CarrierType.VERIZON
                combined.contains("at&t") || combined.contains("att") || combined.contains("cricket") || combined.contains("consumer cellular") -> CarrierType.ATT
                combined.contains("t-mobile") || combined.contains("tmobile") || combined.contains("mint") || combined.contains("metro") || combined.contains("ultra") -> CarrierType.TMOBILE
                else -> CarrierType.VERIZON // Default to *71 (most universally supported CDMA/LTE prefix in US)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error detecting carrier", e)
            CarrierType.VERIZON
        }
    }

    fun getCarrierName(context: Context): String {
        return try {
            val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            val name = tm?.simOperatorName?.ifBlank { tm.networkOperatorName }
            if (!name.isNullOrBlank()) name else "Mobile Carrier"
        } catch (e: Exception) {
            "Mobile Carrier"
        }
    }

    fun computeCodes(carrier: CarrierType, rawForwardingNumber: String): CarrierForwardingCodes {
        val cleanDigits = rawForwardingNumber.replace(Regex("[^0-9]"), "")
        val tenDigits = if (cleanDigits.length >= 10) cleanDigits.takeLast(10) else cleanDigits

        return when (carrier) {
            CarrierType.VERIZON -> CarrierForwardingCodes(
                carrier = carrier,
                carrierName = carrier.displayName,
                activateCode = "*71$tenDigits",
                deactivateCode = "*73",
                explanation = "Rings your phone for 15s; forwards unanswered calls to AI. Deactivate with *73."
            )
            CarrierType.ATT -> CarrierForwardingCodes(
                carrier = carrier,
                carrierName = carrier.displayName,
                activateCode = "*004*$tenDigits#",
                deactivateCode = "##004#",
                explanation = "Conditional forwarding for unanswered/busy calls. Deactivate with ##004#."
            )
            CarrierType.TMOBILE -> CarrierForwardingCodes(
                carrier = carrier,
                carrierName = carrier.displayName,
                activateCode = "**61*$tenDigits**15#",
                deactivateCode = "##004#",
                explanation = "Forwards after 15s ring time. Deactivate with ##004#."
            )
            CarrierType.GENERIC -> CarrierForwardingCodes(
                carrier = carrier,
                carrierName = carrier.displayName,
                activateCode = "*71$tenDigits",
                deactivateCode = "*73",
                explanation = "Standard conditional call forwarding. Deactivate with *73."
            )
        }
    }

    /**
     * Launches the phone dialer pre-populated with the carrier MMI/USSD code.
     * Note: Uri.encode("#") is required because '#' in a URI denotes a fragment.
     */
    fun launchDialer(context: Context, dialCode: String) {
        try {
            val encodedCode = Uri.encode(dialCode)
            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$encodedCode")).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch dialer for code $dialCode", e)
        }
    }

    fun activateConditionalForwarding(context: Context, rawForwardingNumber: String): CarrierForwardingCodes {
        val carrier = detectCarrier(context)
        val codes = computeCodes(carrier, rawForwardingNumber)
        launchDialer(context, codes.activateCode)
        return codes
    }

    fun deactivateConditionalForwarding(context: Context): CarrierForwardingCodes {
        val carrier = detectCarrier(context)
        val codes = computeCodes(carrier, "")
        launchDialer(context, codes.deactivateCode)
        return codes
    }
}
