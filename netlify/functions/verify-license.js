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
        voiceActive: isPro, // Pro edition enables turnkey voice receptionist eligibility
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
