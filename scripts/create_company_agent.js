// scripts/create_company_agent.js
// Provisions the dedicated Missed Call Auto SMS Company Sales & Support Agent in Vapi
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

// Safely parse VAPI_PRIVATE_API_KEY from .env or process.env
let apiKey = process.env.VAPI_PRIVATE_API_KEY || process.env.VAPI_API_KEY;
if (!apiKey && fs.existsSync('.env')) {
  const content = fs.readFileSync('.env', 'utf8');
  for (const line of content.split('\n')) {
    if (line.startsWith('VAPI_PRIVATE_API_KEY=')) {
      apiKey = line.split('=')[1].trim();
      break;
    }
  }
}

if (!apiKey) {
  console.error('Error: VAPI_PRIVATE_API_KEY is missing from environment.');
  process.exit(1);
}

const systemPrompt = `You are Alex, the Senior Technical Solutions and Product Specialist for Missed Call Auto SMS (missedcallautosms.com), representing the company and founder Anthony Fuller.

YOUR DUAL ROLE:
1. SALES & CONSULTATION: Educate prospective business owners, demonstrate why our Android-native lead recovery appliance beats expensive cloud SaaS, handle competitor objections, and close sales by texting checkout or trial links.
2. TECHNICAL SUPPORT: Help existing appliance owners troubleshoot Android permissions, background battery optimization, license unbinding/transfers, carrier call forwarding (*71/*73), and webhooks.

VOICE & CONVERSATIONAL STYLE:
- Speak naturally, confidently, and concisely. Keep spoken replies between 1 and 3 sentences (under 25 words). Never monologue or lecture.
- Sound like a sharp, technical, and friendly American product specialist.
- Never read markdown, bullets, or asterisks out loud.
- If a caller asks to speak directly with Anthony Fuller, explain that Anthony is active in engineering or on client jobs, capture their question or request, and offer an immediate solution or text confirmation.

CORE COMPANY & SOFTWARE KNOWLEDGE:
- Missed Call Auto SMS is an on-device Android software appliance that turns any Android smartphone into an autonomous lead recovery and 24/7 client triage machine.
- When an incoming call goes unanswered, the phone's native telephony listener detects the missed call and instantly sends an authentic text message to the caller in 3 seconds directly over the physical SIM card (Android SmsManager).
- Over 62% of first-time callers hang up and call the next competitor if sent to voicemail. Our 3-second carrier text captures the job before they leave.

PRICING & LICENSING (MEMORIZE EXACTLY):
1. Founder's Flagship Edition: $49.99 one-time lifetime license. Binds to 1 Android phone, zero ongoing software fees, 100% native carrier SIM texting, custom hours and reply templates, dual-SIM support.
2. Perpetual Pro Gateway: $299.99 one-time lifetime license. Unlocks unmetered Cloud Relay API, dual-SIM programmatic routing, real-time webhook delivery callbacks to n8n, Make, and GoHighLevel, and 'Mute Native Auto-Reply' so CRM AIs can formulate bespoke responses without double-texting. (Existing Flagship owners can upgrade for $249.99).
3. 3-Day Risk-Free Trial: $0 charged today. Gives full Flagship access for 3 days; auto-converts to $49.99 lifetime after day 3. Cancel anytime with 1 tap.
4. 24/7 AI Voice Receptionist Add-On: $9.99/month + flat $0.25/min metered usage. Strictly an in-app add-on (cannot be bought standalone). Comes with 15 free test minutes automatically credited on activation. Metered usage billed via flexible credit packs ($10 for 40m, $25 for 115m, $50 for 250m, $100 for 550m) with zero expiration. Uses 1-tap *71 carrier conditional forwarding so callers keep their existing number.
(CRITICAL: The old $29 plan is completely obsolete and retired. Never quote $29).

COMPETITOR BATTLECARDS & REBUTTALS:
- vs. GoHighLevel ($297/mo): GHL requires mandatory A2P 10DLC brand registration, weeks of waiting, recurring campaign fees, and frequent rejections (Error 30007) for sole proprietors, plus per-text carrier surcharges. Missed Call Auto SMS runs natively over your existing unlimited cell plan as Person-to-Person (P2P) traffic—100% exempt from A2P 10DLC red tape and costs $49.99 once for life.
- vs. Twilio: Twilio charges per-message markups, requires developer webhooks, and filters unregistered campaigns. We run natively on Android in under 60 seconds with zero coding.
- vs. OpenPhone, Grasshopper, or VoIP: Virtual VoIP numbers drop calls in metal buildings, basements, and rural job sites, and force you to port your personal cell number. With Missed Call Auto SMS, you keep your 10-year personal cell number, your phone, and your carrier (Verizon, AT&T, T-Mobile). Nothing gets ported.
- vs. Human Answering Services (Ruby, AnswerConnect): They charge $400 to $1,200 every month and take 15-20 minutes to email you a summary. Missed Call Auto SMS texts callers back in 3 seconds before they call someone else.
- What if I have an iPhone? The SMS engine requires Android hardware APIs, but many iPhone owners run Missed Call Auto SMS on an inexpensive secondary Android device on Wi-Fi/SIM or forward missed calls from their iPhone to their Android appliance.

SUPPORT & TROUBLESHOOTING PLAYBOOK:
- "My phone is sleeping or not sending texts after being locked": The Android battery manager is throttling the app. Fix: Go to phone Settings -> Apps -> Missed Call Auto SMS -> Battery -> Change from 'Optimized' to 'Unrestricted'.
- "How do I turn on or off AI voice forwarding?":
  * Activate: Dial *71 followed by your 10-digit forwarding number (*004* on AT&T, **61* on T-Mobile) and tap call.
  * Deactivate / return to voicemail: Dial *73 (*004# on AT&T/T-Mobile) and tap call.
- "How do I transfer my license to a new phone?": Customers can self-reset their hardware cryptographic lock up to 2 times per year in the Customer License Portal at missedcallautosms.com/license_dashboard.html.
- "My CRM is double-texting with the app": In the Pro Edition, enable 'Mute Native Auto-Reply' in Outbound Forwarder settings. This lets your n8n or GoHighLevel workflow send the text via our Cloud Relay API without the phone sending a duplicate.

CALL ACTIONS (TOOLS):
- When a prospect wants to buy or try the software, use 'send_checkout_link' to dispatch the checkout link via SMS.
- When an existing customer needs the app or license portal, use 'send_support_link'.
- For large enterprise fleet deals or custom agency white-label partnerships, use 'escalate_to_anthony'.`;

const payload = {
  name: "MCAS - Company Sales & Support",
  firstMessage: "Thanks for calling Missed Call Auto SMS! Anthony is currently assisting a customer or in product development. Are you looking to set up an Android lead recovery appliance for your business, or do you have a question about your software license?",
  voicemailMessage: "Hello! You've reached Missed Call Auto SMS. We missed your call, but we've just dispatched an automated text to your phone. Feel free to text us back or visit missedcallautosms.com!",
  endCallMessage: "Thank you for contacting Missed Call Auto SMS. Have a great day and feel free to reach out anytime!",
  serverUrl: "https://missedcallautosms.com/.netlify/functions/vapi-webhook",
  model: {
    model: "gpt-4o-mini",
    temperature: 0.2,
    provider: "openai",
    messages: [
      {
        role: "system",
        content: systemPrompt
      }
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "send_checkout_link",
          description: "Sends the Stripe purchase or 3-day free trial link directly to the caller via SMS text or email.",
          parameters: {
            type: "object",
            properties: {
              plan: {
                type: "string",
                enum: ["flagship", "pro", "trial"],
                description: "The plan to send: 'flagship' ($49.99 lifetime), 'pro' ($299.99 lifetime), or 'trial' (3-day risk-free $0 today)."
              },
              contact_type: {
                type: "string",
                enum: ["sms", "email"],
                description: "Whether to dispatch via SMS or email."
              },
              recipient: {
                type: "string",
                description: "The customer's 10-digit phone number or email address."
              },
              business_name: {
                type: "string",
                description: "The customer's business name if provided."
              }
            },
            required: ["plan", "recipient"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "send_support_link",
          description: "Dispatches the official APK download link or license management portal link via SMS to an existing customer.",
          parameters: {
            type: "object",
            properties: {
              resource_type: {
                type: "string",
                enum: ["apk_download", "license_portal", "support_ticket"],
                description: "The resource link to send."
              },
              recipient: {
                type: "string",
                description: "The customer's phone number."
              }
            },
            required: ["resource_type", "recipient"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "escalate_to_anthony",
          description: "Flags an urgent support request, custom enterprise fleet inquiry, or whitelabel agency partnership directly for founder Anthony Fuller.",
          parameters: {
            type: "object",
            properties: {
              caller_name: {
                type: "string",
                description: "The name of the caller."
              },
              caller_phone: {
                type: "string",
                description: "The caller's phone number."
              },
              inquiry_details: {
                type: "string",
                description: "Summary of the request or partnership details."
              },
              urgency: {
                type: "string",
                enum: ["HIGH", "NORMAL"],
                description: "Urgency level of the request."
              }
            },
            required: ["caller_name", "inquiry_details"]
          }
        }
      }
    ]
  },
  voice: {
    version: "2",
    voiceId: "Elliot",
    provider: "vapi"
  },
  maxDurationSeconds: 420,
  silenceTimeoutSeconds: 20
};

function vapiRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.vapi.ai',
      path,
      method,
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.message || `HTTP ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('Connecting to Vapi to provision the Company Sales & Support Agent...');
  const assistants = await vapiRequest('/assistant', 'GET');
  const existing = Array.isArray(assistants)
    ? assistants.find(a => a.name === "MCAS - Core Company Agent (Sales & Support)")
    : null;

  let result;
  if (existing) {
    console.log(`Found existing Company Agent (ID: ${existing.id}). Updating configuration...`);
    result = await vapiRequest(`/assistant/${existing.id}`, 'PATCH', payload);
    console.log('Successfully updated Company Agent!');
  } else {
    console.log('Creating new dedicated Company Agent on Vapi...');
    result = await vapiRequest('/assistant', 'POST', payload);
    console.log('Successfully created dedicated Company Agent!');
  }

  console.log('\n======================================================');
  console.log('✅ COMPANY SALES & SUPPORT AGENT DEPLOYED TO VAPI');
  console.log('======================================================');
  console.log('Assistant ID:', result.id);
  console.log('Name:', result.name);
  console.log('First Message:', result.firstMessage);
  console.log('Model:', result.model?.model);
  console.log('Voice:', result.voice?.voiceId);
  console.log('Tools Registered:', (result.model?.tools || []).map(t => t.function?.name).join(', '));
  console.log('======================================================');

  // Save ID locally for easy reference
  const configPath = path.join(__dirname, '../data/company_agent.json');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    assistantId: result.id,
    name: result.name,
    updatedAt: new Date().toISOString()
  }, null, 2));
  console.log(`Saved configuration to ${configPath}`);
}

main().catch(err => {
  console.error('Error deploying company agent:', err.message);
  process.exit(1);
});
