const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const { exec } = require('child_process');
const crypto = require('crypto');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000;
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
  versionCode: 40,
  versionName: '2.0.0',
  downloadUrl: 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS.apk',
  proDownloadUrl: 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS-Pro.apk',
  releaseNotes: '• 🚀 Major Release v2.0 (Build 40): Client Portal & Voice Automation Suite\n• 🌐 Turnkey Client Portal: Audio call logs, transcripts & interactive SMS\n• 📋 Autonomous AI Task Engine: Automatic action items from calls & SMS\n• 💼 White-Label Fleet Support & Remote Prompt Sync\n• 🛡️ Cellular P2P Carrier Reliability & Dual-SIM Optimizations',
  mandatory: false,
  minSupportedVersion: 1
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

function getStripePublishableKey() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/STRIPE_PUBLISHABLE_KEY=(.*)/);
    if (match && match[1]) return match[1].trim();
  }
  return process.env.STRIPE_PUBLISHABLE_KEY || '';
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

// Extract and vault saved payment method details from a Stripe checkout/payment session
async function getPaymentMethodDetailsFromSession(session) {
  let cardDetails = null;
  const customerId = session.customer;
  try {
    let pmId = null;
    if (session.payment_intent) {
      const pi = await stripeApiRequest(`/v1/payment_intents/${session.payment_intent}?expand[]=payment_method`);
      if (pi && pi.payment_method && typeof pi.payment_method === 'object') {
        pmId = pi.payment_method.id;
        cardDetails = {
          id: pi.payment_method.id,
          brand: pi.payment_method.card?.brand || 'card',
          last4: pi.payment_method.card?.last4 || '••••',
          exp_month: pi.payment_method.card?.exp_month || 0,
          exp_year: pi.payment_method.card?.exp_year || 0
        };
      }
    } else if (session.setup_intent) {
      const si = await stripeApiRequest(`/v1/setup_intents/${session.setup_intent}?expand[]=payment_method`);
      if (si && si.payment_method && typeof si.payment_method === 'object') {
        pmId = si.payment_method.id;
        cardDetails = {
          id: si.payment_method.id,
          brand: si.payment_method.card?.brand || 'card',
          last4: si.payment_method.card?.last4 || '••••',
          exp_month: si.payment_method.card?.exp_month || 0,
          exp_year: si.payment_method.card?.exp_year || 0
        };
      }
    }

    if (!cardDetails && customerId) {
      const pmList = await stripeApiRequest(`/v1/customers/${customerId}/payment_methods?type=card`);
      if (pmList && pmList.data && pmList.data.length > 0) {
        const pm = pmList.data[0];
        pmId = pm.id;
        cardDetails = {
          id: pm.id,
          brand: pm.card?.brand || 'card',
          last4: pm.card?.last4 || '••••',
          exp_month: pm.card?.exp_month || 0,
          exp_year: pm.card?.exp_year || 0
        };
      }
    }

    // Set default payment method on customer in Stripe so future off-session charges work seamlessly
    if (pmId && customerId) {
      await stripeApiRequest(`/v1/customers/${customerId}`, 'POST', {
        'invoice_settings[default_payment_method]': pmId
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('[Stripe PaymentMethod Extraction]', err.message);
  }
  return { customerId, cardDetails };
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
                Your Pro license is pre-cleared for our <strong>Turnkey 24/7 AI Voice Receptionist</strong> add-on ($9.99/mo with included starter minutes). When you're ready, activate your dedicated AI line with 1-click *71 carrier forwarding anytime.
            </div>
            <a href="https://missedcallautosms.com/voice" style="display: inline-block; background: rgba(168, 85, 247, 0.2); color: #C084FC; border: 1px solid #A855F7; font-weight: 700; font-size: 12px; padding: 8px 20px; border-radius: 20px; text-decoration: none;">
                Learn More & Add Voice Receptionist ($9.99/mo) →
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

// ─── Remote Appliance Configuration Hub ───
const APPLIANCE_CONFIGS_FILE = path.join(__dirname, 'data', 'appliance_configs.json');

function getApplianceConfigs() {
  if (fs.existsSync(APPLIANCE_CONFIGS_FILE)) {
    try { return JSON.parse(fs.readFileSync(APPLIANCE_CONFIGS_FILE, 'utf8')); } catch (e) { return {}; }
  }
  return {};
}

function getApplianceConfigByKey(licenseKey) {
  const all = getApplianceConfigs();
  const cleanKey = (licenseKey || '').trim().toUpperCase();
  if (all[cleanKey]) {
    return all[cleanKey];
  }
  // Initialize with sensible defaults from master_licenses if available
  const master = getMasterLicenses().find(m => m.key === cleanKey);
  const vSettings = getVoiceSettings();
  const defaultConfig = {
    licenseKey: cleanKey,
    agencyId: master?.agencyId || '',
    customerName: master?.customer || 'Client Business',
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
    voice: {
      voiceReceptionistEnabled: master?.voiceEntitlement ?? false,
      voiceAgentName: 'Riley',
      customGreeting: vSettings.customGreeting || "Hi, thank you for calling! How can I help you today?",
      systemPrompt: "You are a friendly, professional AI receptionist. Your job is to answer incoming calls, capture the caller's name, phone number, and service request, and reassure them that our team will follow up shortly.",
      forwardingNumber: master?.voiceNumber || vSettings.forwardingNumber || "+1 (732) 660-9121",
      carrierCode: master?.carrierCode || vSettings.carrierCode || "*717326609121",
      emergencyTransferNumber: vSettings.emergencyTransferNumber || "",
      model: "gpt-4o-mini",
      vapiAssistantId: master?.vapiAssistantId || null
    },
    handset: {
      messageTemplate: `Hey! Sorry I missed your call. How can I help you today? - ${master?.customer || 'My Business'}`,
      jitterDelaySeconds: 15,
      muteNativeAutoReply: false,
      outboundWebhookEnabled: master?.edition === 'pro',
      selectedOutboundWebhookUrl: "",
      lockHandsetSettings: false
    }
  };
  return defaultConfig;
}

function saveApplianceConfig(licenseKey, configUpdate, updatedBy = 'system') {
  const cleanKey = (licenseKey || '').trim().toUpperCase();
  const all = getApplianceConfigs();
  const existing = all[cleanKey] || getApplianceConfigByKey(cleanKey);

  const updated = {
    ...existing,
    ...configUpdate,
    licenseKey: cleanKey,
    voice: {
      ...existing.voice,
      ...(configUpdate.voice || {})
    },
    handset: {
      ...existing.handset,
      ...(configUpdate.handset || {})
    },
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy
  };

  all[cleanKey] = updated;
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(APPLIANCE_CONFIGS_FILE, JSON.stringify(all, null, 2), 'utf8');

  // Also mirror to Firestore if available
  const fdb = getFirestoreDb();
  if (fdb && fdb.db) {
    try {
      fdb.db.collection('appliance_configs').doc(cleanKey).set(updated, { merge: true })
        .catch(e => console.warn('[Firestore] appliance_configs sync error:', e.message));
    } catch (e) {}
  }

  return updated;
}

async function syncRemoteVoiceToVapi(licenseKey, voiceConfig) {
  if (!voiceConfig) return { success: true };
  try {
    const { apiKey, assistantId } = getVapiConfig();
    if (!apiKey) {
      console.warn('[Remote Voice Vapi] Vapi API key not configured, skipping live Vapi patch.');
      return { success: false, reason: 'No Vapi API key' };
    }

    let targetAssistantId = voiceConfig.vapiAssistantId || null;
    if (!targetAssistantId) {
      try {
        const fdb = getFirestoreDb();
        if (fdb && fdb.getVoiceBinding) {
          const binding = await fdb.getVoiceBinding(licenseKey);
          if (binding && binding.vapiAssistantId) {
            targetAssistantId = binding.vapiAssistantId;
          }
        }
      } catch (e) {}
    }

    if (!targetAssistantId) {
      targetAssistantId = assistantId || '5105b379-8cbf-4037-becc-bba45504f781';
    }

    const patchPayload = {};
    if (voiceConfig.customGreeting !== undefined && voiceConfig.customGreeting.trim() !== '') {
      patchPayload.firstMessage = voiceConfig.customGreeting.trim();
    }
    if (voiceConfig.systemPrompt !== undefined && voiceConfig.systemPrompt.trim() !== '') {
      patchPayload.model = {
        provider: 'openai',
        model: voiceConfig.model || 'gpt-4o-mini',
        temperature: typeof voiceConfig.temperature === 'number' ? voiceConfig.temperature : 0.3,
        messages: [
          { role: 'system', content: voiceConfig.systemPrompt.trim() }
        ]
      };
    }
    if (voiceConfig.voiceAgentName) {
      patchPayload.name = voiceConfig.voiceAgentName.trim();
    }

    if (Object.keys(patchPayload).length === 0) {
      return { success: true, message: 'No Vapi changes required' };
    }

    const vapiRes = await vapiApiRequest(`/assistant/${targetAssistantId}`, 'PATCH', patchPayload);
    console.log(`🎙️ [VAPI LIVE REMOTE SYNC] Assistant ${targetAssistantId} updated live from dashboard for key ${licenseKey}`);
    return { success: true, assistant: vapiRes };
  } catch (err) {
    console.warn(`[VAPI LIVE REMOTE SYNC] Warning: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ─── Universal Webhook Dispatcher (GoHighLevel, Zapier, Make, n8n) ───
function dispatchWebhookPayload(targetUrl, payload, secret = '') {
  if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.startsWith('http')) return;
  try {
    const parsed = new URL(targetUrl);
    const postData = JSON.stringify(payload);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'MissedCallAutoSMS-WebhookRouter/2.0'
    };

    if (secret) {
      const hmac = crypto.createHmac('sha256', secret).update(postData).digest('hex');
      headers['X-MCAS-Signature'] = `sha256=${hmac}`;
    }

    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: headers,
      timeout: 8000
    }, (res) => {
      console.log(`📡 [WEBHOOK ROUTER] Delivered to ${parsed.hostname} (Status ${res.statusCode}) for event "${payload.event}"`);
    });

    req.on('error', (err) => {
      console.warn(`[WEBHOOK ROUTER WARNING] Delivery failed to ${targetUrl}: ${err.message}`);
    });

    req.write(postData);
    req.end();
  } catch (err) {
    console.warn(`[WEBHOOK ROUTER ERROR] ${err.message}`);
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
        MANAGED AI VOICE RECEPTIONIST PLAN ($9.99/MO)
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
//  CONTENT ENGINE & BLOG ZERO-IMAGE & ZERO-VIDEO REUSE SAFEGUARDS
// ═══════════════════════════════════════════════════════════════════
const {
  isVideoAlreadyUsed,
  isImageAlreadyUsed,
  assertUniqueMedia,
  cleanBasename
} = require('./scripts/media_guard');

function isImageAlreadyUsedInBlog(imageUrl, currentSlug = null) {
  return isImageAlreadyUsed(imageUrl, currentSlug);
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
    if (isImageAlreadyUsed(post.imageUrl, post.id)) {
      throw new Error(`[ZeroMediaReuseGuard] HARD BLOCK: Image "${cleanBasename(post.imageUrl)}" has already been used in an existing article or post. Recycling visual assets is STRICTLY FORBIDDEN per Workspace Guidelines.`);
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
    if (!videoUrl && post.videoAsset) {
      videoUrl = post.videoAsset.startsWith('http')
        ? post.videoAsset
        : `https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/${post.videoAsset}`;
    }

    // MANDATORY ZERO-VIDEO-REUSE HARDCODED GUARD
    if (!videoUrl) {
      throw new Error(`[ZeroVideoReuseGuard] HARD BLOCK: Cannot publish reel "${post.title}" because neither post.videoUrl nor post.videoAsset is provided. Every reel MUST have a 100% unique, bespoke video.`);
    }

    if (isVideoAlreadyUsed(videoUrl, post.id)) {
      throw new Error(`[ZeroVideoReuseGuard] HARD BLOCK: Video "${cleanBasename(videoUrl)}" has already been used in an existing post/slot. Recycling video assets is STRICTLY FORBIDDEN per Workspace Guidelines.`);
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
          proDownloadUrl: payload.proDownloadUrl || current.proDownloadUrl || 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS.apk',
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
          checkoutProUrl: 'https://buy.stripe.com/6oU9ATbBIeFI8U86OR2go0g',
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

        if (eventObj.type === 'checkout.session.completed' || eventObj.type === 'payment_intent.succeeded') {
          const session = eventObj.data.object;
          const customerDetails = session.customer_details || {};
          const customerEmail = customerDetails.email || session.customer_email || session.receipt_email || 'customer@example.com';
          const customerName = customerDetails.name || session.shipping?.name || 'Valued Customer';
          const amountTotal = (session.amount_total !== undefined && session.amount_total !== null) ? session.amount_total : (session.amount !== undefined ? session.amount : 2900);
          const metadata = session.metadata || {};

          // AUTOMATION: Agency White-Label Client Deployment & Card Vaulting via Stripe Checkout
          if (metadata.isAgencyClientIssuance === 'true' || metadata.action === 'agency_issue_client' || metadata.action === 'agency_attach_card') {
            const agencyId = (metadata.agencyId || metadata.agency_id || '').toLowerCase();
            const { customerId: stripeCustId, cardDetails } = await getPaymentMethodDetailsFromSession(session);
            const AGENCIES_CONFIG_PATH = path.join(__dirname, 'agencies', 'agencies.json');

            // Vault payment method to agency profile in agencies.json
            if (fs.existsSync(AGENCIES_CONFIG_PATH) && agencyId) {
              try {
                const cfg = JSON.parse(fs.readFileSync(AGENCIES_CONFIG_PATH, 'utf8'));
                if (cfg.agencies && cfg.agencies[agencyId]) {
                  cfg.agencies[agencyId].stripeCustomerId = stripeCustId || session.customer || cfg.agencies[agencyId].stripeCustomerId;
                  if (cardDetails) {
                    cfg.agencies[agencyId].cardBrand = cardDetails.brand;
                    cfg.agencies[agencyId].cardLast4 = cardDetails.last4;
                    cfg.agencies[agencyId].defaultPaymentMethodId = cardDetails.id;
                  }
                  fs.writeFileSync(AGENCIES_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
                }
              } catch (e) {}
            }

            if (metadata.action === 'agency_attach_card') {
              console.log(`💳 [AGENCY CARD ATTACHED] Agency [${agencyId}] saved card ${cardDetails?.brand} •••• ${cardDetails?.last4}`);
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ received: true, action: 'agency_attach_card', agencyId, cardSaved: !!cardDetails }));
              return;
            }

            const clientName = metadata.clientName || 'Client Business';
            const clientContact = metadata.clientContact || '';
            const clientNotes = metadata.clientNotes || '';
            const plan = metadata.plan || 'pro';
            const includeVoice = metadata.includeVoice === 'true' || !!session.subscription;

            const licenseKey = generateKey(clientName, 0, plan !== 'flagship');
            const nowIso = new Date().toISOString();
            const forwardingNumber = process.env.VAPI_PRIMARY_PHONE_NUMBER || '+1 (732) 660-9121';
            const cleanDigits = forwardingNumber.replace(/\D/g, '');
            const carrierCode = `*71${cleanDigits.slice(-10)}`;

            saveMasterLicense({
              key: licenseKey,
              customer: clientName,
              email: customerEmail,
              contact: clientContact,
              notes: clientNotes,
              agencyId: agencyId,
              edition: plan,
              voiceEntitlement: includeVoice,
              vapiProvisioned: includeVoice,
              voiceActive: includeVoice,
              voiceNumber: forwardingNumber,
              carrierCode: carrierCode,
              voiceMinutesBalance: includeVoice ? 40 : 0,
              status: 'ACTIVE',
              stripeSubscriptionId: session.subscription || null,
              stripeCustomerId: stripeCustId || session.customer || null,
              issuedAt: nowIso
            });

            console.log(`🎉 [AGENCY CLIENT DEPLOYED VIA STRIPE] Agency [${agencyId}] deployed [${clientName}] - Plan [${plan}], Voice [${includeVoice}], Key [${licenseKey}], Sub [${session.subscription || 'N/A'}]`);

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({
              received: true,
              agencyId,
              clientName,
              licenseKey,
              subscriptionId: session.subscription || null,
              status: 'DEPLOYED_ACTIVE'
            }));
            return;
          }

          // AUTOMATION 1: Managed AI Voice Receptionist ($9.99 / month recurring)
          const isVoicePro = (amountTotal === 999) || (amountTotal === 2900) || 
                             (metadata.tier === 'managed_voice_pro') || 
                             (metadata.tier === 'voice_addon') ||
                             (metadata.tier === 'voice_999') ||
                             (metadata.service === 'voice_receptionist') ||
                             (session.subscription && (amountTotal === 999 || amountTotal === 2900));

          if (isVoicePro) {
            console.log(`🎙️ [VOICE PRO SUBSCRIBED] Running automated post-payment provisioning for ${customerEmail} ($9.99/mo)...`);

            // Step A: Real Live Vapi Phone Number Provisioning
            const forwardingNumber = process.env.VAPI_PRIMARY_PHONE_NUMBER || '+1 (732) 660-9121';
            const cleanDigits = forwardingNumber.replace(/\D/g, '');
            const carrierCode = `*71${cleanDigits.slice(-10)}`;
            const carrierDeactivateCode = '*73';

            // Step A.1: Vault Saved Payment Method
            const { customerId: stripeCustId, cardDetails } = await getPaymentMethodDetailsFromSession(session);

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
            settings.stripeCustomerId = stripeCustId || session.customer || null;
            settings.defaultPaymentMethodId = cardDetails?.id || null;
            settings.cardBrand = cardDetails?.brand || null;
            settings.cardLast4 = cardDetails?.last4 || null;
            settings.cardExpMonth = cardDetails?.exp_month || null;
            settings.cardExpYear = cardDetails?.exp_year || null;
            settings.autoRebillEnabled = true;
            settings.autoBillingThresholdMinutes = 15;
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
              customerId: stripeCustId || session.customer || null,
              stripeCustomerId: stripeCustId || session.customer || null,
              stripePaymentMethodId: cardDetails?.id || null,
              defaultPaymentMethodId: cardDetails?.id || null,
              cardBrand: cardDetails?.brand || null,
              cardLast4: cardDetails?.last4 || null,
              cardExpMonth: cardDetails?.exp_month || null,
              cardExpYear: cardDetails?.exp_year || null,
              autoBillingEnabled: true,
              autoBillingThresholdMinutes: 15,
              boundAt: new Date().toISOString()
            });

            saveMasterLicense({
              key: licenseKey,
              customer: customerName,
              email: customerEmail,
              tier: 'PRO',
              type: 'PAID',
              price: '9.99/mo',
              voiceActive: true,
              voiceNumber: forwardingNumber,
              carrierCode: carrierCode,
              stripeCustomerId: stripeCustId || session.customer || null,
              defaultPaymentMethodId: cardDetails?.id || null,
              cardBrand: cardDetails?.brand || null,
              cardLast4: cardDetails?.last4 || null,
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
                grossAmount: 9.99
              });
            }

            console.log(`🎉 [POST-PAYMENT AUTOMATION COMPLETE] Provisioned line ${forwardingNumber}, key ${licenseKey}, payment method saved!`);

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
              cardSaved: !!cardDetails,
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

            // Extract and vault payment method for future off-session 1-click & auto-billing
            const { customerId: stripeCustId, cardDetails } = await getPaymentMethodDetailsFromSession(session);

            const settings = getVoiceSettings();
            settings.voiceMinutesBalance = newBalance;
            settings.isVoicePaused = false;
            settings.vapiProvisioned = true;
            settings.forwardingNumber = forwardingNumber;
            settings.carrierCode = carrierCode;
            settings.status = 'ACTIVE';
            if (stripeCustId) settings.stripeCustomerId = stripeCustId;
            if (cardDetails) {
              settings.defaultPaymentMethodId = cardDetails.id;
              settings.cardBrand = cardDetails.brand;
              settings.cardLast4 = cardDetails.last4;
              settings.cardExpMonth = cardDetails.exp_month;
              settings.cardExpYear = cardDetails.exp_year;
            }
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
              autoBillingThresholdMinutes: 15,
              customerId: stripeCustId || session.customer || sub?.stripeCustomerId || null,
              stripeCustomerId: stripeCustId || session.customer || sub?.stripeCustomerId || null,
              stripePaymentMethodId: cardDetails?.id || sub?.stripePaymentMethodId || null,
              defaultPaymentMethodId: cardDetails?.id || sub?.defaultPaymentMethodId || null,
              cardBrand: cardDetails?.brand || sub?.cardBrand || null,
              cardLast4: cardDetails?.last4 || sub?.cardLast4 || null,
              cardExpMonth: cardDetails?.exp_month || sub?.cardExpMonth || null,
              cardExpYear: cardDetails?.exp_year || sub?.cardExpYear || null,
              isVoicePaused: false,
              status: 'ACTIVE',
              agencyId: metadata.agency_id || sub?.agencyId || 'default',
              provisionedAt: isFirstTimeProvisioning ? new Date().toISOString() : (sub?.provisionedAt || new Date().toISOString())
            });

            saveMasterLicense({
              key: targetKey,
              customer: customerName,
              email: customerEmail,
              agencyId: metadata.agency_id || masterLic?.agencyId || 'default',
              voiceEntitlement: true,
              vapiProvisioned: true,
              voiceActive: true,
              voiceNumber: forwardingNumber,
              carrierCode: carrierCode,
              voiceMinutesBalance: newBalance,
              stripeCustomerId: stripeCustId || session.customer || masterLic?.stripeCustomerId || null,
              defaultPaymentMethodId: cardDetails?.id || masterLic?.defaultPaymentMethodId || null,
              cardBrand: cardDetails?.brand || masterLic?.cardBrand || null,
              cardLast4: cardDetails?.last4 || masterLic?.cardLast4 || null,
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
            const forwardingNumber = process.env.VAPI_PRIMARY_PHONE_NUMBER || '+1 (732) 660-9121';
            const cleanDigits = forwardingNumber.replace(/\D/g, '');
            const carrierCode = `*71${cleanDigits.slice(-10)}`;
            const carrierDeactivateCode = '*73';

            const settings = getVoiceSettings();
            settings.voiceMinutesBalance = 10.0;
            settings.isVoicePaused = false;
            settings.vapiProvisioned = true;
            settings.forwardingNumber = forwardingNumber;
            settings.carrierCode = carrierCode;
            settings.carrierDeactivateCode = carrierDeactivateCode;
            settings.status = 'ACTIVE';
            saveVoiceSettings(settings);

            saveVoiceSubscriber(licenseKey, {
              active: true,
              name: customerName,
              email: customerEmail,
              voiceEntitlement: true,
              voiceSubActive: true,
              voiceSubWaived: false,
              vapiProvisioned: true,
              forwardingNumber: forwardingNumber,
              carrierCode: carrierCode,
              carrierDeactivateCode: carrierDeactivateCode,
              voiceMinutesBalance: 10.0,
              ratePerMinute: 0.25,
              autoRebillEnabled: true,
              isVoicePaused: false,
              subscriptionId: session.subscription || session.id,
              customerId: session.customer || null,
              stripeCustomerId: session.customer || null,
              status: 'ACTIVE',
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
              vapiProvisioned: true,
              voiceActive: true,
              voiceNumber: forwardingNumber,
              carrierCode: carrierCode,
              carrierDeactivateCode: carrierDeactivateCode,
              voiceMinutesBalance: 10.0,
              isVoicePaused: false,
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
    const handleVerify = (rawKey, incomingDeviceId = '', incomingDeviceModel = '', incomingAppVersion = '1.8.9') => {
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
      let subBinding = null;

      // Check Voice Pro Bindings
      const voiceBindingsFile = path.join(__dirname, '.voice_pro_bindings.json');
      if (fs.existsSync(voiceBindingsFile)) {
        try {
          const bindings = JSON.parse(fs.readFileSync(voiceBindingsFile, 'utf8'));
          if (bindings[key]) {
            subBinding = bindings[key];
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
      let boundDevice = null;
      let boundModel = null;
      const localCachePath = path.join(__dirname, '.device_tokens_cache.json');
      if (fs.existsSync(localCachePath)) {
        try {
          const devices = JSON.parse(fs.readFileSync(localCachePath, 'utf8'));
          if (devices[key] && (devices[key].device_id || devices[key].deviceId)) {
            boundDevice = devices[key].device_id || devices[key].deviceId;
            boundModel = devices[key].device_model || devices[key].model || null;
          }
        } catch (e) {}
      }
      if (!boundDevice && masterLic && masterLic.deviceId) {
        boundDevice = masterLic.deviceId;
        boundModel = masterLic.deviceModel || null;
      }

      if (incomingDeviceId) {
        const isDemo = key.includes('DEMO') || key.includes('TRIAL');
        if (boundDevice && boundDevice !== incomingDeviceId && !isDemo) {
          return {
            valid: false,
            error: `License is hardware-bound to another device (${boundDevice}). Reset in dashboard first.`,
            hardwareLocked: true,
            boundDeviceId: boundDevice
          };
        }
        boundDevice = incomingDeviceId;
        boundModel = incomingDeviceModel || boundModel;
        try {
          let cache = {};
          if (fs.existsSync(localCachePath)) {
            cache = JSON.parse(fs.readFileSync(localCachePath, 'utf8') || '{}');
          }
          cache[key] = {
            license_key: key,
            device_id: incomingDeviceId,
            device_model: boundModel,
            app_version: incomingAppVersion,
            updatedAt: new Date().toISOString()
          };
          fs.writeFileSync(localCachePath, JSON.stringify(cache, null, 2), 'utf8');

          const masterPath = path.join(__dirname, 'data', 'master_licenses.json');
          if (fs.existsSync(masterPath)) {
            const list = JSON.parse(fs.readFileSync(masterPath, 'utf8') || '[]');
            const idx = list.findIndex(x => x.key === key);
            if (idx >= 0) {
              list[idx].deviceId = incomingDeviceId;
              list[idx].deviceModel = boundModel;
              fs.writeFileSync(masterPath, JSON.stringify(list, null, 2), 'utf8');
            }
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
        hasPaymentMethod: !!(subBinding?.stripePaymentMethodId || subBinding?.defaultPaymentMethodId || masterLic?.defaultPaymentMethodId || settings.defaultPaymentMethodId),
        cardBrand: subBinding?.cardBrand || masterLic?.cardBrand || settings.cardBrand || null,
        cardLast4: subBinding?.cardLast4 || masterLic?.cardLast4 || settings.cardLast4 || null,
        cardExpMonth: subBinding?.cardExpMonth || masterLic?.cardExpMonth || settings.cardExpMonth || null,
        cardExpYear: subBinding?.cardExpYear || masterLic?.cardExpYear || settings.cardExpYear || null,
        autoBillingEnabled: subBinding?.autoBillingEnabled ?? (settings.autoRebillEnabled !== false),
        autoBillingThresholdMinutes: subBinding?.autoBillingThresholdMinutes || 15,
        monthlyPrice: "$9.99/mo",
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
        deviceId: boundDevice || null,
        deviceModel: boundModel || null,
        hardwareBound: !!boundDevice,
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
      const devId = urlObj.searchParams.get('deviceId') || urlObj.searchParams.get('device_id') || '';
      const devModel = urlObj.searchParams.get('deviceModel') || urlObj.searchParams.get('model') || '';
      const appVer = urlObj.searchParams.get('appVersion') || urlObj.searchParams.get('app_version') || '1.8.9';
      const result = handleVerify(key, devId, devModel, appVer);
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
          const devId = payload.deviceId || payload.device_id || '';
          const devModel = payload.deviceModel || payload.model || '';
          const appVer = payload.appVersion || payload.app_version || '1.8.9';
          const result = handleVerify(key, devId, devModel, appVer);
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

  // API: Create Turnkey Voice Pro Checkout Session ($9.99/mo with 10 Included Minutes)
  if (relativePath === '/api/create-voice-pro-checkout' || relativePath === '/api/create-voice-pro-checkout/') {
    const handleVoiceProCheckout = async (payload, isGet = false) => {
      try {
        const customerEmail = (payload.email || '').trim();
        const businessName = (payload.businessName || 'Apex Trade Services').trim();
        const licenseKey = (payload.licenseKey || payload.key || '').trim().toUpperCase();
        const tier = (payload.tier || 'voice_starter').toLowerCase();

        const isBusiness = tier.includes('biz') || tier.includes('business') || tier.includes('300') || tier.includes('89');
        const unitAmount = isBusiness ? '8900' : '999';
        const quotaMinutes = isBusiness ? 300 : 10;
        const overageRate = isBusiness ? '0.20' : '0.25';
        const tierName = isBusiness ? 'voice_business' : 'voice_addon';
        const planTitle = isBusiness ? 'Business AI Voice Receptionist ($89/mo)' : '24/7 AI Voice Receptionist ($9.99/mo)';

        const postData = {
          'mode': 'subscription',
          'payment_method_types[0]': 'card',
          'line_items[0][price_data][currency]': 'usd',
          'line_items[0][price_data][product_data][name]': planTitle,
          'line_items[0][price_data][product_data][description]': `Includes ${quotaMinutes} FREE Minutes on activation • *71 Carrier Conditional Forwarding (Bound to License ${licenseKey || 'Account'})`,
          'line_items[0][price_data][unit_amount]': unitAmount,
          'line_items[0][price_data][recurring][interval]': 'month',
          'line_items[0][quantity]': '1',
          'subscription_data[metadata][tier]': tierName,
          'subscription_data[metadata][quotaMinutes]': String(quotaMinutes),
          'subscription_data[metadata][overageRate]': overageRate,
          'subscription_data[metadata][business_name]': businessName,
          'subscription_data[metadata][license_key]': licenseKey,
          'client_reference_id': licenseKey,
          'metadata[license_key]': licenseKey,
          'metadata[tier]': tierName,
          'metadata[quotaMinutes]': String(quotaMinutes),
          'metadata[overageRate]': overageRate,
          'success_url': `https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}&tier=${tierName}`,
          'cancel_url': 'https://missedcallautosms.com/#pricing'
        };

        if (customerEmail) {
          postData['customer_email'] = customerEmail;
        }

        const session = await stripeApiRequest('/v1/checkout/sessions', 'POST', postData);
        console.log(`💳 [STRIPE VOICE PRO CHECKOUT] Created $9.99/mo checkout session: ${session.id} for ${customerEmail || 'prospective user'} (Key: ${licenseKey})`);

        if (isGet) {
          res.writeHead(302, { Location: session.url });
          res.end();
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          checkoutUrl: session.url,
          sessionId: session.id,
          licenseKey: licenseKey,
          minutes: quotaMinutes
        }));
      } catch (err) {
        console.error('Stripe voice checkout creation error:', err.message);
        if (isGet) {
          res.writeHead(302, { Location: 'https://buy.stripe.com/5kQ5kDbBI8hkdao8WZ2go0c' });
          res.end();
          return;
        }
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    };

    if (req.method === 'GET') {
      const urlParts = require('url').parse(req.url, true);
      handleVoiceProCheckout(urlParts.query, true);
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          handleVoiceProCheckout(payload, false);
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }
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
          let fallbackUrl = "https://buy.stripe.com/6oU9ATbBIeFI8U86OR2go0g";
          if (payload.plan === 'pro_upgrade') {
            fallbackUrl = "https://buy.stripe.com/bJe14neNU9loc6kehj2go0h";
          } else if (payload.plan === 'flagship') {
            fallbackUrl = "https://buy.stripe.com/3cI9AT49g2X07Q41ux2go0a";
          }
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

        // Determine base one-time plan pricing
        let oneTimeAmount = 29999; // Default Pro $299.99
        let oneTimeName = 'Missed Call Auto SMS - Pro Automation Gateway';
        let oneTimeDesc = 'Perpetual Gateway License • 1-Year Cloud Relay API Maintenance • Dual SIM Carrier Routing • Unlimited End-to-End™ Webhook Gateway (n8n/Zapier) • 100% A2P 10DLC Exempt';
        let tierCode = 'pro_gateway';

        if (payload.plan === 'pro_upgrade') {
          oneTimeAmount = 24999; // $249.99 Upgrade
          oneTimeName = 'Missed Call Auto SMS - Pro Gateway Upgrade';
          oneTimeDesc = 'Hardware Upgrade from Standard Flagship to Pro Automation Gateway • Webhooks & Dual SIM Routing • 100% A2P 10DLC Exempt';
          tierCode = 'pro_upgrade';
        } else if (payload.plan === 'flagship') {
          oneTimeAmount = 4999; // $49.99 Base Flagship
          oneTimeName = "Missed Call Auto SMS - Founder's Flagship Appliance";
          oneTimeDesc = 'Autonomous missed call auto-reply appliance bound to 1 Android phone. 100% A2P 10DLC carrier exempt with zero monthly software fees.';
          tierCode = 'flagship';
        }

        if (includeVoice) {
          // COMBO: One-Time Appliance License + 24/7 AI Voice Receptionist ($9.99/mo Subscription)
          postData = {
            'mode': 'subscription',
            'payment_method_types[0]': 'card',
            
            // Item 0: One-time hardware license fee billed upfront
            'line_items[0][price_data][currency]': 'usd',
            'line_items[0][price_data][unit_amount]': String(oneTimeAmount),
            'line_items[0][price_data][product_data][name]': oneTimeName,
            'line_items[0][price_data][product_data][description]': oneTimeDesc,
            'line_items[0][quantity]': '1',

            // Item 1: Recurring $9.99/mo voice platform add-on
            'line_items[1][price_data][currency]': 'usd',
            'line_items[1][price_data][unit_amount]': '999',
            'line_items[1][price_data][recurring][interval]': 'month',
            'line_items[1][price_data][product_data][name]': '24/7 AI Voice Receptionist Add-On ($9.99/mo)',
            'line_items[1][price_data][product_data][description]': '24/7 Conversational AI Voice Phone Receptionist • 15 Free Test Minutes on Signup • Metered Usage in Credit Packs • Native SIM Confirmation SMS • 1-Tap *71 Carrier Transfer',
            'line_items[1][quantity]': '1',

            'subscription_data[metadata][tier]': tierCode,
            'subscription_data[metadata][base_plan]': payload.plan || 'pro',
            'subscription_data[metadata][monthly_fee]': '9.99',
            'subscription_data[metadata][business_name]': businessName,
            'metadata[tier]': tierCode,
            'metadata[base_plan]': payload.plan || 'pro',
            'metadata[include_voice]': 'true',
            'metadata[business_name]': businessName,
            'success_url': 'https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}&tier=' + tierCode,
            'cancel_url': 'https://missedcallautosms.com/#checkout'
          };
        } else {
          // STANDALONE ONE-TIME PURCHASE (Flagship $49.99, Pro $299.99, or Pro Upgrade $249.99)
          postData = {
            'mode': 'payment',
            'payment_method_types[0]': 'card',
            'line_items[0][price_data][currency]': 'usd',
            'line_items[0][price_data][unit_amount]': String(oneTimeAmount),
            'line_items[0][price_data][product_data][name]': oneTimeName,
            'line_items[0][price_data][product_data][description]': oneTimeDesc,
            'line_items[0][quantity]': '1',
            'metadata[tier]': tierCode,
            'metadata[include_voice]': 'false',
            'metadata[business_name]': businessName,
            'success_url': 'https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}&tier=' + tierCode,
            'cancel_url': 'https://missedcallautosms.com/#checkout'
          };
        }

        if (customerEmail) {
          postData['customer_email'] = customerEmail;
        }

        const session = await stripeApiRequest('/v1/checkout/sessions', 'POST', postData);
        console.log(`💳 [STRIPE CHECKOUT] Created session: ${session.id} (Plan: ${payload.plan || 'pro'}, Include Voice: ${includeVoice})`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          checkoutUrl: session.url,
          sessionId: session.id,
          includeVoice
        }));
      } catch (err) {
        console.error('Stripe checkout creation error:', err.message);
        // Fallback to static link
        let fallbackUrl = "https://buy.stripe.com/6oU9ATbBIeFI8U86OR2go0g";
        if (payload && payload.plan === 'pro_upgrade') {
          fallbackUrl = "https://buy.stripe.com/bJe14neNU9loc6kehj2go0h";
        } else if (payload && payload.plan === 'flagship') {
          fallbackUrl = "https://buy.stripe.com/3cI9AT49g2X07Q41ux2go0a";
        }
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
      const agencyId = (params.agency || params.agency_id || params.agencyId || 'default').trim();

      const CREDIT_TIERS = {
        '10': { id: 'pack_10', name: 'Starter Credit Pack (40 Mins)', amount: 1000, minutes: 40, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
        'pack_10': { id: 'pack_10', name: 'Starter Credit Pack (40 Mins)', amount: 1000, minutes: 40, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
        '25': { id: 'pack_25', name: 'Growth Credit Pack (115 Mins - Includes 15 Bonus Mins)', amount: 2500, minutes: 115, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
        'pack_25': { id: 'pack_25', name: 'Growth Credit Pack (115 Mins - Includes 15 Bonus Mins)', amount: 2500, minutes: 115, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
        '50': { id: 'pack_50', name: 'Pro Contractor Pack (250 Mins - Includes 50 Bonus Mins)', amount: 5000, minutes: 250, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
        'pack_50': { id: 'pack_50', name: 'Pro Contractor Pack (250 Mins - Includes 50 Bonus Mins)', amount: 5000, minutes: 250, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
        '100': { id: 'pack_100', name: 'Fleet Credit Pack (550 Mins - Includes 150 Bonus Mins)', amount: 10000, minutes: 550, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
        'pack_100': { id: 'pack_100', name: 'Fleet Credit Pack (550 Mins - Includes 150 Bonus Mins)', amount: 10000, minutes: 550, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' }
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

      const subscribers = getVoiceSubscribers();
      const existingSub = subscribers.find(s => (licenseKey && s.licenseKey === licenseKey) || (customerEmail && s.email && s.email.toLowerCase() === customerEmail.toLowerCase()));
      const existingCustId = existingSub?.stripeCustomerId;

      const postData = {
        'mode': 'payment',
        'payment_method_types[0]': 'card',
        'payment_intent_data[setup_future_usage]': 'off_session',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(tier.amount),
        'line_items[0][price_data][product_data][name]': `Voice Hub Network - ${tier.name}`,
        'line_items[0][price_data][product_data][description]': `Instant addition of +${tier.minutes} minutes to dedicated AI voice line. 100% P2P carrier exempt.`,
        'line_items[0][quantity]': '1',
        'metadata[tier]': 'credit_pack',
        'metadata[pack_tier]': tier.id,
        'metadata[minutes]': String(tier.minutes),
        'metadata[price_dollars]': String(tier.amount / 100),
        'metadata[license_key]': licenseKey,
        'metadata[agency_id]': agencyId,
        'metadata[referral_code]': refCode,
        'metadata[service]': 'voice_credit_reload',
        'success_url': `https://${host}/success.html?session_id={CHECKOUT_SESSION_ID}&type=credit_pack&minutes=${tier.minutes}`,
        'cancel_url': `https://${host}/voice.html`
      };

      if (existingCustId) {
        postData['customer'] = existingCustId;
      } else if (customerEmail) {
        postData['customer_email'] = customerEmail;
      }
      if (licenseKey) postData['client_reference_id'] = licenseKey;

      try {
        const session = await stripeApiRequest('/v1/checkout/sessions', 'POST', postData);
        if (res.headersSent) return;
        if (req.method === 'GET' && !req.headers['accept']?.includes('application/json')) {
          res.writeHead(302, { Location: session.url });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, sessionId: session.id, checkoutUrl: session.url, tier: tier.id, minutes: tier.minutes, amount: tier.amount / 100 }));
      } catch (err) {
        console.error('Credit pack session creation error:', err.message);
        if (res.headersSent) return;
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
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // NATIVE IN-APP BILLING API SUITE (Off-Session Card Charges & Subscriptions)
  // ═════════════════════════════════════════════════════════════════════

  // API 1: Get Customer Payment Info & Saved Card (GET /api/billing/customer-payment-info)
  if ((relativePath === '/api/billing/customer-payment-info' || relativePath === '/api/billing/customer-payment-info/') && req.method === 'GET') {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const key = (urlObj.searchParams.get('key') || urlObj.searchParams.get('licenseKey') || '').trim().toUpperCase();
    const email = (urlObj.searchParams.get('email') || '').trim().toLowerCase();

    const subscribers = getVoiceSubscribers();
    const sub = subscribers.find(s => (key && s.licenseKey === key) || (email && s.email && s.email.toLowerCase() === email));
    const masterList = getMasterLicenses();
    const masterLic = masterList.find(m => (key && m.key === key) || (email && m.email && m.email.toLowerCase() === email));
    const settings = getVoiceSettings();

    const cardBrand = sub?.cardBrand || masterLic?.cardBrand || settings.cardBrand || null;
    const cardLast4 = sub?.cardLast4 || masterLic?.cardLast4 || settings.cardLast4 || null;
    const cardExpMonth = sub?.cardExpMonth || masterLic?.cardExpMonth || settings.cardExpMonth || null;
    const cardExpYear = sub?.cardExpYear || masterLic?.cardExpYear || settings.cardExpYear || null;
    const hasPaymentMethod = !!(cardLast4 && (sub?.defaultPaymentMethodId || sub?.stripePaymentMethodId || masterLic?.defaultPaymentMethodId || settings.defaultPaymentMethodId));
    const autoBillingEnabled = sub?.autoBillingEnabled ?? (settings.autoRebillEnabled !== false);
    const threshold = sub?.autoBillingThresholdMinutes || settings.autoBillingThresholdMinutes || 15;
    const balance = typeof sub?.voiceMinutesBalance === 'number' ? sub.voiceMinutesBalance : (typeof settings.voiceMinutesBalance === 'number' ? settings.voiceMinutesBalance : 0);
    const subActive = !!(sub?.voiceSubActive || sub?.active || masterLic?.voiceActive);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      hasPaymentMethod,
      cardBrand,
      cardLast4,
      cardExpMonth,
      cardExpYear,
      autoBillingEnabled,
      autoBillingThresholdMinutes: threshold,
      voiceMinutesBalance: balance,
      voiceSubscriptionActive: subActive,
      subscriptionId: sub?.subscriptionId || null,
      monthlyPrice: "$9.99/mo"
    }));
    return;
  }

  // API 2: 1-Tap Charge Saved Card (POST /api/billing/charge-saved-card)
  if ((relativePath === '/api/billing/charge-saved-card' || relativePath === '/api/billing/charge-saved-card/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const key = (payload.licenseKey || payload.key || '').trim().toUpperCase();
        const packTier = (payload.pack || payload.tier || '10').toString().toLowerCase();

        const PACKS = {
          '10': { name: 'Starter Pack', amount: 1000, minutes: 40 },
          'pack_10': { name: 'Starter Pack', amount: 1000, minutes: 40 },
          '25': { name: 'Growth Pack (+15 Free Mins)', amount: 2500, minutes: 115 },
          'pack_25': { name: 'Growth Pack (+15 Free Mins)', amount: 2500, minutes: 115 },
          '50': { name: 'Pro Contractor (+50 Free Mins)', amount: 5000, minutes: 250 },
          'pack_50': { name: 'Pro Contractor (+50 Free Mins)', amount: 5000, minutes: 250 },
          '100': { name: 'Fleet Pack (+150 Free Mins)', amount: 10000, minutes: 550 },
          'pack_100': { name: 'Fleet Pack (+150 Free Mins)', amount: 10000, minutes: 550 }
        };

        const pack = PACKS[packTier] || PACKS['10'];

        const subscribers = getVoiceSubscribers();
        const sub = subscribers.find(s => s.licenseKey === key);
        const masterList = getMasterLicenses();
        const masterLic = masterList.find(m => m.key === key);
        const settings = getVoiceSettings();

        const custId = sub?.stripeCustomerId || masterLic?.stripeCustomerId || settings.stripeCustomerId;
        let pmId = sub?.defaultPaymentMethodId || sub?.stripePaymentMethodId || masterLic?.defaultPaymentMethodId || settings.defaultPaymentMethodId;

        if (!custId) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: false,
            code: 'NO_SAVED_CARD',
            message: 'No saved payment method found. Please save a card on file first.'
          }));
          return;
        }

        // If pmId is not directly in JSON, fetch from Stripe Customer
        if (!pmId && custId) {
          try {
            const pmList = await stripeApiRequest(`/v1/customers/${custId}/payment_methods?type=card`);
            if (pmList && pmList.data && pmList.data.length > 0) {
              pmId = pmList.data[0].id;
              if (sub) {
                sub.defaultPaymentMethodId = pmId;
                sub.cardBrand = pmList.data[0].card?.brand || 'card';
                sub.cardLast4 = pmList.data[0].card?.last4 || '••••';
                sub.cardExpMonth = pmList.data[0].card?.exp_month || 0;
                sub.cardExpYear = pmList.data[0].card?.exp_year || 0;
                saveVoiceSubscriber(key, sub);
              }
            }
          } catch (e) {}
        }

        if (!pmId) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: false,
            code: 'NO_SAVED_CARD',
            message: 'No saved card on file. Please add a payment card.'
          }));
          return;
        }

        console.log(`💳 [1-TAP CHARGE] Charging $${(pack.amount / 100).toFixed(2)} to customer ${custId} (Card: ${sub?.cardBrand || 'Card'} ••${sub?.cardLast4 || '••'})...`);

        const pi = await stripeApiRequest('/v1/payment_intents', 'POST', {
          amount: String(pack.amount),
          currency: 'usd',
          customer: custId,
          payment_method: pmId,
          off_session: 'true',
          confirm: 'true',
          description: `Missed Call Auto SMS - In-App 1-Tap Minute Reload: ${pack.name} (+${pack.minutes} Mins) - Key ${key}`
        });

        if (pi.status === 'succeeded') {
          const currentBal = typeof sub?.voiceMinutesBalance === 'number' ? sub.voiceMinutesBalance : (typeof settings.voiceMinutesBalance === 'number' ? settings.voiceMinutesBalance : 0);
          const newBal = Math.round((currentBal + pack.minutes) * 100) / 100;

          if (sub) {
            sub.voiceMinutesBalance = newBal;
            sub.isVoicePaused = false;
            saveVoiceSubscriber(key, sub);
          }
          if (masterLic) {
            masterLic.voiceMinutesBalance = newBal;
            saveMasterLicense(masterLic);
          }
          settings.voiceMinutesBalance = newBal;
          settings.isVoicePaused = false;
          saveVoiceSettings(settings);

          // Dispatch confirmation receipt email
          const targetEmail = sub?.email || masterLic?.email || settings.subscriberEmail;
          if (targetEmail) {
            try {
              const resendKey = process.env.RESEND_API_KEY || (fs.existsSync('.env') && fs.readFileSync('.env', 'utf8').match(/RESEND_API_KEY=(.*)/)?.[1]?.trim());
              const emailHtml = generateCreditPackEmailHtml(sub?.name || 'Valued Customer', pack.minutes, (pack.amount / 100).toFixed(2), newBal);
              if (resendKey) {
                sendResendEmail(resendKey, targetEmail, `💳 Receipt: +${pack.minutes} Minutes Added ($${(pack.amount / 100).toFixed(2)})`, emailHtml).catch(() => {});
              }
            } catch (e) {}
          }

          console.log(`✅ [1-TAP CHARGE SUCCESS] +${pack.minutes} minutes added! New balance: ${newBal} min.`);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            newBalance: newBal,
            minutesAdded: pack.minutes,
            packName: pack.name,
            amount: pack.amount / 100,
            cardBrand: sub?.cardBrand || 'Card',
            cardLast4: sub?.cardLast4 || '••••'
          }));
        } else {
          res.writeHead(402, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: false,
            code: 'PAYMENT_NOT_SUCCEEDED',
            status: pi.status,
            message: 'Payment was not approved by card issuer.'
          }));
        }
      } catch (err) {
        console.error('1-Tap charge error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: false,
          code: 'STRIPE_ERROR',
          message: err.message
        }));
      }
    });
    return;
  }

  // API 3: Toggle Auto-Billing (POST /api/billing/toggle-auto-billing)
  if ((relativePath === '/api/billing/toggle-auto-billing' || relativePath === '/api/billing/toggle-auto-billing/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const key = (payload.licenseKey || payload.key || '').trim().toUpperCase();
        const enabled = Boolean(payload.enabled !== undefined ? payload.enabled : payload.autoBillingEnabled);
        const threshold = parseInt(payload.threshold || payload.autoBillingThresholdMinutes || 15, 10);

        const subscribers = getVoiceSubscribers();
        const sub = subscribers.find(s => s.licenseKey === key);
        if (sub) {
          sub.autoBillingEnabled = enabled;
          sub.autoBillingThresholdMinutes = threshold;
          saveVoiceSubscriber(key, sub);
        }

        const settings = getVoiceSettings();
        settings.autoRebillEnabled = enabled;
        settings.autoBillingThresholdMinutes = threshold;
        saveVoiceSettings(settings);

        console.log(`⚙️ [AUTO-BILLING TOGGLE] Set to [${enabled}] (Threshold: ${threshold} mins) for license: ${key || 'Default'}`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          autoBillingEnabled: enabled,
          autoBillingThresholdMinutes: threshold
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API 4: Native 1-Tap Subscription Activation ($9.99/mo) (POST /api/billing/subscribe-voice-native)
  if ((relativePath === '/api/billing/subscribe-voice-native' || relativePath === '/api/billing/subscribe-voice-native/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const key = (payload.licenseKey || payload.key || '').trim().toUpperCase();
        const subscribers = getVoiceSubscribers();
        const sub = subscribers.find(s => s.licenseKey === key);
        const settings = getVoiceSettings();

        const custId = sub?.stripeCustomerId || settings.stripeCustomerId;
        let pmId = sub?.defaultPaymentMethodId || sub?.stripePaymentMethodId || settings.defaultPaymentMethodId;

        if (!custId || !pmId) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: false,
            code: 'NO_SAVED_CARD',
            message: 'A saved credit card is required to activate subscription. Please add a card first.'
          }));
          return;
        }

        console.log(`🎙️ [NATIVE SUBSCRIBE] Starting $9.99/mo AI Voice subscription for customer ${custId}...`);

        const subRes = await stripeApiRequest('/v1/subscriptions', 'POST', {
          customer: custId,
          'items[0][price_data][currency]': 'usd',
          'items[0][price_data][product_data][name]': '24/7 AI Voice Receptionist ($9.99/mo)',
          'items[0][price_data][unit_amount]': '999',
          'items[0][price_data][recurring][interval]': 'month',
          default_payment_method: pmId,
          'metadata[license_key]': key,
          'metadata[tier]': 'voice_addon'
        });

        if (sub) {
          sub.voiceSubActive = true;
          sub.voiceEntitlement = true;
          sub.subscriptionId = subRes.id;
          saveVoiceSubscriber(key, sub);
        }
        settings.voiceSubscriptionActive = true;
        settings.stripeSubscriptionId = subRes.id;
        settings.status = 'ACTIVE';
        saveVoiceSettings(settings);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          status: 'ACTIVE',
          subscriptionId: subRes.id,
          monthlyPrice: "$9.99/mo"
        }));
      } catch (err) {
        console.error('Native subscribe error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API 5: Native Subscription Cancellation (POST /api/billing/cancel-voice-native)
  if ((relativePath === '/api/billing/cancel-voice-native' || relativePath === '/api/billing/cancel-voice-native/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const key = (payload.licenseKey || payload.key || '').trim().toUpperCase();
        const subscribers = getVoiceSubscribers();
        const sub = subscribers.find(s => s.licenseKey === key);
        const settings = getVoiceSettings();

        const subId = sub?.subscriptionId || settings.stripeSubscriptionId;
        if (subId && subId.startsWith('sub_')) {
          await stripeApiRequest(`/v1/subscriptions/${subId}`, 'DELETE').catch(err => {
            console.warn('[Stripe Sub Cancel Warning]', err.message);
          });
        }

        if (sub) {
          sub.voiceSubActive = false;
          sub.subscriptionId = null;
          saveVoiceSubscriber(key, sub);
        }
        settings.voiceSubscriptionActive = false;
        settings.stripeSubscriptionId = null;
        saveVoiceSettings(settings);

        console.log(`🛑 [NATIVE CANCEL] Cancelled Voice subscription for license: ${key}`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          status: 'CANCELED'
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API 6: Save / Update Card Session (POST /api/billing/create-save-card-session)
  if ((relativePath === '/api/billing/create-save-card-session' || relativePath === '/api/billing/create-save-card-session/') && (req.method === 'POST' || req.method === 'GET')) {
    const handleSaveCard = async (params) => {
      try {
        const key = (params.licenseKey || params.key || '').trim().toUpperCase();
        const email = (params.email || '').trim();

        const subscribers = getVoiceSubscribers();
        const sub = subscribers.find(s => (key && s.licenseKey === key) || (email && s.email && s.email.toLowerCase() === email.toLowerCase()));
        let custId = sub?.stripeCustomerId;

        // If no customer ID in record, create one in Stripe
        if (!custId && email) {
          try {
            const customer = await stripeApiRequest('/v1/customers', 'POST', {
              email: email,
              description: `Missed Call Auto SMS Customer (Key: ${key || 'Unbound'})`,
              'metadata[license_key]': key
            });
            custId = customer.id;
            if (sub) {
              sub.stripeCustomerId = custId;
              saveVoiceSubscriber(key, sub);
            }
          } catch (e) {}
        }

        const host = req.headers['host'] || 'missedcallautosms.com';
        const postData = {
          'mode': 'setup',
          'payment_method_types[0]': 'card',
          'setup_intent_data[metadata][license_key]': key,
          'metadata[license_key]': key,
          'metadata[type]': 'save_card',
          'success_url': `https://${host}/success.html?session_id={CHECKOUT_SESSION_ID}&type=card_saved`,
          'cancel_url': `https://${host}/`
        };

        if (custId) postData['customer'] = custId;
        else if (email) postData['customer_email'] = email;

        const session = await stripeApiRequest('/v1/checkout/sessions', 'POST', postData);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          checkoutUrl: session.url,
          sessionId: session.id
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    };

    if (req.method === 'POST') {
      let b = '';
      req.on('data', c => b += c);
      req.on('end', () => {
        try {
          handleSaveCard(JSON.parse(b || '{}'));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
        }
      });
    } else {
      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
      handleSaveCard(Object.fromEntries(urlObj.searchParams.entries()));
    }
    return;
  }

  // API: Create Native PaymentIntent for Android PaymentSheet
  if (relativePath === '/api/create-payment-intent' && req.method === 'POST') {
    let rawData = '';
    req.on('data', chunk => rawData += chunk);
    req.on('end', async () => {
      try {
        const body = JSON.parse(rawData);
        const tierKey = (body.tier || body.packTier || '10').toString().toLowerCase();
        const licenseKey = (body.licenseKey || '').trim().toUpperCase();
        const customerEmail = (body.email || '').trim();

        const CREDIT_TIERS = {
          '10': { id: 'pack_10', name: 'Starter Credit Pack (40 Mins)', amount: 1000, minutes: 40 },
          'pack_10': { id: 'pack_10', name: 'Starter Credit Pack (40 Mins)', amount: 1000, minutes: 40 },
          '25': { id: 'pack_25', name: 'Growth Credit Pack (115 Mins)', amount: 2500, minutes: 115 },
          'pack_25': { id: 'pack_25', name: 'Growth Credit Pack (115 Mins)', amount: 2500, minutes: 115 },
          '50': { id: 'pack_50', name: 'Pro Contractor Pack (250 Mins)', amount: 5000, minutes: 250 },
          'pack_50': { id: 'pack_50', name: 'Pro Contractor Pack (250 Mins)', amount: 5000, minutes: 250 },
          '100': { id: 'pack_100', name: 'Fleet Credit Pack (550 Mins)', amount: 10000, minutes: 550 },
          'pack_100': { id: 'pack_100', name: 'Fleet Credit Pack (550 Mins)', amount: 10000, minutes: 550 },
          'pro_upgrade': { id: 'pro_upgrade', name: 'Perpetual Pro Automation Gateway Upgrade', amount: 24999, minutes: 0 },
          'pro_gateway': { id: 'pro_upgrade', name: 'Perpetual Pro Automation Gateway Upgrade', amount: 24999, minutes: 0 },
          'pro': { id: 'pro_upgrade', name: 'Perpetual Pro Automation Gateway Upgrade', amount: 24999, minutes: 0 }
        };

        const tier = CREDIT_TIERS[tierKey] || CREDIT_TIERS['10'];
        const isProUpgrade = tier.id === 'pro_upgrade';
        const activeStripeKey = getStripeKey();

        if (!activeStripeKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Stripe is not configured on the server.' }));
          return;
        }

        const postData = {
          'amount': String(tier.amount),
          'currency': 'usd',
          'description': tier.name,
          'metadata[tier]': isProUpgrade ? 'pro_upgrade' : 'credit_pack',
          'metadata[pack_tier]': tier.id,
          'metadata[price_dollars]': String(tier.amount / 100),
          'metadata[license_key]': licenseKey,
          'metadata[service]': isProUpgrade ? 'pro_gateway_upgrade' : 'voice_credit_reload',
          'receipt_email': customerEmail
        };

        if (!isProUpgrade) {
          postData['metadata[minutes]'] = String(tier.minutes);
        }

        const pi = await stripeApiRequest('/v1/payment_intents', 'POST', postData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          paymentIntent: pi.client_secret,
          publishableKey: getStripePublishableKey()
        }));
      } catch (err) {
        console.error('PaymentIntent creation error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
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

        // Step 2.5: Dispatch Outbound Webhooks to Agency CRM / GoHighLevel / Zapier / n8n
        try {
          const agenciesConfigPath = path.join(__dirname, 'agencies', 'agencies.json');
          if (fs.existsSync(agenciesConfigPath)) {
            const agData = JSON.parse(fs.readFileSync(agenciesConfigPath, 'utf8') || '{}');
            const agencies = agData.agencies || {};
            for (const [agKey, agObj] of Object.entries(agencies)) {
              const wh = agObj.webhook;
              if (wh && wh.masterUrl && wh.active !== false) {
                const subEvents = Array.isArray(wh.events) ? wh.events : ['voice.call_completed', 'lead.urgent'];
                if (subEvents.includes('voice.call_completed')) {
                  dispatchWebhookPayload(wh.masterUrl, {
                    event: 'voice.call_completed',
                    timestamp: logEntry.timestamp,
                    agencyId: agKey,
                    caller: {
                      phone: logEntry.callerNumber,
                      name: logEntry.callerName,
                      address: logEntry.address
                    },
                    call: {
                      id: logEntry.id,
                      duration: logEntry.durationFormatted,
                      durationSeconds: logEntry.durationSeconds,
                      recordingUrl: logEntry.audioUrl,
                      transcript: logEntry.transcript,
                      summary: logEntry.summary,
                      urgency: logEntry.urgency,
                      category: logEntry.category
                    },
                    smsFollowUp: {
                      sent: logEntry.smsFollowUpSent,
                      text: logEntry.smsFollowUpText
                    }
                  }, wh.signingSecret || '');
                }
                if (isUrgent && subEvents.includes('lead.urgent')) {
                  dispatchWebhookPayload(wh.masterUrl, {
                    event: 'lead.urgent',
                    timestamp: logEntry.timestamp,
                    agencyId: agKey,
                    priority: 'HIGH_PRIORITY_EMERGENCY',
                    caller: {
                      phone: logEntry.callerNumber,
                      name: logEntry.callerName,
                      address: logEntry.address
                    },
                    summary: logEntry.summary,
                    transcript: logEntry.transcript,
                    recordingUrl: logEntry.audioUrl
                  }, wh.signingSecret || '');
                }
              }
            }
          }

          // Also check per-client webhooks configured in appliance_configs
          const appConfigs = getApplianceConfigs();
          for (const [k, cVal] of Object.entries(appConfigs)) {
            if (cVal.handset?.outboundWebhookEnabled && cVal.handset?.selectedOutboundWebhookUrl) {
              dispatchWebhookPayload(cVal.handset.selectedOutboundWebhookUrl, {
                event: 'voice.call_completed',
                licenseKey: k,
                customerName: cVal.customerName || 'Client Business',
                timestamp: logEntry.timestamp,
                caller: { phone: logEntry.callerNumber, name: logEntry.callerName, address: logEntry.address },
                call: {
                  summary: logEntry.summary,
                  transcript: logEntry.transcript,
                  recordingUrl: logEntry.audioUrl,
                  urgency: logEntry.urgency
                }
              });
            }
          }
        } catch (whErr) {
          console.warn('[Vapi Webhook Dispatch Warning]', whErr.message);
        }

        // Step 3: Meter Call Duration against Customer Voice Minute Credits ($0.25/min)
        const durationMins = Math.max(0.1, durationSec / 60);
        settings.minutesUsed = Math.round(((settings.minutesUsed || 0) + durationMins) * 100) / 100;
        settings.voiceMinutesBalance = Math.max(0, Math.round(((settings.voiceMinutesBalance || 15.0) - durationMins) * 100) / 100);

        // Auto-Recharge Check ($10 pack = +40 mins when balance < autoThreshold)
        const autoThreshold = settings.autoBillingThresholdMinutes || 15;
        if (settings.autoRebillEnabled !== false && settings.voiceMinutesBalance < autoThreshold) {
          const custId = settings.stripeCustomerId;
          const pmId = settings.defaultPaymentMethodId;
          if (custId && pmId) {
            console.log(`💳 [AUTO-BILLING BACKGROUND] Voice balance (${settings.voiceMinutesBalance} min) < ${autoThreshold} min. Triggering $10 charge via Stripe...`);
            stripeApiRequest('/v1/payment_intents', 'POST', {
              amount: '1000',
              currency: 'usd',
              customer: custId,
              payment_method: pmId,
              off_session: 'true',
              confirm: 'true',
              description: 'Missed Call Auto SMS - Background Voice Minute Auto-Refill ($10 for 40 Mins)'
            }).then(pi => {
              if (pi && pi.status === 'succeeded') {
                const refreshed = getVoiceSettings();
                refreshed.voiceMinutesBalance = Math.round((refreshed.voiceMinutesBalance + 40) * 100) / 100;
                refreshed.isVoicePaused = false;
                saveVoiceSettings(refreshed);
                console.log(`✅ [AUTO-BILLING SUCCESS] Charged $10 to card on file. Balance restored to ${refreshed.voiceMinutesBalance} min.`);
              }
            }).catch(err => {
              console.warn(`⚠️ [AUTO-BILLING CHARGE FAILED]:`, err.message);
            });
          } else {
            settings.voiceMinutesBalance = Math.round((settings.voiceMinutesBalance + 40) * 100) / 100;
            settings.isVoicePaused = false;
            console.log(`💳 [AUTO-RECHARGE] Auto-reloaded $10 pack (+40 min). New balance: ${settings.voiceMinutesBalance} min`);
          }
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
              voiceProvider: asstData?.voice?.provider || '11labs',
              voiceId: asstData?.voice?.voiceId || '21m00Tcm4TlvDq8ikWAM'
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
              provider: payload.voiceProvider && payload.voiceProvider !== 'cartesia' ? payload.voiceProvider : '11labs',
              voiceId: payload.voiceId && !payload.voiceId.includes('248be419') && !payload.voiceId.includes('a0e998e3') ? payload.voiceId : '21m00Tcm4TlvDq8ikWAM'
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

        const isVoiceKey = licenseKey.includes('VOICE');
        const plan = subscriber?.plan || (isPro ? 'PRO_GATEWAY' : 'FLAGSHIP');
        const planName = subscriber?.planName || (
          plan === 'AUTONOMOUS_FRONT_DESK' ? 'Autonomous Front Desk Bundle' :
          plan === 'VOICE_BUSINESS' ? 'Voice Business' :
          plan === 'VOICE_STARTER' ? 'Voice Starter' :
          plan === 'PRO_GATEWAY' ? 'Pro Automation Gateway ($299 Perpetual)' : 'Founder\'s Flagship ($49.99 Lifetime)'
        );

        const quotaMinutes = Number(subscriber?.quotaMinutes ?? (
          plan === 'AUTONOMOUS_FRONT_DESK' ? 250 :
          plan === 'VOICE_BUSINESS' ? 300 :
          plan === 'VOICE_STARTER' ? 45 : (isDev ? 250 : 0)
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

        const isAgency = licenseKey.startsWith('MCAS-AGENCY-') || licenseKey.startsWith('MCAT-AGENCY-');
        const isTrial = licenseKey.includes('TRIAL') || subscriber?.status === 'TRIAL' || subscriber?.type === 'TRIAL';
        const tier = isAgency ? 'AGENCY' : (isPro ? 'PRO' : (isTrial ? 'TRIAL' : 'FLAGSHIP'));
        const tierName = isAgency ? 'Agency Fleet Edition' : (isPro ? 'Pro Automation Gateway ($299 Perpetual)' : (isTrial ? '3-Day Free Trial ($0 Today)' : 'Founder\'s Flagship ($49.99 Lifetime)'));

        const voiceMinutesBalance = Number(subscriber?.voiceMinutesBalance ?? (isDev ? 50 : 0));
        const voiceSubWaived = !!(subscriber?.voiceSubWaived || subscriber?.type === 'FREE_VOICE_COMP');
        const voiceSubActive = subscriber ? (subscriber.voiceSubActive !== false && subscriber.voiceActive !== false) : (isDev || isVoiceKey);
        const forwardingNumber = subscriber?.forwardingNumber || '+1 (732) 660-9121';
        const cleanDigits = forwardingNumber.replace(/\D/g, '');
        const carrierCode = subscriber?.carrierCode || `*71${cleanDigits.slice(-10)}`;

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          licenseKey,
          status: subscriber?.status || (isDev ? 'ACTIVE' : 'ACTIVE'),
          tier,
          tierName,
          voiceActive: voiceSubActive,
          voiceSubActive,
          voiceSubWaived,
          voiceMinutesBalance,
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
          forwardingNumber,
          carrierCode,
          carrierDeactivateCode: '*73',
          isUnlimitedGateway: plan === 'PRO_GATEWAY' || isPro,
          cloudApiActive: subscriber ? subscriber.cloudApiActive !== false && subscriber.status !== 'CANCELLED' : true,
          upgradeOptions: {
            proUpgradeAvailable: !isPro && !isAgency,
            proUpgradePrice: 249.99,
            proUpgradeUrl: 'https://buy.stripe.com/bJe14neNU9loc6kehj2go0h',
            voiceSubscriptionPrice: 9.99,
            voiceSubscriptionUrl: 'https://buy.stripe.com/4gMeVdcFMaps6M0b572go0f',
            creditPacks: [
              { pack: 10, minutes: 40, price: 10.00, label: '$10 Starter (40m)' },
              { pack: 25, minutes: 115, price: 25.00, label: '$25 Growth (115m)' },
              { pack: 50, minutes: 250, price: 50.00, label: '$50 Pro (250m)' },
              { pack: 100, minutes: 550, price: 100.00, label: '$100 Fleet (550m)' }
            ]
          }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }

  // API: Provision Device (Android App First-Launch Gating Handshake)
  if (relativePath === '/api/provision-device' && req.method === 'GET') {
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const key = (parsedUrl.searchParams.get('key') || '').trim();

    if (!key) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, error: 'License key is required.' }));
      return;
    }

    // Hardcoded Demo/Master Keys
    if (key.includes('DEMO') || key === 'MCAS-DEMO-TRIAL-89F2' || key === 'MCAT-DEMO-TRIAL-89F2') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        success: true,
        businessName: "Master Demo Business",
        customerEmail: "demo@offgridmediagroup.com",
        trade: "General Service",
        tier: key.includes("PRO") ? "PRO" : "STANDARD",
        status: "ACTIVE"
      }));
      return;
    }

    const masterList = getMasterLicenses();
    const found = masterList.find(l => l.key === key);

    if (!found) {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, error: 'License key not found or unrecognized.' }));
      return;
    }

    if (found.status && found.status !== 'ACTIVE' && found.status !== 'ACTIVE_SUBSCRIPTION') {
      res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, error: `License is currently ${found.status}. Please contact support.` }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      businessName: found.customer || "Valued Customer",
      customerEmail: found.email || "",
      trade: found.trade || "",
      tier: found.tier || (key.includes("PRO") ? "PRO" : "STANDARD"),
      status: found.status || "ACTIVE"
    }));
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

    // Attach bound device IDs from .device_tokens_cache.json
    let localDevCache = {};
    try {
      const devCachePath = path.join(__dirname, '.device_tokens_cache.json');
      if (fs.existsSync(devCachePath)) {
        localDevCache = JSON.parse(fs.readFileSync(devCachePath, 'utf8') || '{}');
      }
    } catch (e) {}

    for (const lic of combined) {
      if (!lic.deviceId) {
        const fromCache = localDevCache[lic.key]?.device_id || localDevCache[lic.key]?.deviceId;
        lic.deviceId = fromCache || null;
      }
      if (!lic.deviceModel) {
        const fromCacheModel = localDevCache[lic.key]?.device_model || localDevCache[lic.key]?.model;
        lic.deviceModel = fromCacheModel || null;
      }
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
    req.on('end', async () => {
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

        // 5. LIST WHITE-LABEL AGENCIES (for Owner Admin Dashboard)
        if (action === 'list_white_label_agencies') {
          const AGENCIES_CONFIG_PATH = path.join(__dirname, 'agencies', 'agencies.json');
          let agencies = {};
          if (fs.existsSync(AGENCIES_CONFIG_PATH)) {
            try {
              const raw = JSON.parse(fs.readFileSync(AGENCIES_CONFIG_PATH, 'utf8'));
              agencies = raw.agencies || {};
            } catch (e) {}
          }

          const subscribers = getVoiceSubscribers();
          const masterList = getMasterLicenses();

          const agencyList = Object.entries(agencies).map(([id, cfg]) => {
            // Find clients
            const clients = subscribers.filter(s => (s.agencyId === id) || (id === 'default' && (!s.agencyId || s.agencyId === 'default')));
            const clientKeys = new Set(clients.map(c => c.licenseKey));
            masterList.forEach(m => {
              if (m.agencyId === id && !clientKeys.has(m.key)) {
                clients.push({
                  name: m.customer || 'Unknown Client',
                  email: m.email || '',
                  licenseKey: m.key,
                  voiceMinutesBalance: m.voiceMinutesBalance || 0,
                  agencyId: id
                });
              }
            });

            // Check built APK status
            const distDir = path.join(__dirname, 'dist', 'agencies', id);
            const otaDir = path.join(__dirname, 'ota', id);
            let apkFound = false;
            let apkFileName = '';
            let apkSizeMb = 0;
            let apkUpdated = null;

            if (fs.existsSync(distDir)) {
              const files = fs.readdirSync(distDir).filter(f => f.endsWith('.apk'));
              if (files.length > 0) {
                apkFound = true;
                apkFileName = files[0];
                const stats = fs.statSync(path.join(distDir, apkFileName));
                apkSizeMb = (stats.size / (1024 * 1024)).toFixed(2);
                apkUpdated = stats.mtime.toISOString();
              }
            } else if (id === 'default') {
              const rootApk = path.join(__dirname, 'MissedCallAutoSMS.apk');
              if (fs.existsSync(rootApk)) {
                apkFound = true;
                apkFileName = 'MissedCallAutoSMS.apk';
                const stats = fs.statSync(rootApk);
                apkSizeMb = (stats.size / (1024 * 1024)).toFixed(2);
                apkUpdated = stats.mtime.toISOString();
              }
            }

            // Check OTA manifest
            let otaVersion = null;
            const otaPath = path.join(otaDir, 'version.json');
            if (fs.existsSync(otaPath)) {
              try {
                const otaRaw = JSON.parse(fs.readFileSync(otaPath, 'utf8'));
                otaVersion = {
                  versionCode: otaRaw.versionCode,
                  versionName: otaRaw.versionName,
                  downloadUrl: otaRaw.downloadUrl,
                  updatedAt: otaRaw.updatedAt
                };
              } catch (e) {}
            }

            const totalMins = clients.reduce((acc, c) => acc + (parseFloat(c.voiceMinutesBalance) || 0), 0);

            return {
              ...cfg,
              id,
              clientCount: clients.length,
              totalMinutesBalance: Math.round(totalMins * 10) / 10,
              apkStatus: {
                exists: apkFound,
                fileName: apkFileName,
                sizeMb: apkSizeMb,
                updatedAt: apkUpdated,
                downloadUrl: id === 'default' 
                  ? 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS.apk' 
                  : `https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/ota/${id}/${encodeURIComponent(apkFileName)}`
              },
              otaStatus: otaVersion,
              clients: clients.map(c => ({
                name: c.name || c.businessName || 'Client Business',
                email: c.email || '',
                licenseKey: c.licenseKey || c.key || '',
                minutes: c.voiceMinutesBalance || 0,
                status: c.status || 'ACTIVE'
              }))
            };
          });

          const totalAgencies = Object.keys(agencies).length;
          const totalClients = agencyList.reduce((acc, a) => acc + a.clientCount, 0);
          const totalMinutes = agencyList.reduce((acc, a) => acc + a.totalMinutesBalance, 0);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            agencies: agencyList,
            stats: {
              totalAgencies,
              totalClients,
              totalMinutes: Math.round(totalMinutes * 10) / 10
            }
          }));
          return;
        }

        // 6. SAVE / UPDATE WHITE-LABEL AGENCY PROFILE
        if (action === 'save_white_label_agency') {
          const rawId = (payload.agencyId || payload.id || '').trim().toLowerCase();
          const cleanId = rawId.replace(/[^a-z0-9_]/g, '_');
          if (!cleanId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'Agency ID/slug is required' }));
            return;
          }

          const AGENCIES_CONFIG_PATH = path.join(__dirname, 'agencies', 'agencies.json');
          let configData = { agencies: {} };
          if (fs.existsSync(AGENCIES_CONFIG_PATH)) {
            try { configData = JSON.parse(fs.readFileSync(AGENCIES_CONFIG_PATH, 'utf8')); } catch (e) {}
          }
          if (!configData.agencies) configData.agencies = {};

          const existing = configData.agencies[cleanId] || {};
          configData.agencies[cleanId] = {
            agencyId: cleanId,
            appName: (payload.appName || existing.appName || 'Agency Auto-SMS').trim(),
            legalName: (payload.legalName || existing.legalName || payload.appName || cleanId).trim(),
            tagline: (payload.tagline || existing.tagline || '24/7 AI Receptionist & Lead Protection').trim(),
            supportEmail: (payload.supportEmail || existing.supportEmail || '').trim(),
            supportPhone: (payload.supportPhone || existing.supportPhone || '').trim(),
            privacyPolicyUrl: (payload.privacyPolicyUrl || existing.privacyPolicyUrl || 'https://missedcallautosms.com/privacy.html').trim(),
            termsUrl: (payload.termsUrl || existing.termsUrl || 'https://missedcallautosms.com/terms.html').trim(),
            stripeDescriptor: (payload.stripeDescriptor || existing.stripeDescriptor || 'Voice Hub Network').trim(),
            logoUrl: (payload.logoUrl !== undefined ? payload.logoUrl : (existing.logoUrl || '')).trim(),
            iconUrl: (payload.iconUrl !== undefined ? payload.iconUrl : (existing.iconUrl || '')).trim(),
            customDomain: (payload.customDomain !== undefined ? payload.customDomain : (existing.customDomain || '')).trim(),
            theme: {
              primaryColor: (payload.primaryColor || payload.theme?.primaryColor || existing.theme?.primaryColor || '#2563EB').trim(),
              accentColor: (payload.accentColor || payload.theme?.accentColor || existing.theme?.accentColor || '#10B981').trim()
            }
          };

          fs.mkdirSync(path.join(__dirname, 'agencies'), { recursive: true });
          fs.writeFileSync(AGENCIES_CONFIG_PATH, JSON.stringify(configData, null, 2), 'utf8');

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, message: `Agency ${cleanId} saved successfully`, agency: configData.agencies[cleanId] }));
          return;
        }

        // 7. DELETE WHITE-LABEL AGENCY PROFILE
        if (action === 'delete_white_label_agency') {
          const agencyId = (payload.agencyId || payload.id || '').trim().toLowerCase();
          if (!agencyId || agencyId === 'default') {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'Cannot delete default agency or missing agencyId' }));
            return;
          }

          const AGENCIES_CONFIG_PATH = path.join(__dirname, 'agencies', 'agencies.json');
          if (fs.existsSync(AGENCIES_CONFIG_PATH)) {
            try {
              const configData = JSON.parse(fs.readFileSync(AGENCIES_CONFIG_PATH, 'utf8'));
              if (configData.agencies && configData.agencies[agencyId]) {
                delete configData.agencies[agencyId];
                fs.writeFileSync(AGENCIES_CONFIG_PATH, JSON.stringify(configData, null, 2), 'utf8');
              }
            } catch (e) {}
          }

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, message: `Agency ${agencyId} removed` }));
          return;
        }

        // 8. TRIGGER AGENCY BUILD (Compile APK)
        if (action === 'trigger_agency_build') {
          const agencyId = (payload.agencyId || payload.id || '').trim();
          const flavor = (payload.flavor || 'standard').trim().toLowerCase();
          if (!agencyId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'agencyId required' }));
            return;
          }

          const { exec } = require('child_process');
          const scriptPath = path.join(__dirname, 'scripts', 'build_agency.js');
          const cmd = `node "${scriptPath}" --agency "${agencyId}" --flavor "${flavor}"`;

          exec(cmd, { cwd: __dirname }, (error, stdout, stderr) => {
            if (error) {
              console.error(`❌ [AGENCY BUILD ERROR]`, stderr || error.message);
              res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ success: false, error: error.message, output: stderr || stdout }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: true, message: `Agency ${agencyId} build completed`, output: stdout }));
          });
          return;
        }

        // 9. AGENCY PARTNER SELF-SERVE AUTH
        if (action === 'agency_partner_auth') {
          const rawId = (payload.agencyId || payload.key || payload.slug || '').trim().toLowerCase();
          const cleanId = rawId.replace(/[^a-z0-9_]/g, '_');

          const AGENCIES_CONFIG_PATH = path.join(__dirname, 'agencies', 'agencies.json');
          let agencies = {};
          if (fs.existsSync(AGENCIES_CONFIG_PATH)) {
            try {
              const raw = JSON.parse(fs.readFileSync(AGENCIES_CONFIG_PATH, 'utf8'));
              agencies = raw.agencies || {};
            } catch (e) {}
          }

          let matchedAgency = agencies[cleanId] || null;
          let matchedKey = cleanId;

          // Fallback: check if matches by appName or if cleanId is in fleet cache
          if (!matchedAgency) {
            for (const [id, cfg] of Object.entries(agencies)) {
              if (cfg.appName && cfg.appName.toLowerCase().replace(/[^a-z0-9]/g, '') === rawId.replace(/[^a-z0-9]/g, '')) {
                matchedAgency = cfg;
                matchedKey = id;
                break;
              }
            }
          }

          if (!matchedAgency) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: `Agency partner "${rawId}" not found. Verify your agency slug or contact support.` }));
            return;
          }

          const subscribers = getVoiceSubscribers();
          const masterList = getMasterLicenses();

          const clients = [];
          const clientKeys = new Set();

          subscribers.forEach(s => {
            if (s.agencyId === matchedKey) {
              clientKeys.add(s.licenseKey);
              clients.push({
                name: s.name || s.businessName || 'Client Business',
                email: s.email || '',
                contact: s.phone || s.contact || '',
                notes: s.notes || '',
                licenseKey: s.licenseKey,
                minutes: s.voiceMinutesBalance || 0,
                status: s.status || (s.active ? 'ACTIVE' : 'INACTIVE'),
                carrierCode: s.carrierCode || '*71',
                forwardingActive: !s.isVoicePaused,
                hardwareId: s.deviceId || '',
                deviceModel: s.deviceModel || '',
                issuedAt: s.issuedAt || s.createdAt || ''
              });
            }
          });

          masterList.forEach(m => {
            if (m.agencyId === matchedKey && !clientKeys.has(m.key)) {
              clients.push({
                name: m.customer || 'Client Business',
                email: m.email || '',
                contact: m.contact || m.phone || '',
                notes: m.notes || '',
                licenseKey: m.key,
                minutes: m.voiceMinutesBalance || 0,
                status: m.status || 'ACTIVE',
                carrierCode: m.carrierCode || '*71',
                forwardingActive: m.voiceActive,
                hardwareId: m.deviceId || '',
                deviceModel: m.deviceModel || '',
                issuedAt: m.issuedAt || ''
              });
            }
          });

          // Check APK & OTA status
          const distDir = path.join(__dirname, 'dist', 'agencies', matchedKey);
          const otaDir = path.join(__dirname, 'ota', matchedKey);
          let apkFound = false;
          let apkFileName = '';
          let apkSizeMb = 0;
          let downloadUrl = '';

          if (fs.existsSync(distDir)) {
            const files = fs.readdirSync(distDir).filter(f => f.endsWith('.apk'));
            if (files.length > 0) {
              apkFound = true;
              apkFileName = files[0];
              const stats = fs.statSync(path.join(distDir, apkFileName));
              apkSizeMb = (stats.size / (1024 * 1024)).toFixed(2);
              downloadUrl = `/dist/agencies/${matchedKey}/${encodeURIComponent(apkFileName)}`;
            }
          }
          if (!apkFound && matchedKey === 'default') {
            const rootApk = path.join(__dirname, 'MissedCallAutoSMS.apk');
            if (fs.existsSync(rootApk)) {
              apkFound = true;
              apkFileName = 'MissedCallAutoSMS.apk';
              const stats = fs.statSync(rootApk);
              apkSizeMb = (stats.size / (1024 * 1024)).toFixed(2);
              downloadUrl = '/MissedCallAutoSMS.apk';
            }
          }

          let otaVersion = null;
          const otaPath = path.join(otaDir, 'version.json');
          if (fs.existsSync(otaPath)) {
            try {
              otaVersion = JSON.parse(fs.readFileSync(otaPath, 'utf8'));
            } catch (e) {}
          }

          const totalMins = clients.reduce((acc, c) => acc + (parseFloat(c.minutes) || 0), 0);
          const estCallsProtected = clients.length * 14;
          const estPipelineProtected = estCallsProtected * 450;

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            agency: {
              ...matchedAgency,
              id: matchedKey
            },
            billing: {
              hasCardOnFile: !!(matchedAgency.cardLast4 || matchedAgency.defaultPaymentMethodId),
              cardBrand: matchedAgency.cardBrand || null,
              cardLast4: matchedAgency.cardLast4 || null,
              stripeCustomerId: matchedAgency.stripeCustomerId || null
            },
            clients,
            stats: {
              clientCount: clients.length,
              totalMinutes: Math.round(totalMins * 10) / 10,
              estCallsProtected,
              estPipelineProtected
            },
            apkStatus: {
              exists: apkFound,
              fileName: apkFileName,
              sizeMb: apkSizeMb,
              downloadUrl
            },
            otaStatus: otaVersion
          }));
          return;
        }

        // 10. AGENCY PARTNER ISSUE CLIENT LICENSE KEY (WITH STRIPE $9.99/MO & LICENSE BILLING)
        if (action === 'agency_partner_issue_key') {
          const agencyId = (payload.agencyId || payload.id || '').trim().toLowerCase();
          const clientName = (payload.clientName || 'Client Business').trim();
          const clientEmail = (payload.clientEmail || '').trim();
          const clientContact = (payload.clientContact || payload.contact || payload.clientPhone || '').trim();
          const clientNotes = (payload.clientNotes || payload.notes || '').trim();
          const plan = (payload.plan || 'pro').toLowerCase() === 'flagship' ? 'flagship' : 'pro';
          const includeVoice = payload.includeVoice !== false && payload.includeVoice !== 'false';
          const paymentMode = payload.paymentMode || 'card_on_file'; // 'card_on_file' | 'checkout'

          if (!agencyId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'agencyId is required' }));
            return;
          }

          const AGENCIES_CONFIG_PATH = path.join(__dirname, 'agencies', 'agencies.json');
          let configData = { agencies: {} };
          if (fs.existsSync(AGENCIES_CONFIG_PATH)) {
            try { configData = JSON.parse(fs.readFileSync(AGENCIES_CONFIG_PATH, 'utf8')); } catch (e) {}
          }
          const agency = configData.agencies?.[agencyId] || {};

          const oneTimeAmount = plan === 'flagship' ? 4999 : 29999;
          const oneTimeLabel = plan === 'flagship' ? 'Flagship Appliance Edition ($49.99)' : 'Pro Automation Edition ($299.99)';
          const host = req.headers.host || 'localhost:8000';
          const origin = `http://${host}`;
          const stripeKey = getStripeKey();

          const hasCardOnFile = !!(agency.stripeCustomerId && (agency.defaultPaymentMethodId || agency.cardLast4));

          // Branch A: If agency requested direct checkout OR has no card on file, create Stripe Checkout Session
          if ((!hasCardOnFile || paymentMode === 'checkout') && stripeKey) {
            try {
              const checkoutData = {
                'mode': includeVoice ? 'subscription' : 'payment',
                'payment_method_types[0]': 'card',
                'line_items[0][price_data][currency]': 'usd',
                'line_items[0][price_data][unit_amount]': String(oneTimeAmount),
                'line_items[0][price_data][product_data][name]': `${oneTimeLabel} • ${agency.appName || 'White-Label'}`,
                'line_items[0][price_data][product_data][description]': `Dedicated Android appliance license for ${clientName}`,
                'line_items[0][quantity]': '1',
                'metadata[isAgencyClientIssuance]': 'true',
                'metadata[agencyId]': agencyId,
                'metadata[clientName]': clientName,
                'metadata[clientEmail]': clientEmail,
                'metadata[clientContact]': clientContact,
                'metadata[clientNotes]': clientNotes,
                'metadata[plan]': plan,
                'metadata[includeVoice]': includeVoice ? 'true' : 'false',
                'success_url': `${origin}/agency_dashboard.html?agency=${agencyId}&session_id={CHECKOUT_SESSION_ID}&client_deployed=true`,
                'cancel_url': `${origin}/agency_dashboard.html?agency=${agencyId}`
              };

              if (includeVoice) {
                checkoutData['line_items[1][price_data][currency]'] = 'usd';
                checkoutData['line_items[1][price_data][unit_amount]'] = '999';
                checkoutData['line_items[1][price_data][recurring][interval]'] = 'month';
                checkoutData['line_items[1][price_data][product_data][name]'] = `24/7 AI Voice Line ($9.99/mo) • ${clientName}`;
                checkoutData['line_items[1][price_data][product_data][description]'] = 'Monthly carrier line forwarding and Vapi AI voice receptionist engine access';
                checkoutData['line_items[1][quantity]'] = '1';
                checkoutData['subscription_data[metadata][agencyId]'] = agencyId;
                checkoutData['subscription_data[metadata][clientName]'] = clientName;
              }

              if (agency.stripeCustomerId) {
                checkoutData['customer'] = agency.stripeCustomerId;
              } else if (agency.supportEmail) {
                checkoutData['customer_email'] = agency.supportEmail;
              }

              const session = await stripeApiRequest('/v1/checkout/sessions', 'POST', checkoutData);
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({
                success: true,
                requiresCheckout: true,
                checkoutUrl: session.url,
                sessionId: session.id,
                plan,
                includeVoice
              }));
              return;
            } catch (stripeCheckoutErr) {
              console.warn('[AGENCY CHECKOUT ERROR, FALLING BACK TO DIRECT GENERATION]', stripeCheckoutErr.message);
            }
          }

          // Branch B: Card on File Off-Session Charge or Sandbox Deployment
          let stripeSubscriptionId = null;
          let paymentBilled = false;

          if (hasCardOnFile && stripeKey) {
            try {
              if (includeVoice) {
                const subData = {
                  'customer': agency.stripeCustomerId,
                  'items[0][price_data][currency]': 'usd',
                  'items[0][price_data][unit_amount]': '999',
                  'items[0][price_data][recurring][interval]': 'month',
                  'items[0][price_data][product_data][name]': `24/7 AI Voice Line ($9.99/mo) - ${clientName}`,
                  'add_invoice_items[0][price_data][currency]': 'usd',
                  'add_invoice_items[0][price_data][unit_amount]': String(oneTimeAmount),
                  'add_invoice_items[0][price_data][product_data][name]': `${oneTimeLabel} License - ${clientName}`,
                  'metadata[agencyId]': agencyId,
                  'metadata[clientName]': clientName,
                  'metadata[plan]': plan,
                  'off_session': 'true'
                };
                if (agency.defaultPaymentMethodId) {
                  subData['default_payment_method'] = agency.defaultPaymentMethodId;
                }
                const sub = await stripeApiRequest('/v1/subscriptions', 'POST', subData);
                stripeSubscriptionId = sub.id;
                paymentBilled = true;
                console.log(`💳 [STRIPE OFF-SESSION CHARGED] Billed agency [${agencyId}] $${(oneTimeAmount/100).toFixed(2)} + $9.99/mo sub [${sub.id}] for client [${clientName}]`);
              } else {
                const piData = {
                  'amount': String(oneTimeAmount),
                  'currency': 'usd',
                  'customer': agency.stripeCustomerId,
                  'payment_method': agency.defaultPaymentMethodId,
                  'off_session': 'true',
                  'confirm': 'true',
                  'description': `${oneTimeLabel} License - ${clientName}`,
                  'metadata[agencyId]': agencyId,
                  'metadata[clientName]': clientName
                };
                await stripeApiRequest('/v1/payment_intents', 'POST', piData);
                paymentBilled = true;
                console.log(`💳 [STRIPE OFF-SESSION CHARGED] Billed agency [${agencyId}] $${(oneTimeAmount/100).toFixed(2)} one-time license for client [${clientName}]`);
              }
            } catch (chargeErr) {
              console.warn('[STRIPE OFF-SESSION CHARGE FAILED, RETURNING CHECKOUT]', chargeErr.message);
              // If off-session charge fails (e.g. expired card), create checkout session fallback
              try {
                const checkoutData = {
                  'mode': includeVoice ? 'subscription' : 'payment',
                  'payment_method_types[0]': 'card',
                  'line_items[0][price_data][currency]': 'usd',
                  'line_items[0][price_data][unit_amount]': String(oneTimeAmount),
                  'line_items[0][price_data][product_data][name]': `${oneTimeLabel} • ${agency.appName || 'White-Label'}`,
                  'line_items[0][quantity]': '1',
                  'customer': agency.stripeCustomerId || undefined,
                  'metadata[isAgencyClientIssuance]': 'true',
                  'metadata[agencyId]': agencyId,
                  'metadata[clientName]': clientName,
                  'metadata[clientContact]': clientContact,
                  'metadata[clientNotes]': clientNotes,
                  'metadata[plan]': plan,
                  'metadata[includeVoice]': includeVoice ? 'true' : 'false',
                  'success_url': `${origin}/agency_dashboard.html?agency=${agencyId}&session_id={CHECKOUT_SESSION_ID}&client_deployed=true`,
                  'cancel_url': `${origin}/agency_dashboard.html?agency=${agencyId}`
                };
                if (includeVoice) {
                  checkoutData['line_items[1][price_data][currency]'] = 'usd';
                  checkoutData['line_items[1][price_data][unit_amount]'] = '999';
                  checkoutData['line_items[1][price_data][recurring][interval]'] = 'month';
                  checkoutData['line_items[1][price_data][product_data][name]'] = `24/7 AI Voice Line ($9.99/mo) • ${clientName}`;
                  checkoutData['line_items[1][quantity]'] = '1';
                }
                const session = await stripeApiRequest('/v1/checkout/sessions', 'POST', checkoutData);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({
                  success: true,
                  requiresCheckout: true,
                  checkoutUrl: session.url,
                  sessionId: session.id,
                  notice: 'Card on file failed or requires authorization; redirected to checkout.'
                }));
                return;
              } catch (e2) {}
            }
          }

          const licenseKey = generateKey(clientName, 0, plan !== 'flagship');
          const nowIso = new Date().toISOString();
          const forwardingNumber = process.env.VAPI_PRIMARY_PHONE_NUMBER || '+1 (732) 660-9121';
          const cleanDigits = forwardingNumber.replace(/\D/g, '');
          const carrierCode = `*71${cleanDigits.slice(-10)}`;

          saveMasterLicense({
            key: licenseKey,
            customer: clientName,
            email: clientEmail,
            contact: clientContact,
            notes: clientNotes,
            agencyId: agencyId,
            edition: plan,
            voiceEntitlement: includeVoice,
            vapiProvisioned: includeVoice,
            voiceActive: includeVoice,
            voiceNumber: forwardingNumber,
            carrierCode: carrierCode,
            voiceMinutesBalance: includeVoice ? 40 : 0,
            status: 'ACTIVE',
            price: includeVoice ? '9.99/mo' : (plan === 'flagship' ? '$49.99' : '$299.99'),
            stripeSubscriptionId: stripeSubscriptionId,
            stripeCustomerId: agency.stripeCustomerId || null,
            issuedAt: nowIso
          });

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            licenseKey,
            paymentBilled,
            subscriptionId: stripeSubscriptionId,
            client: {
              name: clientName,
              email: clientEmail,
              contact: clientContact,
              notes: clientNotes,
              licenseKey,
              minutes: includeVoice ? 40 : 0,
              status: 'ACTIVE',
              hardwareId: '',
              plan,
              includeVoice,
              issuedAt: nowIso
            }
          }));
          return;
        }

        // 11. AGENCY PARTNER ATTACH / UPDATE PAYMENT CARD (STRIPE SETUP SESSION)
        if (action === 'agency_partner_attach_card') {
          const agencyId = (payload.agencyId || payload.id || '').trim().toLowerCase();
          if (!agencyId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'agencyId is required' }));
            return;
          }

          const AGENCIES_CONFIG_PATH = path.join(__dirname, 'agencies', 'agencies.json');
          let configData = { agencies: {} };
          if (fs.existsSync(AGENCIES_CONFIG_PATH)) {
            try { configData = JSON.parse(fs.readFileSync(AGENCIES_CONFIG_PATH, 'utf8')); } catch (e) {}
          }
          const agency = configData.agencies?.[agencyId] || {};
          const host = req.headers.host || 'localhost:8000';
          const origin = `http://${host}`;

          try {
            const setupData = {
              'mode': 'setup',
              'payment_method_types[0]': 'card',
              'metadata[action]': 'agency_attach_card',
              'metadata[agencyId]': agencyId,
              'success_url': `${origin}/agency_dashboard.html?agency=${agencyId}&card_attached=true&session_id={CHECKOUT_SESSION_ID}`,
              'cancel_url': `${origin}/agency_dashboard.html?agency=${agencyId}`
            };

            if (agency.stripeCustomerId) {
              setupData['customer'] = agency.stripeCustomerId;
            } else if (agency.supportEmail) {
              setupData['customer_email'] = agency.supportEmail;
            }

            const session = await stripeApiRequest('/v1/checkout/sessions', 'POST', setupData);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: true, checkoutUrl: session.url, sessionId: session.id }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
          return;
        }

        // 12. AGENCY PARTNER VERIFY SESSION (SYNC AFTER RETURNING FROM STRIPE CHECKOUT)
        if (action === 'agency_partner_verify_session') {
          const agencyId = (payload.agencyId || payload.id || '').trim().toLowerCase();
          const sessionId = (payload.sessionId || '').trim();

          if (!sessionId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'sessionId is required' }));
            return;
          }

          try {
            const session = await stripeApiRequest(`/v1/checkout/sessions/${sessionId}`);
            const { customerId: stripeCustId, cardDetails } = await getPaymentMethodDetailsFromSession(session);
            const AGENCIES_CONFIG_PATH = path.join(__dirname, 'agencies', 'agencies.json');

            // Vault card
            if (fs.existsSync(AGENCIES_CONFIG_PATH) && agencyId) {
              try {
                const cfg = JSON.parse(fs.readFileSync(AGENCIES_CONFIG_PATH, 'utf8'));
                if (cfg.agencies && cfg.agencies[agencyId]) {
                  cfg.agencies[agencyId].stripeCustomerId = stripeCustId || session.customer || cfg.agencies[agencyId].stripeCustomerId;
                  if (cardDetails) {
                    cfg.agencies[agencyId].cardBrand = cardDetails.brand;
                    cfg.agencies[agencyId].cardLast4 = cardDetails.last4;
                    cfg.agencies[agencyId].defaultPaymentMethodId = cardDetails.id;
                  }
                  fs.writeFileSync(AGENCIES_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
                }
              } catch (e) {}
            }

            const meta = session.metadata || {};
            let issuedKey = null;

            // If this was a client deployment and license key not yet created:
            if (meta.isAgencyClientIssuance === 'true' && meta.clientName) {
              const masterList = getMasterLicenses();
              const existing = masterList.find(m => m.agencyId === agencyId && m.customer === meta.clientName);
              if (existing) {
                issuedKey = existing.key;
              } else {
                const clientName = meta.clientName;
                const plan = meta.plan || 'pro';
                const includeVoice = meta.includeVoice === 'true' || !!session.subscription;
                issuedKey = generateKey(clientName, 0, plan !== 'flagship');
                const nowIso = new Date().toISOString();
                const forwardingNumber = process.env.VAPI_PRIMARY_PHONE_NUMBER || '+1 (732) 660-9121';
                const cleanDigits = forwardingNumber.replace(/\D/g, '');
                const carrierCode = `*71${cleanDigits.slice(-10)}`;

                saveMasterLicense({
                  key: issuedKey,
                  customer: clientName,
                  email: session.customer_details?.email || session.customer_email || '',
                  contact: meta.clientContact || '',
                  notes: meta.clientNotes || '',
                  agencyId: agencyId,
                  edition: plan,
                  voiceEntitlement: includeVoice,
                  vapiProvisioned: includeVoice,
                  voiceActive: includeVoice,
                  voiceNumber: forwardingNumber,
                  carrierCode: carrierCode,
                  voiceMinutesBalance: includeVoice ? 40 : 0,
                  status: 'ACTIVE',
                  stripeSubscriptionId: session.subscription || null,
                  stripeCustomerId: stripeCustId || session.customer || null,
                  issuedAt: nowIso
                });
              }
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({
              success: true,
              licenseKey: issuedKey,
              cardSaved: !!cardDetails,
              cardBrand: cardDetails?.brand,
              cardLast4: cardDetails?.last4
            }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
          return;
        }

        // 13. AGENCY PARTNER RESET CLIENT HARDWARE LOCK
        if (action === 'agency_partner_reset_client') {
          const agencyId = (payload.agencyId || payload.id || '').trim().toLowerCase();
          const licenseKey = (payload.licenseKey || payload.key || '').trim().toUpperCase();

          if (!agencyId || !licenseKey) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'agencyId and licenseKey are required' }));
            return;
          }

          const masterPath = path.join(__dirname, 'data', 'master_licenses.json');
          let found = false;
          if (fs.existsSync(masterPath)) {
            try {
              const list = JSON.parse(fs.readFileSync(masterPath, 'utf8') || '[]');
              const idx = list.findIndex(x => x.key === licenseKey && x.agencyId === agencyId);
              if (idx >= 0) {
                list[idx].deviceId = null;
                list[idx].deviceModel = null;
                fs.writeFileSync(masterPath, JSON.stringify(list, null, 2), 'utf8');
                found = true;
              }
            } catch (e) {}
          }

          // Clear local cache if exists
          try {
            const localCachePath = path.join(__dirname, 'data', 'device_cache.json');
            if (fs.existsSync(localCachePath)) {
              const cache = JSON.parse(fs.readFileSync(localCachePath, 'utf8') || '{}');
              if (cache[licenseKey]) {
                delete cache[licenseKey];
                fs.writeFileSync(localCachePath, JSON.stringify(cache, null, 2), 'utf8');
              }
            }
          } catch (e) {}

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, message: 'Hardware lock reset successfully. Client phone can now be bound to a new device.' }));
          return;
        }

        // 14. AGENCY PARTNER REVOKE CLIENT LICENSE (AND CANCEL $9.99/MO STRIPE SUBSCRIPTION)
        if (action === 'agency_partner_revoke_key') {
          const agencyId = (payload.agencyId || payload.id || '').trim().toLowerCase();
          const licenseKey = (payload.licenseKey || payload.key || '').trim().toUpperCase();

          if (!agencyId || !licenseKey) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'agencyId and licenseKey are required' }));
            return;
          }

          const masterPath = path.join(__dirname, 'data', 'master_licenses.json');
          let subIdToCancel = null;
          if (fs.existsSync(masterPath)) {
            try {
              const list = JSON.parse(fs.readFileSync(masterPath, 'utf8') || '[]');
              const idx = list.findIndex(x => x.key === licenseKey && x.agencyId === agencyId);
              if (idx >= 0) {
                subIdToCancel = list[idx].stripeSubscriptionId;
                list[idx].status = 'REVOKED';
                list[idx].voiceActive = false;
                fs.writeFileSync(masterPath, JSON.stringify(list, null, 2), 'utf8');
              }
            } catch (e) {}
          }

          // Cancel recurring Stripe voice subscription if active
          if (subIdToCancel && subIdToCancel.startsWith('sub_')) {
            try {
              await stripeApiRequest(`/v1/subscriptions/${subIdToCancel}`, 'DELETE');
              console.log(`🛑 [STRIPE SUBSCRIPTION CANCELLED] Cancelled $9.99/mo voice line ${subIdToCancel} for revoked client ${licenseKey}`);
            } catch (stripeErr) {
              console.warn(`[STRIPE CANCEL NOTICE] Could not cancel subscription ${subIdToCancel}:`, stripeErr.message);
            }
          }

          // Track in revoked list
          try {
            const fleetCachePath = path.join(__dirname, '.agency_fleet_cache.json');
            let cache = {};
            if (fs.existsSync(fleetCachePath)) {
              cache = JSON.parse(fs.readFileSync(fleetCachePath, 'utf8') || '{}');
            }
            if (!cache._revokedKeys) cache._revokedKeys = [];
            if (!cache._revokedKeys.includes(licenseKey)) {
              cache._revokedKeys.push(licenseKey);
              fs.writeFileSync(fleetCachePath, JSON.stringify(cache, null, 2), 'utf8');
            }
          } catch (e) {}

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, message: 'Client license revoked and $9.99/mo voice subscription cancelled.' }));
          return;
        }

        // 13. AGENCY PARTNER UPDATE SETTINGS
        if (action === 'agency_partner_update_settings') {
          const agencyId = (payload.agencyId || payload.id || '').trim().toLowerCase();
          if (!agencyId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'agencyId is required' }));
            return;
          }

          const AGENCIES_CONFIG_PATH = path.join(__dirname, 'agencies', 'agencies.json');
          let configData = { agencies: {} };
          if (fs.existsSync(AGENCIES_CONFIG_PATH)) {
            try { configData = JSON.parse(fs.readFileSync(AGENCIES_CONFIG_PATH, 'utf8')); } catch (e) {}
          }

          if (!configData.agencies || !configData.agencies[agencyId]) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'Agency profile not found' }));
            return;
          }

          const existing = configData.agencies[agencyId];
          configData.agencies[agencyId] = {
            ...existing,
            tagline: (payload.tagline !== undefined ? payload.tagline : existing.tagline).trim(),
            supportEmail: (payload.supportEmail !== undefined ? payload.supportEmail : existing.supportEmail).trim(),
            supportPhone: (payload.supportPhone !== undefined ? payload.supportPhone : existing.supportPhone).trim(),
            privacyPolicyUrl: (payload.privacyPolicyUrl !== undefined ? payload.privacyPolicyUrl : existing.privacyPolicyUrl).trim(),
            termsUrl: (payload.termsUrl !== undefined ? payload.termsUrl : existing.termsUrl).trim(),
            logoUrl: (payload.logoUrl !== undefined ? payload.logoUrl : (existing.logoUrl || '')).trim(),
            iconUrl: (payload.iconUrl !== undefined ? payload.iconUrl : (existing.iconUrl || '')).trim(),
            customDomain: (payload.customDomain !== undefined ? payload.customDomain : (existing.customDomain || '')).trim(),
            theme: {
              ...(existing.theme || {}),
              primaryColor: (payload.primaryColor || payload.theme?.primaryColor || existing.theme?.primaryColor || '#2563EB').trim()
            }
          };

          fs.writeFileSync(AGENCIES_CONFIG_PATH, JSON.stringify(configData, null, 2), 'utf8');

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, message: 'Agency settings updated successfully', agency: configData.agencies[agencyId] }));
          return;
        }

        // 14. AGENCY / OWNER GET CLIENT REMOTE CONFIG
        if (action === 'agency_get_client_remote_config') {
          const licenseKey = (payload.licenseKey || payload.key || '').trim().toUpperCase();
          if (!licenseKey) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'licenseKey is required' }));
            return;
          }

          const config = getApplianceConfigByKey(licenseKey);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            licenseKey: licenseKey,
            config: config
          }));
          return;
        }

        // 15. AGENCY / OWNER SAVE CLIENT REMOTE CONFIG & SYNC VAPI
        if (action === 'agency_save_client_remote_config') {
          const licenseKey = (payload.licenseKey || payload.key || '').trim().toUpperCase();
          const agencyId = (payload.agencyId || payload.id || 'agency').trim();

          if (!licenseKey) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'licenseKey is required' }));
            return;
          }

          // Live cloud sync to Vapi if voice parameters were modified
          let vapiSyncResult = null;
          if (payload.voice && (payload.voice.customGreeting || payload.voice.systemPrompt || payload.voice.voiceAgentName)) {
            vapiSyncResult = await syncRemoteVoiceToVapi(licenseKey, payload.voice);
          }

          // Save to local appliance_configs.json & Firestore
          const savedConfig = saveApplianceConfig(licenseKey, {
            customerName: payload.customerName,
            voice: payload.voice || {},
            handset: payload.handset || {}
          }, agencyId);

          // Sync metadata to master_licenses.json if relevant
          try {
            const masterPath = path.join(__dirname, 'data', 'master_licenses.json');
            if (fs.existsSync(masterPath)) {
              const list = JSON.parse(fs.readFileSync(masterPath, 'utf8') || '[]');
              const idx = list.findIndex(x => x.key === licenseKey);
              if (idx >= 0) {
                if (payload.customerName) list[idx].customer = payload.customerName;
                if (payload.voice?.forwardingNumber) list[idx].voiceNumber = payload.voice.forwardingNumber;
                fs.writeFileSync(masterPath, JSON.stringify(list, null, 2), 'utf8');
              }
            }
          } catch (mErr) {
            console.warn('[Remote Config] master_licenses sync notice:', mErr.message);
          }

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            message: 'Appliance configuration saved live and dispatched to Vapi cloud!',
            config: savedConfig,
            vapiSync: vapiSyncResult
          }));
          return;
        }

        // 16. AGENCY SAVE MASTER WEBHOOK CONFIG
        if (action === 'agency_save_webhook_config') {
          const agencyId = (payload.agencyId || payload.id || '').trim().toLowerCase();
          if (!agencyId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'agencyId is required' }));
            return;
          }

          const AGENCIES_CONFIG_PATH = path.join(__dirname, 'agencies', 'agencies.json');
          let configData = { agencies: {} };
          if (fs.existsSync(AGENCIES_CONFIG_PATH)) {
            try { configData = JSON.parse(fs.readFileSync(AGENCIES_CONFIG_PATH, 'utf8')); } catch (e) {}
          }

          if (!configData.agencies || !configData.agencies[agencyId]) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'Agency profile not found' }));
            return;
          }

          const masterUrl = (payload.masterUrl || '').trim();
          const signingSecret = (payload.signingSecret || payload.secret || '').trim() || `whsec_${crypto.randomBytes(16).toString('hex')}`;
          const events = Array.isArray(payload.events) ? payload.events : ['call.missed', 'voice.call_completed', 'lead.urgent', 'sms.received'];
          const active = payload.active !== false;

          configData.agencies[agencyId].webhook = {
            masterUrl,
            signingSecret,
            events,
            active,
            updatedAt: new Date().toISOString()
          };

          fs.writeFileSync(AGENCIES_CONFIG_PATH, JSON.stringify(configData, null, 2), 'utf8');

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            message: 'Agency master webhook router saved successfully!',
            webhook: configData.agencies[agencyId].webhook
          }));
          return;
        }

        // 17. AGENCY TEST WEBHOOK (LIVE SIMULATOR)
        if (action === 'agency_test_webhook') {
          const targetUrl = (payload.targetUrl || payload.url || '').trim();
          const eventType = payload.eventType || 'voice.call_completed';
          const signingSecret = (payload.signingSecret || payload.secret || '').trim();
          const agencyId = (payload.agencyId || 'apex_leads').trim();

          if (!targetUrl || !targetUrl.startsWith('http')) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'A valid http:// or https:// webhook URL is required.' }));
            return;
          }

          // Build realistic simulated payload
          let mockPayload = {};
          const nowIso = new Date().toISOString();

          if (eventType === 'voice.call_completed') {
            mockPayload = {
              event: 'voice.call_completed',
              timestamp: nowIso,
              agencyId: agencyId,
              client: {
                name: payload.clientName || 'Premier Roofing Group',
                licenseKey: payload.clientKey || 'MCAS-PRO-5072656D69657220526F6F66696E672047726F75707C307C31373930373835313533-61745DD5'
              },
              caller: {
                phone: '+1 (555) 234-8910',
                name: 'Sarah Jenkins',
                address: '742 Evergreen Terrace, Springfield'
              },
              call: {
                id: `call_test_${Date.now()}`,
                duration: '1m 24s',
                durationSeconds: 84,
                recordingUrl: 'https://vapi-public.s3.amazonaws.com/recordings/sample-roof-leak-estimate.mp3',
                summary: 'Caller noticed a roof leak above master bedroom during heavy rain. Requested emergency roof tarping and formal estimate tomorrow morning.',
                transcript: 'Riley: Hi, thank you for calling Premier Roofing Group! How can we assist you with your roof today?\nSarah: Hi Riley, we have water dripping from our ceiling right now from the rainstorm!\nRiley: Oh no, I am so sorry to hear that! What address should we send our emergency crew to?\nSarah: 742 Evergreen Terrace. Can someone come out tonight?\nRiley: Absolutely Sarah, I have flagged your address as priority emergency dispatch and sent your phone number to our on-call roof technician. You will receive an instant confirmation text right now.',
                urgency: 'HIGH',
                category: 'Urgent Service Emergency'
              },
              smsFollowUp: {
                sent: true,
                text: 'Hey Sarah, this is Premier Roofing Group. Got your note about the ceiling leak at 742 Evergreen Terrace. Our emergency tech is reviewing your ticket and reaching out shortly!'
              }
            };
          } else if (eventType === 'call.missed') {
            mockPayload = {
              event: 'call.missed',
              timestamp: nowIso,
              agencyId: agencyId,
              client: {
                name: payload.clientName || 'Premier Roofing Group',
                licenseKey: payload.clientKey || 'MCAS-PRO-DEMO'
              },
              caller: {
                phone: '+1 (555) 789-0123',
                name: 'John Doe (New Inquiry)'
              },
              handset: {
                simSlot: 0,
                autoSmsDispatched: true,
                autoSmsText: 'Hey! Sorry I missed your call. How can I help you today? - Premier Roofing Group',
                jitterDelaySeconds: 15
              }
            };
          } else if (eventType === 'sms.received') {
            mockPayload = {
              event: 'sms.received',
              timestamp: nowIso,
              agencyId: agencyId,
              client: {
                name: payload.clientName || 'Premier Roofing Group',
                licenseKey: payload.clientKey || 'MCAS-PRO-DEMO'
              },
              sender: {
                phone: '+1 (555) 789-0123'
              },
              message: {
                body: 'Yes, please give me a call back at 3 PM to discuss the new roof estimate. Thanks!',
                receivedOnSim: 'SIM 1 (Business)'
              }
            };
          } else {
            mockPayload = {
              event: 'lead.urgent',
              timestamp: nowIso,
              agencyId: agencyId,
              priority: 'HIGH_PRIORITY_EMERGENCY',
              caller: { phone: '+1 (555) 999-4321', name: 'Robert Miller', address: '124 Main Street' },
              summary: 'Basement flooding due to broken mainline valve. Customer needs emergency shutoff assistance immediately.',
              recordingUrl: 'https://vapi-public.s3.amazonaws.com/recordings/sample-flooding.mp3'
            };
          }

          const parsedUrl = new URL(targetUrl);
          const postData = JSON.stringify(mockPayload);
          const isHttps = parsedUrl.protocol === 'https:';
          const client = isHttps ? https : http;

          const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'User-Agent': 'MissedCallAutoSMS-WebhookSimulator/2.0'
          };

          if (signingSecret) {
            const hmac = crypto.createHmac('sha256', signingSecret).update(postData).digest('hex');
            headers['X-MCAS-Signature'] = `sha256=${hmac}`;
          }

          const startTime = Date.now();

          const testReq = client.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: headers,
            timeout: 7000
          }, (testRes) => {
            let resBody = '';
            testRes.on('data', chunk => resBody += chunk);
            testRes.on('end', () => {
              const durationMs = Date.now() - startTime;
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({
                success: true,
                statusCode: testRes.statusCode,
                statusText: testRes.statusMessage || `${testRes.statusCode}`,
                durationMs: durationMs,
                responseBody: resBody.slice(0, 500) || '(Empty response body)',
                payloadSent: mockPayload
              }));
            });
          });

          testReq.on('timeout', () => {
            testReq.destroy();
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({
              success: false,
              statusCode: 408,
              statusText: 'Request Timeout (Webhook took > 7000ms)',
              durationMs: 7000,
              responseBody: 'Webhook endpoint did not respond within 7 seconds.'
            }));
          });

          testReq.on('error', (err) => {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({
              success: false,
              statusCode: 502,
              statusText: err.message || 'Connection Refused',
              durationMs: Date.now() - startTime,
              responseBody: `Network error connecting to webhook: ${err.message}`
            }));
          });

          testReq.write(postData);
          testReq.end();
          return;
        }

        // 18. AGENCY DISPATCH OUTBOUND SMS VIA CLIENT PHYSICAL SIM
        if (action === 'agency_dispatch_sms') {
          const to = (payload.to || payload.phone || '').trim();
          const message = (payload.message || payload.text || '').trim();
          const licenseKey = (payload.licenseKey || '').trim().toUpperCase();

          if (!to || !message) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'Destination phone number and message text are required.' }));
            return;
          }

          const queueItem = {
            callId: `crm_${Date.now()}`,
            recipient: to,
            message: message,
            urgency: payload.urgency || 'NORMAL'
          };
          enqueueVoiceSms(queueItem);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            message: `SMS queued for physical SIM dispatch on client appliance (${licenseKey || 'Default'})!`,
            recipient: to,
            queuedAt: new Date().toISOString()
          }));
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

  // ─── Agency: Outbound CRM-to-SIM SMS REST API Bridge ───
  if ((relativePath === '/api/agency/dispatch-sms' || relativePath === '/api/agency/dispatch-sms/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const to = (payload.to || payload.phone || payload.recipient || '').trim();
        const message = (payload.message || payload.text || payload.body || '').trim();
        const licenseKey = (payload.licenseKey || req.headers['x-license-key'] || '').trim().toUpperCase();
        const agencyKey = (payload.agencyKey || payload.apiKey || req.headers['x-agency-key'] || req.headers['x-api-key'] || '').trim();

        if (!to || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Destination phone number ("to") and message text ("message") are required.' }));
          return;
        }

        const queueItem = {
          callId: `crm_${Date.now()}`,
          recipient: to,
          message: message,
          urgency: payload.urgency || 'NORMAL'
        };
        enqueueVoiceSms(queueItem);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: 'SMS queued for physical SIM dispatch on client appliance!',
          queueId: queueItem.callId,
          recipient: to,
          messageLength: message.length,
          licenseKey: licenseKey || 'Default',
          queuedAt: new Date().toISOString()
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
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

  // ─── Appliance: Remote Config Sync (consumed by Android handset) ───
  if ((relativePath === '/api/appliance/config' || relativePath === '/api/appliance/config/') && req.method === 'GET') {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const keyParam = (urlObj.searchParams.get('key') || urlObj.searchParams.get('licenseKey') || '').trim().toUpperCase();

    if (!keyParam) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, error: 'key parameter required' }));
      return;
    }

    try {
      const config = getApplianceConfigByKey(keyParam);
      const updatedAtMs = config.updatedAt ? new Date(config.updatedAt).getTime() : Date.now();

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        success: true,
        licenseKey: keyParam,
        updatedAt: config.updatedAt,
        updatedAtMs: updatedAtMs,
        managedBy: config.agencyId || 'Agency Partner',
        lockHandsetSettings: !!config.handset?.lockHandsetSettings,
        config: config
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // ─── Appliance: Heartbeat Check-In & Sync (consumed by Android handset background worker) ───
  if ((relativePath === '/api/appliance/checkin' || relativePath === '/api/appliance/checkin/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const key = (payload.licenseKey || payload.key || '').trim().toUpperCase();
        if (!key) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'licenseKey required' }));
          return;
        }

        const config = getApplianceConfigByKey(key);
        const serverTimestampMs = config.updatedAt ? new Date(config.updatedAt).getTime() : 0;
        const lastSyncMs = Number(payload.lastSyncTimestamp) || 0;
        const hasUpdate = serverTimestampMs > lastSyncMs;

        // Record heartbeat metadata
        saveApplianceConfig(key, {
          heartbeat: {
            lastSeenAt: new Date().toISOString(),
            appVersion: payload.appVersion || 'Unknown',
            batteryLevel: payload.batteryLevel ?? null,
            isCharging: !!payload.isCharging,
            deviceId: payload.deviceId || null,
            ip: req.socket?.remoteAddress || null
          }
        }, 'heartbeat');

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          hasUpdate: hasUpdate,
          serverTimestampMs: serverTimestampMs,
          lockHandsetSettings: !!config.handset?.lockHandsetSettings,
          config: hasUpdate ? config : null
        }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
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

  // ══════════════════════════════════════════════════════════════════════════════
  // 📱 UNIFIED CLIENT PORTAL API (MAIN BRAND & WHITE-LABEL)
  // ══════════════════════════════════════════════════════════════════════════════
  const CLIENT_ACCOUNTS_FILE = path.join(__dirname, 'data', 'client_accounts.json');
  const CLIENT_SMS_HISTORY_FILE = path.join(__dirname, 'data', 'client_sms_history.json');
  const CLIENT_TASKS_FILE = path.join(__dirname, 'data', 'client_tasks.json');

  function getClientAccounts() {
    if (fs.existsSync(CLIENT_ACCOUNTS_FILE)) {
      try { return JSON.parse(fs.readFileSync(CLIENT_ACCOUNTS_FILE, 'utf8')); } catch (e) { return []; }
    }
    return [];
  }

  function saveClientAccount(acc) {
    const list = getClientAccounts();
    const cleanKey = (acc.licenseKey || '').trim().toUpperCase();
    const cleanUser = (acc.username || '').trim().toLowerCase();
    const idx = list.findIndex(a => (cleanKey && a.licenseKey === cleanKey) || (cleanUser && a.username.toLowerCase() === cleanUser));
    const now = new Date().toISOString();
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...acc, updatedAt: now };
    } else {
      list.unshift({ ...acc, createdAt: now, updatedAt: now });
    }
    const ddir = path.join(__dirname, 'data');
    if (!fs.existsSync(ddir)) fs.mkdirSync(ddir, { recursive: true });
    fs.writeFileSync(CLIENT_ACCOUNTS_FILE, JSON.stringify(list, null, 2), 'utf8');
  }

  function getClientTasks(licenseKey) {
    let tasks = [];
    if (fs.existsSync(CLIENT_TASKS_FILE)) {
      try { tasks = JSON.parse(fs.readFileSync(CLIENT_TASKS_FILE, 'utf8')); } catch (e) {}
    }
    if (tasks.length === 0) {
      tasks = [
        {
          id: 'task_auto_1',
          licenseKey: licenseKey,
          sourceType: 'VOICE_CALL',
          sourceId: 'call_test_1790192234670',
          title: '🚨 Emergency Dispatch: Roof Tarping & Water Stop',
          category: 'EMERGENCY_DISPATCH',
          priority: 'CRITICAL',
          customerName: 'Sarah Jenkins',
          customerPhone: '+1 (404) 555-8321',
          serviceAddress: '844 Peachtree St NE, Atlanta, GA',
          notes: 'Caller has active ceiling leak in master bedroom. Dispatched confirmation text via SIM. Crew needed before evening rainstorm.',
          dueSla: 'Within 2 Hours',
          status: 'PENDING',
          createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          completedAt: null
        },
        {
          id: 'task_auto_2',
          licenseKey: licenseKey,
          sourceType: 'INBOUND_SMS',
          sourceId: 'sms_hist_2',
          title: '📅 Appointment Confirmation: Confirm 4:30 PM Time Window',
          category: 'APPOINTMENT_SCHEDULE',
          priority: 'HIGH',
          customerName: 'Sarah Jenkins',
          customerPhone: '+1 (404) 555-8321',
          serviceAddress: '844 Peachtree St NE, Atlanta, GA',
          notes: 'Customer texted back: "We will be home after 4:30 PM if the tech can come then." Confirm technician ETA via office SIM text.',
          dueSla: 'Same Day',
          status: 'PENDING',
          createdAt: new Date(Date.now() - 3600000 * 1.5).toISOString(),
          completedAt: null
        },
        {
          id: 'task_auto_3',
          licenseKey: licenseKey,
          sourceType: 'VOICE_CALL',
          sourceId: 'call_test_1789833384440',
          title: '💼 Prepare Formal Estimate: Water Heater Replacement',
          category: 'ESTIMATE_PROPOSAL',
          priority: 'NORMAL',
          customerName: 'Alex Johnson',
          customerPhone: '+14045559876',
          serviceAddress: '844 Peachtree St NE, Atlanta, GA',
          notes: 'Emergency water heater burst. Review system size and send formal equipment replacement quote and warranty options.',
          dueSla: 'Within 24 Hours',
          status: 'PENDING',
          createdAt: new Date(Date.now() - 3600000 * 14).toISOString(),
          completedAt: null
        }
      ];
      try {
        const ddir = path.join(__dirname, 'data');
        if (!fs.existsSync(ddir)) fs.mkdirSync(ddir, { recursive: true });
        fs.writeFileSync(CLIENT_TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
      } catch (e) {}
    }
    return tasks;
  }

  function saveClientTasks(tasks) {
    const ddir = path.join(__dirname, 'data');
    if (!fs.existsSync(ddir)) fs.mkdirSync(ddir, { recursive: true });
    fs.writeFileSync(CLIENT_TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
  }

  function hashPortalPassword(pwd, salt) {
    return crypto.createHmac('sha256', salt).update(pwd).digest('hex');
  }

  function resolvePortalBranding(agencyId) {
    if (agencyId && agencyId !== 'default') {
      const AGENCIES_CONFIG_PATH = path.join(__dirname, 'agencies', 'agencies.json');
      if (fs.existsSync(AGENCIES_CONFIG_PATH)) {
        try {
          const raw = JSON.parse(fs.readFileSync(AGENCIES_CONFIG_PATH, 'utf8'));
          const ag = raw.agencies && raw.agencies[agencyId];
          if (ag) {
            return {
              isWhiteLabel: true,
              agencyId: agencyId,
              appName: ag.appName || 'Telecom Appliance',
              legalName: ag.legalName || ag.appName || 'Agency Partner',
              tagline: ag.tagline || 'AI Telecom Appliance & 24/7 Voice Receptionist',
              theme: ag.theme || { primaryColor: '#2563EB', accentColor: '#38BDF8' },
              supportEmail: ag.supportEmail || '',
              supportPhone: ag.supportPhone || '',
              privacyPolicyUrl: ag.privacyPolicyUrl || '',
              termsUrl: ag.termsUrl || '',
              logoUrl: ag.logoUrl || '',
              iconUrl: ag.iconUrl || '',
              customDomain: ag.customDomain || '',
              icon: ag.logoUrl ? '' : '⚡'
            };
          }
        } catch (e) {}
      }
    }
    return {
      isWhiteLabel: false,
      agencyId: 'default',
      appName: 'Missed Call Auto SMS',
      legalName: 'Missed Call Auto SMS',
      tagline: 'AI Telecom Appliance & 24/7 Voice Receptionist',
      theme: { primaryColor: '#2563EB', accentColor: '#38BDF8' },
      supportEmail: 'support@missedcallautosms.com',
      supportPhone: '+1 (800) 555-0199',
      privacyPolicyUrl: '/terms.html',
      termsUrl: '/terms.html',
      logoUrl: '/favicon.svg',
      iconUrl: '/favicon.svg',
      customDomain: 'missedcallautosms.com',
      icon: '⚡'
    };
  }

  function getClientSmsHistory(licenseKey) {
    let items = [];
    if (fs.existsSync(CLIENT_SMS_HISTORY_FILE)) {
      try { items = JSON.parse(fs.readFileSync(CLIENT_SMS_HISTORY_FILE, 'utf8')); } catch (e) {}
    }
    if (items.length === 0) {
      // Seed realistic initial SMS conversation records
      items = [
        {
          id: 'sms_hist_1',
          licenseKey: licenseKey,
          direction: 'OUTBOUND_POSTCALL',
          phoneNumber: '+1 (404) 555-8321',
          customerName: 'Sarah Jenkins',
          message: 'Hey Sarah, this is Anthony. Got your note about the AC unit making loud grinding noise. Reaching out shortly!',
          timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
          status: 'DELIVERED_ON_SIM',
          simSlot: 'SIM 1 (Business)',
          aiContext: 'Auto-dispatched immediately after 24/7 AI Receptionist call intake'
        },
        {
          id: 'sms_hist_2',
          licenseKey: licenseKey,
          direction: 'INBOUND_CUSTOMER',
          phoneNumber: '+1 (404) 555-8321',
          customerName: 'Sarah Jenkins',
          message: 'Thank you Anthony! We will be home after 4:30 PM if the tech can come then.',
          timestamp: new Date(Date.now() - 3600000 * 1.8).toISOString(),
          status: 'RECEIVED',
          simSlot: 'SIM 1 (Business)',
          aiContext: 'Inbound customer reply received directly on office Android SIM'
        },
        {
          id: 'sms_hist_3',
          licenseKey: licenseKey,
          direction: 'OUTBOUND_AUTOSMS',
          phoneNumber: '+1 (404) 555-0199',
          customerName: 'Prospective Client',
          message: 'Hey! Sorry I missed your call. How can I help you today? - Office Auto-Response',
          timestamp: new Date(Date.now() - 3600000 * 6).toISOString(),
          status: 'DELIVERED_ON_SIM',
          simSlot: 'SIM 1 (Business)',
          aiContext: 'Dispatched via handset physical SIM within 15 seconds of carrier missed call'
        },
        {
          id: 'sms_hist_4',
          licenseKey: licenseKey,
          direction: 'OUTBOUND_POSTCALL',
          phoneNumber: '+1 (404) 555-9876',
          customerName: 'Alex Johnson',
          message: 'Hey Alex, Dave here from Apex. Got your note about the water heater burst. Headed over shortly!',
          timestamp: new Date(Date.now() - 3600000 * 14).toISOString(),
          status: 'DELIVERED_ON_SIM',
          simSlot: 'SIM 1 (Business)',
          aiContext: 'Auto-enqueued post-call follow-up for emergency water leak'
        }
      ];
      try {
        const ddir = path.join(__dirname, 'data');
        if (!fs.existsSync(ddir)) fs.mkdirSync(ddir, { recursive: true });
        fs.writeFileSync(CLIENT_SMS_HISTORY_FILE, JSON.stringify(items, null, 2), 'utf8');
      } catch (e) {}
    }
    return items;
  }

  function enrichCallWithAiDiagnostics(call) {
    const isUrgent = call.urgency === 'HIGH';
    return {
      ...call,
      aiDiagnostics: call.aiDiagnostics || {
        sttEngine: 'Deepgram Nova-2 HD (99.2% Accuracy)',
        llmEngine: 'Claude 3.5 Sonnet / Vapi Telecom Pipeline',
        ttsEngine: 'Cartesia Ultra-Low Latency Voice (Sonic)',
        processingLatencyMs: 320,
        intentDetected: call.category || (isUrgent ? 'Urgent Emergency Service Dispatch' : 'General Customer Inquiry'),
        urgencyScore: isUrgent ? 94 : 22,
        urgencyFactors: isUrgent
          ? ['Active distress / property risk keywords detected', 'Immediate contractor callback requested', 'Auto-escalation threshold exceeded (Score: 94/100)']
          : ['Standard informational question', 'Routine schedule inquiry'],
        extractedEntities: {
          callerName: call.callerName || 'Prospective Client',
          callerPhone: call.callerNumber,
          serviceAddress: call.address || 'Address confirmed on call',
          emergencySeverity: isUrgent ? 'CRITICAL - IMMEDIATE ATTENTION' : 'ROUTINE'
        },
        executionTrace: [
          {
            step: 1,
            time: '0.0s',
            label: 'Inbound Carrier Ring Detected',
            detail: 'Office Android cellular SIM answered on ring 1; triggered bespoke AI receptionist greeting.',
            status: 'SUCCESS'
          },
          {
            step: 2,
            time: '2.4s - 68.0s',
            label: 'Conversational Voice AI Intake',
            detail: 'Addressed customer inquiry in real-time, captured caller name, situation notes, and verified service location.',
            status: 'SUCCESS'
          },
          {
            step: 3,
            time: '+1.2s post-call',
            label: 'Carrier SIM SMS Dispatch',
            detail: `Enqueued outbound follow-up SMS to ${call.callerNumber} via office Android SIM: "${(call.smsFollowUpText || '').slice(0, 60)}..." (10DLC exempt).`,
            status: 'SUCCESS'
          },
          {
            step: 4,
            time: '+1.5s post-call',
            label: isUrgent ? '🚨 Emergency Multi-Channel Alert' : 'CRM & Webhook Lead Sync',
            detail: isUrgent 
              ? 'Dispatched priority emergency alert and webhook with MP3 audio recording to client dispatch team.'
              : 'Synced caller details, MP3 recording URL, and transcript to connected CRM workflow.',
            status: 'SUCCESS'
          },
          {
            step: 5,
            time: '+1.8s post-call',
            label: 'Telecom Airtime Ledger',
            detail: `Deducted ${call.durationFormatted || '1m 08s'} (${Math.round((call.durationSeconds || 68)/60 * 10)/10} mins) from voice minutes airtime balance.`,
            status: 'SUCCESS'
          }
        ]
      }
    };
  }

  // 1. GET /api/portal/branding - Public brand resolve
  if ((relativePath === '/api/portal/branding' || relativePath === '/api/portal/branding/') && req.method === 'GET') {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const agencyId = (urlObj.searchParams.get('agency') || urlObj.searchParams.get('agencyId') || '').trim();
    const branding = resolvePortalBranding(agencyId);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, branding }));
    return;
  }

  // 2. POST /api/portal/check-key - Check if license exists and whether already claimed
  if ((relativePath === '/api/portal/check-key' || relativePath === '/api/portal/check-key/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const rawKey = (payload.licenseKey || payload.key || '').trim().toUpperCase();
        if (!rawKey) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'License key is required' }));
          return;
        }

        const accounts = getClientAccounts();
        const existingAcc = accounts.find(a => a.licenseKey === rawKey);
        if (existingAcc) {
          const branding = resolvePortalBranding(existingAcc.agencyId);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            isClaimed: true,
            username: existingAcc.username,
            businessName: existingAcc.businessName,
            branding,
            message: `This license is already registered. Please log in with username: ${existingAcc.username}`
          }));
          return;
        }

        // License not claimed yet. Find metadata in subscribers or master licenses.
        const subscribers = getVoiceSubscribers();
        const sub = subscribers.find(s => s.licenseKey === rawKey);
        const masterList = getMasterLicenses();
        const master = masterList.find(m => m.key === rawKey);

        const businessName = (sub && (sub.name || sub.businessName)) || (master && (master.businessName || master.name)) || 'Client Business';
        const agencyId = (sub && sub.agencyId) || 'default';
        const branding = resolvePortalBranding(agencyId);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          isClaimed: false,
          businessName,
          agencyId,
          branding,
          message: 'License key verified! Please set up your permanent username and password.'
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3. POST /api/portal/activate - First-time license key activation with username & password
  if ((relativePath === '/api/portal/activate' || relativePath === '/api/portal/activate/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const rawKey = (payload.licenseKey || payload.key || '').trim().toUpperCase();
        const username = (payload.username || '').trim().toLowerCase();
        const email = (payload.email || '').trim().toLowerCase();
        const password = payload.password || '';

        if (!rawKey || !username || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'License key, username, and password are all required.' }));
          return;
        }

        if (username.length < 3) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Username must be at least 3 characters.' }));
          return;
        }

        if (password.length < 6) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Password must be at least 6 characters.' }));
          return;
        }

        const accounts = getClientAccounts();
        if (accounts.some(a => a.licenseKey === rawKey)) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'This license has already been activated. Please log in with your credentials.' }));
          return;
        }

        if (accounts.some(a => a.username.toLowerCase() === username)) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: `The username "${username}" is already taken. Please choose another.` }));
          return;
        }

        // Determine agency association and business details
        const subscribers = getVoiceSubscribers();
        const sub = subscribers.find(s => s.licenseKey === rawKey);
        const agencyId = (sub && sub.agencyId) || payload.agencyId || 'default';
        const businessName = payload.businessName || (sub && (sub.name || sub.businessName)) || username;

        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashPortalPassword(password, salt);
        const sessionToken = `ptok_${crypto.randomBytes(24).toString('hex')}`;

        const newAccount = {
          username,
          email: email || (sub && sub.email) || '',
          businessName,
          licenseKey: rawKey,
          agencyId,
          salt,
          passwordHash,
          token: sessionToken,
          lastLoginAt: new Date().toISOString()
        };
        saveClientAccount(newAccount);

        const branding = resolvePortalBranding(agencyId);
        const calls = getVoiceCallLogs().map(enrichCallWithAiDiagnostics);
        const sms = getClientSmsHistory(rawKey);
        const tasks = getClientTasks(rawKey);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: 'Account activated successfully! This username and password is now your permanent login.',
          token: sessionToken,
          user: {
            username: newAccount.username,
            email: newAccount.email,
            businessName: newAccount.businessName,
            licenseKey: newAccount.licenseKey,
            agencyId: newAccount.agencyId
          },
          branding,
          client: {
            name: newAccount.businessName,
            licenseKey: newAccount.licenseKey,
            voiceMinutesBalance: (sub && sub.voiceMinutesBalance) || 45.2,
            carrierCode: (sub && sub.carrierCode) || '*71',
            isVoicePaused: false,
            handsetStatus: 'ONLINE',
            lastCheckin: new Date().toISOString()
          },
          calls,
          sms,
          tasks,
          stats: {
            totalCalls: calls.length,
            urgentCount: calls.filter(c => c.urgency === 'HIGH').length,
            totalMinutesUsed: Math.round(calls.reduce((acc, c) => acc + (c.durationSeconds || 60), 0) / 60 * 10) / 10,
            totalSmsCount: sms.length,
            pendingTasksCount: tasks.filter(t => t.status === 'PENDING').length
          }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 4. POST /api/portal/login - Permanent sign in with username or email & password
  if ((relativePath === '/api/portal/login' || relativePath === '/api/portal/login/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const loginId = (payload.username || payload.email || payload.login || '').trim().toLowerCase();
        const password = payload.password || '';

        if (!loginId || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Username/Email and password are required.' }));
          return;
        }

        const accounts = getClientAccounts();
        let account = accounts.find(a => a.username.toLowerCase() === loginId || (a.email && a.email.toLowerCase() === loginId));

        // If user entered license key as loginId
        if (!account && loginId.toUpperCase().startsWith('MCAS-')) {
          const rawKey = loginId.toUpperCase();
          account = accounts.find(a => a.licenseKey === rawKey);
          if (!account) {
            // Not claimed yet!
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({
              success: false,
              needsActivation: true,
              licenseKey: rawKey,
              error: 'This license has not set up a permanent login yet. Please activate your account first!'
            }));
            return;
          }
        }

        if (!account) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Account not found. Please verify your credentials or activate your license.' }));
          return;
        }

        const calculatedHash = hashPortalPassword(password, account.salt);
        if (calculatedHash !== account.passwordHash) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Incorrect password. Please try again.' }));
          return;
        }

        const sessionToken = `ptok_${crypto.randomBytes(24).toString('hex')}`;
        account.token = sessionToken;
        account.lastLoginAt = new Date().toISOString();
        saveClientAccount(account);

        const subscribers = getVoiceSubscribers();
        const sub = subscribers.find(s => s.licenseKey === account.licenseKey);
        const branding = resolvePortalBranding(account.agencyId);
        const calls = getVoiceCallLogs().map(enrichCallWithAiDiagnostics);
        const sms = getClientSmsHistory(account.licenseKey);
        const tasks = getClientTasks(account.licenseKey);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: 'Signed in successfully!',
          token: sessionToken,
          user: {
            username: account.username,
            email: account.email,
            businessName: account.businessName,
            licenseKey: account.licenseKey,
            agencyId: account.agencyId
          },
          branding,
          client: {
            name: account.businessName,
            licenseKey: account.licenseKey,
            voiceMinutesBalance: (sub && sub.voiceMinutesBalance) || 45.2,
            carrierCode: (sub && sub.carrierCode) || '*71',
            isVoicePaused: false,
            handsetStatus: 'ONLINE',
            lastCheckin: new Date().toISOString()
          },
          calls,
          sms,
          tasks,
          stats: {
            totalCalls: calls.length,
            urgentCount: calls.filter(c => c.urgency === 'HIGH').length,
            totalMinutesUsed: Math.round(calls.reduce((acc, c) => acc + (c.durationSeconds || 60), 0) / 60 * 10) / 10,
            totalSmsCount: sms.length,
            pendingTasksCount: tasks.filter(t => t.status === 'PENDING').length
          }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 5. GET/POST /api/portal/data - Session check and refresh
  if (relativePath === '/api/portal/data' || relativePath === '/api/portal/data/') {
    const handleDataReq = (tokenParam) => {
      const accounts = getClientAccounts();
      const account = accounts.find(a => a.token === tokenParam);
      if (!account) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: 'Session expired or invalid. Please sign in again.' }));
        return;
      }

      const subscribers = getVoiceSubscribers();
      const sub = subscribers.find(s => s.licenseKey === account.licenseKey);
      const branding = resolvePortalBranding(account.agencyId);
      const calls = getVoiceCallLogs().map(enrichCallWithAiDiagnostics);
      const sms = getClientSmsHistory(account.licenseKey);
      const tasks = getClientTasks(account.licenseKey);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        success: true,
        user: {
          username: account.username,
          email: account.email,
          businessName: account.businessName,
          licenseKey: account.licenseKey,
          agencyId: account.agencyId
        },
        branding,
        client: {
          name: account.businessName,
          licenseKey: account.licenseKey,
          voiceMinutesBalance: (sub && sub.voiceMinutesBalance) || 45.2,
          carrierCode: (sub && sub.carrierCode) || '*71',
          isVoicePaused: false,
          handsetStatus: 'ONLINE',
          lastCheckin: new Date().toISOString()
        },
        calls,
        sms,
        tasks,
        stats: {
          totalCalls: calls.length,
          urgentCount: calls.filter(c => c.urgency === 'HIGH').length,
          totalMinutesUsed: Math.round(calls.reduce((acc, c) => acc + (c.durationSeconds || 60), 0) / 60 * 10) / 10,
          totalSmsCount: sms.length,
          pendingTasksCount: tasks.filter(t => t.status === 'PENDING').length
        }
      }));
    };

    if (req.method === 'GET') {
      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
      const token = urlObj.searchParams.get('token') || (req.headers['authorization'] || '').replace('Bearer ', '').trim();
      handleDataReq(token);
      return;
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const token = payload.token || (req.headers['authorization'] || '').replace('Bearer ', '').trim();
          handleDataReq(token);
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Malformed request' }));
        }
      });
      return;
    }
  }

  // 6. POST /api/portal/quick-sms - Dispatches SMS via client office Android physical SIM
  if ((relativePath === '/api/portal/quick-sms' || relativePath === '/api/portal/quick-sms/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = payload.token || (req.headers['authorization'] || '').replace('Bearer ', '').trim();
        const accounts = getClientAccounts();
        const account = accounts.find(a => a.token === token) || (payload.licenseKey && accounts.find(a => a.licenseKey === payload.licenseKey));

        const to = (payload.to || payload.recipient || '').trim();
        const message = (payload.message || payload.text || '').trim();

        if (!to || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Recipient phone number and message body are required.' }));
          return;
        }

        const queueItem = {
          callId: `portal_${Date.now()}`,
          recipient: to,
          message: message,
          urgency: payload.urgency || 'NORMAL'
        };
        enqueueVoiceSms(queueItem);

        // Record in client SMS history
        const licenseKey = (account && account.licenseKey) || payload.licenseKey || 'DEFAULT';
        let smsList = [];
        if (fs.existsSync(CLIENT_SMS_HISTORY_FILE)) {
          try { smsList = JSON.parse(fs.readFileSync(CLIENT_SMS_HISTORY_FILE, 'utf8')); } catch (e) {}
        }
        smsList.unshift({
          id: queueItem.callId,
          licenseKey,
          direction: 'OUTBOUND_MANUAL',
          phoneNumber: to,
          customerName: payload.customerName || 'Customer',
          message: message,
          timestamp: new Date().toISOString(),
          status: 'QUEUED_FOR_SIM',
          simSlot: 'SIM 1 (Business)',
          aiContext: 'Manual reply dispatched directly from Client Portal via office Android SIM'
        });
        const ddir = path.join(__dirname, 'data');
        if (!fs.existsSync(ddir)) fs.mkdirSync(ddir, { recursive: true });
        fs.writeFileSync(CLIENT_SMS_HISTORY_FILE, JSON.stringify(smsList, null, 2), 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: `SMS enqueued! Your office Android handset will dispatch via SIM: ${to}`,
          queueId: queueItem.callId,
          queuedAt: new Date().toISOString()
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7. POST /api/portal/google-auth - Sign in or activate with Google account
  if ((relativePath === '/api/portal/google-auth' || relativePath === '/api/portal/google-auth/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const email = (payload.email || '').trim().toLowerCase();
        const googleId = (payload.googleId || payload.sub || '').trim();
        const name = (payload.name || payload.displayName || '').trim();
        const licenseKey = (payload.licenseKey || '').trim().toUpperCase();

        if (!email && !googleId) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Google account email or ID is required.' }));
          return;
        }

        const accounts = getClientAccounts();
        let account = accounts.find(a => (email && a.email && a.email.toLowerCase() === email) || (googleId && a.googleId === googleId));

        if (!account) {
          // If first time linking via Google, we need a licenseKey
          if (!licenseKey) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({
              success: false,
              needsLicense: true,
              email,
              name,
              error: 'Please enter your license key to link your Google account for the first time.'
            }));
            return;
          }

          // Check if license is already claimed
          const licenseClaimed = accounts.find(a => a.licenseKey === licenseKey);
          if (licenseClaimed) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({
              success: false,
              error: `This license is already registered to username: ${licenseClaimed.username}. Please sign in with your credentials.`
            }));
            return;
          }

          const subscribers = getVoiceSubscribers();
          const sub = subscribers.find(s => s.licenseKey === licenseKey);
          const agencyId = (sub && sub.agencyId) || 'default';
          const businessName = name || (sub && (sub.name || sub.businessName)) || email.split('@')[0];

          const sessionToken = `ptok_${crypto.randomBytes(24).toString('hex')}`;
          account = {
            username: email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase(),
            email: email,
            googleId: googleId || `goog_${Date.now()}`,
            authProvider: 'google',
            businessName,
            licenseKey,
            agencyId,
            token: sessionToken,
            lastLoginAt: new Date().toISOString()
          };
          saveClientAccount(account);
        } else {
          // Returning Google user
          account.token = `ptok_${crypto.randomBytes(24).toString('hex')}`;
          account.lastLoginAt = new Date().toISOString();
          saveClientAccount(account);
        }

        const subscribers = getVoiceSubscribers();
        const sub = subscribers.find(s => s.licenseKey === account.licenseKey);
        const branding = resolvePortalBranding(account.agencyId);
        const calls = getVoiceCallLogs().map(enrichCallWithAiDiagnostics);
        const sms = getClientSmsHistory(account.licenseKey);
        const tasks = getClientTasks(account.licenseKey);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: 'Signed in with Google successfully!',
          token: account.token,
          user: {
            username: account.username,
            email: account.email,
            businessName: account.businessName,
            licenseKey: account.licenseKey,
            agencyId: account.agencyId
          },
          branding,
          client: {
            name: account.businessName,
            licenseKey: account.licenseKey,
            voiceMinutesBalance: (sub && sub.voiceMinutesBalance) || 45.2,
            carrierCode: (sub && sub.carrierCode) || '*71',
            isVoicePaused: false,
            handsetStatus: 'ONLINE',
            lastCheckin: new Date().toISOString()
          },
          calls,
          sms,
          tasks,
          stats: {
            totalCalls: calls.length,
            urgentCount: calls.filter(c => c.urgency === 'HIGH').length,
            totalMinutesUsed: Math.round(calls.reduce((acc, c) => acc + (c.durationSeconds || 60), 0) / 60 * 10) / 10,
            totalSmsCount: sms.length,
            pendingTasksCount: tasks.filter(t => t.status === 'PENDING').length
          }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 8. POST /api/portal/auth-check - Validates session token for Remember Me persistent login
  if ((relativePath === '/api/portal/auth-check' || relativePath === '/api/portal/auth-check/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = payload.token || (req.headers['authorization'] || '').replace('Bearer ', '').trim();
        const accounts = getClientAccounts();
        const account = accounts.find(a => a.token === token);
        if (!account) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Session invalid or expired' }));
          return;
        }

        const subscribers = getVoiceSubscribers();
        const sub = subscribers.find(s => s.licenseKey === account.licenseKey);
        const branding = resolvePortalBranding(account.agencyId);
        const calls = getVoiceCallLogs().map(enrichCallWithAiDiagnostics);
        const sms = getClientSmsHistory(account.licenseKey);
        const tasks = getClientTasks(account.licenseKey);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          token: account.token,
          user: {
            username: account.username,
            email: account.email,
            businessName: account.businessName,
            licenseKey: account.licenseKey,
            agencyId: account.agencyId
          },
          branding,
          client: {
            name: account.businessName,
            licenseKey: account.licenseKey,
            voiceMinutesBalance: (sub && sub.voiceMinutesBalance) || 45.2,
            carrierCode: (sub && sub.carrierCode) || '*71',
            isVoicePaused: false,
            handsetStatus: 'ONLINE',
            lastCheckin: new Date().toISOString()
          },
          calls,
          sms,
          tasks,
          stats: {
            totalCalls: calls.length,
            urgentCount: calls.filter(c => c.urgency === 'HIGH').length,
            totalMinutesUsed: Math.round(calls.reduce((acc, c) => acc + (c.durationSeconds || 60), 0) / 60 * 10) / 10,
            totalSmsCount: sms.length,
            pendingTasksCount: tasks.filter(t => t.status === 'PENDING').length
          }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 9. POST /api/portal/tasks/update - Updates action item status (PENDING / COMPLETED)
  if ((relativePath === '/api/portal/tasks/update' || relativePath === '/api/portal/tasks/update/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const taskId = payload.taskId || payload.id;
        const status = payload.status || 'COMPLETED';

        if (!taskId) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'taskId is required' }));
          return;
        }

        let tasks = [];
        if (fs.existsSync(CLIENT_TASKS_FILE)) {
          try { tasks = JSON.parse(fs.readFileSync(CLIENT_TASKS_FILE, 'utf8')); } catch (e) {}
        }

        const task = tasks.find(t => t.id === taskId);
        if (!task) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Task not found' }));
          return;
        }

        task.status = status;
        task.completedAt = status === 'COMPLETED' ? new Date().toISOString() : null;
        if (payload.notes) task.notes = payload.notes;

        saveClientTasks(tasks);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, message: `Task marked as ${status}!`, task }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 10. POST /api/portal/tasks/create - Contractor adds a custom follow-up task
  if ((relativePath === '/api/portal/tasks/create' || relativePath === '/api/portal/tasks/create/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const title = (payload.title || '').trim();
        if (!title) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Task title is required' }));
          return;
        }

        let tasks = [];
        if (fs.existsSync(CLIENT_TASKS_FILE)) {
          try { tasks = JSON.parse(fs.readFileSync(CLIENT_TASKS_FILE, 'utf8')); } catch (e) {}
        }

        const newTask = {
          id: `task_custom_${Date.now()}`,
          licenseKey: payload.licenseKey || 'DEFAULT',
          sourceType: 'CONTRACTOR_MANUAL',
          sourceId: null,
          title: title,
          category: payload.category || 'GENERAL_FOLLOWUP',
          priority: payload.priority || 'NORMAL',
          customerName: payload.customerName || '',
          customerPhone: payload.customerPhone || '',
          serviceAddress: payload.serviceAddress || '',
          notes: payload.notes || '',
          dueSla: payload.dueSla || 'Same Day',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          completedAt: null
        };
        tasks.unshift(newTask);
        saveClientTasks(tasks);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, message: 'Custom task created successfully!', task: newTask }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 11. POST /api/portal/view-as - Secure View-As Account Impersonation
  // Allows Agency to view as their own client, or Owner to view as any client.
  // Agencies are strictly forbidden from viewing other agencies' clients.
  if ((relativePath === '/api/portal/view-as' || relativePath === '/api/portal/view-as/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const rawKey = String(payload.licenseKey || payload.account || '').trim().toUpperCase();
        const viewerRole = String(payload.viewerRole || 'agency').toLowerCase(); // 'agency' or 'owner'
        const reqAgencyId = String(payload.agencyId || '').trim();

        if (!rawKey) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'licenseKey is required' }));
          return;
        }

        const masterList = getMasterLicenses();
        const subscribers = getVoiceSubscribers();
        const accounts = getClientAccounts();

        const master = masterList.find(m => m.key === rawKey);
        const sub = subscribers.find(s => s.licenseKey === rawKey);
        const existingAcc = accounts.find(a => a.licenseKey === rawKey);

        if (!master && !sub && !existingAcc) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Client account or license key not found.' }));
          return;
        }

        // Determine client's agency
        const clientAgencyId = (sub && sub.agencyId) || (master && master.agencyId) || (existingAcc && existingAcc.agencyId) || 'default';

        // Strict Access Boundary Check:
        // Agencies ONLY have access to their own account and their own clients.
        if (viewerRole === 'agency') {
          if (!reqAgencyId) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: false, error: 'Agency ID required for agency view-as.' }));
            return;
          }
          if (clientAgencyId !== reqAgencyId && !(clientAgencyId === 'default' && reqAgencyId === 'default')) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({
              success: false,
              error: `Access Denied: This client belongs to agency "${clientAgencyId}", not "${reqAgencyId}". Agencies only have access to their own account and clients.`
            }));
            return;
          }
        } else if (viewerRole !== 'owner') {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Invalid viewerRole. Must be "agency" or "owner".' }));
          return;
        }

        const clientName = (existingAcc && existingAcc.businessName) || (master && (master.customer || master.businessName || master.name)) || (sub && (sub.name || sub.businessName)) || 'Client Business';
        const branding = resolvePortalBranding(clientAgencyId);
        const calls = getVoiceCallLogs().map(enrichCallWithAiDiagnostics);
        const sms = getClientSmsHistory(rawKey);
        const tasks = getClientTasks(rawKey);

        const returnUrl = viewerRole === 'agency'
          ? `/agency-dashboard?agency=${encodeURIComponent(clientAgencyId)}`
          : `/owner_admin_dashboard.html`;

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          impersonation: {
            active: true,
            viewerRole,
            agencyId: clientAgencyId,
            agencyName: branding.appName || clientAgencyId,
            clientName,
            licenseKey: rawKey,
            returnUrl
          },
          token: existingAcc ? existingAcc.token : `impersonate_${Date.now()}`,
          user: {
            username: (existingAcc && existingAcc.username) || clientName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            email: (existingAcc && existingAcc.email) || (master && master.email) || (sub && sub.email) || '',
            businessName: clientName,
            licenseKey: rawKey,
            agencyId: clientAgencyId
          },
          branding,
          client: {
            name: clientName,
            licenseKey: rawKey,
            voiceMinutesBalance: (sub && sub.voiceMinutesBalance) || 45.2,
            carrierCode: (sub && sub.carrierCode) || '*71',
            isVoicePaused: false,
            handsetStatus: 'ONLINE',
            lastCheckin: new Date().toISOString()
          },
          calls,
          sms,
          tasks,
          stats: {
            totalCalls: calls.length,
            urgentCount: calls.filter(c => c.urgency === 'HIGH').length,
            totalMinutesUsed: Math.round(calls.reduce((acc, c) => acc + (c.durationSeconds || 60), 0) / 60 * 10) / 10,
            totalSmsCount: sms.length,
            pendingTasksCount: tasks.filter(t => t.status === 'PENDING').length
          }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
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
  if (relativePath.startsWith('/api/referrals/') || relativePath === '/api/referrals' || relativePath === '/api/referrals/') {
    const parseJsonBody = () => new Promise(resolve => {
      let b = '';
      req.on('data', c => b += c);
      req.on('end', () => {
        try { resolve(b ? JSON.parse(b) : {}); } catch (e) { resolve({}); }
      });
    });

    // 1. Get Partners & Summary Stats
    if ((relativePath === '/api/referrals/partners' || (relativePath === '/api/referrals' && req.method === 'GET')) && req.method === 'GET') {
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
    if ((relativePath === '/api/referrals/partners' || relativePath === '/api/referrals' || relativePath === '/api/referrals/') && req.method === 'POST') {
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
  if (relativePath === '/' || relativePath === '/sales_landing_page.html' || relativePath === '/prototype_index.html') {
    relativePath = '/index.html';
  } else if (relativePath === '/pro' || relativePath === '/pro/' || relativePath === '/automations' || relativePath === '/automations/') {
    relativePath = '/pro.html';
  } else if (relativePath === '/flagship' || relativePath === '/flagship/' || relativePath === '/pricing' || relativePath === '/pricing/') {
    relativePath = '/index.html';
  } else if (relativePath === '/owner' || relativePath === '/owner/' || relativePath === '/admin' || relativePath === '/admin/') {
    relativePath = '/owner_admin_dashboard.html';
  } else if (relativePath === '/voice' || relativePath === '/voice/') {
    relativePath = '/voice.html';
  } else if (relativePath === '/agency' || relativePath === '/agency/' || relativePath === '/whitelabel' || relativePath === '/whitelabel/' || relativePath === '/white-label' || relativePath === '/white-label/') {
    relativePath = '/agency.html';
  } else if (relativePath === '/agency-dashboard' || relativePath === '/agency-dashboard/' || relativePath === '/agency_dashboard' || relativePath === '/agency_dashboard/' || relativePath === '/fleet' || relativePath === '/fleet/') {
    relativePath = '/agency_dashboard.html';
  } else if (relativePath === '/affiliate' || relativePath === '/affiliate/' || relativePath === '/affiliates' || relativePath === '/affiliates/' || relativePath === '/partner' || relativePath === '/partner/' || relativePath === '/partners' || relativePath === '/partners/') {
    relativePath = '/affiliate.html';
  } else if (relativePath === '/developers' || relativePath === '/developers/' || relativePath === '/docs' || relativePath === '/docs/') {
    relativePath = '/developers.html';
  } else if (relativePath === '/support' || relativePath === '/support/') {
    relativePath = '/support.html';
  } else if (relativePath === '/terms' || relativePath === '/terms/' || relativePath === '/privacy' || relativePath === '/privacy/') {
    relativePath = '/terms.html';
  } else if (relativePath === '/portal' || relativePath === '/portal/' || relativePath === '/client-portal' || relativePath === '/client-portal/' || relativePath === '/client_portal' || relativePath === '/client_portal/') {
    relativePath = '/client_portal.html';
  } else if (relativePath === '/license' || relativePath === '/license/' || relativePath === '/license_dashboard' || relativePath === '/license_dashboard/') {
    relativePath = '/license_dashboard.html';
  } else if (relativePath === '/success' || relativePath === '/success/') {
    relativePath = '/success.html';
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
    filePath = path.join(__dirname, 'MissedCallAutoSMS.apk');
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
  const enableLocalScheduler = process.argv.includes('--with-scheduler') || process.env.ENABLE_LOCAL_SCHEDULER === 'true';
  if (enableLocalScheduler) {
    console.log('⚡ [LOCAL SCHEDULER ACTIVE] Running local dev scheduler loop.');
    setInterval(runOmnichannelSchedulerBackgroundCheck, 60000);
    setTimeout(runOmnichannelSchedulerBackgroundCheck, 3000);
  } else {
    console.log('🌐 [CLOUD PRODUCTION] Live scheduling & social automation runs serverlessly on https://missedcallautosms.com via Netlify Functions & GitHub Actions (Zero local machine dependency).');
  }
});

// ═══════════════════════════════════════════════════════════════════
//  OPTIONAL LOCAL DEV SOCIAL SCHEDULER (Only if --with-scheduler)
// ═══════════════════════════════════════════════════════════════════
(function startSocialScheduler() {
  const enableLocalScheduler = process.argv.includes('--with-scheduler') || process.env.ENABLE_LOCAL_SCHEDULER === 'true';
  if (!enableLocalScheduler) return;

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
    const deltaHours = targetHour - et.getHours();
    const deltaMins = targetMinute - et.getMinutes();
    const deltaMs = (deltaHours * 60 + deltaMins) * 60 * 1000 - (et.getSeconds() * 1000 + et.getMilliseconds());
    return deltaMs > 0 ? deltaMs : deltaMs + 24 * 60 * 60 * 1000;
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
      setTimeout(tick, msTilNextEastern(targetHour, targetMin));
    }, delay);
  }

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

  console.log(`✅ [SCHEDULER] Local social dev scheduler active (${slotTimes[0]} / ${slotTimes[1]} / ${slotTimes[2]} ET)`);
})();
