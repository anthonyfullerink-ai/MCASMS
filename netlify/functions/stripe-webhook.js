const https = require('https');
const crypto = require('crypto');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Missed Call Auto SMS <onboarding@resend.dev>';
const OWNER_NOTIFY_EMAIL = process.env.OWNER_EMAIL || 'contactus@offgridmediagroup.com';

const LICENSE_SECRET = "MCAT_SECRET_PROD_KEY_2026";
const KEY_PREFIX = "MCAS-";

function generateKey(customerName, daysValid = 0, isPro = false) {
  const expiryTimestamp = daysValid === 0 ? 0 : Math.floor(Date.now() / 1000) + (daysValid * 86400);
  const payloadStr = `${customerName || 'Valued Customer'}|${expiryTimestamp}|${Math.floor(Date.now() / 1000)}`;
  const payloadHex = Buffer.from(payloadStr, "utf-8").toString("hex").toUpperCase();
  
  const hmac = crypto.createHmac("sha256", LICENSE_SECRET);
  hmac.update(payloadHex);
  const sigShort = hmac.digest("hex").substring(0, 8).toUpperCase();
  
  const prefix = isPro ? "MCAS-PRO-" : KEY_PREFIX;
  return `${prefix}${payloadHex}-${sigShort}`;
}

function generateEmailHtml(customerName, licenseKey, apkDownloadUrl, amountPaid, isPro = false) {
  const brandTitle = isPro ? "Missed Call Auto SMS • Pro Automation" : "Missed Call Auto SMS";
  const badgeText = isPro ? "PRO AUTOMATION EDITION (UNLIMITED)" : "FLAGSHIP APPLIANCE EDITION";
  const themeBorderColor = isPro ? "#A855F7" : "#00E676";
  const themeTextColor = isPro ? "#C084FC" : "#00E676";
  const editionSummary = isPro
    ? "Lifetime Pro Automation License • Unlimited n8n Integration • Dual SIM Business Line • 100% A2P 10DLC Exempt"
    : "Lifetime License • 1 Android Phone Bound • 100% A2P 10DLC Exempt";

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your ${brandTitle} License Key & Setup Guide</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 600px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 44px; margin-bottom: 8px;">${isPro ? '⚡' : '📱'}</div>
            <h1 style="color: ${themeTextColor}; margin: 0; font-size: 24px; font-weight: 900;">${brandTitle}</h1>
            <div style="display: inline-block; margin-top: 6px; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; background: ${themeBorderColor}22; color: ${themeTextColor}; border: 1px solid ${themeBorderColor}44;">
                ${badgeText}
            </div>
        </div>

        <div style="background: #1A202C; border-left: 4px solid ${themeBorderColor}; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Thank you, ${customerName}!</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                Your payment of <strong>$${amountPaid}</strong> was successful. Your lifetime ${isPro ? 'Pro Automation' : 'hardware'} license key is ready to activate on your Android device.
            </p>
        </div>

        <!-- License Key Box -->
        <div style="background: #090B0E; border: 1px dashed ${themeBorderColor}; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 8px;">Your ${isPro ? 'Pro ' : ''}Hardware License Key</div>
            <div style="font-family: monospace; font-size: 22px; color: ${themeTextColor}; font-weight: bold; word-break: break-all; letter-spacing: 1px; margin-bottom: 8px;">
                ${licenseKey}
            </div>
            <div style="font-size: 12px; color: #A0AEC0;">${editionSummary}</div>
        </div>

        <!-- APK Download Button -->
        <div style="text-align: center; margin-bottom: 24px;">
            <a href="${apkDownloadUrl}" style="display: inline-block; background: ${themeBorderColor}; color: ${isPro ? '#FFFFFF' : '#000000'}; font-weight: 800; font-size: 16px; padding: 14px 36px; border-radius: 30px; text-decoration: none; box-shadow: 0 6px 20px ${isPro ? 'rgba(168,85,247,0.35)' : 'rgba(0,230,118,0.3)'};">
                📥 Download ${isPro ? 'Pro APK' : 'Android App (.APK)'}
            </a>
            <div style="font-size: 12px; color: #949BAE; margin-top: 8px;">Direct Link: <a href="${apkDownloadUrl}" style="color:${themeTextColor};">${apkDownloadUrl}</a></div>
        </div>

        ${isPro ? `
        <!-- n8n Workflow Template Bonus for Pro -->
        <div style="background: linear-gradient(180deg, #181126 0%, #0D1016 100%); border: 1px solid #7928CA; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 14px; font-weight: 800; color: #D8B4FE; margin-bottom: 4px;">⚡ Ready-to-Use n8n Workflow Included</div>
            <div style="font-size: 12px; color: #CBD5E0; margin-bottom: 12px; line-height: 1.4;">
                Import this pre-configured template directly into n8n to connect incoming leads to your carrier SIM with two-way delivery callbacks.
            </div>
            <a href="https://missedcallautosms.com/MissedCallAutoSMS_n8n_Workflow.json" download style="display: inline-block; background: #7928CA; color: #FFFFFF; font-weight: 700; font-size: 13px; padding: 10px 22px; border-radius: 20px; text-decoration: none; box-shadow: 0 4px 14px rgba(121,40,202,0.4);">
                📦 Download n8n Workflow Template (.json)
            </a>
            <div style="font-size: 11px; color: #949BAE; margin-top: 6px;">Direct Link: <a href="https://missedcallautosms.com/MissedCallAutoSMS_n8n_Workflow.json" style="color:#C084FC;">missedcallautosms.com/MissedCallAutoSMS_n8n_Workflow.json</a></div>
        </div>
        ` : ''}

        <!-- 3-Step Quick Start -->
        <div style="border-top: 1px solid #222836; padding-top: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 12px 0;">🚀 3-Step Instant Activation</h3>
            <ol style="color: #CBD5E0; font-size: 14px; padding-left: 20px; line-height: 1.8;">
                <li><strong>Download and install</strong> the APK file on your Android business phone.</li>
                <li>Open the app and <strong>paste your License Key</strong> above.</li>
                <li>${isPro ? 'Configure your <strong>preferred Dual SIM slot</strong> and link your <strong>n8n webhook URL</strong>.' : 'Grant standard SMS and Call Log permissions, then <strong>Toggle Master Appliance ON</strong>.'}</li>
            </ol>
        </div>

        <div style="background: #0D1117; border: 1px solid #222836; border-radius: 8px; padding: 12px; margin-bottom: 20px; font-size: 11px; color: #949BAE; line-height: 1.5; text-align: center;">
            🛡️ <strong>Carrier Velocity Notice:</strong> Designed for high-velocity 1-to-1 conversational triggers (new lead alerts, appointment reminders, quote replies), not bulk mass spamming. Built-in SIM Burn Safeguard™ automatically paces outbound queues to protect your line.
        </div>

        <div style="border-top: 1px solid #222836; padding-top: 18px; text-align: center; font-size: 12px; color: #718096;">
            Need help or device transfer? Visit <a href="https://missedcallautosms.com/license_dashboard.html" style="color: ${themeTextColor};">Customer License Portal</a> or reply directly to this email.
        </div>
    </div>
</body>
</html>`;
}

function generateTrialEmailHtml(customerName, licenseKey, apkDownloadUrl) {
  const brandTitle = "Missed Call Auto SMS • 3-Day Free Trial";
  const badgeText = "3-DAY FREE TRIAL ($0.00 CHARGED TODAY)";
  const themeBorderColor = "#FFB300";
  const themeTextColor = "#FFB300";
  const editionSummary = "3-Day Full-Access Free Trial • Standard Edition • 100% A2P 10DLC Exempt";

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your Missed Call Auto SMS Free Trial Key & Setup Guide</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 600px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 44px; margin-bottom: 8px;">🎁</div>
            <h1 style="color: ${themeTextColor}; margin: 0; font-size: 24px; font-weight: 900;">${brandTitle}</h1>
            <div style="display: inline-block; margin-top: 6px; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; background: ${themeBorderColor}22; color: ${themeTextColor}; border: 1px solid ${themeBorderColor}44;">
                ${badgeText}
            </div>
        </div>

        <div style="background: #1A202C; border-left: 4px solid ${themeBorderColor}; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Welcome, ${customerName}!</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                Your <strong>3-Day Free Trial</strong> has started. You were charged <strong>$0.00 today</strong>. Your trial activation key is ready to activate on your Android business phone.
            </p>
        </div>

        <!-- License Key Box -->
        <div style="background: #090B0E; border: 1px dashed ${themeBorderColor}; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 8px;">Your 3-Day Trial License Key</div>
            <div style="font-family: monospace; font-size: 22px; color: ${themeTextColor}; font-weight: bold; word-break: break-all; letter-spacing: 1px; margin-bottom: 8px;">
                ${licenseKey}
            </div>
            <div style="font-size: 12px; color: #A0AEC0;">${editionSummary}</div>
        </div>

        <!-- APK Download Button -->
        <div style="text-align: center; margin-bottom: 24px;">
            <a href="${apkDownloadUrl}" style="display: inline-block; background: ${themeBorderColor}; color: #000000; font-weight: 800; font-size: 16px; padding: 14px 36px; border-radius: 30px; text-decoration: none; box-shadow: 0 6px 20px rgba(255,179,0,0.3);">
                📥 Download Android App (.APK)
            </a>
            <div style="font-size: 12px; color: #949BAE; margin-top: 8px;">Direct Link: <a href="${apkDownloadUrl}" style="color:${themeTextColor};">${apkDownloadUrl}</a></div>
        </div>

        <!-- 3-Step Quick Start -->
        <div style="border-top: 1px solid #222836; padding-top: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 12px 0;">🚀 3-Step Instant Activation</h3>
            <ol style="color: #CBD5E0; font-size: 14px; padding-left: 20px; line-height: 1.8;">
                <li><strong>Download and install</strong> the APK file on your Android business phone.</li>
                <li>Open the app and <strong>paste your Trial License Key</strong> above.</li>
                <li>Grant standard SMS and Call Log permissions, then <strong>Toggle Master Appliance ON</strong>.</li>
            </ol>
        </div>

        <div style="background: rgba(255, 179, 0, 0.08); border: 1px solid rgba(255, 179, 0, 0.25); border-radius: 8px; padding: 14px; margin-bottom: 20px; font-size: 12px; color: #E2E8F0; line-height: 1.5;">
            ⏰ <strong>Trial & Renewal Terms:</strong> You have 3 full days of unrestricted access. After 3 days, your card on file will be charged $49.99 for your permanent lifetime license unless you cancel beforehand. You can cancel anytime in 1 click at <a href="https://missedcallautosms.com/cancel_trial.html" style="color: ${themeTextColor};">missedcallautosms.com/cancel_trial.html</a> or through our 24/7 AI Voice Assistant.
        </div>

        <div style="border-top: 1px solid #222836; padding-top: 18px; text-align: center; font-size: 12px; color: #718096;">
            Need help or device transfer? Visit <a href="https://missedcallautosms.com/license_dashboard.html" style="color: ${themeTextColor};">Customer License Portal</a> or reply directly to this email.
        </div>
    </div>
</body>
</html>`;
}

function stripeApiRequest(endpoint, method = 'GET') {
  return new Promise((resolve, reject) => {
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
    req.end();
  });
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
    const amountTotal = (session.amount_total !== undefined && session.amount_total !== null) ? session.amount_total : 4999;
    const isTrial = (amountTotal === 0) ||
                    (session.subscription && amountTotal === 0) ||
                    (session.metadata && session.metadata.tier === 'standard_trial');
    const amountPaid = (amountTotal / 100).toFixed(2);

    if (!customerEmail) {
      console.warn('⚠️ No customer email found in checkout session:', session.id);
      return { statusCode: 200, body: JSON.stringify({ received: true, warning: 'No email found' }) };
    }

    // Determine Tier: Pro ($149.99+) vs Standard ($49.99) vs Free Trial ($0.00)
    const isPro = !isTrial && (amountTotal >= 10000 ||
                  (session.metadata && (session.metadata.tier === 'pro' || session.metadata.tier === 'pro_automation')) ||
                  (session.client_reference_id && session.client_reference_id.toLowerCase().includes('pro')));

    const host = (event.headers && event.headers.host) || 'missedcallautosms.com';
    const apkFileName = isPro ? 'MissedCallAutoSMS-Pro.apk' : 'MissedCallAutoSMS.apk';
    const apkDownloadUrl = `https://${host}/${apkFileName}`;

    if (isTrial) {
      // 1. Generate 3-Day Free Trial License Key (valid 4 days for timezone buffer)
      const trialLicenseKey = generateKey(customerName, 4, false);
      console.log(`🎁 [3-DAY TRIAL ACTIVATED] ${trialLicenseKey} for ${customerEmail} ($0.00 Charged)`);

      // 2. Automatically Dispatch Free Trial Delivery Email
      if (RESEND_API_KEY) {
        const emailSubject = `🎁 Your Missed Call Auto SMS 3-Day Free Trial Key & Setup Guide ($0 Today)`;
        const emailHtml = generateTrialEmailHtml(customerName, trialLicenseKey, apkDownloadUrl);

        try {
          const sendResult = await sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml);
          console.log(`📧 [TRIAL EMAIL DELIVERED] Dispatched to ${customerEmail} (ID: ${sendResult.id})`);

          // Notify owner of new free trial signup
          if (OWNER_NOTIFY_EMAIL && OWNER_NOTIFY_EMAIL !== customerEmail) {
            sendEmail(
              RESEND_API_KEY,
              OWNER_NOTIFY_EMAIL,
              `🎁 New 3-Day Free Trial Signup: ${customerName}`,
              `<p>A new customer has started their 3-day free trial ($0 charged today)!</p>
               <p><strong>Customer:</strong> ${customerName} (${customerEmail})</p>
               <p><strong>Trial License Key:</strong> <code>${trialLicenseKey}</code></p>
               <p><strong>Stripe Session:</strong> ${session.id}</p>
               <p><strong>Subscription ID:</strong> ${session.subscription || 'N/A'}</p>`
            ).catch(() => {});
          }
        } catch (emailErr) {
          console.error(`❌ [TRIAL EMAIL FAILED] for ${customerEmail}:`, emailErr.message);
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received: true,
          tier: 'standard_trial',
          trialDays: 3,
          amountPaid: '0.00',
          licenseKey: trialLicenseKey,
          apkUrl: apkDownloadUrl,
          customerEmail: customerEmail
        })
      };
    }

    // Direct Purchase (Standard $49.99 or Pro $149.99)
    // 1. Generate Signed Lifetime License Key
    const licenseKey = generateKey(customerName, 0, isPro);
    console.log(`🔑 [${isPro ? 'PRO ' : 'STANDARD '}LIFETIME LICENSE GENERATED] ${licenseKey} for ${customerEmail} ($${amountPaid})`);

    // 2. Automatically Dispatch Delivery Email
    if (RESEND_API_KEY) {
      const emailSubject = isPro
        ? `⚡ Your Missed Call Auto SMS (Pro Automation Edition) License Key & Setup Guide`
        : `Your Missed Call Auto SMS License Key & Setup Guide`;
      const emailHtml = generateEmailHtml(customerName, licenseKey, apkDownloadUrl, amountPaid, isPro);

      try {
        const sendResult = await sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml);
        console.log(`📧 [EMAIL DELIVERED] Dispatched to ${customerEmail} (ID: ${sendResult.id})`);

        // Notify owner of purchase
        if (OWNER_NOTIFY_EMAIL && OWNER_NOTIFY_EMAIL !== customerEmail) {
          sendEmail(
            RESEND_API_KEY,
            OWNER_NOTIFY_EMAIL,
            `🎉 New ${isPro ? '⚡ Pro ($149.99)' : '📱 Standard ($49.99)'} Purchase: ${customerName}`,
            `<p>New ${isPro ? 'Pro Automation' : 'Standard'} license purchased!</p>
             <p><strong>Customer:</strong> ${customerName} (${customerEmail})</p>
             <p><strong>Amount:</strong> $${amountPaid}</p>
             <p><strong>Edition:</strong> ${isPro ? 'Pro Automation ($149.99)' : 'Flagship Appliance ($49.99)'}</p>
             <p><strong>License Key:</strong> <code>${licenseKey}</code></p>
             <p><strong>APK Delivered:</strong> ${apkDownloadUrl}</p>`
          ).catch(() => {});
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
        tier: isPro ? 'pro_automation' : 'standard',
        licenseKey: licenseKey,
        apkUrl: apkDownloadUrl,
        customerEmail: customerEmail
      })
    };
  }

  // Handle Trial Conversion Payment (3 days after trial start, first real invoice succeeds)
  if (eventObj.type === 'invoice.payment_succeeded') {
    const invoice = eventObj.data.object;
    const amountPaidCents = invoice.amount_paid || 0;
    const amountPaid = (amountPaidCents / 100).toFixed(2);
    const customerEmail = invoice.customer_email;
    const customerName = invoice.customer_name || 'Valued Customer';

    // Only process real conversion payments (ignore $0 initial trial setup invoice)
    if (amountPaidCents >= 4900 && customerEmail) {
      const host = (event.headers && event.headers.host) || 'missedcallautosms.com';
      const apkDownloadUrl = `https://${host}/MissedCallAutoSMS.apk`;

      // 1. Generate Permanent Lifetime License Key
      const lifetimeKey = generateKey(customerName, 0, false);
      console.log(`🎉 [TRIAL CONVERTED TO LIFETIME] ${lifetimeKey} for ${customerEmail} ($${amountPaid})`);

      // 2. Dispatch Lifetime Key Delivery Email via Resend
      if (RESEND_API_KEY) {
        const emailSubject = `🎉 Your Missed Call Auto SMS Lifetime License Key ($49.99)`;
        const emailHtml = generateEmailHtml(customerName, lifetimeKey, apkDownloadUrl, amountPaid, false);

        try {
          const sendResult = await sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml);
          console.log(`📧 [CONVERSION EMAIL DELIVERED] to ${customerEmail} (ID: ${sendResult.id})`);

          if (OWNER_NOTIFY_EMAIL && OWNER_NOTIFY_EMAIL !== customerEmail) {
            sendEmail(
              RESEND_API_KEY,
              OWNER_NOTIFY_EMAIL,
              `💰 Trial Converted to Lifetime ($${amountPaid}): ${customerName}`,
              `<p>Customer 3-day trial has converted to a permanent lifetime license!</p>
               <p><strong>Customer:</strong> ${customerName} (${customerEmail})</p>
               <p><strong>Amount:</strong> $${amountPaid}</p>
               <p><strong>Lifetime License Key:</strong> <code>${lifetimeKey}</code></p>
               <p><strong>APK Delivered:</strong> ${apkDownloadUrl}</p>`
            ).catch(() => {});
          }
        } catch (err) {
          console.error(`❌ [CONVERSION EMAIL ERROR] for ${customerEmail}:`, err.message);
        }
      }

      // 3. Terminate the recurring subscription in Stripe so customer has permanent lifetime access with no further recurring charges
      if (invoice.subscription && STRIPE_SECRET_KEY) {
        try {
          await stripeApiRequest(`/v1/subscriptions/${invoice.subscription}`, 'DELETE');
          console.log(`✅ [LIFETIME CONVERSION COMPLETE] Subscription ${invoice.subscription} terminated. User converted to lifetime access.`);
        } catch (subErr) {
          console.error(`⚠️ [STRIPE SUB CANCEL ERROR] Failed to terminate sub ${invoice.subscription}:`, subErr.message);
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received: true,
          converted: true,
          licenseKey: lifetimeKey,
          customerEmail: customerEmail
        })
      };
    }

    return { statusCode: 200, body: JSON.stringify({ received: true, note: 'Non-conversion invoice recorded' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};