/**
 * run_ugc_launch_campaign.js
 * ============================================================
 * UGC Launch Campaign — New Pricing & Features
 * Autonomous Front Desk Bundle + AI Voice + Agency Fleet
 * ============================================================
 * 1. Delete duplicate FB posts from 9/19 (posts 5-7 in feed)
 * 2. Post UGC Feed Image (1:1) to Facebook Page + Instagram
 * 3. Post UGC Reel (9:16) to Facebook + Instagram Reels
 * 4. Post same Reel as Instagram Story
 */

const https = require('https');
const path = require('path');
const fs = require('fs');

// Load env
function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
      if (m) {
        let val = (m[2] || '').trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        if (!process.env[m[1]]) process.env[m[1]] = val;
      }
    });
  }
}
loadEnv();

const TOKEN   = process.env.META_PAGE_ACCESS_TOKEN || '';
const PAGE_ID = process.env.FB_PAGE_ID || '1248332278370968';
const IG_ID   = process.env.IG_USER_ID || '17841428781387416';

const BASE_RAW = 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main';

// Verified publicly fetchable assets
const FEED_IMAGE_URL  = `${BASE_RAW}/assets/social/ugc-feed-post-missed-call.jpg`;
const REEL_VIDEO_URL  = `${BASE_RAW}/assets/ads/v150_ai_voice_launch_reel_9x16.mp4`;
const REEL_COVER_URL  = `${BASE_RAW}/assets/social/ugc-reel-cover-contractor.jpg`;

// ─── Copy: new pricing-aware captions ─────────────────────────────────────────

const FB_FEED_CAPTION = `🔥 POV: You're on a job and a new client calls. You can't answer. They move on.

UNLESS you have this running on a $40 Android in the back of your van. 👇

Missed Call Auto SMS auto-texts every missed call in under 15 seconds — from YOUR real number, through YOUR SIM card. Zero Twilio fees. Zero A2P paperwork.

✅ Founder's Flagship: $49.99 ONE-TIME (no subscriptions, ever)
✅ Autonomous Front Desk Bundle: $99/mo — 24/7 AI voice answers your phone + 250 AI minutes
✅ Pro Automation Gateway: $299 one-time — End-to-End™ webhooks for n8n, Make, Zapier
✅ AI Voice Add-On: $29/mo standalone (use *71 call forwarding)
✅ Agency 5-Pack: $349/mo for 5 client seats + 1,250 pooled AI voice minutes
✅ Enterprise White-Label: $1,500+/mo — your own branded fleet portal

30-Day Money-Back Guarantee. 3-Day Free Trial. Instant key delivery.

👉 Try it free: https://missedcallautosms.com

#MissedCallAutoSMS #SpeedToLead #ContractorLife #SmallBusinessOwner #HVAClife #Roofing #PlumberLife #AutoText #NoMonthlyFees #AIVoice #FrontDesk`;

const IG_FEED_CAPTION = `Phone rings. Hands are full. Lead gone. 😤

Not anymore.

Missed Call Auto SMS runs on any Android phone sitting in your back office or van. The second you miss a call, it fires an authentic text from YOUR number in 15 seconds.

🔥 What's new:
• $49.99 lifetime license (zero subscriptions)
• $99/mo Autonomous Front Desk Bundle — AI voice answers live calls
• $29/mo standalone AI voice add-on
• Agency bundles from $349/mo (5 seats + pooled voice mins)
• Enterprise white-label portal at $1,500+/mo

Try it FREE for 3 days 👉 link in bio

#missedcallautosms #speedtolead #contractorlife #hvac #roofing #plumbing #smallbusiness #automations #aivoice #nomonthlysubscriptions`;

const FB_REEL_CAPTION = `This $40 Android phone is making me money while I'm on the roof. 🤯

Real talk: I used to lose 2-3 leads a week because I couldn't answer when I was mid-job. That's $1,500–$3,000 walking out the door every single week.

Now? Missed Call Auto SMS auto-texts every single caller in 15 seconds. From MY number. Through MY SIM. No Twilio. No monthly fee on the base plan.

NEW: Now with 24/7 AI Voice Receptionist 🎙️ — your phone rings 15 seconds, then forwards to your AI front desk. Customer gets a real voice, real answers, instant follow-up text.

Plans:
📱 $49.99 one-time — pure SMS auto-reply appliance
⚡ $99/mo — AI Voice + SIM SMS + 250 voice minutes
🛠️ $299 one-time — Pro webhook automation (n8n, Make, Zapier)
🏢 $349/mo agency 5-pack (5 client seats + pooled AI minutes)

3-Day Free Trial → https://missedcallautosms.com

#MissedCallAutoSMS #ContractorTech #AIVoice #SmallBusiness #SpeedToLead`;

const IG_REEL_CAPTION = `I put a $40 phone in my van and stopped losing clients forever 🏗️📲

Missed Call Auto SMS = the cheat code for busy trades people.

✅ 15-second auto-text from YOUR real number
✅ New: 24/7 AI Voice Receptionist ($99/mo bundle)
✅ $49.99 one-time base — no subscriptions
✅ Agency fleet plans from $349/mo

3-day free trial 👉 link in bio

#speedtolead #contractorlife #hvac #roofing #smallbiz #missedcallautosms #aivoice #automations #nomonthlysubscriptions #tradesman`;

// ─── HTTP Helpers ──────────────────────────────────────────────────────────────

function apiPost(endpoint, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: 'graph.facebook.com',
      port: 443,
      path: endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(j);
          else reject(new Error(`HTTP ${res.statusCode}: ${j.error ? j.error.message : b}`));
        } catch (e) { reject(new Error(`Parse error: ${b}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function apiGet(endpoint) {
  return new Promise((resolve, reject) => {
    const req = https.get({ hostname: 'graph.facebook.com', port: 443, path: endpoint }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(j);
          else reject(new Error(`HTTP ${res.statusCode}: ${j.error ? j.error.message : b}`));
        } catch (e) { reject(new Error(`Parse error: ${b}`)); }
      });
    });
    req.on('error', reject);
  });
}

function apiDelete(endpoint) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'graph.facebook.com', port: 443, path: endpoint, method: 'DELETE' }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch (e) { resolve({ raw: b }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Poll IG container until FINISHED ─────────────────────────────────────────
async function pollContainer(containerId, label = 'container', maxAttempts = 10) {
  const delays = [5000, 6000, 8000, 10000, 12000, 15000, 18000, 20000, 25000, 30000];
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(delays[i] || 15000);
    const status = await apiGet(`/v20.0/${containerId}?fields=status_code,status&access_token=${TOKEN}`);
    console.log(`   ⏳ Polling ${label} (attempt ${i+1}/${maxAttempts}): ${status.status_code || status.status}`);
    if (status.status_code === 'FINISHED') return true;
    if (status.status_code === 'ERROR') throw new Error(`${label} encoding failed in Meta cloud`);
  }
  return false;
}

// ─── Step 1: Delete duplicate FB posts ────────────────────────────────────────
async function deleteDuplicateFBPosts() {
  console.log('\n====================================================');
  console.log('🗑️  STEP 1: DELETE DUPLICATE FACEBOOK POSTS');
  console.log('====================================================');

  // Known duplicate post IDs from 9/19 (posts 5,6,7 — #5 and #7 are exact duplicates, #6 is a duplicate)
  const duplicateIds = [
    '1248332278370968_122098593081483785', // 9/19 04:30 - HVAC duplicate
    '1248332278370968_122098585371483785', // 9/19 04:28 - reel duplicate
    '1248332278370968_122098585191483785', // 9/19 04:28 - HVAC duplicate
  ];

  for (const postId of duplicateIds) {
    try {
      const result = await apiDelete(`/v20.0/${postId}?access_token=${TOKEN}`);
      if (result.success) {
        console.log(`✅ Deleted duplicate FB post: ${postId}`);
      } else {
        console.log(`⚠️  Could not delete ${postId}:`, JSON.stringify(result));
      }
    } catch (e) {
      console.error(`❌ Error deleting ${postId}:`, e.message);
    }
    await sleep(500);
  }
}

// ─── Step 2: Post UGC Feed Image (1:1) ────────────────────────────────────────
async function postFeedImage() {
  console.log('\n====================================================');
  console.log('📸 STEP 2: POST UGC FEED IMAGE (1:1)');
  console.log(`   Image: ${FEED_IMAGE_URL}`);
  console.log('====================================================');

  let fbId = null;
  let igId = null;

  // Facebook Page Photo
  try {
    console.log('🔵 [FB] Posting feed photo...');
    const res = await apiPost(`/v20.0/${PAGE_ID}/photos`, {
      url: FEED_IMAGE_URL,
      caption: FB_FEED_CAPTION,
      access_token: TOKEN
    });
    fbId = res.id || res.post_id;
    console.log(`🎉 FB Feed Photo LIVE! ID: ${fbId}`);
  } catch (e) {
    console.error('❌ FB Feed Error:', e.message);
  }

  // Instagram Feed Image
  try {
    console.log('🟣 [IG] Creating image container...');
    const container = await apiPost(`/v20.0/${IG_ID}/media`, {
      image_url: FEED_IMAGE_URL,
      caption: IG_FEED_CAPTION,
      access_token: TOKEN
    });
    console.log(`   Container: ${container.id}. Waiting 4s...`);
    await sleep(4000);

    const published = await apiPost(`/v20.0/${IG_ID}/media_publish`, {
      creation_id: container.id,
      access_token: TOKEN
    });
    igId = published.id;
    console.log(`🎉 IG Feed Post LIVE! ID: ${igId}`);
  } catch (e) {
    console.error('❌ IG Feed Error:', e.message);
  }

  return { fbId, igId };
}

// ─── Step 3: Post Reel to FB + IG Reels ───────────────────────────────────────
async function postReel() {
  console.log('\n====================================================');
  console.log('🎬 STEP 3: POST REEL (9:16)');
  console.log(`   Video: ${REEL_VIDEO_URL}`);
  console.log(`   Cover: ${REEL_COVER_URL}`);
  console.log('====================================================');

  let fbId = null;
  let igReelId = null;

  // Facebook Video/Reel
  try {
    console.log('🔵 [FB] Uploading reel video...');
    const res = await apiPost(`/v20.0/${PAGE_ID}/videos`, {
      file_url: REEL_VIDEO_URL,
      title: 'I Put a $40 Android in My Van and NEVER Miss a Lead — Missed Call Auto SMS',
      description: FB_REEL_CAPTION,
      access_token: TOKEN
    });
    fbId = res.id;
    console.log(`🎉 FB Reel LIVE! ID: ${fbId}`);
  } catch (e) {
    console.error('❌ FB Reel Error:', e.message);
  }

  // Instagram Reel
  try {
    console.log('🟣 [IG] Creating Reel container...');
    const container = await apiPost(`/v20.0/${IG_ID}/media`, {
      media_type: 'REELS',
      video_url: REEL_VIDEO_URL,
      cover_url: REEL_COVER_URL,
      caption: IG_REEL_CAPTION,
      share_to_feed: true,
      access_token: TOKEN
    });
    console.log(`   Reel container: ${container.id}. Polling encoding status...`);
    
    const ready = await pollContainer(container.id, 'IG Reel', 10);
    if (ready) {
      const published = await apiPost(`/v20.0/${IG_ID}/media_publish`, {
        creation_id: container.id,
        access_token: TOKEN
      });
      igReelId = published.id;
      console.log(`🎉 IG Reel LIVE! ID: ${igReelId}`);
    } else {
      console.warn('⚠️  IG Reel encoding timed out — may still process in background');
    }
  } catch (e) {
    console.error('❌ IG Reel Error:', e.message);
  }

  return { fbId, igReelId };
}

// ─── Step 4: Post same video as Instagram Story ────────────────────────────────
async function postStory() {
  console.log('\n====================================================');
  console.log('📖 STEP 4: POST REEL AS INSTAGRAM STORY (9:16)');
  console.log('====================================================');

  let igStoryId = null;

  try {
    console.log('🟣 [IG] Creating Story container...');
    const container = await apiPost(`/v20.0/${IG_ID}/media`, {
      media_type: 'STORIES',
      video_url: REEL_VIDEO_URL,
      access_token: TOKEN
    });
    console.log(`   Story container: ${container.id}. Polling encoding status...`);

    const ready = await pollContainer(container.id, 'IG Story', 8);
    if (ready) {
      const published = await apiPost(`/v20.0/${IG_ID}/media_publish`, {
        creation_id: container.id,
        access_token: TOKEN
      });
      igStoryId = published.id;
      console.log(`🎉 IG Story LIVE! ID: ${igStoryId}`);
    } else {
      console.warn('⚠️  IG Story encoding timed out — may still process in background');
    }
  } catch (e) {
    console.error('❌ IG Story Error:', e.message);
  }

  return { igStoryId };
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!TOKEN) {
    console.error('❌ META_PAGE_ACCESS_TOKEN not set in .env');
    process.exit(1);
  }

  console.log('🚀 UGC LAUNCH CAMPAIGN — MISSED CALL AUTO SMS NEW PRICING');
  console.log('============================================================');
  console.log(`FB Page: ${PAGE_ID} | IG Account: ${IG_ID}`);
  console.log(`Feed Image: ugc-feed-post-missed-call.jpg`);
  console.log(`Reel Video: v150_ai_voice_launch_reel_9x16.mp4`);
  console.log(`Reel Cover: ugc-reel-cover-contractor.jpg`);

  const results = {};

  // Step 1: Remove duplicates
  await deleteDuplicateFBPosts();

  // Step 2: Feed post
  results.feed = await postFeedImage();
  await sleep(3000);

  // Step 3: Reel
  results.reel = await postReel();
  await sleep(3000);

  // Step 4: Story
  results.story = await postStory();

  console.log('\n====================================================');
  console.log('🏁 CAMPAIGN COMPLETE');
  console.log('====================================================');
  console.log('RESULTS:', JSON.stringify(results, null, 2));

  // Save campaign log
  const logPath = path.join(__dirname, '../data/campaign_logs.json');
  let logs = [];
  try { logs = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch (e) {}
  logs.unshift({
    campaign: 'ugc_new_pricing_launch',
    timestamp: new Date().toISOString(),
    assets: { feedImage: FEED_IMAGE_URL, reelVideo: REEL_VIDEO_URL, reelCover: REEL_COVER_URL },
    results
  });
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify(logs, null, 2), 'utf8');
  console.log('✔ Campaign log saved to data/campaign_logs.json');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
