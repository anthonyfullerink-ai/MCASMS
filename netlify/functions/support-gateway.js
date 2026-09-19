const fs = require('fs');
const path = require('path');
const https = require('https');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Missed Call Auto SMS <onboarding@resend.dev>';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'contactus@offgridmediagroup.com';
const LOCAL_SETTINGS_CACHE = path.join(__dirname, '../../.support_gateway_settings_cache.json');
const LOCAL_CHATS_CACHE = path.join(__dirname, '../../.developer_support_chats_cache.json');

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

const DEFAULT_SETTINGS = {
  mode: 'AI_SUPPORT', // 'LIVE_SMS' | 'AI_SUPPORT'
  developerPhone: '+1 (732) 552-3896',
  developerEmail: 'contactus@offgridmediagroup.com',
  onlineHoursStart: 8,
  onlineHoursEnd: 22,
  updatedAt: new Date().toISOString()
};

async function getGatewaySettings() {
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

  try {
    if (fs.existsSync(LOCAL_SETTINGS_CACHE)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(LOCAL_SETTINGS_CACHE, 'utf8')) };
    }
  } catch (e) {}

  return DEFAULT_SETTINGS;
}

async function saveGatewaySettings(settings) {
  const db = initFirebase();
  if (db) {
    try {
      await db.collection('support_gateway_settings').doc('config').set(settings, { merge: true });
    } catch (e) {
      console.warn('Firestore write error for gateway settings:', e.message);
    }
  }

  try {
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-resend-key'
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
