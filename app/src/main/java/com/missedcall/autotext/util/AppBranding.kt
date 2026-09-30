package com.missedcall.autotext.util

import com.missedcall.autotext.BuildConfig

/**
 * Centralized branding provider for the application.
 * Injects dynamic white-label agency properties compiled into BuildConfig.
 */
object AppBranding {
    /**
     * Display name of the application (e.g. "Missed Call Auto-SMS" or "Apex CallShield")
     */
    val appName: String
        get() = BuildConfig.APP_DISPLAY_NAME

    /**
     * Unique identifier for the agency partner ("default" for flagship)
     */
    val agencyId: String
        get() = BuildConfig.AGENCY_ID

    /**
     * Primary support and customer service email for the agency
     */
    val supportEmail: String
        get() = BuildConfig.AGENCY_SUPPORT_EMAIL

    /**
     * Web URL for the privacy policy
     */
    val privacyPolicyUrl: String
        get() = BuildConfig.AGENCY_PRIVACY_URL

    /**
     * Web URL for terms of service
     */
    val termsUrl: String
        get() = BuildConfig.AGENCY_TERMS_URL

    /**
     * Stripe charge descriptor (defaults to carrier-grade "Voice Hub Network")
     */
    val stripeDescriptor: String
        get() = BuildConfig.STRIPE_DESCRIPTOR

    /**
     * Whether this build is branded for an agency partner
     */
    val isWhiteLabeled: Boolean
        get() = agencyId != "default"

    /**
     * Short status text for the appliance
     */
    fun applianceStatus(isActive: Boolean): String {
        return if (isActive) "Appliance: ACTIVE" else "Appliance: PAUSED"
    }
}
