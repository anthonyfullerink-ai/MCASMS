const fs = require('fs');
const path = require('path');
const https = require('https');
const { getContractorTrends } = require('./research_trends');
const { personalizeSocialGraphic } = require('./personalize_graphic');

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

// 7-Day Multi-Trade & 70/30 Content Rotation Matrix
const MULTI_TRADE_ROTATION = [
  {
    day: 0,
    trade: 'Barbershop & Hair Salon',
    tradeTag: '💈 BARBERSHOP & SALON SPEED-TO-LEAD',
    type: '70_VALUE',
    pillar: 'Hands-in-Hair Dilemma: Why Callers Wont Leave Voicemails',
    painPoint: 'Hairstylist mid-fade or coloring cannot touch the phone. Walk-ins and new clients dial the next shop.',
    baseImage: 'contractor-jobsite.jpg'
  },
  {
    day: 1,
    trade: 'Plumbing & Emergency Rooter',
    tradeTag: '🔧 PLUMBING & ROOTER PLAYBOOK',
    type: '70_VALUE',
    pillar: 'Speed-to-Lead Science: The 60-Second Conversion Rule',
    painPoint: 'Under a kitchen sink with a pipe wrench. Every call sent to voicemail is a $1,200 repair lost.',
    baseImage: 'contractor-speed-rule.jpg'
  },
  {
    day: 2,
    trade: 'Pet Grooming Studio',
    tradeTag: '🐕 PET GROOMING STUDIOS',
    type: '70_VALUE',
    pillar: 'Soapy Hands & Missed Bookings: Capturing Ready Clients',
    painPoint: 'Washing or drying a 75lb golden retriever. Soapy hands cannot touch a screen; missed calls equal lost appointment revenue.',
    baseImage: 'hvac-speed-to-lead.jpg'
  },
  {
    day: 3,
    trade: 'Universal Service Businesses',
    tradeTag: '💡 HARDWARE APPLIANCE VS. SAAS MATH',
    type: '30_SELL',
    pillar: 'The $49.99 Lifetime License vs $3,500/Year Subscription Trap',
    painPoint: 'Small business owners burned by $297/mo software fees and carrier 10DLC spam blocks.',
    baseImage: 'appliance-vs-saas.jpg'
  },
  {
    day: 4,
    trade: 'Auto Detailing & Mobile Mechanics',
    tradeTag: '🚗 AUTO DETAILING & MOBILE MECHANIC',
    type: '70_VALUE',
    pillar: 'Running the Buffer: How Lost Calls Bleed High-Ticket Contracts',
    painPoint: 'Applying ceramic coating or under a car chassis. Cannot drop tools to answer routine inquiry calls.',
    baseImage: 'answering-service-cost.jpg'
  },
  {
    day: 5,
    trade: 'HVAC & Electrical Contractors',
    tradeTag: '⚡ HVAC & ELECTRICAL SPEED-TO-LEAD',
    type: '70_VALUE',
    pillar: 'Weekend Emergency Dispatch Without Burnout',
    painPoint: 'Up on an attic ladder in 120-degree heat. 15-second auto-text locks in the job before competitors check voicemail.',
    baseImage: 'speed-to-lead.jpg'
  },
  {
    day: 6,
    trade: 'General Appointment & Field Services',
    tradeTag: '📱 THE 15-SECOND APPLIANCE DEMO',
    type: '30_SELL',
    pillar: 'Autonomous Direct-SIM Lead Capture Walkthrough',
    painPoint: 'Why running directly on physical SIM cards protects your business from carrier spam bans forever.',
    baseImage: 'matrix-comparison-ad.jpg'
  }
];

// Anti-Fatigue Deduplication Memory Manager
function getDeduplicatedSchedule(today) {
  const historyPath = path.join(__dirname, '../data/published_history.json');
  let history = [];
  if (fs.existsSync(historyPath)) {
    try { history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch (e) {}
  }

  const dayOfWeek = today.getDay();
  let candidate = MULTI_TRADE_ROTATION[dayOfWeek];

  // Check if this trade was used yesterday
  const lastPost = history[0];
  if (lastPost && lastPost.trade === candidate.trade) {
    // Shift to next day's candidate to prevent consecutive repeats
    const nextIdx = (dayOfWeek + 1) % MULTI_TRADE_ROTATION.length;
    candidate = MULTI_TRADE_ROTATION[nextIdx];
  }

  return { candidate, history };
}

function recordPublishedItem(record) {
  const historyPath = path.join(__dirname, '../data/published_history.json');
  let history = [];
  if (fs.existsSync(historyPath)) {
    try { history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch (e) {}
  }
  history.unshift(record);
  // Keep rolling 60 days
  if (history.length > 60) history = history.slice(0, 60);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
}

async function callGemini(prompt) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.7,
        max_output_tokens: 4096
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${model}:generateContent`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const rawText = json.candidates[0].content.parts[0].text;
            resolve(JSON.parse(rawText));
          } else {
            reject(new Error(`Gemini Error (${res.statusCode}): ` + (json.error ? json.error.message : body)));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function generateOfflineFallback(pillarConfig, trend, dateStr) {
  console.log(`ℹ️ [LeanEngine] Assembling bespoke bundle for [${pillarConfig.trade}] (0 API credits used)...`);
  const isSell = pillarConfig.type === '30_SELL';

  let customQuote = `When your hands are full with a client, you can't touch the phone.`;
  if (pillarConfig.trade.includes('Barber')) {
    customQuote = 'Mid-fade with shears in hand? You cannot answer the phone.';
  } else if (pillarConfig.trade.includes('Grooming')) {
    customQuote = 'Washing a 75lb dog with soapy hands? You cannot answer.';
  } else if (pillarConfig.trade.includes('Detailing')) {
    customQuote = 'Running a ceramic buffer? Dropping tools costs you time and jobs.';
  } else if (pillarConfig.trade.includes('Plumbing')) {
    customQuote = 'Under a kitchen sink with a pipe wrench? Voicemail loses the lead.';
  }

  // Stamp the bespoke graphic locally with FFmpeg
  const stampedGraphicPath = personalizeSocialGraphic({
    baseImageName: pillarConfig.baseImage,
    tradeTag: pillarConfig.tradeTag,
    quote: customQuote,
    ctaText: isSell ? 'NO MONTHLY SUBSCRIPTIONS • $49.99 LIFETIME' : '15-SECOND AUTO-TEXT • DIRECT SIM CARRIER EXEMPT',
    outputFilename: `graphic_${dateStr}.jpg`
  });

  const relativeGraphic = path.basename(stampedGraphicPath);

  return {
    date: dateStr,
    trade: pillarConfig.trade,
    pillar: pillarConfig.pillar,
    contentType: pillarConfig.type,
    inspirationTrend: trend.title,
    blog: {
      title: isSell
        ? `Why Smart ${pillarConfig.trade} Owners Are Ditching Monthly SaaS for Dedicated Hardware Appliances`
        : `The Hands-Busy Dilemma in ${pillarConfig.trade}: How 15-Second Auto-Text Solves Missed Calls`,
      slug: `daily-intel-${pillarConfig.trade.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${dateStr}`,
      category: isSell ? "Appliance vs. SaaS" : "Speed-to-Lead",
      readTime: "4 min read",
      excerpt: `Whether you run a ${pillarConfig.trade} or mobile service, you cannot pick up the phone with your hands full. Here is how autonomous direct-SIM appliances protect your revenue.`,
      contentMarkdown: `## The Hands-Busy Reality of ${pillarConfig.trade}\n\nWhen your hands are occupied with tools, clippers, or a client, answering the phone is physically impossible.\n\nYet consumer behavior has fundamentally changed: **over 78% of customers hire or book with the first business that responds.** When an inquiry goes to voicemail, over 65% hang up and immediately dial the next competitor on Google.\n\n### Why Software Subscriptions and Answering Services Fall Short\n\n1. **High Ongoing Costs**: Third-party answering services charge $300-$500/month and lack domain expertise.\n2. **Carrier Spam Blocks**: Traditional SaaS tools route messages through virtual numbers (Twilio, GoHighLevel) requiring complex A2P 10DLC registration that frequently gets flagged.\n3. **Robotic Delays**: Delayed auto-replies look like impersonal corporate blasts.\n\n### The Autonomous Hardware Advantage\n\nMissed Call Auto SMS runs directly on an Android smartphone connected to a physical SIM card. Within 15 seconds of a dropped call, an authentic text message is dispatched directly from your real business number.\n\n**No monthly subscriptions. 100% carrier compliant. Own it for life.**`
    },
    feedPost: {
      headline: isSell
        ? `🚨 Stop Paying $300/Mo For Answering Services That Sound Like Robots`
        : `⚡ When Your Hands Are Full, Speed-to-Lead Still Matters`,
      copyFacebook: `💈✂️ Calling all ${pillarConfig.trade} owners: You know the feeling.\n\nYou're in the zone with a client, tools in hand, and the phone rings off the hook. You can't answer. By the time you're done, that customer has already booked down the street.\n\nHere's how Missed Call Auto SMS solves it on autopilot:\n✅ Automatically detects missed business calls\n✅ Replies in 15 seconds with a personal, natural text directly from your real number\n✅ Operates over your physical SIM card (100% immune to carrier spam filters)\n✅ Zero monthly fees—own it for life for just $49.99\n\nStart your 3-day free trial at https://missedcallautosms.com\n\n#SmallBusiness #${pillarConfig.trade.replace(/[^a-zA-Z]/g, '')} #SpeedToLead #CustomerService #NoMonthlyFees`,
      copyInstagram: `In ${pillarConfig.trade}, your hands are your livelihood. But when you're hands-deep in work, who is answering your phone? 📱💨\n\nOver 78% of clients book with the first business that texts or calls back. If you take 15 minutes, they're already gone.\n\nMissed Call Auto SMS turns any Android phone into an autonomous speed-to-lead appliance:\n• Replies within 15 seconds from your REAL business number\n• 100% carrier compliant direct-SIM technology\n• 80%+ response rate\n• $49.99 one-time lifetime license (zero subscriptions)\n\nTap the link in bio to try it free for 3 days!\n\n#smallbusinessowner #tradielife #${pillarConfig.trade.replace(/[^a-zA-Z]/g, '').toLowerCase()} #speedtolead #servicebusiness #entrepreneur`,
      imageAsset: relativeGraphic,
      aspectRatio: '1:1'
    },
    reelStory: {
      hook: `Every missed call during a client session is lost revenue down the street.`,
      videoAsset: 'assets/ads/missed_call_auto_sms_reel_9x16.mp4',
      coverAsset: 'assets/ads/scenes/scene_1.jpg',
      aspectRatio: '9:16',
      captionInstagram: `When your hands are full with a client, you can't touch the phone. Missed Call Auto SMS replies in 15 seconds directly from your real SIM. Zero monthly fees. Link in bio! 📲 #${pillarConfig.trade.replace(/[^a-zA-Z]/g, '').toLowerCase()} #speedtolead #smallbusiness`,
      captionFacebook: `Stop losing appointments and jobs to voicemail. Missed Call Auto SMS detects missed calls and texts back in 15 seconds. Try it free for 3 days at missedcallautosms.com!`
    }
  };
}

async function generateDailyContentBundle(options = {}) {
  console.log('====================================================');
  console.log('🚀 MULTI-TRADE OMNICHANNEL CONTENT GENERATOR');
  console.log('====================================================');

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];

  // 1. Get deduplicated trade candidate
  const { candidate: pillarConfig } = getDeduplicatedSchedule(today);
  console.log(`Today's Trade Focus: [${pillarConfig.trade}]`);
  console.log(`Pillar: [${pillarConfig.type}] ${pillarConfig.pillar}`);

  // 2. Poll live trends across all sectors
  const trends = await getContractorTrends();
  const primaryTrend = trends.find(t => t.trade === pillarConfig.trade) || trends[0] || {
    title: `Busy ${pillarConfig.trade} owners losing clients to missed calls`
  };
  console.log(`📌 Trade Pain-Point Anchor: "${primaryTrend.title}"`);

  let bundle = null;

  if (GEMINI_API_KEY && !options.offline) {
    try {
      console.log('📡 Generating single-shot daily multi-pack via Gemini...');
      const prompt = `
You are the master content director for "Missed Call Auto SMS" (a $49.99 lifetime Android hardware appliance that auto-texts missed business calls within 15 seconds using the direct SIM card, bypassing carrier spam blocks with zero monthly fees).

Target Industry: ${pillarConfig.trade}
Pain Point: ${pillarConfig.painPoint}
Current Content Pillar: ${pillarConfig.pillar} (${pillarConfig.type === '30_SELL' ? '30% Selling/Direct-Response' : '70% Educational/Engaging Value'})
Community Context: "${primaryTrend.title}"

Generate a complete, cohesive multi-format daily publishing package in JSON with this exact schema:
{
  "date": "${dateStr}",
  "trade": "${pillarConfig.trade}",
  "pillar": "${pillarConfig.pillar}",
  "contentType": "${pillarConfig.type}",
  "inspirationTrend": "${primaryTrend.title}",
  "blog": {
    "title": "Compelling SEO headline tailored to ${pillarConfig.trade}",
    "slug": "daily-intel-${pillarConfig.trade.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${dateStr}",
    "category": "${pillarConfig.type === '30_SELL' ? 'Appliance vs. SaaS' : 'Speed-to-Lead'}",
    "readTime": "4 min read",
    "excerpt": "Punchy 2-sentence summary",
    "contentMarkdown": "In-depth 800-word article explaining the missed call problem in ${pillarConfig.trade} and how 15-second direct SIM auto-text fixes it."
  },
  "feedPost": {
    "headline": "Punchy headline for ${pillarConfig.trade}",
    "copyFacebook": "Engaging Facebook post with paragraphs, bullet points, and link to missedcallautosms.com",
    "copyInstagram": "Instagram caption with line breaks and 10 targeted industry hashtags",
    "imageAsset": "${pillarConfig.baseImage}",
    "aspectRatio": "1:1"
  },
  "reelStory": {
    "hook": "1-sentence video hook tailored to ${pillarConfig.trade}",
    "videoAsset": "assets/ads/missed_call_auto_sms_reel_9x16.mp4",
    "coverAsset": "assets/ads/scenes/scene_1.jpg",
    "aspectRatio": "9:16",
    "captionInstagram": "Short punchy Reel caption with link in bio callout",
    "captionFacebook": "Engaging Facebook Reel caption"
  }
}
      `;
      bundle = await callGemini(prompt);
      console.log('✔ Gemini successfully generated the multi-trade bundle!');
    } catch (e) {
      console.warn('⚠️ Gemini generation error:', e.message);
      bundle = generateOfflineFallback(pillarConfig, primaryTrend, dateStr);
    }
  } else {
    bundle = generateOfflineFallback(pillarConfig, primaryTrend, dateStr);
  }

  // Ensure data directory exists
  const dataDir = path.join(__dirname, '../data');
  fs.mkdirSync(dataDir, { recursive: true });

  const bufferPath = path.join(dataDir, 'daily_content_buffer.json');
  fs.writeFileSync(bufferPath, JSON.stringify(bundle, null, 2), 'utf8');
  console.log(`\n💾 Saved daily content package to: ${bufferPath}`);

  // Record into history
  recordPublishedItem({
    date: dateStr,
    trade: bundle.trade,
    pillar: bundle.pillar,
    headline: bundle.feedPost.headline,
    imageAsset: bundle.feedPost.imageAsset
  });

  return bundle;
}

module.exports = { generateDailyContentBundle, MULTI_TRADE_ROTATION };

if (require.main === module) {
  generateDailyContentBundle({ offline: true }).then(() => {
    console.log('\n🏁 Multi-Trade Content Generator test completed successfully!');
  });
}
