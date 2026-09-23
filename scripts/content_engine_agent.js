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
  return new Promise((resolve, reject) => {
    if (!GEMINI_API_KEY) {
      return reject(new Error('GEMINI_API_KEY not found in environment or .env'));
    }

    const payload = JSON.stringify({
      contents: [{
        parts: [{ text: promptText }]
      }],
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
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
            if (!rawText) return reject(new Error('Empty Gemini response'));
            const parsed = JSON.parse(rawText);
            resolve(parsed);
          } else {
            reject(new Error(`Gemini API Error (${res.statusCode}): ` + (json.error ? json.error.message : body)));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Gemini response: ${e.message}\nBody: ${body.slice(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Fallback high-converting templates if API key is unconfigured or rate limited
function generateFallbackAngles(niche = 'Contractor Speed-to-Lead') {
  const ts = Date.now();
  return [
    {
      id: `angle-${ts}-1`,
      title: "The $1,400 Bathroom Leak and the 90-Second Rule",
      hook: "A homeowner with water pouring through their ceiling doesn't listen to a 45-second voicemail greeting. They hang up and tap the next number on Google.",
      format: "reel_video",
      niche: "Plumbing & Trades",
      narrativeBody: "Most contractors think their phone problem is marketing. It is not. You are paying good money for local service ads or SEO, but when you are under a crawlspace or driving between jobs, that $1,400 emergency job rings twice, hits your voicemail, and evaporates.\n\nHere is what the caller does: they do not leave a message. In 2026, 82% of emergency service callers hang up instantly if a human does not answer. They open the search results again and book the contractor who texts them back first.\n\nMissed Call Auto SMS runs locally on a dedicated Android phone. The moment a call disconnects without an answer, your carrier SIM sends an instant personal text before the caller can even dial your competitor: 'Hey, this is Dave from Apex. I am on a jobsite right now and cannot pick up—what is going on with your pipes?'\n\nNo monthly cloud subscription. No VoIP forwarding lag. One phone, your carrier SIM, zero lost leads.",
      cta: "Test Missed Call Auto SMS free for 3 days ($0.00 today) at missedcallautosms.com",
      promptLogic: "Loss aversion + relatable jobsite imagery. Eliminates tech buzzwords by contrasting real water damage urgency against voicemail abandonment.",
      imagePrompt: "Photorealistic macro shot of a plumber's tool bag and brass pipe fittings on a wet utility room floor next to an Android phone lighting up with an incoming text notification, cinematic warm lighting, 16:9 aspect ratio, 8k resolution.",
      videoPrompt: "Cinematic medium close-up, 4k 24fps. A contractor in work gloves hearing a smartphone ring on the dashboard of a work truck. He cannot grab it in time. Split screen reveals the homeowner tapping dial on a competitor, then immediately pausing as a crisp SMS chime rings on their phone with an instant auto-reply.",
      status: "draft",
      createdAt: new Date().toISOString(),
      channelTargets: ["blog", "facebook", "instagram"],
      scheduledFor: new Date(Date.now() + 86400000).toISOString()
    },
    {
      id: `angle-${ts}-2`,
      title: "Why SaaS Monthly Phone Bills Are Eating Contractor Margins",
      hook: "You are paying $150 every single month for a cloud answering service that forwards your calls through four servers before dropping them.",
      format: "blog_article",
      niche: "Hardware Appliance vs SaaS",
      narrativeBody: "Let us look at the real math behind small business communications.\n\nTypical cloud phone answering SaaS: $99 to $250 every month. If you keep it for three years, you have handed an enterprise software company over $5,000 for what is essentially an SMS forwarding script.\n\nThe alternative is simple hardware ownership. You take an affordable Android phone with an unlimited carrier SIM, plug it into the shop wall, install Missed Call Auto SMS, and it runs 24/7 forever.\n\nThere is no per-minute overage billing. There are no carrier registration delays. It uses your actual carrier number, which means your texts land directly in the primary SMS inbox, not the carrier spam filter.\n\nOwn the appliance once. Stop renting communication tools that cost more than your liability insurance.",
      cta: "Get Missed Call Auto SMS Flagship edition for a one-time $49.99 lifetime license.",
      promptLogic: "Cost comparison math. Appeals to the practical financial mindset of trade business owners tired of recurring software subscriptions.",
      imagePrompt: "Top-down flat lay comparison on a wooden workbench: on the left, a stack of recurring monthly software invoices crossed out in red marker; on the right, a sleek Android device running Missed Call Auto SMS beside a brass key, ultra-realistic, crisp studio lighting, 16:9.",
      videoPrompt: "Documentary style camera pan across a clean contractor office desk. The camera moves from an open laptop displaying an expensive recurring SaaS invoice to a compact Android phone resting on a wireless charging dock, showing a green checkmark indicating 100% missed call capture.",
      status: "draft",
      createdAt: new Date().toISOString(),
      channelTargets: ["blog", "facebook"],
      scheduledFor: new Date(Date.now() + 172800000).toISOString()
    }
  ];
}

async function synthesizeContentAngles(userNiche = '', customPrompt = '') {
  let researchContext = "";
  if (fs.existsSync(RESEARCH_FILE)) {
    try {
      const items = JSON.parse(fs.readFileSync(RESEARCH_FILE, 'utf8'));
      researchContext = items.slice(0, 3).map(it => `[Source: ${it.title} (${it.url})]\n${it.transcript.slice(0, 1500)}`).join('\n\n');
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
4. Provide unique narrative angles inspired by the provided research transcripts, DO NOT copy or repeat them verbatim.
5. Provide a bespoke image prompt (for Imagen / Nano Banana) and a bespoke video prompt (for Veo 3.1).

OUTPUT FORMAT:
Return a JSON array of 3 distinct angle objects with this exact structure:
[
  {
    "id": "angle-unique-id",
    "title": "Short, clear headline",
    "hook": "Scroll-stopping first sentence",
    "format": "reel_video | blog_article | social_card",
    "niche": "Specific trade or business category",
    "narrativeBody": "Full multi-paragraph authentic story without emojis or hashtags",
    "cta": "Clear call to action referencing the product",
    "promptLogic": "Why this angle converts and target emotional trigger",
    "imagePrompt": "Detailed prompt for generating a bespoke 16:9 image",
    "videoPrompt": "Detailed prompt for generating a 4k Veo 3.1 video reel",
    "channelTargets": ["blog", "facebook", "instagram"]
  }
]
`;

  const userQuery = `
Target Niche / Focus: ${userNiche || 'Small Service Contractors and Urgent Local Businesses'}
Custom Directive: ${customPrompt || 'Focus on the real financial cost of a missed call during peak hours.'}

Research Context Transcripts to draw inspiration from:
${researchContext || 'General trade business context: Homeowners hiring the first contractor who responds.'}
`;

  try {
    const response = await callGemini(systemInstruction + "\n\n" + userQuery);
    const angles = Array.isArray(response) ? response : (response.angles || response.posts || []);
    
    if (!angles || angles.length === 0) {
      throw new Error("No angles generated by Gemini");
    }

    // Enhance with runtime metadata
    const queueItems = angles.map((a, idx) => ({
      ...a,
      id: a.id || `angle-${Date.now()}-${idx + 1}`,
      status: "draft",
      createdAt: new Date().toISOString(),
      scheduledFor: new Date(Date.now() + (idx + 1) * 86400000).toISOString()
    }));

    // Save to queue
    saveToQueue(queueItems);
    return { success: true, count: queueItems.length, data: queueItems };
  } catch (err) {
    console.warn(`[ContentEngine] Falling back to structured templates: ${err.message}`);
    const fallback = generateFallbackAngles(userNiche);
    saveToQueue(fallback);
    return { success: true, count: fallback.length, data: fallback, note: "Generated via resilient template engine (configure GEMINI_API_KEY for live LLM mode)" };
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
