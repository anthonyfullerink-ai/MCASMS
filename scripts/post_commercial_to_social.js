const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables safely
function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
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
const FB_PAGE_ID = process.env.FB_PAGE_ID || '1248332278370968';
const IG_USER_ID = process.env.IG_USER_ID || '17841428781387416';

if (!TOKEN) {
  console.error('❌ Error: META_PAGE_ACCESS_TOKEN not found in .env');
  process.exit(1);
}

const VIDEO_URL = 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/ads/missed_call_auto_sms_ad.mp4';
const COVER_URL = 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/ads/scenes/scene_1.jpg';

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

function getGraphApi(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'graph.facebook.com',
      port: 443,
      path: endpoint,
      method: 'GET'
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
    req.end();
  });
}

async function postToFacebook() {
  console.log('\n🔵 [1/2] Publishing Video Ad to Facebook Page...');
  const fbDescription = `🔧 When you're under a sink or up on a ladder, you can't answer the phone. And every call sent to voicemail is a $1,200 job lost to your competitor.

Homeowners don’t wait. Answering services cost $500/month, and cloud apps get blocked by carrier spam filters.

Meet Missed Call Auto SMS: a dedicated hardware appliance running directly on your phone's physical SIM card—100% exempt from A2P carrier spam bans.

⚡ The moment a call drops, it fires back a natural, personal text within 15 seconds from your real business number. Over 80% of customers reply immediately, locking in the revenue before your competitors even listen to their voicemail.

❌ No monthly subscriptions.
❌ No expensive call centers.
✅ Own it for life for just $49.99.

Start your 3-day free trial today at https://missedcallautosms.com

#ContractorLife #SmallBusiness #Plumbing #HVAC #Electrician #SpeedToLead #MissedCallAutoSMS #NoMonthlyFees`;

  try {
    const res = await postGraphApi(`/v20.0/${FB_PAGE_ID}/videos`, {
      file_url: VIDEO_URL,
      title: 'Stop Losing $1,200 Jobs to Voicemail | Missed Call Auto SMS',
      description: fbDescription,
      access_token: TOKEN
    });
    console.log('🎉 SUCCESS! Facebook Video Ad is LIVE!');
    console.log(`📌 Video ID: ${res.id}`);
    console.log(`🔗 Facebook Page: https://facebook.com/${FB_PAGE_ID}`);
    return res;
  } catch (err) {
    console.error('❌ Facebook Video Post Failed:', err.message);
    throw err;
  }
}

async function postToInstagram() {
  console.log('\n🟣 [2/2] Publishing Video Ad to Instagram...');
  const igCaption = `When you're on a job site, you can't always pick up the phone. But in home services, speed-to-lead is everything—homeowners don't leave voicemails, they just call the next contractor on Google. 📱💨

Missed Call Auto SMS turns your phone into an autonomous speed-to-lead appliance. 

Because it sends directly through your physical SIM card:
✅ 100% carrier compliant (zero A2P 10DLC spam filter blocks)
✅ Texts fire within 15 seconds from your REAL business number
✅ 80%+ response rate from ready-to-book customers
✅ Zero monthly fees or recurring software subscriptions

Own the appliance for life. Try it free for 3 days at the link in bio! (MissedCallAutoSMS.com)

#contractor #plumber #electrician #hvac #hvaclife #contractorsofinstagram #smallbusinessowner #tradielife #speedtolead #missedcallautosms #fieldservice`;

  try {
    console.log('Step 2a: Creating Instagram REELS container with video...');
    const containerRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
      media_type: 'REELS',
      video_url: VIDEO_URL,
      cover_url: COVER_URL,
      caption: igCaption,
      share_to_feed: true,
      access_token: TOKEN
    });

    const containerId = containerRes.id;
    console.log(`✔ Container created! ID: ${containerId}`);

    // Poll status until FINISHED
    console.log('Step 2b: Waiting for Instagram to process video container...');
    let isReady = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 * 5s = 150 seconds max

    while (!isReady && attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, 5000));
      const statusRes = await getGraphApi(`/v20.0/${containerId}?fields=status_code,status&access_token=${TOKEN}`);
      console.log(`Polling status (attempt ${attempts}): ${statusRes.status_code || statusRes.status}`);

      if (statusRes.status_code === 'FINISHED') {
        isReady = true;
      } else if (statusRes.status_code === 'ERROR') {
        throw new Error(`Container processing failed: ${JSON.stringify(statusRes)}`);
      }
    }

    if (!isReady) {
      throw new Error('Timed out waiting for Instagram video processing');
    }

    console.log('Step 2c: Publishing container to live Instagram feed...');
    const publishRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
      creation_id: containerId,
      access_token: TOKEN
    });

    console.log('🎉 SUCCESS! Instagram Video Ad is LIVE!');
    console.log(`📌 Media ID: ${publishRes.id}`);
    console.log('🔗 Check profile: https://instagram.com/missedcallautosms');
    return publishRes;
  } catch (err) {
    console.error('❌ Instagram Video Post Failed:', err.message);
    throw err;
  }
}

async function run() {
  console.log('====================================================');
  console.log('🚀 META COMMERCIAL AD VIDEO PUBLISHER');
  console.log('====================================================');
  console.log(`Video URL: ${VIDEO_URL}`);
  console.log(`Cover URL: ${COVER_URL}`);
  console.log('----------------------------------------------------');

  let fbSuccess = false;
  let igSuccess = false;

  try {
    await postToFacebook();
    fbSuccess = true;
  } catch (e) {}

  try {
    await postToInstagram();
    igSuccess = true;
  } catch (e) {}

  console.log('\n====================================================');
  console.log(`SUMMARY: Facebook: ${fbSuccess ? '✅ LIVE' : '❌ FAILED'} | Instagram: ${igSuccess ? '✅ LIVE' : '❌ FAILED'}`);
  console.log('====================================================');
}

run();
