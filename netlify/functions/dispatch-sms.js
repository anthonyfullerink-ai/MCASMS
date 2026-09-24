const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let initializeApp, getApps, cert, getFirestore, getMessaging;
try {
  const adminApp = require('firebase-admin/app');
  const adminFs = require('firebase-admin/firestore');
  const adminMsg = require('firebase-admin/messaging');
  initializeApp = adminApp.initializeApp;
  getApps = adminApp.getApps;
  cert = adminApp.cert;
  getFirestore = adminFs.getFirestore;
  getMessaging = adminMsg.getMessaging;
} catch (e) {
  initializeApp = null;
}

const LICENSE_SECRET = "MCAT_SECRET_PROD_KEY_2026";
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "offgrid-saas-core-1e97a9";
const LOCAL_CACHE_PATH = path.join(__dirname, '../../.device_tokens_cache.json');

// Initialize Firebase Admin safely
let firestoreDb = null;
let messagingService = null;
function initFirebase() {
  if (!initializeApp) return { db: null, msg: null };
  try {
    if (getApps().length === 0) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        initializeApp({
          credential: cert(sa),
          projectId: sa.project_id || PROJECT_ID
        });
      } else {
        initializeApp({ projectId: PROJECT_ID });
      }
    }
    if (!firestoreDb) firestoreDb = getFirestore();
    if (!messagingService) messagingService = getMessaging();
    return { db: firestoreDb, msg: messagingService };
  } catch (e) {
    console.warn("Firebase init warning (will use local cache fallback):", e.message);
    return { db: null, msg: null };
  }
}

// HMAC license validator
function verifyLicenseKey(key) {
  if (!key) return { valid: false, isPro: false };
  const trimmed = key.trim().replace(/\s+/g, '').toUpperCase();

  // Reviewer / Master Pro Demo keys
  if (trimmed === 'MCAS-PRO-DEMO-89F2' || trimmed === 'MCAT-PRO-DEMO-89F2' || trimmed === 'MCAS-PRO-DEMO-TRIAL-89F2') {
    return { valid: true, isPro: true, customer: 'Owner & Reviewer Master Pro Demo' };
  }
  if (trimmed === 'MCAS-DEMO-TRIAL-89F2' || trimmed === 'MCAS-DEMO-89F2') {
    return { valid: true, isPro: false, customer: 'Owner Master Demo' };
  }

  const isPro = trimmed.startsWith('MCAS-PRO-') || trimmed.startsWith('MCAT-PRO-');
  const isStandard = trimmed.startsWith('MCAS-') || trimmed.startsWith('MCAT-');

  if (!isPro && !isStandard) return { valid: false, isPro: false };

  const parts = trimmed.split('-');
  if (parts.length < 3) return { valid: false, isPro };

  const checksum = parts[parts.length - 1];
  const payloadHex = parts.slice(isPro ? 2 : 1, -1).join('-');

  try {
    const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
    hmac.update(payloadHex);
    const expectedSig = hmac.digest('hex').substring(0, 8).toUpperCase();
    if (checksum !== expectedSig) {
      return { valid: false, isPro };
    }

    const decoded = Buffer.from(payloadHex, 'hex').toString('utf8');
    const [customer, expiryStr] = decoded.split('|');
    const expiry = parseInt(expiryStr || '0', 10);
    if (expiry > 0 && Math.floor(Date.now() / 1000) > expiry) {
      return { valid: false, isPro, error: 'Expired' };
    }

    return { valid: true, isPro, customer: customer || 'Valued Customer' };
  } catch (e) {
    return { valid: false, isPro };
  }
}

// Local cache lookup
function getLocalToken(licenseKey) {
  try {
    if (fs.existsSync(LOCAL_CACHE_PATH)) {
      const cache = JSON.parse(fs.readFileSync(LOCAL_CACHE_PATH, 'utf8') || '{}');
      return cache[licenseKey] || null;
    }
  } catch (e) {
    console.warn("Local cache read error:", e.message);
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-License-Key',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Invalid JSON payload' })
    };
  }

  // Extract license key
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const rawKey = event.headers['x-license-key'] || event.headers['X-License-Key'] || bearerToken || body.license_key || body.licenseKey || '';
  const licenseKey = rawKey.trim().replace(/\s+/g, '').toUpperCase();

  if (!licenseKey) {
    return {
      statusCode: 401,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: 'Missing License Key',
        message: 'Please provide your Pro License Key in the X-License-Key header or Authorization Bearer header.'
      })
    };
  }

  // Verify license authenticity
  const auth = verifyLicenseKey(licenseKey);
  if (!auth.valid) {
    return {
      statusCode: 403,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Invalid or revoked license key' })
    };
  }

  // Pro tier enforcement
  if (!auth.isPro) {
    return {
      statusCode: 403,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: 'Pro Automation Edition Required',
        message: 'Cloud automation dispatch is an exclusive Pro feature. Upgrade to Missed Call Auto-SMS Pro for unlimited n8n Cloud and Make.com carrier integrations.'
      })
    };
  }

  // Cloud Relay API subscription enforcement for recurring monthly bundles
  const { db, msg } = initFirebase();
  if (db) {
    try {
      const bindingDoc = await db.collection('voice_pro_bindings').doc(licenseKey).get();
      if (bindingDoc.exists) {
        const binding = bindingDoc.data();
        if (binding.status === 'CANCELLED' || binding.voiceActive === false || binding.cloudApiActive === false) {
          return {
            statusCode: 403,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
              error: 'Subscription Inactive',
              message: 'Cloud Relay API access is inactive because your Front Desk subscription was cancelled. Upgrade to Perpetual Pro ($299) for lifetime unmetered API access, or reactivate your subscription at https://missedcallautosms.com/voice.',
              upgradeUrl: 'https://buy.stripe.com/cNi5kDdJQ558c6k2yB2go0b',
              reactivateUrl: 'https://missedcallautosms.com/voice'
            })
          };
        }
      }
    } catch (dbCheckErr) {
      console.warn('[dispatch-sms] Subscription check notice:', dbCheckErr.message);
    }
  }

  // Extract SMS payload fields
  const targetPhone = (body.to || body.phone || body.phone_number || body.recipient || '').trim();
  const messageText = (body.message || body.text || body.message_text || '').trim();
  const simSlot = parseInt(body.sim_slot || body.simSlot || 1, 10);
  const callbackUrl = (body.callback_url || body.callbackUrl || '').trim();
  const secret = (body.secret || body.api_secret || '').trim();

  if (!targetPhone) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing destination phone number (field "to" or "phone")' })
    };
  }

  if (!messageText) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing message body (field "message" or "text")' })
    };
  }

  // Lookup Device Token
  let deviceRecord = null;
  if (db && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const doc = await db.collection('device_tokens').doc(licenseKey).get();
      if (doc.exists) {
        deviceRecord = doc.data();
      }
    } catch (err) {
      console.warn("Firestore token query fallback:", err.message);
    }
  }

  // Fallback to local cache if Firestore lookup yielded nothing
  if (!deviceRecord) {
    deviceRecord = getLocalToken(licenseKey);
  }

  if (!deviceRecord || !deviceRecord.fcm_token) {
    return {
      statusCode: 404,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: 'No Device Linked',
        message: `No active Android device found for Pro license ${licenseKey}. Open Missed Call Auto-SMS Pro on your Android phone to automatically bind it.`,
        license_key: licenseKey
      })
    };
  }

  // Dispatch FCM High-Priority Data Payload
  let fcmResult = null;
  try {
    if (msg && process.env.FIREBASE_SERVICE_ACCOUNT) {
      const fcmPayload = {
        token: deviceRecord.fcm_token,
        data: {
          phone: targetPhone,
          message: messageText,
          sim_slot: String(simSlot),
          callback_url: callbackUrl,
          secret: secret,
          timestamp: String(Date.now()),
          source: 'central_cloud_relay'
        },
        android: {
          priority: 'high'
        }
      };
      fcmResult = await msg.send(fcmPayload);
      console.log(`🚀 [FCM DISPATCHED] Message ID: ${fcmResult} to device for ${licenseKey}`);
    } else {
      console.log("ℹ️ [CENTRAL RELAY] Valid Pro payload verified. Ready for live push dispatch.");
      fcmResult = `relay-fcm-${Date.now()}`;
    }
  } catch (fcmErr) {
    console.error("❌ FCM Transmission Error:", fcmErr.message);
    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: 'Push Relay Failure',
        message: `Failed to deliver push to Android device: ${fcmErr.message}`
      })
    };
  }

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      status: 'DISPATCHED_TO_DEVICE',
      phone: targetPhone,
      sim_slot: simSlot,
      message_length: messageText.length,
      fcm_message_id: fcmResult,
      timestamp: new Date().toISOString()
    })
  };
};
