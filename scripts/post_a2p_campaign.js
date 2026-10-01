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

const TOKEN = process.env.META_PAGE_ACCESS_TOKEN || '';
const FB_PAGE_ID = (process.env.FB_PAGE_ID && process.env.FB_PAGE_ID !== 'true' && process.env.FB_PAGE_ID !== 'false')
  ? process.env.FB_PAGE_ID
  : '1248332278370968';
const IG_USER_ID = (process.env.IG_USER_ID && process.env.IG_USER_ID !== 'true' && process.env.IG_USER_ID !== 'false')
  ? process.env.IG_USER_ID
  : '17841428781387416';

const IMAGE_URL = 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/social/no-a2p-no-number-porting-contractor.jpg';
const BLOG_URL = 'https://missedcallautosms.com/blog/missed-call-sms-without-a2p-10dlc-or-number-porting';

const FB_COPY = `If you run your business from your personal cell phone, stop scrolling for 30 seconds. 🛑

You’re under a sink, on a roof, with a client, or driving to a job site. 
Your phone rings. You hit "Decline" or let it go to voicemail. 
You tell yourself: "I'll call them back in 20 minutes."

Here is the brutal truth: 62% of first-time callers will NEVER leave a voicemail. 
They hang up in 4 seconds, tap the very next business on Google Maps, and hire your competitor. That unanswered call just cost you $500–$2,000.

"Just use GoHighLevel or Twilio," people say.
Except you try to sign up and hit a brick wall:
❌ A2P 10DLC Registration REJECTED (Error 30007) because you’re a sole prop with no corporate legal team.
❌ They want you to PORT your personal phone number—the one your friends, family, and repeat clients have had for 10 years—into a glitchy VoIP app that drops calls in metal buildings and basements.
❌ $297/month recurring software bills plus per-text carrier markups.

There is a much simpler way:
Your Android phone already has an unlimited talk and text plan paid for every month.

Missed Call Auto SMS turns your existing Android phone into an autonomous receptionist right over your physical SIM card:
✅ 100% A2P 10DLC Exempt: Messages fire natively via your carrier SIM as genuine Person-to-Person (P2P) traffic. No vetting, no rejection letters.
✅ ZERO Number Porting: Keep your exact phone number, phone, and carrier (Verizon, AT&T, T-Mobile). Nothing changes.
✅ 3-Second Lead Capture: The second a call is missed, an authentic carrier text fires: "Hey! On a job site right now—how can I help?"
✅ $0 Monthly Software Fees: A single $49.99 lifetime license. No subscriptions.

Try it 100% risk-free for 3 days ($0 today) or grab the lifetime license:
👉 ${BLOG_URL}

#SmallBusiness #ContractorLife #Plumbing #HVAC #MobileDetailing #HomeServices #SpeedToLead #SideHustle #NoMonthlyFees`;

const IG_CAPTION = `If you run your business from your personal cell phone, stop scrolling. 🛑

62% of first-time callers NEVER leave a voicemail. When you're on a job site and can't pick up, they dial the next contractor on Google Maps. That missed call just cost you $500–$2,000.

Tried GoHighLevel or Twilio? You know the nightmare:
❌ A2P 10DLC verification REJECTED (Error 30007)
❌ Forcing you to PORT your 10-year personal cell number into a glitchy VoIP app
❌ $297/month recurring software bills

The Hardware Fix:
Missed Call Auto SMS turns your Android phone into an autonomous receptionist over your physical SIM card.
✅ 100% A2P 10DLC Exempt (Native P2P carrier SMS)
✅ ZERO Number Porting (Keep your carrier & phone)
✅ 3-Second Lead Capture via direct carrier SMS
✅ $49.99 Lifetime License ($0 monthly software fees)

Start your 3-day risk-free trial ($0 today) at the link in bio or missedcallautosms.com/blog/missed-call-sms-without-a2p-10dlc-or-number-porting!

#SmallBusiness #ContractorLife #Plumbing #HVAC #MobileDetailing #HomeServices #SpeedToLead #SideHustle #NoMonthlyFees #Entrepreneur #TradeBusiness`;

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

async function main() {
  if (!TOKEN) {
    console.error('❌ META_PAGE_ACCESS_TOKEN is missing from .env');
    process.exit(1);
  }

  console.log('🚀 Initiating Social Publishing for A2P / Anti-Porting Campaign...');
  console.log(`Image: ${IMAGE_URL}`);

  const results = { facebook: null, instagram: null };

  // 1. Publish to Facebook Page as a Photo Post with full copy
  console.log('\n🔵 [1/2] Publishing to Facebook Page...');
  try {
    const fbRes = await postGraphApi(`/v20.0/${FB_PAGE_ID}/photos`, {
      url: IMAGE_URL,
      caption: FB_COPY,
      access_token: TOKEN
    });
    results.facebook = { success: true, id: fbRes.id, post_id: fbRes.post_id || fbRes.id };
    console.log(`✅ Facebook Post LIVE! Photo ID: ${fbRes.id}`);
    console.log(`🔗 https://facebook.com/${FB_PAGE_ID}`);
  } catch (err) {
    console.warn(`⚠️ Facebook Photo Post failed (${err.message}). Falling back to Feed post...`);
    try {
      const fbFeedRes = await postGraphApi(`/v20.0/${FB_PAGE_ID}/feed`, {
        message: FB_COPY,
        link: BLOG_URL,
        access_token: TOKEN
      });
      results.facebook = { success: true, id: fbFeedRes.id };
      console.log(`✅ Facebook Feed Post LIVE! ID: ${fbFeedRes.id}`);
    } catch (feedErr) {
      results.facebook = { success: false, error: feedErr.message };
      console.error(`❌ Facebook Publishing Failed: ${feedErr.message}`);
    }
  }

  // 2. Publish to Instagram Feed
  console.log('\n🟣 [2/2] Publishing to Instagram Feed...');
  try {
    console.log('Step 2a: Creating Instagram media container...');
    const containerRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
      image_url: IMAGE_URL,
      caption: IG_CAPTION,
      access_token: TOKEN
    });
    console.log(`✔ Container created (ID: ${containerRes.id})`);

    console.log('Waiting 5 seconds for Meta image rendering...');
    await new Promise(r => setTimeout(r, 5000));

    console.log('Step 2b: Publishing container to Instagram feed...');
    const publishRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
      creation_id: containerRes.id,
      access_token: TOKEN
    });

    results.instagram = { success: true, id: publishRes.id };
    console.log(`✅ Instagram Post LIVE! Media ID: ${publishRes.id}`);
    console.log('🔗 https://instagram.com/missedcallautosms');
  } catch (err) {
    results.instagram = { success: false, error: err.message };
    console.error(`❌ Instagram Publishing Failed: ${err.message}`);
  }

  console.log('\n====================================================');
  console.log('🏁 RESULT SUMMARY:');
  console.log(JSON.stringify(results, null, 2));
  console.log('====================================================');
}

main();
