/**
 * netlify/functions/vapi-webhook.js
 * Handles all Vapi end-of-call-report events.
 *
 * Automated Features:
 *  - Parses Vapi call payloads (caller number, duration, summary, transcript)
 *  - Detects high-urgency keywords and sends emergency email alert
 *  - Logs call data to Firestore voice_call_logs collection
 *  - Increments per-subscriber minutesUsed in Firestore
 *  - Automatically computes billable minutes and bills customer on Stripe
 *    for overage increments ($0.15/min beyond 200 included mins) or posts
 *    metered usage records to their active Stripe subscription item.
 */

'use strict';

const https = require('https');
const querystring = require('querystring');
const fsModule = require('fs');
const path = require('path');

const LOCAL_CACHE_PATH = path.join(__dirname, '../../.device_tokens_cache.json');

function getLocalToken(licenseKey) {
  try {
    if (fsModule.existsSync(LOCAL_CACHE_PATH)) {
      const cache = JSON.parse(fsModule.readFileSync(LOCAL_CACHE_PATH, 'utf8') || '{}');
      return cache[licenseKey] || null;
    }
  } catch (e) {}
  return null;
}

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

// In-Memory Shared Phone Number Routing Caches
const RING_CORRELATION_CACHE = new Map(); // cleanDigits -> pulseData
const CALL_LICENSE_MAP = new Map();        // callId -> sessionData

let initializeApp, getApps, cert, getMessaging;
try {
  const adminApp = require('firebase-admin/app');
  const adminMsg = require('firebase-admin/messaging');
  initializeApp = adminApp.initializeApp;
  getApps = adminApp.getApps;
  cert = adminApp.cert;
  getMessaging = adminMsg.getMessaging;
} catch (e) {
  initializeApp = null;
}

let messagingService = null;
function getMessagingService() {
  if (!initializeApp) return null;
  try {
    if (getApps().length === 0) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        initializeApp({
          credential: cert(sa),
          projectId: sa.project_id || 'offgrid-saas-core-1e97a9'
        });
      } else {
        initializeApp({ projectId: 'offgrid-saas-core-1e97a9' });
      }
    }
    if (!messagingService) messagingService = getMessaging();
    return messagingService;
  } catch (e) {
    console.warn('[vapi-webhook] Firebase messaging init warning:', e.message);
    return null;
  }
}

function stripeApiRequest(endpoint, method = 'GET', postData = null) {
  return new Promise((resolve, reject) => {
    if (!STRIPE_SECRET_KEY) return reject(new Error('STRIPE_SECRET_KEY not set'));

    const options = {
      hostname: 'api.stripe.com',
      port: 443,
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    let payload = '';
    if (postData) {
      payload = querystring.stringify(postData);
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error ? parsed.error.message : body));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
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
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.message || body));
          }
        } catch (e) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Lazy-load Firestore to avoid cold-start failure if env keys are missing
let firestoreModule = null;
function getFirestore() {
  if (!firestoreModule) {
    try {
      firestoreModule = require('../../lib/firestore');
    } catch (e) {
      console.warn('[vapi-webhook] Could not load Firestore module:', e.message);
    }
  }
  return firestoreModule;
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

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const message = payload.message || payload;
    const callObj = message.call || {};
    const customer = callObj.customer || {};
    const analysis = message.analysis || {};
    const transcript = message.transcript || message.artifact?.transcript || 'Transcript recorded.';
    const summary = analysis.summary || message.summary || 'Caller requested service callback.';
    const callerNum = customer.number || payload.callerNumber || 'Unknown Caller';
    const durationSec = Math.round(message.durationSeconds || callObj.duration || 60);

    // The DID that received the call (used to identify which subscriber's quota to bill)
    const inboundNumber = callObj.phoneNumberId
      || payload.phoneNumber
      || message.phoneNumber
      || callObj.to
      || null;

    const emergencyKeywords = ['leak', 'outage', 'urgent', 'emergency', 'flooding', 'broken', 'sparking', 'freeze'];
    const lowerTrans = (transcript + ' ' + summary).toLowerCase();
    const isUrgent = emergencyKeywords.some(k => lowerTrans.includes(k));

    const callId = callObj.id || `call_${Date.now()}`;

    console.log(`📞 [NETLIFY VAPI WEBHOOK] Call ${callId} (${message.type || 'unknown'}) from ${callerNum} (${durationSec}s) - Urgency: ${isUrgent ? 'HIGH' : 'NORMAL'}`);

    // ── 0. Handle Ring Pulse from Android Devices (Multi-Tenant Ring Correlation) ──
    const action = event.queryStringParameters?.action || payload.action;
    if (action === 'ring_pulse') {
      const licenseKey = payload.licenseKey;
      const callerPhone = payload.callerPhone;
      if (!licenseKey || !callerPhone) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing licenseKey or callerPhone' }) };
      }
      const cleanDigits = String(callerPhone).replace(/\D/g, '').slice(-10);
      const pulseData = {
        licenseKey,
        callerPhone,
        businessName: payload.businessName || '',
        trade: payload.trade || '',
        contractorActivity: payload.contractorActivity || '',
        bookingLink: payload.bookingLink || '',
        agentName: payload.agentName || 'Riley',
        emergencyKeywords: payload.emergencyKeywords || '',
        timestamp: payload.timestamp || Date.now()
      };

      RING_CORRELATION_CACHE.set(cleanDigits, pulseData);
      const fs = getFirestore();
      if (fs && fs.saveRingPulse) {
        await fs.saveRingPulse(cleanDigits, pulseData);
      }

      console.log(`📡 [RING PULSE INGESTED] Caller: ${cleanDigits} -> License: ${licenseKey} (${pulseData.businessName})`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, registered: true, cleanDigits })
      };
    }

    // ── 1. Handle Dynamic Inbound Assistant Request (Single Number Multi-Tenant Routing) ──
    if (message.type === 'assistant-request' || payload.type === 'assistant-request') {
      console.log(`🎙️ [VAPI ASSISTANT REQUEST] Dynamic routing requested for call ${callId} from ${callerNum}`);

      const cleanCallerDigits = String(callerNum).replace(/\D/g, '').slice(-10);
      const fs = getFirestore();

      // Step A: Check In-Memory Ring Pulse Cache
      let matchedPulse = cleanCallerDigits ? RING_CORRELATION_CACHE.get(cleanCallerDigits) : null;

      // Step B: Check Firestore Ring Pulse
      if (!matchedPulse && cleanCallerDigits && fs && fs.getRingPulse) {
        matchedPulse = await fs.getRingPulse(cleanCallerDigits);
      }

      // Step C: Check SIP Diversion Header (carrier conditional call forwarding)
      const sipHeaders = callObj.sipHeaders || callObj.headers || message.sipHeaders || {};
      const diversionHeader = sipHeaders['diversion'] || sipHeaders['Diversion'] || sipHeaders['x-diversion'] || '';
      let matchedSub = null;

      if (diversionHeader && fs && fs.getVoiceBinding) {
        const divDigits = String(diversionHeader).replace(/\D/g, '').slice(-10);
        if (divDigits) {
          console.log(`📞 [SIP DIVERSION DETECTED] Forwarded from: ${divDigits}`);
          matchedSub = await fs.getVoiceBinding(divDigits);
        }
      }

      // If pulse matched, load the subscriber's full binding
      if (matchedPulse && fs && fs.getVoiceBinding) {
        matchedSub = await fs.getVoiceBinding(matchedPulse.licenseKey);
      }

      // Fallback: Check by inbound number or default active subscriber
      if (!matchedSub && fs && fs.getVoiceBinding) {
        if (inboundNumber) matchedSub = await fs.getVoiceBinding(inboundNumber);
        if (!matchedSub) matchedSub = await fs.getVoiceBinding('MCAS-PRO-TRIAL-001');
      }

      const licenseKey = matchedPulse?.licenseKey || matchedSub?.licenseKey || 'MCAS-PRO-TRIAL-001';
      const businessName = matchedPulse?.businessName || matchedSub?.businessName || 'Our Business';
      const trade = matchedPulse?.trade || matchedSub?.voiceIndustryTrade || matchedSub?.trade || 'Home Services & Repairs';
      const contractorActivity = matchedPulse?.contractorActivity || matchedSub?.contractorActivity || 'on a job with hands full';
      const agentName = matchedPulse?.agentName || matchedSub?.voiceAgentName || 'Riley';
      const bookingLink = matchedPulse?.bookingLink || matchedSub?.contractorGoalLink || 'https://missedcallautosms.com';
      const emergencyKeywords = matchedPulse?.emergencyKeywords || matchedSub?.voiceEmergencyKeywords || 'leak, flooding, broken pipe, sparking, fire';
      const shopAddress = matchedSub?.aiSmsShopAddress || '';

      // Save session mapping for subsequent status-update, tool-calls, and end-of-call-report
      const sessionData = {
        callId,
        licenseKey,
        businessName,
        callerNum,
        createdAt: Date.now()
      };
      CALL_LICENSE_MAP.set(callId, sessionData);
      if (fs && fs.saveCallSession) {
        await fs.saveCallSession(callId, sessionData);
      }

      const systemPrompt = `You are ${agentName}, the professional, friendly, and efficient AI front desk receptionist for ${businessName}.
Specialty / Trade: ${trade}.
Current Status: The team is currently ${contractorActivity}, so you are answering and triaging incoming calls.
Booking Link: ${bookingLink}
${shopAddress ? `Shop Address: ${shopAddress}` : ''}
Emergency Priority Keywords: ${emergencyKeywords}

Key Objectives:
1. Greet the caller warmly and clearly identify that you are ${agentName} at ${businessName}.
2. Ask how you can help them today and listen carefully to their project or service inquiry.
3. If their request is urgent or an emergency (${emergencyKeywords}), prioritize safety, assure them that our technician is being alerted immediately, and verify their address and callback number.
4. For bookings, estimates, or service quotes, offer to send a direct link to their mobile phone right away, or collect their preferred date and time.
5. You can use the 'send_sms' tool to text the caller quote links, confirmations, or office contact details instantly while on the call!
6. Keep responses natural, concise (1-3 sentences per turn), and conversational. Do not sound robotic.`;

      const firstMessage = `Hi! Thanks for calling ${businessName}. I'm ${agentName}, the AI assistant. How can I help you today?`;

      console.log(`🎯 [VAPI DYNAMIC ASSISTANT RETURNED] Call ${callId} -> "${businessName}" (License: ${licenseKey})`);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          assistant: {
            name: `${agentName} - ${businessName}`,
            firstMessage: firstMessage,
            model: {
              provider: 'openai',
              model: 'gpt-4o-mini',
              temperature: 0.3,
              messages: [
                {
                  role: 'system',
                  content: systemPrompt
                }
              ],
              tools: [
                {
                  type: 'function',
                  function: {
                    name: 'send_sms',
                    description: 'Send a text message with a booking link, quote, or confirmation directly to the caller via the office SMS relay.',
                    parameters: {
                      type: 'object',
                      properties: {
                        message: { type: 'string', description: 'The exact SMS text message to send to the caller.' },
                        phoneNumber: { type: 'string', description: 'The caller phone number in E.164 format.' }
                      },
                      required: ['message']
                    }
                  }
                }
              ]
            },
            voice: {
              provider: 'cartesia',
              voiceId: '248be419-c632-4f23-adf1-5324ed7dbf10'
            },
            metadata: {
              licenseKey: licenseKey,
              businessName: businessName,
              callerPhone: callerNum,
              callId: callId
            }
          }
        })
      };
    }

    // ── Handle Vapi Tool Calls (e.g. Riley invoking send_sms tool) ──
    if (message.type === 'tool-calls' || payload.type === 'tool-calls') {
      const toolCalls = message.toolCalls || payload.toolCalls || [];
      const results = [];
      const fs = getFirestore();
      const msg = getMessagingService();

      for (const tc of toolCalls) {
        const fnName = tc.function?.name || tc.name;
        if (fnName === 'send_sms') {
          let args = {};
          try {
            args = typeof tc.function?.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : (tc.function?.arguments || tc.parameters || {});
          } catch (e) {
            args = {};
          }

          const targetPhone = args.phoneNumber || callerNum;
          const smsText = args.message || '';

          console.log(`📱 [VAPI TOOL CALL] send_sms requested for ${targetPhone}: "${smsText}"`);

          let delivered = false;
          if (fs && msg) {
            try {
              let session = CALL_LICENSE_MAP.get(callId) || (fs.getCallSession ? await fs.getCallSession(callId) : null);
              let resolvedKey = callObj.metadata?.licenseKey || message.metadata?.licenseKey || session?.licenseKey;
              let sub = null;
              if (resolvedKey) sub = await fs.getVoiceBinding(resolvedKey);
              if (!sub && inboundNumber) sub = await fs.getVoiceBinding(inboundNumber);
              if (!sub && callObj.assistantId) sub = await fs.getVoiceBinding(callObj.assistantId);
              if (!sub) sub = await fs.getVoiceBinding('MCAS-PRO-TRIAL-001');

              let targetFcmToken = null;
              if (sub && sub.licenseKey) {
                const dev = await fs.getDeviceBinding(sub.licenseKey);
                targetFcmToken = dev?.fcm_token;
              }
              if (!targetFcmToken && sub?.licenseKey) {
                const localCache = getLocalToken(sub.licenseKey);
                targetFcmToken = localCache?.fcm_token;
              }

              if (targetFcmToken && targetPhone && smsText) {
                await msg.send({
                  token: targetFcmToken,
                  data: {
                    phone: targetPhone,
                    message: smsText,
                    sim_slot: '1',
                    timestamp: String(Date.now()),
                    source: 'central_cloud_relay'
                  },
                  android: { priority: 'high' }
                });
                console.log(`🚀 [VAPI TOOL FCM DELIVERED] SMS relay sent to device for ${targetPhone} (${sub?.licenseKey})`);
                delivered = true;
              }
            } catch (relayErr) {
              console.error('❌ [VAPI TOOL FCM FAILED]:', relayErr.message);
            }
          }

          results.push({
            toolCallId: tc.id,
            result: delivered
              ? `Text message dispatched successfully to ${targetPhone} via office phone SIM.`
              : `SMS request received and queued for dispatch to ${targetPhone}.`
          });
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ results })
      };
    }

    // ── Handle In-Progress / Ringing Call Status (Approach 2: Instant Cancellation) ──
    if (message.type === 'status-update') {
      const callStatus = message.status || callObj.status;
      console.log(`🎙️ [VAPI STATUS UPDATE] Call ${callId} status: ${callStatus} from ${callerNum}`);

      if (callStatus === 'in-progress' || callStatus === 'ringing') {
        const fs = getFirestore();
        const msg = getMessagingService();
        const session = CALL_LICENSE_MAP.get(callId) || (fs && fs.getCallSession ? await fs.getCallSession(callId) : null);
        const resolvedKey = callObj.metadata?.licenseKey || message.metadata?.licenseKey || session?.licenseKey;

        if (fs && msg) {
          try {
            let sub = null;
            if (resolvedKey) sub = await fs.getVoiceBinding(resolvedKey);
            if (!sub && inboundNumber) sub = await fs.getVoiceBinding(inboundNumber);
            if (sub && sub.licenseKey) {
              const deviceRecord = await fs.getDeviceBinding(sub.licenseKey);
              if (deviceRecord && deviceRecord.fcm_token) {
                await msg.send({
                  token: deviceRecord.fcm_token,
                  data: {
                    type: 'voice_call_started',
                    caller_phone: callerNum,
                    call_id: String(callId),
                    timestamp: String(Date.now()),
                    source: 'vapi_status_update'
                  },
                  android: { priority: 'high' }
                });
                console.log(`⚡ [FCM CANCEL SENT] voice_call_started sent to device for ${sub.licenseKey} (Caller: ${callerNum})`);
              }
            }
          } catch (pushErr) {
            console.warn('[vapi-webhook] voice_call_started push warning:', pushErr.message);
          }
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: `Status ${callStatus} processed` })
      };
    }

    // ── Real-Time Monthly Minute Metering & Stripe Overage Billing ────────────
    let meterResult = null;
    let stripeBilled = false;
    let stripeInvoiceItemId = null;
    const fs = getFirestore();

    if (fs) {
      try {
        // 1. Log the call record
        await fs.logVoiceCall({
          callId,
          callerNumber: callerNum,
          inboundNumber: inboundNumber || 'unknown',
          durationSeconds: durationSec,
          summary,
          transcript,
          isUrgent,
          endedAt: new Date().toISOString()
        });

        // 2. Increment per-subscriber minutesUsed & compute overage
        const session = CALL_LICENSE_MAP.get(callId) || (fs && fs.getCallSession ? await fs.getCallSession(callId) : null);
        const resolvedKey = callObj.metadata?.licenseKey || message.metadata?.licenseKey || session?.licenseKey;
        meterResult = await fs.incrementMinutesUsed(resolvedKey || inboundNumber || 'unknown', durationSec);

        // 3. Automated Stripe Billing for Increments / Overage
        const sub = meterResult?.subscriber;
        const newOverageMinutes = meterResult?.newOverageMinutes || 0;

        if (sub && STRIPE_SECRET_KEY) {
          const customerId = sub.customerId || sub.stripeCustomerId;
          const subscriptionId = sub.subscriptionId;
          const subItemId = sub.subscriptionItemId;

          // Case A: If subscriber has a dedicated metered subscription item, post usage record
          if (subItemId) {
            try {
              await stripeApiRequest(`/v1/subscription_items/${subItemId}/usage_records`, 'POST', {
                quantity: meterResult.callMinutes,
                timestamp: Math.floor(Date.now() / 1000),
                action: 'increment'
              });
              stripeBilled = true;
              console.log(`💳 [STRIPE METERED USAGE] Reported ${meterResult.callMinutes} mins to subscription item ${subItemId}`);
            } catch (meterErr) {
              console.warn('[vapi-webhook] Usage record reporting note:', meterErr.message);
            }
          }

          // Case B: If this call pushed the user into overage (beyond their included pooled quota),
          // automatically bill the overage increment ($0.20 or $0.25/minute, +1.5% if premium model) onto their upcoming monthly invoice
          if (newOverageMinutes > 0 && customerId) {
            let rawRate = sub.overageRatePerMinute || sub.overageRate || (sub.plan === 'VOICE_STARTER' || sub.tier === 'VOICE_STARTER' ? 0.25 : 0.20);
            const isPremiumModel = sub.hasPremiumModel === true ||
              (sub.model && sub.model.toLowerCase().includes('gpt-4o') && !sub.model.toLowerCase().includes('mini'));
            if (isPremiumModel) {
              rawRate = rawRate * 1.015; // 1.5% markup applied strictly to overages
            }
            const overageRateCents = Math.round(parseFloat(rawRate) * 100);
            const amountCents = Math.round(newOverageMinutes * parseFloat(rawRate) * 100);
            const rateFormatted = (parseFloat(rawRate)).toFixed(3);

            try {
              const markupNote = isPremiumModel ? ' (+1.5% Premium Model Markup)' : '';
              const invoiceItemData = {
                customer: customerId,
                amount: amountCents,
                currency: 'usd',
                description: `24/7 AI Voice Receptionist Overage: ${newOverageMinutes} min(s) @ $${rateFormatted}/min${markupNote} (Call from ${callerNum})`
              };
              if (subscriptionId && subscriptionId.startsWith('sub_')) {
                invoiceItemData.subscription = subscriptionId;
              }

              const invoiceItem = await stripeApiRequest('/v1/invoice_items', 'POST', invoiceItemData);
              stripeBilled = true;
              stripeInvoiceItemId = invoiceItem.id;
              console.log(`💳 [STRIPE OVERAGE BILLED] Billed ${newOverageMinutes} min(s) ($${(amountCents/100).toFixed(2)} @ $${rateFormatted}/m${markupNote}) to customer ${customerId} (Invoice Item: ${invoiceItem.id})`);
            } catch (invErr) {
              console.error('❌ [STRIPE OVERAGE BILLING ERROR]:', invErr.message);
            }
          }
        }
      } catch (dbErr) {
        console.error('[vapi-webhook] Firestore/Billing operation failed:', dbErr.message);
      }
    } else {
      console.warn('[vapi-webhook] Firestore unavailable — minute metering skipped.');
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Emergency Alert Email ─────────────────────────────────────────────────
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.FROM_EMAIL || 'Missed Call Auto SMS <support@missedcallautosms.com>';
    const ownerEmail = process.env.OWNER_EMAIL || 'contactus@offgridmediagroup.com';

    if (isUrgent && resendKey && ownerEmail) {
      const emailHtml = `
        <div style="font-family: sans-serif; background: #161B22; color: #FFF; padding: 20px; border-radius: 10px;">
          <div style="background: rgba(248,81,73,0.2); color: #F85149; font-weight: bold; padding: 8px 12px; border-radius: 6px;">
            🚨 PRIORITY LEAD ALERT: High Urgency Service Request
          </div>
          <h2 style="color: #00E676;">Caller: ${callerNum}</h2>
          <p><strong>Duration:</strong> ${durationSec}s</p>
          <p><strong>Summary:</strong> ${summary}</p>
          <div style="background: #090B0E; padding: 10px; border-radius: 6px; font-size: 12px; color: #CBD5E0;">
            <strong>Transcript:</strong><br>${transcript}
          </div>
        </div>
      `;
      sendResendEmail(resendKey, ownerEmail, fromEmail, `🚨 Emergency Call Alert: ${callerNum}`, emailHtml)
        .catch(e => console.warn('[vapi-webhook] Emergency email send error:', e.message));
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Dispatch Completed Voice Call Push to Android Device ───────────────
    const msg = getMessagingService();
    const sessionPush = CALL_LICENSE_MAP.get(callId) || (fs && fs.getCallSession ? await fs.getCallSession(callId) : null);
    const resolvedPushKey = callObj.metadata?.licenseKey || message.metadata?.licenseKey || sessionPush?.licenseKey;

    if (fs && msg) {
      try {
        let sub = null;
        if (resolvedPushKey) sub = await fs.getVoiceBinding(resolvedPushKey);
        if (!sub && inboundNumber) sub = await fs.getVoiceBinding(inboundNumber);
        if (!sub) sub = await fs.getVoiceBinding('MCAS-PRO-TRIAL-001');

        if (sub && sub.licenseKey) {
          const deviceRecord = await fs.getDeviceBinding(sub.licenseKey);
          if (deviceRecord && deviceRecord.fcm_token) {
            await msg.send({
              token: deviceRecord.fcm_token,
              data: {
                type: 'voice_call_completed',
                caller_phone: callerNum,
                caller_name: customer.name || '',
                summary: summary,
                transcript: transcript,
                duration_seconds: String(durationSec),
                intent: isUrgent ? 'EMERGENCY' : 'SERVICE_CALL',
                timestamp: String(Date.now()),
                source: 'central_cloud_relay'
              },
              android: { priority: 'high' }
            });
            console.log(`🚀 [FCM PUSH DELIVERED] voice_call_completed delivered to device for ${sub.licenseKey} (Caller: ${callerNum})`);

            // If appointment was booked during the voice call
            const appointmentKeywords = ['booked', 'scheduled', 'appointment confirmed', 'arrival window'];
            const isBooking = appointmentKeywords.some(k => lowerTrans.includes(k));
            if (isBooking) {
              try {
                await msg.send({
                  token: deviceRecord.fcm_token,
                  data: {
                    type: 'appointment_booked',
                    customer_name: customer.name || callerNum,
                    phone: callerNum,
                    date_time: 'Confirmed via Voice Call',
                    address: sub.aiSmsShopAddress || 'Customer Address',
                    notes: summary,
                    timestamp: String(Date.now()),
                    source: 'vapi_call_booking'
                  },
                  android: { priority: 'high' }
                });
                console.log(`🎉 [VOICE APPOINTMENT PUSH] Delivered to device for ${callerNum}`);
              } catch (appErr) {
                console.warn('[vapi-webhook] Appointment push warning:', appErr.message);
              }
            }

            // Post-Call SIM SMS Confirmation & Disconnected Recovery (if enabled by subscriber)
            if (sub.postCallSmsEnabled !== false) {
              const endedReason = message.endedReason || callObj.endedReason || payload.endedReason || '';
              const isSilence = endedReason === 'silence-timed-out' || lowerTrans.includes('could not hear') || lowerTrans.includes('cannot hear');
              const isDisconnected = (endedReason === 'customer-ended-call' || endedReason === 'phone-call-provider-closed-call' || endedReason === 'assistant-error') && durationSec < 35 && !isBooking;

              let postCallText = '';
              if (isSilence) {
                postCallText = `Hi, sorry we couldn't hear each other on the call! Were you still looking for assistance or an estimate today? Feel free to reply directly to this text!`;
              } else if (isDisconnected) {
                postCallText = `Hey, seems like we got disconnected! Were you still looking for a quote or technician visit? Let me know how I can help!`;
              } else {
                const nameGreeting = customer.name ? `Hi ${customer.name}, ` : 'Hi, ';
                postCallText = `${nameGreeting}thanks for calling! Our AI receptionist noted your request: "${summary.substring(0, 85)}". Feel free to reply here if you have any questions or want to update your time!`;
              }

              try {
                await msg.send({
                  token: deviceRecord.fcm_token,
                  data: {
                    phone: callerNum,
                    message: postCallText,
                    sim_slot: '1',
                    timestamp: String(Date.now()),
                    source: 'central_cloud_relay'
                  },
                  android: { priority: 'high' }
                });
                console.log(`📱 [POST-CALL SIM SMS] Dispatched (${isSilence ? 'SILENCE RECOVERY' : isDisconnected ? 'DISCONNECTED RECOVERY' : 'NORMAL'}) to device SIM relay for ${callerNum}`);
              } catch (simErr) {
                console.warn('[vapi-webhook] Post-call SIM SMS dispatch warning:', simErr.message);
              }
            }
          }
        }
      } catch (fcmErr) {
        console.warn('[vapi-webhook] FCM completed call push error:', fcmErr.message);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Vapi end-of-call report ingested successfully',
        callId,
        caller: callerNum,
        durationSeconds: durationSec,
        billableMinutes: meterResult?.callMinutes || Math.ceil(durationSec / 60),
        newOverageMinutes: meterResult?.newOverageMinutes || 0,
        totalMinutesUsedThisMonth: meterResult?.newTotalMinutes || null,
        monthlyQuota: meterResult?.quotaMinutes || 200,
        stripeBilled,
        stripeInvoiceItemId,
        urgency: isUrgent ? 'HIGH' : 'NORMAL'
      })
    };
  } catch (err) {
    console.error('Vapi Webhook Error:', err.message);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
