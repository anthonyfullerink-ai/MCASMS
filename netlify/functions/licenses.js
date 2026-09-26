const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const masterPath = path.join(__dirname, '..', '..', 'data', 'master_licenses.json');
    const bindingsPath = path.join(__dirname, '..', '..', '.voice_pro_bindings.json');

    let masterList = [];
    if (fs.existsSync(masterPath)) {
      try { masterList = JSON.parse(fs.readFileSync(masterPath, 'utf8')); } catch (e) {}
    }

    if (!masterList.some(r => r.key === 'MCAS-PRO-DEMO-89F2')) {
      masterList.unshift({
        key: 'MCAS-PRO-DEMO-89F2',
        customer: 'Owner & Reviewer Master Pro Demo',
        email: 'founder@missedcallautosms.com',
        tier: 'PRO',
        type: 'DEMO',
        price: '$299.00',
        voiceEntitlement: true,
        voiceSubWaived: true,
        vapiProvisioned: true,
        voiceActive: true,
        voiceNumber: '+1 (555) 349-2810',
        carrierCode: '*715553492810',
        voiceMinutesBalance: 50.0,
        status: 'ACTIVE',
        date: new Date().toISOString()
      });
    }
    if (!masterList.some(r => r.key === 'MCAS-DEMO-TRIAL-89F2')) {
      masterList.push({
        key: 'MCAS-DEMO-TRIAL-89F2',
        customer: 'Owner Master Demo',
        email: 'trial@missedcallautosms.com',
        tier: 'STANDARD',
        type: 'DEMO',
        price: '$49.99',
        voiceEntitlement: false,
        voiceActive: false,
        status: 'ACTIVE',
        date: new Date().toISOString()
      });
    }

    let voiceBindings = [];
    if (fs.existsSync(bindingsPath)) {
      try {
        const b = JSON.parse(fs.readFileSync(bindingsPath, 'utf8'));
        voiceBindings = Object.keys(b).map(k => ({ licenseKey: k, ...b[k] }));
      } catch (e) {}
    }

    if (event.httpMethod === 'POST') {
      let payload = {};
      try { payload = JSON.parse(event.body || '{}'); } catch (e) {}
      const key = (payload.key || payload.licenseKey || '').trim().toUpperCase();
      if (!key) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Key is required' }) };
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

      try {
        let current = [];
        if (fs.existsSync(masterPath)) {
          try { current = JSON.parse(fs.readFileSync(masterPath, 'utf8')); } catch (e) {}
        }
        const idx = current.findIndex(c => c.key === rec.key);
        if (idx >= 0) current[idx] = { ...current[idx], ...rec };
        else current.unshift(rec);
        fs.writeFileSync(masterPath, JSON.stringify(current, null, 2), 'utf8');
      } catch (writeErr) {
        console.warn('Non-fatal write warning in serverless:', writeErr.message);
      }

      // Persist to Cloud Firestore if available
      try {
        let _fsModule = null;
        try { _fsModule = require('../../lib/firestore'); } catch (e) {}
        if (_fsModule && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
          await _fsModule.saveMasterLicense(rec);
          if (rec.voiceEntitlement || rec.voiceSubWaived || rec.voiceActive) {
            await _fsModule.saveVoiceBinding(rec.key, {
              name: rec.customer,
              email: rec.email,
              voiceEntitlement: rec.voiceEntitlement,
              voiceSubWaived: rec.voiceSubWaived,
              voiceActive: rec.voiceActive,
              voiceMinutesBalance: rec.voiceMinutesBalance,
              forwardingNumber: rec.voiceNumber,
              carrierCode: rec.carrierCode,
              status: rec.status
            });
          }
        }
      } catch (fsErr) {
        console.warn('[licenses.js] Firestore save notice:', fsErr.message);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'License saved successfully', license: rec })
      };
    }

    // Fetch from Firestore master_licenses & registered_devices if available
    let firestoreLicenses = [];
    let deviceBindings = {};
    try {
      let _fsModule = null;
      try { _fsModule = require('../../lib/firestore'); } catch (e) {}
      if (_fsModule && (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT)) {
        firestoreLicenses = await _fsModule.getAllMasterLicenses();
        deviceBindings = await _fsModule.getAllDeviceBindings();
      }
    } catch (fsErr) {
      console.warn('[licenses.js] Firestore load notice:', fsErr.message);
    }

    // Read local device tokens cache
    let localDeviceCache = {};
    try {
      const devCachePath = path.join(__dirname, '..', '..', '.device_tokens_cache.json');
      if (fs.existsSync(devCachePath)) {
        localDeviceCache = JSON.parse(fs.readFileSync(devCachePath, 'utf8') || '{}');
      }
    } catch (e) {}

    const combined = [...masterList];

    // Merge Firestore master licenses
    for (const fLic of firestoreLicenses) {
      if (!fLic || !fLic.key) continue;
      const existing = combined.find(c => c.key === fLic.key);
      if (existing) {
        Object.assign(existing, fLic);
      } else {
        combined.unshift(fLic);
      }
    }

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
      const FLEET_CACHE_PATH = path.join(__dirname, '..', '..', '.agency_fleet_cache.json');
      if (fs.existsSync(FLEET_CACHE_PATH)) {
        const fleetCache = JSON.parse(fs.readFileSync(FLEET_CACHE_PATH, 'utf8') || '{}');
        const revokedKeys = Array.isArray(fleetCache._revokedKeys) ? fleetCache._revokedKeys : [];

        for (const [agencyKey, agencyRecord] of Object.entries(fleetCache)) {
          if (agencyKey.startsWith('_')) continue;

          const isAgencyRevoked = revokedKeys.includes(agencyKey);
          const tierPriceMap = { agency_3: '$229.00/mo', agency_5: '$349.00/mo', agency_10: '$649.00/mo', agency_25: '$1,249.00/mo', agency_enterprise: '$1,249.00/mo' };
          const tierLabelMap = { agency_3: 'AGENCY_3', agency_5: 'AGENCY_5', agency_10: 'AGENCY_10', agency_25: 'AGENCY_25', agency_enterprise: 'AGENCY_ENT' };
          const agencyPrice = tierPriceMap[agencyRecord.tier] || '$349.00/mo';
          const agencyTierLabel = tierLabelMap[agencyRecord.tier] || 'AGENCY_5';

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
    } catch (fleetErr) {
      console.warn('[licenses.js] Agency fleet merge notice:', fleetErr.message);
    }

    // Also include any licenses present in registered_devices or device cache that are not yet in combined
    const allBoundKeys = new Set([...Object.keys(deviceBindings), ...Object.keys(localDeviceCache)]);
    for (const bKey of allBoundKeys) {
      if (!combined.some(c => c.key === bKey)) {
        const cacheEntry = localDeviceCache[bKey] || {};
        const fsEntry = deviceBindings[bKey] || {};
        const isPro = bKey.includes('PRO');
        combined.unshift({
          key: bKey,
          customer: cacheEntry.customer_name || fsEntry.customer || 'Customer Phone',
          email: '',
          tier: isPro ? 'PRO' : 'STANDARD',
          type: 'PAID',
          price: isPro ? '$299.00' : '$49.99',
          deviceId: fsEntry.deviceId || cacheEntry.device_id || cacheEntry.deviceId || null,
          deviceModel: fsEntry.model || fsEntry.deviceModel || cacheEntry.device_model || cacheEntry.model || null,
          status: 'ACTIVE',
          date: fsEntry.boundAt ? new Date(fsEntry.boundAt).toISOString() : (cacheEntry.updatedAt || new Date().toISOString())
        });
      }
    }

    // Attach bound device IDs to all licenses
    for (const lic of combined) {
      if (!lic.deviceId) {
        const fromFirestoreBinding = deviceBindings[lic.key]?.deviceId;
        const fromLocalCache = localDeviceCache[lic.key]?.device_id || localDeviceCache[lic.key]?.deviceId;
        lic.deviceId = fromFirestoreBinding || fromLocalCache || null;
      }
      if (!lic.deviceModel) {
        const fromFsModel = deviceBindings[lic.key]?.model || deviceBindings[lic.key]?.deviceModel;
        const fromCacheModel = localDeviceCache[lic.key]?.device_model || localDeviceCache[lic.key]?.model;
        lic.deviceModel = fromFsModel || fromCacheModel || null;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, licenses: combined, count: combined.length })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
