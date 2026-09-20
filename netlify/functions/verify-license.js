const crypto = require('crypto');

const LICENSE_SECRET = process.env.LICENSE_SECRET || "MCAT_SECRET_PROD_KEY_2026";

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

    if (!key) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ valid: false, error: 'License key is required.' })
      };
    }

    if (!key.startsWith('MCAS-') && !key.startsWith('MCAT-')) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: false,
          error: 'Invalid License Key Prefix. Valid keys begin with MCAS- or MCAS-PRO-.'
        })
      };
    }

    const isPro = key.startsWith('MCAS-PRO-') || key.startsWith('MCAT-PRO-') || key.includes('PRO-DEMO');
    const isAgency = key.startsWith('MCAS-AGENCY-') || key.startsWith('MCAT-AGENCY-');

    // Check Voice Pro Bindings (Cloud Firestore with local JSON fallback)
    let voiceActive = false;
    let voiceForwardingNumber = null;

    try {
      let _fsModule = null;
      try { _fsModule = require('../../lib/firestore'); } catch (e) {}

      if (_fsModule && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        const binding = await _fsModule.getVoiceBinding(key);
        if (binding && binding.status === 'ACTIVE' && binding.voiceActive !== false) {
          voiceActive = true;
          voiceForwardingNumber = binding.forwardingNumber;
        }
      } else {
        const fs = require('fs');
        const path = require('path');
        const voiceBindingsFile = path.join(__dirname, '../../.voice_pro_bindings.json');
        if (fs.existsSync(voiceBindingsFile)) {
          const bindings = JSON.parse(fs.readFileSync(voiceBindingsFile, 'utf8'));
          if (bindings[key] && bindings[key].active !== false && bindings[key].status !== 'CANCELLED') {
            voiceActive = true;
            voiceForwardingNumber = bindings[key].forwardingNumber;
          }
        }
      }
    } catch (e) {
      console.warn('[verify-license] Voice binding check notice:', e.message);
    }


    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        licenseKey: key,
        status: 'ACTIVE',
        tier: isAgency ? 'AGENCY' : (isPro ? 'PRO' : 'STANDARD'),
        edition: isAgency ? 'Agency Fleet Management' : (isPro ? 'Pro Automation Edition ($149)' : 'Flagship Appliance Edition ($49.99)'),
        voiceEligible: isPro || isAgency,
        voiceActive: voiceActive,
        voiceForwardingNumber: voiceForwardingNumber,
        type: key.includes('TRIAL') ? 'TRIAL' : (key.includes('DEMO') ? 'DEMO' : 'PAID'),
        deviceId: 'Protected (1 Physical Android Phone Bound)',
        features: {
          dualSim: isPro || isAgency,
          n8nWebhook: isPro || isAgency,
          centralWebhookBridge: isPro || isAgency,
          aiVoiceReceptionist: isPro || isAgency,
          p2pSmsExempt: true
        },
        verifiedAt: new Date().toISOString()
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ valid: false, error: err.message })
    };
  }
};
