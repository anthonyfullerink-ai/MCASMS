const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

// Load environment variables from .env
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

if (!GEMINI_API_KEY) {
  console.error('❌ Error: GEMINI_API_KEY is not set in environment or .env file.');
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// High-Converting Contractor & Telecom Ad Creative Presets
const PRESETS = {
  'emergency-plumber': {
    type: 'image',
    prompt: 'Professional commercial photography of a determined 38-year-old master plumber in a rugged navy uniform with safety gloves under a residential kitchen sink fixing copper pipes. A modern smartphone is resting securely on a toolbox nearby, its screen clearly displaying an instant green text message: "Hey! Missed your call, under a sink right now - how can I help?". Dramatic warm jobsite lighting, realistic water droplets, cinematic depth of field, 8k resolution, authentic trade photography.',
    aspectRatio: '1:1',
    filename: 'contractor-jobsite-live.jpg'
  },
  'hvac-roof': {
    type: 'image',
    prompt: 'Editorial advertising photograph of an experienced HVAC technician on a sunlit suburban residential rooftop next to a modern AC compressor unit during peak summer. In the technician\'s hand, an Android smartphone shows a notification: "Missed Call Auto-Text Dispatched: $450 AC Service Call Booked". High contrast, vivid blue sky, clean professional aesthetic, cinematic commercial lighting.',
    aspectRatio: '1:1',
    filename: 'hvac-speed-to-lead.jpg'
  },
  'carrier-firewall': {
    type: 'image',
    prompt: 'A bold, high-tech visual graphic contrasting two communications paths. On the left, virtual cloud VoIP and Twilio messages hit a brick wall barrier labeled "A2P 10DLC Carrier Spam Filter - BLOCKED". On the right, a sleek Android phone with a physical SIM card sends a glowing neon green cellular signal straight over cellular towers labeled "100% Cellular SIM Delivery - ZERO Carrier Bans". Dark futuristic background, clean cyber-telecom aesthetic.',
    aspectRatio: '1:1',
    filename: 'carrier-firewall-bypass.jpg'
  },
  'answering-service-invoices': {
    type: 'image',
    prompt: 'A split-screen commercial graphic: On the left, a frustrated contractor\'s desk with a messy stack of expensive monthly paper bills stamped "PAID $500/mo - Live Answering Service". On the right, a clean minimalist desk with a dedicated Android smartphone resting in a glowing neon-green aluminum charging dock labeled "Autonomous SMS Appliance - $0 Monthly Fees Lifetime". Highly professional editorial lighting.',
    aspectRatio: '1:1',
    filename: 'stop-paying-answering-services.jpg'
  },
  'agency-fleet': {
    type: 'image',
    prompt: 'Sleek tech agency command center where a digital marketing agency operator reviews a unified dashboard managing a fleet of 10 Android hardware SMS appliances. Glowing blue and cyan graphs show "100% Missed Calls Recovered" and "$199/mo Retainer per Client". Clean dark mode aesthetic, high-end commercial tech setup.',
    aspectRatio: '1:1',
    filename: 'agency-fleet-management.jpg'
  },
  'veo-contractor-video': {
    type: 'video',
    prompt: 'Cinematic commercial video clip: A busy contractor in work clothes wipes sweat from his brow while driving a work truck, as his smartphone on the dashboard lights up with a missed call. Within seconds, a glowing green notification appears: "Auto-Text Dispatched: Hi! On the road right now, how can I help?". The caller texts back: "Need water heater replacement today!". Smooth camera pan, 4k cinematic lighting.',
    aspectRatio: '16:9',
    filename: 'veo_contractor_speed_ad.mp4'
  },
  'veo-agency-video': {
    type: 'video',
    prompt: 'High-end tech commercial video clip: A sleek smartphone on an office desk receives an incoming call that goes unanswered. A digital wave pulse travels from the phone\'s SIM card directly to a cellular tower with 100% signal strength. Text overlay appears: "100% A2P Exempt. Zero Twilio Fees. One-Time Lifetime License." Professional motion graphics, smooth 4k video.',
    aspectRatio: '16:9',
    filename: 'veo_carrier_appliance_ad.mp4'
  }
};

/**
 * Generate a Bespoke Image using Nano Banana (Imagen 3 / Nano Banana Pro)
 */
async function generateBespokeImage({ prompt, aspectRatio = '1:1', outputPath }) {
  console.log('====================================================');
  console.log('🎨 NANO BANANA / IMAGEN 3 DYNAMIC IMAGE GENERATOR');
  console.log('====================================================');
  console.log(`Prompt: "${prompt}"`);
  console.log(`Aspect Ratio: ${aspectRatio}`);
  console.log(`Target: ${outputPath}`);
  console.log('----------------------------------------------------');

  try {
    const candidateModels = ['imagen-3.0-generate-002', 'imagen-3.0-fast-generate-001'];
    let response = null;
    let usedModel = null;

    for (const model of candidateModels) {
      try {
        console.log(`📡 Requesting image generation from ${model}...`);
        response = await ai.models.generateImages({
          model,
          prompt,
          config: {
            numberOfImages: 1,
            aspectRatio: aspectRatio,
            outputMimeType: 'image/jpeg'
          }
        });
        usedModel = model;
        break;
      } catch (err) {
        console.warn(`⚠️ Model ${model} unavailable: ${err.message}. Trying next candidate...`);
      }
    }

    if (!response || !response.generatedImages || response.generatedImages.length === 0) {
      throw new Error('No images returned by model response.');
    }

    const imageObj = response.generatedImages[0];
    const base64Data = imageObj.image.imageBytes;
    const buffer = Buffer.from(base64Data, 'base64');

    const targetDir = path.dirname(outputPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, buffer);
    console.log(`✔ Success! High-resolution bespoke image saved to: ${outputPath} (via ${usedModel})`);
    return outputPath;
  } catch (error) {
    console.error(`❌ Failed to generate image with Nano Banana: ${error.message}`);
    throw error;
  }
}

/**
 * Generate a 4K / HD Video Ad using Google Veo 3.1
 */
async function generateVeoVideo({ prompt, aspectRatio = '16:9', outputPath }) {
  console.log('====================================================');
  console.log('🎬 GOOGLE VEO 3.1 DYNAMIC VIDEO AD GENERATOR');
  console.log('====================================================');
  console.log(`Prompt: "${prompt}"`);
  console.log(`Aspect Ratio: ${aspectRatio}`);
  console.log(`Target: ${outputPath}`);
  console.log('----------------------------------------------------');

  try {
    console.log('📡 Submitting long-running video request to Veo 3.1 (veo-3.1-fast-generate-preview)...');
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt,
      config: {
        aspectRatio,
        resolution: '720p'
      }
    });

    const startTime = Date.now();
    console.log('⏳ Polling video synthesis progress...');

    while (!operation.done) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      process.stdout.write(`Generating video with Veo 3.1... (${elapsed}s elapsed)\r`);
      await new Promise(r => setTimeout(r, 10000));
      operation = await ai.operations.get({ operation });
    }

    console.log('\n✔ Video rendering completed by Veo 3.1!');

    if (operation.error) {
      throw new Error(`Veo 3.1 Error: ${JSON.stringify(operation.error)}`);
    }

    const generatedVideo = operation.response.generatedVideos[0];
    const videoBytes = await ai.files.download({ file: generatedVideo.video });

    const targetDir = path.dirname(outputPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, Buffer.from(videoBytes));
    console.log(`✔ Success! 4K/HD video ad saved to: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error(`❌ Failed to generate video with Veo 3.1: ${error.message}`);
    throw error;
  }
}

/**
 * Main CLI Handler
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  node scripts/generate_dynamic_ad_creatives.js --preset <preset-name>
  node scripts/generate_dynamic_ad_creatives.js --type <image|video> --prompt "..." --output <path>

Available Presets:
  --preset emergency-plumber        (Image: Master plumber under sink recovering emergency job)
  --preset hvac-roof                (Image: HVAC tech on rooftop with instant text booking)
  --preset carrier-firewall         (Image: A2P 10DLC firewall block vs direct SIM transmission)
  --preset answering-service-invoices (Image: $500/mo invoices vs $0 appliance dock)
  --preset agency-fleet             (Image: Agency command center managing 10 appliances)
  --preset veo-contractor-video     (Video: 30-sec cinematic commercial of contractor lead recovery)
  --preset veo-agency-video         (Video: 30-sec tech commercial of 100% A2P exempt telecom appliance)
    `);
    return;
  }

  let presetName = null;
  let type = 'image';
  let prompt = null;
  let output = null;
  let ratio = '1:1';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--preset' && args[i + 1]) presetName = args[++i];
    if (args[i] === '--type' && args[i + 1]) type = args[++i];
    if (args[i] === '--prompt' && args[i + 1]) prompt = args[++i];
    if (args[i] === '--output' && args[i + 1]) output = args[++i];
    if (args[i] === '--ratio' && args[i + 1]) ratio = args[++i];
  }

  if (presetName) {
    const preset = PRESETS[presetName];
    if (!preset) {
      console.error(`❌ Unknown preset: ${presetName}. Available: ${Object.keys(PRESETS).join(', ')}`);
      process.exit(1);
    }
    type = preset.type;
    prompt = preset.prompt;
    ratio = preset.aspectRatio;
    const destDir = type === 'video' ? 'assets/ads' : 'assets/social';
    output = path.join(__dirname, '..', destDir, preset.filename);
  }

  if (!prompt) {
    console.error('❌ Please specify a prompt via --prompt "..." or a valid --preset.');
    process.exit(1);
  }

  if (!output) {
    output = type === 'video' 
      ? path.join(__dirname, '../assets/ads', `veo_ad_${Date.now()}.mp4`)
      : path.join(__dirname, '../assets/social', `ad_creative_${Date.now()}.jpg`);
  }

  if (type === 'video') {
    await generateVeoVideo({ prompt, aspectRatio: ratio, outputPath: output });
  } else {
    await generateBespokeImage({ prompt, aspectRatio: ratio, outputPath: output });
  }
}

module.exports = {
  generateBespokeImage,
  generateVeoVideo,
  PRESETS
};

if (require.main === module) {
  main().catch(err => {
    console.error('Execution failed:', err);
    process.exit(1);
  });
}
