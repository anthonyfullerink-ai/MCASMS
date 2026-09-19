const fs = require('fs');
const path = require('path');
const https = require('https');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Missed Call Auto SMS <onboarding@resend.dev>';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'contactus@offgridmediagroup.com';
const LOCAL_SETTINGS_CACHE = path.join(__dirname, '../../data/support_gateway_settings.json');
const LOCAL_CHATS_CACHE = path.join(__dirname, '../../data/developer_support_chats.json');

// Firebase Admin setup
let initializeApp, getApps, cert, getFirestore;
try {
  const adminApp = require('firebase-admin/app');
  const adminFs = require('firebase-admin/firestore');
  initializeApp = adminApp.initializeApp;
  getApps = adminApp.getApps;
  cert = adminApp.cert;
  getFirestore = adminFs.getFirestore;
} catch (e) {
  initializeApp = null;
}

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'offgrid-saas-core-1e97a9';
let firestoreDb = null;

function initFirebase() {
  if (!initializeApp) return null;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return null;
  try {
    if (getApps().length === 0) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      initializeApp({
        credential: cert(sa),
        projectId: sa.project_id || PROJECT_ID
      });
    }
    if (!firestoreDb) firestoreDb = getFirestore();
    return firestoreDb;
  } catch (e) {
    console.warn('Firebase init warning (using cache fallback):', e.message);
    return null;
  }
}

let getStore;
try {
  const blobs = require('@netlify/blobs');
  getStore = blobs.getStore;
} catch (e) {
  getStore = null;
}

function getBlobStore() {
  if (!getStore) return null;
  try {
    return getStore({ name: 'support_gateway', consistency: 'strong' });
  } catch (e) {
    return null;
  }
}

const querystring = require('querystring');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PRODUCT_ID = 'prod_VI0YjmSg3Nymju';

function stripeGetProductMetadata() {
  if (!STRIPE_SECRET_KEY) return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.stripe.com',
      port: 443,
      path: '/v1/products/' + STRIPE_PRODUCT_ID,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          resolve((p && p.metadata) ? p.metadata : null);
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

function stripeUpdateProductMetadata(metadata) {
  if (!STRIPE_SECRET_KEY) return Promise.resolve(false);
  return new Promise((resolve) => {
    const postData = {};
    for (const [k, v] of Object.entries(metadata)) {
      postData['metadata[' + k + ']'] = v;
    }
    const body = querystring.stringify(postData);
    const req = https.request({
      hostname: 'api.stripe.com',
      port: 443,
      path: '/v1/products/' + STRIPE_PRODUCT_ID,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

let inMemorySettingsCache = null;
let lastCacheTime = 0;

const DEFAULT_SETTINGS = {
  mode: 'AI_SUPPORT', // 'LIVE_SMS' | 'AI_SUPPORT'
  developerPhone: '+1 (732) 552-3896',
  developerEmail: 'contactus@offgridmediagroup.com',
  onlineHoursStart: 8,
  onlineHoursEnd: 22,
  updatedAt: new Date().toISOString()
};

async function getGatewaySettings() {
  const now = Date.now();
  if (inMemorySettingsCache && (now - lastCacheTime < 10000)) {
    return inMemorySettingsCache;
  }

  // 1. Primary permanent cloud store: Stripe product metadata
  try {
    const meta = await stripeGetProductMetadata();
    if (meta && meta.support_gateway_mode) {
      const settings = {
        ...DEFAULT_SETTINGS,
        mode: meta.support_gateway_mode === 'LIVE_SMS' ? 'LIVE_SMS' : 'AI_SUPPORT',
        developerPhone: meta.developer_phone || DEFAULT_SETTINGS.developerPhone,
        developerEmail: meta.developer_email || DEFAULT_SETTINGS.developerEmail,
        updatedAt: meta.support_gateway_updated_at || new Date().toISOString()
      };
      inMemorySettingsCache = settings;
      lastCacheTime = now;
      return settings;
    }
  } catch (e) {
    console.warn('Stripe metadata read warning:', e.message);
  }

  // 2. Netlify Blobs fallback
  const store = getBlobStore();
  if (store) {
    try {
      const data = await store.get('config', { type: 'json' });
      if (data && data.mode) {
        return { ...DEFAULT_SETTINGS, ...data };
      }
    } catch (e) {
      console.warn('Netlify Blobs read warning:', e.message);
    }
  }

  // 3. Firestore fallback
  const db = initFirebase();
  if (db) {
    try {
      const doc = await db.collection('support_gateway_settings').doc('config').get();
      if (doc.exists) {
        return { ...DEFAULT_SETTINGS, ...doc.data() };
      }
    } catch (e) {
      console.warn('Firestore read error for gateway settings:', e.message);
    }
  }

  // 4. Local filesystem cache fallback
  try {
    if (fs.existsSync(LOCAL_SETTINGS_CACHE)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(LOCAL_SETTINGS_CACHE, 'utf8')) };
    }
  } catch (e) {}

  return DEFAULT_SETTINGS;
}

async function saveGatewaySettings(settings) {
  inMemorySettingsCache = settings;
  lastCacheTime = Date.now();

  // 1. Write to Stripe product metadata (permanent, surviving serverless restarts)
  try {
    await stripeUpdateProductMetadata({
      support_gateway_mode: settings.mode,
      developer_phone: settings.developerPhone || DEFAULT_SETTINGS.developerPhone,
      developer_email: settings.developerEmail || DEFAULT_SETTINGS.developerEmail,
      support_gateway_updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn('Stripe metadata write warning:', e.message);
  }

  // 2. Netlify Blobs fallback
  const store = getBlobStore();
  if (store) {
    try {
      await store.setJSON('config', settings);
    } catch (e) {
      console.warn('Netlify Blobs write warning:', e.message);
    }
  }

  // 3. Firestore fallback
  const db = initFirebase();
  if (db) {
    try {
      await db.collection('support_gateway_settings').doc('config').set(settings, { merge: true });
    } catch (e) {
      console.warn('Firestore write error for gateway settings:', e.message);
    }
  }

  // 4. Local filesystem fallback
  try {
    const dataDir = path.dirname(LOCAL_SETTINGS_CACHE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(LOCAL_SETTINGS_CACHE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {}
}

async function getChats() {
  const db = initFirebase();
  if (db) {
    try {
      const snapshot = await db.collection('support_chats').orderBy('lastActive', 'desc').limit(50).get();
      const chats = {};
      snapshot.forEach(doc => {
        chats[doc.id] = doc.data();
      });
      if (Object.keys(chats).length > 0) return chats;
    } catch (e) {
      console.warn('Firestore read error for chats:', e.message);
    }
  }

  try {
    if (fs.existsSync(LOCAL_CHATS_CACHE)) {
      return JSON.parse(fs.readFileSync(LOCAL_CHATS_CACHE, 'utf8'));
    }
  } catch (e) {}

  return {};
}

async function saveChatThread(visitorId, threadData) {
  const db = initFirebase();
  if (db) {
    try {
      await db.collection('support_chats').doc(visitorId).set(threadData, { merge: true });
    } catch (e) {
      console.warn('Firestore write error for chat thread:', e.message);
    }
  }

  try {
    let chats = {};
    if (fs.existsSync(LOCAL_CHATS_CACHE)) {
      chats = JSON.parse(fs.readFileSync(LOCAL_CHATS_CACHE, 'utf8'));
    }
    chats[visitorId] = threadData;
    fs.writeFileSync(LOCAL_CHATS_CACHE, JSON.stringify(chats, null, 2), 'utf8');
  } catch (e) {}
}

function sendViaResend(apiKey, fromEmail, toEmail, subject, htmlContent) {
  if (!apiKey) return Promise.resolve({ skipped: true, reason: 'No RESEND_API_KEY' });
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      from: fromEmail || FROM_EMAIL,
      to: Array.isArray(toEmail) ? toEmail : [toEmail],
      subject: subject,
      html: htmlContent
    });

    const options = {
      hostname: 'api.resend.com',
      port: 443,
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ error: body });
        }
      });
    });

    req.on('error', err => resolve({ error: err.message }));
    req.write(payload);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-resend-key, x-stripe-key',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const rawPath = event.path || '';
  const method = event.httpMethod;

  // Normalize path segment
  const isGatewaySettings = rawPath.endsWith('/gateway-settings') || rawPath.endsWith('/gateway-settings/');
  const isVisitorMessage = rawPath.endsWith('/visitor-message') || rawPath.endsWith('/visitor-message/');
  const isVisitorMessages = rawPath.endsWith('/visitor-messages') || rawPath.endsWith('/visitor-messages/');
  const isDeveloperReply = rawPath.endsWith('/developer-reply') || rawPath.endsWith('/developer-reply/');
  const isActiveThreads = rawPath.endsWith('/active-threads') || rawPath.endsWith('/active-threads/');

  // 1. GET /api/support/gateway-settings
  if (isGatewaySettings && method === 'GET') {
    const settings = await getGatewaySettings();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, settings })
    };
  }

  // 2. POST /api/support/gateway-settings
  if (isGatewaySettings && method === 'POST') {
    try {
      const payload = JSON.parse(event.body || '{}');
      const current = await getGatewaySettings();
      const updated = {
        ...current,
        ...payload,
        mode: payload.mode === 'LIVE_SMS' ? 'LIVE_SMS' : 'AI_SUPPORT',
        updatedAt: new Date().toISOString()
      };
      await saveGatewaySettings(updated);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Support gateway mode updated to ${updated.mode}`,
          settings: updated
        })
      };
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: e.message })
      };
    }
  }

  // 3. POST /api/support/visitor-message
  if (isVisitorMessage && method === 'POST') {
    try {
      const payload = JSON.parse(event.body || '{}');
      const visitorId = (payload.visitorId || `visitor_${Date.now()}`).trim();
      const visitorName = (payload.visitorName || payload.name || 'Website Visitor').trim();
      const visitorEmail = (payload.email || '').trim();
      const messageText = (payload.message || '').trim();

      if (!messageText) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Message text is required' })
        };
      }

      const chats = await getChats();
      const thread = chats[visitorId] || {
        visitorId,
        visitorName,
        visitorEmail,
        createdAt: new Date().toISOString(),
        messages: []
      };

      const msgObj = {
        id: `msg_${Date.now()}_${Math.floor(Math.random()*1000)}`,
        sender: 'visitor',
        senderName: visitorName,
        text: messageText,
        timestamp: new Date().toISOString()
      };

      thread.messages.push(msgObj);
      thread.lastActive = msgObj.timestamp;
      await saveChatThread(visitorId, thread);

      // Notify Anthony via Resend email if configured
      const resendKey = (event.headers && event.headers['x-resend-key']) || RESEND_API_KEY;
      if (resendKey) {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; background: #090B0E; color: #FFF; padding: 20px; border-radius: 10px;">
            <h2 style="color: #00E676; margin-top: 0;">💬 New Live Chat Inquiry from ${visitorName}</h2>
            <p><strong>Visitor ID:</strong> ${visitorId}</p>
            ${visitorEmail ? `<p><strong>Email:</strong> ${visitorEmail}</p>` : ''}
            <div style="background: #161B22; border-left: 4px solid #00E676; padding: 14px; margin: 16px 0;">
              <strong>Message:</strong><br>${messageText}
            </div>
            <p style="font-size: 12px; color: #8B949E;">Reply directly in your <a href="https://missedcallautosms.com/owner" style="color: #00E676;">Owner Admin Dashboard</a>.</p>
          </div>
        `;
        sendViaResend(resendKey, FROM_EMAIL, OWNER_EMAIL, `💬 [Live Lead] ${visitorName}: "${messageText.slice(0, 50)}"`, emailHtml).catch(() => {});
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          visitorId,
          messageId: msgObj.id,
          sentToDeveloper: true
        })
      };
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: e.message })
      };
    }
  }

  // 4. GET /api/support/visitor-messages
  if (isVisitorMessages && method === 'GET') {
    const params = event.queryStringParameters || {};
    const visitorId = params.visitorId || '';
    const chats = await getChats();
    const thread = chats[visitorId] || { messages: [] };
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        visitorId,
        messages: thread.messages || []
      })
    };
  }

  // 5. POST /api/support/developer-reply
  if (isDeveloperReply && method === 'POST') {
    try {
      const payload = JSON.parse(event.body || '{}');
      const visitorId = (payload.visitorId || '').trim();
      const replyText = (payload.replyMessage || payload.message || '').trim();

      if (!visitorId || !replyText) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'visitorId and replyMessage are required' })
        };
      }

      const chats = await getChats();
      const thread = chats[visitorId] || {
        visitorId,
        visitorName: 'Website Visitor',
        createdAt: new Date().toISOString(),
        messages: []
      };

      const replyObj = {
        id: `reply_${Date.now()}_${Math.floor(Math.random()*1000)}`,
        sender: 'developer',
        senderName: 'Anthony (Developer)',
        text: replyText,
        timestamp: new Date().toISOString()
      };

      thread.messages.push(replyObj);
      thread.lastActive = replyObj.timestamp;
      await saveChatThread(visitorId, thread);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          visitorId,
          replyId: replyObj.id,
          delivered: true
        })
      };
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: e.message })
      };
    }
  }

  // 6. GET /api/support/active-threads
  if (isActiveThreads && method === 'GET') {
    const chats = await getChats();
    const list = Object.values(chats).sort((a, b) => new Date(b.lastActive || b.createdAt) - new Date(a.lastActive || a.createdAt));
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        total: list.length,
        threads: list
      })
    };
  }

  // Fallback for root /api/support
  const fallbackSettings = await getGatewaySettings();
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      service: 'Support Gateway API',
      settings: fallbackSettings
    })
  };
};
