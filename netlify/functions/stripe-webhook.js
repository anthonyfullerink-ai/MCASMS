const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const path = require('path');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Missed Call Auto SMS <support@missedcallautosms.com>';
const OWNER_NOTIFY_EMAIL = process.env.OWNER_EMAIL || 'contactus@offgridmediagroup.com';

const LICENSE_SECRET = "MCAT_SECRET_PROD_KEY_2026";
const KEY_PREFIX = "MCAS-";

// Lazy Firestore loader — gracefully skips if env keys are missing
let _firestore = null;
function getFirestore() {
  if (_firestore) return _firestore;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return null;
  }
  try {
    _firestore = require('../../lib/firestore');
  } catch (e) {
    console.warn('[stripe-webhook] Firestore module unavailable:', e.message);
  }
  return _firestore;
}



function generateKey(customerName, daysValid = 0, isPro = false) {
  const expiryTimestamp = daysValid === 0 ? 0 : Math.floor(Date.now() / 1000) + (daysValid * 86400);
  const payloadStr = `${customerName || 'Valued Customer'}|${expiryTimestamp}|${Math.floor(Date.now() / 1000)}`;
  const payloadHex = Buffer.from(payloadStr, "utf-8").toString("hex").toUpperCase();
  
  const hmac = crypto.createHmac("sha256", LICENSE_SECRET);
  hmac.update(payloadHex);
  const sigShort = hmac.digest("hex").substring(0, 8).toUpperCase();
  
  const prefix = isPro ? "MCAS-PRO-" : KEY_PREFIX;
  return `${prefix}${payloadHex}-${sigShort}`;
}

function generateEmailHtml(customerName, licenseKey, apkDownloadUrl, amountPaid, isPro = false) {
  const brandTitle = isPro ? "Missed Call Auto SMS • Pro Gateway" : "Missed Call Auto SMS";
  const badgeText = isPro ? "PRO AUTOMATION GATEWAY (A2P 10DLC BYPASS)" : "FOUNDER'S FLAGSHIP APPLIANCE";
  const themeBorderColor = isPro ? "#A855F7" : "#00E676";
  const themeTextColor = isPro ? "#C084FC" : "#00E676";
  const editionSummary = isPro
    ? "Lifetime Pro Gateway • 1-Year Cloud Relay API Included • Unlimited n8n/Make Integration • Dual SIM • 100% A2P 10DLC Exempt"
    : "Founder's Lifetime License • 1 Android Phone Bound • 100% A2P 10DLC Exempt";

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your ${brandTitle} License Key & Setup Guide</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 600px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 44px; margin-bottom: 8px;">${isPro ? '⚡' : '📱'}</div>
            <h1 style="color: ${themeTextColor}; margin: 0; font-size: 24px; font-weight: 900;">${brandTitle}</h1>
            <div style="display: inline-block; margin-top: 6px; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; background: ${themeBorderColor}22; color: ${themeTextColor}; border: 1px solid ${themeBorderColor}44;">
                ${badgeText}
            </div>
        </div>

        <div style="background: #1A202C; border-left: 4px solid ${themeBorderColor}; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Thank you, ${customerName}!</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                Your payment of <strong>$${amountPaid}</strong> was successful. Your ${isPro ? 'Pro Gateway' : 'Founder\'s Flagship'} license key is ready to activate on your Android device.
            </p>
        </div>

        <!-- License Key Box -->
        <div style="background: #090B0E; border: 1px dashed ${themeBorderColor}; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 8px;">Your ${isPro ? 'Pro Gateway ' : ''}Hardware License Key</div>
            <div style="font-family: monospace; font-size: 22px; color: ${themeTextColor}; font-weight: bold; word-break: break-all; letter-spacing: 1px; margin-bottom: 8px;">
                ${licenseKey}
            </div>
            <div style="font-size: 12px; color: #A0AEC0;">${editionSummary}</div>
        </div>

        <!-- APK Download Button -->
        <div style="text-align: center; margin-bottom: 24px;">
            <a href="${apkDownloadUrl}" style="display: inline-block; background: ${themeBorderColor}; color: ${isPro ? '#FFFFFF' : '#000000'}; font-weight: 800; font-size: 16px; padding: 14px 36px; border-radius: 30px; text-decoration: none; box-shadow: 0 6px 20px ${isPro ? 'rgba(168,85,247,0.35)' : 'rgba(0,230,118,0.3)'};">
                📥 Download ${isPro ? 'Pro APK' : 'Android App (.APK)'}
            </a>
            <div style="font-size: 12px; color: #949BAE; margin-top: 8px;">Direct Link: <a href="${apkDownloadUrl}" style="color:${themeTextColor};">${apkDownloadUrl}</a></div>
        </div>

        ${isPro ? `
        <!-- n8n Workflow Template Bonus for Pro -->
        <div style="background: linear-gradient(180deg, #181126 0%, #0D1016 100%); border: 1px solid #7928CA; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 14px; font-weight: 800; color: #D8B4FE; margin-bottom: 4px;">⚡ Ready-to-Use n8n Workflow Included</div>
            <div style="font-size: 12px; color: #CBD5E0; margin-bottom: 12px; line-height: 1.4;">
                Import this pre-configured template directly into n8n to connect incoming leads to your carrier SIM with two-way delivery callbacks.
            </div>
            <a href="https://missedcallautosms.com/MissedCallAutoSMS_n8n_Workflow.json" download style="display: inline-block; background: #7928CA; color: #FFFFFF; font-weight: 700; font-size: 13px; padding: 10px 22px; border-radius: 20px; text-decoration: none; box-shadow: 0 4px 14px rgba(121,40,202,0.4);">
                📦 Download n8n Workflow Template (.json)
            </a>
            <div style="font-size: 11px; color: #949BAE; margin-top: 6px;">Direct Link: <a href="https://missedcallautosms.com/MissedCallAutoSMS_n8n_Workflow.json" style="color:#C084FC;">missedcallautosms.com/MissedCallAutoSMS_n8n_Workflow.json</a></div>
        </div>
        ` : ''}

        ${isPro ? `
        <!-- Optional Voice Add-On Upsell for Pro-Only Users -->
        <div style="background: rgba(0, 230, 118, 0.04); border: 1px dashed rgba(0, 230, 118, 0.3); border-radius: 12px; padding: 18px; margin-bottom: 24px; text-align: center;">
            <div style="font-size: 14px; font-weight: 800; color: #00E676; margin-bottom: 4px;">🎙️ Need 24/7 AI Voice Answering?</div>
            <div style="font-size: 12px; color: #CBD5E0; margin-bottom: 12px; line-height: 1.4;">
                As a Pro Gateway licensee, your hardware is pre-cleared for our <strong>Autonomous Front Desk Bundle</strong> ($99/mo with 250 included minutes) or Starter Voice ($29/mo with 45 minutes). Never miss a call when you can't pick up.
            </div>
            <a href="https://missedcallautosms.com/sales_landing_page.html#voice-details" style="display: inline-block; background: rgba(0, 230, 118, 0.15); color: #00E676; border: 1px solid #00E676; font-weight: 700; font-size: 12px; padding: 8px 18px; border-radius: 20px; text-decoration: none;">
                Learn More & Activate Voice Add-on →
            </a>
        </div>
        ` : ''}

        <!-- 3-Step Quick Start -->
        <div style="border-top: 1px solid #222836; padding-top: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 12px 0;">🚀 3-Step Instant Activation</h3>
            <ol style="color: #CBD5E0; font-size: 14px; padding-left: 20px; line-height: 1.8;">
                <li><strong>Download and install</strong> the APK file on your Android business phone.</li>
                <li>Open the app and <strong>paste your License Key</strong> above.</li>
                <li>${isPro ? 'Configure your <strong>preferred Dual SIM slot</strong> and link your <strong>n8n/Make webhook URL</strong>.' : 'Grant standard SMS and Call Log permissions, then <strong>Toggle Master Appliance ON</strong>.'}</li>
            </ol>
        </div>

        <div style="background: #0D1117; border: 1px solid #222836; border-radius: 8px; padding: 12px; margin-bottom: 20px; font-size: 11px; color: #949BAE; line-height: 1.5; text-align: center;">
            🛡️ <strong>Carrier Velocity Notice:</strong> Designed for high-velocity 1-to-1 conversational triggers (new lead alerts, appointment reminders, quote replies), not bulk mass spamming. Built-in SIM Burn Safeguard™ automatically paces outbound queues to protect your line.
        </div>

        <div style="border-top: 1px solid #222836; padding-top: 18px; text-align: center; font-size: 12px; color: #718096;">
            Need help or device transfer? Visit <a href="https://missedcallautosms.com/license_dashboard.html" style="color: ${themeTextColor};">Customer License Portal</a> or reply directly to this email.
        </div>
    </div>
</body>
</html>`;
}

function generateComboEmailHtml(customerName, licenseKey, apkDownloadUrl, amountPaid, isPro = false, forwardingNumber = '+1 (732) 660-9121', carrierCode = '*717326609121') {
  const brandTitle = isPro ? "Missed Call Auto SMS • Pro Gateway + AI Voice" : "Missed Call Auto SMS • Flagship + AI Voice";
  const badgeText = isPro ? "PRO AUTOMATION GATEWAY + 24/7 AI VOICE RECEPTIONIST" : "FOUNDER'S FLAGSHIP + 24/7 AI VOICE RECEPTIONIST";
  const themeBorderColor = "#00E676";
  const themeTextColor = "#00E676";
  const editionSummary = isPro
    ? "Lifetime Pro Gateway • 1-Year Cloud Relay API Included • 24/7 AI Voice Add-On Active • Dual SIM • 100% A2P Exempt"
    : "Founder's Lifetime License • 1 Android Phone Bound • 24/7 AI Voice Add-On Active • 100% A2P Exempt";

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your ${brandTitle} Setup Guide</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 600px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 44px; margin-bottom: 8px;">${isPro ? '⚡🎙️' : '📱🎙️'}</div>
            <h1 style="color: ${themeTextColor}; margin: 0; font-size: 24px; font-weight: 900;">${brandTitle}</h1>
            <div style="display: inline-block; margin-top: 6px; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; background: ${themeBorderColor}22; color: ${themeTextColor}; border: 1px solid ${themeBorderColor}44;">
                ${badgeText}
            </div>
        </div>

        <div style="background: #1A202C; border-left: 4px solid ${themeBorderColor}; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Thank you, ${customerName}!</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                Your payment of <strong>$${amountPaid}</strong> was successful. Your ${isPro ? 'Pro Gateway' : "Founder's Flagship"} license key and 24/7 AI Voice Receptionist are activated with <strong>15 FREE starter minutes</strong>.
            </p>
        </div>

        <!-- License Key Box -->
        <div style="background: #090B0E; border: 1px dashed ${themeBorderColor}; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 8px;">Your Hardware License Key</div>
            <div style="font-family: monospace; font-size: 22px; color: ${themeTextColor}; font-weight: bold; word-break: break-all; letter-spacing: 1px; margin-bottom: 8px;">
                ${licenseKey}
            </div>
            <div style="font-size: 12px; color: #A0AEC0;">${editionSummary}</div>
        </div>

        <!-- AI Voice Receptionist Add-On Highlight -->
        <div style="background: linear-gradient(180deg, rgba(0,230,118,0.12) 0%, rgba(9,11,14,0.9) 100%); border: 1px solid #00E676; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <div style="font-size: 14px; font-weight: 800; color: #00E676; margin-bottom: 6px;">🎙️ 24/7 AI Voice Receptionist Live</div>
            <div style="font-family: monospace; font-size: 22px; color: #38BDF8; font-weight: bold; margin: 8px 0;">${forwardingNumber}</div>
            <div style="background: #090B0E; border: 1px dashed #00E676; border-radius: 8px; padding: 12px; font-size: 12px; color: #A7F3D0; margin-top: 10px;">
                🎁 <strong>15 Free Minutes Ready to Answer:</strong> Your dedicated AI assistant is live right now with 15 free starter minutes.
            </div>
        </div>

        <!-- 1-Step Carrier Forwarding (*71) -->
        <div style="background: rgba(0, 230, 118, 0.06); border: 1px solid rgba(0, 230, 118, 0.3); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 10px 0;">📲 1-Tap Carrier Forwarding (*71)</h3>
            <p style="color: #CBD5E0; font-size: 13px; line-height: 1.5; margin: 0 0 12px 0;">
                Open your mobile phone's dialer, dial this code once, and press <strong>Call</strong> to route missed calls to your AI receptionist:
            </p>
            <div style="background: #090B0E; padding: 12px; border-radius: 8px; border: 1px solid #222836; text-align: center; font-family: monospace; font-size: 20px; color: #00E676; font-weight: bold; margin-bottom: 12px;">
                ${carrierCode}
            </div>
            <p style="color: #949BAE; font-size: 12px; margin: 0; line-height: 1.4;">
                💡 Unconditional ringing (15s) before transfer. Revert anytime by dialing <code>*73</code>.
            </p>
        </div>

        <!-- APK Download Button -->
        <div style="text-align: center; margin-bottom: 24px;">
            <a href="${apkDownloadUrl}" style="display: inline-block; background: ${themeBorderColor}; color: #000000; font-weight: 800; font-size: 16px; padding: 14px 36px; border-radius: 30px; text-decoration: none; box-shadow: 0 6px 20px rgba(0,230,118,0.3);">
                📥 Download Android App (.APK)
            </a>
            <div style="font-size: 12px; color: #949BAE; margin-top: 8px;">Direct Link: <a href="${apkDownloadUrl}" style="color:${themeTextColor};">${apkDownloadUrl}</a></div>
        </div>

        <!-- 3-Step Quick Start -->
        <div style="border-top: 1px solid #222836; padding-top: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 12px 0;">🚀 3-Step Instant Activation</h3>
            <ol style="color: #CBD5E0; font-size: 14px; padding-left: 20px; line-height: 1.8;">
                <li><strong>Download and install</strong> the APK on your Android business phone.</li>
                <li>Open the app and <strong>paste your License Key</strong> above.</li>
                <li>Grant standard SMS and Call Log permissions, then <strong>Toggle Master Appliance ON</strong>. Customize your greeting anytime under AI Voice Receptionist.</li>
            </ol>
        </div>

        <div style="border-top: 1px solid #222836; padding-top: 18px; text-align: center; font-size: 12px; color: #718096;">
            Need help or device transfer? Visit <a href="https://missedcallautosms.com/license_dashboard.html" style="color: ${themeTextColor};">Customer License Portal</a> or reply directly to this email.
        </div>
    </div>
</body>
</html>`;
}

function generateProPlusVoiceEmailHtml(customerName, licenseKey, apkDownloadUrl, forwardingNumber, carrierCode, carrierDeactivateCode, quotaMinutes = 250, tierTitle = "AUTONOMOUS FRONT DESK BUNDLE ($99/MO)", overageRate = "0.20") {
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your ${tierTitle} Setup Guide</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 620px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 44px; margin-bottom: 8px;">⚡🎙️</div>
            <h1 style="color: #A855F7; margin: 0; font-size: 24px; font-weight: 900;">Missed Call Auto SMS</h1>
            <div style="display: inline-block; margin-top: 6px; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; background: rgba(168,85,247,0.15); color: #C084FC; border: 1px solid rgba(168,85,247,0.35);">
                ${tierTitle}
            </div>
        </div>

        <div style="background: #1A202C; border-left: 4px solid #A855F7; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Welcome, ${customerName}!</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                Your <strong>${tierTitle}</strong> is active! Your hardware appliance license and dedicated inbound AI receptionist line are provisioned below with <strong>${quotaMinutes} monthly minutes</strong> included (additional usage at $${overageRate}/min).
            </p>
        </div>

        <!-- License Key Box -->
        <div style="background: #090B0E; border: 1px dashed #A855F7; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 6px;">Your Pro Hardware License Key</div>
            <div style="font-family: monospace; font-size: 22px; color: #C084FC; font-weight: bold; word-break: break-all; letter-spacing: 1px; margin-bottom: 6px;">
                ${licenseKey}
            </div>
            <div style="font-size: 12px; color: #A0AEC0;">Pro Appliance Gateway • Dual SIM Routing • Unlimited Native SMS</div>
        </div>

        <!-- Assigned AI Line Box -->
        <div style="background: #090B0E; border: 1px dashed #00E676; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 6px;">Your Dedicated Inbound AI Line</div>
            <div style="font-family: monospace; font-size: 24px; color: #38BDF8; font-weight: bold; letter-spacing: 1px; margin-bottom: 6px;">
                ${forwardingNumber}
            </div>
            <div style="font-size: 12px; color: #00E676;">🟢 Status: ACTIVE • ${quotaMinutes} Monthly Minutes Included ($${overageRate}/min overage)</div>
        </div>

        <!-- Carrier Forwarding Step -->
        <div style="background: rgba(0, 230, 118, 0.06); border: 1px solid rgba(0, 230, 118, 0.3); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 10px 0;">📲 1-Tap Carrier Forwarding (*71)</h3>
            <p style="color: #CBD5E0; font-size: 13px; line-height: 1.5; margin: 0 0 12px 0;">
                Open your phone dialer, call this code once, and your carrier will automatically route unanswered calls to your AI receptionist:
            </p>
            <div style="background: #090B0E; padding: 12px; border-radius: 8px; border: 1px solid #222836; text-align: center; font-family: monospace; font-size: 20px; color: #00E676; font-weight: bold; margin-bottom: 12px;">
                ${carrierCode}
            </div>
            <p style="color: #949BAE; font-size: 12px; margin: 0; line-height: 1.4;">
                💡 Unconditional ringing (15s) before transfer. Revert anytime by dialing <code>${carrierDeactivateCode || '*73'}</code>.
            </p>
        </div>

        <!-- Pro APK Download -->
        <div style="text-align: center; margin-bottom: 24px;">
            <a href="${apkDownloadUrl}" style="display: inline-block; background: #A855F7; color: #FFFFFF; font-weight: 800; font-size: 16px; padding: 14px 36px; border-radius: 30px; text-decoration: none; box-shadow: 0 6px 20px rgba(168,85,247,0.35);">
                📥 Download Pro Android App (.APK)
            </a>
            <div style="font-size: 12px; color: #949BAE; margin-top: 8px;">Direct Link: <a href="${apkDownloadUrl}" style="color:#C084FC;">${apkDownloadUrl}</a></div>
        </div>

        <!-- n8n Workflow Template Bonus for Pro -->
        <div style="background: linear-gradient(180deg, #181126 0%, #0D1016 100%); border: 1px solid #7928CA; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 14px; font-weight: 800; color: #D8B4FE; margin-bottom: 4px;">⚡ Ready-to-Use n8n Workflow Included</div>
            <div style="font-size: 12px; color: #CBD5E0; margin-bottom: 12px; line-height: 1.4;">
                Connect incoming leads to your carrier SIM with two-way webhook delivery callbacks.
            </div>
            <a href="https://missedcallautosms.com/MissedCallAutoSMS_n8n_Workflow.json" download style="display: inline-block; background: #7928CA; color: #FFFFFF; font-weight: 700; font-size: 13px; padding: 10px 22px; border-radius: 20px; text-decoration: none; box-shadow: 0 4px 14px rgba(121,40,202,0.4);">
                📦 Download n8n Workflow Template (.json)
            </a>
        </div>

        <div style="border-top: 1px solid #222836; padding-top: 18px; text-align: center; font-size: 12px; color: #718096;">
            Need help? Reply directly to this email or visit our <a href="https://missedcallautosms.com/owner_admin_dashboard.html" style="color: #A855F7;">Owner Portal</a>.
        </div>
    </div>
</body>
</html>`;
}

function generateAgencyKey(agencyName, quota = 5) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadStr = `${agencyName || 'Agency Partner'}|${quota}|${timestamp}`;
  const payloadHex = Buffer.from(payloadStr, 'utf-8').toString('hex').toUpperCase();

  const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
  hmac.update(payloadHex);
  const sigShort = hmac.digest('hex').substring(0, 8).toUpperCase();

  return `MCAS-AGENCY-${quota}-${payloadHex}-${sigShort}`;
}

function generateAgencyEmailHtml(agencyName, masterAgencyKey, quota, amountPaid, dashboardUrl) {
  const is10 = quota >= 10;
  const planTitle = is10 ? "Agency 10-Pack Fleet Bundle" : "Agency 5-Pack Fleet Bundle";
  const badgeText = is10 ? "AGENCY 10-PACK • 10 CLIENT APPLIANCES" : "AGENCY 5-PACK • 5 CLIENT APPLIANCES";
  const themeBorderColor = "#38BDF8";
  const themeTextColor = "#38BDF8";

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Welcome to Missed Call Auto SMS Agency Fleet</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 640px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 44px; margin-bottom: 8px;">🏢</div>
            <h1 style="color: ${themeTextColor}; margin: 0; font-size: 24px; font-weight: 900;">${planTitle}</h1>
            <div style="display: inline-block; margin-top: 6px; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; background: rgba(56, 189, 248, 0.15); color: ${themeTextColor}; border: 1px solid rgba(56, 189, 248, 0.35);">
                ${badgeText}
            </div>
        </div>

        <div style="background: #1A202C; border-left: 4px solid ${themeBorderColor}; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Welcome, ${agencyName}!</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                Your Agency Fleet bundle ($${amountPaid}) has been activated. You can now deploy up to <strong>${quota} dedicated Android SMS appliances</strong> for your local business clients with 100% A2P 10DLC exemption.
            </p>
        </div>

        <!-- Master Agency Key Box -->
        <div style="background: #090B0E; border: 1px dashed ${themeBorderColor}; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 8px;">Your Master Agency Fleet Key</div>
            <div style="font-family: monospace; font-size: 20px; color: ${themeTextColor}; font-weight: bold; word-break: break-all; letter-spacing: 1px; margin-bottom: 8px;">
                ${masterAgencyKey}
            </div>
            <div style="font-size: 12px; color: #A0AEC0;">Authorized for ${quota} Client Appliance Deployments • Lifetime Access</div>
        </div>

        <!-- Agency Dashboard CTA -->
        <div style="text-align: center; margin-bottom: 28px;">
            <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #0284C7, #0EA5E9); color: #FFFFFF; font-weight: 800; font-size: 16px; padding: 14px 36px; border-radius: 30px; text-decoration: none; box-shadow: 0 6px 20px rgba(14, 165, 233, 0.35);">
                🚀 Open Agency Fleet Dashboard →
            </a>
            <div style="font-size: 12px; color: #949BAE; margin-top: 8px;">Direct Portal URL: <a href="${dashboardUrl}" style="color:${themeTextColor};">${dashboardUrl}</a></div>
        </div>

        <!-- Agency 4-Step Playbook -->
        <div style="border-top: 1px solid #222836; padding-top: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 12px 0;">📋 Agency Deployment Playbook</h3>
            <ol style="color: #CBD5E0; font-size: 14px; padding-left: 20px; line-height: 1.8;">
                <li><strong>Log into your Fleet Dashboard:</strong> Enter your Master Key above to view and manage your ${quota} appliance seats.</li>
                <li><strong>Deploy a Client Key:</strong> Click "Deploy New Appliance", enter your client's business name (e.g. <em>Joe's Plumbing</em>), and copy their dedicated setup sheet.</li>
                <li><strong>Install on Office Phone:</strong> Sideload the Pro APK on an office phone with a $10/mo SIM. Toggle Master Appliance ON.</li>
                <li><strong>Connect CRM / n8n:</strong> Hook your client's missed calls directly to GoHighLevel or n8n without filing a single A2P form.</li>
            </ol>
        </div>

        <div style="border-top: 1px solid #222836; padding-top: 18px; text-align: center; font-size: 12px; color: #718096;">
            Need assistance or priority agency support? Visit <a href="https://missedcallautosms.com/support" style="color: ${themeTextColor};">Agency Helpdesk</a> or reply directly to this email.
        </div>
    </div>
</body>
</html>`;
}

function generateTrialEmailHtml(customerName, licenseKey, apkDownloadUrl) {
  const brandTitle = "Missed Call Auto SMS • 3-Day Free Trial";
  const badgeText = "3-DAY FREE TRIAL ($0.00 CHARGED TODAY)";
  const themeBorderColor = "#FFB300";
  const themeTextColor = "#FFB300";
  const editionSummary = "3-Day Full-Access Free Trial • Standard Edition • 100% A2P 10DLC Exempt";

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your Missed Call Auto SMS Free Trial Key & Setup Guide</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 600px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 44px; margin-bottom: 8px;">🎁</div>
            <h1 style="color: ${themeTextColor}; margin: 0; font-size: 24px; font-weight: 900;">${brandTitle}</h1>
            <div style="display: inline-block; margin-top: 6px; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; background: ${themeBorderColor}22; color: ${themeTextColor}; border: 1px solid ${themeBorderColor}44;">
                ${badgeText}
            </div>
        </div>

        <div style="background: #1A202C; border-left: 4px solid ${themeBorderColor}; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Welcome, ${customerName}!</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                Your <strong>3-Day Free Trial</strong> has started. You were charged <strong>$0.00 today</strong>. Your trial activation key is ready to activate on your Android business phone.
            </p>
        </div>

        <!-- License Key Box -->
        <div style="background: #090B0E; border: 1px dashed ${themeBorderColor}; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 8px;">Your 3-Day Trial License Key</div>
            <div style="font-family: monospace; font-size: 22px; color: ${themeTextColor}; font-weight: bold; word-break: break-all; letter-spacing: 1px; margin-bottom: 8px;">
                ${licenseKey}
            </div>
            <div style="font-size: 12px; color: #A0AEC0;">${editionSummary}</div>
        </div>

        <!-- APK Download Button -->
        <div style="text-align: center; margin-bottom: 24px;">
            <a href="${apkDownloadUrl}" style="display: inline-block; background: ${themeBorderColor}; color: #000000; font-weight: 800; font-size: 16px; padding: 14px 36px; border-radius: 30px; text-decoration: none; box-shadow: 0 6px 20px rgba(255,179,0,0.3);">
                📥 Download Android App (.APK)
            </a>
            <div style="font-size: 12px; color: #949BAE; margin-top: 8px;">Direct Link: <a href="${apkDownloadUrl}" style="color:${themeTextColor};">${apkDownloadUrl}</a></div>
        </div>

        <!-- 3-Step Quick Start -->
        <div style="border-top: 1px solid #222836; padding-top: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 12px 0;">🚀 3-Step Instant Activation</h3>
            <ol style="color: #CBD5E0; font-size: 14px; padding-left: 20px; line-height: 1.8;">
                <li><strong>Download and install</strong> the APK file on your Android business phone.</li>
                <li>Open the app and <strong>paste your Trial License Key</strong> above.</li>
                <li>Grant standard SMS and Call Log permissions, then <strong>Toggle Master Appliance ON</strong>.</li>
            </ol>
        </div>

        <div style="background: rgba(255, 179, 0, 0.08); border: 1px solid rgba(255, 179, 0, 0.25); border-radius: 8px; padding: 14px; margin-bottom: 20px; font-size: 12px; color: #E2E8F0; line-height: 1.5;">
            ⏰ <strong>Trial & Renewal Terms:</strong> You have 3 full days of unrestricted access. After 3 days, your card on file will be charged $49.99 for your permanent lifetime license unless you cancel beforehand. You can cancel anytime in 1 click at <a href="https://missedcallautosms.com/cancel_trial.html" style="color: ${themeTextColor};">missedcallautosms.com/cancel_trial.html</a> or through our 24/7 AI Voice Assistant.
        </div>

        <div style="border-top: 1px solid #222836; padding-top: 18px; text-align: center; font-size: 12px; color: #718096;">
            Need help or device transfer? Visit <a href="https://missedcallautosms.com/license_dashboard.html" style="color: ${themeTextColor};">Customer License Portal</a> or reply directly to this email.
        </div>
    </div>
</body>
</html>`;
}

function generateVoiceProEmailHtml(customerName, licenseKey, forwardingNumber, carrierCode, carrierDeactivateCode, planTitle = "STARTER AI VOICE RECEPTIONIST ($29/MO)", quotaMinutes = 45, overageRate = "0.25") {

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your ${planTitle} is Live</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 620px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 46px; margin-bottom: 8px;">🎙️</div>
            <h1 style="color: #00E676; margin: 0; font-size: 24px; font-weight: 900;">Missed Call Auto SMS</h1>
            <div style="display: inline-block; margin-top: 6px; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; background: rgba(0, 230, 118, 0.15); color: #00E676; border: 1px solid rgba(0, 230, 118, 0.35);">
                ${planTitle.toUpperCase()}
            </div>
        </div>

        <div style="background: #1A202C; border-left: 4px solid #00E676; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Welcome, ${customerName}!</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                Your ${planTitle} subscription is active! Your dedicated local AI line is provisioned, loaded with <strong>${quotaMinutes} included minutes</strong> (additional usage at $${overageRate}/min), and ready to answer your calls.
            </p>
        </div>

        <!-- Assigned Line Card -->
        <div style="background: #090B0E; border: 1px dashed #00E676; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 6px;">Your Dedicated Inbound AI Line</div>
            <div style="font-family: monospace; font-size: 24px; color: #38BDF8; font-weight: bold; letter-spacing: 1px; margin-bottom: 6px;">
                ${forwardingNumber}
            </div>
            <div style="font-size: 12px; color: #00E676;">🟢 Status: ACTIVE • ${quotaMinutes} Monthly Minutes Included ($${overageRate}/min overage)</div>
        </div>

        <!-- 1-Touch Carrier Activation -->
        <div style="background: rgba(0, 230, 118, 0.06); border: 1px solid rgba(0, 230, 118, 0.3); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 10px 0;">📲 1-Step Carrier Activation (*71)</h3>
            <p style="color: #CBD5E0; font-size: 13px; line-height: 1.5; margin: 0 0 12px 0;">
                Open your mobile phone's dialer app, type this exact code, and press <strong>Call / Send</strong>:
            </p>
            <div style="background: #090B0E; padding: 12px; border-radius: 8px; border: 1px solid #222836; text-align: center; font-family: monospace; font-size: 20px; color: #00E676; font-weight: bold; margin-bottom: 12px;">
                ${carrierCode}
            </div>
            <p style="color: #949BAE; font-size: 12px; margin: 0; line-height: 1.4;">
                💡 Whenever you are busy and your phone rings for 15 seconds without answer, your carrier automatically routes the call to your AI assistant. Deactivate anytime by dialing <code>${carrierDeactivateCode || '*73'}</code>.
            </p>
        </div>

        <!-- Post-Call SMS & Portal -->
        <div style="border-top: 1px solid #222836; padding-top: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 15px; margin: 0 0 10px 0;">⚡ Post-Call Authentic SIM SMS</h3>
            <p style="color: #CBD5E0; font-size: 13px; line-height: 1.5; margin: 0 0 12px 0;">
                The second your AI assistant finishes a call, your phone fires an authentic text from your real carrier SIM.
            </p>
            <div style="background: #090B0E; padding: 12px; border-radius: 8px; border: 1px solid #222836; font-size: 12px; color: #CBD5E0;">
                <strong>License Key:</strong> <code style="color:#00E676;">${licenseKey}</code><br>
                <strong>Admin Portal:</strong> <a href="https://missedcallautosms.com/owner_admin_dashboard.html" style="color: #38BDF8;">missedcallautosms.com/owner_admin_dashboard.html</a>
            </div>
        </div>
    </div>
</body>
</html>`;
}

function generateVoiceUnlockEmailHtml(customerName, licenseKey, voiceSubWaived = false) {
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your 24/7 AI Voice Receptionist Engine is Unlocked</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 620px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 46px; margin-bottom: 8px;">🎙️⚡</div>
            <h1 style="color: #A855F7; margin: 0; font-size: 24px; font-weight: 900;">Missed Call Auto SMS</h1>
            <div style="display: inline-block; margin-top: 6px; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; background: rgba(168, 85, 247, 0.15); color: #C084FC; border: 1px solid rgba(168, 85, 247, 0.35);">
                ${voiceSubWaived ? 'AI VOICE PLATFORM COMP WAIVED ($0.00)' : 'AI VOICE PLATFORM ACCESS ($9.99/MO)'}
            </div>
        </div>

        <div style="background: #1A202C; border-left: 4px solid #A855F7; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Welcome, ${customerName}!</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                Your 24/7 AI Voice Receptionist platform feature is unlocked and active on your license key <strong>${licenseKey}</strong>. You can now configure your AI business instructions, triage flows, and emergency rules directly inside the Android app.
            </p>
        </div>

        <!-- Activation Card: Next Step -->
        <div style="background: #090B0E; border: 1px dashed #F59E0B; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 13px; color: #FBBF24; text-transform: uppercase; font-weight: bold; margin-bottom: 8px;">⚡ Final Step: Activate Your Dedicated Carrier Line</div>
            <p style="font-size: 14px; color: #CBD5E0; line-height: 1.6; margin: 0 0 16px 0;">
                To instantly allocate your dedicated local phone number and generate your <strong>*71</strong> carrier conditional forwarding code, load your first <strong>$10 Credit Pack (40 minutes at $0.25/min)</strong>.
            </p>
            <a href="https://buy.stripe.com/5kA8wPfRY0PS6M014f" style="display: inline-block; background: #F59E0B; color: #000000; font-weight: 900; font-size: 15px; padding: 14px 32px; border-radius: 30px; text-decoration: none; box-shadow: 0 6px 20px rgba(245, 158, 11, 0.35);">
                💳 Load $10 Voice Credit Pack (40 Mins) →
            </a>
            <div style="font-size: 11px; color: #949BAE; margin-top: 10px;">
                Zero monthly call minimums. Credits never expire. Unused minutes roll over automatically.
            </div>
        </div>

        <div style="border-top: 1px solid #222836; padding-top: 18px; text-align: center; font-size: 12px; color: #718096;">
            Missed Call Auto SMS • Need assistance? Reply directly to this email or visit <a href="https://missedcallautosms.com" style="color: #A855F7;">missedcallautosms.com</a>
        </div>
    </div>
</body>
</html>`;
}

function generateVoiceAddonEmailHtml(customerName, licenseKey, forwardingNumber, carrierCode, carrierDeactivateCode, freeMinutes = 15, ratePerMin = "0.25") {
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your AI Voice Receptionist Add-On is Live</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 620px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 46px; margin-bottom: 8px;">🎙️</div>
            <h1 style="color: #00E676; margin: 0; font-size: 24px; font-weight: 900;">Missed Call Auto SMS</h1>
            <div style="display: inline-block; margin-top: 6px; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; background: rgba(0, 230, 118, 0.15); color: #00E676; border: 1px solid rgba(0, 230, 118, 0.35);">
                AI VOICE RECEPTIONIST ADD-ON ($9.99/MO)
            </div>
        </div>

        <div style="background: #1A202C; border-left: 4px solid #00E676; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Welcome, ${customerName}!</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                Your <strong>AI Voice Receptionist Add-On</strong> is active! Your dedicated local AI line has been provisioned and loaded with <strong>${freeMinutes} FREE test minutes</strong>.
            </p>
        </div>

        <!-- Assigned Line Card -->
        <div style="background: #090B0E; border: 1px dashed #00E676; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 6px;">Your Dedicated Inbound AI Line</div>
            <div style="font-family: monospace; font-size: 24px; color: #38BDF8; font-weight: bold; letter-spacing: 1px; margin-bottom: 6px;">
                ${forwardingNumber}
            </div>
            <div style="font-size: 12px; color: #00E676;">🟢 Status: ACTIVE • ${freeMinutes} Free Test Minutes Included • $${ratePerMin}/min Usage</div>
        </div>

        <!-- 1-Step Carrier Activation (*71) -->
        <div style="background: rgba(0, 230, 118, 0.06); border: 1px solid rgba(0, 230, 118, 0.3); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 10px 0;">📲 1-Step Carrier Forwarding (*71)</h3>
            <p style="color: #CBD5E0; font-size: 13px; line-height: 1.5; margin: 0 0 12px 0;">
                Open your phone dialer, call this code once, and your carrier will automatically route unanswered calls to your AI receptionist:
            </p>
            <div style="background: #090B0E; padding: 12px; border-radius: 8px; border: 1px solid #222836; text-align: center; font-family: monospace; font-size: 20px; color: #00E676; font-weight: bold; margin-bottom: 12px;">
                ${carrierCode}
            </div>
            <p style="color: #949BAE; font-size: 12px; margin: 0; line-height: 1.4;">
                💡 Unconditional ringing (15s) before transfer. Revert anytime by dialing <code>${carrierDeactivateCode || '*73'}</code>.
            </p>
        </div>

        <!-- Metered Telephony Usage Explanation -->
        <div style="background: #0D1117; border: 1px solid #222836; border-radius: 8px; padding: 14px; margin-bottom: 20px; font-size: 12px; color: #CBD5E0; line-height: 1.5;">
            💳 <strong>Transparent Usage Billing:</strong> Usage is billed at flat <strong>$${ratePerMin}/minute</strong> in automatic $10 reload packs (40 minutes). You can toggle auto-recharge ON/OFF anytime in your app or portal. If credits reach zero with auto-reload disabled, the AI voice agent safely pauses while your native SIM missed-call SMS remains 100% active.
        </div>

        <div style="border-top: 1px solid #222836; padding-top: 18px; text-align: center; font-size: 12px; color: #718096;">
            Need help? Reply directly to this email or visit our <a href="https://missedcallautosms.com/owner_admin_dashboard.html" style="color: #00E676;">Owner Portal</a>.
        </div>
    </div>
</body>
</html>`;
}

function generateCreditPackEmailHtml(customerName, minutesAdded = 40, packAmount = "10.00") {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>AI Voice Minutes Loaded</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 600px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px; text-align: center;">
        <div style="font-size: 44px; margin-bottom: 8px;">⚡🎙️</div>
        <h1 style="color: #00E676; margin: 0 0 10px 0; font-size: 24px; font-weight: 900;">+${minutesAdded} AI Minutes Added!</h1>
        <p style="color: #CBD5E0; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">
            Hi ${customerName}, your payment of <strong>$${packAmount}</strong> was successful. We've added <strong>${minutesAdded} minutes</strong> to your AI Voice Receptionist balance.
        </p>
        <div style="background: #090B0E; border: 1px dashed #00E676; border-radius: 12px; padding: 18px; margin-bottom: 24px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase;">Status</div>
            <div style="font-size: 18px; color: #00E676; font-weight: bold; margin-top: 4px;">🟢 AI Voice Receptionist ACTIVE</div>
        </div>
        <div style="font-size: 12px; color: #718096;">
            Missed Call Auto SMS • <a href="https://missedcallautosms.com/owner_admin_dashboard.html" style="color: #00E676;">Owner Portal</a>
        </div>
    </div>
</body>
</html>`;
}

function stripeApiRequest(endpoint, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.stripe.com',
      port: 443,
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error ? parsed.error.message : body));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function sendEmail(apiKey, toEmail, subject, htmlContent) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      from: FROM_EMAIL,
      to: [toEmail],
      subject: subject,
      html: htmlContent
    });

    const options = {
      hostname: 'api.resend.com',
      port: 443,
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.message || body));
          }
        } catch (e) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function provisionVapiForSubscriber(customerName, businessName = '') {
  const vapiApiKey = process.env.VAPI_PRIVATE_API_KEY;
  const defaultNumber = process.env.VAPI_PRIMARY_PHONE_NUMBER || '+1 (732) 660-9121';
  const defaultAsst = process.env.VAPI_ASSISTANT_ID || '5105b379-8cbf-4037-becc-bba45504f781';

  if (!vapiApiKey) {
    console.warn('[stripe-webhook] VAPI_PRIVATE_API_KEY not configured. Falling back to default line.');
    return {
      assistantId: defaultAsst,
      phoneNumberId: null,
      forwardingNumber: defaultNumber
    };
  }

  try {
    // 1. Create dedicated assistant for this subscriber
    const asstPayload = {
      name: `${customerName || 'Contractor'} (AI Receptionist)`,
      firstMessage: `Thanks for calling ${businessName || customerName || 'us'}! How can I help you today?`,
      model: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `You are Riley, a friendly and professional AI receptionist for ${businessName || customerName || 'our business'}. Warmly greet callers, answer questions, capture their name and service details, and confirm that someone will follow up promptly.`
          }
        ]
      },
      voice: {
        provider: '11labs',
        voiceId: '21m00Tcm4TlvDq8ikWAM'
      },
      serverUrl: 'https://missedcallautosms.com/api/vapi/webhook'
    };

    const asstRes = await new Promise((resolve) => {
      const data = JSON.stringify(asstPayload);
      const req = https.request({
        hostname: 'api.vapi.ai',
        port: 443,
        path: '/assistant',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vapiApiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }, res => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => {
          try { resolve(JSON.parse(b)); } catch (e) { resolve(null); }
        });
      });
      req.on('error', (err) => {
        console.warn('[stripe-webhook] Vapi assistant creation error:', err.message);
        resolve(null);
      });
      req.write(data);
      req.end();
    });

    const newAssistantId = asstRes?.id || defaultAsst;

    // 2. Provision dedicated phone number if available
    let newPhoneNumber = null;
    let newPhoneId = null;

    if (newAssistantId) {
      try {
        const phoneBuyRes = await new Promise((resolve) => {
          const postData = JSON.stringify({ assistantId: newAssistantId });
          const req = https.request({
            hostname: 'api.vapi.ai',
            port: 443,
            path: '/phone-number/buy',
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${vapiApiKey}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            }
          }, res => {
            let b = '';
            res.on('data', c => b += c);
            res.on('end', () => {
              try { resolve(JSON.parse(b)); } catch (e) { resolve(null); }
            });
          });
          req.on('error', () => resolve(null));
          req.write(postData);
          req.end();
        });

        if (phoneBuyRes?.number) {
          newPhoneNumber = phoneBuyRes.number;
          newPhoneId = phoneBuyRes.id;
        }
      } catch (pErr) {
        console.warn('[stripe-webhook] Vapi phone provision notice:', pErr.message);
      }
    }

    const finalNumber = newPhoneNumber || defaultNumber;
    console.log(`🎙️ [VAPI PROVISIONED] Assistant: ${newAssistantId}, Phone: ${finalNumber} for ${customerName}`);
    return {
      assistantId: newAssistantId,
      phoneNumberId: newPhoneId,
      forwardingNumber: finalNumber
    };
  } catch (err) {
    console.error('[stripe-webhook] Vapi provisioning error:', err.message);
    return {
      assistantId: defaultAsst,
      phoneNumberId: null,
      forwardingNumber: defaultNumber
    };
  }
}

function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return true; // Skip signature check if secret not set
  try {
    const parts = sigHeader.split(',');
    const timestampPart = parts.find(p => p.startsWith('t='));
    const sigPart = parts.find(p => p.startsWith('v1='));
    if (!timestampPart || !sigPart) return false;

    const timestamp = timestampPart.split('=')[1];
    const signature = sigPart.split('=')[1];
    const signedPayload = `${timestamp}.${payload}`;

    const expectedSig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch (e) {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, stripe-signature'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sigHeader = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  const rawBody = event.body || '';

  if (STRIPE_WEBHOOK_SECRET && !verifyStripeSignature(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET)) {
    console.error('❌ Webhook signature verification failed');
    return { statusCode: 400, body: 'Signature verification failed' };
  }

  let eventObj;
  try {
    eventObj = JSON.parse(rawBody);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON payload' };
  }

  console.log(`⚡ [STRIPE WEBHOOK] Received event: ${eventObj.type}`);

  if (eventObj.type === 'checkout.session.completed' || eventObj.type === 'payment_intent.succeeded') {
    const session = eventObj.data.object;
    const customerDetails = session.customer_details || {};
    const customerEmail = customerDetails.email || session.customer_email || session.receipt_email || (session.metadata && (session.metadata.customer_email || session.metadata.email));
    const customerName = customerDetails.name || session.shipping?.name || (session.metadata && session.metadata.name) || 'Valued Customer';
    const amountTotal = (session.amount_total !== undefined && session.amount_total !== null) ? session.amount_total : (session.amount !== undefined ? session.amount : 0);
    const amountPaid = (amountTotal / 100).toFixed(2);

    if (!customerEmail) {
      console.warn('⚠️ No customer email found in checkout session:', session.id);
      return { statusCode: 200, body: JSON.stringify({ received: true, warning: 'No email found' }) };
    }

    // 0. Voice Credit Pack ($10: 40m, $25: 115m, $50: 250m, $100: 550m)
    const isCreditPack = (
      (amountTotal === 1000) ||
      (amountTotal === 2500) ||
      (amountTotal === 5000) ||
      (amountTotal === 10000) ||
      (session.metadata && (
        session.metadata.tier === 'credit_pack' ||
        session.metadata.tier === 'voice_credits' ||
        session.metadata.service === 'voice_credit_reload'
      ))
    );

    // 1. AI Voice Add-on ($9.99/mo with 15 free test minutes)
    const isVoiceAddon = !isCreditPack && (
      (amountTotal === 999) || (session.metadata && (
        session.metadata.tier === 'voice_addon' ||
        session.metadata.tier === 'voice_999'
      ))
    );

    // 1B. Appliance + AI Voice Combo (Flagship + $9.99/mo Voice Bump or Pro + $9.99/mo Voice Bump)
    const isFlagshipVoiceCombo = !isCreditPack && !isVoiceAddon && (
      (amountTotal === 5998) ||
      (session.metadata && (session.metadata.tier === 'flagship_plus_voice' || (session.metadata.include_voice === 'true' && session.metadata.plan === 'flagship')))
    );

    const isProVoiceCombo = !isCreditPack && !isVoiceAddon && !isFlagshipVoiceCombo && (
      (amountTotal === 30899) || (amountTotal === 30998) || (amountTotal === 25998) ||
      (session.metadata && (session.metadata.tier === 'pro_plus_voice' || session.metadata.tier === 'pro_upgrade_plus_voice' || (session.metadata.include_voice === 'true' && (session.metadata.plan === 'pro' || session.metadata.plan === 'pro_upgrade'))))
    );

    const isApplianceVoiceCombo = isFlagshipVoiceCombo || isProVoiceCombo;

    // 2. Autonomous Front Desk Bundle ($99/mo, or legacy $178.99 bundle)
    const isBundle = !isCreditPack && !isVoiceAddon && !isApplianceVoiceCombo && (
      (session.metadata && (
        session.metadata.tier === 'autonomous_front_desk' ||
        session.metadata.tier === 'front_desk_bundle'
      )) || (amountTotal === 9900) || (amountTotal === 17899)
    );

    // 3. Standalone Managed AI Voice: Business ($89/mo) or Starter ($29/mo)
    const isVoiceBusiness = !isCreditPack && !isVoiceAddon && !isApplianceVoiceCombo && !isBundle && (
      (session.metadata && (session.metadata.tier === 'voice_business' || session.metadata.tier === 'voice_pro_business')) ||
      (amountTotal === 8900)
    );

    const isVoiceStarter = !isCreditPack && !isVoiceAddon && !isApplianceVoiceCombo && !isBundle && !isVoiceBusiness && (
      (session.metadata && (session.metadata.tier === 'voice_starter' || session.metadata.tier === 'managed_voice_pro' || session.metadata.service === 'voice_receptionist')) ||
      (amountTotal === 2900 && (!session.metadata || !session.metadata.tier || !session.metadata.tier.includes('pro')))
    );

    const isVoiceStandalone = isVoiceBusiness || isVoiceStarter;

    // 4. 3-Day Free Trial ($0.00)
    const isTrial = !isCreditPack && !isVoiceAddon && !isApplianceVoiceCombo && !isVoiceStandalone && !isBundle && (
      (amountTotal === 0 && (!session.metadata || (session.metadata.tier !== 'pro_automation' && session.metadata.tier !== 'pro_gateway'))) ||
      (session.metadata && session.metadata.tier === 'standard_trial')
    );

    // 5. Agency Fleet Bundles ($229 for 3-Pack, $349 for 5-Pack, $649 for 10-Pack, $1,249 for 25-Pack)
    const isAgencyMeta = session.metadata && session.metadata.tier && session.metadata.tier.startsWith('agency');
    const isAgency25 = !isCreditPack && !isVoiceAddon && !isApplianceVoiceCombo && !isTrial && !isVoiceStandalone && !isBundle && ((amountTotal === 124900) || (session.metadata && (session.metadata.tier === 'agency_25' || session.metadata.tier === 'agency_enterprise')));
    const isAgency10 = !isCreditPack && !isVoiceAddon && !isApplianceVoiceCombo && !isTrial && !isVoiceStandalone && !isBundle && !isAgency25 && ((amountTotal === 64900) || (session.metadata && session.metadata.tier === 'agency_10'));
    const isAgency5 = !isCreditPack && !isVoiceAddon && !isApplianceVoiceCombo && !isTrial && !isVoiceStandalone && !isBundle && !isAgency25 && !isAgency10 && ((amountTotal === 34900) || (session.metadata && session.metadata.tier === 'agency_5'));
    const isAgency3 = !isCreditPack && !isVoiceAddon && !isApplianceVoiceCombo && !isTrial && !isVoiceStandalone && !isBundle && !isAgency25 && !isAgency10 && !isAgency5 && ((amountTotal === 22900) || (session.metadata && session.metadata.tier === 'agency_3'));
    const isAgency = isAgency3 || isAgency5 || isAgency10 || isAgency25 || (isAgencyMeta && (!session.metadata.tier.startsWith('pro')));

    // 6. Pro Automation Gateway / Pro Upgrade ($249.99 Upgrade, $299.99 Perpetual, or $149.99)
    const isProUpgrade = (amountTotal === 24999) || (session.metadata && (session.metadata.tier === 'pro_upgrade' || session.metadata.tier === 'pro_upgrade_249'));
    const isProGateway = (amountTotal === 29999) || (amountTotal === 29900) || (session.metadata && (session.metadata.tier === 'pro_gateway' || session.metadata.tier === 'pro_automation'));
    const isPro = !isCreditPack && !isVoiceAddon && !isApplianceVoiceCombo && !isTrial && !isVoiceStandalone && !isBundle && !isAgency && (
      isProUpgrade ||
      isProGateway ||
      (amountTotal >= 14900) ||
      (session.metadata && (session.metadata.tier === 'pro' || session.metadata.tier === 'pro_automation' || session.metadata.tier === 'pro_gateway')) ||
      (session.client_reference_id && session.client_reference_id.toLowerCase().includes('pro'))
    );

    const host = (event.headers && event.headers.host) || 'missedcallautosms.com';
    const apkFileName = 'MissedCallAutoSMS.apk';
    const apkDownloadUrl = `https://${host}/${apkFileName}`;

    // === REFERRAL & NET-PROFIT REV-SHARE INGESTION ===
    const refCode = (session.metadata && (session.metadata.referral_code || session.metadata.ref || session.metadata.aff)) ||
                    (session.client_reference_id && !session.client_reference_id.startsWith('MCAS-') && !session.client_reference_id.toLowerCase().includes('pro') ? session.client_reference_id : null);

    // Determine credit pack tier and minutes if applicable
    let creditPackMinutes = 40;
    let creditPackCost = 10.00;
    if (isCreditPack) {
      if (amountTotal === 2500 || (session.metadata && session.metadata.pack_tier === 'pack_25')) {
        creditPackMinutes = 115;
        creditPackCost = 25.00;
      } else if (amountTotal === 5000 || (session.metadata && session.metadata.pack_tier === 'pack_50')) {
        creditPackMinutes = 250;
        creditPackCost = 50.00;
      } else if (amountTotal === 10000 || (session.metadata && session.metadata.pack_tier === 'pack_100')) {
        creditPackMinutes = 550;
        creditPackCost = 100.00;
      } else if (session.metadata && session.metadata.minutes) {
        creditPackMinutes = parseInt(session.metadata.minutes, 10) || 40;
        if (amountTotal > 0) creditPackCost = amountTotal / 100;
      }
    }

    if (refCode && !isTrial) {
      let prodType = 'base_appliance';
      let gross = 49.99;
      if (isCreditPack) { prodType = 'credit_pack'; gross = creditPackCost; }
      else if (isVoiceAddon) { prodType = 'voice_addon'; gross = 9.99; }
      else if (isProUpgrade) { prodType = 'pro_upgrade'; gross = 249.99; }
      else if (isProGateway) { prodType = 'pro_gateway'; gross = 299.99; }
      else if (isVoiceStandalone) { prodType = 'voice_addon'; gross = isVoiceBusiness ? 89.00 : 29.00; }
      else if (isBundle) { prodType = 'pro_gateway'; gross = 99.00; }
      else if (amountTotal > 0) { gross = amountTotal / 100; }

      try {
        const referralsEngine = require('./referrals');
        referralsEngine.addReferralTransaction({
          partnerCode: refCode,
          orderId: session.id,
          customerEmail,
          productType: prodType,
          grossAmount: gross
        });
      } catch (refErr) {
        console.warn('⚠️ [Referrals] Webhook referral logging notice:', refErr.message);
      }
    }

    // === BRANCH 0A: MULTI-TIER VOICE CREDIT PACK (STAGE 2 TELEPHONY ACTIVATION) ===
    if (isCreditPack) {
      console.log(`💳 [STRIPE CREDIT PACK INGESTED] Crediting +${creditPackMinutes} minutes ($${creditPackCost.toFixed(2)}) for ${customerEmail}`);
      const candidateKey = (session.client_reference_id ||
                           (session.metadata && session.metadata.license_key) || '').trim().toUpperCase();
      const db = getFirestore();
      let existing = null;
      if (db && candidateKey) {
        try {
          existing = await db.getVoiceBinding(candidateKey);
        } catch (dbErr) {
          console.warn('[stripe-webhook] Firestore getVoiceBinding notice:', dbErr.message);
        }
      }

      const isFirstTimeProvisioning = !existing || !existing.vapiProvisioned;
      let forwardingNumber = existing?.forwardingNumber || null;
      let carrierCode = existing?.carrierCode || null;
      const carrierDeactivateCode = '*73';
      let vapiAssistantId = existing?.vapiAssistantId || null;
      let vapiPhoneNumberId = existing?.vapiPhoneNumberId || null;

      if (isFirstTimeProvisioning) {
        try {
          const vapiInfo = await provisionVapiForSubscriber(customerName);
          forwardingNumber = vapiInfo.forwardingNumber;
          vapiAssistantId = vapiInfo.assistantId;
          vapiPhoneNumberId = vapiInfo.phoneNumberId;
          const cleanDigits = forwardingNumber.replace(/\D/g, '');
          carrierCode = `*71${cleanDigits.slice(-10)}`;
          console.log(`🎙️ [STAGE 2 PROVISIONING] Dedicated AI voice line ${forwardingNumber} assigned to ${customerEmail}`);
        } catch (vapiErr) {
          console.error('[stripe-webhook] Vapi provisioning error on credit pack:', vapiErr.message);
          forwardingNumber = process.env.VAPI_PRIMARY_PHONE_NUMBER || '+1 (732) 660-9121';
          const cleanDigits = forwardingNumber.replace(/\D/g, '');
          carrierCode = `*71${cleanDigits.slice(-10)}`;
        }
      }

      const currentBal = (existing && typeof existing.voiceMinutesBalance === 'number') ? existing.voiceMinutesBalance : 0;
      const newBal = Math.round(currentBal + creditPackMinutes);
      const targetKey = candidateKey || generateKey(customerName, 0, true);

      if (db) {
        try {
          await db.saveVoiceBinding(targetKey, {
            customerEmail,
            customerName,
            status: 'ACTIVE',
            voiceEntitlement: true,
            voiceSubActive: true,
            vapiProvisioned: true,
            forwardingNumber,
            carrierCode,
            carrierDeactivateCode,
            vapiAssistantId,
            vapiPhoneNumberId,
            voiceMinutesBalance: newBal,
            ratePerMinute: 0.25,
            autoRebillEnabled: false,
            isVoicePaused: false,
            aiSmsActive: true,
            provisionedAt: isFirstTimeProvisioning ? new Date().toISOString() : (existing?.provisionedAt || new Date().toISOString())
          });

          await db.saveMasterLicense({
            key: targetKey,
            customer: customerName,
            email: customerEmail,
            voiceEntitlement: true,
            vapiProvisioned: true,
            voiceActive: true,
            aiSmsActive: true,
            voiceNumber: forwardingNumber,
            carrierCode,
            voiceMinutesBalance: newBal,
            status: 'ACTIVE'
          });

          const vSettings = await db.getVoiceSettings();
          await db.saveVoiceSettings({
            voiceMinutesBalance: newBal,
            forwardingNumber: forwardingNumber || vSettings.forwardingNumber,
            carrierCode: carrierCode || vSettings.carrierCode,
            isVoicePaused: false
          });
        } catch (dbErr) {
          console.error('[stripe-webhook] Firestore credit pack save error:', dbErr.message);
        }
      }

      if (RESEND_API_KEY && customerEmail) {
        if (isFirstTimeProvisioning) {
          const emailSubject = `🎙️ Your Dedicated AI Voice Receptionist Line is Live! Line: ${forwardingNumber}`;
          const emailHtml = generateVoiceAddonEmailHtml(
            customerName,
            targetKey,
            forwardingNumber,
            carrierCode,
            carrierDeactivateCode,
            creditPackMinutes,
            (creditPackCost / creditPackMinutes).toFixed(3)
          );
          sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml).catch(() => {});
        } else {
          const emailSubject = `⚡ +${creditPackMinutes} AI Voice Minutes Added to Your Account ($${creditPackCost.toFixed(2)})`;
          const emailHtml = generateCreditPackEmailHtml(customerName, creditPackMinutes, creditPackCost.toFixed(2));
          sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml).catch(() => {});
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received: true,
          type: 'voice_credit_pack',
          minutesCredited: creditPackMinutes,
          packCost: creditPackCost,
          newBalance: newBal,
          firstTimeProvisioned: isFirstTimeProvisioning,
          forwardingNumber,
          carrierCode,
          customerEmail
        })
      };
    }

    // === BRANCH 0B: $9.99/MO AI VOICE RECEPTIONIST ADD-ON (IMMEDIATE ACTIVATION + 15 FREE MINS) ===
    if (isVoiceAddon) {
      const candidateKey = (session.client_reference_id ||
                           (session.metadata && session.metadata.license_key) || '').trim().toUpperCase();
      const voiceLicenseKey = candidateKey || generateKey(customerName, 0, true);
      const forwardingNumber = process.env.VAPI_PRIMARY_PHONE_NUMBER || '+1 (732) 660-9121';
      const cleanDigits = forwardingNumber.replace(/\D/g, '');
      const carrierCode = `*71${cleanDigits.slice(-10)}`;
      const carrierDeactivateCode = '*73';

      const db = getFirestore();
      if (db) {
        try {
          await db.saveVoiceBinding(voiceLicenseKey, {
            subscriptionId: session.subscription || session.id,
            customerId: session.customer || null,
            stripeCustomerId: session.customer || null,
            customerEmail,
            customerName,
            status: 'ACTIVE',
            tier: 'VOICE_ADDON',
            voiceEntitlement: true,
            voiceSubActive: true,
            voiceSubWaived: false,
            vapiProvisioned: true,
            voiceActive: true,
            aiSmsActive: true,
            forwardingNumber: forwardingNumber,
            carrierCode: carrierCode,
            carrierDeactivateCode: carrierDeactivateCode,
            voiceMinutesBalance: 15.0,
            ratePerMinute: 0.25,
            autoRebillEnabled: false,
            isVoicePaused: false,
            boundAt: new Date().toISOString()
          });

          await db.saveMasterLicense({
            key: voiceLicenseKey,
            customer: customerName,
            email: customerEmail,
            tier: 'VOICE_ADDON',
            type: 'SUBSCRIPTION',
            price: '9.99/mo',
            voiceEntitlement: true,
            voiceSubActive: true,
            voiceSubWaived: false,
            vapiProvisioned: true,
            voiceActive: true,
            aiSmsActive: true,
            voiceNumber: forwardingNumber,
            carrierCode: carrierCode,
            carrierDeactivateCode: carrierDeactivateCode,
            status: 'ACTIVE',
            subscriptionId: session.subscription || session.id,
            voiceMinutesBalance: 15.0,
            ratePerMinute: 0.25,
            isVoicePaused: false,
            date: new Date().toISOString()
          });
        } catch (dbErr) {
          console.error('[stripe-webhook] Firestore voice addon provisioning error:', dbErr.message);
        }
      }

      console.log(`🎙️ [VOICE ADD-ON ACTIVATED] Provisioned line ${forwardingNumber} (*71 code: ${carrierCode}) with 15.0 free starter minutes for ${customerEmail}.`);

      if (RESEND_API_KEY && customerEmail) {
        const emailSubject = `🎙️ Your 24/7 AI Voice Receptionist Line is Live! Line: ${forwardingNumber}`;
        const emailHtml = generateVoiceAddonEmailHtml(
          customerName,
          voiceLicenseKey,
          forwardingNumber,
          carrierCode,
          carrierDeactivateCode,
          15,
          "0.25"
        );

        try {
          await sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml);
          console.log(`📧 [VOICE ACTIVATION EMAIL DELIVERED] Dispatched to ${customerEmail}`);
        } catch (emailErr) {
          console.error(`❌ [VOICE ACTIVATION EMAIL FAILED] for ${customerEmail}:`, emailErr.message);
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received: true,
          tier: 'voice_addon',
          voiceEntitlement: true,
          vapiProvisioned: true,
          voiceMinutesBalance: 15.0,
          forwardingNumber: forwardingNumber,
          carrierCode: carrierCode,
          status: 'ACTIVE',
          licenseKey: voiceLicenseKey,
          customerEmail,
          subscriptionId: session.subscription || session.id
        })
      };
    }

    // === BRANCH 0C: APPLIANCE + AI VOICE COMBO ($49.99 / $299.99 + $9.99/mo - IMMEDIATE ACTIVATION) ===
    if (isApplianceVoiceCombo) {
      const isProCombo = isProVoiceCombo;
      const licenseKey = generateKey(customerName, 0, isProCombo);
      const forwardingNumber = process.env.VAPI_PRIMARY_PHONE_NUMBER || '+1 (732) 660-9121';
      const cleanDigits = forwardingNumber.replace(/\D/g, '');
      const carrierCode = `*71${cleanDigits.slice(-10)}`;
      const carrierDeactivateCode = '*73';

      console.log(`⚡🎙️ [APPLIANCE + VOICE COMBO ACTIVATED] ${isProCombo ? 'PRO' : 'FLAGSHIP'} Key: ${licenseKey} for ${customerEmail} ($${amountPaid})`);

      const db = getFirestore();
      if (db) {
        try {
          // 1. Save master appliance license with voice active and 15 free starter minutes
          await db.saveMasterLicense({
            key: licenseKey,
            customer: customerName,
            email: customerEmail,
            tier: isProCombo ? 'PRO' : 'STANDARD',
            type: 'COMBO_SUBSCRIPTION',
            price: amountPaid,
            voiceEntitlement: true,
            voiceSubActive: true,
            voiceSubWaived: false,
            vapiProvisioned: true,
            voiceActive: true,
            aiSmsActive: true,
            voiceNumber: forwardingNumber,
            carrierCode: carrierCode,
            carrierDeactivateCode: carrierDeactivateCode,
            voiceMinutesBalance: 15.0,
            status: 'ACTIVE',
            subscriptionId: session.subscription || session.id,
            date: new Date().toISOString()
          });

          // 2. Provision Voice Binding with 15 free starter minutes
          await db.saveVoiceBinding(licenseKey, {
            subscriptionId: session.subscription || session.id,
            customerId: session.customer || null,
            stripeCustomerId: session.customer || null,
            customerEmail,
            customerName,
            status: 'ACTIVE',
            tier: 'VOICE_ADDON',
            voiceEntitlement: true,
            voiceSubActive: true,
            voiceSubWaived: false,
            vapiProvisioned: true,
            voiceActive: true,
            aiSmsActive: true,
            forwardingNumber: forwardingNumber,
            carrierCode: carrierCode,
            carrierDeactivateCode: carrierDeactivateCode,
            voiceMinutesBalance: 15.0,
            ratePerMinute: 0.25,
            autoRebillEnabled: false,
            isVoicePaused: false,
            boundAt: new Date().toISOString()
          });
        } catch (dbErr) {
          console.error('[stripe-webhook] Firestore combo save error:', dbErr.message);
        }
      }

      if (RESEND_API_KEY && customerEmail) {
        const emailSubject = isProCombo
          ? `⚡🎙️ Your Missed Call Auto SMS Pro Gateway License Key & AI Voice Setup Guide`
          : `📱🎙️ Your Missed Call Auto SMS Flagship License Key & AI Voice Setup Guide`;
        const emailHtml = generateComboEmailHtml(customerName, licenseKey, apkDownloadUrl, amountPaid, isProCombo, forwardingNumber, carrierCode);

        try {
          await sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml);
          console.log(`📧 [COMBO EMAIL DELIVERED] Dispatched to ${customerEmail}`);
        } catch (emailErr) {
          console.error(`❌ [COMBO EMAIL FAILED] for ${customerEmail}:`, emailErr.message);
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received: true,
          tier: isProCombo ? 'pro_plus_voice' : 'flagship_plus_voice',
          isPro: isProCombo,
          licenseKey: licenseKey,
          voiceUnlocked: true,
          forwardingNumber: forwardingNumber,
          carrierCode: carrierCode,
          voiceMinutesBalance: 15.0,
          amountPaid: amountPaid,
          customerEmail: customerEmail,
          subscriptionId: session.subscription || session.id
        })
      };
    }

    // === BRANCH 1: AUTONOMOUS FRONT DESK BUNDLE ($99/mo - SIM Auto SMS + AI Voice Receptionist, 250 mins) ===
    if (isBundle) {
      // Provision dedicated Vapi AI receptionist assistant & phone line
      const vapiInfo = await provisionVapiForSubscriber(customerName);
      const forwardingNumber = vapiInfo.forwardingNumber;
      const cleanDigits = forwardingNumber.replace(/\D/g, '');
      const carrierCode = `*71${cleanDigits.slice(-10)}`;
      const carrierDeactivateCode = '*73';

      const licenseKey = generateKey(customerName, 0, true);

      // Persist to Firestore
      const db = getFirestore();
      if (db) {
        try {
          await db.saveVoiceBinding(licenseKey, {
            subscriptionId: session.subscription || session.id,
            customerId: session.customer || null,
            stripeCustomerId: session.customer || null,
            customerEmail,
            customerName,
            status: 'ACTIVE',
            tier: 'AUTONOMOUS_FRONT_DESK',
            forwardingNumber,
            carrierCode,
            carrierDeactivateCode,
            vapiAssistantId: vapiInfo.assistantId,
            vapiPhoneNumberId: vapiInfo.phoneNumberId,
            quotaMinutes: 250,
            overageRate: 0.20,
            minutesUsed: 0,
            boundAt: new Date().toISOString()
          });

          await db.saveMasterLicense({
            key: licenseKey,
            customer: customerName,
            email: customerEmail,
            tier: 'PRO',
            type: 'SUBSCRIPTION',
            price: amountPaid || '99.00/mo',
            voiceActive: true,
            voiceNumber: forwardingNumber,
            carrierCode,
            status: 'ACTIVE',
            subscriptionId: session.subscription || session.id,
            quotaMinutes: 250,
            overageRate: 0.20,
            date: new Date().toISOString()
          });
        } catch (dbErr) {
          console.error('[stripe-webhook] Firestore write failed (bundle):', dbErr.message);
        }
      } else {
        console.warn('[stripe-webhook] Firestore unavailable — add FIREBASE_SERVICE_ACCOUNT_KEY to Netlify env.');
      }

      console.log(`⚡🎙️ [AUTONOMOUS FRONT DESK BUNDLE ACTIVATED] Line: ${forwardingNumber}, Pro Key: ${licenseKey} for ${customerEmail}`);

      if (RESEND_API_KEY) {
        const emailSubject = `⚡🎙️ Your Missed Call Auto SMS Autonomous Front Desk Setup Guide`;
        const emailHtml = generateProPlusVoiceEmailHtml(
          customerName,
          licenseKey,
          apkDownloadUrl,
          forwardingNumber,
          carrierCode,
          carrierDeactivateCode,
          250,
          "AUTONOMOUS FRONT DESK BUNDLE ($99/MO)",
          "0.20"
        );

        try {
          const sendResult = await sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml);
          console.log(`📧 [FRONT DESK EMAIL DELIVERED] Dispatched to ${customerEmail} (ID: ${sendResult.id})`);

          if (OWNER_NOTIFY_EMAIL && OWNER_NOTIFY_EMAIL !== customerEmail) {
            sendEmail(
              RESEND_API_KEY,
              OWNER_NOTIFY_EMAIL,
              `⚡🎙️ New Autonomous Front Desk Subscriber ($99/mo): ${customerName}`,
              `<p>New Autonomous Front Desk ($99/mo) subscriber active!</p>
               <p><strong>Customer:</strong> ${customerName} (${customerEmail})</p>
               <p><strong>Pro Key:</strong> <code>${licenseKey}</code></p>
               <p><strong>Assigned Line:</strong> ${forwardingNumber}</p>
               <p><strong>Carrier Dial Code:</strong> <code>${carrierCode}</code></p>
               <p><strong>Included Quota:</strong> 250 minutes ($0.20/min overage)</p>
               <p><strong>Subscription ID:</strong> <code>${session.subscription || session.id}</code></p>`
            ).catch(() => {});
          }
        } catch (emailErr) {
          console.error(`❌ [FRONT DESK EMAIL FAILED] for ${customerEmail}:`, emailErr.message);
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received: true,
          tier: 'autonomous_front_desk',
          quotaMinutes: 250,
          overageRate: 0.20,
          forwardingNumber,
          carrierCode,
          carrierDeactivateCode,
          licenseKey: licenseKey,
          customerEmail: customerEmail,
          subscriptionId: session.subscription || session.id
        })
      };
    }

    // === BRANCH 2: STANDALONE MANAGED AI VOICE RECEPTIONIST (Business $89/mo or Starter $29/mo) ===
    if (isVoiceStandalone) {
      const isBusiness = isVoiceBusiness;
      const quotaMinutes = isBusiness ? 300 : 45;
      const overageRate = isBusiness ? "0.20" : "0.25";
      const planTitle = isBusiness ? "Business AI Voice Receptionist ($89/mo)" : "Starter AI Voice Receptionist ($29/mo)";
      const tierName = isBusiness ? "VOICE_BUSINESS" : "VOICE_STARTER";

      // Provision dedicated Vapi AI receptionist assistant & phone line
      const vapiInfo = await provisionVapiForSubscriber(customerName);
      const forwardingNumber = vapiInfo.forwardingNumber;
      const cleanDigits = forwardingNumber.replace(/\D/g, '');
      const carrierCode = `*71${cleanDigits.slice(-10)}`;
      const carrierDeactivateCode = '*73';

      // Enforce binding to user's existing Pro license key:
      const candidateKey = (session.client_reference_id ||
                           (session.metadata && session.metadata.license_key) ||
                           (session.subscription_data && session.subscription_data.metadata && session.subscription_data.metadata.license_key) || '').trim().toUpperCase();

      const isProCandidate = candidateKey && (
        candidateKey.startsWith('MCAS-PRO-') ||
        candidateKey.startsWith('MCAT-PRO-') ||
        candidateKey.includes('PRO-DEMO')
      );

      // Bind to user's existing Pro license key, or generate a Pro key if none provided
      const voiceLicenseKey = isProCandidate ? candidateKey : generateKey(customerName, 0, true);

      // Persist binding to Firestore
      const db2 = getFirestore();
      if (db2) {
        try {
          await db2.saveVoiceBinding(voiceLicenseKey, {
            subscriptionId: session.subscription || session.id,
            customerId: session.customer || null,
            stripeCustomerId: session.customer || null,
            customerEmail,
            customerName,
            status: 'ACTIVE',
            tier: tierName,
            forwardingNumber,
            carrierCode,
            carrierDeactivateCode,
            vapiAssistantId: vapiInfo.assistantId,
            vapiPhoneNumberId: vapiInfo.phoneNumberId,
            quotaMinutes: quotaMinutes,
            overageRate: parseFloat(overageRate),
            minutesUsed: 0,
            boundAt: new Date().toISOString()
          });

          await db2.saveMasterLicense({
            key: voiceLicenseKey,
            customer: customerName,
            email: customerEmail,
            tier: 'PRO',
            type: 'SUBSCRIPTION',
            price: isBusiness ? '89.00/mo' : '29.00/mo',
            voiceActive: true,
            voiceNumber: forwardingNumber,
            carrierCode,
            status: 'ACTIVE',
            subscriptionId: session.subscription || session.id,
            quotaMinutes: quotaMinutes,
            overageRate: parseFloat(overageRate),
            date: new Date().toISOString()
          });
        } catch (dbErr) {
          console.error(`[stripe-webhook] Firestore write failed (${tierName.toLowerCase()}):`, dbErr.message);
        }
      } else {
        console.warn('[stripe-webhook] Firestore unavailable — add FIREBASE_SERVICE_ACCOUNT_KEY to Netlify env.');
      }

      console.log(`🎙️ [${tierName} BOUND TO PRO KEY] Line: ${forwardingNumber}, Pro Key: ${voiceLicenseKey}, Quota: ${quotaMinutes}m for ${customerEmail}`);

      if (RESEND_API_KEY) {
        const emailSubject = `🎙️ Your ${planTitle} is Live! Assigned Line: ${forwardingNumber}`;
        const emailHtml = generateVoiceProEmailHtml(
          customerName,
          voiceLicenseKey,
          forwardingNumber,
          carrierCode,
          carrierDeactivateCode,
          planTitle,
          quotaMinutes,
          overageRate
        );

        try {
          const sendResult = await sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml);
          console.log(`📧 [VOICE EMAIL DELIVERED] Dispatched to ${customerEmail} (ID: ${sendResult.id})`);

          if (OWNER_NOTIFY_EMAIL && OWNER_NOTIFY_EMAIL !== customerEmail) {
            sendEmail(
              RESEND_API_KEY,
              OWNER_NOTIFY_EMAIL,
              `🎙️ New ${planTitle} Subscriber: ${customerName}`,
              `<p>New ${planTitle} subscriber active!</p>
               <p><strong>Customer:</strong> ${customerName} (${customerEmail})</p>
               <p><strong>Bound Pro Key:</strong> <code>${voiceLicenseKey}</code></p>
               <p><strong>Assigned Line:</strong> ${forwardingNumber}</p>
               <p><strong>Carrier Dial Code:</strong> <code>${carrierCode}</code></p>
               <p><strong>Included Quota:</strong> ${quotaMinutes} minutes ($${overageRate}/min overage)</p>
               <p><strong>Subscription ID:</strong> <code>${session.subscription || session.id}</code></p>`
            ).catch(() => {});
          }
        } catch (emailErr) {
          console.error(`❌ [VOICE EMAIL FAILED] for ${customerEmail}:`, emailErr.message);
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received: true,
          tier: tierName.toLowerCase(),
          quotaMinutes: quotaMinutes,
          overageRate: parseFloat(overageRate),
          forwardingNumber,
          carrierCode,
          carrierDeactivateCode,
          licenseKey: voiceLicenseKey,
          customerEmail: customerEmail,
          subscriptionId: session.subscription || session.id
        })
      };
    }

    if (isTrial) {
      // 1. Generate 3-Day Free Trial License Key (valid 4 days for timezone buffer)
      const trialLicenseKey = generateKey(customerName, 4, false);
      console.log(`🎁 [3-DAY TRIAL ACTIVATED] ${trialLicenseKey} for ${customerEmail} ($0.00 Charged)`);

      // 2. Automatically Dispatch Free Trial Delivery Email
      if (RESEND_API_KEY) {
        const emailSubject = `🎁 Your Missed Call Auto SMS 3-Day Free Trial Key & Setup Guide ($0 Today)`;
        const emailHtml = generateTrialEmailHtml(customerName, trialLicenseKey, apkDownloadUrl);

        try {
          const sendResult = await sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml);
          console.log(`📧 [TRIAL EMAIL DELIVERED] Dispatched to ${customerEmail} (ID: ${sendResult.id})`);

          // Notify owner of new free trial signup
          if (OWNER_NOTIFY_EMAIL && OWNER_NOTIFY_EMAIL !== customerEmail) {
            sendEmail(
              RESEND_API_KEY,
              OWNER_NOTIFY_EMAIL,
              `🎁 New 3-Day Free Trial Signup: ${customerName}`,
              `<p>A new customer has started their 3-day free trial ($0 charged today)!</p>
               <p><strong>Customer:</strong> ${customerName} (${customerEmail})</p>
               <p><strong>Trial License Key:</strong> <code>${trialLicenseKey}</code></p>
               <p><strong>Stripe Session:</strong> ${session.id}</p>
               <p><strong>Subscription ID:</strong> ${session.subscription || 'N/A'}</p>`
            ).catch(() => {});
          }
        } catch (emailErr) {
          console.error(`❌ [TRIAL EMAIL FAILED] for ${customerEmail}:`, emailErr.message);
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received: true,
          tier: 'standard_trial',
          trialDays: 3,
          amountPaid: '0.00',
          licenseKey: trialLicenseKey,
          apkUrl: apkDownloadUrl,
          customerEmail: customerEmail
        })
      };
    }

    // Agency Fleet Bundle ($229 for 3-Pack, $349 for 5-Pack, $649 for 10-Pack, $1,249 for 25-Pack)
    if (isAgency) {
      const quota = isAgency25 ? 25 : isAgency10 ? 10 : isAgency5 ? 5 : 3;
      const agencyTier = isAgency25 ? 'agency_25' : isAgency10 ? 'agency_10' : isAgency5 ? 'agency_5' : 'agency_3';
      const agencyMasterKey = generateAgencyKey(customerName, quota);
      const dashboardUrl = `https://${host}/agency_dashboard.html`;
      console.log(`🏢 [AGENCY ${quota}-PACK ACTIVATED] ${agencyMasterKey} for ${customerEmail} ($${amountPaid})`);

      try {
        const fleetCachePath = path.join(__dirname, '../../.agency_fleet_cache.json');
        let cache = {};
        if (fs.existsSync(fleetCachePath)) {
          cache = JSON.parse(fs.readFileSync(fleetCachePath, 'utf8'));
        }
        cache[agencyMasterKey] = {
          agencyName: customerName,
          customerEmail: customerEmail,
          quota: quota,
          tier: agencyTier,
          createdAt: new Date().toISOString(),
          clients: []
        };
        fs.writeFileSync(fleetCachePath, JSON.stringify(cache, null, 2), 'utf8');
      } catch (cacheErr) {
        console.warn('Could not update agency fleet cache in webhook:', cacheErr.message);
      }

      if (RESEND_API_KEY) {
        const emailSubject = `🏢 Your Missed Call Auto SMS Agency ${quota}-Pack Fleet Key & Dashboard Access`;
        const emailHtml = generateAgencyEmailHtml(customerName, agencyMasterKey, quota, amountPaid, dashboardUrl);

        try {
          const sendResult = await sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml);
          console.log(`📧 [AGENCY EMAIL DELIVERED] Dispatched to ${customerEmail} (ID: ${sendResult.id})`);

          if (OWNER_NOTIFY_EMAIL && OWNER_NOTIFY_EMAIL !== customerEmail) {
            sendEmail(
              RESEND_API_KEY,
              OWNER_NOTIFY_EMAIL,
              `🎉 New Agency ${quota}-Pack Purchase ($${amountPaid}): ${customerName}`,
              `<p>A new Agency partner has purchased an Agency ${quota}-Pack bundle!</p>
               <p><strong>Agency:</strong> ${customerName} (${customerEmail})</p>
               <p><strong>Amount Paid:</strong> $${amountPaid}</p>
               <p><strong>Master Agency Key:</strong> <code>${agencyMasterKey}</code></p>
               <p><strong>Quota:</strong> ${quota} Appliance Seats</p>
               <p><strong>Dashboard:</strong> ${dashboardUrl}</p>`
            ).catch(() => {});
          }
        } catch (emailErr) {
          console.error(`❌ [AGENCY EMAIL FAILED] for ${customerEmail}:`, emailErr.message);
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received: true,
          tier: agencyTier,
          quota: quota,
          amountPaid: amountPaid,
          masterAgencyKey: agencyMasterKey,
          dashboardUrl: dashboardUrl,
          customerEmail: customerEmail
        })
      };
    }

    // 1. Generate Signed Lifetime License Key
    const licenseKey = generateKey(customerName, 0, isPro);
    console.log(`🔑 [${isPro ? 'PRO GATEWAY ' : 'FLAGSHIP FOUNDER '}LIFETIME LICENSE GENERATED] ${licenseKey} for ${customerEmail} ($${amountPaid})`);

    const dbDirect = getFirestore();
    if (dbDirect) {
      try {
        await dbDirect.saveMasterLicense({
          key: licenseKey,
          customer: customerName,
          email: customerEmail,
          tier: isPro ? 'PRO' : 'STANDARD',
          type: 'PAID',
          price: amountPaid,
          status: 'ACTIVE',
          date: new Date().toISOString()
        });
      } catch (fErr) {
        console.warn('[stripe-webhook] Firestore saveMasterLicense error:', fErr.message);
      }
    }

    // 2. Automatically Dispatch Delivery Email
    if (RESEND_API_KEY) {
      const emailSubject = isPro
        ? `⚡ Your Missed Call Auto SMS Pro Automation Gateway License Key & Setup Guide`
        : `Your Missed Call Auto SMS Founder's Flagship Appliance License Key & Setup Guide`;
      const emailHtml = generateEmailHtml(customerName, licenseKey, apkDownloadUrl, amountPaid, isPro);

      try {
        const sendResult = await sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml);
        console.log(`📧 [EMAIL DELIVERED] Dispatched to ${customerEmail} (ID: ${sendResult.id})`);

        // Notify owner of purchase
        if (OWNER_NOTIFY_EMAIL && OWNER_NOTIFY_EMAIL !== customerEmail) {
          sendEmail(
            RESEND_API_KEY,
            OWNER_NOTIFY_EMAIL,
            `🎉 New ${isPro ? `⚡ Pro Gateway ($${amountPaid})` : '📱 Founder Flagship ($49.99)'} Purchase: ${customerName}`,
            `<p>New ${isPro ? 'Pro Automation Gateway' : 'Founder Flagship Appliance'} license purchased!</p>
             <p><strong>Customer:</strong> ${customerName} (${customerEmail})</p>
             <p><strong>Amount:</strong> $${amountPaid}</p>
             <p><strong>Edition:</strong> ${isPro ? 'Pro Automation Gateway ($299.00 Perpetual)' : "Founder's Flagship Appliance ($49.99)"}</p>
             <p><strong>License Key:</strong> <code>${licenseKey}</code></p>
             <p><strong>APK Delivered:</strong> ${apkDownloadUrl}</p>`
          ).catch(() => {});
        }
      } catch (emailErr) {
        console.error(`❌ [EMAIL DISPATCH FAILED] for ${customerEmail}:`, emailErr.message);
      }
    } else {
      console.warn(`⚠️ [RESEND_API_KEY NOT SET] License ${licenseKey} issued for ${customerEmail}, but email could not be sent automatically.`);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        received: true,
        tier: isPro ? 'pro_gateway' : 'flagship_founder',
        licenseKey: licenseKey,
        apkUrl: apkDownloadUrl,
        customerEmail: customerEmail
      })
    };
  }

  // Handle Trial Conversion Payment (3 days after trial start, first real invoice succeeds)
  if (eventObj.type === 'invoice.payment_succeeded') {
    const invoice = eventObj.data.object;
    const amountPaidCents = invoice.amount_paid || 0;
    const amountPaid = (amountPaidCents / 100).toFixed(2);
    const customerEmail = invoice.customer_email;
    const customerName = invoice.customer_name || 'Valued Customer';

    // Only process real conversion payments (ignore $0 initial trial setup invoice)
    if (amountPaidCents >= 4900 && customerEmail) {
      const host = (event.headers && event.headers.host) || 'missedcallautosms.com';
      const apkDownloadUrl = `https://${host}/MissedCallAutoSMS.apk`;

      // 1. Generate Permanent Lifetime License Key
      const lifetimeKey = generateKey(customerName, 0, false);
      console.log(`🎉 [TRIAL CONVERTED TO LIFETIME] ${lifetimeKey} for ${customerEmail} ($${amountPaid})`);

      // 2. Dispatch Lifetime Key Delivery Email via Resend
      if (RESEND_API_KEY) {
        const emailSubject = `🎉 Your Missed Call Auto SMS Lifetime License Key ($49.99)`;
        const emailHtml = generateEmailHtml(customerName, lifetimeKey, apkDownloadUrl, amountPaid, false);

        try {
          const sendResult = await sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml);
          console.log(`📧 [CONVERSION EMAIL DELIVERED] to ${customerEmail} (ID: ${sendResult.id})`);

          if (OWNER_NOTIFY_EMAIL && OWNER_NOTIFY_EMAIL !== customerEmail) {
            sendEmail(
              RESEND_API_KEY,
              OWNER_NOTIFY_EMAIL,
              `💰 Trial Converted to Lifetime ($${amountPaid}): ${customerName}`,
              `<p>Customer 3-day trial has converted to a permanent lifetime license!</p>
               <p><strong>Customer:</strong> ${customerName} (${customerEmail})</p>
               <p><strong>Amount:</strong> $${amountPaid}</p>
               <p><strong>Lifetime License Key:</strong> <code>${lifetimeKey}</code></p>
               <p><strong>APK Delivered:</strong> ${apkDownloadUrl}</p>`
            ).catch(() => {});
          }
        } catch (err) {
          console.error(`❌ [CONVERSION EMAIL ERROR] for ${customerEmail}:`, err.message);
        }
      }

      // 3. Terminate the recurring subscription in Stripe so customer has permanent lifetime access with no further recurring charges
      if (invoice.subscription && STRIPE_SECRET_KEY) {
        try {
          await stripeApiRequest(`/v1/subscriptions/${invoice.subscription}`, 'DELETE');
          console.log(`✅ [LIFETIME CONVERSION COMPLETE] Subscription ${invoice.subscription} terminated. User converted to lifetime access.`);
        } catch (subErr) {
          console.error(`⚠️ [STRIPE SUB CANCEL ERROR] Failed to terminate sub ${invoice.subscription}:`, subErr.message);
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received: true,
          converted: true,
          licenseKey: lifetimeKey,
          customerEmail: customerEmail
        })
      };
    }

    return { statusCode: 200, body: JSON.stringify({ received: true, note: 'Non-conversion invoice recorded' }) };
  }

  // ── Item 5: Subscription Cancellation / Voice Deactivation ────────────────
  if (eventObj.type === 'customer.subscription.deleted') {
    const subscription = eventObj.data.object;
    const subId = subscription.id;
    const customerId = subscription.customer;
    const cancelledAt = new Date().toISOString();

    console.log(`🛑 [SUBSCRIPTION CANCELLED] Subscription ${subId} for customer ${customerId}`);

    let deactivatedKey = null;
    let customerEmail = null;
    let customerName = null;
    let forwardingNumber = null;

    // 1. Deactivate in Firestore — find the binding by subscription ID and flip voiceActive=false
    const dbCancel = getFirestore();
    if (dbCancel) {
      try {
        deactivatedKey = await dbCancel.deactivateVoiceSubscriber(subId);

        // 2. Update global voice_settings to OFF
        await dbCancel.saveVoiceSettings({
          mode: 'OFF',
          status: 'CANCELLED',
          lastDeactivated: cancelledAt
        });

        // 3. Try to fetch subscriber details for the notification email
        if (deactivatedKey) {
          const binding = await dbCancel.getVoiceBinding(deactivatedKey);
          if (binding) {
            customerEmail = binding.customerEmail;
            customerName = binding.customerName;
            forwardingNumber = binding.forwardingNumber;
          }
        }

        console.log(`🎙️ [VOICE DEACTIVATED] Firestore binding cancelled for sub: ${subId}, key: ${deactivatedKey || 'not found'}`);
      } catch (dbErr) {
        console.error('[stripe-webhook] Firestore cancellation error:', dbErr.message);
      }
    } else {
      console.warn('[stripe-webhook] Firestore unavailable — cancellation not reflected in database.');
    }

    // 4. Send deactivation email to customer (with *73 instructions to un-forward their line)
    if (RESEND_API_KEY && customerEmail) {
      const deactivationHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Voice Receptionist Deactivated</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background:#090B0E; color:#FFF; padding:24px; margin:0;">
  <div style="max-width:600px; margin:0 auto; background:#131720; border:1px solid #222836; border-radius:16px; padding:32px;">
    <div style="text-align:center; margin-bottom:24px;">
      <div style="font-size:44px;">🎙️</div>
      <h1 style="color:#94A3B8; margin:8px 0; font-size:22px;">AI Voice Receptionist Deactivated</h1>
    </div>
    <p>Hi ${customerName || 'there'},</p>
    <p>Your <strong>Managed AI Voice Receptionist</strong> subscription has been cancelled and your dedicated line <strong>${forwardingNumber || 'assigned number'}</strong> has been released.</p>
    <div style="background:#1E293B; border-radius:8px; padding:16px; margin:20px 0;">
      <p style="margin:0 0 8px; font-weight:bold; color:#F59E0B;">⚠️ Action Required: Remove Call Forwarding</p>
      <p style="margin:0;">To stop forwarding your business calls, dial the following code from your phone:</p>
      <div style="background:#090B0E; border-radius:6px; padding:12px; margin:12px 0; text-align:center;">
        <span style="font-family:monospace; font-size:28px; font-weight:bold; color:#00E676; letter-spacing:4px;">*73</span>
      </div>
      <p style="margin:0; font-size:13px; color:#94A3B8;">Dial <strong>*73</strong> from your business phone to deactivate unconditional call forwarding. This ensures your calls ring normally again.</p>
    </div>
    <p>If you'd like to reactivate your AI Voice Receptionist in the future, visit <a href="https://missedcallautosms.com" style="color:#00E676;">missedcallautosms.com</a>.</p>
    <p style="color:#64748B; font-size:12px; margin-top:24px;">Subscription ID: ${subId}</p>
  </div>
</body>
</html>`;

      sendEmail(RESEND_API_KEY, customerEmail, '🎙️ Your AI Voice Receptionist Has Been Deactivated', deactivationHtml)
        .then(() => console.log(`📧 [DEACTIVATION EMAIL SENT] to ${customerEmail}`))
        .catch(e => console.warn('[stripe-webhook] Deactivation email failed:', e.message));
    }

    // 5. Notify owner
    if (RESEND_API_KEY && OWNER_NOTIFY_EMAIL) {
      sendEmail(
        RESEND_API_KEY,
        OWNER_NOTIFY_EMAIL,
        `🛑 Voice Subscription Cancelled: ${customerName || customerId}`,
        `<p>A Voice Pro subscription has been cancelled in Stripe.</p>
         <p><strong>Customer:</strong> ${customerName || 'Unknown'} (${customerEmail || 'no email'})</p>
         <p><strong>Subscription ID:</strong> <code>${subId}</code></p>
         <p><strong>Deactivated Key:</strong> <code>${deactivatedKey || 'not found in database'}</code></p>
         <p><strong>Released Line:</strong> ${forwardingNumber || 'N/A'}</p>
         <p><strong>Cancelled At:</strong> ${cancelledAt}</p>`
      ).catch(() => {});
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        received: true,
        cancelled: true,
        subscriptionId: subId,
        deactivatedKey,
        customerEmail
      })
    };
  }


  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

module.exports.generateEmailHtml = generateEmailHtml;
module.exports.generateComboEmailHtml = generateComboEmailHtml;
module.exports.generateProPlusVoiceEmailHtml = generateProPlusVoiceEmailHtml;
module.exports.generateVoiceProEmailHtml = generateVoiceProEmailHtml;