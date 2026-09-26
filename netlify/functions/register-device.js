const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let initializeApp, getApps, cert, getFirestore, FieldValue;
try {
  const adminApp = require('firebase-admin/app');
  const adminFs = require('firebase-admin/firestore');
  initializeApp = adminApp.initializeApp;
  getApps = adminApp.getApps;
  cert = adminApp.cert;
  getFirestore = adminFs.getFirestore;
  FieldValue = adminFs.FieldValue;
} catch (e) {
  initializeApp = null;
}

const LICENSE_SECRET = "MCAT_SECRET_PROD_KEY_2026";
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "offgrid-saas-core-1e97a9";
const LOCAL_CACHE_PATH = path.join(__dirname, '../../.device_tokens_cache.json');

// Initialize Firebase Admin safely
let firestoreDb = null;
function initFirestore() {
  if (!initializeApp) return null;
  if (firestoreDb) return firestoreDb;
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
    firestoreDb = getFirestore();
    return firestoreDb;
  } catch (e) {
    console.warn("Firestore init warning (will use local cache fallback):", e.message);
    return null;
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

// Local cache helper
function saveLocalToken(licenseKey, data) {
  try {
    let cache = {};
    if (fs.existsSync(LOCAL_CACHE_PATH)) {
      cache = JSON.parse(fs.readFileSync(LOCAL_CACHE_PATH, 'utf8') || '{}');
    }
    cache[licenseKey] = { ...data, updatedAt: new Date().toISOString() };
    fs.writeFileSync(LOCAL_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.warn("Local token cache save error:", err.message);
  }
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

  const licenseKey = (body.license_key || body.licenseKey || event.headers['x-license-key'] || '').trim().toUpperCase();
  const fcmToken = (body.fcm_token || body.fcmToken || '').trim();
  const deviceId = (body.device_id || body.deviceId || '').trim();
  const appVersion = (body.app_version || body.appVersion || '1.0.0').trim();

  if (!licenseKey || (!fcmToken && !deviceId)) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing license_key, or neither fcm_token nor device_id was provided' })
    };
  }

  // Verify license authenticity
  const auth = verifyLicenseKey(licenseKey);
  if (!auth.valid) {
    return {
      statusCode: 403,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Invalid or expired License Key' })
    };
  }

  const record = {
    license_key: licenseKey,
    fcm_token: fcmToken,
    device_id: deviceId,
    app_version: appVersion,
    is_pro: auth.isPro,
    customer_name: auth.customer || 'Customer',
    timestamp: Date.now()
  };

  // 1. Save to registered_devices & master_licenses via Firestore abstraction if available
  let firestoreSaved = false;
  try {
    const fsModule = require('../../lib/firestore');
    if (fsModule && (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT)) {
      if (deviceId) {
        await fsModule.saveDeviceBinding(licenseKey, deviceId, {
          appVersion,
          fcmToken,
          isPro: auth.isPro
        });
        firestoreSaved = true;
      }
    }
  } catch (fsErr) {
    console.warn("lib/firestore binding notice:", fsErr.message);
  }

  // Also write to device_tokens for backward compatibility with push notifications
  const db = initFirestore();
  if (db && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      await db.collection('device_tokens').doc(licenseKey).set({
        ...record,
        updated_at: FieldValue ? FieldValue.serverTimestamp() : new Date().toISOString()
      }, { merge: true });
      firestoreSaved = true;
      console.log(`✅ [DEVICE REGISTERED] Stored token in Firestore for ${licenseKey}`);
    } catch (e) {
      console.warn("Firestore write failed, using local cache:", e.message);
    }
  }

  // 2. Always persist to local cache as reliable fallback
  saveLocalToken(licenseKey, record);

  // 3. Update data/master_licenses.json if present
  try {
    const masterPath = path.join(__dirname, '../../data/master_licenses.json');
    if (fs.existsSync(masterPath) && deviceId) {
      const list = JSON.parse(fs.readFileSync(masterPath, 'utf8') || '[]');
      const idx = list.findIndex(x => x.key === licenseKey);
      if (idx >= 0) {
        list[idx].deviceId = deviceId;
        fs.writeFileSync(masterPath, JSON.stringify(list, null, 2), 'utf8');
      }
    }
  } catch (e) {}

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      message: 'Device successfully registered with Central Webhook Bridge',
      license_key: licenseKey,
      is_pro: auth.isPro,
      firestore: firestoreSaved
    })
  };
};
