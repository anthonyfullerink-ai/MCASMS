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
  versionCode: 17,
  versionName: '1.7.0',
  downloadUrl: 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS.apk',
  proDownloadUrl: 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS-Pro.apk',
  releaseNotes: '• 🎙️ Dual-Mode AI Voice Receptionist Test Call (In-App Speaker & Live Cellular)\n• 🧠 AI Model Selector with 1.5% Overage Markup for GPT-4o\n• 🎛️ Clean Voice Hub Studio with 1-Tap Carrier Forwarding (*71/*73)\n• ⚡ Real-Time Instant OTA Update Trigger & Firebase Push\n• 🛡️ Direct SIM Carrier SMS dispatch with 15s human jitter',
  mandatory: true,
  minSupportedVersion: 15
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

function getVapiConfig() {
  const envPath = path.join(__dirname, '.env');
  let privateKey = process.env.VAPI_PRIVATE_API_KEY || '';
  let assistantId = process.env.VAPI_ASSISTANT_ID || '';
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const km = envContent.match(/VAPI_PRIVATE_API_KEY=(.*)/);
    if (km && km[1]) privateKey = km[1].trim();
    const am = envContent.match(/VAPI_ASSISTANT_ID=(.*)/);
    if (am && am[1]) assistantId = am[1].trim();
  }
  return { privateKey, assistantId };
}

function vapiApiRequest(endpoint, method = 'GET', postJson = null) {
  return new Promise((resolve, reject) => {
    const { privateKey } = getVapiConfig();
    if (!privateKey) return reject(new Error('Vapi API key not configured'));

    const options = {
      hostname: 'api.vapi.ai',
      port: 443,
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${privateKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'MCASMS-Server/1.0'
      }
    };

    let payload = '';
    if (postJson) {
      payload = JSON.stringify(postJson);
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.message || parsed.error || `Vapi Error (${res.statusCode}): ${body}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Vapi response: ${body}`));
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
                licenseType === 'PRO' || price === 299.00 || price === 149.99 || data.isPro;
  const apkDownloadUrl = `https://missedcallautosms.com/MissedCallAutoSMS.apk`;
  const isFree = (price === 0 || licenseType === 'FREE');

  const brandTitle = isPro ? "Missed Call Auto SMS • Pro Automation Gateway" : "Missed Call Auto SMS";
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

        ${data.voiceActive ? `
        <!-- 24/7 AI Voice Receptionist Active Section -->
        <div style="background: linear-gradient(180deg, rgba(121,40,202,0.2) 0%, rgba(9,11,14,0.9) 100%); border: 1px solid #7928CA; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="font-size: 22px;">🎙️</span>
                <span style="font-weight: 800; color: #D8B4FE; font-size: 15px;">24/7 AI Voice Receptionist Active (14-Day Free Trial)</span>
            </div>
            <div style="font-size: 13px; color: #CBD5E0; line-height: 1.5; margin-bottom: 12px;">
                Your dedicated inbound call forwarding line is provisioned: <strong style="color: #00E676; font-family: monospace;">${escapeHtml(data.voiceForwardingNumber || '+1 (555) 349-2810')}</strong>
            </div>
            <div style="background: #090B0E; border: 1px dashed #00E676; border-radius: 8px; padding: 14px; text-align: center; margin-bottom: 12px;">
                <div style="font-size: 11px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 4px;">Carrier Conditional Call Forwarding Code</div>
                <div style="font-family: monospace; font-size: 18px; font-weight: 900; color: #00E676;">
                    *71${(data.voiceForwardingNumber || '5553492810').replace(/\D/g, '').slice(-10)}
                </div>
            </div>
            <div style="font-size: 12px; color: #949BAE; line-height: 1.5;">
                📞 <strong>Quick Carrier Setup:</strong> Dial the code above once from your Android phone's dialer. Your phone rings normally for 15s. If you don't answer, your carrier automatically routes the call to your AI assistant. Revert anytime by dialing <code>*73</code>.
            </div>
        </div>
        ` : ''}

        ${(!data.voiceActive && isPro) ? `
        <!-- Optional AI Voice Receptionist Add-On Notice for Pro-Only Users -->
        <div style="background: rgba(168, 85, 247, 0.05); border: 1px dashed rgba(168, 85, 247, 0.35); border-radius: 12px; padding: 18px; margin-bottom: 24px; text-align: center;">
            <div style="font-size: 14px; font-weight: 800; color: #C084FC; margin-bottom: 4px;">🎙️ Need 24/7 AI Voice Answering?</div>
            <div style="font-size: 12px; color: #CBD5E0; margin-bottom: 12px; line-height: 1.5;">
                Your Pro license is pre-cleared for our <strong>Turnkey 24/7 AI Voice Receptionist</strong> add-on ($29/mo with 14-day free trial). When you're ready, activate your dedicated AI line with 1-click *71 carrier forwarding anytime.
            </div>
            <a href="https://missedcallautosms.com/sales_landing_page.html#voice-details" style="display: inline-block; background: rgba(168, 85, 247, 0.2); color: #C084FC; border: 1px solid #A855F7; font-weight: 700; font-size: 12px; padding: 8px 20px; border-radius: 20px; text-decoration: none;">
                Learn More & Add Voice Receptionist ($29/mo) →
            </a>
        </div>
        ` : ''}

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
            Need help? Contact support or access your admin dashboard at <a href="https://missedcallautosms.com/owner_admin_dashboard.html" style="color: ${themeColor};">MissedCallAutoSMS Admin</a>.
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

// ── Firebase/Firestore Dual-Write ─────────────────────────────────────────────
// Local JSON files remain the fast synchronous read source for the local server.
// All writes also asynchronously mirror to Firestore for production persistence.
let _firestoreModule = null;
function getFirestoreDb() {
  if (_firestoreModule) return _firestoreModule;
  try {
    _firestoreModule = require('./lib/firestore');
    return _firestoreModule;
  } catch (e) {
    console.warn('[Firestore] Module not loaded — add FIREBASE_SERVICE_ACCOUNT_KEY to .env:', e.message);
    return null;
  }
}



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

function getVapiConfig() {
  let apiKey = process.env.VAPI_PRIVATE_API_KEY || '';
  let assistantId = process.env.VAPI_ASSISTANT_ID || '';
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const keyMatch = content.match(/VAPI_PRIVATE_API_KEY=(.*)/);
      const asstMatch = content.match(/VAPI_ASSISTANT_ID=(.*)/);
      if (keyMatch && keyMatch[1]) apiKey = keyMatch[1].trim();
      if (asstMatch && asstMatch[1]) assistantId = asstMatch[1].trim();
    } catch (e) {}
  }
  return { apiKey, assistantId };
}

function vapiApiRequest(endpoint, method = 'GET', postJson = null) {
  const { apiKey } = getVapiConfig();
  if (!apiKey) {
    return Promise.reject(new Error('VAPI_PRIVATE_API_KEY is not configured'));
  }
  return new Promise((resolve, reject) => {
    const postData = postJson ? JSON.stringify(postJson) : null;
    const options = {
      hostname: 'api.vapi.ai',
      port: 443,
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    };
    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.message || `HTTP ${res.statusCode}: ${body}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ raw: body });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function getVoiceSettings() {
  const defaults = {
    mode: 'OFF', // 'OFF' | 'BYOK' | 'MANAGED_PRO'
    status: 'INACTIVE', // 'ACTIVE' | 'INACTIVE' | 'QUOTA_FALLBACK'
    businessName: "Anthony's Contractor Services",
    ownerName: 'Anthony',
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

  // Async Firestore mirror (non-blocking, fail-safe)
  const fdb = getFirestoreDb();
  if (fdb) {
    fdb.saveVoiceSettings(settings)
      .catch(e => console.warn('[Firestore] saveVoiceSettings mirror error:', e.message));
  }
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

const VOICE_BINDINGS_FILE = path.join(__dirname, '.voice_pro_bindings.json');
const MASTER_LICENSES_FILE = path.join(__dirname, 'data', 'master_licenses.json');

function getVoiceSubscribers() {
  if (fs.existsSync(VOICE_BINDINGS_FILE)) {
    try {
      const bindings = JSON.parse(fs.readFileSync(VOICE_BINDINGS_FILE, 'utf8'));
      return Object.keys(bindings).map(k => ({
        licenseKey: k,
        ...bindings[k]
      }));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveVoiceSubscriber(licenseKey, data) {
  let bindings = {};
  if (fs.existsSync(VOICE_BINDINGS_FILE)) {
    try { bindings = JSON.parse(fs.readFileSync(VOICE_BINDINGS_FILE, 'utf8')); } catch (e) {}
  }
  bindings[licenseKey] = {
    ...bindings[licenseKey],
    ...data,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(VOICE_BINDINGS_FILE, JSON.stringify(bindings, null, 2), 'utf8');

  // Async Firestore mirror (non-blocking, fail-safe)
  const fdb = getFirestoreDb();
  if (fdb) {
    fdb.saveVoiceBinding(licenseKey, bindings[licenseKey])
      .catch(e => console.warn('[Firestore] saveVoiceSubscriber mirror error:', e.message));
  }
}


function getMasterLicenses() {
  if (fs.existsSync(MASTER_LICENSES_FILE)) {
    try { return JSON.parse(fs.readFileSync(MASTER_LICENSES_FILE, 'utf8')); } catch (e) { return []; }
  }
  return [];
}

function saveMasterLicense(rec) {
  const list = getMasterLicenses();
  const idx = list.findIndex(r => r.key === rec.key);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...rec };
  } else {
    list.unshift(rec);
  }
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(MASTER_LICENSES_FILE, JSON.stringify(list, null, 2), 'utf8');

  // Async Firestore mirror (non-blocking, fail-safe)
  const fdb = getFirestoreDb();
  if (fdb && rec.key) {
    fdb.saveMasterLicense(rec)
      .catch(e => console.warn('[Firestore] saveMasterLicense mirror error:', e.message));
  }
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
  const activity = (settings.contractorActivity || 'hands full').toLowerCase();
  const agentName = settings.agentName || settings.ownerName || 'your AI receptionist';

  let timeGreeting = '';
  if (isDaytime) {
    timeGreeting = `You are answering during normal business hours (${settings.businessHoursStart}:00 - ${settings.businessHoursEnd}:00). Inform the caller that ${settings.ownerName} is currently ${activity}, and you are taking down their details so they can call or text back within 15 minutes.`;
  } else {
    timeGreeting = `You are answering AFTER-HOURS (Shop closed). Inform the caller that regular dispatch resumes at ${settings.businessHoursStart}:00 AM, but our emergency response is active for critical hazards like active water leaks or electrical sparking. Ask: "Is this an active emergency, or would you like us to schedule a quote for tomorrow morning?"`;
  }

  const openingGreeting = (settings.customGreeting && settings.customGreeting.trim())
    ? `CUSTOM FIRST GREETING: When answering, say exactly: "${settings.customGreeting.trim()}"`
    : `DEFAULT FIRST GREETING: "Hi, thanks for calling ${settings.businessName}! I'm ${agentName}, your AI receptionist. ${settings.ownerName} is currently ${activity}. How can I help you today?"`;

  return `
You are the professional, friendly AI voice receptionist for "${settings.businessName}" (${settings.serviceTrade}).
AI Agent Name: ${agentName}
Technician / Owner Name: ${settings.ownerName}
Current Status: ${activity}

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

function generateVoiceUnlockEmailHtml(params) {
  const { customerName, customerEmail, licenseKey, voiceSubWaived } = params;
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
      <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Welcome, ${escapeHtml(customerName)}!</h2>
      <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
        Your 24/7 AI Voice Receptionist platform feature is unlocked and active on your license key <strong>${escapeHtml(licenseKey)}</strong>. You can now customize your AI business instructions, triage flows, and emergency rules directly inside the Android app.
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

function generateCreditPackEmailHtml(customerName, minutesAdded = 40, packAmount = "10.00", newBalance = 40) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>AI Voice Minutes Loaded</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 600px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px; text-align: center;">
        <div style="font-size: 44px; margin-bottom: 8px;">⚡🎙️</div>
        <h1 style="color: #00E676; margin: 0 0 10px 0; font-size: 24px; font-weight: 900;">+${minutesAdded} AI Minutes Added!</h1>
        <p style="color: #CBD5E0; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">
            Hi ${escapeHtml(customerName)}, your payment of <strong>$${packAmount}</strong> was successful. We've added <strong>${minutesAdded} minutes</strong> to your AI Voice Receptionist balance. Current Balance: <strong>${newBalance} minutes</strong>.
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

// ═══════════════════════════════════════════════════════════════════
//  CONTENT ENGINE & BLOG ZERO-IMAGE-REUSE SAFEGUARDS
// ═══════════════════════════════════════════════════════════════════
function isImageAlreadyUsedInBlog(imageUrl, currentSlug = null) {
  if (!imageUrl) return false;
  const targetBase = path.basename(imageUrl).toLowerCase();
  const blogPostsFile = path.join(__dirname, 'blog', 'posts.json');
  if (fs.existsSync(blogPostsFile)) {
    try {
      const blogPosts = JSON.parse(fs.readFileSync(blogPostsFile, 'utf8'));
      for (const p of blogPosts) {
        if (currentSlug && p.slug === currentSlug) continue;
        const pImg = p.imageUrl || p.image || '';
        if (pImg && path.basename(pImg).toLowerCase() === targetBase) {
          return true;
        }
      }
    } catch (e) {}
  }
  return false;
}

async function executePostPublish(post) {
  const CE_DATA_DIR = path.join(__dirname, 'data');
  const isoDate = new Date().toISOString();
  const formattedDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const format = post.format || ((post.channelTargets && post.channelTargets.includes('blog')) ? 'blog_article' : 'social_card');
  const channels = post.channelTargets || (format === 'blog_article' ? ['blog', 'facebook'] : ['facebook', 'instagram']);

  const token = process.env.META_PAGE_ACCESS_TOKEN || '';
  const fbPageId = (process.env.FB_PAGE_ID && process.env.FB_PAGE_ID !== 'true' && process.env.FB_PAGE_ID !== 'false') ? process.env.FB_PAGE_ID : '1248332278370968';
  const igUserId = (process.env.IG_USER_ID && process.env.IG_USER_ID !== 'true' && process.env.IG_USER_ID !== 'false') ? process.env.IG_USER_ID : '17841428781387416';

  const { postGraphApi, getGraphApi } = require('./scripts/publish_omnichannel');

  let slug = null;
  let socialResults = { facebook: null, instagram: null };

  // ─────────────────────────────────────────────────────────────
  // 1. FORMAT: blog_article (Long-form educational authority + FB link post)
  // ─────────────────────────────────────────────────────────────
  if (format === 'blog_article' || channels.includes('blog')) {
    slug = (post.title || 'article').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const blogPostsFile = path.join(__dirname, 'blog', 'posts.json');

    // STRICT ZERO-REUSE SAFEGUARD
    if (!post.imageUrl) {
      throw new Error(`[ZeroReuseGuard] Cannot publish blog post "${post.title}" because post.imageUrl is missing. Every post must have a bespoke image assigned.`);
    }

    if (isImageAlreadyUsedInBlog(post.imageUrl, slug)) {
      throw new Error(`[ZeroReuseGuard] Image "${path.basename(post.imageUrl)}" is already in use by an existing article in blog/posts.json. Automatic recycling of images is strictly forbidden per Workspace Guidelines.`);
    }

    const imageUrl = post.imageUrl;

    // A. Update blog/posts.json
    if (fs.existsSync(blogPostsFile)) {
      try {
        const blogPosts = JSON.parse(fs.readFileSync(blogPostsFile, 'utf8'));
        const newBlogPost = {
          slug: slug,
          title: post.title,
          category: post.niche || "Industry Insights",
          date: formattedDate,
          isoDate: isoDate,
          readTime: 4,
          tags: post.tags || ["Speed to Lead", "Local Business", "Telephony"],
          snippet: post.hook,
          excerpt: post.hook,
          metaDescription: post.hook,
          image: imageUrl,
          imageUrl: imageUrl
        };
        const existingIdx = blogPosts.findIndex(b => b.slug === slug);
        if (existingIdx >= 0) {
          blogPosts[existingIdx] = newBlogPost;
        } else {
          blogPosts.unshift(newBlogPost);
        }
        fs.writeFileSync(blogPostsFile, JSON.stringify(blogPosts, null, 2), 'utf8');
        console.log(`[ContentEngine] 📚 Appended to blog/posts.json: ${slug} with unique image: ${path.basename(imageUrl)}`);
      } catch (e) {
        console.error("[ContentEngine] Failed to update blog/posts.json:", e.message);
        throw e;
      }
    }

    // B. Generate blog/posts/<slug>.html from template.html
    const templatePath = path.join(__dirname, 'blog', 'template.html');
    const postHtmlPath = path.join(__dirname, 'blog', 'posts', `${slug}.html`);
    if (fs.existsSync(templatePath)) {
      try {
        let html = fs.readFileSync(templatePath, 'utf8');
        const paragraphs = (post.narrativeBody || '').split('\n\n').map(p => `<p>${p.trim()}</p>`).join('\n');
        html = html
          .replace(/\{\{TITLE\}\}/g, post.title)
          .replace(/\{\{DESCRIPTION\}\}/g, post.hook)
          .replace(/\{\{SLUG\}\}/g, slug)
          .replace(/\{\{ISO_DATE\}\}/g, isoDate)
          .replace(/\{\{DATE\}\}/g, formattedDate)
          .replace(/\{\{CATEGORY\}\}/g, post.niche || "Industry Insights")
          .replace(/\{\{READ_TIME\}\}/g, "4")
          .replace(/\{\{IMAGE_URL\}\}/g, imageUrl)
          .replace(/\{\{CONTENT_HTML\}\}/g, paragraphs);
        fs.writeFileSync(postHtmlPath, html, 'utf8');
        console.log(`[ContentEngine] 📄 Generated article HTML: ${postHtmlPath}`);
      } catch (e) {
        console.error("[ContentEngine] Failed to generate article HTML:", e.message);
        throw e;
      }
    }

    // C. Update sitemap.xml
    try {
      const sitemapPath = path.join(__dirname, 'sitemap.xml');
      if (fs.existsSync(sitemapPath) && fs.existsSync(blogPostsFile)) {
        const blogPosts = JSON.parse(fs.readFileSync(blogPostsFile, 'utf8'));
        let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://missedcallautosms.com/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>https://missedcallautosms.com/blog</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
        blogPosts.forEach(p => {
          sitemapXml += `  <url>\n    <loc>https://missedcallautosms.com/blog/${p.slug}</loc>\n    <lastmod>${(p.isoDate || p.date || new Date().toISOString()).split('T')[0]}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
        });
        sitemapXml += `</urlset>\n`;
        fs.writeFileSync(sitemapPath, sitemapXml, 'utf8');
      }
    } catch (siteErr) {
      console.warn('[ContentEngine] Could not update sitemap.xml:', siteErr.message);
    }

    // D. Social Cross-Posting to Facebook Page & Instagram Feed
    const articleUrl = `https://missedcallautosms.com/blog/${slug}`;
    if (token) {
      if (channels.includes('facebook')) {
        try {
          const fbMessage = `📢 New Article Published!\n\n${post.title}\n\n${post.hook || ''}\n\n👉 Read the full breakdown: ${articleUrl}\n\n#missedcallautosms #smallbusiness #contractorlife #speedtolead`;
          const fbRes = await postGraphApi(`/v20.0/${fbPageId}/feed`, {
            message: fbMessage,
            link: articleUrl,
            access_token: token
          });
          socialResults.facebook = { success: true, id: fbRes.id };
          console.log(`[ContentEngine] 🎉 Facebook Blog Link Post LIVE! ID: ${fbRes.id}`);
        } catch (err) {
          socialResults.facebook = { success: false, error: err.message };
          console.warn(`[ContentEngine] ⚠️ Facebook Blog Link failed:`, err.message);
        }
      }

      if (channels.includes('instagram')) {
        try {
          const igCaption = `🚀 ${post.title}\n\n${post.hook || ''}\n\nRead the full guide at missedcallautosms.com/blog/${slug} (Link in bio!)\n\n#missedcallautosms #speedtolead #contractors`;
          const containerRes = await postGraphApi(`/v20.0/${igUserId}/media`, {
            image_url: imageUrl,
            caption: igCaption,
            access_token: token
          });
          await new Promise(r => setTimeout(r, 3000));
          const pubRes = await postGraphApi(`/v20.0/${igUserId}/media_publish`, {
            creation_id: containerRes.id,
            access_token: token
          });
          socialResults.instagram = { success: true, id: pubRes.id };
          console.log(`[ContentEngine] 🎉 Instagram Feed Post LIVE! ID: ${pubRes.id}`);
        } catch (err) {
          socialResults.instagram = { success: false, error: err.message };
          console.warn(`[ContentEngine] ⚠️ Instagram Feed Post failed:`, err.message);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. FORMAT: social_card / feed_post (1:1 Square Feed Graphics)
  // ─────────────────────────────────────────────────────────────
  else if (format === 'social_card' || format === 'feed_post') {
    if (!post.imageUrl) {
      throw new Error(`[ZeroReuseGuard] Cannot publish social card "${post.title}" without post.imageUrl.`);
    }

    const captionText = `${post.title}\n\n${post.narrativeBody || post.hook}\n\nTry Missed Call Auto SMS free for 3 days ($0.00 today) at missedcallautosms.com`;

    if (token) {
      // Facebook Page Photo Post
      if (channels.includes('facebook')) {
        try {
          console.log(`[ContentEngine] 📸 Posting 1:1 Photo to Facebook Page...`);
          const fbRes = await postGraphApi(`/v20.0/${fbPageId}/photos`, {
            url: post.imageUrl,
            caption: captionText,
            access_token: token
          });
          socialResults.facebook = { success: true, id: fbRes.id };
          console.log(`[ContentEngine] 🎉 Facebook Feed Photo LIVE! ID: ${fbRes.id}`);
        } catch (err) {
          socialResults.facebook = { success: false, error: err.message };
          console.warn(`[ContentEngine] ⚠️ Facebook Feed Photo failed:`, err.message);
        }
      }

      // Instagram Feed Post
      if (channels.includes('instagram')) {
        try {
          console.log(`[ContentEngine] 📸 Posting 1:1 Photo to Instagram Feed...`);
          const container = await postGraphApi(`/v20.0/${igUserId}/media`, {
            image_url: post.imageUrl,
            caption: captionText,
            access_token: token
          });
          await new Promise(r => setTimeout(r, 3000));
          const pubRes = await postGraphApi(`/v20.0/${igUserId}/media_publish`, {
            creation_id: container.id,
            access_token: token
          });
          socialResults.instagram = { success: true, id: pubRes.id };
          console.log(`[ContentEngine] 🎉 Instagram Feed Photo LIVE! ID: ${pubRes.id}`);
        } catch (err) {
          socialResults.instagram = { success: false, error: err.message };
          console.warn(`[ContentEngine] ⚠️ Instagram Feed Photo failed:`, err.message);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. FORMAT: reel_video (9:16 Vertical Video Reels & Stories)
  // ─────────────────────────────────────────────────────────────
  else if (format === 'reel_video') {
    let videoUrl = post.videoUrl;
    if (!videoUrl || !videoUrl.startsWith('http')) {
      if (post.videoAsset) {
        videoUrl = `https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/${post.videoAsset}`;
      } else {
        videoUrl = `https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/ads/v150_ai_voice_launch_reel_9x16.mp4`;
      }
    }
    const coverUrl = post.imageUrl || `https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/social/contractor-speed-rule.jpg`;
    const reelCaption = `${post.title}\n\n${post.narrativeBody || post.hook}\n\nTry Missed Call Auto SMS free for 3 days ($0.00 today) - link in bio!`;

    if (token) {
      // Facebook Video / Reel
      if (channels.includes('facebook')) {
        try {
          console.log(`[ContentEngine] 🎬 Publishing Reel to Facebook Video API...`);
          const fbRes = await postGraphApi(`/v20.0/${fbPageId}/videos`, {
            file_url: videoUrl,
            title: post.title,
            description: reelCaption,
            access_token: token
          });
          socialResults.facebook = { success: true, id: fbRes.id };
          console.log(`[ContentEngine] 🎉 Facebook Reel LIVE! ID: ${fbRes.id}`);
        } catch (err) {
          socialResults.facebook = { success: false, error: err.message };
          console.warn(`[ContentEngine] ⚠️ Facebook Reel failed:`, err.message);
        }
      }

      // Instagram 9:16 Reel with Status Polling
      if (channels.includes('instagram')) {
        try {
          console.log(`[ContentEngine] 🎬 Creating Instagram Reel container (9:16)...`);
          const container = await postGraphApi(`/v20.0/${igUserId}/media`, {
            media_type: 'REELS',
            video_url: videoUrl,
            cover_url: coverUrl,
            caption: reelCaption,
            share_to_feed: true,
            access_token: token
          });

          console.log(`[ContentEngine] Polling Instagram Reel container ${container.id}...`);
          const delays = [4000, 6000, 8000, 10000, 15000, 20000];
          let ready = false;
          for (const d of delays) {
            await new Promise(r => setTimeout(r, d));
            const statusRes = await getGraphApi(`/v20.0/${container.id}?fields=status_code,status&access_token=${token}`);
            const statusCode = (statusRes.status_code || statusRes.status || '').toUpperCase();
            if (statusCode === 'FINISHED' || statusCode === 'READY') {
              ready = true;
              break;
            }
            if (statusCode === 'ERROR') {
              throw new Error(`Instagram Reel processing failed: ${JSON.stringify(statusRes)}`);
            }
          }

          if (ready) {
            const pubRes = await postGraphApi(`/v20.0/${igUserId}/media_publish`, {
              creation_id: container.id,
              access_token: token
            });
            socialResults.instagram = { success: true, id: pubRes.id };
            console.log(`[ContentEngine] 🎉 Instagram Reel LIVE! ID: ${pubRes.id}`);
          } else {
            console.warn(`[ContentEngine] Instagram Reel container still processing; proceeding asynchronously.`);
            socialResults.instagram = { success: true, containerId: container.id, status: 'processing' };
          }
        } catch (err) {
          socialResults.instagram = { success: false, error: err.message };
          console.warn(`[ContentEngine] ⚠️ Instagram Reel failed:`, err.message);
        }
      }
    }
  }

  // 4. Record to published_history.json
  const pubHistoryFile = path.join(CE_DATA_DIR, 'published_history.json');
  let pubHistory = [];
  if (fs.existsSync(pubHistoryFile)) {
    try { pubHistory = JSON.parse(fs.readFileSync(pubHistoryFile, 'utf8')); } catch (e) {}
  }
  pubHistory.unshift({
    id: post.id,
    title: post.title,
    slug: slug,
    format: format,
    imageUrl: post.imageUrl,
    videoUrl: post.videoUrl || post.videoAsset,
    publishedAt: isoDate,
    channels: channels,
    niche: post.niche,
    socialResults: socialResults
  });
  fs.writeFileSync(pubHistoryFile, JSON.stringify(pubHistory, null, 2), 'utf8');

  return { slug, format, publishedAt: isoDate, socialResults };
}

// ══════════════════════════════════════════════════════════════════════════════
// 🤝 REFERRAL & NET-PROFIT REV-SHARE ENGINE
// ══════════════════════════════════════════════════════════════════════════════
const REFERRAL_PARTNERS_FILE = path.join(__dirname, 'data/referral_partners.json');
const REFERRAL_LEDGER_FILE = path.join(__dirname, 'data/referral_ledger.json');
const REFERRAL_PAYOUTS_FILE = path.join(__dirname, 'data/referral_payouts.json');

function getReferralEconomics(productType, grossAmount = null) {
  let gross = 49.99;
  let cogs = 1.79;
  let productName = 'Base Appliance ($49.99 Lifetime)';

  switch (productType) {
    case 'base_appliance':
    case 'standard':
      gross = 49.99;
      cogs = 1.79; // $1.75 Stripe + $0.04 server delivery
      productName = 'Base Appliance ($49.99 Lifetime)';
      break;
    case 'pro_gateway':
    case 'pro':
      gross = 299.99;
      cogs = 10.00; // $9.00 Stripe fee + $1.00 relay reserve
      productName = 'Perpetual Pro Gateway ($299.99 Lifetime)';
      break;
    case 'pro_upgrade':
      gross = 249.99;
      cogs = 8.55; // $7.55 Stripe + $1.00 relay reserve
      productName = 'Perpetual Pro Upgrade ($249.99 Lifetime)';
      break;
    case 'voice_addon':
    case 'voice_sub':
      gross = 9.99;
      cogs = 2.09; // $0.59 Stripe + $1.50 DID line
      productName = 'AI Voice Receptionist ($9.99/mo)';
      break;
    case 'credit_pack':
      gross = 10.00;
      cogs = 4.79; // $0.59 Stripe + $4.20 Vapi raw 40m
      productName = 'Voice Credit Pack ($10.00 / 40 Mins)';
      break;
    default:
      if (grossAmount) {
        gross = Number(grossAmount);
        cogs = Math.round((gross * 0.035 + 0.30) * 100) / 100;
        productName = `Product ($${gross.toFixed(2)})`;
      }
      break;
  }

  if (grossAmount !== null && grossAmount !== undefined && !isNaN(grossAmount)) {
    gross = Number(grossAmount);
  }

  const netProfit = Math.max(0, Math.round((gross - cogs) * 100) / 100);
  return { gross, cogs, netProfit, productName };
}

function calculateReferralCommission(productType, grossAmount = null, revSharePct = 25) {
  const econ = getReferralEconomics(productType, grossAmount);
  const pct = Number(revSharePct) || 25;
  const commissionEarned = Math.round((econ.netProfit * (pct / 100)) * 100) / 100;
  return {
    ...econ,
    commissionPct: pct,
    commissionEarned
  };
}

function getReferralPartners() {
  if (fs.existsSync(REFERRAL_PARTNERS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(REFERRAL_PARTNERS_FILE, 'utf8'));
    } catch (e) {
      console.warn('[Referrals] Failed to parse referral_partners.json:', e.message);
    }
  }
  return [];
}

function saveReferralPartners(partners) {
  fs.mkdirSync(path.dirname(REFERRAL_PARTNERS_FILE), { recursive: true });
  fs.writeFileSync(REFERRAL_PARTNERS_FILE, JSON.stringify(partners, null, 2), 'utf8');
}

function getReferralLedger() {
  if (fs.existsSync(REFERRAL_LEDGER_FILE)) {
    try {
      const ledger = JSON.parse(fs.readFileSync(REFERRAL_LEDGER_FILE, 'utf8'));
      // Auto-transition PENDING_BUFFER to AVAILABLE if clearsAt <= now
      const now = new Date();
      let changed = false;
      ledger.forEach(tx => {
        if (tx.status === 'PENDING_BUFFER' && tx.clearsAt && new Date(tx.clearsAt) <= now) {
          tx.status = 'AVAILABLE';
          changed = true;
        }
      });
      if (changed) {
        saveReferralLedger(ledger);
      }
      return ledger;
    } catch (e) {
      console.warn('[Referrals] Failed to parse referral_ledger.json:', e.message);
    }
  }
  return [];
}

function saveReferralLedger(ledger) {
  fs.mkdirSync(path.dirname(REFERRAL_LEDGER_FILE), { recursive: true });
  fs.writeFileSync(REFERRAL_LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf8');
}

function getReferralPayouts() {
  if (fs.existsSync(REFERRAL_PAYOUTS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(REFERRAL_PAYOUTS_FILE, 'utf8'));
    } catch (e) {
      console.warn('[Referrals] Failed to parse referral_payouts.json:', e.message);
    }
  }
  return [];
}

function saveReferralPayouts(payouts) {
  fs.mkdirSync(path.dirname(REFERRAL_PAYOUTS_FILE), { recursive: true });
  fs.writeFileSync(REFERRAL_PAYOUTS_FILE, JSON.stringify(payouts, null, 2), 'utf8');
}

// Sync computed stats from ledger back to partners
function syncPartnerMetrics() {
  const partners = getReferralPartners();
  const ledger = getReferralLedger();

  partners.forEach(partner => {
    const txs = ledger.filter(t => t.partnerCode && t.partnerCode.toUpperCase() === partner.code.toUpperCase());
    let totalGross = 0;
    let totalNet = 0;
    let totalEarned = 0;
    let totalPaid = 0;
    let pendingBuffer = 0;
    let availablePayout = 0;

    txs.forEach(t => {
      if (t.status !== 'REFUNDED') {
        totalGross += Number(t.grossAmount) || 0;
        totalNet += Number(t.netProfit) || 0;
        totalEarned += Number(t.commissionEarned) || 0;
        if (t.status === 'PAID') {
          totalPaid += Number(t.commissionEarned) || 0;
        } else if (t.status === 'AVAILABLE') {
          availablePayout += Number(t.commissionEarned) || 0;
        } else if (t.status === 'PENDING_BUFFER') {
          pendingBuffer += Number(t.commissionEarned) || 0;
        }
      }
    });

    partner.totalGrossReferred = Math.round(totalGross * 100) / 100;
    partner.totalNetProfitReferred = Math.round(totalNet * 100) / 100;
    partner.totalEarnedCommission = Math.round(totalEarned * 100) / 100;
    partner.totalPaidCommission = Math.round(totalPaid * 100) / 100;
    partner.pendingBufferCommission = Math.round(pendingBuffer * 100) / 100;
    partner.availablePayoutCommission = Math.round(availablePayout * 100) / 100;
  });

  saveReferralPartners(partners);
  return partners;
}

function addReferralTransaction({ partnerCode, orderId, customerEmail, productType, grossAmount }) {
  if (!partnerCode) return null;
  const cleanCode = String(partnerCode).trim().toUpperCase();
  const partners = getReferralPartners();
  const partner = partners.find(p => p.code.toUpperCase() === cleanCode);
  if (!partner) {
    console.log(`⚠️ [Referral Engine] Code "${cleanCode}" not found in registered partners. Skipping ledger.`);
    return null;
  }

  const commission = calculateReferralCommission(productType, grossAmount, partner.revSharePct || 25);
  const now = new Date();
  const clearsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14-day anti-fraud buffer

  const newTx = {
    id: `ref_tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    orderId: orderId || `order_${Date.now()}`,
    date: now.toISOString(),
    partnerCode: partner.code,
    partnerName: partner.name,
    customerEmail: customerEmail || 'customer@unknown.com',
    productType: productType,
    productName: commission.productName,
    grossAmount: commission.gross,
    cogs: commission.cogs,
    netProfit: commission.netProfit,
    commissionPct: commission.commissionPct,
    commissionEarned: commission.commissionEarned,
    status: 'PENDING_BUFFER',
    clearsAt: clearsAt,
    payoutBatchId: null,
    payoutDate: null
  };

  const ledger = getReferralLedger();
  ledger.unshift(newTx);
  saveReferralLedger(ledger);
  syncPartnerMetrics();
  console.log(`🤝 [REFERRAL LOGGED] Partner ${partner.code} credited $${newTx.commissionEarned} (25% on net profit $${newTx.netProfit}) from order ${orderId}`);
  return newTx;
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
  if ((relativePath === '/api/stripe-webhook' || relativePath === '/api/stripe-webhook/' || relativePath === '/api/webhook/stripe' || relativePath === '/api/webhook/stripe/') && req.method === 'POST') {
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

            // Step A: Real Live Vapi Phone Number Provisioning
            const forwardingNumber = process.env.VAPI_PRIMARY_PHONE_NUMBER || '+1 (732) 660-9121';
            const cleanDigits = forwardingNumber.replace(/\D/g, '');
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

            // Save Voice Subscriber Binding & Master License
            saveVoiceSubscriber(licenseKey, {
              active: true,
              name: customerName,
              email: customerEmail,
              forwardingNumber: forwardingNumber,
              carrierCode: carrierCode,
              carrierDeactivateCode: carrierDeactivateCode,
              quotaMinutes: 200,
              minutesUsed: 0,
              subscriptionId: session.subscription || session.id,
              customerId: session.customer || null,
              stripeCustomerId: session.customer || null,
              boundAt: new Date().toISOString()
            });


            saveMasterLicense({
              key: licenseKey,
              customer: customerName,
              email: customerEmail,
              tier: 'PRO',
              type: 'PAID',
              price: '29.00/mo',
              voiceActive: true,
              voiceNumber: forwardingNumber,
              carrierCode: carrierCode,
              status: 'ACTIVE',
              date: new Date().toISOString()
            });

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

            // Check Referral Tracking
            const refCode = session.client_reference_id || metadata.referral_code || metadata.ref || metadata.aff;
            if (refCode) {
              addReferralTransaction({
                partnerCode: refCode,
                orderId: session.id,
                customerEmail,
                productType: 'voice_addon',
                grossAmount: 29.00
              });
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

          // AUTOMATION 2: Tier Determination ($9.99 Voice Add-On, $10 Credit Pack, $249 Upgrade, $299 Pro, $49.99 Base, or Legacy)
          const tierMeta = (metadata.tier || '').toLowerCase();
          const isVoiceAddon = (amountTotal === 999) || tierMeta === 'voice_addon' || tierMeta === 'voice_999';
          const isCreditPack = (amountTotal === 1000) || (amountTotal === 2500) || (amountTotal === 5000) || (amountTotal === 10000) || tierMeta === 'credit_pack' || tierMeta === 'voice_credits' || tierMeta === 'voice_credit_reload';
          const isProUpgrade = (amountTotal === 24999) || tierMeta === 'pro_upgrade' || tierMeta === 'pro_upgrade_249';
          const isProGateway = (amountTotal === 29999) || (amountTotal === 29900) || tierMeta === 'pro_gateway' || tierMeta === 'pro_automation';
          const isFrontDesk = (amountTotal === 9900) || tierMeta === 'front_desk_bundle' || tierMeta === 'autonomous_front_desk';
          const isTrial = (amountTotal === 0) || tierMeta === 'standard_trial';
          const isPro = isProGateway || isProUpgrade || isFrontDesk;
          const isBundle = isFrontDesk; // Stage 1 voice addon is now separate soft gate

          // === STAGE 2: Multi-Tier Credit Pack (+Minutes & 1st-Time Telephony Provisioning) ===
          if (isCreditPack) {
            let creditPackMinutes = 40;
            let creditPackCost = 10.00;
            if (amountTotal === 2500 || metadata.pack_tier === 'pack_25') {
              creditPackMinutes = 115;
              creditPackCost = 25.00;
            } else if (amountTotal === 5000 || metadata.pack_tier === 'pack_50') {
              creditPackMinutes = 250;
              creditPackCost = 50.00;
            } else if (amountTotal === 10000 || metadata.pack_tier === 'pack_100') {
              creditPackMinutes = 550;
              creditPackCost = 100.00;
            } else if (metadata.minutes) {
              creditPackMinutes = parseInt(metadata.minutes, 10) || 40;
              if (amountTotal > 0) creditPackCost = amountTotal / 100;
            }

            const candidateKey = (session.client_reference_id || metadata.license_key || metadata.key || '').trim().toUpperCase();
            const subscribers = getVoiceSubscribers();
            let sub = subscribers.find(s => (candidateKey && s.licenseKey === candidateKey) || (customerEmail && s.email && s.email.toLowerCase() === customerEmail.toLowerCase()));
            const masterList = getMasterLicenses();
            let masterLic = masterList.find(m => (candidateKey && m.key === candidateKey) || (customerEmail && m.email && m.email.toLowerCase() === customerEmail.toLowerCase()));

            const targetKey = candidateKey || sub?.licenseKey || masterLic?.key || generateKey(customerName, 0, true);
            const isFirstTimeProvisioning = !(sub?.vapiProvisioned || masterLic?.vapiProvisioned);

            let forwardingNumber = sub?.forwardingNumber || masterLic?.voiceNumber;
            let carrierCode = sub?.carrierCode || masterLic?.carrierCode;
            const carrierDeactivateCode = '*73';

            if (isFirstTimeProvisioning) {
              forwardingNumber = process.env.VAPI_PRIMARY_PHONE_NUMBER || '+1 (732) 660-9121';
              const cleanDigits = forwardingNumber.replace(/\D/g, '');
              carrierCode = `*71${cleanDigits.slice(-10)}`;
              console.log(`🎙️ [STAGE 2 PROVISIONING] Dedicated AI voice line ${forwardingNumber} (*71 code: ${carrierCode}) assigned to ${customerEmail}`);
            }

            const currentBalance = (typeof sub?.voiceMinutesBalance === 'number') ? sub.voiceMinutesBalance : ((typeof masterLic?.voiceMinutesBalance === 'number') ? masterLic.voiceMinutesBalance : 0);
            const newBalance = Math.round((currentBalance + creditPackMinutes) * 100) / 100;

            const settings = getVoiceSettings();
            settings.voiceMinutesBalance = newBalance;
            settings.isVoicePaused = false;
            settings.vapiProvisioned = true;
            settings.forwardingNumber = forwardingNumber;
            settings.carrierCode = carrierCode;
            settings.status = 'ACTIVE';
            saveVoiceSettings(settings);

            saveVoiceSubscriber(targetKey, {
              active: true,
              name: customerName,
              email: customerEmail,
              voiceEntitlement: true,
              voiceSubActive: true,
              vapiProvisioned: true,
              forwardingNumber,
              carrierCode,
              carrierDeactivateCode,
              voiceMinutesBalance: newBalance,
              ratePerMinute: 0.25,
              autoRebillEnabled: true,
              isVoicePaused: false,
              status: 'ACTIVE',
              provisionedAt: isFirstTimeProvisioning ? new Date().toISOString() : (sub?.provisionedAt || new Date().toISOString())
            });

            saveMasterLicense({
              key: targetKey,
              customer: customerName,
              email: customerEmail,
              voiceEntitlement: true,
              vapiProvisioned: true,
              voiceActive: true,
              voiceNumber: forwardingNumber,
              carrierCode: carrierCode,
              voiceMinutesBalance: newBalance,
              status: 'ACTIVE'
            });

            console.log(`💳 [STRIPE CREDIT PACK INGESTED] Credited +${creditPackMinutes} minutes ($${creditPackCost.toFixed(2)}) for ${customerEmail}. New balance: ${newBalance} min (First-Time Telephony Provisioned: ${isFirstTimeProvisioning})`);

            // Dispatch Email
            try {
              const resendKey = process.env.RESEND_API_KEY || (fs.existsSync('.env') && fs.readFileSync('.env', 'utf8').match(/RESEND_API_KEY=(.*)/)?.[1]?.trim());
              if (isFirstTimeProvisioning) {
                const emailHtml = generateVoiceProOnboardingEmailHtml({
                  customerName,
                  customerEmail,
                  licenseKey: targetKey,
                  forwardingNumber,
                  carrierCode,
                  carrierDeactivateCode,
                  monthlyMinutesQuota: creditPackMinutes
                });
                const safeEmail = customerEmail.replace(/[^a-zA-Z0-9]/g, '_');
                const fileName = `voice_provisioned_${Date.now()}_${safeEmail}.html`;
                fs.writeFileSync(path.join(SENT_EMAILS_DIR, fileName), emailHtml, 'utf8');

                if (resendKey) {
                  sendResendEmail(resendKey, customerEmail, `🎙️ Your Dedicated AI Voice Receptionist Line is Live! Line: ${forwardingNumber}`, emailHtml)
                    .catch(err => console.warn('Resend email error:', err.message));
                }
              } else {
                const emailHtml = generateCreditPackEmailHtml(customerName, creditPackMinutes, creditPackCost.toFixed(2), newBalance);
                const safeEmail = customerEmail.replace(/[^a-zA-Z0-9]/g, '_');
                const fileName = `credit_pack_${Date.now()}_${safeEmail}.html`;
                fs.writeFileSync(path.join(SENT_EMAILS_DIR, fileName), emailHtml, 'utf8');

                if (resendKey) {
                  sendResendEmail(resendKey, customerEmail, `⚡ +${creditPackMinutes} AI Voice Minutes Added to Your Account ($${creditPackCost.toFixed(2)})`, emailHtml)
                    .catch(err => console.warn('Resend email error:', err.message));
                }
              }
            } catch (e) {
              console.warn('Credit pack email warning:', e.message);
            }

            // Check Referral Tracking for Credit Pack
            const refCode = session.client_reference_id || metadata.referral_code || metadata.ref || metadata.aff;
            if (refCode) {
              addReferralTransaction({
                partnerCode: refCode,
                orderId: session.id,
                customerEmail,
                productType: 'credit_pack',
                grossAmount: creditPackCost
              });
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({
              received: true,
              type: 'voice_credit_pack',
              customerEmail,
              minutesCredited: 40,
              newBalance: newBalance,
              firstTimeProvisioned: isFirstTimeProvisioning,
              forwardingNumber: forwardingNumber,
              carrierCode: carrierCode
            }));
            return;
          }

          // === STAGE 1: $9.99/mo AI Voice Add-On (Soft Gate — $0 Out-of-Pocket Telephony COGS) ===
          if (isVoiceAddon) {
            const licenseKey = metadata.license_key || metadata.key || generateKey(customerName, 0, true);

            saveVoiceSubscriber(licenseKey, {
              active: true,
              name: customerName,
              email: customerEmail,
              voiceEntitlement: true,
              voiceSubActive: true,
              voiceSubWaived: false,
              vapiProvisioned: false,
              forwardingNumber: null,
              carrierCode: null,
              carrierDeactivateCode: '*73',
              voiceMinutesBalance: 0.0,
              ratePerMinute: 0.25,
              autoRebillEnabled: true,
              subscriptionId: session.subscription || session.id,
              customerId: session.customer || null,
              stripeCustomerId: session.customer || null,
              status: 'UNLOCKED_PENDING_PACK',
              boundAt: new Date().toISOString()
            });

            saveMasterLicense({
              key: licenseKey,
              customer: customerName,
              email: customerEmail,
              tier: 'VOICE_ADDON',
              type: 'SUBSCRIPTION',
              price: '9.99/mo',
              voiceEntitlement: true,
              voiceSubActive: true,
              voiceSubWaived: false,
              vapiProvisioned: false,
              voiceActive: false,
              voiceNumber: null,
              carrierCode: null,
              voiceMinutesBalance: 0.0,
              status: 'ACTIVE',
              date: new Date().toISOString()
            });

            // Dispatch Stage 1 Platform Unlock Email
            try {
              const emailHtml = generateVoiceUnlockEmailHtml({
                customerName,
                customerEmail,
                licenseKey,
                voiceSubWaived: false
              });
              const safeEmail = customerEmail.replace(/[^a-zA-Z0-9]/g, '_');
              const fileName = `voice_unlocked_${Date.now()}_${safeEmail}.html`;
              fs.writeFileSync(path.join(SENT_EMAILS_DIR, fileName), emailHtml, 'utf8');

              const resendKey = process.env.RESEND_API_KEY || (fs.existsSync('.env') && fs.readFileSync('.env', 'utf8').match(/RESEND_API_KEY=(.*)/)?.[1]?.trim());
              if (resendKey) {
                sendResendEmail(resendKey, customerEmail, `⚡ Your 24/7 AI Voice Receptionist Engine is Unlocked! (Key: ${licenseKey})`, emailHtml)
                  .catch(err => console.warn('Resend live email dispatch notice:', err.message));
              }
            } catch (e) {
              console.warn('Voice unlock email dispatch warning:', e.message);
            }

            // Referral tracking
            const refCode = session.client_reference_id || metadata.referral_code || metadata.ref || metadata.aff;
            if (refCode) {
              addReferralTransaction({
                partnerCode: refCode,
                orderId: session.id,
                customerEmail,
                productType: 'voice_addon',
                grossAmount: 9.99
              });
            }

            console.log(`🎙️ [STAGE 1 SOFT GATE COMPLETE] Voice Engine Unlocked for ${customerEmail}. Zero COGS incurred. Awaiting first $10 credit pack.`);

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({
              received: true,
              tier: 'voice_addon',
              licenseKey,
              customerEmail,
              voiceEntitlement: true,
              vapiProvisioned: false,
              voiceMinutesBalance: 0.0,
              status: 'UNLOCKED_PENDING_PACK',
              checkoutCreditPackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f'
            }));
            return;
          }

          const licenseKey = metadata.license_key || metadata.key || generateKey(customerName, isTrial ? 4 : 0, isPro);

          let bundleForwardingNumber = null;
          let bundleCarrierCode = null;

          if (isBundle) {
            bundleForwardingNumber = process.env.VAPI_PRIMARY_PHONE_NUMBER || '+1 (732) 660-9121';
            const cleanDigits = bundleForwardingNumber.replace(/\D/g, '');
            bundleCarrierCode = `*71${cleanDigits.slice(-10)}`;

            const settings = getVoiceSettings();
            settings.voiceSubActive = true;
            settings.isVoicePaused = false;
            settings.forwardingNumber = bundleForwardingNumber;
            settings.carrierCode = bundleCarrierCode;
            settings.subscriberEmail = customerEmail;
            settings.subscriberName = customerName;
            settings.stripeSubscriptionId = session.subscription || session.id;
            if (!settings.initialCreditsGranted) {
              settings.voiceMinutesBalance = 15.0; // 15 free test minutes
              settings.initialCreditsGranted = true;
            }
            saveVoiceSettings(settings);

            saveVoiceSubscriber(licenseKey, {
              active: true,
              name: customerName,
              email: customerEmail,
              forwardingNumber: bundleForwardingNumber,
              carrierCode: bundleCarrierCode,
              carrierDeactivateCode: '*73',
              voiceMinutesBalance: settings.voiceMinutesBalance || 15.0,
              ratePerMinute: 0.25,
              autoRebillEnabled: true,
              subscriptionId: session.subscription || session.id,
              customerId: session.customer || null,
              stripeCustomerId: session.customer || null,
              boundAt: new Date().toISOString()
            });

            console.log(`🎙️ [VOICE FRONT DESK BUNDLE BOUND] Key ${licenseKey} bound to ${bundleForwardingNumber}`);
          }

          let priceStr = '49.99';
          let tierLabel = 'STANDARD';
          if (isVoiceAddon) { priceStr = '9.99/mo'; tierLabel = 'VOICE_ADDON'; }
          else if (isProUpgrade) { priceStr = '249.99'; tierLabel = 'PRO'; }
          else if (isProGateway) { priceStr = '299.99'; tierLabel = 'PRO'; }
          else if (isFrontDesk) { priceStr = '99.00/mo'; tierLabel = 'AUTONOMOUS_FRONT_DESK'; }
          else if (isTrial) { priceStr = '0.00'; tierLabel = 'TRIAL'; }

          saveMasterLicense({
            key: licenseKey,
            customer: customerName,
            email: customerEmail,
            tier: tierLabel,
            type: (isTrial || isFrontDesk || isVoiceAddon) ? 'SUBSCRIPTION' : 'PAID',
            price: priceStr,
            voiceActive: isBundle,
            voiceNumber: bundleForwardingNumber,
            carrierCode: bundleCarrierCode,
            status: 'ACTIVE',
            date: new Date().toISOString()
          });

          // Dispatch Onboarding Email with License & APK
          try {
            const emailHtml = generateLicenseEmailHtml({
              customerName,
              customerEmail,
              licenseKey,
              tier: tierLabel,
              price: priceStr,
              voiceActive: isBundle,
              voiceForwardingNumber: bundleForwardingNumber
            });

            const safeEmail = customerEmail.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `license_${Date.now()}_${safeEmail}.html`;
            fs.writeFileSync(path.join(SENT_EMAILS_DIR, fileName), emailHtml, 'utf8');

            const resendKey = process.env.RESEND_API_KEY || (fs.existsSync('.env') && fs.readFileSync('.env', 'utf8').match(/RESEND_API_KEY=(.*)/)?.[1]?.trim());
            if (resendKey) {
              const subject = isBundle
                ? `⚡ Your Missed Call Auto SMS Pro + 24/7 AI Voice Receptionist Setup Guide`
                : (isPro ? `⚡ Your Missed Call Auto SMS Pro Automation License Key & Setup Guide` : `Your Missed Call Auto SMS License Key & Setup Guide`);
              sendResendEmail(resendKey, customerEmail, subject, emailHtml)
                .catch(err => console.warn('Resend email dispatch error:', err.message));
            }
          } catch (e) {
            console.warn('Email dispatch warning:', e.message);
          }

          // Record Referral Transaction if Referral Code Present
          const refCode = session.client_reference_id || metadata.referral_code || metadata.ref || metadata.aff;
          if (refCode && !isTrial) {
            let prodType = 'base_appliance';
            let gross = 49.99;
            if (isVoiceAddon) { prodType = 'voice_addon'; gross = 9.99; }
            else if (isProUpgrade) { prodType = 'pro_upgrade'; gross = 249.99; }
            else if (isProGateway) { prodType = 'pro_gateway'; gross = 299.99; }
            else if (isFrontDesk) { prodType = 'pro_gateway'; gross = 99.00; }
            else if (amountTotal > 0) { gross = amountTotal / 100; }

            addReferralTransaction({
              partnerCode: refCode,
              orderId: session.id,
              customerEmail,
              productType: prodType,
              grossAmount: gross
            });
          }

          console.log(`🔑 [STRIPE CHECKOUT COMPLETE] Issued ${isBundle ? 'Pro + Voice Bundle' : (isPro ? 'Pro' : (isTrial ? 'Trial' : 'Standard'))} license: ${licenseKey} to ${customerEmail}`);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            received: true,
            tier: isBundle ? 'pro_plus_voice' : (isTrial ? 'standard_trial' : (isPro ? 'pro_automation' : 'standard')),
            licenseKey,
            customerEmail,
            voiceActive: isBundle,
            voiceForwardingNumber: bundleForwardingNumber,
            carrierCode: bundleCarrierCode
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
        const apkDownloadUrl = `https://missedcallautosms.com/MissedCallAutoSMS.apk`;

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
      const settings = getVoiceSettings();

      // Check Master Licenses
      const masterList = getMasterLicenses();
      const masterLic = masterList.find(m => m.key === key);

      let voiceEntitlement = false;
      let voiceSubWaived = false;
      let vapiProvisioned = false;
      let voiceMinutesBalance = 0.0;
      let voiceForwardingNumber = null;
      let voiceCarrierCode = null;

      // Check Voice Pro Bindings
      const voiceBindingsFile = path.join(__dirname, '.voice_pro_bindings.json');
      if (fs.existsSync(voiceBindingsFile)) {
        try {
          const bindings = JSON.parse(fs.readFileSync(voiceBindingsFile, 'utf8'));
          if (bindings[key]) {
            const b = bindings[key];
            voiceEntitlement = !!(b.voiceEntitlement || b.voiceSubActive || b.voiceSubWaived || b.active);
            voiceSubWaived = !!b.voiceSubWaived;
            vapiProvisioned = !!b.vapiProvisioned;
            voiceForwardingNumber = b.forwardingNumber || null;
            voiceCarrierCode = b.carrierCode || null;
            voiceMinutesBalance = typeof b.voiceMinutesBalance === 'number' ? b.voiceMinutesBalance : 0.0;
          }
        } catch (e) {}
      }

      // Check Master License record
      if (masterLic) {
        if (masterLic.voiceEntitlement !== undefined) voiceEntitlement = !!masterLic.voiceEntitlement;
        if (masterLic.voiceSubWaived !== undefined) voiceSubWaived = !!masterLic.voiceSubWaived;
        if (masterLic.vapiProvisioned !== undefined) vapiProvisioned = !!masterLic.vapiProvisioned;
        if (masterLic.voiceNumber) voiceForwardingNumber = voiceForwardingNumber || masterLic.voiceNumber;
        if (masterLic.carrierCode) voiceCarrierCode = voiceCarrierCode || masterLic.carrierCode;
        if (masterLic.voiceMinutesBalance !== undefined) voiceMinutesBalance = masterLic.voiceMinutesBalance;
        if (masterLic.voiceActive) {
          voiceEntitlement = true;
          if (masterLic.voiceNumber) {
            vapiProvisioned = true;
          }
        }
      }

      // Master Pro Demo Key Bypass for instant testing
      if (key === 'MCAS-PRO-DEMO-89F2') {
        voiceEntitlement = true;
        vapiProvisioned = true;
        voiceForwardingNumber = voiceForwardingNumber || '+1 (555) 349-2810';
        voiceCarrierCode = voiceCarrierCode || '*715553492810';
        voiceMinutesBalance = 50.0;
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

      const isPaused = settings.isVoicePaused === true || (voiceMinutesBalance <= 0 && settings.autoRebillEnabled === false);
      const isVoiceActive = voiceEntitlement && vapiProvisioned && (voiceMinutesBalance > 0) && !isPaused;

      let keyStatus = isPaused ? 'PAUSED' : 'ACTIVE';
      let activationPrompt = null;
      if (voiceEntitlement && !vapiProvisioned) {
        keyStatus = 'UNLOCKED_PENDING_PACK';
        activationPrompt = 'Voice Engine Unlocked! Fund your first 40-minute credit pack ($10) to generate your dedicated carrier line and activate AI answering.';
      }

      return {
        valid: true,
        licenseKey: key,
        status: keyStatus,
        tier: isAgency ? 'AGENCY' : (isPro ? 'PRO' : 'STANDARD'),
        edition: isAgency ? 'Agency Fleet Partner' : (isPro ? 'Pro Automation Gateway ($299)' : 'Flagship Appliance Edition ($49.99)'),
        isPro: isPro || voiceEntitlement,
        perpetualPro: isPro && !key.includes('TRIAL'),
        voiceEntitlement: voiceEntitlement,
        voiceSubActive: voiceEntitlement && !voiceSubWaived,
        voiceSubWaived: voiceSubWaived,
        vapiProvisioned: vapiProvisioned,
        voiceActive: isVoiceActive,
        voiceForwardingNumber: voiceForwardingNumber,
        carrierCode: voiceCarrierCode,
        voiceEligible: true,
        voiceMinutesBalance: voiceMinutesBalance,
        autoRebillEnabled: settings.autoRebillEnabled !== false,
        isVoicePaused: isPaused,
        ratePerMinute: 0.25,
        packPriceDollars: 10.00,
        packMinutes: 40,
        checkoutCreditPackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f',
        creditPackTiers: [
          { id: 'pack_10', name: 'Starter Pack', price: 10.00, minutes: 40, ratePerMin: 0.250, discountPct: 0, url: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
          { id: 'pack_25', name: 'Growth Pack (+15 Free Mins)', price: 25.00, minutes: 115, ratePerMin: 0.217, discountPct: 13, bonusMinutes: 15, url: 'https://missedcallautosms.com/api/create-credit-pack-checkout?pack=25' },
          { id: 'pack_50', name: 'Pro Contractor (+50 Free Mins)', price: 50.00, minutes: 250, ratePerMin: 0.200, discountPct: 20, bonusMinutes: 50, url: 'https://missedcallautosms.com/api/create-credit-pack-checkout?pack=50' },
          { id: 'pack_100', name: 'Fleet Pack (+150 Free Mins)', price: 100.00, minutes: 550, ratePerMin: 0.181, discountPct: 28, bonusMinutes: 150, url: 'https://missedcallautosms.com/api/create-credit-pack-checkout?pack=100' }
        ],
        activationPrompt: activationPrompt,
        type: key.includes('TRIAL') ? 'TRIAL' : (key.includes('DEMO') ? 'DEMO' : (voiceSubWaived ? 'FREE_VOICE_COMP' : 'PAID')),
        deviceId: boundDevice,
        features: {
          dualSim: true,
          n8nWebhook: isPro || voiceEntitlement,
          centralWebhookBridge: isPro || voiceEntitlement,
          aiVoiceReceptionist: voiceEntitlement, // Unlocks UI controls inside the Android APK!
          aiVoiceLiveTelephony: isVoiceActive,   // True once carrier forwarding is active
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

        if (key) {
          // 1. Clear from device tokens cache
          const devCachePath = path.join(__dirname, '.device_tokens_cache.json');
          if (fs.existsSync(devCachePath)) {
            try {
              const devCache = JSON.parse(fs.readFileSync(devCachePath, 'utf8'));
              if (devCache[key]) {
                delete devCache[key];
                fs.writeFileSync(devCachePath, JSON.stringify(devCache, null, 2), 'utf8');
              }
            } catch (e) {}
          }

          // 2. Clear from agency fleet cache if it is an agency fleet key
          const fleetCachePath = path.join(__dirname, '.agency_fleet_cache.json');
          if (fs.existsSync(fleetCachePath)) {
            try {
              const fleetCache = JSON.parse(fs.readFileSync(fleetCachePath, 'utf8'));
              let modified = false;
              for (const ak of Object.keys(fleetCache)) {
                if (ak.startsWith('_')) continue;
                const cl = fleetCache[ak].clients;
                if (Array.isArray(cl)) {
                  const target = cl.find(c => c.licenseKey === key);
                  if (target) {
                    target.hardwareId = null;
                    target.status = 'PENDING_ACTIVATION';
                    modified = true;
                  }
                }
              }
              if (modified) {
                fs.writeFileSync(fleetCachePath, JSON.stringify(fleetCache, null, 2), 'utf8');
              }
            } catch (e) {}
          }
        }

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

  // API: Voice Receptionist Status & Quota Health
  if ((relativePath === '/api/vapi/status' || relativePath === '/api/vapi/status/')) {
    const settings = getVoiceSettings();
    const hasMasterKey = !!(process.env.VAPI_API_KEY || process.env.VAPI_PRIVATE_API_KEY);
    const calls = getVoiceCallLogs();
    const queue = getVoiceSmsQueue();
    const pendingSms = queue.filter(q => q.status === 'PENDING').length;
    const balance = typeof settings.voiceMinutesBalance === 'number' ? settings.voiceMinutesBalance : 15.0;
    const isPaused = settings.isVoicePaused === true || (balance <= 0 && settings.autoRebillEnabled === false);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      mode: settings.mode,
      status: isPaused ? 'PAUSED' : settings.status,
      businessName: settings.businessName,
      forwardingNumber: settings.forwardingNumber,
      carrierCode: settings.carrierCode,
      carrierDeactivateCode: settings.carrierDeactivateCode,
      forwardingVerified: settings.forwardingVerified,
      forwardingVerifiedAt: settings.forwardingVerifiedAt,
      voiceSubActive: settings.voiceSubActive !== false,
      voiceMinutesBalance: balance,
      autoRebillEnabled: settings.autoRebillEnabled !== false,
      isVoicePaused: isPaused,
      ratePerMinute: 0.25,
      packPriceDollars: 10.00,
      packSizeMinutes: 40,
      monthlyMinutesQuota: settings.monthlyMinutesQuota,
      minutesUsed: settings.minutesUsed,
      totalCallsLogged: calls.length,
      pendingSmsQueueCount: pendingSms,
      maxCallDurationCap: settings.maxCallDurationCap,
      hasLiveVapiKey: hasMasterKey || !!settings.byokApiKey,
      isBYOK: settings.mode === 'BYOK',
      isManagedPro: settings.mode === 'MANAGED_PRO'
    }));
    return;
  }

  // API: Top-Up Voice Credit Pack (Accepts optional { minutes, licenseKey, packTier })
  if ((relativePath === '/api/vapi/topup-minutes' || relativePath === '/api/vapi/topup-minutes/' || relativePath === '/api/vapi/buy-credits') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        let minsToAdd = 40;
        if (payload.minutes) {
          minsToAdd = parseFloat(payload.minutes) || 40;
        } else if (payload.packTier === 'pack_25' || payload.pack === '25') {
          minsToAdd = 115;
        } else if (payload.packTier === 'pack_50' || payload.pack === '50') {
          minsToAdd = 250;
        } else if (payload.packTier === 'pack_100' || payload.pack === '100') {
          minsToAdd = 550;
        }

        const settings = getVoiceSettings();
        settings.voiceMinutesBalance = Math.round(((settings.voiceMinutesBalance || 0) + minsToAdd) * 100) / 100;
        settings.isVoicePaused = false;
        if (settings.status === 'PAUSED_CREDITS_EXHAUSTED' || settings.status === 'PAUSED' || settings.status === 'QUOTA_FALLBACK') {
          settings.status = 'ACTIVE';
        }
        saveVoiceSettings(settings);

        if (payload.licenseKey) {
          const lKey = payload.licenseKey.trim().toUpperCase();
          const subscribers = getVoiceSubscribers();
          const sub = subscribers.find(s => s.licenseKey === lKey);
          if (sub) {
            sub.voiceMinutesBalance = Math.round(((sub.voiceMinutesBalance || 0) + minsToAdd) * 100) / 100;
            sub.isVoicePaused = false;
            saveVoiceSubscriber(lKey, sub);
          }
          const masterList = getMasterLicenses();
          const mLic = masterList.find(m => m.key === lKey);
          if (mLic) {
            mLic.voiceMinutesBalance = Math.round(((mLic.voiceMinutesBalance || 0) + minsToAdd) * 100) / 100;
            saveMasterLicense(mLic);
          }
        }

        console.log(`💳 [CREDITS TOP-UP APPLIED] Added ${minsToAdd} minutes. New balance: ${settings.voiceMinutesBalance} min.`);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: `${minsToAdd} Voice Minutes added successfully!`,
          minutesAdded: minsToAdd,
          newBalance: settings.voiceMinutesBalance,
          isVoicePaused: false
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // API: Toggle Auto-Rebill ($10 auto-pack when balance < 5 min)
  if ((relativePath === '/api/vapi/toggle-autorebill' || relativePath === '/api/vapi/toggle-autorebill/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const settings = getVoiceSettings();
        if (payload.autoRebillEnabled !== undefined) {
          settings.autoRebillEnabled = Boolean(payload.autoRebillEnabled);
        } else {
          settings.autoRebillEnabled = !settings.autoRebillEnabled;
        }

        if (!settings.autoRebillEnabled && (settings.voiceMinutesBalance || 0) <= 0) {
          settings.isVoicePaused = true;
          settings.status = 'PAUSED_CREDITS_EXHAUSTED';
        } else if (settings.autoRebillEnabled && (settings.voiceMinutesBalance || 0) > 0) {
          settings.isVoicePaused = false;
          settings.status = 'ACTIVE';
        }
        saveVoiceSettings(settings);
        console.log(`⚙️ [AUTO-REBILL TOGGLE] Auto-rebill set to [${settings.autoRebillEnabled}]. Paused: [${settings.isVoicePaused}]`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          autoRebillEnabled: settings.autoRebillEnabled,
          isVoicePaused: settings.isVoicePaused,
          balance: settings.voiceMinutesBalance
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
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
        if (payload.agentName) settings.agentName = payload.agentName;
        if (payload.serviceTrade) settings.serviceTrade = payload.serviceTrade;
        if (payload.contractorActivity) settings.contractorActivity = payload.contractorActivity;
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

  // API: Create Pro Automation Checkout Session (with optional 14-day Voice Pro Order Bump)
  if ((relativePath === '/api/create-pro-checkout' || relativePath === '/api/create-pro-checkout/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const includeVoice = Boolean(payload.includeVoice);
        const customerEmail = (payload.email || '').trim();
        const businessName = (payload.businessName || 'Pro Business').trim();

        // Custom stripe key header fallback (e.g. from local owner testing)
        const customKey = req.headers['x-stripe-key'];
        const activeStripeKey = customKey || getStripeKey();

        // Fallback if Stripe key is not configured: return direct Stripe payment link
        if (!activeStripeKey) {
          const fallbackUrl = includeVoice
            ? "https://buy.stripe.com/4gMeVdcFMaps6M0b572go0f"
            : "https://buy.stripe.com/cNi5kDdJQ558c6k2yB2go0b";
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            checkoutUrl: fallbackUrl,
            fallback: true,
            includeVoice
          }));
          return;
        }

        let postData = {};

        if (includeVoice) {
          // 24/7 AI Voice Receptionist ($9.99/mo)
          postData = {
            'mode': 'subscription',
            'payment_method_types[0]': 'card',
            
            'line_items[0][price_data][currency]': 'usd',
            'line_items[0][price_data][unit_amount]': '999',
            'line_items[0][price_data][recurring][interval]': 'month',
            'line_items[0][price_data][product_data][name]': 'Missed Call Auto SMS - 24/7 AI Voice Receptionist ($9.99/mo)',
            'line_items[0][price_data][product_data][description]': '24/7 Conversational AI Voice Phone Receptionist • 15 Free Test Minutes on Signup • Metered $0.25/min Usage in $10 Credit Packs • Native SIM Confirmation SMS • 1-Tap *71 Carrier Transfer',
            'line_items[0][quantity]': '1',

            'subscription_data[metadata][tier]': 'voice_receptionist',
            'subscription_data[metadata][monthly_fee]': '9.99',
            'subscription_data[metadata][business_name]': businessName,
            'metadata[tier]': 'voice_receptionist',
            'metadata[monthly_fee]': '9.99',
            'metadata[include_voice]': 'true',
            'metadata[business_name]': businessName,
            'success_url': 'https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}&tier=voice_receptionist',
            'cancel_url': 'https://missedcallautosms.com/#checkout'
          };
        } else {
          // STANDALONE: Pro Automation Gateway ($299.00 Perpetual)
          postData = {
            'mode': 'payment',
            'payment_method_types[0]': 'card',
            'line_items[0][price_data][currency]': 'usd',
            'line_items[0][price_data][unit_amount]': '29900',
            'line_items[0][price_data][product_data][name]': 'Missed Call Auto SMS - Pro Automation Gateway',
            'line_items[0][price_data][product_data][description]': 'Perpetual Gateway License • 1-Year Cloud Relay API Maintenance • Dual SIM Carrier Routing • Unlimited End-to-End™ Webhook Gateway (n8n/Zapier) • 100% A2P 10DLC Exempt',
            'line_items[0][quantity]': '1',
            'metadata[tier]': 'pro_gateway',
            'metadata[include_voice]': 'false',
            'metadata[business_name]': businessName,
            'success_url': 'https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}&tier=pro',
            'cancel_url': 'https://missedcallautosms.com/#checkout'
          };
        }

        if (customerEmail) {
          postData['customer_email'] = customerEmail;
        }

        const session = await stripeApiRequest('/v1/checkout/sessions', 'POST', postData);
        console.log(`💳 [STRIPE PRO CHECKOUT] Created session: ${session.id} (Include Voice: ${includeVoice})`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          checkoutUrl: session.url,
          sessionId: session.id,
          includeVoice
        }));
      } catch (err) {
        console.error('Stripe Pro checkout creation error:', err.message);
        // Fallback to static link
        const fallbackUrl = (typeof includeVoice !== 'undefined' && includeVoice)
          ? "https://buy.stripe.com/4gMeVdcFMaps6M0b572go0f"
          : "https://buy.stripe.com/cNi5kDdJQ558c6k2yB2go0b";
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          checkoutUrl: fallbackUrl,
          fallback: true,
          notice: err.message
        }));
      }
    });
    return;
  }

  // API: Create Credit Pack Checkout Session (POST & GET /api/create-credit-pack-checkout)
  if (relativePath === '/api/create-credit-pack-checkout' || relativePath === '/api/create-credit-pack-checkout/') {
    const handleCreditPackRequest = async (params) => {
      const tierKey = (params.packTier || params.pack || params.tier || '10').toString().toLowerCase();
      const licenseKey = (params.licenseKey || params.key || '').trim().toUpperCase();
      const customerEmail = (params.email || '').trim();
      const refCode = (params.ref || params.referral_code || '').trim();

      const CREDIT_TIERS = {
        '10': { id: 'pack_10', name: 'Missed Call Auto SMS - Starter Credit Pack (40 Mins)', amount: 1000, minutes: 40, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
        'pack_10': { id: 'pack_10', name: 'Missed Call Auto SMS - Starter Credit Pack (40 Mins)', amount: 1000, minutes: 40, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
        '25': { id: 'pack_25', name: 'Missed Call Auto SMS - Growth Credit Pack (115 Mins - Includes 15 Bonus Mins)', amount: 2500, minutes: 115, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
        'pack_25': { id: 'pack_25', name: 'Missed Call Auto SMS - Growth Credit Pack (115 Mins - Includes 15 Bonus Mins)', amount: 2500, minutes: 115, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
        '50': { id: 'pack_50', name: 'Missed Call Auto SMS - Pro Contractor Pack (250 Mins - Includes 50 Bonus Mins)', amount: 5000, minutes: 250, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
        'pack_50': { id: 'pack_50', name: 'Missed Call Auto SMS - Pro Contractor Pack (250 Mins - Includes 50 Bonus Mins)', amount: 5000, minutes: 250, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
        '100': { id: 'pack_100', name: 'Missed Call Auto SMS - Fleet Credit Pack (550 Mins - Includes 150 Bonus Mins)', amount: 10000, minutes: 550, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
        'pack_100': { id: 'pack_100', name: 'Missed Call Auto SMS - Fleet Credit Pack (550 Mins - Includes 150 Bonus Mins)', amount: 10000, minutes: 550, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' }
      };

      const tier = CREDIT_TIERS[tierKey] || CREDIT_TIERS['10'];
      const host = req.headers['host'] || 'missedcallautosms.com';
      const activeStripeKey = getStripeKey();

      if (!activeStripeKey) {
        if (req.method === 'GET' && !req.headers['accept']?.includes('application/json')) {
          res.writeHead(302, { Location: tier.fallbackUrl });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, checkoutUrl: tier.fallbackUrl, fallback: true, tier: tier.id, minutes: tier.minutes }));
        return;
      }

      const postData = {
        'mode': 'payment',
        'payment_method_types[0]': 'card',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(tier.amount),
        'line_items[0][price_data][product_data][name]': tier.name,
        'line_items[0][price_data][product_data][description]': `Instant addition of +${tier.minutes} minutes to dedicated AI voice line. 100% P2P carrier exempt.`,
        'metadata[tier]': 'credit_pack',
        'metadata[pack_tier]': tier.id,
        'metadata[minutes]': String(tier.minutes),
        'metadata[price_dollars]': String(tier.amount / 100),
        'metadata[license_key]': licenseKey,
        'metadata[referral_code]': refCode,
        'metadata[service]': 'voice_credit_reload',
        'success_url': `https://${host}/success.html?session_id={CHECKOUT_SESSION_ID}&type=credit_pack&minutes=${tier.minutes}`,
        'cancel_url': `https://${host}/voice.html`
      };

      if (licenseKey) postData['client_reference_id'] = licenseKey;
      if (customerEmail) postData['customer_email'] = customerEmail;

      try {
        const session = await stripeApiRequest('/v1/checkout/sessions', 'POST', postData);
        if (req.method === 'GET' && !req.headers['accept']?.includes('application/json')) {
          res.writeHead(302, { Location: session.url });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, sessionId: session.id, checkoutUrl: session.url, tier: tier.id, minutes: tier.minutes, amount: tier.amount / 100 }));
      } catch (err) {
        console.error('Credit pack session creation error:', err.message);
        if (req.method === 'GET') {
          res.writeHead(302, { Location: tier.fallbackUrl });
          res.end();
          return;
        }
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message, fallbackUrl: tier.fallbackUrl }));
      }
    };

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          handleCreditPackRequest(payload);
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
        }
      });
      return;
    } else {
      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
      const params = Object.fromEntries(urlObj.searchParams.entries());
      handleCreditPackRequest(params);
      return;
    }
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

        // Step 3: Meter Call Duration against Customer Voice Minute Credits ($0.25/min)
        const durationMins = Math.max(0.1, durationSec / 60);
        settings.minutesUsed = Math.round(((settings.minutesUsed || 0) + durationMins) * 100) / 100;
        settings.voiceMinutesBalance = Math.max(0, Math.round(((settings.voiceMinutesBalance || 15.0) - durationMins) * 100) / 100);

        // Auto-Recharge Check ($10 pack = +40 mins when balance < 5 min)
        if (settings.autoRebillEnabled !== false && settings.voiceMinutesBalance < 5) {
          settings.voiceMinutesBalance = Math.round((settings.voiceMinutesBalance + 40) * 100) / 100;
          settings.isVoicePaused = false;
          console.log(`💳 [AUTO-RECHARGE] Balance dropped below 5 min. Auto-reloaded $10 pack (+40 min). New balance: ${settings.voiceMinutesBalance} min`);
        } else if (settings.autoRebillEnabled === false && settings.voiceMinutesBalance <= 0) {
          settings.isVoicePaused = true;
          settings.status = 'PAUSED_CREDITS_EXHAUSTED';
          console.log(`🛑 [VOICE CREDITS EXHAUSTED] Auto-rebill is OFF and balance reached 0. Pausing Vapi receptionist.`);
        }
        saveVoiceSettings(settings);

        // Step 4: Enqueue persistent outbound SMS for Android real-SIM dispatch
        if (settings.postCallSmsEnabled) {
          enqueueVoiceSms({
            callId: logEntry.id,
            recipient: callerNum,
            message: followUpText,
            urgency: logEntry.urgency
          });
        }

        // Step 5: Dispatch multi-channel email alert for high emergencies
        if (isUrgent) {
          dispatchEmergencyLeadEmail(logEntry);
        }

        console.log(`📞 [VAPI WEBHOOK] Call processed from ${logEntry.callerNumber} (${durationFormatted}) - Urgency: [${logEntry.urgency}] - Credits remaining: ${settings.voiceMinutesBalance} min`);

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

  // API: Live Vapi Status & Diagnostics (Fetches live data from api.vapi.ai)
  if ((relativePath === '/api/vapi/live-status' || relativePath === '/api/vapi/live-status/' ||
       relativePath === '/api/vapi/status' || relativePath === '/api/vapi/status/') && req.method === 'GET') {
    (async () => {
      try {
        const { apiKey, assistantId } = getVapiConfig();
        if (!apiKey) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: false,
            connected: false,
            error: 'VAPI_PRIVATE_API_KEY is not configured in .env',
            settings: getVoiceSettings()
          }));
          return;
        }

        // 1. Fetch assistant details
        let assistant = null;
        let resolvedId = assistantId;
        try {
          if (resolvedId) {
            assistant = await vapiApiRequest(`/assistant/${resolvedId}`);
          }
        } catch (asstErr) {
          // If specific ID fails, list assistants and pick the first
          try {
            const list = await vapiApiRequest('/assistant');
            if (Array.isArray(list) && list.length > 0) {
              assistant = list[0];
              resolvedId = assistant.id;
            }
          } catch (e) {}
        }

        if (!assistant) {
          const list = await vapiApiRequest('/assistant');
          if (Array.isArray(list) && list.length > 0) {
            assistant = list[0];
            resolvedId = assistant.id;
          }
        }

        // 2. Fetch phone numbers
        let phoneNumbers = [];
        try {
          phoneNumbers = await vapiApiRequest('/phone-number');
        } catch (pErr) {
          phoneNumbers = [];
        }

        // 3. Extract assistant details
        const systemMessage = assistant?.model?.messages?.find(m => m.role === 'system')?.content || '';
        const currentServerUrl = assistant?.serverUrl || '';
        const subscribers = getVoiceSubscribers();
        const settings = getVoiceSettings();
        const queue = getVoiceSmsQueue();

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          connected: true,
          apiKeyConfigured: true,
          assistant: {
            id: resolvedId || assistant?.id,
            name: assistant?.name || 'Riley',
            model: assistant?.model?.model || 'gpt-4.1',
            voiceProvider: assistant?.voice?.provider || 'vapi',
            firstMessage: assistant?.firstMessage || '',
            systemPrompt: systemMessage,
            serverUrl: currentServerUrl,
            createdAt: assistant?.createdAt || null
          },
          phoneNumbers: phoneNumbers || [],
          subscribers: subscribers,
          subscribersCount: subscribers.length,
          settings: settings,
          forwardingVerified: settings.forwardingVerified,
          forwardingVerifiedAt: settings.forwardingVerifiedAt,
          pendingSmsQueueCount: queue.filter(q => q.status === 'PENDING').length,
          callsCount: getVoiceCallLogs().length
        }));
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: false,
          connected: false,
          error: err.message,
          settings: getVoiceSettings()
        }));
      }
    })();
    return;
  }

  // API: Update Vapi Assistant live in Vapi Cloud (PATCH /assistant/:id)
  if ((relativePath === '/api/vapi/update-assistant' || relativePath === '/api/vapi/update-assistant/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { apiKey, assistantId } = getVapiConfig();
        const targetId = payload.assistantId || assistantId || '5105b379-8cbf-4037-becc-bba45504f781';

        const patchPayload = {};
        if (payload.name) patchPayload.name = payload.name;
        if (payload.firstMessage !== undefined) patchPayload.firstMessage = payload.firstMessage;
        if (payload.serverUrl !== undefined) patchPayload.serverUrl = payload.serverUrl;

        if (payload.systemPrompt !== undefined) {
          patchPayload.model = {
            provider: 'openai',
            model: payload.model || 'gpt-4.1',
            messages: [
              {
                role: 'system',
                content: payload.systemPrompt
              }
            ]
          };
        }

        const vapiRes = await vapiApiRequest(`/assistant/${targetId}`, 'PATCH', patchPayload);
        console.log(`🎙️ [VAPI ASSISTANT UPDATED] Live patch applied to Vapi assistant: ${targetId}`);

        // Also update local settings if business parameters provided
        const settings = getVoiceSettings();
        if (payload.name) settings.businessName = payload.name;
        if (payload.customGreeting !== undefined) settings.customGreeting = payload.firstMessage;
        saveVoiceSettings(settings);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: `Vapi Assistant "${vapiRes.name || targetId}" updated live in Vapi Cloud!`,
          assistant: vapiRes
        }));
      } catch (err) {
        console.error('Failed to update Vapi assistant:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: User-Specific Voice Assistant Config (GET & POST /api/vapi/user-assistant)
  if (relativePath === '/api/vapi/user-assistant' || relativePath === '/api/vapi/user-assistant/') {
    const { assistantId } = getVapiConfig();

    if (req.method === 'GET') {
      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
      const key = (urlObj.searchParams.get('licenseKey') || urlObj.searchParams.get('key') || '').trim().toUpperCase();

      (async () => {
        try {
          let targetAssistantId = null;
          let binding = null;

          try {
            const fsDb = getFirestoreDb();
            if (key && fsDb && fsDb.getVoiceBinding) {
              binding = await fsDb.getVoiceBinding(key);
              if (binding && binding.vapiAssistantId) {
                targetAssistantId = binding.vapiAssistantId;
              }
            }
          } catch (e) {}

          if (!targetAssistantId) {
            targetAssistantId = assistantId || '5105b379-8cbf-4037-becc-bba45504f781';
          }

          let asstData = null;
          try {
            asstData = await vapiApiRequest(`/assistant/${targetAssistantId}`);
          } catch (e) {}

          const systemMessage = asstData?.model?.messages?.find(m => m.role === 'system')?.content ||
            "You are a friendly, professional AI receptionist. Your job is to answer incoming calls, capture the caller's name and service request, and reassure them that someone will follow up shortly.";

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            licenseKey: key,
            assistantId: targetAssistantId,
            phoneNumberId: binding?.vapiPhoneNumberId || null,
            forwardingNumber: binding?.forwardingNumber || '+1 (732) 660-9121',
            carrierCode: binding?.carrierCode || '*717326609121',
            quotaMinutes: binding?.quotaMinutes || 250,
            minutesUsed: binding?.minutesUsed || 0,
            assistant: {
              id: targetAssistantId,
              name: asstData?.name || 'Riley (AI Receptionist)',
              firstMessage: asstData?.firstMessage || 'Hi! Thanks for calling. How can I help you today?',
              systemPrompt: systemMessage,
              model: asstData?.model?.model || 'gpt-4o-mini',
              temperature: asstData?.model?.temperature ?? 0.3,
              voiceProvider: asstData?.voice?.provider || 'cartesia',
              voiceId: asstData?.voice?.voiceId || '248be419-c632-4f23-adf1-5324ed7dbf10'
            }
          }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      })();
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const key = (payload.licenseKey || payload.key || '').trim().toUpperCase();
          let targetAssistantId = payload.assistantId || null;

          try {
            const fsDb = getFirestoreDb();
            if (key && fsDb && fsDb.getVoiceBinding) {
              const binding = await fsDb.getVoiceBinding(key);
              if (binding && binding.vapiAssistantId) {
                targetAssistantId = binding.vapiAssistantId;
              }
            }
          } catch (e) {}

          if (!targetAssistantId) {
            targetAssistantId = assistantId || '5105b379-8cbf-4037-becc-bba45504f781';
          }

          const patchPayload = {};
          if (payload.name) patchPayload.name = payload.name;
          if (payload.firstMessage !== undefined) patchPayload.firstMessage = payload.firstMessage;

          const modelConfig = {
            provider: 'openai',
            model: payload.model || 'gpt-4o-mini',
            temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.3,
            messages: [
              { role: 'system', content: payload.systemPrompt || "You are a professional AI receptionist." }
            ]
          };
          patchPayload.model = modelConfig;

          if (payload.voiceProvider || payload.voiceId) {
            patchPayload.voice = {
              provider: payload.voiceProvider || 'cartesia',
              voiceId: payload.voiceId || '248be419-c632-4f23-adf1-5324ed7dbf10'
            };
          }

          const vapiRes = await vapiApiRequest(`/assistant/${targetAssistantId}`, 'PATCH', patchPayload);
          const isPremiumModel = (payload.model || '').toLowerCase().includes('gpt-4o') && !(payload.model || '').toLowerCase().includes('mini');

          // Store in Firestore voice_pro_bindings
          try {
            const fsDb = getFirestoreDb();
            if (key && fsDb && fsDb.saveVoiceBinding) {
              await fsDb.saveVoiceBinding(key, {
                model: payload.model || 'gpt-4o-mini',
                hasPremiumModel: isPremiumModel,
                temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.3,
                lastSyncedAt: new Date().toISOString()
              });
            }
          } catch (e) {}

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            message: 'AI Voice Receptionist settings updated successfully',
            assistant: vapiRes,
            hasPremiumModel: isPremiumModel
          }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }
  }

  // API: Outbound Live Test Call (POST /api/vapi/outbound-test-call)
  if ((relativePath === '/api/vapi/outbound-test-call' || relativePath === '/api/vapi/outbound-test-call/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const targetPhone = (payload.phoneNumber || payload.phone || '').trim();
        const key = (payload.licenseKey || payload.key || '').trim().toUpperCase();

        if (!targetPhone) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Destination phone number is required.' }));
          return;
        }

        const { assistantId } = getVapiConfig();
        let targetAssistantId = payload.assistantId || null;
        let targetPhoneId = payload.phoneNumberId || null;

        try {
          const fsDb = getFirestoreDb();
          if (key && fsDb && fsDb.getVoiceBinding) {
            const binding = await fsDb.getVoiceBinding(key);
            if (binding) {
              if (!targetAssistantId && binding.vapiAssistantId) targetAssistantId = binding.vapiAssistantId;
              if (!targetPhoneId && binding.vapiPhoneNumberId) targetPhoneId = binding.vapiPhoneNumberId;
            }
          }
        } catch (e) {}

        if (!targetAssistantId) {
          targetAssistantId = assistantId || '5105b379-8cbf-4037-becc-bba45504f781';
        }

        if (!targetPhoneId) {
          try {
            const pList = await vapiApiRequest('/phone-number');
            if (Array.isArray(pList) && pList.length > 0) {
              targetPhoneId = pList[0].id;
            }
          } catch (e) {}
        }

        const callPayload = {
          assistantId: targetAssistantId,
          customer: {
            number: targetPhone
          }
        };
        if (targetPhoneId) {
          callPayload.phoneNumberId = targetPhoneId;
        }

        const callRes = await vapiApiRequest('/call/phone', 'POST', callPayload);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: `Placing live test call to ${targetPhone} now! Your phone will ring shortly.`,
          call: callRes
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: Test Call Simulation Logger (POST /api/vapi/test-call)
  if ((relativePath === '/api/vapi/test-call' || relativePath === '/api/vapi/test-call/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        try {
          const fsDb = getFirestoreDb();
          if (fsDb && fsDb.logVoiceCall) {
            await fsDb.logVoiceCall({
              licenseKey: payload.licenseKey || 'SIMULATION',
              callerNumber: payload.phoneNumber || '+15550199',
              callerName: payload.callerName || 'Test Caller',
              summary: payload.summary || 'Simulated In-App Voice Call Test',
              transcript: payload.transcript || `AI: ${payload.firstMessage || 'Hello'}`,
              durationSeconds: payload.durationSeconds || 30,
              type: 'SIMULATED_TEST',
              simulatedAt: new Date().toISOString()
            });
          }
        } catch (e) {}

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, message: 'Simulated call logged successfully.' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: One-Click Set Webhook to MissedCallAutoSMS (POST /api/vapi/set-webhook)
  if ((relativePath === '/api/vapi/set-webhook' || relativePath === '/api/vapi/set-webhook/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { assistantId } = getVapiConfig();
        const targetId = payload.assistantId || assistantId || '5105b379-8cbf-4037-becc-bba45504f781';
        const serverUrl = payload.serverUrl || 'https://missedcallautosms.com/api/vapi/webhook';

        const vapiRes = await vapiApiRequest(`/assistant/${targetId}`, 'PATCH', {
          serverUrl: serverUrl
        });

        console.log(`⚡ [VAPI WEBHOOK LINKED] Assistant ${targetId} serverUrl set to: ${serverUrl}`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: `Webhook linked! Vapi will now stream end-of-call events to: ${serverUrl}`,
          serverUrl: serverUrl,
          assistant: vapiRes
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: Get & Save Voice Receptionist Settings (GET & POST)
  if (relativePath === '/api/vapi/settings' || relativePath === '/api/vapi/settings/') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true, settings: getVoiceSettings() }));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const current = getVoiceSettings();
          const updated = { ...current, ...payload, updatedAt: new Date().toISOString() };
          saveVoiceSettings(updated);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, message: 'Voice settings updated successfully', settings: updated }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }
  }

  // API: Verify Carrier Forwarding Setup
  if ((relativePath === '/api/vapi/verify-forwarding' || relativePath === '/api/vapi/verify-forwarding/') && req.method === 'POST') {
    const settings = getVoiceSettings();
    settings.forwardingVerified = true;
    settings.forwardingVerifiedAt = new Date().toISOString();
    saveVoiceSettings(settings);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      message: `Carrier conditional forwarding (*71) successfully verified and active!`,
      carrierCode: settings.carrierCode,
      forwardingNumber: settings.forwardingNumber,
      verifiedAt: settings.forwardingVerifiedAt
    }));
    return;
  }

  // API: Top-up Voice Minutes (+100 mins)
  if ((relativePath === '/api/vapi/topup-minutes' || relativePath === '/api/vapi/topup-minutes/') && req.method === 'POST') {
    const settings = getVoiceSettings();
    settings.monthlyMinutesQuota = (settings.monthlyMinutesQuota || 200) + 100;
    saveVoiceSettings(settings);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      message: '100 Voice Minutes added to your plan!',
      newQuota: settings.monthlyMinutesQuota,
      minutesRemaining: settings.monthlyMinutesQuota - (settings.minutesUsed || 0)
    }));
    return;
  }

  // API: List Active Voice Pro Subscribers
  if ((relativePath === '/api/vapi/subscribers' || relativePath === '/api/vapi/subscribers/') && req.method === 'GET') {
    const subs = getVoiceSubscribers();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, subscribers: subs, count: subs.length }));
    return;
  }

  // API: Live Minute Quota & Usage Metering for Appliance Client
  if ((relativePath === '/api/vapi/usage' || relativePath === '/api/vapi/usage/') && req.method === 'GET') {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const licenseKey = (urlObj.searchParams.get('licenseKey') || urlObj.searchParams.get('key') || '').trim().toUpperCase();

    if (!licenseKey) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, error: 'License key is required.' }));
      return;
    }

    (async () => {
      try {
        let subscriber = null;
        const fsDb = getFirestoreDb();
        if (fsDb && fsDb.getVoiceBinding) {
          try {
            subscriber = await fsDb.getVoiceBinding(licenseKey);
          } catch (e) {}
        }
        if (!subscriber) {
          const subs = getVoiceSubscribers();
          subscriber = subs.find(s => s.licenseKey === licenseKey) || null;
        }

        const isPro = licenseKey.startsWith('MCAS-PRO-') || licenseKey.startsWith('MCAT-PRO-') || licenseKey.includes('PRO-DEMO');
        const isDev = licenseKey.includes('DEV') || licenseKey.includes('MASTER');

        const plan = subscriber?.plan || (isPro ? 'PRO_GATEWAY' : 'AUTONOMOUS_FRONT_DESK');
        const planName = subscriber?.planName || (
          plan === 'AUTONOMOUS_FRONT_DESK' ? 'Autonomous Front Desk Bundle' :
          plan === 'VOICE_BUSINESS' ? 'Voice Business' :
          plan === 'VOICE_STARTER' ? 'Voice Starter' :
          plan === 'PRO_GATEWAY' ? 'Pro Automation Gateway' : 'Flagship Appliance'
        );

        const quotaMinutes = Number(subscriber?.quotaMinutes ?? (
          plan === 'AUTONOMOUS_FRONT_DESK' ? 250 :
          plan === 'VOICE_BUSINESS' ? 300 :
          plan === 'VOICE_STARTER' ? 45 : 0
        ));

        const minutesUsed = Number(subscriber?.minutesUsed ?? 0);
        let overageRatePerMinute = Number(subscriber?.overageRatePerMinute ?? (plan === 'VOICE_STARTER' ? 0.25 : 0.20));

        const isPremiumModel = subscriber?.hasPremiumModel === true ||
          (subscriber?.model && subscriber.model.toLowerCase().includes('gpt-4o') && !subscriber.model.toLowerCase().includes('mini'));
        if (isPremiumModel) {
          overageRatePerMinute = Number((overageRatePerMinute * 1.015).toFixed(4));
        }

        const remainingMinutes = Math.max(0, quotaMinutes - minutesUsed);
        const overageMinutes = Math.max(0, minutesUsed - quotaMinutes);
        const overageAmount = Number((overageMinutes * overageRatePerMinute).toFixed(2));

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          licenseKey,
          status: subscriber?.status || (isDev ? 'ACTIVE' : 'ACTIVE'),
          voiceActive: subscriber ? subscriber.voiceActive !== false : true,
          plan,
          planName,
          quotaMinutes,
          minutesUsed,
          remainingMinutes,
          overageMinutes,
          overageRatePerMinute,
          overageAmount,
          modelTier: isPremiumModel ? 'PREMIUM (+1.5% Overage Markup)' : 'STANDARD (Included)',
          hasPremiumModel: isPremiumModel,
          billingCycleEnd: subscriber?.billingCycleEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          forwardingNumber: subscriber?.forwardingNumber || '+18005550199',
          isUnlimitedGateway: plan === 'PRO_GATEWAY',
          cloudApiActive: subscriber ? subscriber.cloudApiActive !== false && subscriber.status !== 'CANCELLED' : true
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }

  // API: List Master Licenses (for Owner Dashboard Synchronization)
  if ((relativePath === '/api/licenses' || relativePath === '/api/licenses/') && req.method === 'GET') {
    const masterList = getMasterLicenses();
    const voiceBindings = getVoiceSubscribers();

    // Merge voice subscriber status into master list if not already present
    const combined = [...masterList];
    for (const vb of voiceBindings) {
      const existing = combined.find(c => c.key === vb.licenseKey);
      if (existing) {
        if (vb.voiceEntitlement !== undefined) existing.voiceEntitlement = vb.voiceEntitlement;
        if (vb.voiceSubWaived !== undefined) existing.voiceSubWaived = vb.voiceSubWaived;
        if (vb.vapiProvisioned !== undefined) existing.vapiProvisioned = vb.vapiProvisioned;
        if (vb.voiceMinutesBalance !== undefined) existing.voiceMinutesBalance = vb.voiceMinutesBalance;
        if (vb.forwardingNumber) existing.voiceNumber = vb.forwardingNumber;
        if (vb.carrierCode) existing.carrierCode = vb.carrierCode;
        existing.voiceActive = !!(vb.vapiProvisioned && vb.active !== false && (vb.voiceMinutesBalance > 0));
      } else {
        combined.unshift({
          key: vb.licenseKey,
          customer: vb.name || 'Valued Customer',
          email: vb.email || '',
          tier: 'PRO',
          type: vb.voiceSubWaived ? 'FREE_VOICE_COMP' : 'PAID',
          price: vb.voiceSubWaived ? '$0.00' : '9.99/mo',
          voiceEntitlement: !!vb.voiceEntitlement,
          voiceSubWaived: !!vb.voiceSubWaived,
          vapiProvisioned: !!vb.vapiProvisioned,
          voiceMinutesBalance: vb.voiceMinutesBalance || 0.0,
          voiceActive: !!(vb.vapiProvisioned && vb.active !== false && (vb.voiceMinutesBalance > 0)),
          voiceNumber: vb.forwardingNumber || null,
          carrierCode: vb.carrierCode || null,
          status: vb.active !== false ? 'ACTIVE' : 'INACTIVE',
          date: vb.boundAt || new Date().toISOString()
        });
      }
    }

    // Merge Agency Master Accounts and their Client Appliances from .agency_fleet_cache.json
    try {
      const FLEET_CACHE_PATH = path.join(__dirname, '.agency_fleet_cache.json');
      if (fs.existsSync(FLEET_CACHE_PATH)) {
        const fleetCache = JSON.parse(fs.readFileSync(FLEET_CACHE_PATH, 'utf8'));
        const revokedKeys = Array.isArray(fleetCache._revokedKeys) ? fleetCache._revokedKeys : [];

        for (const [agencyKey, agencyRecord] of Object.entries(fleetCache)) {
          if (agencyKey.startsWith('_')) continue;

          const isAgencyRevoked = revokedKeys.includes(agencyKey);
          const tierPriceMap = { agency_3: '$229.00/mo', agency_5: '$349.00/mo', agency_10: '$649.00/mo', agency_25: '$1,249.00/mo', agency_enterprise: '$1,249.00/mo' };
          const tierLabelMap = { agency_3: 'AGENCY_3', agency_5: 'AGENCY_5', agency_10: 'AGENCY_10', agency_25: 'AGENCY_25', agency_enterprise: 'AGENCY_ENT' };
          const agencyPrice = tierPriceMap[agencyRecord.tier] || '$349.00/mo';
          const agencyTierLabel = tierLabelMap[agencyRecord.tier] || 'AGENCY_5';

          // 1. Add/update Agency Master License in directory
          const existingAgency = combined.find(c => c.key === agencyKey);
          if (existingAgency) {
            existingAgency.tier = 'AGENCY';
            existingAgency.type = agencyTierLabel;
            existingAgency.quota = agencyRecord.quota || 5;
            existingAgency.usedSeats = (agencyRecord.clients || []).length;
            existingAgency.price = agencyPrice;
            existingAgency.status = isAgencyRevoked ? 'REVOKED' : 'ACTIVE';
          } else {
            combined.unshift({
              key: agencyKey,
              customer: `${agencyRecord.agencyName || 'Agency Partner'} [MASTER]`,
              email: agencyRecord.customerEmail || 'agency@partner.com',
              tier: 'AGENCY',
              type: agencyTierLabel,
              price: agencyPrice,
              quota: agencyRecord.quota || 5,
              usedSeats: (agencyRecord.clients || []).length,
              voiceActive: false,
              status: isAgencyRevoked ? 'REVOKED' : 'ACTIVE',
              date: agencyRecord.createdAt || new Date().toISOString()
            });
          }

          // 2. Add/update Child Fleet Client Appliances
          for (const client of (agencyRecord.clients || [])) {
            const isClientRevoked = revokedKeys.includes(client.licenseKey);
            const existingClient = combined.find(c => c.key === client.licenseKey);
            if (existingClient) {
              existingClient.tier = 'PRO';
              existingClient.type = 'AGENCY_FLEET';
              existingClient.customer = `${client.clientName} (Fleet: ${agencyRecord.agencyName})`;
              existingClient.deviceId = client.hardwareId || null;
              existingClient.status = isClientRevoked ? 'REVOKED' : (client.status || 'ACTIVE');
              existingClient.agencyKey = agencyKey;
              existingClient.agencyName = agencyRecord.agencyName;
            } else {
              combined.unshift({
                key: client.licenseKey,
                customer: `${client.clientName} (Fleet: ${agencyRecord.agencyName})`,
                email: client.clientContact || '',
                tier: 'PRO',
                type: 'AGENCY_FLEET',
                price: '$0.00 (Agency Seat)',
                deviceId: client.hardwareId || null,
                voiceActive: (client.voiceMinsUsed || 0) > 0,
                status: isClientRevoked ? 'REVOKED' : (client.status || 'ACTIVE'),
                agencyKey: agencyKey,
                agencyName: agencyRecord.agencyName,
                date: client.issuedAt || new Date().toISOString()
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('[api/licenses] Error merging fleet cache:', e.message);
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, licenses: combined, count: combined.length }));
    return;
  }

  // API: Issue or Save Master License (from Admin Dashboard)
  if ((relativePath === '/api/licenses' || relativePath === '/api/licenses/' || relativePath === '/api/licenses/issue') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const key = (payload.key || payload.licenseKey || '').trim().toUpperCase();
        if (!key) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Key is required' }));
          return;
        }

        const isFree = (payload.price === 0 || payload.price === '0.00' || payload.type === 'FREE' || payload.type === 'FREE_VOICE_COMP');
        const hasVoice = !!(payload.voiceEntitlement || payload.voiceActive);
        const isWaived = !!(payload.voiceSubWaived || (isFree && hasVoice));

        const rec = {
          key: key,
          customer: payload.name || payload.customer || 'Valued Customer',
          email: payload.email || '',
          tier: payload.tier || 'STANDARD',
          type: payload.type || (isWaived ? 'FREE_VOICE_COMP' : (isFree ? 'FREE' : 'PAID')),
          price: typeof payload.price === 'number' ? `$${payload.price.toFixed(2)}` : (payload.price || (isFree ? '$0.00' : '$49.99')),
          voiceEntitlement: hasVoice,
          voiceSubWaived: isWaived,
          vapiProvisioned: !!payload.vapiProvisioned,
          voiceActive: !!(payload.vapiProvisioned && payload.voiceActive),
          voiceNumber: payload.voiceNumber || null,
          carrierCode: payload.carrierCode || null,
          voiceMinutesBalance: payload.voiceMinutesBalance || 0.0,
          status: payload.status || 'ACTIVE',
          date: payload.date || new Date().toISOString()
        };

        saveMasterLicense(rec);

        if (hasVoice) {
          saveVoiceSubscriber(rec.key, {
            active: true,
            name: rec.customer,
            email: rec.email,
            voiceEntitlement: true,
            voiceSubActive: !isWaived,
            voiceSubWaived: isWaived,
            vapiProvisioned: !!payload.vapiProvisioned,
            forwardingNumber: rec.voiceNumber,
            carrierCode: rec.carrierCode,
            carrierDeactivateCode: '*73',
            voiceMinutesBalance: rec.voiceMinutesBalance,
            ratePerMinute: 0.25,
            autoRebillEnabled: true,
            status: payload.vapiProvisioned ? 'ACTIVE' : 'UNLOCKED_PENDING_PACK',
            boundAt: new Date().toISOString()
          });
        }

        console.log(`🔑 [ADMIN LICENSE SAVED] Key: ${rec.key}, Tier: ${rec.tier}, Voice Comp: ${isWaived}, Provisioned: ${rec.vapiProvisioned}`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, license: rec }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ─── Agency: Management Endpoint for Developer Dashboard ───
  if ((relativePath === '/api/agency/manage' || relativePath === '/api/agency/manage/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const action = payload.action || 'list_fleets';
        const FLEET_CACHE_PATH = path.join(__dirname, '.agency_fleet_cache.json');
        let fleetCache = {};
        if (fs.existsSync(FLEET_CACHE_PATH)) {
          try { fleetCache = JSON.parse(fs.readFileSync(FLEET_CACHE_PATH, 'utf8')); } catch (e) {}
        }
        if (!Array.isArray(fleetCache._revokedKeys)) fleetCache._revokedKeys = [];

        // 1. LIST ALL FLEETS
        if (action === 'list_fleets') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, fleets: fleetCache, revokedKeys: fleetCache._revokedKeys }));
          return;
        }

        // 2. TOGGLE REVOKE ON ANY KEY (Agency Master Key or Fleet Client Key)
        if (action === 'toggle_revoke') {
          const key = (payload.licenseKey || payload.key || '').trim().toUpperCase();
          if (!key) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'licenseKey required' }));
            return;
          }
          const isCurrentlyRevoked = fleetCache._revokedKeys.includes(key);
          if (isCurrentlyRevoked) {
            fleetCache._revokedKeys = fleetCache._revokedKeys.filter(k => k !== key);
          } else {
            fleetCache._revokedKeys.push(key);
          }
          fs.writeFileSync(FLEET_CACHE_PATH, JSON.stringify(fleetCache, null, 2), 'utf8');

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            key,
            revoked: !isCurrentlyRevoked,
            message: `Key ${key} has been ${!isCurrentlyRevoked ? 'REVOKED' : 'REACTIVATED'}`
          }));
          return;
        }

        // 3. CREATE / REGISTER AGENCY MASTER KEY
        if (action === 'create_agency') {
          const agencyName = (payload.agencyName || 'Agency Partner').trim();
          const tier = payload.tier || 'agency_5';
          const quota = parseInt(payload.quota || (tier === 'agency_enterprise' ? '999' : tier === 'agency_10' ? '10' : '5'), 10);
          const masterKey = (payload.masterKey || '').trim().toUpperCase();

          if (!masterKey) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'masterKey required' }));
            return;
          }

          fleetCache[masterKey] = {
            agencyName,
            customerEmail: payload.customerEmail || '',
            quota,
            tier,
            voiceMinsPool: tier === 'agency_enterprise' ? 9999 : tier === 'agency_10' ? 2500 : 1250,
            overageRatePerMin: tier === 'agency_enterprise' ? 0.15 : 0.20,
            createdAt: new Date().toISOString(),
            clients: [],
            branding: null
          };
          fs.writeFileSync(FLEET_CACHE_PATH, JSON.stringify(fleetCache, null, 2), 'utf8');

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, message: `Agency account created for ${agencyName}`, agency: fleetCache[masterKey] }));
          return;
        }

        // 4. UPDATE AGENCY QUOTA
        if (action === 'update_quota') {
          const masterKey = (payload.masterKey || '').trim().toUpperCase();
          const newQuota = parseInt(payload.quota, 10);
          if (!fleetCache[masterKey] || isNaN(newQuota)) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'Agency key not found or invalid quota' }));
            return;
          }
          fleetCache[masterKey].quota = newQuota;
          fs.writeFileSync(FLEET_CACHE_PATH, JSON.stringify(fleetCache, null, 2), 'utf8');

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, message: `Quota updated to ${newQuota} for ${fleetCache[masterKey].agencyName}` }));
          return;
        }

        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: `Unknown action: ${action}` }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // ─── Netlify Function Bridge: Agency Fleet ───
  if (relativePath === '/.netlify/functions/agency-fleet' || relativePath === '/api/agency/fleet') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        delete require.cache[require.resolve('./netlify/functions/agency-fleet')];
        const agencyFleetHandler = require('./netlify/functions/agency-fleet').handler;
        const event = {
          httpMethod: req.method,
          headers: req.headers,
          body: body || null
        };
        const result = await agencyFleetHandler(event);
        res.writeHead(result.statusCode || 200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          ...(result.headers || {})
        });
        res.end(result.body);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ─── Agency: Online Revocation Check (consumed by Android LicenseManager.kt) ──
  if ((relativePath === '/api/agency/revoked' || relativePath === '/api/agency/revoked/') && req.method === 'GET') {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const keyParam = (urlObj.searchParams.get('key') || urlObj.searchParams.get('licenseKey') || '').trim().toUpperCase();

    if (!keyParam) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ revoked: false, error: 'key parameter required' }));
      return;
    }

    try {
      const fleetCachePath = path.join(__dirname, '.agency_fleet_cache.json');
      let revoked = false;
      if (fs.existsSync(fleetCachePath)) {
        const cache = JSON.parse(fs.readFileSync(fleetCachePath, 'utf8'));
        if (cache._revokedKeys && Array.isArray(cache._revokedKeys)) {
          revoked = cache._revokedKeys.includes(keyParam);
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ revoked, key: keyParam }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ revoked: false }));
    }
    return;
  }

  // ─── Agency: Aggregated Fleet Voice Usage (pooled meter for fleet dashboard) ──
  if ((relativePath === '/api/agency/usage' || relativePath === '/api/agency/usage/') && req.method === 'GET') {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const agencyKey = (urlObj.searchParams.get('agencyKey') || req.headers['x-agency-key'] || '').trim().toUpperCase();

    if (!agencyKey) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, error: 'agencyKey parameter required' }));
      return;
    }

    try {
      const FLEET_CACHE_PATH = path.join(__dirname, '.agency_fleet_cache.json');
      if (!fs.existsSync(FLEET_CACHE_PATH)) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: 'Fleet record not found' }));
        return;
      }

      const cache = JSON.parse(fs.readFileSync(FLEET_CACHE_PATH, 'utf8'));
      const agencyRecord = cache[agencyKey];

      if (!agencyRecord) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: 'Agency key not found in fleet cache' }));
        return;
      }

      const TIER_CONFIG = {
        agency_3:          { voiceMinsPool: 750,  quota: 3,  overageRatePerMin: 0.20 },
        agency_5:          { voiceMinsPool: 1250, quota: 5,  overageRatePerMin: 0.20 },
        agency_10:         { voiceMinsPool: 2500, quota: 10, overageRatePerMin: 0.20 },
        agency_25:         { voiceMinsPool: 6250, quota: 25, overageRatePerMin: 0.15 },
        agency_enterprise: { voiceMinsPool: 6250, quota: 25, overageRatePerMin: 0.15 }
      };
      const tierCfg = TIER_CONFIG[agencyRecord.tier] || TIER_CONFIG['agency_5'];
      const voiceMinsPool = agencyRecord.voiceMinsPool || tierCfg.voiceMinsPool;
      const overageRatePerMin = agencyRecord.overageRatePerMin || tierCfg.overageRatePerMin;

      let totalUsed = 0;
      const clientUsage = (agencyRecord.clients || []).map(c => {
        const used = c.voiceMinsUsed || 0;
        totalUsed += used;
        return { id: c.id, clientName: c.clientName, licenseKey: c.licenseKey, status: c.status, voiceMinsUsed: used };
      });

      const overageMinutes = Math.max(0, totalUsed - voiceMinsPool);
      const overageAmount = parseFloat((overageMinutes * overageRatePerMin).toFixed(2));
      const percentUsed = voiceMinsPool > 0 ? Math.round((totalUsed / voiceMinsPool) * 100) : 0;

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        success: true,
        agencyName: agencyRecord.agencyName,
        tier: agencyRecord.tier,
        voiceMinsPool,
        totalUsed,
        overageMinutes,
        overageAmount,
        overageRatePerMin,
        percentUsed,
        alertLevel: percentUsed >= 100 ? 'OVERAGE' : percentUsed >= 85 ? 'WARNING' : 'OK',
        clientUsage
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // ─── Content Engine Marketing & Research Endpoints ───
  if (relativePath.startsWith('/api/content-engine/')) {
    const CE_DATA_DIR = path.join(__dirname, 'data');
    const CE_QUEUE_FILE = path.join(CE_DATA_DIR, 'content_engine_queue.json');
    const CE_RESEARCH_FILE = path.join(CE_DATA_DIR, 'competitor_research.json');
    const CE_SETTINGS_FILE = path.join(CE_DATA_DIR, 'content_engine_settings.json');
    const CE_ANALYTICS_FILE = path.join(CE_DATA_DIR, 'content_engine_analytics.json');

    const readJson = (file, fallback = []) => {
      if (fs.existsSync(file)) {
        try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
      }
      return fallback;
    };

    const writeJson = (file, data) => {
      if (!fs.existsSync(CE_DATA_DIR)) fs.mkdirSync(CE_DATA_DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    };

    // Helper: Parse incoming JSON body
    const getRequestBody = () => new Promise(resolve => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try { resolve(body ? JSON.parse(body) : {}); } catch (e) { resolve({}); }
      });
    });

    // 1. Status & Health
    if (relativePath === '/api/content-engine/status' && req.method === 'GET') {
      const queue = readJson(CE_QUEUE_FILE, []);
      const research = readJson(CE_RESEARCH_FILE, []);
      const settings = readJson(CE_SETTINGS_FILE, {});
      const effectiveSettings = {
        ...settings,
        googleChatWebhookUrl: settings.googleChatWebhookUrl || process.env.GOOGLE_CHAT_WEBHOOK_URL || ''
      };
      const hasGemini = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
      const hasMeta = !!process.env.META_PAGE_ACCESS_TOKEN;

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        success: true,
        geminiConfigured: hasGemini,
        metaConfigured: hasMeta,
        settings: effectiveSettings,
        researchCount: research.length,
        queueCount: queue.length,
        draftsCount: queue.filter(q => q.status === 'draft').length,
        approvedCount: queue.filter(q => q.status === 'approved').length,
        publishedCount: queue.filter(q => q.status === 'published').length
      }));
      return;
    }

    // 2. Queue Posts
    if (relativePath === '/api/content-engine/posts' && req.method === 'GET') {
      const queue = readJson(CE_QUEUE_FILE, []);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true, posts: queue }));
      return;
    }

    // 3. Research Context List
    if (relativePath === '/api/content-engine/research' && req.method === 'GET') {
      const research = readJson(CE_RESEARCH_FILE, []);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true, research }));
      return;
    }

    // 4. Ingest YouTube Video or Link
    if (relativePath === '/api/content-engine/ingest' && req.method === 'POST') {
      getRequestBody().then(({ url }) => {
        if (!url) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'URL or Video ID is required.' }));
          return;
        }

        const cleanUrl = url.replace(/"/g, '');
        exec(`python scripts/content_engine_ingest.py "${cleanUrl}"`, { cwd: __dirname }, (error, stdout, stderr) => {
          if (error) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: stderr || error.message }));
            return;
          }
          try {
            const parsed = JSON.parse(stdout.trim());
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(parsed));
          } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: true, raw: stdout }));
          }
        });
      });
      return;
    }

    // 5. Generate Angles with Agent
    if (relativePath === '/api/content-engine/generate' && req.method === 'POST') {
      getRequestBody().then(async ({ niche, customPrompt }) => {
        try {
          delete require.cache[require.resolve('./scripts/content_engine_agent')];
          const { synthesizeContentAngles } = require('./scripts/content_engine_agent');
          const result = await synthesizeContentAngles(niche, customPrompt);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 6. Update Post (In-line Editor)
    if (relativePath === '/api/content-engine/update-post' && req.method === 'POST') {
      getRequestBody().then(updatedPost => {
        if (!updatedPost || !updatedPost.id) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Post ID is required' }));
          return;
        }

        let queue = readJson(CE_QUEUE_FILE, []);
        const idx = queue.findIndex(p => p.id === updatedPost.id);
        if (idx >= 0) {
          queue[idx] = { ...queue[idx], ...updatedPost, updatedAt: new Date().toISOString() };
        } else {
          queue.unshift(updatedPost);
        }
        writeJson(CE_QUEUE_FILE, queue);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, post: queue[idx >= 0 ? idx : 0] }));
      });
      return;
    }

    // 7. Approve Post
    if (relativePath === '/api/content-engine/approve-post' && req.method === 'POST') {
      getRequestBody().then(({ postId }) => {
        let queue = readJson(CE_QUEUE_FILE, []);
        const post = queue.find(p => p.id === postId);
        if (!post) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Post not found' }));
          return;
        }

        post.status = 'approved';
        post.approvedAt = new Date().toISOString();
        writeJson(CE_QUEUE_FILE, queue);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, post }));
      });
      return;
    }

    // 7a. One-Click Approve from Google Chat (Mobile Responsive HTML)
    if (relativePath === '/api/content-engine/one-click-approve' && req.method === 'GET') {
      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
      const postId = urlObj.searchParams.get('postId') || urlObj.searchParams.get('id') || '';
      let queue = readJson(CE_QUEUE_FILE, []);
      let approvedPost = null;

      if (postId === 'all') {
        queue.forEach(p => {
          if (p.status === 'draft') {
            p.status = 'approved';
            p.approvedAt = new Date().toISOString();
          }
        });
        writeJson(CE_QUEUE_FILE, queue);
      } else if (postId) {
        approvedPost = queue.find(p => p.id === postId);
        if (approvedPost) {
          approvedPost.status = 'approved';
          approvedPost.approvedAt = new Date().toISOString();
          writeJson(CE_QUEUE_FILE, queue);
        } else {
          const fallbackDraft = queue.find(p => p.status === 'draft');
          if (fallbackDraft) {
            fallbackDraft.status = 'approved';
            fallbackDraft.approvedAt = new Date().toISOString();
            approvedPost = fallbackDraft;
            writeJson(CE_QUEUE_FILE, queue);
          }
        }
      }

      const postTitle = approvedPost ? approvedPost.title : 'Content Engine Post';
      const postFormat = approvedPost ? approvedPost.format : 'Omnichannel Post';
      const scheduledText = approvedPost && approvedPost.scheduledFor ? new Date(approvedPost.scheduledFor).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET' : 'Next Scheduled Timeslot';

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Post Approved - Missed Call Auto SMS</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 16px; padding: 32px 24px; max-width: 520px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700; font-size: 13px; padding: 6px 14px; border-radius: 999px; margin-bottom: 20px; border: 1px solid rgba(16, 185, 129, 0.3); }
    h1 { font-size: 22px; font-weight: 800; margin: 0 0 12px 0; color: #ffffff; line-height: 1.3; }
    .post-box { background: #0f172a; border: 1px solid #1e293b; border-radius: 10px; padding: 16px; margin: 18px 0; text-align: left; }
    .post-box .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 4px; }
    .post-box .title { font-size: 14px; color: #e2e8f0; font-weight: 600; margin-bottom: 8px; }
    .post-box .meta { font-size: 12px; color: #38bdf8; display: flex; justify-content: space-between; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; }
    .btn { display: block; background: #2563eb; color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 24px; border-radius: 10px; transition: background 0.2s; text-align: center; }
    .btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✔ ARMED FOR PUBLICATION</div>
    <h1>Post Successfully Approved</h1>
    <div class="post-box">
      <div class="label">Approved Content</div>
      <div class="title">${postTitle}</div>
      <div class="meta">
        <span>Format: <b>${postFormat}</b></span>
        <span>Slot: <b>${scheduledText}</b></span>
      </div>
    </div>
    <p>This post is now armed. The scheduler daemon will automatically publish it across your configured channels (Blog, Facebook, and Instagram).</p>
    <a href="/owner?tab=6" class="btn">Open Omnichannel Queue & Dashboard</a>
  </div>
</body>
</html>`);
      return;
    }

    // 7b. Unapprove Post (Revert to Draft)
    if (relativePath === '/api/content-engine/unapprove-post' && req.method === 'POST') {
      getRequestBody().then(({ postId }) => {
        let queue = readJson(CE_QUEUE_FILE, []);
        const post = queue.find(p => p.id === postId);
        if (!post) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Post not found' }));
          return;
        }

        post.status = 'draft';
        delete post.approvedAt;
        writeJson(CE_QUEUE_FILE, queue);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, post }));
      });
      return;
    }

    // 8. Publish Post (Manual)
    if (relativePath === '/api/content-engine/publish-post' && req.method === 'POST') {
      getRequestBody().then(async ({ postId }) => {
        let queue = readJson(CE_QUEUE_FILE, []);
        const post = queue.find(p => p.id === postId);
        if (!post) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Post not found' }));
          return;
        }

        try {
          const pubResult = await executePostPublish(post);
          post.status = 'published';
          post.publishedAt = pubResult.publishedAt;
          writeJson(CE_QUEUE_FILE, queue);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, post, message: 'Post published successfully to Blog and Queued for Social Distribution!' }));
        } catch (pubErr) {
          console.error(`[ContentEngine] ❌ Manual publish blocked for "${post.title}":`, pubErr.message);
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: pubErr.message }));
        }
      });
      return;
    }

    // 8b. Reschedule Post (Edit Posting Date/Time)
    if (relativePath === '/api/content-engine/reschedule-post' && req.method === 'POST') {
      getRequestBody().then(({ postId, scheduledFor }) => {
        if (!postId || !scheduledFor) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'postId and scheduledFor are required' }));
          return;
        }

        let queue = readJson(CE_QUEUE_FILE, []);
        const post = queue.find(p => p.id === postId);
        if (!post) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Post not found' }));
          return;
        }

        post.scheduledFor = new Date(scheduledFor).toISOString();
        post.updatedAt = new Date().toISOString();
        writeJson(CE_QUEUE_FILE, queue);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, post, message: `Post rescheduled for ${post.scheduledFor}` }));
      });
      return;
    }

    // 8c. Toggle Auto-Posting Switch
    if (relativePath === '/api/content-engine/toggle-autopost' && req.method === 'POST') {
      getRequestBody().then(({ enabled }) => {
        let settings = readJson(CE_SETTINGS_FILE, {});
        settings.autoPostingEnabled = (enabled !== undefined) ? !!enabled : !settings.autoPostingEnabled;
        writeJson(CE_SETTINGS_FILE, settings);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, autoPostingEnabled: settings.autoPostingEnabled }));
      });
      return;
    }

    // 8d. Run Scheduler Tick Manually
    if (relativePath === '/api/content-engine/run-scheduler-tick' && req.method === 'POST') {
      let settings = readJson(CE_SETTINGS_FILE, {});
      let queue = readJson(CE_QUEUE_FILE, []);
      const now = new Date();
      let publishedList = [];

      if (settings.autoPostingEnabled !== false) {
        for (const post of queue) {
          const isApproved = settings.autoPublishApprovedOnly !== false ? (post.status === 'approved') : (post.status === 'approved' || post.status === 'draft');
          const isDue = post.scheduledFor && new Date(post.scheduledFor) <= now;
          const isNotPublished = post.status !== 'published' && !post.publishedAt;

          if (isApproved && isDue && isNotPublished) {
            executePostPublish(post);
            post.status = 'published';
            post.publishedAt = now.toISOString();
            post.publishedVia = 'auto_scheduler';
            publishedList.push(post.title);
          }
        }
        if (publishedList.length > 0) {
          writeJson(CE_QUEUE_FILE, queue);
        }
      }

      settings.lastSchedulerCheck = now.toISOString();
      writeJson(CE_SETTINGS_FILE, settings);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        success: true,
        autoPostingEnabled: settings.autoPostingEnabled !== false,
        publishedCount: publishedList.length,
        publishedPosts: publishedList,
        lastCheck: settings.lastSchedulerCheck
      }));
      return;
    }

    // 9. Send Google Chat Approval Card
    if (relativePath === '/api/content-engine/send-approval-card' && req.method === 'POST') {
      getRequestBody().then(({ postId, webhookUrl }) => {
        const queue = readJson(CE_QUEUE_FILE, []);
        const post = queue.find(p => p.id === postId) || queue[0];
        if (!post) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'No post found to dispatch approval card' }));
          return;
        }

        const cardPayload = {
          cardsV2: [{
            cardId: `approval-${post.id}`,
            card: {
              header: {
                title: "Content Engine Approval Request",
                subtitle: `Topic: ${post.niche || 'Contractor Marketing'}`,
                imageUrl: "https://missedcallautosms.com/assets/missed-call-logo.png",
                imageType: "CIRCLE"
              },
              sections: [{
                header: "Post Details",
                widgets: [
                  { decoratedText: { topLabel: "Headline", text: post.title, wrapText: true } },
                  { decoratedText: { topLabel: "Scroll-Stopping Hook", text: post.hook, wrapText: true } },
                  { textParagraph: { text: "<b>Narrative Draft:</b><br>" + (post.narrativeBody || '').slice(0, 320) + "..." } },
                  { decoratedText: { topLabel: "Recommended Format", text: post.format } },
                  {
                    buttonList: {
                      buttons: [
                        {
                          text: "✅ 1-Tap Approve & Schedule",
                          onClick: {
                            openLink: { url: `https://missedcallautosms.com/api/content-engine/one-click-approve?postId=${post.id}` }
                          }
                        },
                        {
                          text: "👁️ Review in Dashboard",
                          onClick: {
                            openLink: { url: "https://missedcallautosms.com/owner?tab=6" }
                          }
                        }
                      ]
                    }
                  }
                ]
              }]
            }
          }]
        };

        const targetUrl = webhookUrl || (readJson(CE_SETTINGS_FILE, {}).googleChatWebhookUrl) || process.env.GOOGLE_CHAT_WEBHOOK_URL || '';
        if (targetUrl && targetUrl.startsWith('https://chat.googleapis.com')) {
          const urlParts = new URL(targetUrl);
          const reqPost = https.request({
            hostname: urlParts.hostname,
            path: urlParts.pathname + urlParts.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=UTF-8'
            }
          }, resp => {
            let resBody = '';
            resp.on('data', c => resBody += c);
            resp.on('end', () => {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ success: true, liveDispatched: true, cardPayload, response: resBody }));
            });
          });
          reqPost.on('error', err => {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: true, liveDispatched: false, cardPayload, warning: err.message }));
          });
          reqPost.write(JSON.stringify(cardPayload));
          reqPost.end();
        } else {
          // Simulated dispatch / test preview
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            liveDispatched: false,
            cardPayload,
            message: 'Card generated successfully! Configure a Google Chat Incoming Webhook URL to receive live push notifications.'
          }));
        }
      });
      return;
    }

    // 9b. One-Click Approval from Google Chat
    if (relativePath === '/api/content-engine/one-click-approve' && req.method === 'GET') {
      const parsedUrl = new URL(req.url, 'http://localhost:8000');
      const postId = parsedUrl.searchParams.get('postId') || parsedUrl.searchParams.get('id');
      let queue = readJson(CE_QUEUE_FILE, []);
      const post = queue.find(p => p.id === postId);
      if (!post) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Post not found</h1>');
        return;
      }

      post.status = 'approved';
      post.approvedAt = new Date().toISOString();
      writeJson(CE_QUEUE_FILE, queue);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Post Approved - Missed Call Auto SMS</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 16px; padding: 36px; max-width: 520px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700; font-size: 13px; padding: 6px 14px; border-radius: 999px; margin-bottom: 20px; border: 1px solid rgba(16, 185, 129, 0.3); }
    h1 { font-size: 22px; font-weight: 800; margin: 0 0 12px 0; color: #ffffff; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; }
    .title-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 14px; border-radius: 10px; font-weight: 600; color: #38bdf8; margin-bottom: 24px; font-size: 15px; }
    .btn { display: inline-block; background: #2563eb; color: #ffffff; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 10px; transition: background 0.2s; }
    .btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✔ APPROVED FOR PUBLICATION</div>
    <h1>Post Successfully Approved</h1>
    <div class="title-box">${post.title}</div>
    <p>This post is now armed for autonomous release according to your schedule (Blog, Facebook, and Instagram).</p>
    <a href="/owner?tab=6" class="btn">Open Omnichannel Queue & Dashboard</a>
  </div>
</body>
</html>`);
      return;
    }

    // 10. Analytics
    if (relativePath === '/api/content-engine/analytics' && req.method === 'GET') {
      const analytics = readJson(CE_ANALYTICS_FILE, {});
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true, analytics }));
      return;
    }

    // 11. Settings
    if (relativePath === '/api/content-engine/settings' && req.method === 'POST') {
      getRequestBody().then(newSettings => {
        let settings = readJson(CE_SETTINGS_FILE, {});
        settings = { ...settings, ...newSettings };
        writeJson(CE_SETTINGS_FILE, settings);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, settings }));
      });
      return;
    }
  }

  // ─── 🤝 Referral & Net-Profit Rev-Share API Endpoints ───
  if (relativePath.startsWith('/api/referrals/')) {
    const parseJsonBody = () => new Promise(resolve => {
      let b = '';
      req.on('data', c => b += c);
      req.on('end', () => {
        try { resolve(b ? JSON.parse(b) : {}); } catch (e) { resolve({}); }
      });
    });

    // 1. Get Partners & Summary Stats
    if (relativePath === '/api/referrals/partners' && req.method === 'GET') {
      const partners = syncPartnerMetrics();
      const ledger = getReferralLedger();
      const summary = {
        totalPartners: partners.length,
        activePartners: partners.filter(p => p.status === 'ACTIVE').length,
        totalGrossReferred: Math.round(partners.reduce((s, p) => s + (p.totalGrossReferred || 0), 0) * 100) / 100,
        totalNetProfitReferred: Math.round(partners.reduce((s, p) => s + (p.totalNetProfitReferred || 0), 0) * 100) / 100,
        totalEarnedCommission: Math.round(partners.reduce((s, p) => s + (p.totalEarnedCommission || 0), 0) * 100) / 100,
        totalPaidCommission: Math.round(partners.reduce((s, p) => s + (p.totalPaidCommission || 0), 0) * 100) / 100,
        pendingBufferCommission: Math.round(partners.reduce((s, p) => s + (p.pendingBufferCommission || 0), 0) * 100) / 100,
        availablePayoutCommission: Math.round(partners.reduce((s, p) => s + (p.availablePayoutCommission || 0), 0) * 100) / 100,
        totalTransactions: ledger.length
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true, summary, partners }));
      return;
    }

    // 2. Create or Update Partner Profile
    if (relativePath === '/api/referrals/partners' && req.method === 'POST') {
      parseJsonBody().then(payload => {
        if (!payload.code || !payload.name) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Partner code and name are required' }));
          return;
        }

        const partners = getReferralPartners();
        const cleanCode = String(payload.code).trim().toUpperCase();
        let existingIndex = partners.findIndex(p => p.code.toUpperCase() === cleanCode);

        const partnerRecord = {
          code: cleanCode,
          name: String(payload.name).trim(),
          email: String(payload.email || '').trim(),
          phone: String(payload.phone || '').trim(),
          revSharePct: Number(payload.revSharePct) || 25,
          payoutMethod: payload.payoutMethod || 'cash_app',
          payoutHandle: String(payload.payoutHandle || '').trim(),
          notes: String(payload.notes || '').trim(),
          status: payload.status || 'ACTIVE',
          createdAt: (existingIndex >= 0 ? partners[existingIndex].createdAt : new Date().toISOString()),
          updatedAt: new Date().toISOString(),
          totalGrossReferred: existingIndex >= 0 ? partners[existingIndex].totalGrossReferred : 0,
          totalNetProfitReferred: existingIndex >= 0 ? partners[existingIndex].totalNetProfitReferred : 0,
          totalEarnedCommission: existingIndex >= 0 ? partners[existingIndex].totalEarnedCommission : 0,
          totalPaidCommission: existingIndex >= 0 ? partners[existingIndex].totalPaidCommission : 0,
          pendingBufferCommission: existingIndex >= 0 ? partners[existingIndex].pendingBufferCommission : 0,
          availablePayoutCommission: existingIndex >= 0 ? partners[existingIndex].availablePayoutCommission : 0
        };

        if (existingIndex >= 0) {
          partners[existingIndex] = partnerRecord;
        } else {
          partners.push(partnerRecord);
        }

        saveReferralPartners(partners);
        syncPartnerMetrics();

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, message: `Partner ${cleanCode} saved successfully`, partner: partnerRecord }));
      });
      return;
    }

    // 3. Delete / Archive Partner
    if (relativePath === '/api/referrals/partners/delete' && req.method === 'POST') {
      parseJsonBody().then(payload => {
        if (!payload.code) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Partner code required' }));
          return;
        }
        let partners = getReferralPartners();
        const cleanCode = String(payload.code).trim().toUpperCase();
        partners = partners.filter(p => p.code.toUpperCase() !== cleanCode);
        saveReferralPartners(partners);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, message: `Partner ${cleanCode} deleted` }));
      });
      return;
    }

    // 4. Get Ledger Transactions
    if (relativePath === '/api/referrals/ledger' && req.method === 'GET') {
      const ledger = getReferralLedger();
      syncPartnerMetrics();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true, ledger }));
      return;
    }

    // 5. Add Transaction (Manual or Hook)
    if (relativePath === '/api/referrals/ledger/add' && req.method === 'POST') {
      parseJsonBody().then(payload => {
        const tx = addReferralTransaction(payload);
        if (!tx) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Could not record referral transaction' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, transaction: tx }));
      });
      return;
    }

    // 6. Execute Payout Batch (Cash App / Chime / PayPal / Stripe)
    if (relativePath === '/api/referrals/payout' && req.method === 'POST') {
      parseJsonBody().then(payload => {
        const targetPartner = (payload.partnerCode || 'ALL').trim().toUpperCase();
        const note = payload.note || 'Missed Call Auto SMS Net-Profit Rev-Share Payout';
        const ledger = getReferralLedger();
        const partners = getReferralPartners();

        // Filter transactions ready for payout
        const eligibleTxs = ledger.filter(tx => {
          if (tx.status !== 'AVAILABLE') return false;
          if (targetPartner !== 'ALL' && tx.partnerCode.toUpperCase() !== targetPartner) return false;
          return true;
        });

        if (eligibleTxs.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'No cleared commissions currently available for payout' }));
          return;
        }

        const batchId = `payout_batch_${Date.now()}`;
        const nowIso = new Date().toISOString();

        // Group by partner
        const grouped = {};
        eligibleTxs.forEach(tx => {
          if (!grouped[tx.partnerCode]) {
            const partner = partners.find(p => p.code.toUpperCase() === tx.partnerCode.toUpperCase()) || {};
            grouped[tx.partnerCode] = {
              partnerCode: tx.partnerCode,
              partnerName: tx.partnerName || partner.name || tx.partnerCode,
              payoutMethod: partner.payoutMethod || 'cash_app',
              payoutHandle: partner.payoutHandle || 'N/A',
              amount: 0,
              transactionIds: [],
              processedAt: nowIso,
              referenceNote: note
            };
          }
          grouped[tx.partnerCode].amount = Math.round((grouped[tx.partnerCode].amount + tx.commissionEarned) * 100) / 100;
          grouped[tx.partnerCode].transactionIds.push(tx.id);

          // Update transaction in ledger
          tx.status = 'PAID';
          tx.payoutBatchId = batchId;
          tx.payoutDate = nowIso;
        });

        const payoutItems = Object.values(grouped);
        const totalBatchAmount = Math.round(payoutItems.reduce((s, item) => s + item.amount, 0) * 100) / 100;

        const batchRecord = {
          batchId,
          createdAt: nowIso,
          totalAmount: totalBatchAmount,
          payoutCount: payoutItems.length,
          status: 'COMPLETED',
          notes: note,
          payouts: payoutItems
        };

        const payouts = getReferralPayouts();
        payouts.unshift(batchRecord);
        saveReferralPayouts(payouts);
        saveReferralLedger(ledger);
        syncPartnerMetrics();

        console.log(`💰 [PAYOUT BATCH PROCESSED] ${batchId}: $${totalBatchAmount} across ${payoutItems.length} partners.`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: `Payout batch ${batchId} executed successfully for $${totalBatchAmount}`,
          batch: batchRecord
        }));
      });
      return;
    }

    // 7. Get Past Payout Batches
    if (relativePath === '/api/referrals/payouts' && req.method === 'GET') {
      const payouts = getReferralPayouts();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true, payouts }));
      return;
    }

    // 8. Export Payout CSV (Formatted for Chime/Cash App/Bank ACH Mass Pay)
    if (relativePath === '/api/referrals/export-payouts' && req.method === 'GET') {
      const partners = syncPartnerMetrics();
      const availablePartners = partners.filter(p => (p.availablePayoutCommission || 0) > 0);

      let csv = 'Partner Code,Partner Name,Payout Method,Payout Handle,Available Commission,Email,Phone,Notes\n';
      availablePartners.forEach(p => {
        csv += `"${p.code}","${p.name}","${p.payoutMethod || 'cash_app'}","${p.payoutHandle || ''}",${p.availablePayoutCommission.toFixed(2)},"${p.email || ''}","${p.phone || ''}","${p.notes || ''}"\n`;
      });

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="mcasms_referral_payouts_${Date.now()}.csv"`,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(csv);
      return;
    }
  }

  // Clean URL Routing
  if (relativePath === '/') {
    relativePath = '/voice.html';
  } else if (relativePath === '/flagship' || relativePath === '/flagship/') {
    relativePath = '/sales_landing_page.html';
  } else if (relativePath === '/owner' || relativePath === '/owner/') {
    relativePath = '/owner_admin_dashboard.html';
  } else if (relativePath === '/voice' || relativePath === '/voice/') {
    relativePath = '/voice.html';
  } else if (relativePath === '/agency' || relativePath === '/agency/') {
    relativePath = '/agency.html';
  } else if (relativePath === '/developers' || relativePath === '/developers/' || relativePath === '/docs' || relativePath === '/docs/') {
    relativePath = '/developers.html';
  } else if (relativePath === '/support' || relativePath === '/support/') {
    relativePath = '/support.html';
  } else if (relativePath === '/blog' || relativePath === '/blog/') {
    relativePath = '/blog.html';
  } else if (relativePath === '/content-engine' || relativePath === '/content-engine/' || relativePath === '/marketing' || relativePath === '/marketing/') {
    relativePath = '/content_engine_dashboard.html';
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

// ─── Omnichannel Background Auto-Scheduler Daemon ───
async function runOmnichannelSchedulerBackgroundCheck() {
  const CE_DATA_DIR = path.join(__dirname, 'data');
  const CE_QUEUE_FILE = path.join(CE_DATA_DIR, 'content_engine_queue.json');
  const CE_SETTINGS_FILE = path.join(CE_DATA_DIR, 'content_engine_settings.json');

  if (!fs.existsSync(CE_QUEUE_FILE) || !fs.existsSync(CE_SETTINGS_FILE)) return;

  try {
    const settings = JSON.parse(fs.readFileSync(CE_SETTINGS_FILE, 'utf8'));
    if (settings.autoPostingEnabled === false) {
      return; // Auto-posting paused by owner
    }

    let queue = JSON.parse(fs.readFileSync(CE_QUEUE_FILE, 'utf8'));
    const now = new Date();
    let updated = false;

    // Auto-population guard: Ensure the 3 daily format-specific slots are populated if empty
    const pendingSlots = queue.filter(q => q.status === 'draft' || q.status === 'approved');
    if (pendingSlots.length === 0) {
      console.log(`[OmnichannelScheduler] ℹ️ Queue has 0 pending items. Synthesizing 3 format-specific slots for upcoming schedule...`);
      try {
        const { synthesizeContentAngles } = require('./scripts/content_engine_agent');
        await synthesizeContentAngles(settings.defaultNiche || 'Small Service Contractors & Trades');
        queue = JSON.parse(fs.readFileSync(CE_QUEUE_FILE, 'utf8'));
        console.log(`[OmnichannelScheduler] ✅ Successfully auto-populated queue with ${queue.length} items across 3 formats.`);
      } catch (synthErr) {
        console.warn(`[OmnichannelScheduler] Could not auto-populate queue: ${synthErr.message}`);
      }
    }

    for (const post of queue) {
      // Auto-dispatch Google Chat approval cards for unnotified drafts
      const targetUrl = settings.googleChatWebhookUrl || process.env.GOOGLE_CHAT_WEBHOOK_URL || '';
      if (targetUrl && targetUrl.startsWith('https://chat.googleapis.com') && post.status === 'draft' && !post.chatCardDispatched) {
        post.chatCardDispatched = true;
        updated = true;
        console.log(`[OmnichannelScheduler] 🔔 Auto-dispatching Google Chat approval card for draft: "${post.title}"`);
        try {
          const cardPayload = {
            cardsV2: [{
              cardId: `approval-${post.id}`,
              card: {
                header: {
                  title: "Content Engine Approval Request",
                  subtitle: `Topic: ${post.niche || 'Contractor Marketing'} | Format: ${post.format || 'Blog / Social'}`,
                  imageUrl: "https://missedcallautosms.com/assets/missed-call-logo.png",
                  imageType: "CIRCLE"
                },
                sections: [{
                  header: "Post Details",
                  widgets: [
                    { decoratedText: { topLabel: "Headline", text: post.title, wrapText: true } },
                    { decoratedText: { topLabel: "Scroll-Stopping Hook", text: post.hook, wrapText: true } },
                    { textParagraph: { text: "<b>Narrative Draft:</b><br>" + (post.narrativeBody || '').slice(0, 320) + "..." } },
                    { decoratedText: { topLabel: "Scheduled For", text: post.scheduledFor ? new Date(post.scheduledFor).toLocaleString() : 'Immediate' } },
                    {
                      buttonList: {
                        buttons: [
                          {
                            text: "✅ 1-Tap Approve & Schedule",
                            onClick: {
                              openLink: { url: `https://missedcallautosms.com/api/content-engine/one-click-approve?postId=${post.id}` }
                            }
                          },
                          {
                            text: "👁️ Review in Dashboard",
                            onClick: {
                              openLink: { url: "https://missedcallautosms.com/owner?tab=6" }
                            }
                          }
                        ]
                      }
                    }
                  ]
                }]
              }
            }]
          };

          await new Promise(resolve => {
            const urlParts = new URL(targetUrl);
            const reqPost = https.request({
              hostname: urlParts.hostname,
              path: urlParts.pathname + urlParts.search,
              method: 'POST',
              headers: { 'Content-Type': 'application/json; charset=UTF-8' }
            }, resp => {
              let resBody = '';
              resp.on('data', c => resBody += c);
              resp.on('end', () => {
                console.log(`[GoogleChat] Delivered approval card for "${post.title}" (Status: ${resp.statusCode})`);
                if (resp.statusCode === 429) {
                  post.chatCardDispatched = false; // Retry next cycle
                }
                setTimeout(resolve, 1500); // 1.5s pace to avoid rate limits
              });
            });
            reqPost.on('error', err => {
              console.warn(`[GoogleChat] Webhook delivery error: ${err.message}`);
              post.chatCardDispatched = false;
              resolve();
            });
            reqPost.write(JSON.stringify(cardPayload));
            reqPost.end();
          });
        } catch (e) {
          console.warn(`[GoogleChat] Error formatting card: ${e.message}`);
        }
      }

      const isApproved = settings.autoPublishApprovedOnly !== false ? (post.status === 'approved') : (post.status === 'approved' || post.status === 'draft');
      const isDue = post.scheduledFor && new Date(post.scheduledFor) <= now;
      const isNotPublished = post.status !== 'published' && !post.publishedAt;

      if (isApproved && isDue && isNotPublished) {
        console.log(`[OmnichannelScheduler] 🚀 Auto-publishing due approved post: "${post.title}" (Scheduled: ${post.scheduledFor})`);
        try {
          const pubResult = await executePostPublish(post);
          post.status = 'published';
          post.publishedAt = pubResult.publishedAt;
          post.publishedVia = 'auto_scheduler';
          updated = true;
          console.log(`[OmnichannelScheduler] ✅ Successfully auto-published: "${post.title}"`);
        } catch (pubErr) {
          console.error(`[OmnichannelScheduler] ❌ Auto-publish blocked for "${post.title}":`, pubErr.message);
        }
      }
    }

    settings.lastSchedulerCheck = now.toISOString();
    fs.writeFileSync(CE_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');

    if (updated) {
      fs.writeFileSync(CE_QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
      console.log(`[OmnichannelScheduler] ✅ Content queue updated after auto-publishing.`);
    }
  } catch (err) {
    console.error(`[OmnichannelScheduler] Error during scheduler check:`, err.message);
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}/ and http://10.0.0.65:${PORT}/`);
  // Start active omnichannel auto-scheduler daemon (checks every 60s)
  setInterval(runOmnichannelSchedulerBackgroundCheck, 60000);
  setTimeout(runOmnichannelSchedulerBackgroundCheck, 3000);
});

// ═══════════════════════════════════════════════════════════════════
//  AUTONOMOUS DAILY SOCIAL AUTOMATION SCHEDULER
//  Slots: 9:00 AM (morning blog), 12:30 PM (lunch feed), 6:00 PM (evening reel+story)
//  All times in US Eastern Time (UTC-4 EDT / UTC-5 EST)
// ═══════════════════════════════════════════════════════════════════
(function startSocialScheduler() {
  const { publishMorningBlog, publishLunchFeedPost, publishEveningReelAndStory } = require('./scripts/publish_omnichannel');
  const { generateDailyContentBundle } = require('./scripts/generate_daily_content');

  const EASTERN_OFFSET_HOURS = -4; // EDT; change to -5 in Nov for EST

  function nowEastern() {
    const d = new Date();
    d.setHours(d.getHours() + EASTERN_OFFSET_HOURS + (d.getTimezoneOffset() / 60));
    return d;
  }

  function msTilNextEastern(targetHour, targetMinute) {
    const now = new Date();
    const et = nowEastern();
    const todayTarget = new Date(now);
    // Compute offset delta: (targetHour:targetMinute ET) - now UTC
    const deltaHours = targetHour - et.getHours();
    const deltaMins = targetMinute - et.getMinutes();
    const deltaMs = (deltaHours * 60 + deltaMins) * 60 * 1000 - (et.getSeconds() * 1000 + et.getMilliseconds());
    return deltaMs > 0 ? deltaMs : deltaMs + 24 * 60 * 60 * 1000; // wrap to next day
  }

  const histPath = path.join(__dirname, 'data/social_publish_history.json');

  function alreadyRanToday(slot) {
    try {
      if (!fs.existsSync(histPath)) return false;
      const hist = JSON.parse(fs.readFileSync(histPath, 'utf8'));
      const today = new Date().toISOString().split('T')[0];
      return !!(hist[today] && hist[today][slot]);
    } catch { return false; }
  }

  function markSlotDone(slot) {
    try {
      let hist = {};
      if (fs.existsSync(histPath)) hist = JSON.parse(fs.readFileSync(histPath, 'utf8'));
      const today = new Date().toISOString().split('T')[0];
      if (!hist[today]) hist[today] = {};
      hist[today][slot] = { timestamp: new Date().toISOString(), auto: true };
      fs.mkdirSync(path.dirname(histPath), { recursive: true });
      fs.writeFileSync(histPath, JSON.stringify(hist, null, 2), 'utf8');
    } catch {}
  }

  async function getDailyBundle() {
    const bufferPath = path.join(__dirname, 'data/daily_content_buffer.json');
    const todayStr = new Date().toISOString().split('T')[0];
    if (fs.existsSync(bufferPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(bufferPath, 'utf8'));
        if (raw && raw.date === todayStr) return raw;
      } catch {}
    }
    console.log('🔄 [SCHEDULER] Generating fresh daily bundle...');
    const bundle = await generateDailyContentBundle({ offline: true });
    try {
      fs.mkdirSync(path.dirname(bufferPath), { recursive: true });
      fs.writeFileSync(bufferPath, JSON.stringify(bundle, null, 2), 'utf8');
    } catch {}
    return bundle;
  }

  function scheduleSlot(slotName, targetHour, targetMin, fn) {
    const delay = msTilNextEastern(targetHour, targetMin);
    const fireAt = new Date(Date.now() + delay);
    console.log(`📅 [SCHEDULER] "${slotName}" scheduled for ${fireAt.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET (in ${Math.round(delay/60000)} min)`);

    setTimeout(async function tick() {
      if (alreadyRanToday(slotName)) {
        console.log(`⏭️  [SCHEDULER] "${slotName}" already ran today — skipping.`);
      } else {
        console.log(`\n🚀 [SCHEDULER] FIRING "${slotName}" slot...`);
        try {
          const bundle = await getDailyBundle();
          await fn(bundle, false);
          markSlotDone(slotName);
          console.log(`✅ [SCHEDULER] "${slotName}" complete.`);
        } catch (err) {
          console.error(`❌ [SCHEDULER] "${slotName}" error:`, err.message);
        }
      }
      // Re-schedule for same time tomorrow
      setTimeout(tick, msTilNextEastern(targetHour, targetMin));
    }, delay);
  }

  // Wire up all 3 daily slots from settings or defaults
  let slotTimes = ["09:00", "13:00", "18:00"];
  try {
    const ceSettingsFile = path.join(__dirname, 'data/content_engine_settings.json');
    if (fs.existsSync(ceSettingsFile)) {
      const ceSettings = JSON.parse(fs.readFileSync(ceSettingsFile, 'utf8'));
      if (ceSettings.postingTimeslots && ceSettings.postingTimeslots.length >= 3) {
        slotTimes = ceSettings.postingTimeslots;
      }
    }
  } catch (e) {}

  const [mH, mM] = (slotTimes[0] || "09:00").split(':').map(Number);
  const [lH, lM] = (slotTimes[1] || "13:00").split(':').map(Number);
  const [eH, eM] = (slotTimes[2] || "18:00").split(':').map(Number);

  scheduleSlot('morning', mH, mM, publishMorningBlog);
  scheduleSlot('lunch',   lH, lM, publishLunchFeedPost);
  scheduleSlot('evening', eH, eM, publishEveningReelAndStory);

  console.log(`✅ [SCHEDULER] Daily social automation active (${slotTimes[0]} / ${slotTimes[1]} / ${slotTimes[2]} ET)`);
})();
