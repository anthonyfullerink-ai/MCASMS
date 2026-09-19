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

    // Check if there is an active Voice Pro binding for this key
    let voiceSubscriptionActive = false;
    let voiceDetails = null;
    try {
      const fs = require('fs');
      const path = require('path');
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
