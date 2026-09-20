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

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

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

    // ── Handle In-Progress / Ringing Call Status (Approach 2: Instant Cancellation) ──
    if (message.type === 'status-update') {
      const callStatus = message.status || callObj.status;
      console.log(`🎙️ [VAPI STATUS UPDATE] Call ${callId} status: ${callStatus} from ${callerNum}`);

      if (callStatus === 'in-progress' || callStatus === 'ringing') {
        const fs = getFirestore();
        const msg = getMessagingService();
        if (fs && msg && inboundNumber) {
          try {
            const sub = await fs.getVoiceBinding(inboundNumber);
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
        meterResult = await fs.incrementMinutesUsed(inboundNumber || 'unknown', durationSec);

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
          // automatically bill the overage increment ($0.20 or $0.25/minute) onto their upcoming monthly invoice
          if (newOverageMinutes > 0 && customerId) {
            const rawRate = sub.overageRatePerMinute || sub.overageRate || (sub.plan === 'VOICE_STARTER' || sub.tier === 'VOICE_STARTER' ? 0.25 : 0.20);
            const overageRateCents = Math.round(parseFloat(rawRate) * 100);
            const amountCents = newOverageMinutes * overageRateCents;
            const rateFormatted = (overageRateCents / 100).toFixed(2);

            try {
              const invoiceItemData = {
                customer: customerId,
                amount: amountCents,
                currency: 'usd',
                description: `24/7 AI Voice Receptionist Overage: ${newOverageMinutes} min(s) @ $${rateFormatted}/min (Call from ${callerNum})`
              };
              if (subscriptionId && subscriptionId.startsWith('sub_')) {
                invoiceItemData.subscription = subscriptionId;
              }

              const invoiceItem = await stripeApiRequest('/v1/invoice_items', 'POST', invoiceItemData);
              stripeBilled = true;
              stripeInvoiceItemId = invoiceItem.id;
              console.log(`💳 [STRIPE OVERAGE BILLED] Billed ${newOverageMinutes} min(s) ($${(amountCents/100).toFixed(2)} @ $${rateFormatted}/m) to customer ${customerId} (Invoice Item: ${invoiceItem.id})`);
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
    if (fs && msg && inboundNumber) {
      try {
        const sub = await fs.getVoiceBinding(inboundNumber);
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
