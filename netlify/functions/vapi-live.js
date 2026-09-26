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
    // 0. Usage & Balance Delegation
    if (reqPath.includes('usage') || reqPath.endsWith('/usage')) {
      const usageHandler = require('./vapi-usage').handler;
      return await usageHandler(event);
    }

    // 0.1 Mint Scoped JWT for WebRTC Browser Audio (GET or POST /api/vapi/web-token)
    if (reqPath.includes('token') || (event.queryStringParameters && event.queryStringParameters.action === 'web-token')) {
      if (!apiKey) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ success: false, error: 'VAPI_PRIVATE_API_KEY is not configured' })
        };
      }
      const crypto = require('crypto');
      function base64url(source) {
        let encodedSource = Buffer.from(source).toString('base64');
        encodedSource = encodedSource.replace(/=+$/, '');
        encodedSource = encodedSource.replace(/\+/g, '-');
        encodedSource = encodedSource.replace(/\//g, '_');
        return encodedSource;
      }
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
    }

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

    // 2.1 GET or POST /api/vapi/user-assistant
    if (reqPath.includes('user-assistant')) {
      let fsModule = null;
      try { fsModule = require('../../lib/firestore'); } catch (e) {}

      // Handle GET /api/vapi/user-assistant?key=MCAS-...
      if (event.httpMethod === 'GET') {
        const key = (event.queryStringParameters?.key || event.queryStringParameters?.licenseKey || '').trim().toUpperCase();
        let targetAssistantId = null;
        let binding = null;

        if (key && fsModule && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
          try {
            binding = await fsModule.getVoiceBinding(key);
            if (binding && binding.vapiAssistantId) {
              targetAssistantId = binding.vapiAssistantId;
            }
          } catch (e) {
            console.warn('[vapi-live] Firestore user-assistant lookup error:', e.message);
          }
        }

        // Fallback for dev / unassigned
        if (!targetAssistantId) {
          targetAssistantId = assistantId || '5105b379-8cbf-4037-becc-bba45504f781';
        }

        let asstData = null;
        try {
          asstData = await vapiApiRequest(`/assistant/${targetAssistantId}`);
        } catch (e) {
          console.warn('[vapi-live] Failed to fetch assistant:', e.message);
        }

        const systemMessage = asstData?.model?.messages?.find(m => m.role === 'system')?.content ||
          "You are a friendly, professional AI receptionist. Your job is to answer incoming calls, capture the caller's name and service request, and reassure them that someone will follow up shortly.";

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            licenseKey: key,
            assistantId: targetAssistantId,
            phoneNumberId: binding?.vapiPhoneNumberId || null,
            forwardingNumber: binding?.forwardingNumber || '+1 (732) 660-9121',
            carrierCode: binding?.carrierCode || '*717326609121',
            quotaMinutes: binding?.quotaMinutes || 250,
            minutesUsed: binding?.minutesUsed || 0,
            assistant: {
              id: targetAssistantId,
              name: asstData?.name || 'Riley (AI Receptionist)',
              firstMessage: asstData?.firstMessage || 'Hi! Thanks for calling. How can I help you today?',
              systemPrompt: systemMessage,
              model: asstData?.model?.model || 'gpt-4o-mini',
              temperature: asstData?.model?.temperature ?? 0.3,
              voiceProvider: asstData?.voice?.provider || 'cartesia',
              voiceId: asstData?.voice?.voiceId || '248be419-c632-4f23-adf1-5324ed7dbf10'
            },
            aiSms: {
              postCallSmsEnabled: binding?.postCallSmsEnabled ?? true,
              aiSmsMasterEnabled: binding?.aiSmsMasterEnabled ?? true,
              aiSmsScope: binding?.aiSmsScope || 'STRICT',
              aiSmsBusinessServiceType: binding?.aiSmsBusinessServiceType || 'MOBILE_TRADE',
              aiSmsShopAddress: binding?.aiSmsShopAddress || '',
              aiSmsShopInstructions: binding?.aiSmsShopInstructions || '',
              aiSmsCalendarWorkingHours: binding?.aiSmsCalendarWorkingHours || '8:00 AM - 6:00 PM',
              aiSmsSlotDurationMinutes: binding?.aiSmsSlotDurationMinutes || 60,
              aiSmsTravelBufferMinutes: binding?.aiSmsTravelBufferMinutes || 30,
              aiSmsAutoPauseOnHumanReply: binding?.aiSmsAutoPauseOnHumanReply ?? true,
              aiSmsMaxRepliesPerContact: binding?.aiSmsMaxRepliesPerContact || 5,
              aiSmsEmergencyAlertsEnabled: binding?.aiSmsEmergencyAlertsEnabled ?? true
            }
          })
        };
      }

      // Handle POST /api/vapi/user-assistant (Update assistant)
      if (event.httpMethod === 'POST') {
        const payload = JSON.parse(event.body || '{}');
        const key = (payload.licenseKey || payload.key || '').trim().toUpperCase();
        let targetAssistantId = payload.assistantId || null;

        if (key && fsModule && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
          try {
            const binding = await fsModule.getVoiceBinding(key);
            if (binding && binding.vapiAssistantId) {
              targetAssistantId = binding.vapiAssistantId;
            }
          } catch (e) {}
        }

        if (!targetAssistantId) {
          targetAssistantId = assistantId || '5105b379-8cbf-4037-becc-bba45504f781';
        }

        const patchPayload = {};
        if (payload.name) patchPayload.name = payload.name;
        if (payload.firstMessage !== undefined) patchPayload.firstMessage = payload.firstMessage;

        const modelConfig = {
          provider: 'openai',
          model: payload.model || 'gpt-4o-mini',
          temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.3,
          messages: [
            { role: 'system', content: payload.systemPrompt || "You are a professional AI receptionist." }
          ]
        };
        patchPayload.model = modelConfig;

        if (payload.voiceProvider || payload.voiceId) {
          patchPayload.voice = {
            provider: payload.voiceProvider || 'cartesia',
            voiceId: payload.voiceId || '248be419-c632-4f23-adf1-5324ed7dbf10'
          };
        }

        const vapiRes = await vapiApiRequest(`/assistant/${targetAssistantId}`, 'PATCH', patchPayload);

        // Store model & tier preferences, plus 24/7 AI SMS & Calendar settings in Firestore voice_pro_bindings
        const isPremiumModel = (payload.model || '').toLowerCase().includes('gpt-4o') && !(payload.model || '').toLowerCase().includes('mini');
        if (key && fsModule && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
          try {
            const aiSmsUpdate = {};
            if (payload.postCallSmsEnabled !== undefined) aiSmsUpdate.postCallSmsEnabled = Boolean(payload.postCallSmsEnabled);
            if (payload.aiSmsMasterEnabled !== undefined) aiSmsUpdate.aiSmsMasterEnabled = Boolean(payload.aiSmsMasterEnabled);
            if (payload.aiSmsScope !== undefined) aiSmsUpdate.aiSmsScope = payload.aiSmsScope;
            if (payload.aiSmsBusinessServiceType !== undefined) aiSmsUpdate.aiSmsBusinessServiceType = payload.aiSmsBusinessServiceType;
            if (payload.aiSmsShopAddress !== undefined) aiSmsUpdate.aiSmsShopAddress = payload.aiSmsShopAddress;
            if (payload.aiSmsShopInstructions !== undefined) aiSmsUpdate.aiSmsShopInstructions = payload.aiSmsShopInstructions;
            if (payload.aiSmsCalendarWorkingHours !== undefined) aiSmsUpdate.aiSmsCalendarWorkingHours = payload.aiSmsCalendarWorkingHours;
            if (payload.aiSmsSlotDurationMinutes !== undefined) aiSmsUpdate.aiSmsSlotDurationMinutes = payload.aiSmsSlotDurationMinutes;
            if (payload.aiSmsTravelBufferMinutes !== undefined) aiSmsUpdate.aiSmsTravelBufferMinutes = payload.aiSmsTravelBufferMinutes;
            if (payload.aiSmsAutoPauseOnHumanReply !== undefined) aiSmsUpdate.aiSmsAutoPauseOnHumanReply = Boolean(payload.aiSmsAutoPauseOnHumanReply);
            if (payload.aiSmsMaxRepliesPerContact !== undefined) aiSmsUpdate.aiSmsMaxRepliesPerContact = payload.aiSmsMaxRepliesPerContact;
            if (payload.aiSmsEmergencyAlertsEnabled !== undefined) aiSmsUpdate.aiSmsEmergencyAlertsEnabled = Boolean(payload.aiSmsEmergencyAlertsEnabled);

            await fsModule.saveVoiceBinding(key, {
              model: payload.model || 'gpt-4o-mini',
              hasPremiumModel: isPremiumModel,
              temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.3,
              ...aiSmsUpdate,
              lastSyncedAt: new Date().toISOString()
            });
          } catch (e) {
            console.warn('[vapi-live] Failed to save AI SMS settings to Firestore:', e.message);
          }
        }

        // Also update local .voice_pro_bindings.json if present
        try {
          const bindingsPath = path.join(__dirname, '..', '..', '.voice_pro_bindings.json');
          if (fs.existsSync(bindingsPath)) {
            const raw = JSON.parse(fs.readFileSync(bindingsPath, 'utf8'));
            if (raw[key]) {
              raw[key].model = payload.model || 'gpt-4o-mini';
              raw[key].hasPremiumModel = isPremiumModel;
              raw[key].temperature = typeof payload.temperature === 'number' ? payload.temperature : 0.3;
              if (payload.postCallSmsEnabled !== undefined) raw[key].postCallSmsEnabled = Boolean(payload.postCallSmsEnabled);
              if (payload.aiSmsMasterEnabled !== undefined) raw[key].aiSmsMasterEnabled = Boolean(payload.aiSmsMasterEnabled);
              if (payload.aiSmsScope !== undefined) raw[key].aiSmsScope = payload.aiSmsScope;
              if (payload.aiSmsBusinessServiceType !== undefined) raw[key].aiSmsBusinessServiceType = payload.aiSmsBusinessServiceType;
              if (payload.aiSmsShopAddress !== undefined) raw[key].aiSmsShopAddress = payload.aiSmsShopAddress;
              if (payload.aiSmsShopInstructions !== undefined) raw[key].aiSmsShopInstructions = payload.aiSmsShopInstructions;
              fs.writeFileSync(bindingsPath, JSON.stringify(raw, null, 2), 'utf8');
            }
          }
        } catch (e) {}

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: `Your AI Voice Receptionist and AI SMS Studio settings were updated live!`,
            assistant: vapiRes,
            hasPremiumModel: isPremiumModel
          })
        };
      }
    }

    // 2.2 POST /api/vapi/outbound-test-call
    if (reqPath.includes('outbound-test-call') && event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      const targetPhone = (payload.phoneNumber || payload.phone || '').trim();
      const key = (payload.licenseKey || payload.key || '').trim().toUpperCase();

      if (!targetPhone) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Destination phone number is required.' })
        };
      }

      let fsModule = null;
      try { fsModule = require('../../lib/firestore'); } catch (e) {}

      let targetAssistantId = payload.assistantId || null;
      let targetPhoneId = payload.phoneNumberId || null;

      if (key && fsModule && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
          const binding = await fsModule.getVoiceBinding(key);
          if (binding) {
            if (!targetAssistantId && binding.vapiAssistantId) targetAssistantId = binding.vapiAssistantId;
            if (!targetPhoneId && binding.vapiPhoneNumberId) targetPhoneId = binding.vapiPhoneNumberId;
          }
        } catch (e) {}
      }

      if (!targetAssistantId) {
        targetAssistantId = assistantId || '5105b379-8cbf-4037-becc-bba45504f781';
      }

      // If no dedicated phone ID found, try to resolve one from Vapi account
      if (!targetPhoneId) {
        try {
          const pList = await vapiApiRequest('/phone-number');
          if (Array.isArray(pList) && pList.length > 0) {
            targetPhoneId = pList[0].id;
          }
        } catch (e) {}
      }

      const callPayload = {
        assistantId: targetAssistantId,
        customer: {
          number: targetPhone
        }
      };
      if (targetPhoneId) {
        callPayload.phoneNumberId = targetPhoneId;
      }

      try {
        const callRes = await vapiApiRequest('/call/phone', 'POST', callPayload);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: `Placing live test call to ${targetPhone} now! Your phone will ring shortly.`,
            call: callRes
          })
        };
      } catch (callErr) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: callErr.message || 'Failed to initiate outbound Vapi call'
          })
        };
      }
    }

    // 2.3 POST /api/vapi/test-call (Simulated test call logger)
    if (reqPath.includes('test-call') && event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      let fsModule = null;
      try { fsModule = require('../../lib/firestore'); } catch (e) {}

      if (fsModule && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
          await fsModule.logVoiceCall({
            licenseKey: payload.licenseKey || 'SIMULATION',
            callerNumber: payload.phoneNumber || '+15550199',
            callerName: payload.callerName || 'Test Caller',
            summary: payload.summary || 'Simulated In-App Voice Call Test',
            transcript: payload.transcript || `AI: ${payload.firstMessage || 'Hello'}`,
            durationSeconds: payload.durationSeconds || 30,
            type: 'SIMULATED_TEST',
            simulatedAt: new Date().toISOString()
          });
        } catch (e) {
          console.warn('[vapi-live] Failed to log simulated call to Firestore:', e.message);
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Simulated call logged successfully.'
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
