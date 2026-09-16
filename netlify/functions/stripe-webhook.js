const https = require('https');
const crypto = require('crypto');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Missed Call Auto SMS <onboarding@resend.dev>';
const OWNER_NOTIFY_EMAIL = process.env.OWNER_EMAIL || 'contactus@offgridmediagroup.com';

const LICENSE_SECRET = "MCAT_SECRET_PROD_KEY_2026";
const KEY_PREFIX = "MCAS-";

function generateKey(customerName, daysValid = 0) {
  const expiryTimestamp = daysValid === 0 ? 0 : Math.floor(Date.now() / 1000) + (daysValid * 86400);
  const payloadStr = `${customerName || 'Valued Customer'}|${expiryTimestamp}|${Math.floor(Date.now() / 1000)}`;
  const payloadHex = Buffer.from(payloadStr, "utf-8").toString("hex").toUpperCase();
  
  const hmac = crypto.createHmac("sha256", LICENSE_SECRET);
  hmac.update(payloadHex);
  const sigShort = hmac.digest("hex").substring(0, 8).toUpperCase();
  
  return `${KEY_PREFIX}${payloadHex}-${sigShort}`;
}

function generateEmailHtml(customerName, licenseKey, apkDownloadUrl, amountPaid) {
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your Missed Call Auto SMS License Key & Setup Guide</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 600px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 44px; margin-bottom: 8px;">📱</div>
            <h1 style="color: #00E676; margin: 0; font-size: 24px; font-weight: 900;">Missed Call Auto SMS</h1>
            <p style="color: #949BAE; font-size: 14px; margin-top: 4px;">Hardware Appliance License Delivery</p>
        </div>

        <div style="background: #1A202C; border-left: 4px solid #00E676; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Thank you, ${customerName}!</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                Your payment of <strong>$${amountPaid}</strong> was successful. Your lifetime hardware license key is ready to activate on your Android phone.
            </p>
        </div>

        <!-- License Key Box -->
        <div style="background: #090B0E; border: 1px dashed #00E676; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 8px;">Your Hardware License Key</div>
            <div style="font-family: monospace; font-size: 22px; color: #00E676; font-weight: bold; word-break: break-all; letter-spacing: 1px; margin-bottom: 8px;">
                ${licenseKey}
            </div>
            <div style="font-size: 12px; color: #A0AEC0;">Lifetime License • 1 Android Phone Bound • 100% A2P 10DLC Exempt</div>
        </div>

        <!-- APK Download Button -->
        <div style="text-align: center; margin-bottom: 28px;">
            <a href="${apkDownloadUrl}" style="display: inline-block; background: #00E676; color: #000000; font-weight: 800; font-size: 16px; padding: 14px 36px; border-radius: 30px; text-decoration: none; box-shadow: 0 6px 20px rgba(0,230,118,0.3);">
                📥 Download Android App (.APK)
            </a>
            <div style="font-size: 12px; color: #949BAE; margin-top: 8px;">Direct Link: <a href="${apkDownloadUrl}" style="color:#00E676;">${apkDownloadUrl}</a></div>
        </div>

        <!-- 3-Step Quick Start -->
        <div style="border-top: 1px solid #222836; padding-top: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 12px 0;">🚀 3-Step Instant Activation</h3>
            <ol style="color: #CBD5E0; font-size: 14px; padding-left: 20px; line-height: 1.8;">
                <li><strong>Download and install</strong> the APK file on your Android business device.</li>
                <li>Open the app and <strong>paste your License Key</strong> above.</li>
                <li>Grant standard SMS and Call Log permissions, then <strong>Toggle Master Appliance ON</strong>.</li>
            </ol>
        </div>

        <div style="border-top: 1px solid #222836; padding-top: 18px; text-align: center; font-size: 12px; color: #718096;">
            Need help or device transfer? Visit <a href="https://missedcallautosms.com/license_dashboard.html" style="color: #00E676;">Customer License Portal</a> or reply directly to this email.
        </div>
    </div>
</body>
</html>`;
}

function sendEmail(apiKey, toEmail, subject, htmlContent) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      from: FROM_EMAIL,
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

function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return true; // Skip signature check if secret not set
  try {
    const parts = sigHeader.split(',');
    const timestampPart = parts.find(p => p.startsWith('t='));
    const sigPart = parts.find(p => p.startsWith('v1='));
    if (!timestampPart || !sigPart) return false;

    const timestamp = timestampPart.split('=')[1];
    const signature = sigPart.split('=')[1];
    const signedPayload = `${timestamp}.${payload}`;

    const expectedSig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch (e) {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, stripe-signature'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sigHeader = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  const rawBody = event.body || '';

  if (STRIPE_WEBHOOK_SECRET && !verifyStripeSignature(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET)) {
    console.error('❌ Webhook signature verification failed');
    return { statusCode: 400, body: 'Signature verification failed' };
  }

  let eventObj;
  try {
    eventObj = JSON.parse(rawBody);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON payload' };
  }

  console.log(`⚡ [STRIPE WEBHOOK] Received event: ${eventObj.type}`);

  if (eventObj.type === 'checkout.session.completed') {
    const session = eventObj.data.object;
    const customerDetails = session.customer_details || {};
    const customerEmail = customerDetails.email || session.customer_email;
    const customerName = customerDetails.name || 'Valued Customer';
    const amountPaid = session.amount_total ? (session.amount_total / 100).toFixed(2) : '49.99';

    if (!customerEmail) {
      console.warn('⚠️ No customer email found in checkout session:', session.id);
      return { statusCode: 200, body: JSON.stringify({ received: true, warning: 'No email found' }) };
    }

    const host = (event.headers && event.headers.host) || 'missedcallautosms.com';
    const apkDownloadUrl = `https://${host}/MissedCallAutoSMS.apk`;

    // 1. Generate Signed License Key
    const licenseKey = generateKey(customerName, 0);
    console.log(`🔑 [LICENSE GENERATED] ${licenseKey} for ${customerEmail} ($${amountPaid})`);

    // 2. Automatically Dispatch Delivery Email
    if (RESEND_API_KEY) {
      const emailSubject = `Your Missed Call Auto SMS License Key & Setup Guide`;
      const emailHtml = generateEmailHtml(customerName, licenseKey, apkDownloadUrl, amountPaid);

      try {
        const sendResult = await sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml);
        console.log(`📧 [EMAIL DELIVERED] Dispatched to ${customerEmail} (ID: ${sendResult.id})`);

        // Notify owner of purchase
        if (OWNER_NOTIFY_EMAIL && OWNER_NOTIFY_EMAIL !== customerEmail) {
          sendEmail(RESEND_API_KEY, OWNER_NOTIFY_EMAIL, `🎉 New $${amountPaid} Purchase: ${customerName}`, `<p>New license purchased!</p><p><strong>Customer:</strong> ${customerName} (${customerEmail})</p><p><strong>Amount:</strong> $${amountPaid}</p><p><strong>License Key:</strong> <code>${licenseKey}</code></p>`).catch(() => {});
        }
      } catch (emailErr) {
        console.error(`❌ [EMAIL DISPATCH FAILED] for ${customerEmail}:`, emailErr.message);
      }
    } else {
      console.warn(`⚠️ [RESEND_API_KEY NOT SET] License ${licenseKey} issued for ${customerEmail}, but email could not be sent automatically.`);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        received: true,
        licenseKey: licenseKey,
        customerEmail: customerEmail
      })
    };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};