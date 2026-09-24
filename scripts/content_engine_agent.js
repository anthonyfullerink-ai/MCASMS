const fs = require('fs');
const path = require('path');
const https = require('https');

// Safe environment loading
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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const DATA_DIR = path.join(__dirname, '../data');
const QUEUE_FILE = path.join(DATA_DIR, 'content_engine_queue.json');
const RESEARCH_FILE = path.join(DATA_DIR, 'competitor_research.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'content_engine_settings.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function callGemini(promptText) {
  return new Promise(async (resolve, reject) => {
    if (!GEMINI_API_KEY) {
      return reject(new Error('GEMINI_API_KEY not found in environment or .env'));
    }

    const modelsToTry = ['gemini-3.1-pro-preview', 'gemini-3.6-flash', 'gemini-flash-latest'];
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const result = await new Promise((subResolve, subReject) => {
          const payload = JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              temperature: 0.7,
              topP: 0.95,
              maxOutputTokens: 2500,
              responseMimeType: "application/json"
            }
          });

          const options = {
            hostname: 'generativelanguage.googleapis.com',
            port: 443,
            path: `/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
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
                  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (!rawText) return subReject(new Error('Empty Gemini response'));
                  subResolve(JSON.parse(rawText));
                } else {
                  subReject(new Error(`Gemini API Error (${res.statusCode}): ` + (json.error ? json.error.message : body)));
                }
              } catch (e) {
                subReject(new Error(`Failed to parse response: ${e.message}`));
              }
            });
          });

          req.on('error', subReject);
          req.write(payload);
          req.end();
        });

        return resolve(result);
      } catch (err) {
        lastError = err;
      }
    }

    reject(lastError || new Error('All Gemini models failed'));
  });
}

// Fallback high-converting templates if API key is unconfigured or rate limited
function generateFallbackAngles(niche = 'Contractor Speed-to-Lead') {
  const ts = Date.now();
  const today = new Date();
  
  // Format dates for 09:00, 13:00, and 18:00 ET
  const targetDate = new Date(today);
  targetDate.setDate(targetDate.getDate() + 1);
  const dateStr = targetDate.toISOString().split('T')[0];

  return [
    {
      id: `angle-${ts}-blog`,
      title: "The $3,500 Cloud Telephony Trap: Why Local Contractors Are Ditching SaaS for Dedicated Hardware",
      hook: "Most contractors think paying $297 a month for cloud automation is normal until they calculate the hidden Twilio usage fees, A2P 10DLC surcharges, and filtered customer texts.",
      format: "blog_article",
      niche: "Appliance vs. SaaS Math",
      narrativeBody: "Let us examine the real math behind home service communications.\n\nWhen trade businesses sign up for platforms like GoHighLevel or third-party answering services, they are rarely told about the telecom iceberg below the surface. Twilio charges $0.0079 per message plus carrier surcharges. A single 2-sentence automated text exceeding 160 characters bills as two or three segments.\n\nAdd $19 to $44 in mandatory A2P 10DLC registration fees and up to $12 a month in ongoing campaign maintenance fees. If your campaign is rejected—which happens to over 35% of small trade applications due to strict opt-in wording rules—your messages get silently dropped under carrier error 30007. You are paying thousands per year for an answering script that cannot even guarantee delivery.\n\nMissed Call Auto SMS runs locally on a dedicated Android phone connected to your real carrier SIM card. Zero monthly software fees. Zero per-SMS markups. 100% exempt from A2P 10DLC carrier compliance delays.\n\nOwn the appliance once for $49.99 for life. Stop paying software companies more than you pay for vehicle maintenance.",
      cta: "Get Missed Call Auto SMS Flagship edition for a one-time $49.99 lifetime license at missedcallautosms.com",
      promptLogic: "Cost comparison math. Contrasts expensive recurring GHL/Twilio stacks against one-time hardware ownership.",
      imagePrompt: "Top-down flat lay comparison on a wooden workbench: on the left, a stack of recurring monthly software invoices crossed out in red marker; on the right, a sleek Android device running Missed Call Auto SMS beside brass tools, ultra-realistic, 16:9 aspect ratio.",
      imageUrl: "https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/social/saas-margins-invoice-comparison.jpg",
      videoPrompt: "Documentary style camera pan across a contractor office desk from an open laptop showing an expensive recurring invoice to a compact Android phone resting on a wireless charging dock.",
      status: "draft",
      createdAt: new Date().toISOString(),
      channelTargets: ["blog", "facebook"],
      scheduledFor: `${dateStr}T13:00:00.000Z` // 09:00 AM EDT
    },
    {
      id: `angle-${ts}-feed`,
      title: "Hands Full on the Jobsite: The 15-Second Lead Capture Rule",
      hook: "You are under a crawlspace with a flashlight and a pipe wrench. The phone rings twice. By the time you climb out, that $1,400 emergency job called your competitor.",
      format: "social_card",
      niche: "Contractor Speed-to-Lead",
      narrativeBody: "In trade services, your hands are your livelihood. But when your hands are occupied, who is answering your phone?\n\nHarvard Business Review data shows that 78% of customers hire the first business to respond. Waiting just 5 minutes causes conversion rates to drop by 400%.\n\nMissed Call Auto SMS turns any spare Android phone into an autonomous speed-to-lead appliance:\n• Replies within 15 seconds from your REAL business number\n• 100% carrier compliant direct-SIM technology\n• 82% response rate\n• $49.99 one-time lifetime license (zero monthly fees)\n\nTry it free for 3 days ($0.00 today) at missedcallautosms.com",
      cta: "Start your 3-day free trial at missedcallautosms.com",
      promptLogic: "Relatable physical dilemma. High conversion quote comparing voicemail loss to 15-second instant recovery.",
      imagePrompt: "Split screen high-contrast square graphic: Left side shows a plumber under a sink unable to reach a ringing phone; Right side shows Missed Call Auto SMS auto-replying in 15 seconds, 1:1 aspect ratio.",
      imageUrl: "https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/social/bathroom-leak-90s-rule.jpg",
      videoPrompt: "Close-up of contractor hands holding heavy tools, phone glowing on dashboard with auto-text sent chime.",
      status: "draft",
      createdAt: new Date().toISOString(),
      channelTargets: ["facebook", "instagram"],
      scheduledFor: `${dateStr}T17:00:00.000Z` // 01:00 PM EDT
    },
    {
      id: `angle-${ts}-reel`,
      title: "Why Voicemail Is Dead for Emergency Contractors (9:16 Reel)",
      hook: "If a homeowner has water pouring through their ceiling, they do not listen to your 45-second voicemail greeting. They tap the next phone number.",
      format: "reel_video",
      niche: "Plumbing & Emergency Trades",
      narrativeBody: "When an emergency strikes, 82% of callers hang up the moment voicemail clicks on. They don't leave a message. They move down the Google search results.\n\nWatch what happens when you run Missed Call Auto SMS: The phone finishes ringing. 15 seconds later, your real carrier SIM texts them: 'Hey! Dave here from Apex Plumbing. I am on a jobsite right now and cannot pick up—what is going on with your pipes?'\n\nThe customer stops dialing. They reply with their address. When you finish your call 20 minutes later, you have an open invoice ready to go.",
      cta: "Tap the link in bio to try Missed Call Auto SMS free for 3 days.",
      promptLogic: "Urgent problem demonstration for short-form video discovery. Focuses on customer behavior psychology.",
      imagePrompt: "Macro cinematic shot of water dripping through ceiling drywall next to a glowing smartphone displaying a 15-second auto-reply text, 16:9.",
      imageUrl: "https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/social/universal-service-appliance.jpg",
      videoPrompt: "Cinematic vertical 9:16 24fps. A homeowner looking stressed holding their phone as a dripping pipe sounds in the background. Split screen reveals an instant SMS notification chime landing on their screen saying 'Hey, Dave here from Apex Plumbing - what is going on with your pipes?'.",
      videoAsset: `assets/ads/reels/reel_${ts}_9x16.mp4`,
      status: "draft",
      createdAt: new Date().toISOString(),
      channelTargets: ["facebook", "instagram"],
      scheduledFor: `${dateStr}T22:00:00.000Z` // 06:00 PM EDT
    }
  ];
}

async function synthesizeContentAngles(userNiche = '', customPrompt = '') {
  let researchContext = "";
  if (fs.existsSync(RESEARCH_FILE)) {
    try {
      const items = JSON.parse(fs.readFileSync(RESEARCH_FILE, 'utf8'));
      researchContext = items.slice(0, 4).map(it => `[Source: ${it.title}]\n${it.transcript.slice(0, 1200)}`).join('\n\n');
    } catch (e) {
      console.warn("Could not read competitor research:", e.message);
    }
  }

  const systemInstruction = `
You are the Lead Marketing Strategist for "Missed Call Auto SMS" (MCASMS).
Our core product: An Android app that converts missed phone calls into instant SIM auto-replies and optional AI voice receptionist handling for service businesses, contractors, plumbers, roofers, salons, and local trades.

STRICT BRAND RULES (MANDATORY):
1. ZERO HASHTAGS. ZERO EMOJIS. NO BRAND FLUFF VIBES.
2. Authentic, high-signal, narrative-driven tone. Lead the reader through a realistic journey:
   - Strong hook (relatable friction, real cost of a missed phone call).
   - Build interest/desire through authentic industry reality.
   - Actionable clear Call to Action (3-day free trial at $0.00 today or $49.99 lifetime).
3. AVOID ALL TECHNICAL JARGON: No "APIs", "webhooks", "LLM fine-tuning". Speak to a tradesman or shop owner who works with their hands.
4. Integrate the competitor research data (GoHighLevel $297/mo fee, Twilio per-text surcharges, 10DLC error 30007 blocks, Smith.ai $350-$650/mo live answering bills, 400% 5-minute lead decay curve).
5. MANDATORY FORMAT VARIATION: You must generate EXACTLY 3 items representing the 3 daily publishing slots:
   - Slot 1: format = "blog_article" (Deep educational authority, comparison table, 16:9 hero image prompt, channelTargets: ["blog", "facebook"])
   - Slot 2: format = "social_card" (1:1 square graphic quote/comparison hook, punchy copy, channelTargets: ["facebook", "instagram"])
   - Slot 3: format = "reel_video" (9:16 vertical video script, 15-30s hook, split-screen prompt for Veo 3.1, channelTargets: ["facebook", "instagram"])

OUTPUT FORMAT:
Return a JSON array of 3 distinct angle objects with this exact structure:
[
  {
    "id": "angle-unique-id",
    "title": "Short, clear headline",
    "hook": "Scroll-stopping first sentence",
    "format": "blog_article | social_card | reel_video",
    "niche": "Specific trade or business category",
    "narrativeBody": "Full multi-paragraph authentic story without emojis or hashtags",
    "cta": "Clear call to action referencing the product",
    "promptLogic": "Why this angle converts and target emotional trigger",
    "imagePrompt": "Detailed prompt for generating a bespoke 16:9 or 1:1 image",
    "videoPrompt": "Detailed prompt for generating a 4k 9:16 Veo 3.1 video reel",
    "channelTargets": ["blog", "facebook"]
  }
]
`;

  const userQuery = `
Target Niche / Focus: ${userNiche || 'Small Service Contractors, Plumbers, and Field Trades'}
Custom Directive: ${customPrompt || 'Emphasize competitor pricing traps (GoHighLevel/Twilio surcharges, expensive answering services) versus one-time hardware ownership.'}

Empirical Research Context (Use these real numbers and findings):
${researchContext || 'General trade business context: Homeowners hiring the first contractor who responds within 15 seconds.'}
`;

  try {
    const response = await callGemini(systemInstruction + "\n\n" + userQuery);
    const angles = Array.isArray(response) ? response : (response.angles || response.posts || []);
    
    if (!angles || angles.length === 0) {
      throw new Error("No angles generated by Gemini");
    }

    // Enhance with runtime metadata and slot scheduling
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + 1);
    const dateStr = targetDate.toISOString().split('T')[0];

    const slotHours = ["13:00:00.000Z", "17:00:00.000Z", "22:00:00.000Z"]; // 9 AM, 1 PM, 6 PM EDT

    const queueItems = angles.slice(0, 3).map((a, idx) => ({
      ...a,
      id: a.id || `angle-${Date.now()}-${idx + 1}`,
      status: "draft",
      createdAt: new Date().toISOString(),
      scheduledFor: `${dateStr}T${slotHours[idx] || "17:00:00.000Z"}`
    }));

    // Pre-render bespoke reels to guarantee media uniqueness
    await ensureBespokeReels(queueItems);

    // Save to queue
    saveToQueue(queueItems);
    return { success: true, count: queueItems.length, data: queueItems };
  } catch (err) {
    console.warn(`[ContentEngine] Falling back to structured templates: ${err.message}`);
    const fallback = generateFallbackAngles(userNiche);
    await ensureBespokeReels(fallback);
    saveToQueue(fallback);
    return { success: true, count: fallback.length, data: fallback, note: "Generated via resilient template engine (configure GEMINI_API_KEY for live LLM mode)" };
  }
}

async function ensureBespokeReels(items) {
  const { buildBespokeReel } = require('./build_bespoke_reel');
  const { isVideoAlreadyUsed } = require('./media_guard');
  for (const item of items) {
    if (item.format === 'reel_video') {
      const target = item.videoAsset || `assets/ads/reels/reel_${item.id}_9x16.mp4`;
      item.videoAsset = target;
      const fullPath = path.join(__dirname, '..', target);
      if (!fs.existsSync(fullPath) || isVideoAlreadyUsed(target, item.id)) {
        console.log(`🎬 [ContentEngine] Pre-rendering bespoke 9:16 reel for: "${item.title}"`);
        try {
          const bespoke = await buildBespokeReel({
            id: item.id,
            title: item.title,
            hook: item.hook,
            narrativeBody: item.narrativeBody,
            trade: item.niche,
            imageAsset: item.imageUrl,
            outputRelativePath: target
          });
          item.videoAsset = bespoke.relative;
        } catch (e) {
          console.warn(`[ContentEngine] Warning: Could not pre-render reel: ${e.message}`);
        }
      }
    }
  }
}

function saveToQueue(newItems) {
  let queue = [];
  if (fs.existsSync(QUEUE_FILE)) {
    try {
      queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    } catch (e) {
      queue = [];
    }
  }

  // Prepend new items
  const combined = [...newItems, ...queue];
  // Deduplicate by ID
  const seen = new Set();
  const deduped = combined.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  fs.writeFileSync(QUEUE_FILE, JSON.stringify(deduped, null, 2), 'utf8');
}

if (require.main === module) {
  const niche = process.argv[2] || '';
  synthesizeContentAngles(niche).then(res => {
    console.log(JSON.stringify(res, null, 2));
  }).catch(e => {
    console.error(e);
  });
}

module.exports = {
  synthesizeContentAngles,
  generateFallbackAngles
};
