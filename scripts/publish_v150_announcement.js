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

async function publishCampaign() {
  console.log('====================================================');
  console.log('🚀 PUBLISHING v1.5.0 FEATURE UPGRADE MULTI-FORMAT CAMPAIGN');
  console.log('====================================================');
  console.log(`Target Facebook Page: ${FB_PAGE_ID}`);
  console.log(`Target Instagram User: ${IG_USER_ID}`);

  if (!TOKEN) {
    throw new Error('Missing META_PAGE_ACCESS_TOKEN');
  }

  const imageUrl = 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/social/v1-5-0-ai-voice-assistant-launch.jpg';
  const videoUrl = 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/ads/missed_call_auto_sms_reel_9x16.mp4';
  const blogUrl = 'https://missedcallautosms.com/blog/introducing-v1-5-0-ai-receptionist-status-dial';

  // 1. Facebook Feed Post Caption
  const fbCaption = `🚨 NEW UPDATE v1.5.0: Stop losing $1,500 jobs when your hands are full!

If you're a plumber under a sink, an electrician up on a ladder, a barber mid-fade, or a mobile detailer running a buffer, you can't drop your tools to pick up the phone. And 82% of callers won't leave a voicemail—they call the next contractor on Google.

We just released Missed Call Auto SMS Version 1.5.0 packed with game-changing features for service pros:

✨ NEW IN v1.5.0:
🟢 Contractor Status Dial: Toggle Available, After Hours, or Emergency Only in 1 tap.
🛠️ Dynamic Trade Presets: Set status to "Hands Full", "On Jobsite", "Driving", or "Hair/Detailing" to let customers know why you can't pick up without losing the lead.
📋 1-Tap Voicemail Script Generator: Dynamically generates a professional carrier voicemail script matching your activity with instant clipboard copy.
🎙️ 24/7 AI Voice Assistant Add-On: Riley (or your custom named agent) answers live on carrier call forwarding, gathers job details & address, and texts your booking link!
📱 100% Hardware Appliance: Uses your phone's physical SIM card. Zero monthly SaaS fees ($297/mo saved), zero A2P 10DLC spam flags, zero per-text fees.

📖 Read the full breakdown and see it in action:
👉 ${blogUrl}

📲 Download the v1.5.0 update directly at https://missedcallautosms.com/#download

#ContractorLife #SmallBusinessOwner #Plumbing #HVAC #MobileDetailing #SpeedToLead #AIVoice #MissedCallAutoSMS #ServiceBusiness #Productivity`;

  // 2. Instagram Feed Caption
  const igCaption = `🚨 UPDATE v1.5.0 IS LIVE: AI Voice Receptionist + Contractor Status Dial! 🛠️📲

Hands full on the job? In the trades, a missed call isn't an inconvenience—it's a lost $1,500 ticket. Over 82% of homeowners hang up on voicemail and call your competitor immediately.

Meet Missed Call Auto SMS v1.5.0:
🟢 Contractor Status Dial (Available / After Hours / Emergency Only)
🛠️ Live Activity Presets ("Hands Full", "On Jobsite", "Driving", "Detailing")
📋 1-Tap Carrier Voicemail Script Generator
🤖 24/7 AI Voice Assistant Add-On (Riley answers, qualifies, and texts booking links live)
⚡ Instant SIM-level auto-texts in 15 seconds (No $297/mo SaaS, No 10DLC carrier blocks)

🔗 Tap the link in bio or visit missedcallautosms.com/blog to read the full guide & download v1.5.0 today!

#contractor #hvac #plumbing #electrician #barbershop #autodetailing #speedtolead #missedcall #aivoice #smallbiztools #entrepreneur`;

  // 3. Reel & Story Caption
  const reelCaption = `What do you do when a $1,500 client calls and your hands are covered in grease or under a sink? 🛠️📲

Meet Missed Call Auto SMS v1.5.0! Your phone detects the missed call, texts them back in 15 seconds, and your 24/7 AI Assistant (Riley) can answer live and book the job for you!

Download v1.5.0 at missedcallautosms.com (Link in bio!)

#contractor #hvac #plumbing #electrician #speedtolead #aivoice #smallbusiness`;

  const results = {};

  // A. Facebook Feed Post (Photo + Link)
  console.log('\n--- 1. Publishing 1:1 Photo to Facebook Page ---');
  try {
    const fbRes = await postGraphApi(`/v20.0/${FB_PAGE_ID}/photos`, {
      url: imageUrl,
      caption: fbCaption,
      access_token: TOKEN
    });
    console.log(`🎉 SUCCESS: Facebook Post published! ID: ${fbRes.id}`);
    results.fbPostId = fbRes.id;
  } catch (err) {
    console.error(`❌ Facebook Post Error:`, err.message);
  }

  // B. Instagram Feed Post (1:1 Photo)
  console.log('\n--- 2. Publishing 1:1 Photo to Instagram Feed ---');
  try {
    const igContainer = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
      image_url: imageUrl,
      caption: igCaption,
      access_token: TOKEN
    });
    console.log(`✔ Container created: ${igContainer.id}. Publishing to feed...`);

    await new Promise(r => setTimeout(r, 3000));

    const igRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
      creation_id: igContainer.id,
      access_token: TOKEN
    });
    console.log(`🎉 SUCCESS: Instagram Feed Post published! ID: ${igRes.id}`);
    results.igPostId = igRes.id;
  } catch (err) {
    console.error(`❌ Instagram Feed Error:`, err.message);
  }

  // C. Facebook Reel / Video
  console.log('\n--- 3. Publishing Reel to Facebook Page ---');
  try {
    const fbVideoRes = await postGraphApi(`/v20.0/${FB_PAGE_ID}/videos`, {
      file_url: videoUrl,
      title: 'Never Miss a $1,500 Job With Your Hands Full (v1.5.0)',
      description: reelCaption,
      access_token: TOKEN
    });
    console.log(`🎉 SUCCESS: Facebook Reel/Video published! ID: ${fbVideoRes.id}`);
    results.fbReelId = fbVideoRes.id;
  } catch (err) {
    console.error(`❌ Facebook Reel Error:`, err.message);
  }

  // D. Instagram Reel (9:16 Vertical Video)
  console.log('\n--- 4. Publishing Instagram Reel (9:16) ---');
  try {
    const reelContainer = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
      media_type: 'REELS',
      video_url: videoUrl,
      cover_url: imageUrl,
      caption: reelCaption,
      share_to_feed: true,
      access_token: TOKEN
    });
    console.log(`✔ Reel container created: ${reelContainer.id}. Polling encoding status...`);

    let isReady = false;
    const delays = [5000, 7000, 10000, 15000, 20000];
    for (let i = 0; i < delays.length; i++) {
      await new Promise(r => setTimeout(r, delays[i]));
      const statusRes = await getGraphApi(`/v20.0/${reelContainer.id}?fields=status_code,status&access_token=${TOKEN}`);
      console.log(`Polling status (attempt ${i + 1}/${delays.length}): ${statusRes.status_code || statusRes.status}`);

      if (statusRes.status_code === 'FINISHED') {
        isReady = true;
        break;
      } else if (statusRes.status_code === 'ERROR') {
        throw new Error('Reel encoding failed in Meta cloud');
      }
    }

    if (isReady) {
      const reelRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
        creation_id: reelContainer.id,
        access_token: TOKEN
      });
      console.log(`🎉 SUCCESS: Instagram Reel is LIVE! ID: ${reelRes.id}`);
      results.igReelId = reelRes.id;
    } else {
      console.warn('⚠️ Timed out waiting for Reel encoding.');
    }
  } catch (err) {
    console.error(`❌ Instagram Reel Error:`, err.message);
  }

  // E. Instagram Story (9:16 Vertical Video)
  console.log('\n--- 5. Publishing Instagram Story (9:16) ---');
  try {
    const storyContainer = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
      media_type: 'STORIES',
      video_url: videoUrl,
      access_token: TOKEN
    });
    console.log(`✔ Story container created: ${storyContainer.id}. Polling encoding status...`);

    let isStoryReady = false;
    const storyDelays = [5000, 7000, 10000, 15000];
    for (let i = 0; i < storyDelays.length; i++) {
      await new Promise(r => setTimeout(r, storyDelays[i]));
      const statusRes = await getGraphApi(`/v20.0/${storyContainer.id}?fields=status_code,status&access_token=${TOKEN}`);
      console.log(`Polling status (attempt ${i + 1}/${storyDelays.length}): ${statusRes.status_code || statusRes.status}`);

      if (statusRes.status_code === 'FINISHED') {
        isStoryReady = true;
        break;
      } else if (statusRes.status_code === 'ERROR') {
        throw new Error('Story encoding failed in Meta cloud');
      }
    }

    if (isStoryReady) {
      const storyRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
        creation_id: storyContainer.id,
        access_token: TOKEN
      });
      console.log(`🎉 SUCCESS: Instagram Story is LIVE! ID: ${storyRes.id}`);
      results.igStoryId = storyRes.id;
    }
  } catch (err) {
    console.error(`❌ Instagram Story Error:`, err.message);
  }

  console.log('\n====================================================');
  console.log('🏁 ALL CAMPAIGN ASSETS PROCESSED');
  console.log(JSON.stringify(results, null, 2));
  console.log('====================================================');

  return results;
}

publishCampaign().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
