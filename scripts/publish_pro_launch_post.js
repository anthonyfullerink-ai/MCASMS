const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables safely from project dir
function loadEnv() {
  const envPath = 'C:\\Users\\AnthonyFuller\\.gemini\\antigravity\\scratch\\MissedCallAutoText\\.env';
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val.trim();
      }
    });
  }
}

loadEnv();

const TOKEN = process.env.META_PAGE_ACCESS_TOKEN || '';
const FB_PAGE_ID = (process.env.FB_PAGE_ID && process.env.FB_PAGE_ID !== 'true' && process.env.FB_PAGE_ID !== 'false')
  ? process.env.FB_PAGE_ID
  : '1248332278370968';
const IG_USER_ID = (process.env.IG_USER_ID && process.env.IG_USER_ID !== 'true' && process.env.IG_USER_ID !== 'false')
  ? process.env.IG_USER_ID
  : '17841428781387416';

if (!TOKEN) {
  console.error('❌ Error: META_PAGE_ACCESS_TOKEN not found in .env');
  process.exit(1);
}

const IMAGE_URL = 'https://missedcallautosms.com/assets/social/pro-automation-launch.jpg';

const FB_CAPTION = `🚀 UNVEILING: Missed Call Auto-SMS Pro — Powered with Make.com & n8n Automation Integrations! ⚡

We are thrilled to officially introduce Missed Call Auto-SMS Pro Edition, the ultimate hardware appliance utility designed to transform missed inbound phone calls into immediate booked revenue.

🔥 WHAT'S NEW IN THE PRO AUTOMATION EDITION:
✅ Official Make.com & n8n Webhook Triggers — Instantly pass caller data, timestamps, and customer replies directly into your CRM (HubSpot, GoHighLevel, Salesforce), Google Sheets, Slack, or email workflows.
✅ 15-Second Automated Text-Back — Engages prospects instantly before they call your competitors.
✅ 100% Carrier A2P 10DLC Exempt — Dispatches via your physical Android SIM hardware, completely bypassing Twilio registration headaches, carrier surcharges, and message filtering.
✅ Dual SIM Line Selection — Intelligently route auto-replies across personal or business carrier lines.
✅ Zero Monthly SaaS Subscriptions — One-time lifetime license. No per-text fees. No monthly bills.

Stop bleeding revenue to unanswered phone calls. Supercharge your speed-to-lead and sync every lead into your favorite automation stack effortlessly.

👉 Get the Pro Edition & Workflow templates today: https://missedcallautosms.com

#MissedCallAutoSMS #n8n #MakeAutomation #MakeCom #SmallBusinessAutomation #SpeedToLead #ContractorLife #BusinessAutomation #CRMIntegration #AndroidApp #NoCode`;

const IG_CAPTION = `🚀 UNVEILING: Missed Call Auto-SMS Pro — Now with Make.com & n8n Automation Integrations! ⚡

Never lose another client to a missed call. Missed Call Auto-SMS Pro turns unanswered phone calls into instant booked business in under 15 seconds.

🔥 PRO AUTOMATION FEATURES:
⚡ Seamless Make.com & n8n Webhooks — Auto-dispatch caller info & replies straight to your CRM, Slack, or Google Sheets.
📱 Physical SIM Dispatch — 100% Carrier A2P 10DLC exempt! Zero Twilio fees, zero carrier bans.
📶 Dual SIM Carrier Routing — Choose your preferred business line.
💰 Zero Monthly Subscriptions — One-time lifetime license.

Stop letting competitors win your missed calls. Build powerful automated workflows with n8n & Make today!

🔗 Tap the link in bio to get the Pro Edition: https://missedcallautosms.com

#MissedCallAutoSMS #n8n #MakeAutomation #MakeCom #SmallBusinessAutomation #SpeedToLead #ContractorLife #BusinessAutomation #CRMIntegration #WorkflowAutomation #NoCode`;

function postGraphApi(endpoint, postData) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(postData);
    const options = {
      hostname: 'graph.facebook.com',
      port: 443,
      path: endpoint,
      method: 'POST',
      headers: {
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
            reject(new Error(`HTTP ${res.statusCode}: ` + (json.error ? json.error.message : body)));
          }
        } catch (e) {
          reject(new Error(`Parse error (${res.statusCode}): ` + body));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function publishProLaunch() {
  console.log('====================================================');
  console.log('🚀 PUBLISHING PRO AUTOMATION LAUNCH POST');
  console.log('====================================================');
  console.log(`Image URL: ${IMAGE_URL}`);
  console.log(`Facebook Page ID: ${FB_PAGE_ID}`);
  console.log(`Instagram ID: ${IG_USER_ID}`);
  console.log('----------------------------------------------------');

  const results = {
    facebook: null,
    instagram: null
  };

  // 1. Post Photo to Facebook Page
  console.log('\n🔵 [1/2] Publishing to Facebook Page with Official Badges Image...');
  try {
    const fbRes = await postGraphApi(`/v20.0/${FB_PAGE_ID}/photos`, {
      url: IMAGE_URL,
      caption: FB_CAPTION,
      access_token: TOKEN
    });
    console.log('🎉 SUCCESS! Facebook Post is LIVE!');
    console.log(`📌 Post / Photo ID: ${fbRes.id} (Post ID: ${fbRes.post_id || fbRes.id})`);
    results.facebook = fbRes;
  } catch (err) {
    console.error('❌ Facebook Publishing Failed:', err.message);
  }

  // 2. Post Photo to Instagram Feed
  console.log('\n🟣 [2/2] Publishing to Instagram Feed with Official Badges Image...');
  try {
    console.log('Step 2a: Creating Instagram media container...');
    const containerRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
      image_url: IMAGE_URL,
      caption: IG_CAPTION,
      access_token: TOKEN
    });
    console.log(`✔ Container created! ID: ${containerRes.id}`);

    console.log('Waiting 5 seconds for Meta server processing...');
    await new Promise(r => setTimeout(r, 5000));

    console.log('Step 2b: Publishing container to Instagram feed...');
    const publishRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
      creation_id: containerRes.id,
      access_token: TOKEN
    });
    console.log('🎉 SUCCESS! Instagram Post is LIVE!');
    console.log(`📌 Media ID: ${publishRes.id}`);
    results.instagram = publishRes;
  } catch (err) {
    console.error('❌ Instagram Publishing Failed:', err.message);
  }

  console.log('\n====================================================');
  console.log('🏁 LAUNCH BROADCAST COMPLETE');
  console.log('====================================================');
  console.log('Summary:', JSON.stringify(results, null, 2));
}

publishProLaunch();
