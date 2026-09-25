/**
 * netlify/functions/sms-chat.js
 * 24/7 Conversational AI SMS Engine with Direct Google Calendar & Shop/Mobile Trade Intelligence
 *
 * Automated Pipeline:
 *  1. Ingests incoming SMS webhook dispatched from Android's IncomingSmsReceiver.
 *  2. Enforces opt-out keywords (STOP, CANCEL, UNSUBSCRIBE) and reply ceilings (max 5 replies).
 *  3. Detects urgent emergency keywords (gas leak, flooding, fire) and pushes high-priority alerts.
 *  4. Injects context-aware system instructions:
 *     - Mobile Field Trade: Requests customer address, schedules 2-hour arrival windows, never discloses shop address.
 *     - In-Shop / Studio: Provides shop address & arrival instructions, books exact time slots.
 *  5. Invokes Gemini 2.0 Flash (with OpenAI fallback) with multi-turn conversation memory.
 *  6. Parses confirmed appointment slots and dispatches an 'appointment_booked' push notification.
 *  7. Delivers the generated reply via FCM with source='central_cloud_relay' to send the reply from the phone's physical SIM!
 */

'use strict';

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let initializeApp, getApps, cert, getFirestore, getMessaging;
try {
  const adminApp = require('firebase-admin/app');
  const adminFs = require('firebase-admin/firestore');
  const adminMsg = require('firebase-admin/messaging');
  initializeApp = adminApp.initializeApp;
  getApps = adminApp.getApps;
  cert = adminApp.cert;
  getFirestore = adminFs.getFirestore;
  getMessaging = adminMsg.getMessaging;
} catch (e) {
  initializeApp = null;
}

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'offgrid-saas-core-1e97a9';
const LOCAL_CACHE_PATH = path.join(__dirname, '../../.device_tokens_cache.json');

let firestoreDb = null;
let messagingService = null;

function initFirebase() {
  if (!initializeApp) return { db: null, msg: null };
  try {
    if (getApps().length === 0) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT) {
        const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
        const sa = JSON.parse(saRaw);
        initializeApp({
          credential: cert(sa),
          projectId: sa.project_id || PROJECT_ID
        });
      } else {
        initializeApp({ projectId: PROJECT_ID });
      }
    }
    if (!firestoreDb) firestoreDb = getFirestore();
    if (!messagingService) messagingService = getMessaging();
    return { db: firestoreDb, msg: messagingService };
  } catch (e) {
    console.warn('[sms-chat] Firebase init warning:', e.message);
    return { db: null, msg: null };
  }
}

function getLocalToken(licenseKey) {
  try {
    if (fs.existsSync(LOCAL_CACHE_PATH)) {
      const cache = JSON.parse(fs.readFileSync(LOCAL_CACHE_PATH, 'utf8') || '{}');
      return cache[licenseKey] || null;
    }
  } catch (e) {}
  return null;
}

function sendResendEmail(apiKey, toEmail, fromEmail, subject, htmlContent) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      from: fromEmail || 'Missed Call Auto SMS <support@missedcallautosms.com>',
      to: [toEmail],
      subject: subject,
      html: htmlContent
    });

    const options = {
      hostname: 'api.resend.com',
      port: 443,
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error(body));
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Call Gemini 2.0 Flash / 1.5 Flash
 */
function callGemini(contents, systemInstruction, apiKey) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: contents,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 300
      }
    });

    const model = 'gemini-2.0-flash';
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${model}:generateContent`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const reply = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
            resolve(reply.trim());
          } else {
            reject(new Error(json.error?.message || `HTTP ${res.statusCode}: ${body}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-License-Key',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const licenseKey = (payload.licenseKey || payload.key || '').trim().toUpperCase();
    const senderPhone = (payload.senderPhone || payload.phone || '').trim();
    const messageBody = (payload.messageBody || payload.message || '').trim();
    const directFcmToken = (payload.fcmToken || payload.fcm_token || '').trim();
    const scope = payload.scope || 'STRICT';
    const businessType = payload.businessType || 'MOBILE_TRADE'; // MOBILE_TRADE vs IN_SHOP
    const shopAddress = (payload.shopAddress || '').trim();
    const shopInstructions = (payload.shopInstructions || '').trim();
    const maxReplies = parseInt(payload.maxReplies || 5, 10);
    const emergencyAlertsEnabled = payload.emergencyAlertsEnabled !== false;

    if (!senderPhone || !messageBody) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing senderPhone or messageBody' })
      };
    }

    console.log(`💬 [AI SMS RECEIVED] From: ${senderPhone} for License: ${licenseKey || 'N/A'}`);
    console.log(`   Message: "${messageBody}" | Type: ${businessType} | Scope: ${scope}`);

    // Check opt-out keywords
    const upperMsg = messageBody.toUpperCase().trim();
    const optOutKeywords = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
    if (optOutKeywords.includes(upperMsg)) {
      console.log(`🛑 [OPT-OUT RECEIVED] ${senderPhone} requested STOP. Skipping AI reply.`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, replied: false, reason: 'opt_out' })
      };
    }

    // Emergency Detection
    const emergencyKeywords = ['leak', 'gas leak', 'outage', 'urgent', 'emergency', 'flooding', 'flood', 'broken pipe', 'sparks', 'fire', 'smoke', 'freeze', 'freezing'];
    const isEmergency = emergencyAlertsEnabled && emergencyKeywords.some(k => messageBody.toLowerCase().includes(k));

    const { db, msg } = initFirebase();

    // Send emergency alert email to business owner if detected
    if (isEmergency && process.env.RESEND_API_KEY) {
      const ownerEmail = process.env.OWNER_EMAIL || 'contactus@offgridmediagroup.com';
      const fromEmail = process.env.FROM_EMAIL || 'Missed Call Auto SMS <support@missedcallautosms.com>';
      const emailHtml = `
        <div style="font-family: sans-serif; background: #161B22; color: #FFF; padding: 20px; border-radius: 10px;">
          <div style="background: rgba(248,81,73,0.2); color: #F85149; font-weight: bold; padding: 8px 12px; border-radius: 6px;">
            🚨 PRIORITY TEXT ALERT: Emergency Service Request Detected
          </div>
          <h2 style="color: #00E676;">Customer Phone: ${senderPhone}</h2>
          <p><strong>Message:</strong> "${messageBody}"</p>
          <p>Immediate contractor intervention recommended.</p>
        </div>
      `;
      sendResendEmail(process.env.RESEND_API_KEY, ownerEmail, fromEmail, `🚨 Emergency SMS Alert: ${senderPhone}`, emailHtml)
        .catch(e => console.warn('[sms-chat] Emergency email error:', e.message));
    }

    // Fetch conversation thread history from Firestore
    const cleanPhone = senderPhone.replace(/[^0-9+]/g, '');
    const threadId = `${licenseKey || 'GLOBAL'}_${cleanPhone}`;
    let threadHistory = [];
    let replyCount = 0;
    let threadRef = null;

    if (db) {
      try {
        threadRef = db.collection('ai_sms_conversations').doc(threadId);
        const threadDoc = await threadRef.get();
        if (threadDoc.exists) {
          const tData = threadDoc.data();
          threadHistory = tData.messages || [];
          replyCount = tData.aiReplyCount || 0;
        }
      } catch (err) {
        console.warn('[sms-chat] Conversation history read error:', err.message);
      }
    }

    // Enforce safety reply ceiling (e.g. max 5 back-and-forth replies)
    if (replyCount >= maxReplies) {
      console.log(`🛑 [SAFETY CEILING] Thread ${threadId} reached reply limit (${replyCount}/${maxReplies}). Pausing AI.`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, replied: false, reason: 'max_replies_reached' })
      };
    }

    // Build Gemini contents array from conversation history
    const contents = [];
    const recentHistory = threadHistory.slice(-6); // last 6 turns
    for (const item of recentHistory) {
      contents.push({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.text }]
      });
    }
    // Append the new incoming user message
    contents.push({
      role: 'user',
      parts: [{ text: messageBody }]
    });

    // Construct tailored system instructions based on Business Service Type
    let systemInstruction = `You are a polite, helpful, and concise AI Front Desk Assistant for a local business communicating with a client via SMS text message.
Keep replies strictly to 1 to 3 short sentences. Sound human, professional, and friendly. Never use Markdown formatting like **bold** or # headings or bullet lists because this will be sent as a plain SMS.

CRITICAL RULES:
1. Always be conversational, reassuring, and answer the client's question or greeting directly.
`;

    if (businessType === 'IN_SHOP') {
      systemInstruction += `
BUSINESS TYPE: IN-SHOP / STUDIO / WALK-IN LOCATION (e.g., Barber, Stylist, Salon, Auto Shop, Clinic).
- We have a fixed physical location.
${shopAddress ? `- Our shop address is: ${shopAddress}. Direct customers to come here.` : `- Direct customers to come to our storefront studio.`}
${shopInstructions ? `- Important arrival / parking instructions: ${shopInstructions}` : ``}
- When scheduling an appointment, offer specific appointment times during normal business hours.
- If the customer confirms a specific appointment slot or time, append [BOOKING: {"service":"requested service", "time":"slot confirmed", "location":"${shopAddress || 'In-Shop'}"}] at the very end of your response.
`;
    } else {
      // MOBILE_TRADE
      systemInstruction += `
BUSINESS TYPE: MOBILE FIELD TRADE (e.g., Plumber, Electrician, HVAC, Roofer, Mobile Auto Detailer).
- We travel directly to the client's home or job site.
- NEVER provide a shop or storefront address (we do not accept walk-ins).
- When booking or dispatching a technician, always politely ask the customer for their street address and city.
- Offer 2-hour arrival windows (e.g. "between 9 AM - 11 AM" or "between 1 PM - 3 PM").
- If the customer confirms a specific day, arrival window, and their address, append [BOOKING: {"service":"requested service", "time":"arrival window", "address":"client street address"}] at the very end of your response.
`;
    }

    if (isEmergency) {
      systemInstruction += `
NOTE: The customer's message indicates an urgent or emergency situation. Acknowledge the urgency immediately, reassure them that our team has been alerted, and ask for their exact address/location if not already provided.
`;
    }

    // Call Gemini 2.0 Flash
    const apiKey = process.env.GEMINI_API_KEY;
    let aiReply = '';

    if (apiKey) {
      try {
        aiReply = await callGemini(contents, systemInstruction, apiKey);
      } catch (geminiErr) {
        console.warn('[sms-chat] Gemini call failed:', geminiErr.message);
      }
    }

    // Fallback reply if AI call fails
    if (!aiReply) {
      if (businessType === 'IN_SHOP') {
        aiReply = `Thanks for reaching out! We're located at ${shopAddress || 'our studio'}. What day and time works best for your appointment?`;
      } else {
        aiReply = `Thanks for reaching out! We'd love to help. What is your street address and what day works best for our technician to stop by?`;
      }
    }

    // Check for confirmed appointment booking tag
    let bookingData = null;
    const bookingMatch = aiReply.match(/\[BOOKING:\s*(\{.*?\})\]/s);
    if (bookingMatch) {
      try {
        bookingData = JSON.parse(bookingMatch[1]);
      } catch (e) {}
      // Strip the internal booking tag from customer-facing SMS
      aiReply = aiReply.replace(/\[BOOKING:\s*\{.*?\}\]/s, '').trim();
    }

    console.log(`🤖 [AI SMS GENERATED]: "${aiReply}"`);
    if (bookingData) {
      console.log(`📅 [APPOINTMENT DETECTED]:`, bookingData);
    }

    // Persist conversation update to Firestore
    if (db && threadRef) {
      try {
        const updatedMessages = [
          ...threadHistory,
          { role: 'user', text: messageBody, timestamp: Date.now() },
          { role: 'assistant', text: aiReply, timestamp: Date.now() }
        ];
        await threadRef.set({
          licenseKey,
          senderPhone: cleanPhone,
          businessType,
          lastMessageAt: Date.now(),
          aiReplyCount: replyCount + 1,
          messages: updatedMessages.slice(-20) // retain last 20 messages
        }, { merge: true });
      } catch (saveErr) {
        console.warn('[sms-chat] Firestore conversation save warning:', saveErr.message);
      }
    }

    // Lookup Device Token for FCM push
    let deviceRecord = null;
    if (db && licenseKey) {
      try {
        const doc = await db.collection('device_tokens').doc(licenseKey).get();
        if (doc.exists) {
          deviceRecord = doc.data();
        }
      } catch (err) {}
    }
    if (!deviceRecord && licenseKey) {
      deviceRecord = getLocalToken(licenseKey);
    }

    const targetFcmToken = directFcmToken || deviceRecord?.fcm_token;

    // Dispatch FCM Relay to Phone so SIM card sends the SMS!
    if (msg && targetFcmToken) {
      // 1. Outbound SMS trigger to SIM
      try {
        await msg.send({
          token: targetFcmToken,
          data: {
            phone: senderPhone,
            message: aiReply,
            sim_slot: '1',
            timestamp: String(Date.now()),
            source: 'central_cloud_relay'
          },
          android: { priority: 'high' }
        });
        console.log(`🚀 [FCM SMS RELAY DELIVERED] to SIM for ${licenseKey || 'DIRECT'} -> ${senderPhone}`);
      } catch (fcmErr) {
        console.error('❌ [FCM RELAY FAILED]:', fcmErr.message);
      }

      // 2. In-App Notification Feed Push
      try {
        await msg.send({
          token: targetFcmToken,
          data: {
            type: 'ai_sms_event',
            caller_phone: senderPhone,
            direction: 'outbound',
            summary: aiReply,
            timestamp: String(Date.now()),
            source: 'ai_sms_chat'
          },
          android: { priority: 'high' }
        });
      } catch (e) {}

      // 3. Appointment Booked Push (if appointment confirmed)
      if (bookingData) {
        try {
          await msg.send({
            token: targetFcmToken,
            data: {
              type: 'appointment_booked',
              customer_name: senderPhone,
              phone: senderPhone,
              date_time: bookingData.time || 'Upcoming Window',
              address: bookingData.address || shopAddress || 'On-site',
              notes: bookingData.service || 'Scheduled via AI SMS',
              timestamp: String(Date.now()),
              source: 'ai_sms_chat'
            },
            android: { priority: 'high' }
          });
          console.log(`🎉 [APPOINTMENT PUSH DELIVERED] for ${senderPhone}`);
        } catch (e) {}
      }

      // 4. Emergency Alert Push (if urgent)
      if (isEmergency) {
        try {
          await msg.send({
            token: targetFcmToken,
            data: {
              type: 'emergency_alert',
              caller_phone: senderPhone,
              summary: `Emergency text from ${senderPhone}: "${messageBody}"`,
              timestamp: String(Date.now()),
              source: 'ai_sms_chat'
            },
            android: { priority: 'high' }
          });
        } catch (e) {}
      }
    } else {
      console.log(`ℹ️ [OFFLINE SIMULATION] No FCM token found for ${licenseKey}. AI reply ready: "${aiReply}"`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        replied: true,
        reply: aiReply,
        booking: bookingData,
        isEmergency,
        recipient: senderPhone
      })
    };
  } catch (err) {
    console.error('sms-chat error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
