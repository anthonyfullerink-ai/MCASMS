const https = require('https');
const path = require('path');
const fs = require('fs');

let apiKey = process.env.VAPI_API_KEY || process.env.VAPI_PRIVATE_API_KEY || '';
let assistantId = process.env.VAPI_ASSISTANT_ID || '5105b379-8cbf-4037-becc-bba45504f781';

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const keyMatch = envContent.match(/VAPI_PRIVATE_API_KEY=(.*)/);
    const asstMatch = envContent.match(/VAPI_ASSISTANT_ID=(.*)/);
    if (!apiKey && keyMatch && keyMatch[1]) apiKey = keyMatch[1].trim();
    if (asstMatch && asstMatch[1]) assistantId = asstMatch[1].trim();
  } catch (e) {}
}

const systemPrompt = `You are Riley, a friendly, warm, and highly capable 24/7 AI Front Desk Receptionist for our business.

PRIMARY MISSION:
Greet incoming callers warmly, identify what service they need, answer basic questions, collect their details, schedule their service appointment, and reassure them that an authentic text confirmation is being dispatched to their cell phone right now.

VERSATILITY & SERVICE COVERAGE:
1. HOME SERVICES & CONTRACTORS (Primary Focus):
   - HVAC: Furnace/heating failures, AC breakdowns, maintenance tune-ups, seasonal filters.
   - Plumbing: Burst pipes, active water leaks, water heaters, clogged drains, toilet repairs.
   - Electrical: Tripping breakers, power outages, panel upgrades, EV chargers, lighting.
   - General Trades: Roofing, remodeling, appliance repair, handyman, landscaping, emergency dispatch.

2. LOCAL & PERSONAL SERVICES (Full Support):
   - Barbershops & Salons: Haircuts, fades, beard trims, styling, coloring, booking preferred barber/stylist.
   - Pet Grooming & Boarding: Full grooms, baths, nail trims, dog/cat size, breed details.
   - Auto Detailing & Mobile Mechanics: Detail packages, oil changes, brake inspections.
   - Solo Entrepreneurs & Professional Services: Consultations, estimates, customer inquiries.

CONVERSATIONAL RULES & FLOW:
- Keep your spoken answers concise and conversational (1 to 2 sentences per response). Do not monologue or list long paragraphs.
- Triage Urgency: If the caller mentions an active emergency ('water pouring everywhere', 'no heat in freezing weather', 'smell burning/sparks'), treat it as high priority, reassure immediate dispatch, and get their address first.
- Information to Gather:
  1. Caller's Name
  2. Service Address (for mobile trades/contractors) or Pet/Vehicle info (for grooming/auto)
  3. Nature of the problem or service requested
  4. Preferred Day and Time for the appointment
- Confirmation: Always wrap up by confirming: 'I have you scheduled for [Time/Day]. I am sending an instant confirmation text from our office phone directly to your cell phone right now.'
- Tone: Friendly, respectful, calm, helpful, confident, and professional.`;

const payload = JSON.stringify({
  name: "Riley - Universal AI Front Desk",
  firstMessage: "Hi, thank you for calling! This is Riley, the AI front desk assistant for our team. Whether you need emergency dispatch, a service estimate, or want to book an appointment, how can I help you today?",
  voicemailMessage: "Hello, this is Riley from the office. I'm following up regarding your appointment request. Please call us back or check your text messages so we can confirm your time. Have a great day!",
  endCallMessage: "Thank you for calling! Your service details are saved and I just sent a text confirmation to your phone. Have a wonderful day!",
  model: {
    model: "gpt-4o-mini",
    temperature: 0.3,
    provider: "openai",
    messages: [
      {
        role: "system",
        content: systemPrompt
      }
    ]
  },
  voice: {
    version: "2",
    voiceId: "Elliot",
    provider: "vapi"
  },
  maxDurationSeconds: 180,
  silenceTimeoutSeconds: 15
});

const req = https.request({
  hostname: 'api.vapi.ai',
  path: '/assistant/' + assistantId,
  method: 'PATCH',
  headers: {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', async () => {
    console.log('VAPI STATUS:', res.statusCode);
    console.log('RESPONSE:', body);

    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅ Assistant successfully updated in Vapi Cloud.');

      // Update data/voice_settings.json
      try {
        const vSettingsPath = path.join(__dirname, '..', 'data', 'voice_settings.json');
        if (fs.existsSync(vSettingsPath)) {
          const vSet = JSON.parse(fs.readFileSync(vSettingsPath, 'utf8') || '{}');
          vSet.vapiAssistantId = assistantId;
          vSet.customGreeting = "Hi, thank you for calling! This is Riley, the AI front desk assistant for our team. Whether you need emergency dispatch, a service estimate, or want to book an appointment, how can I help you today?";
          vSet.updatedAt = new Date().toISOString();
          fs.writeFileSync(vSettingsPath, JSON.stringify(vSet, null, 2), 'utf8');
          console.log('✅ Updated data/voice_settings.json');
        }
      } catch (e) {
        console.warn('Could not update voice_settings.json:', e.message);
      }

      // Broadcast FCM push to all connected client devices
      try {
        let admin = null;
        try { admin = require('firebase-admin'); } catch (e) {}
        const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

        if (admin && saRaw) {
          if (admin.apps.length === 0) {
            admin.initializeApp({
              credential: admin.credential.cert(JSON.parse(saRaw)),
              projectId: process.env.FIREBASE_PROJECT_ID || 'offgrid-saas-core-1e97a9'
            });
          }

          const messaging = admin.messaging();
          const tokens = new Set();

          // Read local cache
          const cachePath = path.join(__dirname, '..', '.device_tokens_cache.json');
          if (fs.existsSync(cachePath)) {
            try {
              const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8') || '{}');
              for (const k of Object.keys(cache)) {
                if (cache[k]?.fcm_token) tokens.add(cache[k].fcm_token);
              }
            } catch (e) {}
          }

          // Read Firestore tokens
          try {
            const db = admin.firestore();
            const snap = await db.collection('device_tokens').get();
            snap.forEach(d => {
              if (d.data()?.fcm_token) tokens.add(d.data().fcm_token);
            });
          } catch (e) {}

          console.log(`📡 Broadcasting voice_assistant_updated to ${tokens.size} client devices...`);
          for (const token of tokens) {
            try {
              await messaging.send({
                token: token,
                data: {
                  type: 'voice_assistant_updated',
                  assistant_id: assistantId,
                  name: 'Riley - Universal AI Front Desk',
                  system_prompt: systemPrompt,
                  first_message: 'Hi, thank you for calling! This is Riley, the AI front desk assistant for our team. Whether you need emergency dispatch, a service estimate, or want to book an appointment, how can I help you today?',
                  model: 'gpt-4o-mini',
                  temperature: '0.3',
                  voice_provider: 'vapi',
                  voice_id: 'Elliot',
                  timestamp: String(Date.now()),
                  source: 'antigravity_direct_push'
                },
                android: { priority: 'high' }
              });
              console.log(`🚀 [FCM PUSH DELIVERED] to token ${token.slice(0, 15)}...`);
            } catch (err) {
              console.warn(`Failed push to ${token.slice(0, 10)}:`, err.message);
            }
          }
        }
      } catch (fcmErr) {
        console.warn('FCM Broadcast Error:', fcmErr.message);
      }
    }
  });
});

req.on('error', e => console.error('ERR:', e.message));
req.write(payload);
req.end();
