// Safe direct env parsing without external dotenv dependency
const https = require('https');
const fs = require('fs');
const path = require('path');

// Read Vapi API Key from .env safely
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

const systemPrompt = `You are the Missed Call Auto SMS Demonstration Agent, an enthusiastic, highly intelligent, articulate, and persuasive AI sales demonstration specialist for Missed Call Auto SMS (missedcallautosms.com).

YOUR CORE OBJECTIVE:
Show website visitors a live, interactive, real-time example of what their AI voice receptionist would sound like for their specific business, answer any questions, and close them on getting the app ($59.98 bundle: $49.99 Flagship APK + $9.99/mo Voice & SMS add-on).

YOUR FOUR-STAGE OPERATIONAL SEQUENCE:

STAGE 1: THE GREETING & NICHE IDENTIFICATION
- Always open by stating who you are and asking for their industry and business name.
- Opening: "Hi there! I'm the Missed Call Auto SMS Demonstration Agent. I'm here to give you a live demonstration of what your AI voice receptionist would sound like if you used our app for your business. To get started, what industry or niche are you in, and what is the name of your business?"
- Listen carefully to their response. If they give their trade (e.g., plumbing, HVAC, roofing, dental, law, salon, auto detailing, landscaping) and their business name (e.g., "Premier Plumbing"), acknowledge it immediately.

STAGE 2: THE LIVE ROLEPLAY SIMULATION
- Immediately transition into character:
  "Awesome! Let's do a live simulation right now. Ring ring! Thanks for calling [Business Name], this is your 24/7 AI front desk receptionist. How can I help you today?"
- Act as an elite, knowledgeable front desk specialist for that exact profession:
  * For Plumbing/HVAC/Roofing: Ask about the problem (active leak, AC breakdown, storm damage). Give immediate reassurance.
  * For Auto Detailing/Mechanic: Ask about the vehicle make/model and desired package.
  * For Barbershop/Salon: Ask what service they need and their preferred date.
  * For Legal/Consulting: Inquire about the nature of the consultation.
- Walk through the intake:
  1. Address their service request.
  2. Ask for their name, service location/address, and preferred appointment day and time.
  3. Lock in the booking and explicitly demonstrate the flagship feature:
     "I have you scheduled for [Day/Time]! And I just dispatched an instant SMS confirmation text directly from our Android office phone to your cell phone right now."

STAGE 3: THE CLOSE & REBUTTALS
- Immediately step out of character to debrief:
  "And cut! That is exactly how your callers will experience your business 24/7—even when you're on a job site, with another customer, or after hours. How did that sound to you?"
- Move to close the caller on downloading and activating the app:
  "With Missed Call Auto SMS, you never lose another high-value job to voicemail. Our app turns missed calls into booked revenue automatically using this 24/7 AI Voice Receptionist plus native Android SIM auto-texting. Are you ready to get the app set up for your business today?"
- Be prepared for any rebuttals or questions:
  * Pricing: "Our flagship package is a $49.99 one-time lifetime license for the Android appliance, plus $9.99/mo for the 24/7 AI Voice Receptionist and conversational SMS add-on. That is only $59.98 total today! No $300/month agency markups, and you keep 100% of your customer leads."
  * Hardware & SIM Autopilot: "The app runs natively in the background on your Android phone using your real carrier SIM card. That means SMS texts come from your real phone number—never a flagged 1-800 VoIP number that customers ignore. For calls, you simply dial *71 to forward unanswered calls to the AI assistant."
  * iPhone Users: "While the SMS engine runs on Android to access native SIM hardware, many iPhone owners run it on a low-cost secondary Android phone on Wi-Fi/SIM, or forward calls from their primary iPhone."
  * BYOK Mode: "If you prefer 100% cost control, we support Free Bring-Your-Own-Keys (BYOK) mode—connect your own Vapi and OpenAI keys for $0/mo platform fees."
  * Setup Time: "Takes under 3 minutes: download the APK, activate your key, and flip on the master switch."

STAGE 4: SENDING THE CHECKOUT LINK VIA SMS OR EMAIL
- When the visitor is ready to get the app or asks for the link:
  Ask: "Would you like me to text the checkout link to your cell phone, or email it to you?"
- Once they provide their phone number or email, execute the 'send_checkout_link' tool with their contact details.
- Then reassure them: "I just sent the $59.98 bundle link to your [phone/email]! You'll receive your download link and instant license key as soon as you complete checkout. Go ahead and check your [messages/inbox] now!"

CONVERSATIONAL RULES:
- Keep your answers natural, spoken, and conversational (1 to 2 sentences per response). Do not monologue.
- Sound energetic, confident, and professional.
- Do not use markdown like **bold** or asterisks in spoken responses.`;

const payload = {
  name: "MCAS - Live Demo Agent",
  firstMessage: "Hi there! I'm the Missed Call Auto SMS Demonstration Agent. I'm here to give you a live demonstration of what your AI voice receptionist would sound like if you used our app for your business. To get started, what industry or niche are you in, and what is the name of your business?",
  voicemailMessage: "Hello, this is the Missed Call Auto SMS Demonstration Agent following up. Feel free to visit missedcallautosms.com/voice to test our live interactive demo anytime!",
  endCallMessage: "Thank you for trying Missed Call Auto SMS! Visit missedcallautosms.com to get your 24/7 AI receptionist running today.",
  serverUrl: "https://missedcallautosms.com/.netlify/functions/vapi-webhook",
  model: {
    model: "gpt-4o-mini",
    temperature: 0.3,
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
          description: "Sends the $59.98 bundle checkout link ($49.99 Flagship APK + $9.99/mo Voice Add-on) to the user via SMS text or email.",
          parameters: {
            type: "object",
            properties: {
              contact_type: {
                type: "string",
                enum: ["sms", "email"],
                description: "Whether to send via SMS text message or email."
              },
              recipient: {
                type: "string",
                description: "The customer's phone number (if SMS) or email address (if email)."
              },
              business_name: {
                type: "string",
                description: "The customer's business name."
              },
              industry: {
                type: "string",
                description: "The customer's trade or industry."
              }
            },
            required: ["contact_type", "recipient"]
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
  maxDurationSeconds: 300,
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
  console.log('Connecting to Vapi to find or create the Live Demonstration Agent...');
  const assistants = await vapiRequest('/assistant', 'GET');
  const existing = Array.isArray(assistants) 
    ? assistants.find(a => a.name === "MCAS - Live Demo Agent")
    : null;

  let result;
  if (existing) {
    console.log(`Found existing Demonstration Agent (ID: ${existing.id}). Updating configuration...`);
    result = await vapiRequest(`/assistant/${existing.id}`, 'PATCH', payload);
    console.log('Successfully updated Demonstration Agent!');
  } else {
    console.log('Creating new dedicated Demonstration Agent on Vapi...');
    result = await vapiRequest('/assistant', 'POST', payload);
    console.log('Successfully created dedicated Demonstration Agent!');
  }

  console.log('DEMO_ASSISTANT_ID:', result.id);
  console.log('Name:', result.name);
  return result.id;
}

main().catch(err => {
  console.error('Failed to configure Vapi Demo Agent:', err);
  process.exit(1);
});
