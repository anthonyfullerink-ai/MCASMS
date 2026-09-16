const fs = require('fs');
const path = require('path');
const https = require('https');

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

const APP_ID = process.env.FB_APP_ID || '1084095534483206';
const APP_SECRET = process.env.FB_APP_SECRET || '';
const CURRENT_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || '';
const PAGE_ID = process.env.FB_PAGE_ID || '1248332278370968';

if (!APP_SECRET) {
  console.error('❌ Error: FB_APP_SECRET not found in .env.');
  console.error('👉 Please ensure FB_APP_SECRET is set in your .env file.');
  process.exit(1);
}

if (!CURRENT_TOKEN) {
  console.error('❌ Error: META_PAGE_ACCESS_TOKEN not found in .env.');
  process.exit(1);
}

function fetchGraph(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ` + (json.error ? json.error.message : data)));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function exchangeToken() {
  console.log('====================================================');
  console.log('🔄 META GRAPH API PERMANENT TOKEN EXCHANGER');
  console.log('====================================================');
  console.log(`App ID: ${APP_ID}`);
  console.log(`Page ID: ${PAGE_ID}`);
  console.log('----------------------------------------------------');

  try {
    console.log('Step 1: Exchanging token via oauth/access_token...');
    const exchangeUrl = `https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${CURRENT_TOKEN}`;
    const exchangeRes = await fetchGraph(exchangeUrl);
    const longLivedToken = exchangeRes.access_token;
    console.log('✔ Long-lived token acquired!');

    console.log('Step 2: Fetching permanent Page Access Token for Page ID:', PAGE_ID);
    const pageUrl = `https://graph.facebook.com/v20.0/${PAGE_ID}?fields=access_token,name&access_token=${longLivedToken}`;
    const pageRes = await fetchGraph(pageUrl);
    
    const permanentPageToken = pageRes.access_token || longLivedToken;
    console.log(`✔ Page token retrieved for "${pageRes.name || 'Missed Call Auto SMS'}"!`);

    console.log('Step 3: Verifying token validity and expiration...');
    const debugUrl = `https://graph.facebook.com/debug_token?input_token=${permanentPageToken}&access_token=${permanentPageToken}`;
    const debugRes = await fetchGraph(debugUrl);
    const data = debugRes.data || {};
    
    console.log('--- Token Verification Details ---');
    console.log(`Type: ${data.type}`);
    console.log(`Target Page/Profile ID: ${data.profile_id}`);
    console.log(`Is Valid: ${data.is_valid}`);
    const isNeverExpiring = !data.expires_at || data.expires_at === 0;
    console.log(`Expires: ${isNeverExpiring ? 'NEVER (Permanent Page Token) 🎉' : new Date(data.expires_at * 1000).toLocaleString()}`);
    console.log(`Scopes: ${(data.scopes || []).join(', ')}`);
    console.log('----------------------------------');

    const envPath = path.join(__dirname, '../.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent.replace(/^.*META_PAGE_ACCESS_TOKEN.*$/m, `META_PAGE_ACCESS_TOKEN=${permanentPageToken}`);
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✔ Updated .env with the permanent META_PAGE_ACCESS_TOKEN!');

    console.log('\n====================================================');
    console.log('🎉 TOKEN EXCHANGE COMPLETE & READY FOR PRODUCTION!');
    console.log('====================================================');

  } catch (err) {
    console.error('❌ Token Exchange Failed:', err.message);
    process.exit(1);
  }
}

exchangeToken();