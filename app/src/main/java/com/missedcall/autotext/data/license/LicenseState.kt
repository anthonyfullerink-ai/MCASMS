package com.missedcall.autotext.data.license

enum class LicenseStatus {
    UNLICENSED,
    ACTIVE_LIFETIME,
    ACTIVE_SUBSCRIPTION,
    EXPIRED,
    REVOKED
}

enum class LicenseTier {
    STANDARD,
    PRO
}

data class LicenseInfo(
    val status: LicenseStatus = LicenseStatus.UNLICENSED,
    val licenseKey: String = "",
    val licensedTo: String = "",
    val expiryTimestamp: Long = 0L, // 0 = Lifetime
    val checksum: String = "",
    val tier: LicenseTier = LicenseTier.STANDARD
)
