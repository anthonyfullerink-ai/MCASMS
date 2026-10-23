exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    let payload = {};
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      payload = {};
    }

    const licenseKey = (payload.licenseKey || '').trim().toUpperCase();
    if (!licenseKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Please provide a valid License Key (e.g. MCAS-XXXX-XXXX).' })
      };
    }

    // Capture old device token before clearing so we can send the remote unbind push
    let previousToken = null;
    const path = require('path');
    const fs = require('fs');
    const localCachePath = path.join(__dirname, '../../.device_tokens_cache.json');
    if (fs.existsSync(localCachePath)) {
      try {
        const cache = JSON.parse(fs.readFileSync(localCachePath, 'utf8') || '{}');
        if (cache[licenseKey]) {
          previousToken = cache[licenseKey].fcm_token || null;
        }
      } catch (e) {}
    }

    // 1. Clear Firestore device binding & master_licenses doc deviceId
    try {
      const fsModule = require('../../lib/firestore');
      if (fsModule && (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT)) {
        const devDoc = await fsModule.getDeviceBinding(licenseKey);
        if (devDoc && !previousToken) {
          previousToken = devDoc.fcmToken || devDoc.fcm_token || null;
        }
        await fsModule.clearDeviceBinding(licenseKey);
      }
    } catch (fsErr) {
      console.warn('[reset-device] Firestore clear notice:', fsErr.message);
    }

    // Broadcast remote unbind push to previous phone so it wipes license and locks immediately
    if (previousToken) {
      try {
        let adminApp = null, adminMsg = null;
        try {
          adminApp = require('firebase-admin/app');
          adminMsg = require('firebase-admin/messaging');
        } catch (e) {}

        if (adminApp && adminMsg && (process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) {
          const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
          if (adminApp.getApps().length === 0) {
            const sa = JSON.parse(saRaw);
            adminApp.initializeApp({
              credential: adminApp.cert(sa),
              projectId: sa.project_id || 'offgrid-saas-core-1e97a9'
            });
          }
          const messaging = adminMsg.getMessaging();
          await messaging.send({
            token: previousToken,
            data: {
              type: 'device_unbound',
              action: 'revoke_device_binding',
              licenseKey: licenseKey,
              timestamp: String(Date.now()),
              reason: 'Hardware device binding was reset in the dashboard.'
            },
            android: { priority: 'high' }
          });
          console.log(`🔒 [REMOTE DEVICE REVOKE SENT] Broadcast unbind to old token for ${licenseKey}`);
        }
      } catch (pushErr) {
        console.warn('[reset-device] Remote unbind push notice:', pushErr.message);
      }
    }

    // 2. Clear from local .device_tokens_cache.json
    try {
      if (fs.existsSync(localCachePath)) {
        const cache = JSON.parse(fs.readFileSync(localCachePath, 'utf8') || '{}');
        if (cache[licenseKey]) {
          delete cache[licenseKey];
          fs.writeFileSync(localCachePath, JSON.stringify(cache, null, 2), 'utf8');
        }
      }
      // Clear from data/master_licenses.json
      const masterPath = path.join(__dirname, '../../data/master_licenses.json');
      if (fs.existsSync(masterPath)) {
        const list = JSON.parse(fs.readFileSync(masterPath, 'utf8') || '[]');
        const idx = list.findIndex(x => x.key === licenseKey);
        if (idx >= 0) {
          list[idx].deviceId = null;
          list[idx].deviceModel = null;
          fs.writeFileSync(masterPath, JSON.stringify(list, null, 2), 'utf8');
        }
      }
    } catch (cacheErr) {
      console.warn('[reset-device] Local cache clear notice:', cacheErr.message);
    }

    // Check if there is an active Voice Pro binding for this key
    let voiceSubscriptionActive = false;
    let voiceDetails = null;
    try {
      const voiceBindingsPath = path.join(__dirname, '../../.voice_pro_bindings.json');
      if (fs.existsSync(voiceBindingsPath)) {
        const bindings = JSON.parse(fs.readFileSync(voiceBindingsPath, 'utf8'));
        if (bindings[licenseKey] && bindings[licenseKey].status === 'ACTIVE') {
          voiceSubscriptionActive = true;
          voiceDetails = bindings[licenseKey];
        }
      }
    } catch (e) {}

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Hardware device binding reset successfully for key ${licenseKey}. You can now register a new Android phone.${voiceSubscriptionActive ? ' Your bound 24/7 AI Voice Receptionist subscription remains active and will carry over automatically.' : ''}`,
        licenseKey: licenseKey,
        deviceId: null,
        voiceSubscriptionActive: voiceSubscriptionActive,
        forwardingNumber: voiceDetails ? voiceDetails.forwardingNumber : null
      })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: e.message })
    };
  }
};
