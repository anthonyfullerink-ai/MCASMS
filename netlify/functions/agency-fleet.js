const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LICENSE_SECRET = "MCAT_SECRET_PROD_KEY_2026";
const FLEET_CACHE_PATH = path.join(__dirname, '../../.agency_fleet_cache.json');
const DEVICE_CACHE_PATH = path.join(__dirname, '../../.device_tokens_cache.json');

// Initialize / Load Local Cache
function loadFleetCache() {
  try {
    if (fs.existsSync(FLEET_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(FLEET_CACHE_PATH, 'utf8'));
    }
  } catch (e) {
    console.warn("Could not read fleet cache:", e.message);
  }
  return {};
}

function saveFleetCache(cache) {
  try {
    fs.writeFileSync(FLEET_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.warn("Could not save fleet cache:", e.message);
  }
}

// Generate Child Pro License Key for Client
function generateChildProKey(clientName) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadStr = `${clientName || 'Valued Client'}|0|${timestamp}`;
  const payloadHex = Buffer.from(payloadStr, 'utf-8').toString('hex').toUpperCase();

  const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
  hmac.update(payloadHex);
  const sigShort = hmac.digest('hex').substring(0, 8).toUpperCase();

  return `MCAS-PRO-${payloadHex}-${sigShort}`;
}

// Validate Master Agency License Key
function verifyAgencyKey(key) {
  if (!key) return { valid: false };
  const trimmed = key.trim().replace(/\s+/g, '').toUpperCase();

  // Master Reviewer / Demo Keys
  if (trimmed === 'MCAS-AGENCY-DEMO-89F2' || trimmed === 'MCAS-AGENCY-5-DEMO-89F2') {
    return {
      valid: true,
      agencyName: 'Offgrid Media Demo Agency',
      quota: 5,
      tier: 'agency_5',
      masterKey: trimmed
    };
  }
  if (trimmed === 'MCAS-AGENCY-10-DEMO-89F2' || trimmed === 'MCAS-AGENCY-PRO-DEMO-89F2') {
    return {
      valid: true,
      agencyName: 'Offgrid Media Fleet Agency',
      quota: 10,
      tier: 'agency_10',
      masterKey: trimmed
    };
  }

  // Cryptographic Agency Key Verification
  // Format: MCAS-AGENCY-{5|10}-{payloadHex}-{sig}
  const match = trimmed.match(/^MCAS-AGENCY-(5|10)-([0-9A-F]+)-([0-9A-F]{8})$/);
  if (!match) {
    // Fallback: MCAS-AGENCY-[0-9A-F]+-[0-9A-F]{8}
    const matchSimple = trimmed.match(/^MCAS-AGENCY-([0-9A-F]+)-([0-9A-F]{8})$/);
    if (!matchSimple) return { valid: false };

    const payloadHex = matchSimple[1];
    const expectedSig = matchSimple[2];
    const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
    hmac.update(payloadHex);
    const calculatedSig = hmac.digest('hex').substring(0, 8).toUpperCase();

    if (calculatedSig !== expectedSig) return { valid: false };

    try {
      const payloadStr = Buffer.from(payloadHex, 'hex').toString('utf8');
      const parts = payloadStr.split('|');
      const agencyName = parts[0] || 'Agency Partner';
      const quota = parseInt(parts[1] || '5', 10);
      return {
        valid: true,
        agencyName,
        quota,
        tier: quota >= 10 ? 'agency_10' : 'agency_5',
        masterKey: trimmed
      };
    } catch (e) {
      return { valid: false };
    }
  }

  const quota = parseInt(match[1], 10);
  const payloadHex = match[2];
  const expectedSig = match[3];

  const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
  hmac.update(payloadHex);
  const calculatedSig = hmac.digest('hex').substring(0, 8).toUpperCase();

  if (calculatedSig !== expectedSig) return { valid: false };

  try {
    const payloadStr = Buffer.from(payloadHex, 'hex').toString('utf8');
    const parts = payloadStr.split('|');
    const agencyName = parts[0] || 'Agency Partner';
    return {
      valid: true,
      agencyName,
      quota,
      tier: quota >= 10 ? 'agency_10' : 'agency_5',
      masterKey: trimmed
    };
  } catch (e) {
    return { valid: false };
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Agency-Key, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON payload' }) };
    }
  }

  const agencyKey = (event.headers['x-agency-key'] || event.headers['authorization'] || body.agencyKey || '').replace(/^Bearer\s+/i, '').trim();
  const auth = verifyAgencyKey(agencyKey);

  if (!auth.valid) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Invalid or unauthorized Agency Master Key' })
    };
  }

  const fleetCache = loadFleetCache();
  const agencyId = auth.masterKey;
  if (!fleetCache[agencyId]) {
    fleetCache[agencyId] = {
      agencyName: auth.agencyName,
      quota: auth.quota,
      tier: auth.tier,
      createdAt: new Date().toISOString(),
      clients: []
    };
    saveFleetCache(fleetCache);
  }

  const agencyRecord = fleetCache[agencyId];
  const action = body.action || (event.httpMethod === 'GET' ? 'get_fleet' : 'auth');

  // Action: AUTH & GET_FLEET
  if (action === 'auth' || action === 'get_fleet') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        agencyName: agencyRecord.agencyName,
        tier: agencyRecord.tier,
        quota: agencyRecord.quota,
        usedSeats: agencyRecord.clients.length,
        remainingSeats: Math.max(0, agencyRecord.quota - agencyRecord.clients.length),
        clients: agencyRecord.clients
      })
    };
  }

  // Action: ISSUE CLIENT KEY
  if (action === 'issue_key') {
    const clientName = (body.clientName || '').trim();
    const clientContact = (body.clientContact || '').trim();
    const clientNotes = (body.clientNotes || '').trim();

    if (!clientName) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Client business name is required' }) };
    }

    if (agencyRecord.clients.length >= agencyRecord.quota) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          error: `Fleet quota reached (${agencyRecord.clients.length}/${agencyRecord.quota} seats deployed). Upgrade to 10-Pack or add additional seats.`
        })
      };
    }

    const childProKey = generateChildProKey(clientName);
    const newClient = {
      id: 'client_' + crypto.randomBytes(6).toString('hex'),
      clientName,
      clientContact,
      clientNotes,
      licenseKey: childProKey,
      status: 'PENDING_ACTIVATION',
      hardwareId: null,
      issuedAt: new Date().toISOString(),
      lastSeen: null
    };

    agencyRecord.clients.push(newClient);
    saveFleetCache(fleetCache);

    const setupSheet = `=====================================================
MISSED CALL AUTO SMS - CLIENT APPLIANCE SETUP SHEET
Client: ${clientName}
Assigned Pro License Key: ${childProKey}
=====================================================

1. Download the Android APK to the dedicated office phone:
   https://missedcallautosms.com/MissedCallAutoSMS-Pro.apk

2. Open the app, paste the Pro License Key above, and grant permissions.

3. Turn ON "Master Appliance". Your phone is now an automated SMS Gateway!
   • 100% Cellular Delivery via physical SIM
   • Zero A2P 10DLC registration required
   • Connects to your CRM or n8n workflows
=====================================================`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        client: newClient,
        setupSheet,
        usedSeats: agencyRecord.clients.length,
        remainingSeats: agencyRecord.quota - agencyRecord.clients.length
      })
    };
  }

  // Action: RESET HARDWARE BINDING
  if (action === 'reset_device') {
    const keyToReset = (body.licenseKey || '').trim();
    if (!keyToReset) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'licenseKey is required to reset binding' }) };
    }

    const targetClient = agencyRecord.clients.find(c => c.licenseKey === keyToReset);
    if (!targetClient) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Client license key not found in your fleet' }) };
    }

    targetClient.hardwareId = null;
    targetClient.status = 'PENDING_ACTIVATION';
    saveFleetCache(fleetCache);

    // Also clear from device tokens cache if present
    try {
      if (fs.existsSync(DEVICE_CACHE_PATH)) {
        const devCache = JSON.parse(fs.readFileSync(DEVICE_CACHE_PATH, 'utf8'));
        if (devCache[keyToReset]) {
          delete devCache[keyToReset];
          fs.writeFileSync(DEVICE_CACHE_PATH, JSON.stringify(devCache, null, 2), 'utf8');
        }
      }
    } catch (e) {
      console.warn("Could not clear device token cache:", e.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Hardware lock cleared for ${targetClient.clientName}. The client can now bind to any new Android handset.`
      })
    };
  }

  // Action: REVOKE / DELETE SEAT
  if (action === 'revoke_key') {
    const keyToRevoke = (body.licenseKey || '').trim();
    const initialCount = agencyRecord.clients.length;
    agencyRecord.clients = agencyRecord.clients.filter(c => c.licenseKey !== keyToRevoke);

    if (agencyRecord.clients.length === initialCount) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'License key not found in your fleet' }) };
    }

    saveFleetCache(fleetCache);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Client license revoked. Seat has been freed for a new client deployment.',
        usedSeats: agencyRecord.clients.length,
        remainingSeats: agencyRecord.quota - agencyRecord.clients.length
      })
    };
  }

  return {
    statusCode: 400,
    headers,
    body: JSON.stringify({ error: `Unknown action: ${action}` })
  };
};
