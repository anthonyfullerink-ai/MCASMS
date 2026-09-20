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

    const combined = [...masterList];
    for (const vb of voiceBindings) {
      const existing = combined.find(c => c.key === vb.licenseKey);
      if (existing) {
        existing.voiceActive = true;
        existing.voiceNumber = vb.forwardingNumber;
        existing.carrierCode = vb.carrierCode;
      } else {
        combined.unshift({
          key: vb.licenseKey,
          customer: vb.name || 'Valued Customer',
          email: vb.email || '',
          tier: 'PRO',
          type: 'PAID',
          price: '29.00/mo',
          voiceActive: true,
          voiceNumber: vb.forwardingNumber,
          carrierCode: vb.carrierCode,
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
