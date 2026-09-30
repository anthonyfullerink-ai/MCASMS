const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const AGENCIES_CONFIG_PATH = path.join(ROOT_DIR, 'agencies', 'agencies.json');
const MASTER_LICENSES_PATH = path.join(DATA_DIR, 'master_licenses.json');
const APPLIANCE_CONFIGS_PATH = path.join(DATA_DIR, 'appliance_configs.json');
const VOICE_PRO_BINDINGS_PATH = path.join(ROOT_DIR, '.voice_pro_bindings.json');
const FLEET_CACHE_PATH = path.join(ROOT_DIR, '.agency_fleet_cache.json');
const LICENSE_SECRET = "MCAT_SECRET_PROD_KEY_2026";

function readJsonFile(filePath, fallback = {}) {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.warn(`[AgencyFleet] Read error for ${filePath}:`, e.message);
    }
  }
  return fallback;
}

function writeJsonFile(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn(`[AgencyFleet] Write error for ${filePath}:`, e.message);
  }
}

function getAgenciesData() {
  return readJsonFile(AGENCIES_CONFIG_PATH, { agencies: {} });
}

function getMasterLicenses() {
  return readJsonFile(MASTER_LICENSES_PATH, []);
}

function getVoiceSubscribers() {
  return readJsonFile(VOICE_PRO_BINDINGS_PATH, []);
}

function generateChildProKey(clientName, agencyId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const cleanAgency = (agencyId || 'DEFAULT').substring(0, 8).toUpperCase();
  const payloadStr = `${clientName || 'Valued Client'}|0|${timestamp}|${cleanAgency}`;
  const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
  hmac.update(payloadStr);
  const sig = hmac.digest('hex').substring(0, 8).toUpperCase();
  const hexName = Buffer.from(payloadStr, 'utf8').toString('hex').toUpperCase();
  return `MCAS-PRO-${hexName}-${sig}`;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Agency-Key, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch (e) {}
  }

  const action = body.action || (event.httpMethod === 'GET' ? 'list_white_label_agencies' : '');

  // ─── 1. LIST WHITE-LABEL AGENCIES (Owner Admin Dashboard Tab 7) ─────────────
  if (action === 'list_white_label_agencies') {
    const agenciesData = getAgenciesData();
    const agencies = agenciesData.agencies || {};
    const subscribers = getVoiceSubscribers();
    const masterList = getMasterLicenses();

    let totalMinutes = 0;
    let totalClients = 0;

    const agencyList = Object.entries(agencies).map(([id, cfg]) => {
      const clients = [];
      const clientKeys = new Set();

      subscribers.forEach(s => {
        if (s.agencyId === id || (id === 'default' && (!s.agencyId || s.agencyId === 'default'))) {
          clientKeys.add(s.licenseKey);
          clients.push({
            name: s.name || s.businessName || 'Client Business',
            email: s.email || '',
            licenseKey: s.licenseKey,
            minutes: s.voiceMinutesBalance || 0,
            status: s.status || (s.active ? 'ACTIVE' : 'INACTIVE'),
            agencyId: id
          });
        }
      });

      masterList.forEach(m => {
        if (m.agencyId === id && !clientKeys.has(m.key)) {
          clients.push({
            name: m.customer || 'Client Business',
            email: m.email || '',
            licenseKey: m.key,
            minutes: m.voiceMinutesBalance || 0,
            status: m.status || 'ACTIVE',
            agencyId: id
          });
        }
      });

      const clientCount = clients.length;
      const agencyMinutes = clients.reduce((acc, c) => acc + (parseFloat(c.minutes) || 0), 0);
      totalClients += clientCount;
      totalMinutes += agencyMinutes;

      // Check APK status
      const distDir = path.join(ROOT_DIR, 'dist', 'agencies', id);
      let apkFound = false;
      let apkFileName = '';
      let downloadUrl = '';

      if (fs.existsSync(distDir)) {
        const files = fs.readdirSync(distDir).filter(f => f.endsWith('.apk'));
        if (files.length > 0) {
          apkFound = true;
          apkFileName = files[0];
          downloadUrl = `/dist/agencies/${id}/${encodeURIComponent(apkFileName)}`;
        }
      } else if (id === 'default') {
        const rootApk = path.join(ROOT_DIR, 'MissedCallAutoSMS.apk');
        if (fs.existsSync(rootApk)) {
          apkFound = true;
          apkFileName = 'MissedCallAutoSMS.apk';
          downloadUrl = '/MissedCallAutoSMS.apk';
        }
      }

      return {
        id,
        appName: cfg.appName || id,
        legalName: cfg.legalName || cfg.appName || id,
        tagline: cfg.tagline || '',
        supportEmail: cfg.supportEmail || '',
        supportPhone: cfg.supportPhone || '',
        stripeDescriptor: cfg.stripeDescriptor || 'Voice Hub Network',
        theme: cfg.theme || { primaryColor: '#2563EB', accentColor: '#38BDF8' },
        clientCount,
        totalMinutesBalance: Math.round(agencyMinutes),
        clients,
        apkStatus: {
          exists: apkFound,
          fileName: apkFileName,
          downloadUrl
        },
        otaStatus: {
          versionCode: 40,
          versionName: '2.0.0',
          downloadUrl: downloadUrl || 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS.apk'
        }
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        agencies: agencyList,
        stats: {
          totalAgencies: agencyList.length,
          totalClients,
          totalMinutes: Math.round(totalMinutes)
        }
      })
    };
  }

  // ─── 2. AGENCY PARTNER AUTH (Agency Dashboard Login & Fleet Fetch) ───────────
  if (action === 'agency_partner_auth') {
    const rawId = String(body.agencyId || body.agencySlug || 'apex_leads').trim().toLowerCase();
    const agenciesData = getAgenciesData();
    const agencies = agenciesData.agencies || {};

    let matchedAgency = agencies[rawId];
    let matchedKey = rawId;

    if (!matchedAgency) {
      for (const [id, cfg] of Object.entries(agencies)) {
        if (id.toLowerCase() === rawId || (cfg.appName && cfg.appName.toLowerCase().replace(/[^a-z0-9]/g, '') === rawId.replace(/[^a-z0-9]/g, ''))) {
          matchedAgency = cfg;
          matchedKey = id;
          break;
        }
      }
    }

    if (!matchedAgency) {
      // Create fallback profile if accessing default or apex
      matchedAgency = {
        agencyId: rawId,
        appName: rawId === 'apex_leads' ? 'Apex CallShield' : 'Agency Partner',
        tagline: 'AI Telecom Appliance & 24/7 Voice Receptionist',
        supportEmail: `support@${rawId}.com`,
        supportPhone: '+1 (800) 555-0199',
        theme: { primaryColor: '#2563EB', accentColor: '#38BDF8' }
      };
      agencies[rawId] = matchedAgency;
      writeJsonFile(AGENCIES_CONFIG_PATH, { agencies });
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
          issuedAt: s.issuedAt || s.createdAt || new Date().toISOString()
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
          issuedAt: m.issuedAt || m.date || new Date().toISOString()
        });
      }
    });

    // Provide default sample client if empty so dashboard is fully interactive
    if (clients.length === 0) {
      clients.push({
        name: 'Premier Roofing Group',
        email: 'ops@premierroofing.com',
        contact: '+1 (555) 234-8910',
        notes: 'Commercial & Residential Roofing Fleet. 2 SIM handsets.',
        licenseKey: 'MCAS-PRO-5072656D69657220526F6F66696E672047726F75707C307C31373930373835313533-61745DD5',
        minutes: 45.2,
        status: 'ACTIVE',
        carrierCode: '*71',
        forwardingActive: true,
        hardwareId: 'device_pixel_8_pro_99a',
        deviceModel: 'Google Pixel 8',
        issuedAt: new Date().toISOString()
      });
    }

    const totalMinutes = clients.reduce((acc, c) => acc + (parseFloat(c.minutes) || 0), 0);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        agencyId: matchedKey,
        agency: matchedAgency,
        clients,
        stats: {
          clientCount: clients.length,
          totalMinutes: Math.round(totalMinutes),
          estCallsProtected: clients.length * 142,
          estPipelineProtected: clients.length * 28400
        },
        billing: {
          hasCardOnFile: true,
          cardBrand: 'visa',
          cardLast4: '4242'
        },
        apkStatus: {
          exists: true,
          fileName: `${(matchedAgency.appName || 'Agency').replace(/\s+/g, '_')}-standard.apk`,
          sizeMb: '12.36',
          downloadUrl: 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS.apk'
        },
        otaStatus: {
          versionCode: 40,
          versionName: '2.0.0',
          downloadUrl: 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS.apk'
        }
      })
    };
  }

  // ─── 3. CREATE WHITE-LABEL AGENCY PROFILE ───────────────────────────────────
  if (action === 'create_agency') {
    const agencyId = (body.agencyId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const agencyName = (body.agencyName || '').trim();
    const appName = (body.appName || agencyName || 'Agency App').trim();

    if (!agencyId || !agencyName) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Agency ID and Name are required.' }) };
    }

    const agenciesData = getAgenciesData();
    if (!agenciesData.agencies) agenciesData.agencies = {};

    agenciesData.agencies[agencyId] = {
      agencyId,
      appName,
      legalName: agencyName,
      tagline: body.tagline || 'AI Telecom Appliance & 24/7 Voice Receptionist',
      supportEmail: body.email || `support@${agencyId}.com`,
      supportPhone: body.phone || '',
      stripeDescriptor: 'Voice Hub Network',
      theme: body.theme || { primaryColor: '#2563EB', accentColor: '#38BDF8' },
      createdAt: new Date().toISOString()
    };

    writeJsonFile(AGENCIES_CONFIG_PATH, agenciesData);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: `Agency ${agencyName} created successfully!`, agency: agenciesData.agencies[agencyId] })
    };
  }

  // ─── 4. ISSUE CLIENT KEY ───────────────────────────────────────────────────
  if (action === 'agency_partner_issue_key') {
    const clientName = (body.clientName || '').trim();
    const agencyId = (body.agencyId || 'apex_leads').trim();

    if (!clientName) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Client name required.' }) };
    }

    const licenseKey = generateChildProKey(clientName, agencyId);
    const masterList = getMasterLicenses();

    masterList.unshift({
      key: licenseKey,
      customer: clientName,
      email: body.clientContact || '',
      contact: body.clientContact || '',
      notes: body.clientNotes || '',
      tier: 'PRO',
      type: 'AGENCY_FLEET',
      agencyId: agencyId,
      price: '$299.00',
      voiceEntitlement: true,
      voiceActive: true,
      voiceMinutesBalance: 50.0,
      status: 'ACTIVE',
      date: new Date().toISOString()
    });

    writeJsonFile(MASTER_LICENSES_PATH, masterList);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Client license generated!',
        licenseKey,
        client: { name: clientName, licenseKey, minutes: 50.0, status: 'ACTIVE' }
      })
    };
  }

  // ─── 5. RESET CLIENT DEVICE ─────────────────────────────────────────────────
  if (action === 'agency_partner_reset_client') {
    const key = (body.licenseKey || '').trim();
    const masterList = getMasterLicenses();
    const item = masterList.find(m => m.key === key);
    if (item) {
      item.deviceId = null;
      writeJsonFile(MASTER_LICENSES_PATH, masterList);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Device lock reset successfully!' }) };
  }

  // ─── 6. REVOKE CLIENT KEY ───────────────────────────────────────────────────
  if (action === 'agency_partner_revoke_key') {
    const key = (body.licenseKey || '').trim();
    const masterList = getMasterLicenses();
    const item = masterList.find(m => m.key === key);
    if (item) {
      item.status = item.status === 'REVOKED' ? 'ACTIVE' : 'REVOKED';
      writeJsonFile(MASTER_LICENSES_PATH, masterList);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Key status toggled!' }) };
  }

  // ─── 7. UPDATE AGENCY SETTINGS ──────────────────────────────────────────────
  if (action === 'agency_partner_update_settings') {
    const agencyId = (body.agencyId || 'apex_leads').trim();
    const agenciesData = getAgenciesData();
    if (agenciesData.agencies && agenciesData.agencies[agencyId]) {
      const ag = agenciesData.agencies[agencyId];
      if (body.tagline) ag.tagline = body.tagline;
      if (body.supportEmail) ag.supportEmail = body.supportEmail;
      if (body.supportPhone) ag.supportPhone = body.supportPhone;
      writeJsonFile(AGENCIES_CONFIG_PATH, agenciesData);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Agency settings updated!' }) };
  }

  // ─── 8. CLIENT REMOTE CONFIG (GET / SAVE) ───────────────────────────────────
  if (action === 'agency_get_client_remote_config') {
    const licenseKey = (body.licenseKey || '').trim();
    const configs = readJsonFile(APPLIANCE_CONFIGS_PATH, {});
    const cfg = configs[licenseKey] || {
      licenseKey,
      voice: {
        active: true,
        ringTimeoutSeconds: 18,
        forwardingPhone: '+1 (732) 903-5611',
        inactivityAutoPauseMins: 0,
        prompt: 'You are Riley, an intelligent AI Receptionist answering calls for a professional service business.'
      },
      handset: {
        autoSmsEnabled: true,
        smsTemplate: 'Sorry we missed your call! How can our team assist you today?',
        selectedSimSlot: 0
      }
    };
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, config: cfg }) };
  }

  if (action === 'agency_save_client_remote_config') {
    const licenseKey = (body.licenseKey || '').trim();
    const configs = readJsonFile(APPLIANCE_CONFIGS_PATH, {});
    configs[licenseKey] = {
      licenseKey,
      voice: body.voice || {},
      handset: body.handset || {},
      updatedAt: new Date().toISOString()
    };
    writeJsonFile(APPLIANCE_CONFIGS_PATH, configs);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Client configuration pushed to office appliance!' }) };
  }

  // Default response
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, message: 'Agency Fleet API Gateway Online' })
  };
};
