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
