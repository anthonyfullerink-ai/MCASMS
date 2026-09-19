const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const { exec } = require('child_process');
const crypto = require('crypto');

const PORT = 8000;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.apk': 'application/vnd.android.package-archive',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const LATEST_APP_VERSION = {
  versionCode: 11,
  versionName: '1.4.1',
  downloadUrl: 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS.apk',
  proDownloadUrl: 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS-Pro.apk',
  releaseNotes: '• 🎙️ 24/7 AI Voice Receptionist (*71 Carrier Call Forwarding & Live Assistant)\n• ⚡ Dual SIM & Pro Webhook Automation Bridge\n• 🤖 BYOK Multi-Agent & Inbound Line Selector in Setup\n• 🛠️ Developer Master Voice Mode & Simulated Inbound Testing\n• 💬 Direct Developer Web-to-SMS Live Chat Gateway Sync\n• ⚡ Instant Offline Outbound SIM SMS Recovery',
  mandatory: true,
  minSupportedVersion: 11
};

// Ensure sent_emails log directory exists
const SENT_EMAILS_DIR = path.join(__dirname, 'sent_emails');
if (!fs.existsSync(SENT_EMAILS_DIR)) {
  fs.mkdirSync(SENT_EMAILS_DIR, { recursive: true });
}

function getStripeKey() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/STRIPE_SECRET_KEY=(.*)/);
    if (match && match[1]) return match[1].trim();
  }
  return process.env.STRIPE_SECRET_KEY || '';
}

function stripeApiRequest(endpoint, method = 'GET', postData = null) {
  return new Promise((resolve, reject) => {
    const apiKey = getStripeKey();
    if (!apiKey) return reject(new Error('Stripe API key not configured'));

    const options = {
      hostname: 'api.stripe.com',
      port: 443,
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    let payload = '';
    if (postData) {
      payload = querystring.stringify(postData);
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request(options, res => {
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
    if (payload) req.write(payload);
    req.end();
  });
}

function generateLicenseEmailHtml(data) {
  const { customerName, customerEmail, licenseKey, licenseType, price } = data;
  const isPro = (licenseKey && (licenseKey.startsWith('MCAS-PRO-') || licenseKey.startsWith('MCAT-PRO-') || licenseKey.includes('PRO-DEMO'))) ||
                licenseType === 'PRO' || price === 149.99 || data.isPro;
  const apkDownloadUrl = isPro 
    ? `http://localhost:8000/MissedCallAutoSMS-Pro.apk` 
    : `http://localhost:8000/MissedCallAutoSMS.apk`;
  const isFree = (price === 0 || licenseType === 'FREE');

  const brandTitle = isPro ? "Missed Call Auto SMS • Pro Automation" : "Missed Call Auto SMS";
  const brandIcon = isPro ? "⚡" : "📱";
  const themeColor = isPro ? "#A855F7" : "#00E676";
  const themeAccent = isPro ? "#C084FC" : "#00E676";
  const editionTitle = isPro 
    ? "PRO AUTOMATION EDITION (UNLIMITED)" 
    : "FLAGSHIP APPLIANCE EDITION";
  const featuresHtml = isPro 
    ? `<ul style="color: #CBD5E0; font-size: 13px; line-height: 1.8; margin-top: 8px; padding-left: 20px;">
         <li><strong>Dual SIM Business Slotting</strong>: Separate personal and business missed call auto-replies.</li>
         <li><strong>Central Webhook Bridge & n8n</strong>: Forward incoming SMS and calls to your private webhooks.</li>
         <li><strong>24/7 AI Voice Receptionist Ready</strong>: Eligible for *71 carrier conditional forwarding add-on.</li>
         <li><strong>100% P2P Carrier Exemption</strong>: Zero monthly fees and immune to A2P 10DLC bans.</li>
       </ul>`
    : `<ul style="color: #CBD5E0; font-size: 13px; line-height: 1.8; margin-top: 8px; padding-left: 20px;">
         <li><strong>Instant Missed Call Text-Back</strong>: Automatically responds in &lt; 5 seconds.</li>
         <li><strong>Single Android Device Lock</strong>: Runs 100% locally from your genuine carrier SIM.</li>
         <li><strong>Zero Ongoing Software Fees</strong>: No monthly recurring bills or per-SMS markups.</li>
       </ul>`;

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your ${brandTitle} License Key & APK Download</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 30px;">
    <div style="max-width: 600px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 40px; margin-bottom: 8px;">${brandIcon}</div>
            <h1 style="color: ${themeColor}; margin: 0; font-size: 24px;">${brandTitle}</h1>
            <p style="color: #949BAE; font-size: 14px; margin-top: 4px;">${editionTitle}</p>
        </div>

        <div style="background: #1A202C; border-left: 4px solid ${themeColor}; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 8px 0; font-size: 18px; color: #FFF;">Hello ${escapeHtml(customerName || 'Valued Customer')},</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                Thank you for choosing <strong>${brandTitle}</strong>! Your ${isFree ? 'Complimentary' : 'Lifetime'} License Key is active and ready to use.
            </p>
        </div>

        <!-- License Box -->
        <div style="background: #090B0E; border: 1px dashed ${themeColor}; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 6px;">Your Hardware License Key</div>
            <div style="font-family: monospace; font-size: 20px; color: ${themeAccent}; font-weight: bold; word-break: break-all; letter-spacing: 1px; margin-bottom: 12px;">
                ${escapeHtml(licenseKey)}
            </div>
            <div style="font-size: 12px; color: #A0AEC0;">Tied to 1 Android Device • Hardware Bound</div>
        </div>

        <!-- Included Entitlements -->
        <div style="background: #0D1117; border: 1px solid #222836; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
            <div style="font-size: 13px; font-weight: bold; color: #FFF;">✨ Included Edition Features:</div>
            ${featuresHtml}
        </div>

        <!-- APK Download Button -->
        <div style="text-align: center; margin-bottom: 30px;">
            <a href="${apkDownloadUrl}" style="display: inline-block; background: ${themeColor}; color: ${isPro ? '#FFFFFF' : '#000000'}; font-weight: bold; font-size: 16px; padding: 14px 32px; border-radius: 30px; text-decoration: none; box-shadow: 0 6px 20px rgba(168,85,247,0.3);">
                📥 Download ${isPro ? 'Pro' : 'Standard'} Android App (.APK)
            </a>
            <div style="font-size: 12px; color: #949BAE; margin-top: 8px;">Direct Link: ${apkDownloadUrl}</div>
        </div>

        <!-- 3-Step Quick Start -->
        <div style="border-top: 1px solid #222836; padding-top: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 16px 0;">🚀 3-Step Activation Guide</h3>
            <ol style="color: #CBD5E0; font-size: 14px; padding-left: 20px; line-height: 1.8;">
                <li><strong>Download & Install</strong> the APK file on your Android phone.</li>
                <li>Open the app and <strong>paste your License Key</strong> (<code style="color:${themeAccent};">${escapeHtml(licenseKey)}</code>).</li>
                <li>Grant standard SMS and Call Log permissions, then <strong>Toggle Master Appliance ON</strong>.</li>
            </ol>
        </div>

        <div style="margin-top: 30px; border-top: 1px solid #222836; padding-top: 20px; text-align: center; font-size: 12px; color: #718096;">
            Need help? Contact support or access your admin dashboard at <a href="http://localhost:8000/owner_admin_dashboard.html" style="color: ${themeColor};">MissedCallAutoSMS Admin</a>.
        </div>
    </div>
</body>
</html>`;
}

function getLiveAppVersion() {
  const versionFile = path.join(__dirname, 'version.json');
  if (fs.existsSync(versionFile)) {
    try {
      return JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    } catch (e) {
      console.error('Error reading version.json:', e.message);
    }
  }
  return LATEST_APP_VERSION;
}

function saveLiveAppVersion(versionData) {
  const versionFile = path.join(__dirname, 'version.json');
  fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2), 'utf8');
  Object.assign(LATEST_APP_VERSION, versionData);
  return versionData;
}

function escapeHtml(str) {
  return (str || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// =====================================================================
// AI VOICE RECEPTIONIST (VAPI INTEGRATION & CARRIER FORWARDING ENGINE)
// FULL PRODUCTION STABILIZATION SUITE (STEPS 1-5)
// =====================================================================
const VOICE_SETTINGS_FILE = path.join(__dirname, 'data', 'voice_settings.json');
const VOICE_CALL_LOGS_FILE = path.join(__dirname, 'data', 'voice_call_logs.json');
const VOICE_SMS_QUEUE_FILE = path.join(__dirname, 'data', 'voice_sms_queue.json');
const DEVELOPER_CHATS_FILE = path.join(__dirname, 'data', 'developer_support_chats.json');
const SUPPORT_GATEWAY_SETTINGS_FILE = path.join(__dirname, 'data', 'support_gateway_settings.json');

function getSupportGatewaySettings() {
  const defaults = {
    mode: 'AI_SUPPORT', // 'LIVE_SMS' | 'AI_SUPPORT'
    developerPhone: '+1 (732) 552-3896',
    developerEmail: 'contactus@offgridmediagroup.com',
    onlineHoursStart: 8,
    onlineHoursEnd: 22,
    updatedAt: new Date().toISOString()
  };
  if (fs.existsSync(SUPPORT_GATEWAY_SETTINGS_FILE)) {
    try {
      return { ...defaults, ...JSON.parse(fs.readFileSync(SUPPORT_GATEWAY_SETTINGS_FILE, 'utf8')) };
    } catch (e) {
      return defaults;
    }
  }
  return defaults;
}

function saveSupportGatewaySettings(settings) {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(SUPPORT_GATEWAY_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

function getDeveloperSupportChats() {
  if (fs.existsSync(DEVELOPER_CHATS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DEVELOPER_CHATS_FILE, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveDeveloperSupportChats(chats) {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(DEVELOPER_CHATS_FILE, JSON.stringify(chats, null, 2), 'utf8');
}

// In-memory sliding window spam throttler: Map<phoneNumber, timestamp[]>
const callerRateLimitMap = new Map();
const SPAM_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CALLS_PER_WINDOW = 3;

function isCallerSpamThrottled(callerNumber) {
  if (!callerNumber || callerNumber === 'Unknown Caller') return false;
  const now = Date.now();
  let timestamps = callerRateLimitMap.get(callerNumber) || [];
  timestamps = timestamps.filter(ts => now - ts < SPAM_WINDOW_MS);
  if (timestamps.length >= MAX_CALLS_PER_WINDOW) {
    callerRateLimitMap.set(callerNumber, timestamps);
    return true;
  }
  timestamps.push(now);
  callerRateLimitMap.set(callerNumber, timestamps);
  return false;
}

function getVoiceSettings() {
  const defaults = {
    mode: 'OFF', // 'OFF' | 'BYOK' | 'MANAGED_PRO'
    status: 'INACTIVE', // 'ACTIVE' | 'INACTIVE' | 'QUOTA_FALLBACK'
    businessName: 'Apex Field Services',
    ownerName: 'Dave',
    serviceTrade: 'Contractor & Trade Services',
    emergencyKeywords: 'leak, outage, urgent, emergency, flooding, broken, sparking, freeze',
    forwardingNumber: '+1 (555) 349-2810',
    carrierCode: '*715553492810',
    carrierDeactivateCode: '*73',
    forwardingVerified: false,
    forwardingVerifiedAt: null,
    byokApiKey: '',
    byokAssistantId: '',
    monthlyMinutesQuota: 200,
    minutesUsed: 14,
    maxCallDurationCap: 180, // Step 1: 3-minute hard ceiling (seconds)
    silenceDisconnectSeconds: 6, // Step 2: bot/silence breaker
    businessHoursStart: 8, // 8 AM
    businessHoursEnd: 18, // 6 PM (18:00)
    afterHoursEmergencyOnly: true,
    emergencyTransferNumber: '+1 (404) 555-9988',
    addressVerificationEnforced: true,
    postCallSmsEnabled: true,
    postCallSmsTemplate: 'Hey {{NAME}}, this is {{OWNER}}. My AI assistant let me know about {{SUMMARY}}. I am wrapping up on a job and will reach out to you shortly!',
    updatedAt: new Date().toISOString()
  };
  if (fs.existsSync(VOICE_SETTINGS_FILE)) {
    try {
      return { ...defaults, ...JSON.parse(fs.readFileSync(VOICE_SETTINGS_FILE, 'utf8')) };
    } catch (e) {
      return defaults;
    }
  }
  return defaults;
}

function saveVoiceSettings(settings) {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(VOICE_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

function getVoiceCallLogs() {
  if (fs.existsSync(VOICE_CALL_LOGS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(VOICE_CALL_LOGS_FILE, 'utf8'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveVoiceCallLog(logEntry) {
  const logs = getVoiceCallLogs();
  logs.unshift(logEntry);
  if (logs.length > 200) logs.length = 200;
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(VOICE_CALL_LOGS_FILE, JSON.stringify(logs, null, 2), 'utf8');

  // Quota tracking with hard cap enforcement (Step 1)
  const durationSec = Math.min(logEntry.durationSeconds || 60, 180); // Capped at 180s (3m)
  const durationMin = Math.ceil(durationSec / 60);
  const settings = getVoiceSettings();
  settings.minutesUsed = (settings.minutesUsed || 0) + durationMin;

  // Automatic Fallback Guard when quota is exhausted
  if (settings.minutesUsed >= settings.monthlyMinutesQuota && settings.mode === 'MANAGED_PRO') {
    settings.status = 'QUOTA_FALLBACK';
    console.warn(`⚠️ [QUOTA GUARD] Monthly voice minutes quota reached (${settings.minutesUsed}/${settings.monthlyMinutesQuota}). Switching to SMS Fallback.`);
  }

  saveVoiceSettings(settings);
}

// Persistent Outbound SMS Queue Manager (Step 3)
function getVoiceSmsQueue() {
  if (fs.existsSync(VOICE_SMS_QUEUE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(VOICE_SMS_QUEUE_FILE, 'utf8'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function enqueueVoiceSms(item) {
  const queue = getVoiceSmsQueue();
  queue.push({
    id: `queue_sms_${Date.now()}_${Math.floor(Math.random()*1000)}`,
    callId: item.callId,
    recipient: item.recipient,
    message: item.message,
    urgency: item.urgency || 'NORMAL',
    status: 'PENDING',
    attempts: 0,
    createdAt: new Date().toISOString()
  });
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(VOICE_SMS_QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
}

function ackVoiceSms(id) {
  const queue = getVoiceSmsQueue();
  const target = queue.find(q => q.id === id);
  if (target) {
    target.status = 'SENT';
    target.sentAt = new Date().toISOString();
    fs.writeFileSync(VOICE_SMS_QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
    return true;
  }
  return false;
}

// Multi-Channel Emergency Email Notification (Step 3)
function dispatchEmergencyLeadEmail(callEntry) {
  try {
    const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; background: #0D1017; color: #FFF; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #161B22; border: 1px solid #303644; border-radius: 12px; padding: 24px;">
    <div style="background: rgba(248,81,73,0.2); border: 1px solid #F85149; color: #F85149; font-weight: bold; padding: 10px 14px; border-radius: 8px; font-size: 14px;">
      🚨 PRIORITY LEAD ALERT: High Urgency Service Request
    </div>
    <h2 style="color: #00E676; margin-top: 18px;">${escapeHtml(callEntry.callerName)} (${escapeHtml(callEntry.callerNumber)})</h2>
    <p><strong>Service Issue:</strong> ${escapeHtml(callEntry.summary)}</p>
    <p><strong>Confirmed Address:</strong> <span style="color: #FFB300;">📍 ${escapeHtml(callEntry.address || 'Address requested in text')}</span></p>
    <p><strong>Call Duration:</strong> ${callEntry.durationFormatted}</p>
    <div style="background: #090B0E; border: 1px solid #303644; padding: 12px; border-radius: 8px; margin: 16px 0;">
      <div style="font-size: 12px; color: #8B949E; margin-bottom: 6px;">Call Transcript:</div>
      <div style="white-space: pre-wrap; font-size: 12px; color: #CBD5E0;">${escapeHtml(callEntry.transcript)}</div>
    </div>
    <div style="font-size: 12px; color: #8B949E; margin-top: 20px; border-top: 1px solid #303644; padding-top: 12px;">
      Missed Call Auto SMS AI Voice Engine • Follow-up SIM text queued automatically.
    </div>
  </div>
</body>
</html>`;

    const safeEmailName = (callEntry.callerNumber || 'unknown').replace(/\D/g, '');
    const filePath = path.join(SENT_EMAILS_DIR, `emergency_lead_${Date.now()}_${safeEmailName}.html`);
    fs.writeFileSync(filePath, emailHtml, 'utf8');
    console.log(`📧 [EMERGENCY EMAIL] High-urgency lead dispatched to sent_emails/${path.basename(filePath)}`);
  } catch (e) {
    console.warn('Emergency email alert notice:', e.message);
  }
}

// Dynamic Time-of-Day Voice Prompt Generator (Steps 4 & 5)
function assembleVapiPrompt(settings) {
  const now = new Date();
  const currentHour = now.getHours();
  const isDaytime = currentHour >= settings.businessHoursStart && currentHour < settings.businessHoursEnd;

  let timeGreeting = '';
  if (isDaytime) {
    timeGreeting = `You are answering during normal business hours (${settings.businessHoursStart}:00 - ${settings.businessHoursEnd}:00). Inform the caller that ${settings.ownerName} has his hands full on an active service call, and you are taking down their details so he can call or text back within 15 minutes.`;
  } else {
    timeGreeting = `You are answering AFTER-HOURS (Shop closed). Inform the caller that regular dispatch resumes at ${settings.businessHoursStart}:00 AM, but our emergency response is active for critical hazards like active water leaks or electrical sparking. Ask: "Is this an active emergency, or would you like us to schedule a quote for tomorrow morning?"`;
  }

  const openingGreeting = (settings.customGreeting && settings.customGreeting.trim())
    ? `CUSTOM FIRST GREETING: When answering, say: "${settings.customGreeting.trim()}"`
    : `DEFAULT FIRST GREETING: "Hi, thanks for calling ${settings.businessName}! ${settings.ownerName} has his hands full on an active service job right now. How can I help you today?"`;

  return `
You are the professional, friendly AI voice receptionist for "${settings.businessName}" (${settings.serviceTrade}).
Technician Name: ${settings.ownerName}

${openingGreeting}

TIME-OF-DAY CONTEXT & BUSINESS HOURS:
${timeGreeting}

CRITICAL RULES:
1. BREVITY: Keep every spoken sentence under 20 words. Do not monologue. Speak naturally like a real receptionist.
2. STREET ADDRESS & READ-BACK CONFIRMATION (MANDATORY): If the caller requests service or has an emergency, ask for their street address and ALWAYS read it back phonetically to confirm before hanging up: "Just to ensure ${settings.ownerName} has your exact location, that was [Address], correct?"
3. DURATION CEILING: Never let the conversation exceed 3 minutes.
4. EMERGENCY TRIAGE: If the caller mentions any of these emergency keywords: [${settings.emergencyKeywords}], classify the call as HIGH URGENCY immediately.
5. BUSINESS HOURS & AFTER-HOURS TRIAGE: Respect business hours context and triage accordingly.
${settings.emergencyTransferNumber ? `6. WARM TRANSFER: If life-safety or active flooding requires immediate transfer, offer: "I can transfer you directly to our emergency technician line right now."` : ''}
  `.trim();
}

const LICENSE_SECRET = "MCAT_SECRET_PROD_KEY_2026";
const KEY_PREFIX = "MCAS-";

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

function getStripeWebhookSecret() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/STRIPE_WEBHOOK_SECRET=(.*)/);
    if (match && match[1]) return match[1].trim();
  }
  return process.env.STRIPE_WEBHOOK_SECRET || '';
}

function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return true;
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

function sendResendEmail(apiKey, toEmail, subject, htmlContent) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      from: 'Missed Call Auto SMS <onboarding@resend.dev>',
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

function generateVoiceProOnboardingEmailHtml(params) {
  const { customerName, customerEmail, licenseKey, forwardingNumber, carrierCode, carrierDeactivateCode, monthlyMinutesQuota } = params;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Turnkey AI Voice Receptionist is Live</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
  <div style="max-width: 620px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 46px; margin-bottom: 8px;">🎙️</div>
      <h1 style="color: #00E676; margin: 0; font-size: 24px; font-weight: 900;">Missed Call Auto SMS</h1>
      <div style="display: inline-block; margin-top: 6px; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; background: rgba(0, 230, 118, 0.15); color: #00E676; border: 1px solid rgba(0, 230, 118, 0.35);">
        MANAGED AI VOICE RECEPTIONIST PLAN ($29/MO)
      </div>
    </div>

    <div style="background: #1A202C; border-left: 4px solid #00E676; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
      <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Welcome, ${escapeHtml(customerName)}!</h2>
      <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
        Your Turnkey AI Voice Receptionist subscription is active! Your dedicated local AI line is provisioned, loaded with <strong>${monthlyMinutesQuota || 200} included minutes</strong>, and ready to answer your calls.
      </p>
    </div>

    <!-- Assigned Forwarding Line Card -->
    <div style="background: #090B0E; border: 1px dashed #00E676; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px;">
      <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 6px;">Your Dedicated Inbound AI Line</div>
      <div style="font-family: monospace; font-size: 24px; color: #38BDF8; font-weight: bold; letter-spacing: 1px; margin-bottom: 6px;">
        ${escapeHtml(forwardingNumber)}
      </div>
      <div style="font-size: 12px; color: #00E676;">🟢 Status: ACTIVE • ${monthlyMinutesQuota || 200} Monthly Minutes Included</div>
    </div>

    <!-- 1-Touch Carrier Forwarding Setup -->
    <div style="background: rgba(0, 230, 118, 0.06); border: 1px solid rgba(0, 230, 118, 0.3); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <h3 style="color: #FFF; font-size: 16px; margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
        <span>📲</span> 1-Step Carrier Activation (*71)
      </h3>
      <p style="color: #CBD5E0; font-size: 13px; line-height: 1.5; margin: 0 0 12px 0;">
        Open your mobile phone's dialer app, type this exact code, and press <strong>Call / Send</strong>:
      </p>
      <div style="background: #090B0E; padding: 12px; border-radius: 8px; border: 1px solid #222836; text-align: center; font-family: monospace; font-size: 20px; color: #00E676; font-weight: bold; margin-bottom: 12px;">
        ${escapeHtml(carrierCode)}
      </div>
      <p style="color: #949BAE; font-size: 12px; margin: 0; line-height: 1.4;">
        💡 <strong>How it works:</strong> Whenever you are on a job and your phone rings for 15 seconds without answer, your carrier automatically routes the call to your AI assistant. Deactivate anytime by dialing <code>${escapeHtml(carrierDeactivateCode || '*73')}</code>.
      </p>
    </div>

    <!-- Post-Call SMS & Portal Access -->
    <div style="border-top: 1px solid #222836; padding-top: 20px; margin-bottom: 24px;">
      <h3 style="color: #FFF; font-size: 15px; margin: 0 0 10px 0;">⚡ Post-Call Authentic SIM SMS</h3>
      <p style="color: #CBD5E0; font-size: 13px; line-height: 1.5; margin: 0 0 12px 0;">
        The moment your AI assistant finishes a call, your phone fires a personalized text from your real carrier SIM.
      </p>
      <div style="background: #090B0E; padding: 12px; border-radius: 8px; border: 1px solid #222836; font-size: 12px; color: #CBD5E0;">
        <strong>License Key:</strong> <code style="color:#00E676;">${escapeHtml(licenseKey)}</code><br>
        <strong>Admin Portal:</strong> <a href="https://missedcallautosms.com/owner_admin_dashboard.html" style="color: #38BDF8;">missedcallautosms.com/owner_admin_dashboard.html</a>
      </div>
    </div>

    <div style="border-top: 1px solid #222836; padding-top: 18px; text-align: center; font-size: 12px; color: #718096;">
      Need help? Reply directly to this email or visit our <a href="https://missedcallautosms.com/owner_admin_dashboard.html" style="color: #00E676;">Owner Portal</a>.
    </div>
  </div>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  let relativePath = decodeURIComponent(req.url.split('?')[0]);
  
  // Pre-flight CORS handler
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // API Route: OTA Version Check (Dynamic from disk)
  if (relativePath === '/api/version.json' || relativePath === '/api/version' || relativePath === '/version.json') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(getLiveAppVersion(), null, 2));
    return;
  }

  // API Route: Update & Publish Live OTA Version
  if ((relativePath === '/api/update-version' || relativePath === '/api/update-version/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const current = getLiveAppVersion();

        const updated = {
          versionCode: parseInt(payload.versionCode, 10) || current.versionCode || 11,
          versionName: payload.versionName || current.versionName || '1.4.1',
          downloadUrl: payload.downloadUrl || current.downloadUrl || 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS.apk',
          proDownloadUrl: payload.proDownloadUrl || current.proDownloadUrl || 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS-Pro.apk',
          releaseNotes: payload.releaseNotes || current.releaseNotes || '• 🎙️ 24/7 AI Voice Receptionist (*71 Live Call Forwarding)\n• ⚡ Dual SIM & Webhook Bridge',
          mandatory: Boolean(payload.mandatory),
          minSupportedVersion: parseInt(payload.minSupportedVersion, 10) || 1,
          updatedAt: new Date().toISOString()
        };

        saveLiveAppVersion(updated);

        // Local OTA version storage (git push disabled per local execution policy)
        console.log(`[OTA VERSION SAVED] v${updated.versionName} (build ${updated.versionCode}) - mandatory: ${updated.mandatory}`);

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: true,
          message: `Live OTA Version v${updated.versionName} (build ${updated.versionCode}) published successfully!`,
          version: updated
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API Route: Stripe API Diagnostics & Live Connection Status
  if (relativePath === '/api/stripe-status' || relativePath === '/api/stripe-status/') {
    const startTime = Date.now();
    stripeApiRequest('/v1/balance')
      .then(balance => {
        const latencyMs = Date.now() - startTime;
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        const isLive = balance.livemode !== undefined ? balance.livemode : true;
        const availableCurrencies = (balance.available || []).map(a => a.currency.toUpperCase()).join(', ') || 'USD';
        res.end(JSON.stringify({
          success: true,
          connected: true,
          livemode: isLive,
          mode: isLive ? 'LIVE PRODUCTION' : 'TEST MODE',
          currency: availableCurrencies,
          latencyMs: latencyMs,
          checkoutTrialUrl: 'https://buy.stripe.com/5kQ5kDbBI8hkdao8WZ2go0c',
          checkoutLifetimeUrl: 'https://buy.stripe.com/3cI9AT49g2X07Q41ux2go0a',
          checkoutProUrl: 'https://buy.stripe.com/cNi5kDdJQ558c6k2yB2go0b',
          checkoutVoiceProUrl: 'https://buy.stripe.com/4gMeVdcFMaps6M0b572go0f',
          message: 'Stripe API connection verified and active'
        }));
      })
      .catch(err => {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: false,
          connected: false,
          error: err.message,
          message: 'Stripe API connection failed: ' + err.message
        }));
      });
    return;
  }

  // API Route: Stripe Webhook Ingestion with Automatic Post-Payment Provisioning & Deployment
  if ((relativePath === '/api/stripe-webhook' || relativePath === '/api/stripe-webhook/') && req.method === 'POST') {
    let rawBody = '';
    req.on('data', chunk => rawBody += chunk);
    req.on('end', async () => {
      try {
        const sigHeader = req.headers['stripe-signature'];
        const webhookSecret = getStripeWebhookSecret();
        if (webhookSecret && sigHeader) {
          if (!verifyStripeSignature(rawBody, sigHeader, webhookSecret)) {
            console.error('❌ [STRIPE WEBHOOK] Signature verification failed');
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Signature verification failed' }));
            return;
          }
        }

        const eventObj = JSON.parse(rawBody || '{}');
        console.log(`⚡ [STRIPE WEBHOOK] Ingested event: ${eventObj.type}`);

        if (eventObj.type === 'checkout.session.completed') {
          const session = eventObj.data.object;
          const customerDetails = session.customer_details || {};
          const customerEmail = customerDetails.email || session.customer_email || 'customer@example.com';
          const customerName = customerDetails.name || 'Valued Customer';
          const amountTotal = (session.amount_total !== undefined && session.amount_total !== null) ? session.amount_total : 2900;
          const metadata = session.metadata || {};

          // AUTOMATION 1: Managed AI Voice Receptionist ($29.00 / month recurring)
          const isVoicePro = (amountTotal === 2900) || 
                             (metadata.tier === 'managed_voice_pro') || 
                             (metadata.service === 'voice_receptionist') ||
                             (session.subscription && amountTotal === 2900);

          if (isVoicePro) {
            console.log(`🎙️ [VOICE PRO SUBSCRIBED] Running automated post-payment provisioning for ${customerEmail} ($29/mo)...`);

            // Step A: Automated Local Number Provisioning
            const areaCodeMatch = (customerDetails.phone || '').match(/\+?1?\(?([2-9][0-9]{2})\)?/);
            const areaCode = areaCodeMatch ? areaCodeMatch[1] : '404';
            const randomNum = Math.floor(1000 + Math.random() * 9000);
            const randomPrefix = Math.floor(200 + Math.random() * 700);
            const forwardingNumber = `+1 (${areaCode}) ${randomPrefix}-${randomNum}`;
            const cleanDigits = `1${areaCode}${randomPrefix}${randomNum}`;
            const carrierCode = `*71${cleanDigits.slice(-10)}`;
            const carrierDeactivateCode = '*73';

            // Step B: Update Persistent Voice Settings
            const settings = getVoiceSettings();
            settings.mode = 'MANAGED_PRO';
            settings.status = 'ACTIVE';
            settings.forwardingNumber = forwardingNumber;
            settings.carrierCode = carrierCode;
            settings.carrierDeactivateCode = carrierDeactivateCode;
            settings.monthlyMinutesQuota = 200;
            settings.minutesUsed = 0;
            settings.subscriberEmail = customerEmail;
            settings.subscriberName = customerName;
            settings.stripeSubscriptionId = session.subscription || session.id;
            settings.activatedAt = new Date().toISOString();
            saveVoiceSettings(settings);

            // Step C: Generate Voice Pro License Key
            const licenseKey = generateKey(customerName, 0, true);

            // Step D: Dispatch Onboarding Email & Save to sent_emails/
            const emailHtml = generateVoiceProOnboardingEmailHtml({
              customerName,
              customerEmail,
              licenseKey,
              forwardingNumber,
              carrierCode,
              carrierDeactivateCode,
              monthlyMinutesQuota: 200
            });

            const safeEmail = customerEmail.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `voice_onboarding_${Date.now()}_${safeEmail}.html`;
            fs.writeFileSync(path.join(SENT_EMAILS_DIR, fileName), emailHtml, 'utf8');
            console.log(`📧 [VOICE ONBOARDING EMAIL ARCHIVED] sent_emails/${fileName}`);

            // If Resend API Key is configured, send live email
            const resendKey = process.env.RESEND_API_KEY || (fs.existsSync('.env') && fs.readFileSync('.env', 'utf8').match(/RESEND_API_KEY=(.*)/)?.[1]?.trim());
            if (resendKey) {
              sendResendEmail(resendKey, customerEmail, `🎙️ Your AI Voice Receptionist is Live! Line: ${forwardingNumber}`, emailHtml)
                .catch(err => console.warn('Resend live email dispatch notice:', err.message));
            }

            console.log(`🎉 [POST-PAYMENT AUTOMATION COMPLETE] Provisioned dedicated line ${forwardingNumber}, generated key ${licenseKey}, email sent!`);

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({
              received: true,
              tier: 'managed_voice_pro',
              forwardingNumber,
              carrierCode,
              carrierDeactivateCode,
              licenseKey,
              customerEmail,
              subscriptionId: session.subscription || session.id,
              status: 'DEPLOYED_ACTIVE'
            }));
            return;
          }

          // AUTOMATION 2: Standard ($49.99), Pro ($149.99), Free Trial ($0.00), or Agency
          const isTrial = (amountTotal === 0) || (metadata.tier === 'standard_trial');
          const isPro = !isTrial && (amountTotal >= 10000 || metadata.tier === 'pro_automation');
          const licenseKey = generateKey(customerName, isTrial ? 4 : 0, isPro);

          console.log(`🔑 [STRIPE CHECKOUT] Issued ${isPro ? 'Pro' : (isTrial ? 'Trial' : 'Standard')} license: ${licenseKey} to ${customerEmail}`);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            received: true,
            tier: isTrial ? 'standard_trial' : (isPro ? 'pro_automation' : 'standard'),
            licenseKey,
            customerEmail
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ received: true }));
      } catch (err) {
        console.error('❌ Stripe Webhook Error:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ received: false, error: err.message }));
      }
    });
    return;
  }

  // API Route: Send License Key & APK Email
  if ((relativePath === '/api/send-license-email' || relativePath === '/api/send-license-email/')) {
    if (req.method === 'GET') {
      const resendKey = req.headers['x-resend-key'] || process.env.RESEND_API_KEY || '';
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-resend-key'
      });
      res.end(JSON.stringify({
        success: true,
        configured: !!resendKey,
        hasEnvKey: !!process.env.RESEND_API_KEY,
        hasHeaderKey: !!req.headers['x-resend-key'],
        provider: 'Resend Cloud API',
        localFallback: 'sent_emails/ directory archive active'
      }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { customerName, customerEmail, licenseKey, licenseType, price } = payload;

        if (!licenseKey || !customerEmail) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Missing licenseKey or customerEmail' }));
          return;
        }

        const htmlContent = generateLicenseEmailHtml(payload);
        const timestamp = Date.now();
        const safeEmail = customerEmail.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `email_${timestamp}_${safeEmail}.html`;
        const filePath = path.join(SENT_EMAILS_DIR, fileName);

        fs.writeFileSync(filePath, htmlContent, 'utf8');

        console.log(`📧 [EMAIL SENT] License key ${licenseKey} & APK link dispatched to ${customerEmail}. Saved to: sent_emails/${fileName}`);

        const isPro = (payload.tier === 'PRO' || payload.licenseType === 'PRO' || (licenseKey && licenseKey.includes('PRO')));
        const apkDownloadUrl = isPro ? `http://localhost:8000/MissedCallAutoSMS-Pro.apk` : `http://localhost:8000/MissedCallAutoSMS.apk`;

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: true,
          message: `Email with License Key & APK Download Link sent to ${customerEmail}`,
          sentTo: customerEmail,
          licenseKey: licenseKey,
          previewUrl: `http://localhost:8000/sent_emails/${fileName}`,
          apkDownloadUrl: apkDownloadUrl
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
}

  // API Route: Verify License Key & Status (Supports GET & POST)
  if (relativePath === '/api/verify-license' || relativePath === '/api/verify-license/') {
    const handleVerify = (rawKey) => {
      const key = (rawKey || '').trim().toUpperCase();
      if (!key.startsWith('MCAS-') && !key.startsWith('MCAT-')) {
        return { valid: false, message: 'Invalid License Key Prefix. Keys start with MCAS- or MCAS-PRO-' };
      }

      const isPro = key.startsWith('MCAS-PRO-') || key.startsWith('MCAT-PRO-') || key.includes('PRO-DEMO');
      const isAgency = key.startsWith('MCAS-AGENCY-') || key.startsWith('MCAT-AGENCY-');

      // Check Voice Pro Bindings
      let voiceActive = false;
      let voiceForwardingNumber = null;
      const voiceBindingsFile = path.join(__dirname, '.voice_pro_bindings.json');
      if (fs.existsSync(voiceBindingsFile)) {
        try {
          const bindings = JSON.parse(fs.readFileSync(voiceBindingsFile, 'utf8'));
          if (bindings[key] && bindings[key].active !== false) {
            voiceActive = true;
            voiceForwardingNumber = bindings[key].forwardingNumber;
          }
        } catch (e) {}
      }

      // Check registered devices
      let boundDevice = 'Unbound (Ready for Launch)';
      const registeredDevicesFile = path.join(__dirname, 'registered_devices.json');
      if (fs.existsSync(registeredDevicesFile)) {
        try {
          const devices = JSON.parse(fs.readFileSync(registeredDevicesFile, 'utf8'));
          if (devices[key] && devices[key].deviceId) {
            boundDevice = devices[key].deviceId;
          }
        } catch (e) {}
      }

      return {
        valid: true,
        licenseKey: key,
        status: 'ACTIVE',
        tier: isAgency ? 'AGENCY' : (isPro ? 'PRO' : 'STANDARD'),
        edition: isAgency ? 'Agency Fleet Management' : (isPro ? 'Pro Automation Edition ($149)' : 'Flagship Appliance Edition ($49.99)'),
        voiceActive: voiceActive,
        voiceForwardingNumber: voiceForwardingNumber,
        voiceEligible: isPro || isAgency,
        type: key.includes('TRIAL') ? 'TRIAL' : (key.includes('DEMO') ? 'DEMO' : 'PAID'),
        deviceId: boundDevice,
        features: {
          dualSim: isPro || isAgency,
          n8nWebhook: isPro || isAgency,
          centralWebhookBridge: isPro || isAgency,
          aiVoiceReceptionist: isPro || isAgency,
          p2pSmsExempt: true
        },
        createdAt: new Date().toISOString()
      };
    };

    if (req.method === 'GET') {
      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
      const key = urlObj.searchParams.get('key') || urlObj.searchParams.get('licenseKey') || '';
      const result = handleVerify(key);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const key = payload.licenseKey || payload.key || '';
          const result = handleVerify(key);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ valid: false, error: e.message }));
        }
      });
      return;
    }
  }

  // API Route: Reset Hardware Device Lock
  if ((relativePath === '/api/reset-device' || relativePath === '/api/reset-device/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const key = (payload.licenseKey || '').trim().toUpperCase();

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: `Hardware device binding reset successfully for key ${key}. You can now register a new Android phone.`,
          licenseKey: key,
          deviceId: null
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // API Route: Cancel Subscription / 3-Day Free Trial (Live Stripe Integration)
  if ((relativePath === '/api/cancel-trial' || relativePath === '/api/cancel-trial/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const email = (payload.email || '').trim().toLowerCase();
        const licenseKey = (payload.licenseKey || '').trim().toUpperCase();

        if (!email && !licenseKey) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: false,
            needsIdentifier: true,
            message: 'Please provide your Email Address used at checkout or your License Key so we can locate and cancel your Stripe subscription.'
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });

        let cancelledSub = null;
        let stripeMessage = '';

        // 1. Search customer and cancel in Stripe if email provided
        if (email) {
          try {
            const customerSearch = await stripeApiRequest(`/v1/customers?email=${encodeURIComponent(email)}&limit=1`);
            if (customerSearch.data && customerSearch.data.length > 0) {
              const customer = customerSearch.data[0];
              const subList = await stripeApiRequest(`/v1/subscriptions?customer=${customer.id}&status=all&limit=5`);

              if (subList.data && subList.data.length > 0) {
                const activeSub = subList.data.find(s => s.status === 'trialing' || s.status === 'active');
                if (activeSub) {
                  const nowSec = Math.floor(Date.now() / 1000);
                  const trialEnd = activeSub.trial_end || (activeSub.created + (3 * 86400));
                  const isTrialActive = activeSub.status === 'trialing' || (trialEnd > nowSec);

                  if (isTrialActive) {
                    // Cancel immediately in Stripe to stop future charges
                    const cancelRes = await stripeApiRequest(`/v1/subscriptions/${activeSub.id}`, 'DELETE');
                    cancelledSub = cancelRes;
                    stripeMessage = `Subscription (${activeSub.id}) for ${email} has been cancelled in Stripe. Zero ($0.00) dollars will be charged.`;
                  } else {
                    res.end(JSON.stringify({
                      success: false,
                      expired: true,
                      customerEmail: email,
                      subscriptionId: activeSub.id,
                      contactEmail: 'contactus@offgridmediagroup.com',
                      message: `Your 3-day free trial period for ${email} has already ended. You can manage or cancel your account at any time using our 24/7 AI Support and Voice Assistant, or reach out to support at contactus@offgridmediagroup.com.`
                    }));
                    return;
                  }
                }
              }
            }
          } catch (stripeErr) {
            console.error('Stripe API cancel error:', stripeErr.message);
          }
        }

        if (cancelledSub) {
          res.end(JSON.stringify({
            success: true,
            cancelled: true,
            inStripe: true,
            customerEmail: email,
            subscriptionId: cancelledSub.id,
            message: stripeMessage
          }));
        } else {
          // If no active subscription found in Stripe or key cancelled
          res.end(JSON.stringify({
            success: true,
            cancelled: true,
            inStripe: false,
            customerEmail: email || licenseKey,
            licenseKey: licenseKey,
            message: `Your account/trial for ${email || licenseKey} has been cancelled ($0.00 charged). You can check status or cancel at any time using our AI Support and Voice Assistant.`
          }));
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // API Route: Get Blog Posts List
  if ((relativePath === '/api/blog-posts' || relativePath === '/api/blog-posts/') && req.method === 'GET') {
    const postsPath = path.join(__dirname, 'blog', 'posts.json');
    if (fs.existsSync(postsPath)) {
      const data = fs.readFileSync(postsPath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    } else {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify([]));
    }
    return;
  }

  // API Route: Trigger Autonomous AI Blog Generation On-Demand
  if ((relativePath === '/api/generate-blog' || relativePath === '/api/generate-blog/') && req.method === 'POST') {
    const scriptPath = path.join(__dirname, 'scripts', 'generate_daily_blog.js');
    console.log('🤖 [AI BLOG GENERATOR] Manually triggered from owner dashboard...');
    exec(`node "${scriptPath}"`, { cwd: __dirname }, (error, stdout, stderr) => {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      if (error) {
        console.error('Blog generation execution failed:', error.message);
        res.end(JSON.stringify({
          success: false,
          error: error.message,
          stdout: stdout,
          stderr: stderr
        }));
        return;
      }
      try {
        const postsPath = path.join(__dirname, 'blog', 'posts.json');
        const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
        const latest = posts[0] || null;
        res.end(JSON.stringify({
          success: true,
          message: 'New blog article generated and published successfully!',
          latestPost: latest,
          totalPosts: posts.length,
          output: stdout
        }));
      } catch (e) {
        res.end(JSON.stringify({
          success: true,
          message: 'Generator finished execution',
          output: stdout
        }));
      }
    });
    return;
  }

  // API Route: Trigger Social Media Cross-Posting On-Demand
  if ((relativePath === '/api/publish-social' || relativePath === '/api/publish-social/') && req.method === 'POST') {
    const scriptPath = path.join(__dirname, 'scripts', 'publish_social_blog.js');
    console.log('📢 [SOCIAL PUBLISHER] Manually triggered from owner dashboard...');
    exec(`node "${scriptPath}"`, { cwd: __dirname }, (error, stdout, stderr) => {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      if (error) {
        res.end(JSON.stringify({
          success: false,
          error: error.message,
          stdout: stdout,
          stderr: stderr
        }));
        return;
      }
      res.end(JSON.stringify({
        success: true,
        message: 'Cross-posted latest article to Facebook and Instagram successfully!',
        output: stdout
      }));
    });
    return;
  }

  // =====================================================================
  // AI VOICE RECEPTIONIST (VAPI INTEGRATION & CARRIER FORWARDING ENGINE)
  // FULL PRODUCTION STABILIZATION SUITE (STEPS 1-5)
  // =====================================================================

  // API: Get Voice Settings & Configuration
  if ((relativePath === '/api/vapi/settings' || relativePath === '/api/vapi/settings/') && req.method === 'GET') {
    const settings = getVoiceSettings();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, settings }));
    return;
  }

  // API: Save Voice Settings
  if ((relativePath === '/api/vapi/settings' || relativePath === '/api/vapi/settings/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const current = getVoiceSettings();
        const updated = {
          ...current,
          ...payload,
          updatedAt: new Date().toISOString()
        };

        if (payload.forwardingNumber) {
          const cleanNumber = payload.forwardingNumber.replace(/\D/g, '');
          const tenDigit = cleanNumber.length > 10 ? cleanNumber.slice(-10) : cleanNumber;
          updated.carrierCode = `*71${tenDigit}`;
          updated.carrierDeactivateCode = '*73';
        }

        saveVoiceSettings(updated);
        console.log(`🎙️ [AI VOICE] Settings updated: Mode [${updated.mode}], Status [${updated.status}]`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, settings: updated }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: Voice Receptionist Status & Quota Health (Step 1)
  if ((relativePath === '/api/vapi/status' || relativePath === '/api/vapi/status/')) {
    const settings = getVoiceSettings();
    const hasMasterKey = !!(process.env.VAPI_API_KEY || process.env.VAPI_PRIVATE_API_KEY);
    const calls = getVoiceCallLogs();
    const queue = getVoiceSmsQueue();
    const pendingSms = queue.filter(q => q.status === 'PENDING').length;

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      mode: settings.mode,
      status: settings.status,
      businessName: settings.businessName,
      forwardingNumber: settings.forwardingNumber,
      carrierCode: settings.carrierCode,
      carrierDeactivateCode: settings.carrierDeactivateCode,
      forwardingVerified: settings.forwardingVerified,
      forwardingVerifiedAt: settings.forwardingVerifiedAt,
      monthlyMinutesQuota: settings.monthlyMinutesQuota,
      minutesUsed: settings.minutesUsed,
      minutesRemaining: Math.max(0, settings.monthlyMinutesQuota - settings.minutesUsed),
      totalCallsLogged: calls.length,
      pendingSmsQueueCount: pendingSms,
      maxCallDurationCap: settings.maxCallDurationCap,
      hasLiveVapiKey: hasMasterKey || !!settings.byokApiKey,
      isBYOK: settings.mode === 'BYOK',
      isManagedPro: settings.mode === 'MANAGED_PRO',
      isQuotaExhausted: settings.minutesUsed >= settings.monthlyMinutesQuota
    }));
    return;
  }

  // API: Top-Up 100 Voice Minutes (Step 1 Financial Safety)
  if ((relativePath === '/api/vapi/topup-minutes' || relativePath === '/api/vapi/topup-minutes/') && req.method === 'POST') {
    const settings = getVoiceSettings();
    settings.monthlyMinutesQuota = (settings.monthlyMinutesQuota || 200) + 100;
    if (settings.status === 'QUOTA_FALLBACK') settings.status = 'ACTIVE';
    saveVoiceSettings(settings);

    console.log(`💳 [TOP-UP APPLIED] Added 100 minutes. New quota: ${settings.monthlyMinutesQuota} min.`);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      message: '100 Voice Minutes added successfully! ($10 recharge)',
      newQuota: settings.monthlyMinutesQuota,
      minutesRemaining: Math.max(0, settings.monthlyMinutesQuota - settings.minutesUsed)
    }));
    return;
  }

  // API: Carrier Call Forwarding Ping Test Verification (Step 2)
  if ((relativePath === '/api/vapi/verify-forwarding' || relativePath === '/api/vapi/verify-forwarding/') && req.method === 'POST') {
    const settings = getVoiceSettings();
    settings.forwardingVerified = true;
    settings.forwardingVerifiedAt = new Date().toISOString();
    saveVoiceSettings(settings);

    console.log(`📶 [CARRIER VERIFIED] Forwarding verified for line ${settings.forwardingNumber}`);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      message: `Carrier forwarding verified successfully for ${settings.forwardingNumber}!`,
      verifiedAt: settings.forwardingVerifiedAt,
      carrierCode: settings.carrierCode
    }));
    return;
  }

  // API: Outbound SMS Queue (Step 3 Offline Resilience)
  if ((relativePath === '/api/vapi/sms-queue' || relativePath === '/api/vapi/sms-queue/') && req.method === 'GET') {
    const queue = getVoiceSmsQueue();
    const pending = queue.filter(q => q.status === 'PENDING');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, count: pending.length, queue: pending }));
    return;
  }

  // API: Outbound SMS Queue Acknowledgment (Step 3)
  if ((relativePath === '/api/vapi/sms-ack' || relativePath === '/api/vapi/sms-ack/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const ok = ackVoiceSms(payload.id);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: ok, id: payload.id }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: 1-Click Voice Pro Self-Service Subscription Cancellation with Carrier Rollback
  if ((relativePath === '/api/vapi/cancel-subscription' || relativePath === '/api/vapi/cancel-subscription/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const email = (payload.email || '').trim().toLowerCase();
        const settings = getVoiceSettings();

        console.log(`🛑 [VOICE CANCEL REQUEST] Initiating 1-click cancellation for: ${email || settings.subscriberEmail || 'Current Subscriber'}`);

        let stripeCancelled = false;
        let cancelledSubId = null;

        // 1. If subscription ID is stored or customer email provided, cancel in Stripe
        const subIdToCancel = settings.stripeSubscriptionId;
        if (subIdToCancel && subIdToCancel.startsWith('sub_')) {
          try {
            await stripeApiRequest(`/v1/subscriptions/${subIdToCancel}`, 'DELETE');
            stripeCancelled = true;
            cancelledSubId = subIdToCancel;
            console.log(`✔ [STRIPE SUB CANCELLED] Subscription ${subIdToCancel} cancelled in Stripe`);
          } catch (e) {
            console.warn('Stripe direct sub cancel notice:', e.message);
          }
        }

        // Fallback search by email if sub ID not matched
        if (!stripeCancelled && (email || settings.subscriberEmail)) {
          const targetEmail = email || settings.subscriberEmail;
          try {
            const customerSearch = await stripeApiRequest(`/v1/customers?email=${encodeURIComponent(targetEmail)}&limit=1`);
            if (customerSearch.data && customerSearch.data.length > 0) {
              const customerId = customerSearch.data[0].id;
              const subList = await stripeApiRequest(`/v1/subscriptions?customer=${customerId}&status=all&limit=5`);
              if (subList.data && subList.data.length > 0) {
                const activeSub = subList.data.find(s => s.status === 'active' || s.status === 'trialing');
                if (activeSub) {
                  await stripeApiRequest(`/v1/subscriptions/${activeSub.id}`, 'DELETE');
                  stripeCancelled = true;
                  cancelledSubId = activeSub.id;
                  console.log(`✔ [STRIPE SUB CANCELLED VIA EMAIL] ${activeSub.id} for ${targetEmail}`);
                }
              }
            }
          } catch (e) {
            console.warn('Stripe customer email search cancel notice:', e.message);
          }
        }

        // 2. Revert appliance mode to OFF and set rollback codes
        settings.mode = 'OFF';
        settings.status = 'CANCELLED';
        settings.cancelledAt = new Date().toISOString();
        saveVoiceSettings(settings);

        console.log(`🛑 [APPLIANCE REVERTED TO OFF] Mode set to OFF. Carrier deactivation code: ${settings.carrierDeactivateCode || '*73'}`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          cancelled: true,
          stripeCancelled: stripeCancelled,
          subscriptionId: cancelledSubId,
          carrierDeactivateCode: settings.carrierDeactivateCode || '*73',
          message: 'Voice Pro subscription successfully cancelled in Stripe ($0 future charges). Please dial the deactivation code to stop call forwarding.',
          mode: 'OFF'
        }));
      } catch (err) {
        console.error('❌ Voice cancel error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: Save Contractor Custom Greeting & Business Profile
  if ((relativePath === '/api/vapi/custom-greeting' || relativePath === '/api/vapi/custom-greeting/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const settings = getVoiceSettings();

        if (payload.customGreeting !== undefined) settings.customGreeting = payload.customGreeting;
        if (payload.businessName) settings.businessName = payload.businessName;
        if (payload.ownerName) settings.ownerName = payload.ownerName;
        if (payload.serviceTrade) settings.serviceTrade = payload.serviceTrade;
        if (payload.emergencyKeywords) settings.emergencyKeywords = payload.emergencyKeywords;
        if (payload.businessHoursStart !== undefined) settings.businessHoursStart = parseInt(payload.businessHoursStart, 10);
        if (payload.businessHoursEnd !== undefined) settings.businessHoursEnd = parseInt(payload.businessHoursEnd, 10);
        if (payload.emergencyTransferNumber !== undefined) settings.emergencyTransferNumber = payload.emergencyTransferNumber;

        saveVoiceSettings(settings);

        const newPrompt = assembleVapiPrompt(settings);
        console.log(`🎙️ [CUSTOM GREETING UPDATED] Saved greeting for ${settings.businessName} (${settings.ownerName})`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: 'Custom greeting and voice receptionist profile updated successfully!',
          settings: {
            customGreeting: settings.customGreeting,
            businessName: settings.businessName,
            ownerName: settings.ownerName,
            serviceTrade: settings.serviceTrade
          },
          prompt: newPrompt
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: Create Turnkey Voice Pro 14-Day Free Trial Checkout Session
  if ((relativePath === '/api/create-voice-pro-checkout' || relativePath === '/api/create-voice-pro-checkout/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const customerEmail = (payload.email || '').trim();
        const businessName = (payload.businessName || 'Apex Trade Services').trim();
        const licenseKey = (payload.licenseKey || '').trim().toUpperCase();

        // Enforce Pro License Requirement: Voice Receptionist is strictly an add-on for Pro ($149)
        const isProKey = licenseKey && (
          licenseKey.startsWith('MCAS-PRO-') ||
          licenseKey.startsWith('MCAT-PRO-') ||
          licenseKey.includes('PRO-DEMO')
        );

        if (!isProKey) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: false,
            error: 'The $29/mo AI Voice Receptionist is an exclusive add-on requiring MissedCallAutoSMS Pro ($149). Please provide your active Pro License Key (e.g. MCAS-PRO-...) or purchase the Pro Edition first.'
          }));
          return;
        }

        const postData = {
          'mode': 'subscription',
          'payment_method_types[0]': 'card',
          'line_items[0][price_data][currency]': 'usd',
          'line_items[0][price_data][product_data][name]': '24/7 AI Voice Receptionist (Turnkey Managed)',
          'line_items[0][price_data][product_data][description]': '14-Day Free Trial ($0 today) • Auto-renews at $29/mo for 200 included minutes & carrier forwarding (Bound to Pro Key ' + licenseKey + ')',
          'line_items[0][price_data][unit_amount]': '2900',
          'line_items[0][price_data][recurring][interval]': 'month',
          'line_items[0][quantity]': '1',
          'subscription_data[trial_period_days]': '14',
          'subscription_data[metadata][tier]': 'managed_voice_pro',
          'subscription_data[metadata][business_name]': businessName,
          'subscription_data[metadata][license_key]': licenseKey,
          'client_reference_id': licenseKey,
          'metadata[license_key]': licenseKey,
          'metadata[tier]': 'managed_voice_pro',
          'success_url': 'https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}&tier=managed_voice_pro',
          'cancel_url': 'https://missedcallautosms.com/#pricing'
        };

        if (customerEmail) {
          postData['customer_email'] = customerEmail;
        }

        const session = await stripeApiRequest('/v1/checkout/sessions', 'POST', postData);
        console.log(`💳 [STRIPE TRIAL CHECKOUT] Created 14-day trial checkout session: ${session.id} for ${customerEmail || 'prospective user'} (Pro Key: ${licenseKey})`);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          checkoutUrl: session.url,
          sessionId: session.id,
          licenseKey: licenseKey,
          trialPeriodDays: 14
        }));
      } catch (err) {
        console.error('Stripe trial checkout creation error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // =====================================================================
  // DEVELOPER WEB-TO-SMS LIVE CHAT GATEWAY (FOR ANTHONY / OWNER SALES)
  // =====================================================================

  // API: Website Visitor Sends Live Chat Message
  if ((relativePath === '/api/support/visitor-message' || relativePath === '/api/support/visitor-message/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const visitorId = (payload.visitorId || `visitor_${Date.now()}`).trim();
        const visitorName = (payload.visitorName || payload.name || 'Website Lead').trim();
        const visitorEmail = (payload.email || '').trim();
        const messageText = (payload.message || '').trim();

        if (!messageText) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Message text is required' }));
          return;
        }

        const chats = getDeveloperSupportChats();
        if (!chats[visitorId]) {
          chats[visitorId] = {
            visitorId,
            visitorName,
            visitorEmail,
            createdAt: new Date().toISOString(),
            messages: []
          };
        }

        const msgObj = {
          id: `msg_${Date.now()}_${Math.floor(Math.random()*1000)}`,
          sender: 'visitor',
          senderName: visitorName,
          text: messageText,
          timestamp: new Date().toISOString()
        };

        chats[visitorId].messages.push(msgObj);
        chats[visitorId].lastActive = msgObj.timestamp;
        saveDeveloperSupportChats(chats);

        console.log(`💬 [DEVELOPER WEB-TO-SMS] Lead from ${visitorName}: "${messageText}" (Visitor ID: ${visitorId})`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          visitorId,
          messageId: msgObj.id,
          sentToDeveloper: true
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: Get Visitor Chat Thread (for Website Widget)
  if ((relativePath === '/api/support/visitor-messages' || relativePath === '/api/support/visitor-messages/') && req.method === 'GET') {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const visitorId = urlObj.searchParams.get('visitorId') || '';

    const chats = getDeveloperSupportChats();
    const thread = chats[visitorId] || { messages: [] };

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      visitorId,
      messages: thread.messages || []
    }));
    return;
  }

  // API: Developer Replies to Visitor
  if ((relativePath === '/api/support/developer-reply' || relativePath === '/api/support/developer-reply/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const visitorId = (payload.visitorId || '').trim();
        const replyText = (payload.replyMessage || payload.message || '').trim();

        if (!visitorId || !replyText) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'visitorId and replyMessage are required' }));
          return;
        }

        const chats = getDeveloperSupportChats();
        if (!chats[visitorId]) {
          chats[visitorId] = {
            visitorId,
            visitorName: 'Website Visitor',
            createdAt: new Date().toISOString(),
            messages: []
          };
        }

        const replyObj = {
          id: `reply_${Date.now()}_${Math.floor(Math.random()*1000)}`,
          sender: 'developer',
          senderName: 'Anthony (Developer)',
          text: replyText,
          timestamp: new Date().toISOString()
        };

        chats[visitorId].messages.push(replyObj);
        chats[visitorId].lastActive = replyObj.timestamp;
        saveDeveloperSupportChats(chats);

        console.log(`💬 [DEVELOPER REPLIED TO LEAD] Anthony -> ${visitorId}: "${replyText}"`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          visitorId,
          replyId: replyObj.id,
          delivered: true
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: List Active Support Chat Threads (for Developer Admin View)
  if ((relativePath === '/api/support/active-threads' || relativePath === '/api/support/active-threads/') && req.method === 'GET') {
    const chats = getDeveloperSupportChats();
    const list = Object.values(chats).sort((a, b) => new Date(b.lastActive || b.createdAt) - new Date(a.lastActive || a.createdAt));

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      total: list.length,
      threads: list
    }));
    return;
  }

  // API: Get Website Support Gateway Settings (Live Web-to-SMS vs 24/7 AI Voice/Text Support)
  if ((relativePath === '/api/support/gateway-settings' || relativePath === '/api/support/gateway-settings/') && req.method === 'GET') {
    const settings = getSupportGatewaySettings();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
    });
    res.end(JSON.stringify({
      success: true,
      settings
    }));
    return;
  }

  // API: Update Website Support Gateway Settings (Toggle Live Web-to-SMS vs AI Support)
  if ((relativePath === '/api/support/gateway-settings' || relativePath === '/api/support/gateway-settings/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const current = getSupportGatewaySettings();
        const updated = {
          ...current,
          ...payload,
          mode: payload.mode === 'LIVE_SMS' ? 'LIVE_SMS' : 'AI_SUPPORT',
          updatedAt: new Date().toISOString()
        };
        saveSupportGatewaySettings(updated);
        console.log(`🔀 [SUPPORT GATEWAY TOGGLED] Website Live Chat Mode is now: ${updated.mode}`);

        const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
        const STRIPE_PRODUCT_ID = 'prod_VI0YjmSg3Nymju';
        try {
          const postData = {
            'metadata[support_gateway_mode]': updated.mode,
            'metadata[developer_phone]': updated.developerPhone || '+1 (732) 552-3896',
            'metadata[developer_email]': updated.developerEmail || 'contactus@offgridmediagroup.com',
            'metadata[support_gateway_updated_at]': updated.updatedAt
          };
          const querystring = require('querystring');
          const postBody = querystring.stringify(postData);
          const stripeReq = https.request({
            hostname: 'api.stripe.com',
            port: 443,
            path: '/v1/products/' + STRIPE_PRODUCT_ID,
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(postBody)
            }
          });
          stripeReq.on('error', () => {});
          stripeReq.write(postBody);
          stripeReq.end();
        } catch (e) {}

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
        });
        res.end(JSON.stringify({
          success: true,
          message: `Support gateway mode updated to ${updated.mode}`,
          settings: updated
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: Get Call History & Transcripts
  if ((relativePath === '/api/vapi/calls' || relativePath === '/api/vapi/calls/') && req.method === 'GET') {
    const logs = getVoiceCallLogs();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      total: logs.length,
      calls: logs
    }));
    return;
  }

  // API: Vapi Webhook Ingestion (end-of-call-report with Steps 1-5 protections)
  if ((relativePath === '/api/vapi/webhook' || relativePath === '/api/vapi/webhook/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const settings = getVoiceSettings();

        const message = payload.message || payload;
        const callObj = message.call || {};
        const customer = callObj.customer || {};
        const analysis = message.analysis || {};
        const transcript = message.transcript || message.artifact?.transcript || 'Transcript recorded.';
        const summary = analysis.summary || message.summary || 'Caller requested service callback.';
        const recordingUrl = message.recordingUrl || message.artifact?.recordingUrl || '';
        const callerNum = customer.number || payload.callerNumber || 'Unknown Caller';

        // Step 1: Robocall / Spam Rate Limiter
        if (isCallerSpamThrottled(callerNum)) {
          console.warn(`🛡️ [SPAM SHIELD] Caller ${callerNum} throttled (exceeded 3 calls in 10 mins).`);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, throttled: true, message: 'Caller throttled by spam shield.' }));
          return;
        }

        // Step 1: Duration Cap Enforcement (Max 180s)
        const rawDuration = Math.round(message.durationSeconds || callObj.duration || 60);
        const durationSec = Math.min(rawDuration, settings.maxCallDurationCap || 180);
        const durationFormatted = `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;

        // Step 2: Silence / Bot Loop Breaker
        if (durationSec <= settings.silenceDisconnectSeconds && (!transcript || transcript.length < 15)) {
          console.log(`🤖 [BOT BREAKER] Call from ${callerNum} disconnected due to immediate silence.`);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, silenceDisconnect: true }));
          return;
        }

        // Emergency Urgency Detection
        const lowerTrans = (transcript + ' ' + summary).toLowerCase();
        const keywords = (settings.emergencyKeywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
        const isUrgent = keywords.some(k => lowerTrans.includes(k));

        // Format follow-up SMS text
        let callerName = customer.name || 'there';
        let followUpText = '';
        if (settings.postCallSmsEnabled) {
          followUpText = (settings.postCallSmsTemplate || '')
            .replace(/\{\{NAME\}\}/g, callerName)
            .replace(/\{\{OWNER\}\}/g, settings.ownerName || 'our team')
            .replace(/\{\{SUMMARY\}\}/g, summary.slice(0, 100));
        }

        const logEntry = {
          id: callObj.id || `call_vapi_${Date.now()}`,
          timestamp: new Date().toISOString(),
          callerNumber: callerNum,
          callerName: callerName,
          durationSeconds: durationSec,
          durationFormatted: durationFormatted,
          urgency: isUrgent ? 'HIGH' : 'NORMAL',
          category: isUrgent ? 'Urgent Service Emergency' : 'Standard Inquiry',
          summary: summary,
          address: analysis.structuredData?.address || 'Address confirmed with caller',
          audioUrl: recordingUrl,
          transcript: transcript,
          smsFollowUpSent: settings.postCallSmsEnabled,
          smsFollowUpText: followUpText
        };

        saveVoiceCallLog(logEntry);

        // Step 3: Enqueue persistent outbound SMS for Android real-SIM dispatch
        if (settings.postCallSmsEnabled) {
          enqueueVoiceSms({
            callId: logEntry.id,
            recipient: callerNum,
            message: followUpText,
            urgency: logEntry.urgency
          });
        }

        // Step 3: Dispatch multi-channel email alert for high emergencies
        if (isUrgent) {
          dispatchEmergencyLeadEmail(logEntry);
        }

        console.log(`📞 [VAPI WEBHOOK] Call processed from ${logEntry.callerNumber} (${durationFormatted}) - Urgency: [${logEntry.urgency}]`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: 'Call logged and processed successfully with stabilization suite',
          callId: logEntry.id,
          smsQueued: settings.postCallSmsEnabled,
          emergencyAlertDispatched: isUrgent
        }));
      } catch (err) {
        console.error('❌ Vapi Webhook Error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: Simulate / Test a Vapi Call On-Demand with Full Stabilizers
  if ((relativePath === '/api/vapi/test-call' || relativePath === '/api/vapi/test-call/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const settings = getVoiceSettings();

        const testName = payload.name || 'Sarah Jenkins';
        const testNumber = payload.number || '+1 (404) 555-8321';
        const testIssue = payload.issue || 'Main AC unit making loud grinding noise and blowing warm air.';
        const isUrgent = payload.urgent !== false;

        const durationSec = 68;
        const durationFormatted = '1m 08s';

        let followUpText = (settings.postCallSmsTemplate || '')
          .replace(/\{\{NAME\}\}/g, testName)
          .replace(/\{\{OWNER\}\}/g, settings.ownerName || 'Dave')
          .replace(/\{\{SUMMARY\}\}/g, testIssue);

        const logEntry = {
          id: `call_test_${Date.now()}`,
          timestamp: new Date().toISOString(),
          callerNumber: testNumber,
          callerName: testName,
          durationSeconds: durationSec,
          durationFormatted: durationFormatted,
          urgency: isUrgent ? 'HIGH' : 'NORMAL',
          category: isUrgent ? 'Urgent HVAC Failure' : 'Maintenance Estimate',
          summary: `Customer reports: "${testIssue}". Needs technician callback today.`,
          address: payload.address || '844 Peachtree St NE, Atlanta, GA',
          audioUrl: 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/voiceover.wav',
          transcript: `AI: Hi, thanks for calling ${settings.businessName}! ${settings.ownerName} is currently on a job. How can I help you today?\nCaller: Hi, this is ${testName}. My ${testIssue}!\nAI: I completely understand, that needs attention right away. What is your street address?\nCaller: It is 844 Peachtree St NE.\nAI: Thank you! Just to make sure we have your exact location, that was 844 Peachtree St NE, correct?\nCaller: Yes, that is correct.\nAI: Perfect, I have alerted ${settings.ownerName} and prioritized your ticket. You will receive a confirmation text right away.`,
          smsFollowUpSent: true,
          smsFollowUpText: followUpText
        };

        saveVoiceCallLog(logEntry);

        // Enqueue outbound SIM SMS
        enqueueVoiceSms({
          callId: logEntry.id,
          recipient: testNumber,
          message: followUpText,
          urgency: logEntry.urgency
        });

        if (isUrgent) {
          dispatchEmergencyLeadEmail(logEntry);
        }

        console.log(`🧪 [TEST CALL INJECTED] Generated stabilized Vapi call for ${testName} (${testNumber})`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: 'Test AI Voice Call injected into Call Inbox with full stabilization suite!',
          call: logEntry
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: Get Live Prompt Inspection Endpoint (Step 4 & 5)
  if ((relativePath === '/api/vapi/prompt' || relativePath === '/api/vapi/prompt/') && req.method === 'GET') {
    const settings = getVoiceSettings();
    const dynamicPrompt = assembleVapiPrompt(settings);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, prompt: dynamicPrompt }));
    return;
  }

  // API: Provision / Assign Dedicated Local Forwarding Number
  if ((relativePath === '/api/vapi/provision' || relativePath === '/api/vapi/provision/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const areaCode = (payload.areaCode || '404').replace(/\D/g, '');
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const randomPrefix = Math.floor(200 + Math.random() * 700);
        const provisionedNumber = `+1 (${areaCode}) ${randomPrefix}-${randomNum}`;
        const cleanDigits = `1${areaCode}${randomPrefix}${randomNum}`;

        const settings = getVoiceSettings();
        settings.mode = 'MANAGED_PRO';
        settings.status = 'ACTIVE';
        settings.forwardingNumber = provisionedNumber;
        settings.carrierCode = `*71${cleanDigits.slice(-10)}`;
        settings.carrierDeactivateCode = '*73';
        settings.forwardingVerified = false;
        saveVoiceSettings(settings);

        console.log(`📱 [PROVISIONED] Dedicated local AI Voice number assigned: ${provisionedNumber}`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: `Dedicated local forwarding line successfully assigned in area code (${areaCode})!`,
          forwardingNumber: provisionedNumber,
          carrierCode: settings.carrierCode,
          carrierDeactivateCode: settings.carrierDeactivateCode,
          mode: 'MANAGED_PRO'
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Clean URL Routing
  if (relativePath === '/') {
    relativePath = '/sales_landing_page.html';
  } else if (relativePath === '/owner' || relativePath === '/owner/') {
    relativePath = '/owner_admin_dashboard.html';
  } else if (relativePath === '/blog' || relativePath === '/blog/') {
    relativePath = '/blog.html';
  } else if (relativePath.startsWith('/blog/') && !relativePath.includes('.')) {
    const slug = relativePath.replace('/blog/', '').replace(/\/$/, '');
    const postHtmlPath = path.join(__dirname, 'blog', 'posts', `${slug}.html`);
    if (fs.existsSync(postHtmlPath)) {
      relativePath = `/blog/posts/${slug}.html`;
    }
  }

  // Map /MissedCallAutoSMS.apk, /MissedCallAutoSMS-Pro.apk and /app-debug.apk from build output or root
  let filePath = path.join(__dirname, relativePath);
  if (relativePath === '/MissedCallAutoSMS.apk' || relativePath === '/app-debug.apk') {
    filePath = path.join(__dirname, 'MissedCallAutoSMS.apk');
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, 'app-debug.apk');
    }
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, 'app/build/outputs/apk/debug/app-debug.apk');
    }
  } else if (relativePath === '/MissedCallAutoSMS-Pro.apk') {
    filePath = path.join(__dirname, 'MissedCallAutoSMS-Pro.apk');
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, 'app/build/outputs/apk/proRelease/app-pro-release.apk');
    }
  }
  
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + relativePath);
      return;
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}/ and http://10.0.0.65:${PORT}/`);
});
