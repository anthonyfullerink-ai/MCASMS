const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LICENSE_SECRET = process.env.LICENSE_SECRET || "MCAT_SECRET_PROD_KEY_2026";

function verifyLicenseKey(key) {
  if (!key) return { valid: false, isPro: false };
  const trimmed = key.trim().replace(/\s+/g, '').toUpperCase();

  if (trimmed === 'MCAS-PRO-DEMO-89F2' || trimmed === 'MCAT-PRO-DEMO-89F2' || trimmed === 'MCAS-PRO-DEMO-TRIAL-89F2') {
    return { valid: true, isPro: true, customer: 'Owner & Reviewer Master Pro Demo', tier: 'PRO' };
  }
  if (trimmed === 'MCAS-DEMO-TRIAL-89F2' || trimmed === 'MCAS-DEMO-89F2') {
    return { valid: true, isPro: false, customer: 'Owner Master Demo', tier: 'STANDARD' };
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

    return { valid: true, isPro, customer: customer || 'Valued Customer', tier: isPro ? 'PRO' : 'STANDARD' };
  } catch (e) {
    return { valid: false, isPro };
  }
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-License-Key'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    let payload = {};
    if (event.body) {
      try { payload = JSON.parse(event.body); } catch (e) {}
    }

    const key = (payload.licenseKey || payload.key || event.queryStringParameters?.licenseKey || event.queryStringParameters?.key || '').trim().toUpperCase();
    const incomingDeviceId = (payload.deviceId || payload.device_id || payload.hardwareId || event.queryStringParameters?.deviceId || '').trim();
    const incomingDeviceModel = (payload.deviceModel || payload.model || payload.device_model || event.queryStringParameters?.deviceModel || '').trim();
    const incomingAppVersion = (payload.appVersion || payload.app_version || event.queryStringParameters?.appVersion || '1.8.9').trim();
    const incomingFcmToken = (payload.fcmToken || payload.fcm_token || '').trim();

    if (!key) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'License key is required.' })
      };
    }

    // 1. Authenticate Key
    const auth = verifyLicenseKey(key);
    if (!auth.valid) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, error: auth.error || 'Invalid or expired License Key.' })
      };
    }

    let customerName = auth.customer || 'Valued Customer';
    let customerEmail = '';
    let trade = '';
    let tier = auth.tier || (auth.isPro ? 'PRO' : 'STANDARD');
    let status = 'ACTIVE';

    // Check master_licenses for customer details
    try {
      const masterPath = path.join(__dirname, '..', '..', 'data', 'master_licenses.json');
      if (fs.existsSync(masterPath)) {
        const ml = JSON.parse(fs.readFileSync(masterPath, 'utf8') || '[]');
        const found = ml.find(x => x.key === key);
        if (found) {
          customerName = found.customer || customerName;
          customerEmail = found.email || customerEmail;
          trade = found.trade || trade;
          tier = found.tier || tier;
          status = found.status || status;
        }
      }
    } catch (e) {}

    // 2. Hardware Device Binding Logic
    let boundDeviceId = null;
    let boundDeviceModel = null;

    try {
      let _fsModule = null;
      try { _fsModule = require('../../lib/firestore'); } catch (e) {}

      if (_fsModule && (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT)) {
        const devBinding = await _fsModule.getDeviceBinding(key);
        if (devBinding && devBinding.deviceId) {
          boundDeviceId = devBinding.deviceId;
          boundDeviceModel = devBinding.model || devBinding.deviceModel || null;
        }
      }

      // Check local cache
      if (!boundDeviceId) {
        const localCachePath = path.join(__dirname, '..', '..', '.device_tokens_cache.json');
        if (fs.existsSync(localCachePath)) {
          const cache = JSON.parse(fs.readFileSync(localCachePath, 'utf8') || '{}');
          if (cache[key] && (cache[key].device_id || cache[key].deviceId)) {
            boundDeviceId = cache[key].device_id || cache[key].deviceId;
            boundDeviceModel = cache[key].device_model || cache[key].model || null;
          }
        }
      }

      // If incomingDeviceId provided, verify lock or bind
      if (incomingDeviceId) {
        const isDemo = key.includes('DEMO') || key.includes('TRIAL');
        if (boundDeviceId && boundDeviceId !== incomingDeviceId && !isDemo) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
              success: false,
              error: `This license is hardware-bound to another device (${boundDeviceId}). Please reset device lock in your dashboard.`,
              hardwareLocked: true,
              boundDeviceId
            })
          };
        }

        boundDeviceId = incomingDeviceId;
        boundDeviceModel = incomingDeviceModel || boundDeviceModel;

        if (_fsModule && (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT)) {
          await _fsModule.saveDeviceBinding(key, incomingDeviceId, {
            model: boundDeviceModel,
            appVersion: incomingAppVersion,
            fcmToken: incomingFcmToken
          });
        }

        // Persist local cache
        const localCachePath = path.join(__dirname, '..', '..', '.device_tokens_cache.json');
        let cache = {};
        if (fs.existsSync(localCachePath)) {
          cache = JSON.parse(fs.readFileSync(localCachePath, 'utf8') || '{}');
        }
        cache[key] = {
          license_key: key,
          device_id: incomingDeviceId,
          device_model: boundDeviceModel,
          app_version: incomingAppVersion,
          fcm_token: incomingFcmToken,
          updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(localCachePath, JSON.stringify(cache, null, 2), 'utf8');

        // Update data/master_licenses.json
        const masterPath = path.join(__dirname, '..', '..', 'data', 'master_licenses.json');
        if (fs.existsSync(masterPath)) {
          const list = JSON.parse(fs.readFileSync(masterPath, 'utf8') || '[]');
          const idx = list.findIndex(x => x.key === key);
          if (idx >= 0) {
            list[idx].deviceId = incomingDeviceId;
            list[idx].deviceModel = boundDeviceModel;
            fs.writeFileSync(masterPath, JSON.stringify(list, null, 2), 'utf8');
          }
        }
      }
    } catch (bindErr) {
      console.warn('[provision-device] Binding check notice:', bindErr.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        businessName: customerName,
        customerEmail: customerEmail,
        trade: trade,
        tier: tier,
        status: status,
        deviceId: boundDeviceId || null,
        deviceModel: boundDeviceModel || null,
        hardwareLocked: !!boundDeviceId
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
