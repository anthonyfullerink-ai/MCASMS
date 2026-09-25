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
const MEMORY_THREAD_CACHE = new Map();

let firestoreDb = null;
let messagingService = null;

function initFirebase() {
  if (!initializeApp) return { db: null, msg: null };
  try {
    if (getApps().length === 0) {
      const saRaw = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
      if (saRaw && saRaw.startsWith('{')) {
        const sa = JSON.parse(saRaw);
        initializeApp({
          credential: cert(sa),
          projectId: sa.project_id || PROJECT_ID
        });
        firestoreDb = getFirestore();
        messagingService = getMessaging();
      } else {
        return { db: null, msg: null };
      }
    } else {
      if (!firestoreDb) {
        try { firestoreDb = getFirestore(); } catch (e) { firestoreDb = null; }
      }
      if (!messagingService) {
        try { messagingService = getMessaging(); } catch (e) { messagingService = null; }
      }
    }
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
 * Call Gemini API with Multi-Model Fallback
 */
const CANDIDATE_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.8-flash'
];

async function callGemini(contents, systemInstruction, apiKey) {
  let lastError = null;
  for (const model of CANDIDATE_MODELS) {
    try {
      const res = await callGeminiModel(model, contents, systemInstruction, apiKey);
      if (res && res.trim().length > 0) {
        return res.trim();
      }
    } catch (err) {
      lastError = err;
      console.warn(`[sms-chat] Model ${model} failed (${err.message}). Trying next candidate...`);
    }
  }
  throw lastError || new Error('All Gemini candidate models failed');
}

function callGeminiModel(model, contents, systemInstruction, apiKey) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: contents,
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1000,
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    });

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

    // Action: Clear Takeover / Reset Queue Cooldowns
    if (payload.action === 'clear_takeover' || payload.action === 'reset_queue') {
      const { db } = initFirebase();
      if (db) {
        try {
          if (senderPhone && senderPhone !== 'ALL') {
            const cleanPhone = senderPhone.replace(/[^0-9+]/g, '');
            const threadId = `${licenseKey || 'GLOBAL'}_${cleanPhone}`;
            await db.collection('ai_sms_conversations').doc(threadId).set({
              humanTakeoverUntil: 0,
              aiReplyCount: 0,
              lastResetAt: Date.now()
            }, { merge: true });
            console.log(`⚡ [TAKEOVER CLEARED] Thread ${threadId} unpaused immediately.`);
          } else if (licenseKey) {
            const snapshot = await db.collection('ai_sms_conversations').where('licenseKey', '==', licenseKey).get();
            const batch = db.batch();
            snapshot.forEach(doc => {
              batch.set(doc.ref, { humanTakeoverUntil: 0, aiReplyCount: 0, lastResetAt: Date.now() }, { merge: true });
            });
            await batch.commit();
            console.log(`⚡ [ALL TAKEOVERS CLEARED] Reset all conversations for license ${licenseKey}.`);
          }
        } catch (e) {
          console.warn('[sms-chat] Failed to clear takeover:', e.message);
        }
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, cleared: true })
      };
    }

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

    // Fetch conversation thread history: Phone device payload -> RAM cache -> Firestore
    const cleanPhone = senderPhone.replace(/[^0-9+]/g, '');
    const threadId = `${licenseKey || 'GLOBAL'}_${cleanPhone}`;
    let threadHistory = [];
    let replyCount = 0;
    let threadRef = null;

    // 1. Primary: Ingest authentic verified history from phone's Telephony SMS database
    if (Array.isArray(payload.conversationHistory) && payload.conversationHistory.length > 0) {
      threadHistory = payload.conversationHistory
        .filter(m => m && m.text && m.text.trim())
        .map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          text: m.text.trim()
        }));
      console.log(`📱 [DEVICE MEMORY INGESTED] Loaded ${threadHistory.length} turns from phone SMS store for ${cleanPhone}`);
    } else if (MEMORY_THREAD_CACHE.has(cleanPhone)) {
      // 2. RAM Cache fallback
      threadHistory = MEMORY_THREAD_CACHE.get(cleanPhone) || [];
      console.log(`🧠 [RAM CACHE INGESTED] Loaded ${threadHistory.length} turns from memory cache for ${cleanPhone}`);
    }

    if (db) {
      try {
        threadRef = db.collection('ai_sms_conversations').doc(threadId);

        // Handle explicit manual takeover action
        if (payload.action === 'human_takeover' || payload.humanTakeover) {
          const takeoverUntil = Date.now() + (24 * 60 * 60 * 1000); // Mute AI for 24 hours
          await threadRef.set({
            licenseKey,
            senderPhone: cleanPhone,
            humanTakeoverUntil: takeoverUntil,
            lastTakeoverAt: Date.now()
          }, { merge: true });
          console.log(`🛑 [MANUAL TAKEOVER] Thread ${threadId} muted for 24 hours until ${new Date(takeoverUntil).toISOString()}`);
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, muted: true, humanTakeoverUntil: takeoverUntil })
          };
        }

        const threadDoc = await threadRef.get();
        if (threadDoc.exists) {
          const tData = threadDoc.data();

          // Check if active human takeover mute window is still ongoing
          if (tData.humanTakeoverUntil && Date.now() < tData.humanTakeoverUntil) {
            console.log(`🛑 [HUMAN TAKEOVER ACTIVE] Thread ${threadId} muted until ${new Date(tData.humanTakeoverUntil).toISOString()}. Skipping AI.`);
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ success: true, replied: false, reason: 'human_takeover_active' })
            };
          }

          const lastMessageAt = tData.lastMessageAt || 0;
          const isOlderThan24h = (Date.now() - lastMessageAt) > (24 * 60 * 60 * 1000);

          if (isOlderThan24h) {
            console.log(`🔄 [24H SESSION RESET] Thread ${threadId} last message was >24h ago (${new Date(lastMessageAt).toISOString()}). Resetting reply count for returning customer.`);
            replyCount = 0;
            threadHistory = [];
          } else {
            if (threadHistory.length === 0) {
              threadHistory = tData.messages || [];
            }
            replyCount = tData.aiReplyCount || 0;
          }
        }
      } catch (err) {
        console.warn('[sms-chat] Conversation history read error:', err.message);
      }
    }

    // Enforce safety reply ceiling (e.g. max 5 back-and-forth replies in an active session)
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
    const recentHistory = threadHistory.slice(-10); // last 10 turns
    for (const item of recentHistory) {
      if (!item.text || !item.text.trim()) continue;
      contents.push({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.text.trim() }]
      });
    }
    // Append the new incoming user message
    contents.push({
      role: 'user',
      parts: [{ text: messageBody }]
    });

    // Construct tailored system instructions based on Business Service Type
    let systemInstruction = `You are a helpful, human-sounding AI Front Desk Assistant for a local business communicating with a client via SMS text message.
Keep replies strictly to 1 or 2 concise, natural sentences. Sound like a real person working the front desk—warm, attentive, and practical. Never use Markdown formatting like **bold** or # headings or bullet lists because this will be sent as a plain SMS.

CRITICAL CONVERSATIONAL RULES:
1. CONVERSATION CONTINUITY & CONTEXT RETENTION (STRICT MANDATE):
   - You MUST maintain full context across previous turns in this conversation.
   - If the customer already stated their problem, project, or issue in an earlier message (e.g., they have an active leak, water issue, broken heater/AC, need a haircut, need detailing/mechanic, etc.), DO NOT ask them what kind of project, service, or repair they are looking to get done! You already know!
   - When answering follow-up questions like pricing, availability, or dispatch, directly reference their specific issue (e.g., "For a leak repair, our technician will provide a clear upfront estimate on-site before starting any work. Where are you located so we can get someone out to look at it?").
2. ALWAYS ANSWER THE PROSPECT'S QUESTION DIRECTLY FIRST:
   - If they ask "Are you open today?" or ask about hours: Answer clearly and directly (e.g. "Yes, we are open today and ready to help! What can we do for you?").
   - If they ask about pricing or costs: Explain the pricing/estimate structure for their specific issue clearly.
   - If they send a casual greeting ("Hi", "Hello", "Yo"): Greet them warmly and ask how you can help them today.
3. PIVOT NATURALLY - DO NOT FORCE APPOINTMENTS PREMATURELY:
   - NEVER ask for their street address on casual greetings or basic informational questions unless the customer explicitly asked for an appointment, quote, or technician visit!
   - Meet them where they are in the conversation.
`;

    if (businessType === 'IN_SHOP') {
      systemInstruction += `
BUSINESS TYPE: IN-SHOP / STUDIO / STOREFRONT LOCATION.
- We have a fixed physical location.
${shopAddress ? `- Our location is: ${shopAddress}.` : `- We operate out of our local studio.`}
${shopInstructions ? `- Arrival / parking notes: ${shopInstructions}` : ``}
- Only offer specific appointment times when they indicate they want to book or come in.
- If the customer confirms a specific appointment slot or time, append [BOOKING: {"service":"requested service", "time":"slot confirmed", "location":"${shopAddress || 'In-Shop'}"}] at the very end of your response.
`;
    } else {
      // MOBILE_TRADE
      systemInstruction += `
BUSINESS TYPE: MOBILE FIELD TRADE (e.g., Plumber, Electrician, HVAC, Contractor, Handyman, Mobile Mechanic).
- We travel directly to the client's home or job site.
- NEVER disclose a storefront or shop address.
- Only when the customer asks for a service, estimate, or technician visit: politely ask for their address and suggest a 2-hour arrival window (e.g. "between 9 AM - 11 AM").
- If the customer confirms a specific day, arrival window, and their address, append [BOOKING: {"service":"requested service", "time":"arrival window", "address":"client street address"}] at the very end of your response.
`;
    }

    if (isEmergency) {
      systemInstruction += `
NOTE: The customer's message indicates an urgent or emergency situation. Acknowledge the emergency with urgency, reassure them that our team is on alert, and ask for their exact address if not already provided.
`;
    }

    // Resolve API key with multiple fallbacks
    const apiKey = process.env.GEMINI_API_KEY || 
                   process.env.GEMINI_KEY || 
                   process.env.GOOGLE_API_KEY || 
                   process.env.GOOGLE_GEMINI_API_KEY || 
                   process.env.GEMINI_SECRET || '';

    let aiReply = '';

    if (apiKey) {
      try {
        aiReply = await callGemini(contents, systemInstruction, apiKey);
      } catch (geminiErr) {
        console.warn('[sms-chat] Gemini call failed:', geminiErr.message);
      }
    }

    // Contextual Fallback reply if AI calls completely fail
    if (!aiReply) {
      const lower = messageBody.toLowerCase();
      if (lower.includes('open') || lower.includes('hour') || lower.includes('today') || lower.includes('tomorrow') || lower.includes('available') || lower.includes('time')) {
        aiReply = `Hi there! Yes, we're open and available to help today. What can we do for you?`;
      } else if (lower.includes('price') || lower.includes('cost') || lower.includes('quote') || lower.includes('rate') || lower.includes('how much')) {
        aiReply = `Thanks for reaching out! What specific service or project do you need so we can give you an accurate estimate?`;
      } else if (lower.length < 15 && (lower.includes('hi') || lower.includes('hello') || lower.includes('hey') || lower.includes('yo'))) {
        aiReply = `Hey there! Thanks for reaching out. How can we help you today?`;
      } else if (businessType === 'IN_SHOP') {
        aiReply = `Thanks for reaching out! How can we help you today? We're located at ${shopAddress || 'our studio'}.`;
      } else {
        aiReply = `Thanks for reaching out! How can we help you today?`;
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

    // Persist conversation update to RAM cache and Firestore
    const updatedMessages = [
      ...threadHistory,
      { role: 'user', text: messageBody, timestamp: Date.now() },
      { role: 'assistant', text: aiReply, timestamp: Date.now() }
    ];
    MEMORY_THREAD_CACHE.set(cleanPhone, updatedMessages.slice(-20));

    if (db && threadRef) {
      try {
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
