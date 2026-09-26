package com.missedcall.autotext.util

/**
 * AutomatedSmsFilter
 *
 * Multi-layer safeguard preventing AI conversational loops with:
 * 1. Bank alerts, one-time passwords (OTP), two-factor authentication (2FA)
 * 2. Enterprise shortcodes (3-6 digits, e.g. 22395, 729725, 48369)
 * 3. Alphanumeric sender IDs (e.g. "CHASE", "GOOGLE", "Uber", "AUTHMSG")
 * 4. Automated carrier bots & A2P auto-responders ("Reply STOP", "do not reply", etc.)
 * 5. Non-10-digit or invalid NANP phone numbers
 */
object AutomatedSmsFilter {

    private val AUTOMATED_CONTENT_REGEXES = listOf(
        // 2FA / OTP / Verification Codes
        Regex("""(?i)\b(verification|security|auth|login|access|passcode|one-time|otp|pin)\s+(code|is|number)\b"""),
        Regex("""(?i)\bcode\s*[:#]?\s*\d{4,8}\b"""),
        Regex("""(?i)\b(your\s+code\s+is|use\s+code)\s+\d{4,8}\b"""),
        Regex("""(?i)\b(do\s+not\s+share|valid\s+for\s+\d+\s+min|temporary\s+password|security\s+key)\b"""),
        Regex("""(?i)\b(enter\s+this\s+code|confirm\s+your\s+identity|didn't\s+request\s+this)\b"""),

        // Banking, Financial & Security Alerts
        Regex("""(?i)\b(fraud\s+alert|suspicious\s+activity|unrecognized\s+sign-in|card\s+ending\s+in\s+\d{4})\b"""),
        Regex("""(?i)\b(account\s+alert|declined\s+transaction|available\s+balance|zelle\s+payment|wire\s+transfer)\b"""),
        Regex("""(?i)\b(charge\s+of\s+\$|purchase\s+of\s+\$|refund\s+of\s+\$)\b"""),

        // Automated System & Bot Footers / Loop Triggers
        Regex("""(?i)\b(reply\s+stop\s+to|text\s+stop|stop2end|msg\s*&\s*data\s*rates|rates\s*may\s*apply)\b"""),
        Regex("""(?i)\b(this\s+is\s+an\s+automated|auto-generated|do\s+not\s+reply|automated\s+notification|no-reply)\b"""),
        Regex("""(?i)\b(reply\s+help\s+for|text\s+help|press\s+1\s+to|invalid\s+keyword|unrecognized\s+command)\b"""),

        // Delivery & Shipping Trackers
        Regex("""(?i)\b(your\s+order\s+#\d+|package\s+delivered|out\s+for\s+delivery|tracking\s+number|driver\s+is\s+arriving)\b"""),
        Regex("""(?i)\b(delivery\s+driver|doordash|instacart|ubereats|amazon\s+delivery)\b""")
    )

    /**
     * Checks if the sender address is a valid peer-to-peer 10-digit (or +1 10-digit) mobile/landline number.
     * Rejects:
     * - Alphanumeric Sender IDs (e.g. "CHASE", "VERIZON", "GOOGLE")
     * - Email gateways (e.g. "alerts@bank.com")
     * - Shortcodes (3 to 6 digits, e.g. 22395, 729725)
     * - Invalid North American Numbering Plan numbers (e.g. starting with 0 or 1 area code)
     */
    fun isValidPeerPhoneNumber(rawSender: String?): Boolean {
        if (rawSender.isNullOrBlank()) return false

        val trimmed = rawSender.trim()

        // 1. Check for Alphanumeric Sender IDs or Email Gateways
        if (trimmed.any { it.isLetter() } || trimmed.contains("@")) {
            return false
        }

        // 2. Extract digits only
        val digits = trimmed.filter { it.isDigit() }

        // 3. Reject Shortcodes (< 10 digits)
        if (digits.length < 10) {
            return false
        }

        // 4. Extract standard 10-digit NANP sequence
        val tenDigits = when {
            digits.length == 10 -> digits
            digits.length == 11 && digits.startsWith("1") -> digits.substring(1)
            else -> return false // Not a standard 10/11-digit number
        }

        // 5. Enforce North American Numbering Plan rules:
        // Area code [2-9]XX and Exchange code [2-9]XX cannot start with 0 or 1
        val areaCodeFirst = tenDigits[0]
        val exchangeFirst = tenDigits[3]
        if (areaCodeFirst !in '2'..'9' || exchangeFirst !in '2'..'9') {
            return false
        }

        // 6. Reject repetitive test/spoof patterns (e.g. 000-000-0000, 999-999-9999, 123-123-1234)
        if (tenDigits.toSet().size <= 2) {
            return false
        }

        return true
    }

    /**
     * Inspects the message text for fingerprints of automated systems,
     * one-time passcodes, bank alerts, delivery tracking, and bot disclaimers.
     *
     * Returns true if the message appears to be automated, false if human.
     */
    fun isAutomatedMessage(body: String?): Boolean {
        if (body.isNullOrBlank()) return false
        val content = body.trim()
        return AUTOMATED_CONTENT_REGEXES.any { it.containsMatchIn(content) }
    }

    /**
     * Determines the specific reason an incoming SMS was filtered.
     * Useful for user-facing notifications.
     */
    fun getFilterReason(sender: String, body: String): String? {
        if (!isValidPeerPhoneNumber(sender)) {
            val digits = sender.filter { it.isDigit() }
            return when {
                sender.any { it.isLetter() } -> "Alphanumeric sender ID ($sender) is an automated broadcast."
                digits.length in 3..6 -> "Shortcode ($sender) is an automated system or verification service."
                digits.length < 10 -> "Number ($sender) has fewer than 10 digits."
                else -> "Number ($sender) is not a standard 10-digit phone number."
            }
        }

        if (isAutomatedMessage(body)) {
            return "Message detected as an automated notification, one-time passcode (OTP), or security alert."
        }

        return null
    }
}
