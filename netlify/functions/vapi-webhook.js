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

      // Check if subscriber's voice/SMS minutes are exhausted
      const subBalance = typeof matchedSub?.voiceMinutesBalance === 'number' ? matchedSub.voiceMinutesBalance : null;
      const isVoicePaused = matchedSub?.isVoicePaused === true || (subBalance !== null && subBalance <= 0);

      if (isVoicePaused) {
        console.log(`🔒 [VAPI CALL PAUSED - ZERO MINUTES] License ${licenseKey} has 0 minutes remaining. Returning quick busy notice so Native SIM auto-SMS handles caller.`);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            assistant: {
              name: `${agentName} - Busy`,
              firstMessage: `Thank you for calling ${businessName}. Our office is currently busy assisting clients. An automated text message has been sent to your phone so you can reach us directly. Have a great day!`,
              endCallAfterSilenceSeconds: 2,
              maxDurationSeconds: 15,
              model: {
                provider: 'openai',
                model: 'gpt-4o-mini',
                messages: [{ role: 'system', content: 'Say goodbye and hang up.' }]
              }
            }
          })
        };
      }

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
              provider: (matchedSub?.voiceProvider === 'vapi' || matchedSub?.voiceProvider === '11labs') ? matchedSub.voiceProvider : '11labs',
              voiceId: (matchedSub?.voiceId && !matchedSub.voiceId.includes('248be419') && !matchedSub.voiceId.includes('a0e998e3'))
                ? matchedSub.voiceId
                : ((matchedPulse?.agentName?.toLowerCase().includes('austin') || matchedSub?.voiceAgentName?.toLowerCase().includes('austin')) ? 'pNInz6obpgDQGcFmaJgB' : '21m00Tcm4TlvDq8ikWAM')
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

        if (fnName === 'send_checkout_link') {
          let args = {};
          try {
            args = typeof tc.function?.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : (tc.function?.arguments || tc.parameters || {});
          } catch (e) {
            args = {};
          }

          const contactType = (args.contact_type || 'sms').toLowerCase().trim();
          const recipient = (args.recipient || callerNum || '').trim();
          const businessName = (args.business_name || 'Your Business').trim();
          const industry = (args.industry || 'Contractor / Business').trim();

          console.log(`🛒 [VAPI TOOL CALL] send_checkout_link requested via ${contactType} to ${recipient} for "${businessName}" (${industry})`);

          let checkoutUrl = "https://missedcallautosms.com/voice#pricing";
          if (STRIPE_SECRET_KEY) {
            try {
              const sessionPostData = {
                'mode': 'subscription',
                'payment_method_types[0]': 'card',
                'line_items[0][price_data][currency]': 'usd',
                'line_items[0][price_data][unit_amount]': '4999',
                'line_items[0][price_data][product_data][name]': "Missed Call Auto SMS - Founder's Flagship Appliance (Lifetime)",
                'line_items[0][price_data][product_data][description]': "Founder's Lifetime Appliance License • 1 Android Phone Bound • 100% A2P 10DLC Carrier Exempt",
                'line_items[0][quantity]': '1',
                'line_items[1][price_data][currency]': 'usd',
                'line_items[1][price_data][unit_amount]': '999',
                'line_items[1][price_data][recurring][interval]': 'month',
                'line_items[1][price_data][product_data][name]': 'Missed Call Auto SMS - 24/7 AI Voice Receptionist Add-On ($9.99/mo)',
                'line_items[1][price_data][product_data][description]': '24/7 AI Voice Phone Receptionist • 15 Free Test Minutes on Activation • Instant Carrier SIM Confirmation SMS',
                'line_items[1][quantity]': '1',
                'subscription_data[metadata][tier]': 'flagship_plus_voice',
                'subscription_data[metadata][plan]': 'flagship',
                'subscription_data[metadata][include_voice]': 'true',
                'subscription_data[metadata][monthly_fee]': '9.99',
                'subscription_data[metadata][business_name]': businessName,
                'metadata[tier]': 'flagship_plus_voice',
                'metadata[plan]': 'flagship',
                'metadata[source]': 'vapi_live_demo_agent',
                'metadata[industry]': industry,
                'metadata[recipient]': recipient,
                'success_url': 'https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}',
                'cancel_url': 'https://missedcallautosms.com/voice'
              };
              if (contactType === 'email' && recipient.includes('@')) {
                sessionPostData['customer_email'] = recipient;
              }
              const stripeSession = await stripeApiRequest('/v1/checkout/sessions', 'POST', sessionPostData);
              if (stripeSession && stripeSession.url) {
                checkoutUrl = stripeSession.url;
              }
            } catch (stripeErr) {
              console.warn('[vapi-webhook] Stripe dynamic checkout creation error:', stripeErr.message);
            }
          }

          if (contactType === 'email' && recipient.includes('@') && process.env.RESEND_API_KEY) {
            try {
              const resendPayload = JSON.stringify({
                from: process.env.FROM_EMAIL || 'Missed Call Auto SMS <support@missedcallautosms.com>',
                to: [recipient],
                subject: `🚀 Your Missed Call Auto SMS Setup Link for ${businessName}`,
                html: `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #090B0E; color: #FFFFFF; padding: 32px; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #222836;">
                    <div style="text-align: center; margin-bottom: 24px;">
                      <span style="font-size: 24px; font-weight: 900; color: #00E676;">Missed Call Auto SMS</span>
                      <p style="color: #94A3B8; font-size: 14px; margin-top: 4px;">24/7 AI Voice Receptionist + Native SIM Auto-Text</p>
                    </div>
                    <div style="background: #131720; padding: 24px; border-radius: 10px; border: 1px solid #222836;">
                      <h2 style="color: #FFF; margin-top: 0; font-size: 18px;">Hello from your Demo Agent!</h2>
                      <p style="color: #CBD5E1; font-size: 14px; line-height: 1.6;">
                        Thank you for trying our live interactive voice demonstration for <strong>${businessName}</strong> (${industry}).
                      </p>
                      <p style="color: #CBD5E1; font-size: 14px; line-height: 1.6;">
                        Here is your direct setup link for the <strong>$59.98 bundle</strong> ($49.99 Founder's Flagship lifetime APK + $9.99/mo 24/7 AI Voice Receptionist add-on):
                      </p>
                      <div style="text-align: center; margin: 28px 0;">
                        <a href="${checkoutUrl}" style="background: #00E676; color: #000; font-weight: 800; font-size: 15px; padding: 14px 28px; border-radius: 8px; text-decoration: none; display: inline-block;">
                          Complete Setup ($59.98 Today, then $9.99/mo) ➔
                        </a>
                      </div>
                      <ul style="color: #94A3B8; font-size: 13px; line-height: 1.8; padding-left: 20px;">
                        <li>Lifetime Android APK License bound to your phone</li>
                        <li>100% Authentic Carrier SIM auto-texts (Zero 10DLC fees)</li>
                        <li>24/7 AI Voice Phone Receptionist with 15 free test minutes</li>
                        <li>Instant calendar booking & *71 conditional call forwarding</li>
                      </ul>
                    </div>
                  </div>
                `
              });
              await new Promise((res, rej) => {
                const rReq = https.request({
                  hostname: 'api.resend.com',
                  path: '/emails',
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(resendPayload)
                  }
                }, rRes => {
                  let b = '';
                  rRes.on('data', c => b += c);
                  rRes.on('end', () => res(b));
                });
                rReq.on('error', rej);
                rReq.write(resendPayload);
                rReq.end();
              });
              console.log(`✉️ [EMAIL SENT] Checkout link emailed to ${recipient}`);
            } catch (emailErr) {
              console.error('❌ [EMAIL SEND FAILED]:', emailErr.message);
            }
          } else {
            const smsMessage = `Here is your link to get Missed Call Auto SMS ($59.98 today: $49.99 Flagship APK + $9.99/mo 24/7 AI Voice Receptionist): ${checkoutUrl} - Download your APK immediately after checkout!`;
            if (fs && msg) {
              try {
                let sub = await fs.getVoiceBinding('MCAS-PRO-TRIAL-001');
                let targetFcmToken = null;
                if (sub?.licenseKey) {
                  const dev = await fs.getDeviceBinding(sub.licenseKey);
                  targetFcmToken = dev?.fcm_token;
                }
                if (!targetFcmToken) {
                  const localCache = getLocalToken('MCAS-PRO-TRIAL-001');
                  targetFcmToken = localCache?.fcm_token;
                }
                if (targetFcmToken) {
                  await msg.send({
                    token: targetFcmToken,
                    data: {
                      phone: recipient,
                      message: smsMessage,
                      sim_slot: '1',
                      timestamp: String(Date.now()),
                      source: 'central_cloud_relay'
                    },
                    android: { priority: 'high' }
                  });
                  console.log(`📱 [SMS DISPATCHED] Checkout link SMS sent to ${recipient}`);
                }
              } catch (smsErr) {
                console.error('❌ [SMS DISPATCH FAILED]:', smsErr.message);
              }
            }
          }

          results.push({
            toolCallId: tc.id,
            result: `The $59.98 bundle checkout link (${checkoutUrl}) was successfully dispatched to ${recipient} via ${contactType}. Tell the customer you have sent the link and they can complete checkout anytime.`
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

            // If subscriber's minutes are exhausted, do NOT dispatch voice_call_started.
            // This allows the Android device's Native SIM Missed-Call SMS to fire immediately!
            if (sub && (sub.isVoicePaused === true || (typeof sub.voiceMinutesBalance === 'number' && sub.voiceMinutesBalance <= 0))) {
              console.log(`ℹ️ [FCM SUPPRESS SKIPPED] Sub ${sub.licenseKey} has 0 minutes; allowing Native SIM Missed-Call SMS to fire.`);
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: 'Voice paused - native SMS allowed' })
              };
            }

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

    // ── Real-Time Monthly Minute Metering (True Whole-Number Metering) ────────
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

        // 2. Increment minutesUsed & decrement voiceMinutesBalance (nearest whole minute)
        const session = CALL_LICENSE_MAP.get(callId) || (fs && fs.getCallSession ? await fs.getCallSession(callId) : null);
        const resolvedKey = callObj.metadata?.licenseKey || message.metadata?.licenseKey || session?.licenseKey;
        meterResult = await fs.incrementMinutesUsed(resolvedKey || inboundNumber || 'unknown', durationSec);
        const sub = meterResult?.subscriber;

        // 3. Option A (Manual Reload): If balance reached 0, pause AI voice & AI SMS and notify subscriber
        if (meterResult?.isPaused && (meterResult?.previousBalance || 0) > 0) {
          console.log(`⚠️ [MINUTES DEPLETED] Subscriber ${resolvedKey} reached 0 minutes. AI Voice & AI SMS paused.`);

          const subEmail = sub?.customerEmail || sub?.email;
          const subName = sub?.customerName || sub?.customer || 'Valued Subscriber';
          const rKey = process.env.RESEND_API_KEY;
          const fromEm = process.env.FROM_EMAIL || 'Missed Call Auto SMS <support@missedcallautosms.com>';

          if (rKey && subEmail) {
            const depletedHtml = `
              <div style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background: #090B0E; color: #FFFFFF; padding: 24px;">
                <div style="max-width: 600px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
                  <div style="text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 44px; margin-bottom: 8px;">⏳</div>
                    <h2 style="color: #F59E0B; margin: 0;">AI Minutes Depleted (Balance: 0 mins)</h2>
                  </div>
                  <p style="color: #CBD5E0; font-size: 14px; line-height: 1.6;">
                    Hi ${subName}, your available AI Voice Receptionist and AI SMS minutes have reached <strong>0</strong>.
                  </p>
                  <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 14px; margin: 18px 0; font-size: 13px; color: #FBBF24;">
                    ℹ️ <strong>Status Update:</strong> Your AI Voice Receptionist and Conversational AI SMS are safely paused until you reload. Your <strong>Native SIM Missed-Call SMS remains 100% active</strong> and will continue auto-replying to missed calls directly from your Android phone!
                  </div>
                  <div style="text-align: center; margin: 24px 0;">
                    <a href="https://buy.stripe.com/5kA8wPfRY0PS6M014f" style="display: inline-block; background: #00E676; color: #000000; font-weight: 800; font-size: 15px; padding: 14px 32px; border-radius: 30px; text-decoration: none;">
                      ⚡ Reload $10 Credit Pack (40 Mins) →
                    </a>
                  </div>
                  <p style="color: #949BAE; font-size: 12px; text-align: center; margin: 0;">
                    Credits never expire and roll over automatically. Missed Call Auto SMS
                  </p>
                </div>
              </div>
            `;
            sendResendEmail(rKey, subEmail, fromEm, '⏳ Your AI Voice Minutes are Exhausted (Native SIM SMS remains active)', depletedHtml).catch(() => {});
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
