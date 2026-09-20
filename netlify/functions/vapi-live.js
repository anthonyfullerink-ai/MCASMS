const https = require('https');
const fs = require('fs');
const path = require('path');

function getVapiConfig() {
  let apiKey = process.env.VAPI_PRIVATE_API_KEY || '';
  let assistantId = process.env.VAPI_ASSISTANT_ID || '';
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const keyMatch = content.match(/VAPI_PRIVATE_API_KEY=(.*)/);
      const asstMatch = content.match(/VAPI_ASSISTANT_ID=(.*)/);
      if (keyMatch && keyMatch[1]) apiKey = keyMatch[1].trim();
      if (asstMatch && asstMatch[1]) assistantId = asstMatch[1].trim();
    } catch (e) {}
  }
  return { apiKey, assistantId };
}

function vapiApiRequest(endpoint, method = 'GET', postJson = null) {
  const { apiKey } = getVapiConfig();
  if (!apiKey) {
    return Promise.reject(new Error('VAPI_PRIVATE_API_KEY is not configured'));
  }
  return new Promise((resolve, reject) => {
    const postData = postJson ? JSON.stringify(postJson) : null;
    const options = {
      hostname: 'api.vapi.ai',
      port: 443,
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    };
    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.message || `HTTP ${res.statusCode}: ${body}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ raw: body });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
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

  const { apiKey, assistantId } = getVapiConfig();
  const reqPath = event.path || '';

  try {
    // 1. POST /api/vapi/set-webhook
    if (reqPath.includes('set-webhook') && event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      const targetId = payload.assistantId || assistantId || '5105b379-8cbf-4037-becc-bba45504f781';
      const serverUrl = payload.serverUrl || 'https://missedcallautosms.com/api/vapi/webhook';

      const vapiRes = await vapiApiRequest(`/assistant/${targetId}`, 'PATCH', { serverUrl });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Webhook linked! Vapi will now stream end-of-call events to: ${serverUrl}`,
          serverUrl,
          assistant: vapiRes
        })
      };
    }

    // 2. POST /api/vapi/update-assistant
    if (reqPath.includes('update-assistant') && event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      const targetId = payload.assistantId || assistantId || '5105b379-8cbf-4037-becc-bba45504f781';

      const patchPayload = {};
      if (payload.name) patchPayload.name = payload.name;
      if (payload.firstMessage !== undefined) patchPayload.firstMessage = payload.firstMessage;
      if (payload.serverUrl !== undefined) patchPayload.serverUrl = payload.serverUrl;

      if (payload.systemPrompt !== undefined) {
        patchPayload.model = {
          provider: 'openai',
          model: payload.model || 'gpt-4.1',
          messages: [
            { role: 'system', content: payload.systemPrompt }
          ]
        };
      }

      const vapiRes = await vapiApiRequest(`/assistant/${targetId}`, 'PATCH', patchPayload);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Vapi Assistant "${vapiRes.name || targetId}" updated live in Vapi Cloud!`,
          assistant: vapiRes
        })
      };
    }

    // 3. GET /api/vapi/live-status or default status
    let assistant = null;
    let resolvedId = assistantId;
    try {
      if (resolvedId) {
        assistant = await vapiApiRequest(`/assistant/${resolvedId}`);
      }
    } catch (asstErr) {
      try {
        const list = await vapiApiRequest('/assistant');
        if (Array.isArray(list) && list.length > 0) {
          assistant = list[0];
          resolvedId = assistant.id;
        }
      } catch (e) {}
    }

    if (!assistant) {
      const list = await vapiApiRequest('/assistant');
      if (Array.isArray(list) && list.length > 0) {
        assistant = list[0];
        resolvedId = assistant.id;
      }
    }

    let phoneNumbers = [];
    try {
      phoneNumbers = await vapiApiRequest('/phone-number');
    } catch (pErr) {
      phoneNumbers = [];
    }

    // Read voice pro bindings if available
    let subscribers = [];
    const bindingsPath = path.join(__dirname, '..', '..', '.voice_pro_bindings.json');
    if (fs.existsSync(bindingsPath)) {
      try {
        const b = JSON.parse(fs.readFileSync(bindingsPath, 'utf8'));
        subscribers = Object.keys(b).map(k => ({ licenseKey: k, ...b[k] }));
      } catch (e) {}
    }

    const systemMessage = assistant?.model?.messages?.find(m => m.role === 'system')?.content || '';
    const currentServerUrl = assistant?.serverUrl || '';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        connected: true,
        assistant: {
          id: resolvedId || assistant?.id,
          name: assistant?.name || 'Riley',
          model: assistant?.model?.model || 'gpt-4.1',
          voiceProvider: assistant?.voice?.provider || 'vapi',
          firstMessage: assistant?.firstMessage || '',
          systemPrompt: systemMessage,
          serverUrl: currentServerUrl,
          createdAt: assistant?.createdAt || null
        },
        phoneNumbers: phoneNumbers || [],
        subscribers: subscribers,
        subscribersCount: subscribers.length
      })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        connected: false,
        error: err.message
      })
    };
  }
};
