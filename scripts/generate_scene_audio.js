const fs = require('fs');
const path = require('path');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const scenes = [
  {
    id: 1,
    text: "Under a sink or on a ladder? You can't answer the phone.",
    caption: "MISSED CALLS COST YOU $1,200 JOBS"
  },
  {
    id: 2,
    text: "And every missed call is a customer booking with your competitor.",
    caption: "CUSTOMERS DON'T WAIT FOR VOICEMAIL"
  },
  {
    id: 3,
    text: "Meet Missed Call Auto SMS: autonomous hardware powered by your phone's SIM.",
    caption: "AUTONOMOUS HARDWARE APPLIANCE"
  },
  {
    id: 4,
    text: "It texts callers back in seconds from your real number—zero spam blocks.",
    caption: "INSTANT TEXT FROM YOUR REAL NUMBER"
  },
  {
    id: 5,
    text: "Over eighty percent reply immediately, booking jobs on autopilot while you work.",
    caption: "80%+ RESPONSE RATE • JOBS WON FAST"
  },
  {
    id: 6,
    text: "Zero monthly fees. Own it for life. Start free at MissedCallAutoSMS.com.",
    caption: "OWN IT FOR LIFE • MissedCallAutoSMS.com"
  }
];

async function generateAudio() {
  const tts = new MsEdgeTTS();
  await tts.setMetadata('en-US-BrianNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  
  const outDir = path.join(__dirname, '../temp_ad_build');
  fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneDir = path.join(outDir, `scene_${scene.id}`);
    fs.mkdirSync(sceneDir, { recursive: true });
    
    console.log(`Generating audio for scene ${scene.id}...`);
    await tts.toFile(sceneDir, scene.text, { rate: '+10%' });
    console.log(`Scene ${scene.id} audio saved.`);
  }
  console.log("All audio generated successfully!");
}

generateAudio().catch(console.error);
