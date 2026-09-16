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

async function runSocialTest() {
  console.log('====================================================');
  console.log('📱 META AUTOMATED SOCIAL PUBLISHER TEST');
  console.log('====================================================');
  console.log(`Page ID: ${FB_PAGE_ID}`);
  console.log(`Instagram ID: ${IG_USER_ID}`);
  console.log('Access Token: [CONFIGURED IN .ENV]');
  console.log('----------------------------------------------------');

  // 1. Test Facebook Post
  console.log('\n🔵 [1/2] Testing Facebook Page Publishing...');
  try {
    const fbRes = await postGraphApi(`/v20.0/${FB_PAGE_ID}/feed`, {
      message: '🚀 Never lose another client to a missed call!\n\nMissed Call Auto SMS automatically detects missed business calls and replies in 15 seconds using your existing carrier SIM card. 100% carrier A2P 10DLC exempt with zero monthly fees.\n\nLearn more: https://misscallautosms.com',
      access_token: TOKEN
    });
    console.log('🎉 SUCCESS! Facebook Post is LIVE!');
    console.log(`📌 Post ID: ${fbRes.id}`);
    console.log(`🔗 Check your Facebook page: https://facebook.com/${FB_PAGE_ID}`);
  } catch (err) {
    console.error('❌ Facebook Post Failed:', err.message);
  }

  // 2. Test Instagram Post
  console.log('\n🟣 [2/2] Testing Instagram Feed Publishing...');
  try {
    console.log('Step 2a: Creating Instagram media container with graphic...');
    const containerRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
      image_url: 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/og-preview.jpg',
      caption: 'Never lose another client to a missed call. Missed Call Auto SMS automatically replies in 15 seconds using your existing SIM card. $49.99 lifetime license. 100% A2P exempt!\n\nLink in bio! #missedcallautosms #smallbusiness #contractorlife #speedtolead',
      access_token: TOKEN
    });
    console.log(`✔ Container created! ID: ${containerRes.id}`);

    // Small delay to let Meta process the image container
    console.log('Waiting 3 seconds for Meta image processing...');
    await new Promise(r => setTimeout(r, 3000));

    console.log('Step 2b: Publishing container to live Instagram feed...');
    const publishRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
      creation_id: containerRes.id,
      access_token: TOKEN
    });
    console.log('🎉 SUCCESS! Instagram Post is LIVE!');
    console.log(`📌 Media ID: ${publishRes.id}`);
    console.log('🔗 Check your Instagram profile: https://instagram.com/missedcallautosms');
  } catch (err) {
    console.error('❌ Instagram Post Failed:', err.message);
  }

  console.log('\n====================================================');
  console.log('🏁 SOCIAL TEST COMPLETED');
  console.log('====================================================');
}

runSocialTest();
