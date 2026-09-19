package com.missedcall.autotext.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.ui.theme.ActiveGreenContainer
import com.missedcall.autotext.ui.theme.ActiveGreenText

enum class PromoType {
    UPGRADE_TO_PRO,
    SUBSCRIBE_VOICE_PRO
}

object InAppPromoController {
    private const val PREFS_NAME = "mcas_in_app_promo_prefs"
    private const val KEY_LAST_SHOWN_TIME = "last_promo_shown_timestamp"
    private const val KEY_LAUNCH_COUNT = "app_launch_count"
    private const val KEY_PROMO_INDEX = "promo_rotation_index"
    private const val COOLDOWN_HOURS_MS = 36 * 60 * 60 * 1000L // 36 hours between popups

    const val STRIPE_PRO_UPGRADE_URL = "https://buy.stripe.com/cNi5kDdJQ558c6k2yB2go0b"
    const val STRIPE_VOICE_PRO_URL = "https://buy.stripe.com/4gMeVdcFMaps6M0b572go0f"

    fun onAppOpened(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val launches = prefs.getInt(KEY_LAUNCH_COUNT, 0) + 1
        prefs.edit().putInt(KEY_LAUNCH_COUNT, launches).apply()
    }

    fun shouldShowPromoPopup(context: Context, settings: AppSettings, isMandatoryUpdatePending: Boolean): PromoType? {
        if (isMandatoryUpdatePending) return null

        val trimmedKey = settings.licenseKey.trim().uppercase()
        // If already has Voice Pro, don't show any ads
        if (trimmedKey.contains("VOICE-PRO")) return null

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val launches = prefs.getInt(KEY_LAUNCH_COUNT, 1)
        // Never interrupt user on first app launch
        if (launches < 2) return null

        val lastShown = prefs.getLong(KEY_LAST_SHOWN_TIME, 0L)
        val now = System.currentTimeMillis()
        if ((now - lastShown) < COOLDOWN_HOURS_MS) return null

        val isPro = trimmedKey.contains("PRO") || com.missedcall.autotext.BuildConfig.IS_PRO_EDITION
        return if (isPro) {
            // Pro user who doesn't have Voice Pro yet
            PromoType.SUBSCRIBE_VOICE_PRO
        } else {
            // $49 user: alternate between Voice Pro and Pro Automation
            val index = prefs.getInt(KEY_PROMO_INDEX, 0)
            if (index % 2 == 0) PromoType.SUBSCRIBE_VOICE_PRO else PromoType.UPGRADE_TO_PRO
        }
    }

    fun recordPromoDismissedOrViewed(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val nextIndex = (prefs.getInt(KEY_PROMO_INDEX, 0) + 1) % 2
        prefs.edit()
            .putLong(KEY_LAST_SHOWN_TIME, System.currentTimeMillis())
            .putInt(KEY_PROMO_INDEX, nextIndex)
            .apply()
    }
}

@Composable
fun InAppPromoDialog(
    promoType: PromoType,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current

    val isVoice = promoType == PromoType.SUBSCRIBE_VOICE_PRO
    val accentColor = if (isVoice) Color(0xFF00E676) else Color(0xFFA855F7)
    val containerBorder = if (isVoice) Color(0xFF00E676).copy(alpha = 0.5f) else Color(0xFFA855F7).copy(alpha = 0.5f)

    val targetUrl = if (isVoice) InAppPromoController.STRIPE_VOICE_PRO_URL else InAppPromoController.STRIPE_PRO_UPGRADE_URL

    Dialog(
        onDismissRequest = {
            InAppPromoController.recordPromoDismissedOrViewed(context)
            onDismiss()
        },
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .wrapContentHeight(),
            shape = RoundedCornerShape(24.dp),
            color = Color(0xFF0F131A),
            border = BorderStroke(1.5.dp, containerBorder),
            tonalElevation = 12.dp
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(22.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Header badge
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = accentColor.copy(alpha = 0.15f),
                        border = BorderStroke(1.dp, accentColor.copy(alpha = 0.4f))
                    ) {
                        Text(
                            text = if (isVoice) "🎙️ EXCLUSIVE ADD-ON" else "🚀 LIMITED UPGRADE OFFER",
                            color = accentColor,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }

                    IconButton(
                        onClick = {
                            InAppPromoController.recordPromoDismissedOrViewed(context)
                            onDismiss()
                        },
                        modifier = Modifier.size(28.dp)
                    ) {
                        Icon(Icons.Default.Close, contentDescription = "Close", tint = Color(0xFF8B949E))
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Title & Subtitle
                Text(
                    text = if (isVoice) "Never Lose a Job While Your Hands Are Full!" else "Upgrade to Pro Automation & Dual SIM",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    lineHeight = 26.sp
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = if (isVoice) {
                        "Add a 24/7 AI Voice Receptionist to your business line. Unanswered calls route via *71 after 15 seconds—AI answers, captures customer details, and texts you instantly!"
                    } else {
                        "Supercharge your auto-text appliance with multi-step follow-up sequences, automated appointment calendar links, and dual-SIM smart load balancing."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFFCBD5E0),
                    textAlign = TextAlign.Center,
                    lineHeight = 18.sp
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Feature Highlights Card
                Surface(
                    color = Color(0xFF161B22),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, Color(0xFF2D333B)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        if (isVoice) {
                            PromoFeatureRow(icon = "📞", title = "*71 Conditional Forwarding", desc = "Rings your cell for 15s; forwards to AI if unanswered")
                            PromoFeatureRow(icon = "🤖", title = "24/7 Voice AI Answering", desc = "Triages emergency repairs & captures phonetic address")
                            PromoFeatureRow(icon = "📲", title = "Real SIM SMS Text-Back", desc = "Auto-texts the caller from your real phone carrier number")
                            PromoFeatureRow(icon = "⏱️", title = "200 Included Mins/Month", desc = "Turnkey zero-config setup with $0 overage protection")
                        } else {
                            PromoFeatureRow(icon = "⚡", title = "Multi-Step Sequences", desc = "Follow up after 15m, 2h, and 24h to lock in leads")
                            PromoFeatureRow(icon = "📅", title = "Calendar Booking Links", desc = "Embed your Calendly or Google booking link automatically")
                            PromoFeatureRow(icon = "📶", title = "Dual-SIM Load Balancing", desc = "Distribute outbound messages across two carrier lines")
                            PromoFeatureRow(icon = "🌐", title = "CRM & Zapier Webhooks", desc = "Push customer details into your CRM in real time")
                        }
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                // CTA Button
                Button(
                    onClick = {
                        InAppPromoController.recordPromoDismissedOrViewed(context)
                        onDismiss()
                        try {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl)).apply {
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                            }
                            context.startActivity(intent)
                        } catch (e: Exception) {
                            // Fallback
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = accentColor),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                ) {
                    Text(
                        text = if (isVoice) "Activate AI Voice ($29/mo) ➔" else "Upgrade to Pro ($149 Lifetime) ➔",
                        color = Color.Black,
                        fontWeight = FontWeight.Black,
                        fontSize = 15.sp
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Polite Dismiss Button
                TextButton(
                    onClick = {
                        InAppPromoController.recordPromoDismissedOrViewed(context)
                        onDismiss()
                    }
                ) {
                    Text(
                        text = "Maybe Later",
                        color = Color(0xFF8B949E),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

@Composable
fun PromoFeatureRow(icon: String, title: String, desc: String) {
    Row(
        verticalAlignment = Alignment.Top,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(text = icon, fontSize = 14.sp)
        Spacer(modifier = Modifier.width(10.dp))
        Column {
            Text(
                text = title,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Text(
                text = desc,
                style = MaterialTheme.typography.labelSmall,
                color = Color(0xFF8B949E)
            )
        }
    }
}

/**
 * Non-intrusive in-app banner card embedded on the Dashboard
 */
@Composable
fun InAppPromoBannerCard(
    settings: AppSettings,
    isProEdition: Boolean
) {
    val context = LocalContext.current
    var isDismissedForSession by remember { mutableStateOf(false) }

    if (isDismissedForSession) return

    val trimmedKey = settings.licenseKey.trim().uppercase()
    val isVoicePro = trimmedKey.contains("VOICE-PRO")
    val isPro = isProEdition || trimmedKey.contains("PRO")

    // If user has Voice Pro, display an active badge card instead of an ad
    if (isVoicePro) {
        Card(
            colors = CardDefaults.cardColors(containerColor = ActiveGreenContainer.copy(alpha = 0.15f)),
            border = BorderStroke(1.dp, ActiveGreenText.copy(alpha = 0.3f)),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = ActiveGreenText, modifier = Modifier.size(22.dp))
                Spacer(modifier = Modifier.width(10.dp))
                Column {
                    Text(
                        text = "🎙️ 24/7 AI Voice Receptionist Active",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = ActiveGreenText
                    )
                    Text(
                        text = "Unanswered calls forward via *71. 200 included minutes/mo active.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        return
    }

    // Determine target campaign
    val targetIsVoice = isPro // If already Pro, target Voice; if standard, target Voice or Pro
    val accent = if (targetIsVoice) Color(0xFF00E676) else Color(0xFFA855F7)
    val url = if (targetIsVoice) InAppPromoController.STRIPE_VOICE_PRO_URL else InAppPromoController.STRIPE_PRO_UPGRADE_URL

    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF131720)),
        border = BorderStroke(1.dp, accent.copy(alpha = 0.4f)),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (targetIsVoice) "🎙️" else "🚀", fontSize = 18.sp)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (targetIsVoice) "Add 24/7 AI Voice Receptionist ($29/mo)" else "Upgrade to Pro Automation ($149)",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White
                    )
                }
                IconButton(
                    onClick = { isDismissedForSession = true },
                    modifier = Modifier.size(24.dp)
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Hide", tint = Color(0xFF8B949E), modifier = Modifier.size(16.dp))
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = if (targetIsVoice) {
                    "Hands full on a job? Forward unanswered calls via *71 to a dedicated AI that speaks with callers and texts you lead details."
                } else {
                    "Unlock multi-step timed text sequences, calendar booking links, and dual-SIM support with a lifetime one-time upgrade."
                },
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFFCBD5E0)
            )

            Spacer(modifier = Modifier.height(12.dp))

            Button(
                onClick = {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        context.startActivity(intent)
                    } catch (e: Exception) {}
                },
                colors = ButtonDefaults.buttonColors(containerColor = accent),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = if (targetIsVoice) "Activate AI Voice Add-On ➔" else "Upgrade to Pro Automation ➔",
                    color = Color.Black,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
            }
        }
    }
}
