const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function getVapiConfig() {
  let apiKey = process.env.VAPI_PRIVATE_API_KEY || '';
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (!apiKey && fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const keyMatch = content.match(/VAPI_PRIVATE_API_KEY=(.*)/);
      if (keyMatch && keyMatch[1]) apiKey = keyMatch[1].trim();
    } catch (e) {}
  }
  return apiKey;
}

function base64url(source) {
  let encodedSource = Buffer.from(source).toString('base64');
  encodedSource = encodedSource.replace(/=+$/, '');
  encodedSource = encodedSource.replace(/\+/g, '-');
  encodedSource = encodedSource.replace(/\//g, '_');
  return encodedSource;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const apiKey = getVapiConfig();
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'VAPI_PRIVATE_API_KEY is not configured' })
    };
  }

  try {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      orgId: '3a30b5e8-76ce-4e41-84ea-e55886e5ce48',
      token: { tag: 'public' },
      iat: now,
      exp: now + 3600
    };

    const stringifiedHeader = base64url(JSON.stringify(header));
    const stringifiedPayload = base64url(JSON.stringify(jwtPayload));
    const signature = crypto.createHmac('sha256', apiKey)
      .update(stringifiedHeader + '.' + stringifiedPayload)
      .digest();
    const stringifiedSignature = base64url(signature);
    const token = stringifiedHeader + '.' + stringifiedPayload + '.' + stringifiedSignature;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        token,
        assistantId: '2e486e8a-2875-4d99-b6dd-7f1162601874'
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
