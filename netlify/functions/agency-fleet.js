const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LICENSE_SECRET = "MCAT_SECRET_PROD_KEY_2026";
const FLEET_CACHE_PATH = path.join(__dirname, '../../.agency_fleet_cache.json');
const DEVICE_CACHE_PATH = path.join(__dirname, '../../.device_tokens_cache.json');

// ─── Agency Tier Config ──────────────────────────────────────────────────────
const TIER_CONFIG = {
  agency_5:         { quota: 5,  voiceMinsPool: 1250, monthlyPrice: 349,  overageRatePerMin: 0.20 },
  agency_10:        { quota: 10, voiceMinsPool: 2500, monthlyPrice: 649,  overageRatePerMin: 0.20 },
  agency_enterprise:{ quota: 999,voiceMinsPool: 9999, monthlyPrice: 1500, overageRatePerMin: 0.15 },
};

// ─── Fleet Cache (local flat-file, Firestore mirror when available) ──────────
function loadFleetCache() {
  try {
    if (fs.existsSync(FLEET_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(FLEET_CACHE_PATH, 'utf8'));
    }
  } catch (e) {
    console.warn("[FleetCache] Read error:", e.message);
  }
  return {};
}

function saveFleetCache(cache) {
  try {
    fs.writeFileSync(FLEET_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.warn("[FleetCache] Write error:", e.message);
  }
  // Async Firestore mirror (non-blocking, fail-safe)
  try {
    const fdb = getFirestoreDb();
    if (fdb && fdb.saveAgencyFleet) {
      fdb.saveAgencyFleet(cache).catch(e =>
        console.warn('[Firestore] agencyFleet mirror error:', e.message)
      );
    }
  } catch (e) {}
}

// Lazy-load Firestore (same pattern as server.js)
function getFirestoreDb() {
  try {
    return require(path.join(__dirname, '../../lib/firestore'));
  } catch (e) {
    return null;
  }
}

// ─── Child Pro Key Generation (with agencyId attribution) ────────────────────
function generateChildProKey(clientName, agencyKeyHash) {
  const timestamp = Math.floor(Date.now() / 1000);
  // 4-segment payload: clientName|expiry|issuedAt|agencyId
  // Backward-compatible: LicenseManager.kt reads first 3 segments; 4th is server-side only
  const agencyId = agencyKeyHash ? agencyKeyHash.substring(0, 8).toUpperCase() : 'AGENCY00';
  const payloadStr = `${clientName || 'Valued Client'}|0|${timestamp}|${agencyId}`;
  const payloadHex = Buffer.from(payloadStr, 'utf-8').toString('hex').toUpperCase();

  const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
  hmac.update(payloadHex);
  const sigShort = hmac.digest('hex').substring(0, 8).toUpperCase();

  return `MCAS-PRO-${payloadHex}-${sigShort}`;
}

// ─── Agency Key Verification ─────────────────────────────────────────────────
function verifyAgencyKey(key) {
  if (!key) return { valid: false };
  const trimmed = key.trim().replace(/\s+/g, '').toUpperCase();

  // Demo keys
  if (trimmed === 'MCAS-AGENCY-DEMO-89F2' || trimmed === 'MCAS-AGENCY-5-DEMO-89F2') {
    return { valid: true, agencyName: 'Offgrid Media Demo Agency', quota: 5, tier: 'agency_5', masterKey: trimmed };
  }
  if (trimmed === 'MCAS-AGENCY-10-DEMO-89F2' || trimmed === 'MCAS-AGENCY-PRO-DEMO-89F2') {
    return { valid: true, agencyName: 'Offgrid Media Fleet Agency', quota: 10, tier: 'agency_10', masterKey: trimmed };
  }
  if (trimmed === 'MCAS-AGENCY-ENT-DEMO-89F2') {
    return { valid: true, agencyName: 'Enterprise Demo Agency', quota: 999, tier: 'agency_enterprise', masterKey: trimmed };
  }

  // Format: MCAS-AGENCY-{5|10|ENT}-{payloadHex}-{sig}
  const match = trimmed.match(/^MCAS-AGENCY-(5|10|ENT)-([0-9A-F]+)-([0-9A-F]{8})$/);
  if (!match) {
    // Fallback simple: MCAS-AGENCY-{hex}-{sig}
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
      return { valid: true, agencyName, quota, tier: quota >= 999 ? 'agency_enterprise' : quota >= 10 ? 'agency_10' : 'agency_5', masterKey: trimmed };
    } catch (e) { return { valid: false }; }
  }

  const tierCode = match[1];
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
    const tierMap = { '5': 'agency_5', '10': 'agency_10', 'ENT': 'agency_enterprise' };
    const tier = tierMap[tierCode] || 'agency_5';
    const quota = TIER_CONFIG[tier]?.quota ?? 5;
    return { valid: true, agencyName, quota, tier, masterKey: trimmed };
  } catch (e) { return { valid: false }; }
}

// ─── Key hash for agencyId attribution ───────────────────────────────────────
function hashAgencyKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16).toUpperCase();
}

// ─── Upgrade URL helper ───────────────────────────────────────────────────────
function getUpgradeUrl(currentTier) {
  if (currentTier === 'agency_5') return 'https://missedcallautosms.com/agency#pricing';
  if (currentTier === 'agency_10') return 'https://missedcallautosms.com/agency#pricing';
  return 'mailto:contactus@offgridmediagroup.com?subject=Enterprise Fleet Upgrade';
}

// ─── Setup Sheet Generator ────────────────────────────────────────────────────
function buildSetupSheet(clientName, childProKey, branding) {
  const brand = branding?.brandName || 'Missed Call Auto SMS';
  const supportEmail = branding?.supportEmail || 'support@missedcallautosms.com';
  const downloadUrl = 'https://missedcallautosms.com/MissedCallAutoSMS-Pro.apk';

  return `=====================================================
${brand.toUpperCase()} - CLIENT APPLIANCE SETUP SHEET
Client: ${clientName}
Assigned Pro License Key: ${childProKey}
=====================================================

1. Download the Android APK to the dedicated office phone:
   ${downloadUrl}

2. Open the app, paste the Pro License Key above, and grant permissions.

3. Turn ON "Master Appliance". Your phone is now an automated SMS Gateway!
   • 100% Cellular Delivery via physical SIM
   • Zero A2P 10DLC registration required
   • AI Voice Receptionist active on missed calls
   • Connects to your CRM or n8n workflows

4. Questions? Contact your account manager: ${supportEmail}
=====================================================`;
}

// ─── Main Netlify Handler ─────────────────────────────────────────────────────
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
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or unauthorized Agency Master Key' }) };
  }

  const fleetCache = loadFleetCache();
  const agencyId = auth.masterKey;
  const tierCfg = TIER_CONFIG[auth.tier] || TIER_CONFIG['agency_5'];

  if (!fleetCache[agencyId]) {
    fleetCache[agencyId] = {
      agencyName: auth.agencyName,
      quota: tierCfg.quota,
      tier: auth.tier,
      voiceMinsPool: tierCfg.voiceMinsPool,
      overageRatePerMin: tierCfg.overageRatePerMin,
      createdAt: new Date().toISOString(),
      clients: [],
      branding: null
    };
    saveFleetCache(fleetCache);
  }

  const agencyRecord = fleetCache[agencyId];
  // Sync tier config in case plan was upgraded
  agencyRecord.quota = tierCfg.quota;
  agencyRecord.voiceMinsPool = tierCfg.voiceMinsPool;
  agencyRecord.tier = auth.tier;

  const action = body.action || (event.httpMethod === 'GET' ? 'get_fleet' : 'auth');

  // ── GET_FLEET / AUTH ───────────────────────────────────────────────────────
  if (action === 'auth' || action === 'get_fleet') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        agencyName: agencyRecord.agencyName,
        tier: agencyRecord.tier,
        quota: agencyRecord.quota,
        voiceMinsPool: agencyRecord.voiceMinsPool,
        overageRatePerMin: agencyRecord.overageRatePerMin,
        usedSeats: agencyRecord.clients.length,
        remainingSeats: Math.max(0, agencyRecord.quota - agencyRecord.clients.length),
        clients: agencyRecord.clients,
        branding: agencyRecord.branding || null,
        upgradeUrl: getUpgradeUrl(agencyRecord.tier)
      })
    };
  }

  // ── ISSUE CLIENT KEY ───────────────────────────────────────────────────────
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
          error: 'QUOTA_EXCEEDED',
          message: `All ${agencyRecord.quota} seats are deployed. Upgrade your plan to add more clients.`,
          usedSeats: agencyRecord.clients.length,
          quota: agencyRecord.quota,
          upgradeUrl: getUpgradeUrl(agencyRecord.tier)
        })
      };
    }

    const agencyKeyHash = hashAgencyKey(agencyId);
    const childProKey = generateChildProKey(clientName, agencyKeyHash);
    const newClient = {
      id: 'client_' + crypto.randomBytes(6).toString('hex'),
      clientName,
      clientContact,
      clientNotes,
      licenseKey: childProKey,
      agencyId: agencyKeyHash, // attribution back to this agency
      status: 'PENDING_ACTIVATION',
      hardwareId: null,
      voiceMinsUsed: 0,
      issuedAt: new Date().toISOString(),
      lastSeen: null
    };

    agencyRecord.clients.push(newClient);
    saveFleetCache(fleetCache);

    const setupSheet = buildSetupSheet(clientName, childProKey, agencyRecord.branding);

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

  // ── GET VOICE USAGE (per-client + fleet totals) ────────────────────────────
  if (action === 'get_usage') {
    // Pull voiceMinsUsed from each client record (updated by vapi webhook or server.js)
    let totalUsed = 0;
    const clientUsage = agencyRecord.clients.map(c => {
      const used = c.voiceMinsUsed || 0;
      totalUsed += used;
      return { id: c.id, clientName: c.clientName, voiceMinsUsed: used };
    });

    const voiceMinsPool = agencyRecord.voiceMinsPool;
    const overageMinutes = Math.max(0, totalUsed - voiceMinsPool);
    const overageAmount = parseFloat((overageMinutes * agencyRecord.overageRatePerMin).toFixed(2));
    const percentUsed = voiceMinsPool > 0 ? Math.round((totalUsed / voiceMinsPool) * 100) : 0;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        voiceMinsPool,
        totalUsed,
        overageMinutes,
        overageAmount,
        overageRatePerMin: agencyRecord.overageRatePerMin,
        percentUsed,
        alertLevel: percentUsed >= 100 ? 'OVERAGE' : percentUsed >= 85 ? 'WARNING' : 'OK',
        clientUsage
      })
    };
  }

  // ── SAVE BRANDING (Enterprise White-Label) ─────────────────────────────────
  if (action === 'save_branding') {
    if (agencyRecord.tier !== 'agency_enterprise') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'White-label branding is available on the Enterprise plan only.', upgradeUrl: getUpgradeUrl(agencyRecord.tier) })
      };
    }
    agencyRecord.branding = {
      brandName: (body.brandName || '').trim() || agencyRecord.agencyName,
      logoUrl: (body.logoUrl || '').trim(),
      accentColor: (body.accentColor || '#38BDF8').trim(),
      supportEmail: (body.supportEmail || '').trim()
    };
    saveFleetCache(fleetCache);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, branding: agencyRecord.branding }) };
  }

  // ── GET BRANDING ───────────────────────────────────────────────────────────
  if (action === 'get_branding') {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, branding: agencyRecord.branding || null, isEnterprise: agencyRecord.tier === 'agency_enterprise' }) };
  }

  // ── RESET HARDWARE BINDING ─────────────────────────────────────────────────
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

    try {
      if (fs.existsSync(DEVICE_CACHE_PATH)) {
        const devCache = JSON.parse(fs.readFileSync(DEVICE_CACHE_PATH, 'utf8'));
        if (devCache[keyToReset]) {
          delete devCache[keyToReset];
          fs.writeFileSync(DEVICE_CACHE_PATH, JSON.stringify(devCache, null, 2), 'utf8');
        }
      }
    } catch (e) {
      console.warn("[FleetCache] Could not clear device token cache:", e.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: `Hardware lock cleared for ${targetClient.clientName}. The client can now bind to any new Android handset.` })
    };
  }

  // ── REVOKE / DELETE SEAT ───────────────────────────────────────────────────
  if (action === 'revoke_key') {
    const keyToRevoke = (body.licenseKey || '').trim();
    if (!keyToRevoke) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'licenseKey is required to revoke' }) };
    }

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

  return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
};
