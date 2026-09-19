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

function generateAgencyKey(agencyName, quota = 5) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadStr = `${agencyName || 'Agency Partner'}|${quota}|${timestamp}`;
  const payloadHex = Buffer.from(payloadStr, 'utf-8').toString('hex').toUpperCase();

  const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
  hmac.update(payloadHex);
  const sigShort = hmac.digest('hex').substring(0, 8).toUpperCase();

  return `MCAS-AGENCY-${quota}-${payloadHex}-${sigShort}`;
}

function generateAgencyEmailHtml(agencyName, masterAgencyKey, quota, amountPaid, dashboardUrl) {
  const is10 = quota >= 10;
  const planTitle = is10 ? "Agency 10-Pack Fleet Bundle" : "Agency 5-Pack Fleet Bundle";
  const badgeText = is10 ? "AGENCY 10-PACK • 10 CLIENT APPLIANCES" : "AGENCY 5-PACK • 5 CLIENT APPLIANCES";
  const themeBorderColor = "#38BDF8";
  const themeTextColor = "#38BDF8";

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Welcome to Missed Call Auto SMS Agency Fleet</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 640px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 44px; margin-bottom: 8px;">🏢</div>
            <h1 style="color: ${themeTextColor}; margin: 0; font-size: 24px; font-weight: 900;">${planTitle}</h1>
            <div style="display: inline-block; margin-top: 6px; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; background: rgba(56, 189, 248, 0.15); color: ${themeTextColor}; border: 1px solid rgba(56, 189, 248, 0.35);">
                ${badgeText}
            </div>
        </div>

        <div style="background: #1A202C; border-left: 4px solid ${themeBorderColor}; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Welcome, ${agencyName}!</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                Your Agency Fleet bundle ($${amountPaid}) has been activated. You can now deploy up to <strong>${quota} dedicated Android SMS appliances</strong> for your local business clients with 100% A2P 10DLC exemption.
            </p>
        </div>

        <!-- Master Agency Key Box -->
        <div style="background: #090B0E; border: 1px dashed ${themeBorderColor}; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 8px;">Your Master Agency Fleet Key</div>
            <div style="font-family: monospace; font-size: 20px; color: ${themeTextColor}; font-weight: bold; word-break: break-all; letter-spacing: 1px; margin-bottom: 8px;">
                ${masterAgencyKey}
            </div>
            <div style="font-size: 12px; color: #A0AEC0;">Authorized for ${quota} Client Appliance Deployments • Lifetime Access</div>
        </div>

        <!-- Agency Dashboard CTA -->
        <div style="text-align: center; margin-bottom: 28px;">
            <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #0284C7, #0EA5E9); color: #FFFFFF; font-weight: 800; font-size: 16px; padding: 14px 36px; border-radius: 30px; text-decoration: none; box-shadow: 0 6px 20px rgba(14, 165, 233, 0.35);">
                🚀 Open Agency Fleet Dashboard →
            </a>
            <div style="font-size: 12px; color: #949BAE; margin-top: 8px;">Direct Portal URL: <a href="${dashboardUrl}" style="color:${themeTextColor};">${dashboardUrl}</a></div>
        </div>

        <!-- Agency 4-Step Playbook -->
        <div style="border-top: 1px solid #222836; padding-top: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 12px 0;">📋 Agency Deployment Playbook</h3>
            <ol style="color: #CBD5E0; font-size: 14px; padding-left: 20px; line-height: 1.8;">
                <li><strong>Log into your Fleet Dashboard:</strong> Enter your Master Key above to view and manage your ${quota} appliance seats.</li>
                <li><strong>Deploy a Client Key:</strong> Click "Deploy New Appliance", enter your client's business name (e.g. <em>Joe's Plumbing</em>), and copy their dedicated setup sheet.</li>
                <li><strong>Install on Office Phone:</strong> Sideload the Pro APK on an office phone with a $10/mo SIM. Toggle Master Appliance ON.</li>
                <li><strong>Connect CRM / n8n:</strong> Hook your client's missed calls directly to GoHighLevel or n8n without filing a single A2P form.</li>
            </ol>
        </div>

        <div style="border-top: 1px solid #222836; padding-top: 18px; text-align: center; font-size: 12px; color: #718096;">
            Need assistance or priority agency support? Visit <a href="https://missedcallautosms.com/support" style="color: ${themeTextColor};">Agency Helpdesk</a> or reply directly to this email.
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
function generateVoiceProEmailHtml(customerName, licenseKey, forwardingNumber, carrierCode, carrierDeactivateCode) {
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your Turnkey AI Voice Receptionist is Live</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 620px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 46px; margin-bottom: 8px;">🎙️</div>
            <h1 style="color: #00E676; margin: 0; font-size: 24px; font-weight: 900;">Missed Call Auto SMS</h1>
            <div style="display: inline-block; margin-top: 6px; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; background: rgba(0, 230, 118, 0.15); color: #00E676; border: 1px solid rgba(0, 230, 118, 0.35);">
                MANAGED AI VOICE RECEPTIONIST PLAN ($29/MO)
            </div>
        </div>

        <div style="background: #1A202C; border-left: 4px solid #00E676; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Welcome, ${customerName}!</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                Your Turnkey AI Voice Receptionist subscription is active! Your dedicated local AI line is provisioned, loaded with <strong>200 included minutes</strong>, and ready to answer your calls.
            </p>
        </div>

        <!-- Assigned Line Card -->
        <div style="background: #090B0E; border: 1px dashed #00E676; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 6px;">Your Dedicated Inbound AI Line</div>
            <div style="font-family: monospace; font-size: 24px; color: #38BDF8; font-weight: bold; letter-spacing: 1px; margin-bottom: 6px;">
                ${forwardingNumber}
            </div>
            <div style="font-size: 12px; color: #00E676;">🟢 Status: ACTIVE • 200 Monthly Minutes Included</div>
        </div>

        <!-- 1-Touch Carrier Activation -->
        <div style="background: rgba(0, 230, 118, 0.06); border: 1px solid rgba(0, 230, 118, 0.3); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 10px 0;">📲 1-Step Carrier Activation (*71)</h3>
            <p style="color: #CBD5E0; font-size: 13px; line-height: 1.5; margin: 0 0 12px 0;">
                Open your mobile phone's dialer app, type this exact code, and press <strong>Call / Send</strong>:
            </p>
            <div style="background: #090B0E; padding: 12px; border-radius: 8px; border: 1px solid #222836; text-align: center; font-family: monospace; font-size: 20px; color: #00E676; font-weight: bold; margin-bottom: 12px;">
                ${carrierCode}
            </div>
            <p style="color: #949BAE; font-size: 12px; margin: 0; line-height: 1.4;">
                💡 Whenever you are busy and your phone rings for 15 seconds without answer, your carrier automatically routes the call to your AI assistant. Deactivate anytime by dialing <code>${carrierDeactivateCode || '*73'}</code>.
            </p>
        </div>

        <!-- Post-Call SMS & Portal -->
        <div style="border-top: 1px solid #222836; padding-top: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 15px; margin: 0 0 10px 0;">⚡ Post-Call Authentic SIM SMS</h3>
            <p style="color: #CBD5E0; font-size: 13px; line-height: 1.5; margin: 0 0 12px 0;">
                The second your AI assistant finishes a call, your phone fires an authentic text from your real carrier SIM.
            </p>
            <div style="background: #090B0E; padding: 12px; border-radius: 8px; border: 1px solid #222836; font-size: 12px; color: #CBD5E0;">
                <strong>License Key:</strong> <code style="color:#00E676;">${licenseKey}</code><br>
                <strong>Admin Portal:</strong> <a href="https://missedcallautosms.com/owner_admin_dashboard.html" style="color: #38BDF8;">missedcallautosms.com/owner_admin_dashboard.html</a>
            </div>
        </div>

        <div style="border-top: 1px solid #222836; padding-top: 18px; text-align: center; font-size: 12px; color: #718096;">
            Need help? Reply directly to this email or visit our <a href="https://missedcallautosms.com/owner_admin_dashboard.html" style="color: #00E676;">Owner Portal</a>.
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

    // Determine Tier: Agency 10-Pack ($799+) vs Agency 5-Pack ($399+) vs Pro ($149.99+) vs Standard ($49.99) vs Free Trial ($0.00)
    const isAgency10 = !isTrial && ((amountTotal >= 70000) || (session.metadata && session.metadata.tier === 'agency_10'));
    const isAgency5 = !isTrial && !isAgency10 && ((amountTotal >= 30000 && amountTotal < 70000) || (session.metadata && session.metadata.tier === 'agency_5'));
    const isAgency = isAgency5 || isAgency10;

    const isPro = !isTrial && !isAgency && (amountTotal >= 10000 ||
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

    // Managed AI Voice Receptionist ($29.00/mo Recurring Subscription)
    const isVoicePro = (amountTotal === 2900) || 
                       (session.metadata && session.metadata.tier === 'managed_voice_pro') ||
                       (session.metadata && session.metadata.service === 'voice_receptionist') ||
                       (session.subscription && amountTotal === 2900);

    if (isVoicePro) {
      const areaCodeMatch = (customerDetails.phone || '').match(/\+?1?\(?([2-9][0-9]{2})\)?/);
      const areaCode = areaCodeMatch ? areaCodeMatch[1] : '404';
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const randomPrefix = Math.floor(200 + Math.random() * 700);
      const forwardingNumber = `+1 (${areaCode}) ${randomPrefix}-${randomNum}`;
      const cleanDigits = `1${areaCode}${randomPrefix}${randomNum}`;
      const carrierCode = `*71${cleanDigits.slice(-10)}`;
      const carrierDeactivateCode = '*73';

      const voiceLicenseKey = generateKey(customerName, 0, true);
      console.log(`🎙️ [MANAGED VOICE PRO ACTIVATED] Line: ${forwardingNumber}, Key: ${voiceLicenseKey} for ${customerEmail}`);

      if (RESEND_API_KEY) {
        const emailSubject = `🎙️ Your AI Voice Receptionist is Live! Assigned Line: ${forwardingNumber}`;
        const emailHtml = generateVoiceProEmailHtml(customerName, voiceLicenseKey, forwardingNumber, carrierCode, carrierDeactivateCode);

        try {
          const sendResult = await sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml);
          console.log(`📧 [VOICE PRO EMAIL DELIVERED] Dispatched to ${customerEmail} (ID: ${sendResult.id})`);

          if (OWNER_NOTIFY_EMAIL && OWNER_NOTIFY_EMAIL !== customerEmail) {
            sendEmail(
              RESEND_API_KEY,
              OWNER_NOTIFY_EMAIL,
              `🎙️ New Voice Receptionist Subscriber ($29/mo): ${customerName}`,
              `<p>New Managed Voice Pro ($29/mo) subscriber active!</p>
               <p><strong>Customer:</strong> ${customerName} (${customerEmail})</p>
               <p><strong>Assigned Line:</strong> ${forwardingNumber}</p>
               <p><strong>Carrier Dial Code:</strong> <code>${carrierCode}</code></p>
               <p><strong>License Key:</strong> <code>${voiceLicenseKey}</code></p>`
            ).catch(() => {});
          }
        } catch (emailErr) {
          console.error(`❌ [VOICE PRO EMAIL FAILED] for ${customerEmail}:`, emailErr.message);
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received: true,
          tier: 'managed_voice_pro',
          forwardingNumber,
          carrierCode,
          carrierDeactivateCode,
          licenseKey: voiceLicenseKey,
          customerEmail: customerEmail,
          subscriptionId: session.subscription || session.id
        })
      };
    }

    // Agency Fleet Bundle ($399 for 5-Pack or $799 for 10-Pack)
    if (isAgency) {
      const quota = isAgency10 ? 10 : 5;
      const agencyMasterKey = generateAgencyKey(customerName, quota);
      const dashboardUrl = `https://${host}/agency_dashboard.html`;
      console.log(`🏢 [AGENCY ${quota}-PACK ACTIVATED] ${agencyMasterKey} for ${customerEmail} ($${amountPaid})`);

      try {
        const fleetCachePath = path.join(__dirname, '../../.agency_fleet_cache.json');
        let cache = {};
        if (fs.existsSync(fleetCachePath)) {
          cache = JSON.parse(fs.readFileSync(fleetCachePath, 'utf8'));
        }
        cache[agencyMasterKey] = {
          agencyName: customerName,
          customerEmail: customerEmail,
          quota: quota,
          tier: isAgency10 ? 'agency_10' : 'agency_5',
          createdAt: new Date().toISOString(),
          clients: []
        };
        fs.writeFileSync(fleetCachePath, JSON.stringify(cache, null, 2), 'utf8');
      } catch (cacheErr) {
        console.warn('Could not update agency fleet cache in webhook:', cacheErr.message);
      }

      if (RESEND_API_KEY) {
        const emailSubject = `🏢 Your Missed Call Auto SMS Agency ${quota}-Pack Fleet Key & Dashboard Access`;
        const emailHtml = generateAgencyEmailHtml(customerName, agencyMasterKey, quota, amountPaid, dashboardUrl);

        try {
          const sendResult = await sendEmail(RESEND_API_KEY, customerEmail, emailSubject, emailHtml);
          console.log(`📧 [AGENCY EMAIL DELIVERED] Dispatched to ${customerEmail} (ID: ${sendResult.id})`);

          if (OWNER_NOTIFY_EMAIL && OWNER_NOTIFY_EMAIL !== customerEmail) {
            sendEmail(
              RESEND_API_KEY,
              OWNER_NOTIFY_EMAIL,
              `🎉 New Agency ${quota}-Pack Purchase ($${amountPaid}): ${customerName}`,
              `<p>A new Agency partner has purchased an Agency ${quota}-Pack bundle!</p>
               <p><strong>Agency:</strong> ${customerName} (${customerEmail})</p>
               <p><strong>Amount Paid:</strong> $${amountPaid}</p>
               <p><strong>Master Agency Key:</strong> <code>${agencyMasterKey}</code></p>
               <p><strong>Quota:</strong> ${quota} Appliance Seats</p>
               <p><strong>Dashboard:</strong> ${dashboardUrl}</p>`
            ).catch(() => {});
          }
        } catch (emailErr) {
          console.error(`❌ [AGENCY EMAIL FAILED] for ${customerEmail}:`, emailErr.message);
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received: true,
          tier: isAgency10 ? 'agency_10' : 'agency_5',
          quota: quota,
          amountPaid: amountPaid,
          masterAgencyKey: agencyMasterKey,
          dashboardUrl: dashboardUrl,
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

  // Handle Subscription Deletion / Cancellation (e.g. Turnkey Voice Pro $29/mo or Free Trial)
  if (eventObj.type === 'customer.subscription.deleted') {
    const subscription = eventObj.data.object;
    const subId = subscription.id;
    const customerId = subscription.customer;
    console.log(`🛑 [SUBSCRIPTION CANCELLED] Subscription ${subId} for customer ${customerId} marked deleted.`);

    // If local voice_settings.json exists, update mode to OFF
    try {
      const fs = require('fs');
      const path = require('path');
      const voicePath = path.join(__dirname, '..', '..', 'voice_settings.json');
      if (fs.existsSync(voicePath)) {
        const settings = JSON.parse(fs.readFileSync(voicePath, 'utf8'));
        settings.mode = 'OFF';
        settings.lastDeactivated = new Date().toISOString();
        fs.writeFileSync(voicePath, JSON.stringify(settings, null, 2), 'utf8');
        console.log(`🎙️ [VOICE SETTINGS SYNC] Voice receptionist mode set to OFF following Stripe cancellation.`);
      }
    } catch (err) {
      console.warn('Could not update voice_settings on subscription cancel:', err.message);
    }

    if (RESEND_API_KEY && OWNER_NOTIFY_EMAIL) {
      sendEmail(
        RESEND_API_KEY,
        OWNER_NOTIFY_EMAIL,
        `ℹ️ Subscription Cancelled in Stripe: ${subId}`,
        `<p>A customer subscription has been cancelled/terminated in Stripe.</p>
         <p><strong>Subscription ID:</strong> <code>${subId}</code></p>
         <p><strong>Customer ID:</strong> <code>${customerId}</code></p>
         <p><strong>Status:</strong> Cancelled / Deleted</p>`
      ).catch(() => {});
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ received: true, cancelled: true, subscriptionId: subId })
    };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};