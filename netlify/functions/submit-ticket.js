const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Missed Call Auto SMS <support@missedcallautosms.com>';

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'contactus@offgridmediagroup.com';
const LOCAL_CACHE_PATH = path.join(__dirname, '../../.support_tickets_cache.json');

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

// Local cache helper
function readLocalCache() {
  try {
    if (fs.existsSync(LOCAL_CACHE_PATH)) {
      const raw = fs.readFileSync(LOCAL_CACHE_PATH, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {}
  return [];
}

function saveLocalCache(ticket) {
  try {
    const list = readLocalCache();
    list.unshift(ticket);
    const trimmed = list.slice(0, 100);
    fs.writeFileSync(LOCAL_CACHE_PATH, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (e) {}
}

function sendViaResend(apiKey, fromEmail, toEmail, subject, htmlContent) {
  if (!apiKey) return Promise.resolve({ skipped: true, reason: 'No RESEND_API_KEY' });
  return new Promise((resolve, reject) => {
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
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            resolve({ error: json.message || body });
          }
        } catch (e) {
          resolve({ error: 'HTTP ' + res.statusCode + ': ' + body });
        }
      });
    });

    req.on('error', err => resolve({ error: err.message }));
    req.write(payload);
    req.end();
  });
}

function generateOwnerEmailHtml(ticket) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; padding: 24px;">
  <div style="max-width: 620px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 14px; padding: 28px;">
    <div style="border-bottom: 1px solid #222836; padding-bottom: 16px; margin-bottom: 20px;">
      <span style="background: ${ticket.priority === 'Urgent' ? '#FF5252' : '#00E676'}; color: #000; font-weight: bold; font-size: 11px; padding: 4px 10px; border-radius: 12px; text-transform: uppercase;">${ticket.priority} Priority</span>
      <h2 style="color: #FFF; margin: 12px 0 4px 0; font-size: 20px;">New Support Ticket: ${ticket.ticketId}</h2>
      <div style="color: #949BAE; font-size: 13px;">Submitted on ${new Date(ticket.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} EST</div>
    </div>

    <div style="margin-bottom: 20px;">
      <p style="margin: 4px 0; font-size: 14px; color: #CBD5E0;"><strong>Customer:</strong> ${ticket.name} (<a href="mailto:${ticket.email}" style="color: #00E676;">${ticket.email}</a>)</p>
      <p style="margin: 4px 0; font-size: 14px; color: #CBD5E0;"><strong>Category:</strong> ${ticket.category}</p>
      ${ticket.licenseKey ? `<p style="margin: 4px 0; font-size: 14px; color: #CBD5E0;"><strong>License Key:</strong> <code style="color: #00E676; background: #090B0E; padding: 2px 6px; border-radius: 4px;">${ticket.licenseKey}</code></p>` : ''}
      ${ticket.deviceInfo ? `<p style="margin: 4px 0; font-size: 14px; color: #CBD5E0;"><strong>Device Info:</strong> ${ticket.deviceInfo}</p>` : ''}
      <p style="margin: 4px 0; font-size: 14px; color: #CBD5E0;"><strong>Subject:</strong> ${ticket.subject}</p>
    </div>

    <div style="background: #090B0E; border: 1px solid #222836; border-radius: 8px; padding: 18px; margin-bottom: 24px;">
      <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 8px;">Message Description:</div>
      <div style="white-space: pre-wrap; color: #FFF; font-size: 14px; line-height: 1.6;">${ticket.message}</div>
    </div>

    <div style="text-align: center;">
      <a href="mailto:${ticket.email}?subject=Re: [${ticket.ticketId}] ${encodeURIComponent(ticket.subject)}" style="display: inline-block; background: #00E676; color: #000; font-weight: bold; padding: 12px 28px; border-radius: 24px; text-decoration: none; font-size: 14px;">
        Reply to Customer Directly
      </a>
    </div>
  </div>
</body>
</html>`;
}

function generateCustomerEmailHtml(ticket) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 14px; padding: 28px;">
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="font-size: 36px; margin-bottom: 6px;">📱</div>
      <h2 style="color: #00E676; margin: 0; font-size: 22px;">Support Request Received</h2>
      <p style="color: #949BAE; font-size: 13px; margin-top: 4px;">Missed Call Auto SMS Technical Support</p>
    </div>

    <div style="background: #1A202C; border-left: 4px solid #00E676; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
      <p style="margin: 0; color: #FFF; font-size: 15px; font-weight: bold;">Hello ${ticket.name},</p>
      <p style="margin: 6px 0 0 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
        We have received your support request regarding "<strong>${ticket.subject}</strong>". An engineer is reviewing your inquiry and will follow up shortly.
      </p>
    </div>

    <div style="background: #090B0E; border: 1px dashed #00E676; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 20px;">
      <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 4px;">Your Ticket Reference ID</div>
      <div style="font-family: monospace; font-size: 22px; color: #00E676; font-weight: bold;">${ticket.ticketId}</div>
      <div style="font-size: 12px; color: #718096; margin-top: 4px;">Expected response time: Under 4 business hours</div>
    </div>

    <div style="border-top: 1px solid #222836; padding-top: 16px; color: #949BAE; font-size: 13px; line-height: 1.6;">
      <p style="margin: 0 0 6px 0;"><strong>Need to add extra details?</strong> Simply reply to this email with any screenshots or error logs and reference ticket <code>${ticket.ticketId}</code>.</p>
    </div>

    <div style="margin-top: 24px; border-top: 1px solid #222836; padding-top: 16px; text-align: center; font-size: 12px; color: #718096;">
      Missed Call Auto SMS • <a href="https://missedcallautosms.com/developers" style="color: #00E676; text-decoration: none;">Developer Docs</a> • <a href="https://missedcallautosms.com/support" style="color: #00E676; text-decoration: none;">Helpdesk</a>
    </div>
  </div>
</body>
</html>`;
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

  // GET: Fetch recent tickets (for Owner Admin Dashboard)
  if (event.httpMethod === 'GET') {
    const db = initFirebase();
    let tickets = [];
    if (db) {
      try {
        const snap = await db.collection('support_tickets').orderBy('createdAt', 'desc').limit(50).get();
        snap.forEach(doc => tickets.push(doc.data()));
      } catch (e) {
        console.warn('Firestore read failed, using local cache:', e.message);
        tickets = readLocalCache();
      }
    } else {
      tickets = readLocalCache();
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        tickets: tickets,
        count: tickets.length
      })
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON payload' }) };
  }

  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const subject = (body.subject || '').trim();
  const message = (body.message || '').trim();
  const category = (body.category || 'General Support').trim();
  const priority = (body.priority || 'Normal').trim();
  const licenseKey = (body.licenseKey || body.license_key || '').trim().toUpperCase();
  const deviceInfo = (body.deviceInfo || body.device_info || '').trim();

  if (!name || !email || !subject || !message) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: 'Missing required fields',
        message: 'Name, email, subject, and message are required.'
      })
    };
  }

  if (!email.includes('@') || !email.includes('.')) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid email address' })
    };
  }

  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  const ticketId = 'MCAS-TICK-' + randomSuffix;
  const now = new Date().toISOString();

  const ticketData = {
    ticketId,
    name,
    email,
    subject,
    message,
    category,
    priority,
    licenseKey: licenseKey || null,
    deviceInfo: deviceInfo || null,
    status: 'Open',
    createdAt: now,
    updatedAt: now
  };

  saveLocalCache(ticketData);

  const db = initFirebase();
  if (db) {
    try {
      await db.collection('support_tickets').doc(ticketId).set(ticketData);
    } catch (e) {
      console.warn('Firestore write error (cached locally):', e.message);
    }
  }

  const reqHeaders = event.headers || {};
  const resendKey = reqHeaders['x-resend-key'] || RESEND_API_KEY;

  if (resendKey) {
    try {
      await sendViaResend(
        resendKey,
        FROM_EMAIL,
        OWNER_EMAIL,
        '[' + ticketId + '] [' + priority + '] ' + category + ': ' + subject,
        generateOwnerEmailHtml(ticketData)
      );

      await sendViaResend(
        resendKey,
        FROM_EMAIL,
        email,
        '[' + ticketId + '] Support Request Received: ' + subject,
        generateCustomerEmailHtml(ticketData)
      );
    } catch (emailErr) {
      console.warn('Resend email dispatch error:', emailErr.message);
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      ticketId,
      message: 'Support ticket ' + ticketId + ' created successfully. Our team will follow up at ' + email + '.'
    })
  };
};
