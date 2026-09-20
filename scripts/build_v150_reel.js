const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const scenes = [
  {
    id: 1,
    imageSource: 'C:/Users/AnthonyFuller/.gemini/antigravity/brain/c392b867-9594-446d-960e-5777e6492c52/reel_v150_scene1_1789869801820.jpg',
    dur: 3.8,
    text: "Hands covered in grease or under a sink? You can't drop your tools to pick up the phone.",
    topBanner: "HANDS FULL ON THE JOBSITE?",
    sub: "YOU CAN'T DROP YOUR TOOLS TO PICK UP"
  },
  {
    id: 2,
    imageSource: 'C:/Users/AnthonyFuller/.gemini/antigravity/brain/c392b867-9594-446d-960e-5777e6492c52/reel_v150_scene2_1789869813495.jpg',
    dur: 4.0,
    text: "And eighty-two percent of homeowners won't leave a voicemail. That missed call just cost you a fifteen-hundred-dollar ticket.",
    topBanner: "82% OF CALLERS HANG UP ON VOICEMAIL",
    sub: "MISSED CALLS = $1,500 LOST JOBS"
  },
  {
    id: 3,
    imageSource: 'C:/Users/AnthonyFuller/.gemini/antigravity/brain/c392b867-9594-446d-960e-5777e6492c52/reel_v150_scene3_1789869826873.jpg',
    dur: 4.2,
    text: "Meet version 1.5.0. Switch your Contractor Status Dial in one tap to 'Hands Full' and copy a custom carrier voicemail script instantly.",
    topBanner: "NEW: CONTRACTOR STATUS DIAL",
    sub: "1-TAP STATUS + VOICEMAIL SCRIPT COPY"
  },
  {
    id: 4,
    imageSource: 'C:/Users/AnthonyFuller/.gemini/antigravity/brain/c392b867-9594-446d-960e-5777e6492c52/reel_v150_scene4_1789869840274.jpg',
    dur: 4.4,
    text: "Or let Riley, your twenty-four-seven AI Voice Assistant, answer live, qualify the job, and text your booking link.",
    topBanner: "24/7 AI VOICE ASSISTANT ADD-ON",
    sub: "RILEY ANSWERS LIVE • BOOKS THE JOB"
  },
  {
    id: 5,
    imageSource: 'C:/Users/AnthonyFuller/.gemini/antigravity/brain/c392b867-9594-446d-960e-5777e6492c52/reel_v150_scene5_1789869855100.jpg',
    dur: 4.0,
    text: "Zero monthly SaaS fees. Physical SIM power. Direct Android APK download at MissedCallAutoSMS.com.",
    topBanner: "DIRECT ANDROID APK DOWNLOAD",
    sub: "PHYSICAL SIM APPLIANCE • OWN IT FOR LIFE"
  }
];

const tempDir = path.join(__dirname, '../temp_v150_reel');
fs.mkdirSync(tempDir, { recursive: true });

async function buildReel() {
  console.log('=== STEP 1: Synthesizing Neural Voiceovers ===');
  const tts = new MsEdgeTTS();
  await tts.setMetadata('en-US-BrianNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  for (const s of scenes) {
    const sceneDir = path.join(tempDir, `scene_${s.id}`);
    fs.mkdirSync(sceneDir, { recursive: true });
    console.log(`Generating audio for scene ${s.id}...`);
    await tts.toFile(sceneDir, s.text, { rate: '+8%' });
    console.log(`Scene ${s.id} audio saved.`);
  }

  console.log('\n=== STEP 2: Rendering 9:16 Vertical Video Clips (1080x1920) ===');
  const clipPaths = [];

  for (const s of scenes) {
    const imgPath = s.imageSource.replace(/\\/g, '/');
    const audioPath = path.join(tempDir, `scene_${s.id}/audio.mp3`).replace(/\\/g, '/');
    const clipPath = path.join(tempDir, `clip_${s.id}.mp4`).replace(/\\/g, '/');
    clipPaths.push(clipPath);

    const frames = Math.round(s.dur * 30);
    // Subtle slow Ken Burns zoom in
    const zp = `zoompan=z='min(zoom+0.0004,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30`;
    
    // Top banner bar and lower subtitle box
    const topBar = `drawbox=x=0:y=180:w=1080:h=90:color=0x00E676@0.95:t=fill,drawtext=text='${s.topBanner}':fontcolor=0x090B0E:fontsize=38:x=(w-text_w)/2:y=206`;
    const bottomBar = `drawbox=x=40:y=1680:w=1000:h=90:color=0x090B0E@0.85:t=fill,drawbox=x=40:y=1680:w=1000:h=90:color=0x00E676@0.9:t=4,drawtext=text='${s.sub}':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1710`;

    const vf = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${zp},${topBar},${bottomBar}`;

    const cmd = `"${ffmpeg}" -y -loop 1 -i "${imgPath}" -i "${audioPath}" -vf "${vf}" -af "apad,atrim=0:${s.dur}" -c:v libx264 -preset fast -pix_fmt yuv420p -t ${s.dur} -c:a aac -b:a 192k "${clipPath}"`;

    console.log(`Rendering Scene ${s.id} (${s.dur}s, ${frames} frames)...`);
    const t0 = Date.now();
    execSync(cmd, { stdio: 'inherit' });
    console.log(`✓ Scene ${s.id} completed in ${((Date.now() - t0)/1000).toFixed(1)}s`);
  }

  console.log('\n=== STEP 3: Concatenating Scenes into Master Vertical Reel ===');
  const concatListPath = path.join(tempDir, 'concat_list.txt');
  const concatContent = clipPaths.map(p => `file '${p}'`).join('\n');
  fs.writeFileSync(concatListPath, concatContent, 'utf8');

  const finalOutputPath = path.join(__dirname, '../assets/ads/v150_ai_voice_launch_reel_9x16.mp4').replace(/\\/g, '/');
  const concatCmd = `"${ffmpeg}" -y -f concat -safe 0 -i "${concatListPath.replace(/\\/g, '/')}" -c copy "${finalOutputPath}"`;

  console.log('Stitching master 9:16 vertical commercial...');
  execSync(concatCmd, { stdio: 'inherit' });
  console.log(`🎉 Master commercial generated at: ${finalOutputPath}`);

  const probe = execSync(`"${ffmpeg}" -i "${finalOutputPath}" 2>&1`).toString();
  const durMatch = probe.match(/Duration: (\d+:\d+:\d+\.\d+)/);
  const streamMatch = probe.match(/Stream #0:0.*: Video: .*, (\d+x\d+)/);
  console.log(`Final Video Duration: ${durMatch ? durMatch[1] : 'Unknown'}`);
  console.log(`Final Video Resolution: ${streamMatch ? streamMatch[1] : 'Unknown'}`);
}

buildReel().catch(err => {
  console.error('Reel generation error:', err);
  process.exit(1);
});
