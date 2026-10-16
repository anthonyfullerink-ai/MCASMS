const https = require('https');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Missed Call Auto SMS <support@missedcallautosms.com>';


function generateEmailHtml(name, licenseKey, apkDownloadUrl, isFree) {
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your MissedCallAutoSMS License Key & APK Download</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 30px;">
    <div style="max-width: 600px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 40px; margin-bottom: 8px;">📱</div>
            <h1 style="color: #00E676; margin: 0; font-size: 24px;">Missed Call Auto SMS</h1>
            <p style="color: #949BAE; font-size: 14px; margin-top: 4px;">Android Appliance Setup & License Delivery</p>
        </div>

        <div style="background: #1A202C; border-left: 4px solid #00E676; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 8px 0; font-size: 18px; color: #FFF;">Hello ${name || 'Valued Customer'},</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                Thank you for choosing <strong>Missed Call Auto SMS</strong>! Your ${isFree ? 'Complimentary' : 'Lifetime'} License Key is active and ready to use.
            </p>
        </div>

        <!-- License Box -->
        <div style="background: #090B0E; border: 1px dashed #00E676; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 12px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 6px;">Your Hardware License Key</div>
            <div style="font-family: monospace; font-size: 20px; color: #00E676; font-weight: bold; word-break: break-all; letter-spacing: 1px; margin-bottom: 12px;">
                ${licenseKey}
            </div>
            <div style="font-size: 12px; color: #A0AEC0;">Tied to 1 Android Device • Hardware Bound</div>
        </div>

        <!-- APK Download Button -->
        <div style="text-align: center; margin-bottom: 20px;">
            <a href="${apkDownloadUrl}" style="display: inline-block; background: #00E676; color: #000000; font-weight: bold; font-size: 16px; padding: 14px 32px; border-radius: 30px; text-decoration: none; box-shadow: 0 6px 20px rgba(0,230,118,0.3);">
                📥 1. Download Android App (.APK)
            </a>
            <div style="font-size: 12px; color: #949BAE; margin-top: 8px;">Direct Link: ${apkDownloadUrl}</div>
        </div>

        <!-- 1-Tap Deep Link Activation -->
        <div style="text-align: center; margin-bottom: 28px;">
            <a href="mcasms://activate?key=${licenseKey}" style="display: inline-block; background: #1A2234; border: 1px solid #00E676; color: #00E676; font-weight: bold; font-size: 14px; padding: 12px 26px; border-radius: 24px; text-decoration: none;">
                ⚡ 2. One-Tap Device Activation
            </a>
            <div style="font-size: 11px; color: #949BAE; margin-top: 6px;">(Tap after installing to auto-activate without typing)</div>
        </div>

        <!-- Live Client Dashboard Access Card -->
        <div style="background: linear-gradient(180deg, #0F172A 0%, #1E293B 100%); border: 1px solid #38BDF8; border-radius: 14px; padding: 22px; text-align: center; margin-bottom: 24px; box-shadow: 0 4px 18px rgba(56, 189, 248, 0.15);">
            <div style="display: inline-block; font-size: 11px; font-weight: 800; color: #38BDF8; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 20px; padding: 3px 12px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                🌐 Web Dashboard Access
            </div>
            <h3 style="color: #FFFFFF; font-size: 18px; margin: 0 0 8px 0; font-weight: 800;">Your Real-Time Client Portal</h3>
            <p style="color: #94A3B8; font-size: 13px; line-height: 1.5; margin: 0 0 16px 0;">
                Track every incoming call transcript, monitor authentic SIM text conversations, and manage autonomous AI dispatch tasks from any desktop or mobile browser.
            </p>
            <a href="https://missedcallautosms.com/client_portal.html?key=${encodeURIComponent(licenseKey)}" style="display: inline-block; background: #2563EB; color: #FFFFFF; font-weight: 800; font-size: 15px; padding: 13px 32px; border-radius: 30px; text-decoration: none; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                ⚡ Open Your Client Dashboard →
            </a>
            <div style="margin-top: 12px; font-size: 11px; color: #64748B;">
                Direct Link: <a href="https://missedcallautosms.com/client_portal.html?key=${encodeURIComponent(licenseKey)}" style="color: #38BDF8;">missedcallautosms.com/client_portal.html?key=${licenseKey}</a>
            </div>
        </div>

        <!-- 3-Step Quick Start -->
        <div style="border-top: 1px solid #222836; padding-top: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 16px 0;">🚀 Super-Fast Activation Guide</h3>
            <ol style="color: #CBD5E0; font-size: 14px; padding-left: 20px; line-height: 1.8;">
                <li><strong>Download & Install</strong> the APK above onto your Android device.</li>
                <li>Tap <strong>"One-Tap Device Activation"</strong> above (or copy your key <code style="color:#00E676;">${licenseKey}</code> — the app auto-detects it from your clipboard!).</li>
                <li>Tap <strong>"Grant All Required Permissions (1-Tap)"</strong> and turn the Master Switch <strong>ON</strong>.</li>
            </ol>
        </div>

        <div style="margin-top: 30px; border-top: 1px solid #222836; padding-top: 20px; text-align: center; font-size: 12px; color: #718096;">
            Need help? Visit your <a href="https://missedcallautosms.com/client_portal.html?key=${encodeURIComponent(licenseKey)}" style="color: #00E676; font-weight: 700;">Client Dashboard</a> or reply to this email.
        </div>
    </div>
</body>
</html>`;
}

function generatePortalWelcomeHtml(name, licenseKey) {
  const portalUrl = `https://missedcallautosms.com/client_portal.html?key=${encodeURIComponent(licenseKey)}`;
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your Missed Call Auto SMS Web Dashboard Access</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; background-color: #090B0E; color: #FFFFFF; margin: 0; padding: 24px;">
    <div style="max-width: 600px; margin: 0 auto; background: #131720; border: 1px solid #222836; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 44px; margin-bottom: 8px;">🌐⚡</div>
            <h1 style="color: #38BDF8; margin: 0; font-size: 24px; font-weight: 900;">Missed Call Auto SMS</h1>
            <div style="display: inline-block; margin-top: 6px; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; background: rgba(56, 189, 248, 0.15); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.35);">
                LIVE CLIENT WEB PORTAL
            </div>
        </div>

        <div style="background: #1A202C; border-left: 4px solid #38BDF8; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #FFF;">Welcome to your Web Dashboard, ${name || 'Valued Customer'}!</h2>
            <p style="margin: 0; color: #CBD5E0; font-size: 14px; line-height: 1.5;">
                In addition to your Android appliance, you have full 24/7 web access to monitor your call activity, review SMS conversations, and track urgent leads from any computer, tablet, or smartphone.
            </p>
        </div>

        <!-- 1-Click Access Card -->
        <div style="background: linear-gradient(180deg, #0F172A 0%, #1E293B 100%); border: 1px solid #38BDF8; border-radius: 14px; padding: 24px; text-align: center; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(56, 189, 248, 0.2);">
            <div style="font-size: 12px; color: #94A3B8; text-transform: uppercase; font-weight: bold; margin-bottom: 8px;">Direct 1-Click Dashboard Link</div>
            <a href="${portalUrl}" style="display: inline-block; background: #2563EB; color: #FFFFFF; font-weight: 800; font-size: 16px; padding: 14px 36px; border-radius: 30px; text-decoration: none; box-shadow: 0 6px 20px rgba(37, 99, 235, 0.45); margin-bottom: 12px;">
                ⚡ Open Your Client Dashboard →
            </a>
            <div style="font-size: 11px; color: #64748B;">
                Direct URL: <a href="${portalUrl}" style="color: #38BDF8; word-break: break-all;">${portalUrl}</a>
            </div>
        </div>

        <!-- License Key Box -->
        <div style="background: #090B0E; border: 1px dashed #38BDF8; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
            <div style="font-size: 11px; color: #949BAE; text-transform: uppercase; font-weight: bold; margin-bottom: 6px;">Your Master License Key</div>
            <div style="font-family: monospace; font-size: 18px; color: #38BDF8; font-weight: bold; word-break: break-all; letter-spacing: 0.5px;">
                ${licenseKey}
            </div>
            <div style="font-size: 11px; color: #64748B; margin-top: 6px;">Use this key to sign in anytime or set a custom password in your dashboard.</div>
        </div>

        <!-- Dashboard Capabilities -->
        <div style="border-top: 1px solid #222836; padding-top: 20px; margin-bottom: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 14px 0;">✨ What You Can Do in Your Portal:</h3>
            
            <div style="display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start;">
                <div style="font-size: 20px;">📞</div>
                <div>
                    <div style="color: #FFF; font-size: 14px; font-weight: 700;">Live Call Feed &amp; Audio Transcripts</div>
                    <div style="color: #94A3B8; font-size: 12px; line-height: 1.4;">Review incoming calls, read full AI conversation transcripts, and see urgency ratings and caller requests.</div>
                </div>
            </div>

            <div style="display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start;">
                <div style="font-size: 20px;">💬</div>
                <div>
                    <div style="color: #FFF; font-size: 14px; font-weight: 700;">Authentic SIM SMS History</div>
                    <div style="color: #94A3B8; font-size: 12px; line-height: 1.4;">Monitor every automated text and inbound response routed through your cellular phone's SIM.</div>
                </div>
            </div>

            <div style="display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start;">
                <div style="font-size: 20px;">📋</div>
                <div>
                    <div style="color: #FFF; font-size: 14px; font-weight: 700;">Autonomous Action Items</div>
                    <div style="color: #94A3B8; font-size: 12px; line-height: 1.4;">Keep track of emergency service calls, quote proposals, and technician dispatches automatically extracted by the system.</div>
                </div>
            </div>

            <div style="display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start;">
                <div style="font-size: 20px;">🔐</div>
                <div>
                    <div style="color: #FFF; font-size: 14px; font-weight: 700;">Permanent Sign-In &amp; Google Single Sign-On</div>
                    <div style="color: #94A3B8; font-size: 12px; line-height: 1.4;">Create a permanent username and password or activate 1-click Google Sign-In on the portal login screen.</div>
                </div>
            </div>
        </div>

        <div style="border-top: 1px solid #222836; padding-top: 18px; text-align: center; font-size: 12px; color: #718096;">
            Need assistance? Simply reply to this email or reach us at <a href="mailto:support@missedcallautosms.com" style="color: #38BDF8;">support@missedcallautosms.com</a>.
        </div>
    </div>
</body>
</html>`;
}

function sendViaResend(apiKey, fromEmail, toEmail, subject, htmlContent) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      from: fromEmail || FROM_EMAIL,
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
      res.on('data', chunk => body += chunk);
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

  if (event.httpMethod === 'GET') {
    const reqHeaders = event.headers || {};
    const resendKey = reqHeaders['x-resend-key'] || RESEND_API_KEY;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        configured: !!resendKey,
        hasEnvKey: !!RESEND_API_KEY,
        hasHeaderKey: !!reqHeaders['x-resend-key'],
        fromEmail: FROM_EMAIL,
        provider: 'Resend Cloud API'
      })
    };
  }

  try {
    let payload = {};
    if (event.body) {
      try { payload = JSON.parse(event.body); } catch (e) {}
    }

    const { customerName, customerEmail, licenseKey, licenseType, price } = payload;
    if (!customerEmail || !licenseKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'customerEmail and licenseKey are required.' })
      };
    }

    const reqHeaders = event.headers || {};
    const host = reqHeaders.host || 'missedcallautosms.com';
    const proto = reqHeaders['x-forwarded-proto'] || 'https';
    const apkDownloadUrl = `https://${host}/MissedCallAutoSMS.apk`;
    const isFree = licenseType === 'FREE' || price === 0 || price === '0' || price === '0.00';

    const resendKey = reqHeaders['x-resend-key'] || RESEND_API_KEY;

    const isPortalAccess = payload.emailType === 'PORTAL_ACCESS' || payload.emailType === 'DASHBOARD_WELCOME';
    const emailSubject = isPortalAccess
      ? `🌐 Your Missed Call Auto SMS Client Dashboard Access is Ready`
      : `Your Missed Call Auto SMS License Key & Setup Guide`;
    const emailHtml = isPortalAccess
      ? generatePortalWelcomeHtml(customerName, licenseKey)
      : generateEmailHtml(customerName, licenseKey, apkDownloadUrl, isFree);

    let cloudSent = false;
    let cloudResult = null;
    let cloudError = null;

    if (resendKey) {
      try {
        cloudResult = await sendViaResend(resendKey, FROM_EMAIL, customerEmail, emailSubject, emailHtml);
        cloudSent = true;
      } catch (err) {
        cloudError = err.message;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        cloudSent: cloudSent,
        cloudResult: cloudResult,
        cloudError: cloudError,
        sentTo: customerEmail,
        customerName: customerName,
        licenseKey: licenseKey,
        apkDownloadUrl: apkDownloadUrl,
        message: cloudSent 
          ? `Email successfully delivered to ${customerEmail} via Cloud Email API.`
          : `License generated! Note: Cloud email API is not configured. Use the 'Open in Email App' or 'Copy Text' button to send.`
      })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: e.message })
    };
  }
};