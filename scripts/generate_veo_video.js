/**
 * generate_veo_video.js
 * Generates a brand-new UGC-style 9:16 reel using Google Veo 3.1
 * via the Gemini API (REST), saves to assets/ads/<output>.mp4
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
      if (m) {
        let val = (m[2] || '').trim().replace(/^["']|["']$/g, '');
        if (!process.env[m[1]]) process.env[m[1]] = val;
      }
    });
  }
}
loadEnv();

const API_KEY = process.env.GEMINI_API_KEY || '';
const OUTPUT_ARG = process.argv[2] || 'ugc_new_pricing_reel_9x16.mp4';
const OUTPUT_PATH = path.join(__dirname, '../assets/ads/', OUTPUT_ARG);
const ASPECT_RATIO = process.argv[3] || '9:16';

const PROMPT = `UGC-style vertical 9:16 smartphone video ad. Shot on a shaky, handheld phone like a real TikTok.

SCENE 1 (0-3s): Close-up of a busy HVAC contractor's hands working on an AC unit outside a house. Phone buzzes in pocket. He ignores it, keeps working. Screen shows "Missed Call."

SCENE 2 (3-7s): Same phone — 12 seconds later, a green SMS auto-sends: "Hey! Sorry I missed your call. I'm on a job right now — text me back and I'll respond shortly! — Dave's HVAC" The text SENDS ITSELF. No one touched the phone.

SCENE 3 (7-12s): Customer on the other end sees the text immediately and replies "Ok great, I need a quote for a new unit." Contractor gets a thumbs-up notification.

SCENE 4 (12-16s): Quick cut to the contractor smiling, wiping hands on rag. Holds up a $40 Motorola Android phone. Speaks to camera casually: "This $40 phone just saved me a $2,000 job."

SCENE 5 (16-20s): Simple dark card fades in. White bold text: "MISSED CALL AUTO SMS" and green text below: "$49.99 ONE-TIME. NO SUBSCRIPTIONS." URL: missedcallautosms.com

Style: raw handheld UGC, natural outdoor light, real not polished, authentic small business energy. NOT stock footage. NOT AI-looking.`;

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (options._returnBuffer) return resolve(buf);
        try {
          const j = JSON.parse(buf.toString());
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(j);
          else reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(j).substring(0, 300)}`));
        } catch (e) {
          reject(new Error(`Parse error (${res.statusCode}): ${buf.toString().substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function generateVideo() {
  if (!API_KEY) {
    console.error('❌ GEMINI_API_KEY not set in .env');
    process.exit(1);
  }

  console.log('🎬 Submitting video generation request to Google Veo 3.1...');
  console.log(`   Aspect Ratio: ${ASPECT_RATIO}`);
  console.log(`   Output: ${OUTPUT_PATH}`);
  console.log(`   Prompt: ${PROMPT.substring(0, 120)}...`);

  // Submit generation request
  const submitRes = await httpsRequest({
    hostname: 'generativelanguage.googleapis.com',
    port: 443,
    path: `/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning?key=${API_KEY}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    instances: [{ prompt: PROMPT }],
    parameters: {
      aspectRatio: ASPECT_RATIO,
      sampleCount: 1,
      durationSeconds: 8
    }
  }));

  const operationName = submitRes.name;
  console.log(`✔ Operation submitted: ${operationName}`);
  console.log('⏳ Polling for completion (this takes 2-5 minutes)...');

  // Poll until done
  let attempt = 0;
  while (true) {
    attempt++;
    await new Promise(r => setTimeout(r, 15000));

    const pollRes = await httpsRequest({
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/${operationName}?key=${API_KEY}`,
      method: 'GET'
    });

    const elapsed = attempt * 15;
    if (pollRes.done) {
      if (pollRes.error) {
        throw new Error(`Generation failed: ${JSON.stringify(pollRes.error)}`);
      }

      console.log('\n✅ Video generation COMPLETE!');

      // Extract video data
      const videos = pollRes.response?.predictions || pollRes.response?.generateVideoResponse?.generatedSamples;
      if (!videos || !videos.length) {
        // Try alternate response shape
        const rawResp = JSON.stringify(pollRes.response || pollRes);
        console.log('Response shape:', rawResp.substring(0, 500));
        throw new Error('Could not locate video data in response. See above for shape.');
      }

      // Download or decode
      const videoSample = videos[0];
      const videoData = videoSample.video || videoSample.bytesBase64Encoded || videoSample.videoBase64;

      if (videoData && typeof videoData === 'string') {
        // Base64 encoded
        const buf = Buffer.from(videoData, 'base64');
        fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
        fs.writeFileSync(OUTPUT_PATH, buf);
        console.log(`🎉 Video saved to: ${OUTPUT_PATH} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
      } else if (videoSample.uri || videoSample.gcsUri) {
        // Download from URI
        const uri = videoSample.uri || videoSample.gcsUri;
        console.log(`Downloading from URI: ${uri}`);
        // Would need GCS auth here — output the URI instead
        console.log(`⚠️  Video available at URI: ${uri}`);
        console.log('   (GCS URIs require service account auth to download)');
      } else {
        console.log('Full response:', JSON.stringify(pollRes, null, 2).substring(0, 1000));
        throw new Error('Unexpected video data format');
      }

      return OUTPUT_PATH;
    } else {
      process.stdout.write(`   Still generating... (${elapsed}s elapsed, attempt ${attempt})\r`);
    }

    if (attempt > 40) throw new Error('Timed out after 10 minutes');
  }
}

generateVideo().then(p => {
  console.log('\n✅ Done:', p);
}).catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
