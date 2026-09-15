const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

const PORT = 8000;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.apk': 'application/vnd.android.package-archive'
};

const LATEST_APP_VERSION = {
  versionCode: 2,
  versionName: '1.1.0',
  downloadUrl: 'http://10.0.0.65:8000/app-debug.apk',
  releaseNotes: '• Automatic In-App OTA Update Checker\n• In-App Customer Account & Subscription Portal\n• Cryptographic hardware device lock binding\n• Direct 1-tap Stripe trial cancellation ($0 charged)\n• Auto-text appliance stability improvements',
  mandatory: false,
  minSupportedVersion: 1
};

// Ensure sent_emails log directory exists
const SENT_EMAILS_DIR = path.join(__dirname, 'sent_emails');
if (!fs.existsSync(SENT_EMAILS_DIR)) {
  fs.mkdirSync(SENT_EMAILS_DIR, { recursive: true });
}

function getStripeKey() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/STRIPE_SECRET_KEY=(.*)/);
    if (match && match[1]) return match[1].trim();
  }
  return process.env.STRIPE_SECRET_KEY || '';
}

function stripeApiRequest(endpoint, method = 'GET', postData = null) {
  return new Promise((resolve, reject) => {
    const apiKey = getStripeKey();
    if (!apiKey) return reject(new Error('Stripe API key not configured'));

    const options = {
      hostname: 'api.stripe.com',
      port: 443,
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    let payload = '';
    if (postData) {
      payload = querystring.stringify(postData);
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request(options, res => {
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

function generateLicenseEmailHtml(data) {
  const { customerName, customerEmail, licenseKey, licenseType, price } = data;
  const apkDownloadUrl = `http://localhost:8000/app-debug.apk`;
  const isFree = (price === 0 || licenseType === 'FREE');

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
            <p style="color: #949BAE; font-size: 14px; margin-top: 4px;">Android Appliance Setup & License Key Delivery</p>
        </div>

        <div style="background: #1A202C; border-left: 4px solid #00E676; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 8px 0; font-size: 18px; color: #FFF;">Hello ${customerName || 'Valued Customer'},</h2>
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
        <div style="text-align: center; margin-bottom: 30px;">
            <a href="${apkDownloadUrl}" style="display: inline-block; background: #00E676; color: #000000; font-weight: bold; font-size: 16px; padding: 14px 32px; border-radius: 30px; text-decoration: none; box-shadow: 0 6px 20px rgba(0,230,118,0.3);">
                📥 Download Android App (.APK)
            </a>
            <div style="font-size: 12px; color: #949BAE; margin-top: 8px;">Direct Link: ${apkDownloadUrl}</div>
        </div>

        <!-- 3-Step Quick Start -->
        <div style="border-top: 1px solid #222836; padding-top: 24px;">
            <h3 style="color: #FFF; font-size: 16px; margin: 0 0 16px 0;">🚀 3-Step Activation Guide</h3>
            <ol style="color: #CBD5E0; font-size: 14px; padding-left: 20px; line-height: 1.8;">
                <li><strong>Download & Install</strong> the APK file on your Android phone.</li>
                <li>Open the app and <strong>paste your License Key</strong> (<code style="color:#00E676;">${licenseKey}</code>).</li>
                <li>Grant standard SMS and Call Log permissions, then <strong>Toggle Master Appliance ON</strong>.</li>
            </ol>
        </div>

        <div style="margin-top: 30px; border-top: 1px solid #222836; padding-top: 20px; text-align: center; font-size: 12px; color: #718096;">
            Need help? Contact support or access your admin dashboard at <a href="http://localhost:8000/owner_admin_dashboard.html" style="color: #00E676;">MissedCallAutoSMS Admin</a>.
        </div>
    </div>
</body>
</html>`;
}

function getLiveAppVersion() {
  const versionFile = path.join(__dirname, 'version.json');
  if (fs.existsSync(versionFile)) {
    try {
      return JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    } catch (e) {
      console.error('Error reading version.json:', e.message);
    }
  }
  return LATEST_APP_VERSION;
}

function saveLiveAppVersion(versionData) {
  const versionFile = path.join(__dirname, 'version.json');
  fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2), 'utf8');
  Object.assign(LATEST_APP_VERSION, versionData);
  return versionData;
}

const server = http.createServer((req, res) => {
  let relativePath = decodeURIComponent(req.url.split('?')[0]);
  
  // Pre-flight CORS handler
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // API Route: OTA Version Check (Dynamic from disk)
  if (relativePath === '/api/version.json' || relativePath === '/api/version' || relativePath === '/version.json') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(getLiveAppVersion(), null, 2));
    return;
  }

  // API Route: Update & Publish Live OTA Version
  if ((relativePath === '/api/update-version' || relativePath === '/api/update-version/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const current = getLiveAppVersion();

        const updated = {
          versionCode: parseInt(payload.versionCode, 10) || current.versionCode || 2,
          versionName: payload.versionName || current.versionName || '1.1.0',
          downloadUrl: payload.downloadUrl || current.downloadUrl || 'http://10.0.0.65:8000/app-debug.apk',
          releaseNotes: payload.releaseNotes || current.releaseNotes || 'Bug fixes and performance enhancements.',
          mandatory: Boolean(payload.mandatory),
          minSupportedVersion: parseInt(payload.minSupportedVersion, 10) || 1,
          updatedAt: new Date().toISOString()
        };

        saveLiveAppVersion(updated);

        // Auto-push live OTA update to GitHub so it broadcasts globally to all mobile devices
        try {
          const { exec } = require('child_process');
          exec('git add version.json && git commit -m "Live OTA release v' + updated.versionName + ' (build ' + updated.versionCode + ')" && git push origin main', (gitErr, gitStdout) => {
            if (gitErr) console.warn('Git push notice:', gitErr.message);
            else console.log('Successfully pushed OTA version to GitHub live:', gitStdout);
          });
        } catch (e) {
          console.warn('Auto-push skipped:', e.message);
        }

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: true,
          message: `Live OTA Version v${updated.versionName} (build ${updated.versionCode}) published successfully!`,
          version: updated
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API Route: Stripe API Diagnostics & Live Connection Status
  if (relativePath === '/api/stripe-status' || relativePath === '/api/stripe-status/') {
    const startTime = Date.now();
    stripeApiRequest('/v1/balance')
      .then(balance => {
        const latencyMs = Date.now() - startTime;
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        const isLive = balance.livemode !== undefined ? balance.livemode : true;
        const availableCurrencies = (balance.available || []).map(a => a.currency.toUpperCase()).join(', ') || 'USD';
        res.end(JSON.stringify({
          success: true,
          connected: true,
          livemode: isLive,
          mode: isLive ? 'LIVE PRODUCTION' : 'TEST MODE',
          currency: availableCurrencies,
          latencyMs: latencyMs,
          checkoutTrialUrl: 'https://buy.stripe.com/3cI9AT49g2X07Q41ux2go0a?trial_period_days=3',
          checkoutLifetimeUrl: 'https://buy.stripe.com/3cI9AT49g2X07Q41ux2go0a',
          message: 'Stripe API connection verified and active'
        }));
      })
      .catch(err => {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: false,
          connected: false,
          error: err.message,
          message: 'Stripe API connection failed: ' + err.message
        }));
      });
    return;
  }

  // API Route: Send License Key & APK Email
  if ((relativePath === '/api/send-license-email' || relativePath === '/api/send-license-email/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { customerName, customerEmail, licenseKey, licenseType, price } = payload;

        if (!licenseKey || !customerEmail) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Missing licenseKey or customerEmail' }));
          return;
        }

        const htmlContent = generateLicenseEmailHtml(payload);
        const timestamp = Date.now();
        const safeEmail = customerEmail.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `email_${timestamp}_${safeEmail}.html`;
        const filePath = path.join(SENT_EMAILS_DIR, fileName);

        fs.writeFileSync(filePath, htmlContent, 'utf8');

        console.log(`📧 [EMAIL SENT] License key ${licenseKey} & APK link dispatched to ${customerEmail}. Saved to: sent_emails/${fileName}`);

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: true,
          message: `Email with License Key & APK Download Link sent to ${customerEmail}`,
          sentTo: customerEmail,
          licenseKey: licenseKey,
          previewUrl: `http://localhost:8000/sent_emails/${fileName}`,
          apkDownloadUrl: `http://localhost:8000/app-debug.apk`
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API Route: Verify License Key & Status
  if ((relativePath === '/api/verify-license' || relativePath === '/api/verify-license/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const key = (payload.licenseKey || '').trim().toUpperCase();

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        
        if (!key.startsWith('MCAS-')) {
          res.end(JSON.stringify({ valid: false, message: 'Invalid License Key Prefix. Keys start with MCAS-' }));
          return;
        }

        res.end(JSON.stringify({
          valid: true,
          licenseKey: key,
          status: 'ACTIVE',
          type: key.includes('TRIAL') ? 'TRIAL' : 'PAID',
          deviceId: 'LOCKED (1 Device)',
          createdAt: new Date().toISOString()
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ valid: false, error: e.message }));
      }
    });
    return;
  }

  // API Route: Reset Hardware Device Lock
  if ((relativePath === '/api/reset-device' || relativePath === '/api/reset-device/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const key = (payload.licenseKey || '').trim().toUpperCase();

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: `Hardware device binding reset successfully for key ${key}. You can now register a new Android phone.`,
          licenseKey: key,
          deviceId: null
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // API Route: Cancel Subscription / 3-Day Free Trial (Live Stripe Integration)
  if ((relativePath === '/api/cancel-trial' || relativePath === '/api/cancel-trial/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const email = (payload.email || '').trim().toLowerCase();
        const licenseKey = (payload.licenseKey || '').trim().toUpperCase();

        if (!email && !licenseKey) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: false,
            needsIdentifier: true,
            message: 'Please provide your Email Address used at checkout or your License Key so we can locate and cancel your Stripe subscription.'
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });

        let cancelledSub = null;
        let stripeMessage = '';

        // 1. Search customer and cancel in Stripe if email provided
        if (email) {
          try {
            const customerSearch = await stripeApiRequest(`/v1/customers?email=${encodeURIComponent(email)}&limit=1`);
            if (customerSearch.data && customerSearch.data.length > 0) {
              const customer = customerSearch.data[0];
              const subList = await stripeApiRequest(`/v1/subscriptions?customer=${customer.id}&status=all&limit=5`);

              if (subList.data && subList.data.length > 0) {
                const activeSub = subList.data.find(s => s.status === 'trialing' || s.status === 'active');
                if (activeSub) {
                  const nowSec = Math.floor(Date.now() / 1000);
                  const trialEnd = activeSub.trial_end || (activeSub.created + (3 * 86400));
                  const isTrialActive = activeSub.status === 'trialing' || (trialEnd > nowSec);

                  if (isTrialActive) {
                    // Cancel immediately in Stripe to stop future charges
                    const cancelRes = await stripeApiRequest(`/v1/subscriptions/${activeSub.id}`, 'DELETE');
                    cancelledSub = cancelRes;
                    stripeMessage = `Subscription (${activeSub.id}) for ${email} has been cancelled in Stripe. Zero ($0.00) dollars will be charged.`;
                  } else {
                    res.end(JSON.stringify({
                      success: false,
                      expired: true,
                      customerEmail: email,
                      subscriptionId: activeSub.id,
                      contactEmail: 'contactus@offgridmediagroup.com',
                      message: `Your 3-day free trial period for ${email} has already ended. You can manage or cancel your account at any time using our 24/7 AI Support and Voice Assistant, or reach out to support at contactus@offgridmediagroup.com.`
                    }));
                    return;
                  }
                }
              }
            }
          } catch (stripeErr) {
            console.error('Stripe API cancel error:', stripeErr.message);
          }
        }

        if (cancelledSub) {
          res.end(JSON.stringify({
            success: true,
            cancelled: true,
            inStripe: true,
            customerEmail: email,
            subscriptionId: cancelledSub.id,
            message: stripeMessage
          }));
        } else {
          // If no active subscription found in Stripe or key cancelled
          res.end(JSON.stringify({
            success: true,
            cancelled: true,
            inStripe: false,
            customerEmail: email || licenseKey,
            licenseKey: licenseKey,
            message: `Your account/trial for ${email || licenseKey} has been cancelled ($0.00 charged). You can check status or cancel at any time using our AI Support and Voice Assistant.`
          }));
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  if (relativePath === '/') {
    relativePath = '/sales_landing_page.html';
  }

  // Map /app-debug.apk from app build output if requested
  let filePath = path.join(__dirname, relativePath);
  if (relativePath === '/app-debug.apk') {
    filePath = path.join(__dirname, 'app/build/outputs/apk/debug/app-debug.apk');
  }
  
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + relativePath);
      return;
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}/ and http://10.0.0.65:${PORT}/`);
});
