const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// Living B-Roll footage: Detailer actively pressure-washing car, blasting foam/water clean off
const brollVideo = path.join(__dirname, '../assets/broll/wash_49197.mp4').replace(/\\/g, '/');

const voiceoverScript = "This post on r/sweatystartup blew up this week. A mobile detailer wrote: 'I lost a twenty-four hundred dollar fleet contract because I was running my pressure washer and couldn't answer the phone.' The top comment was brutal, but one hundred percent accurate: 'Clients don't care how hard you're working. They only care if you answer.' In service businesses, over seventy-eight percent of jobs go to whoever responds first. If your hands are full, you don't need to drop your tools—you just need a system that texts them back within fifteen seconds. Drop a comment below: What's the most expensive job you've ever missed?";

async function generateVoiceover(tempDir) {
  console.log('🎙️ Synthesizing documentary-style voiceover with BrianNeural...');
  const tts = new MsEdgeTTS();
  await tts.setMetadata('en-US-BrianNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  
  const audioDir = path.join(tempDir, 'audio_out');
  fs.mkdirSync(audioDir, { recursive: true });
  await tts.toFile(audioDir, voiceoverScript, { rate: '+3%' });

  const audioPath = path.join(audioDir, 'audio.mp3').replace(/\\/g, '/');

  let probe = '';
  try {
    probe = execSync(`"${ffmpeg}" -i "${audioPath}" 2>&1`).toString();
  } catch (e) {
    probe = e.stdout ? e.stdout.toString() : '';
  }
  const match = probe.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const totalSecs = match ? (parseFloat(match[1]) * 3600 + parseFloat(match[2]) * 60 + parseFloat(match[3])) : 36.0;
  console.log(`✓ Voiceover duration: ${totalSecs.toFixed(2)}s`);

  return { audioPath, totalSecs };
}

async function renderRedditBreakdownReel() {
  console.log('=====================================================================');
  console.log('🎬 BUILDING LIVE-ACTION MOVING VIDEO REDDIT REEL (9:16 VERTICAL)');
  console.log('=====================================================================');

  const tempDir = path.join(__dirname, '../data/reddit_breakdown_build');
  fs.mkdirSync(tempDir, { recursive: true });

  const { audioPath, totalSecs } = await generateVoiceover(tempDir);
  const totalFrames = Math.ceil(totalSecs * 30);

  const outVideo = path.join(__dirname, '../assets/ads/prototype_reddit_breakdown_reel_9x16.mp4').replace(/\\/g, '/');

  console.log('🎨 Applying live water-wash motion, noticeable continuous slow zoom, and ultra-legible UI...');

  const fontBold = 'C\\\\:/Windows/Fonts/arialbd.ttf';
  const fontReg = 'C\\\\:/Windows/Fonts/arial.ttf';

  // 1. Live video speed adjustment to match audio duration in satisfying slow-mo
  // 2. High-precision 5K Lanczos upscale to completely eliminate subpixel jitter
  // 3. Noticeable continuous zoom-in: W starts at 1500 and smoothly pushes in to 1080 (approx 28% noticeable zoom)
  // 4. Subtle camera tilt down to track the water stream rinsing the car hood
  // 5. Crisp, high-contrast Obsidian Reddit cards with native font rendering
  const filterGraph = [
    `setpts=1.253*PTS`,
    `scale=5120:2880:flags=lanczos`,
    `crop=w='1500-(n*0.388)':h='(1500-(n*0.388))*16/9':x='(5120-(1500-(n*0.388)))/2':y='(2880-((1500-(n*0.388))*16/9))/2 + (n*0.32)'`,
    `scale=1080:1920:flags=lanczos`,
    `eq=brightness=-0.08:contrast=1.12:saturation=1.15`,
    `drawbox=x=0:y=0:w=1080:h=1920:color=0x000000@0.30:t=fill`,

    // --- CARD 1: Ultra-Legible Deep Obsidian Reddit Post Card ---
    // Outer shadow/border glow
    `drawbox=x=36:y=76:w=1008:h=288:color=0x00E676@0.35:t=fill`,
    // Card Body (Solid Obsidian 98% opacity)
    `drawbox=x=40:y=80:w=1000:h=280:color=0x080B10@0.98:t=fill`,
    // Header
    `drawtext=fontfile='${fontReg}':text='r/sweatystartup  |  Posted by u/DetailBoss (2d ago)':fontcolor=0xA0AAB4:fontsize=24:x=70:y=112`,
    // Title Line 1
    `drawtext=fontfile='${fontBold}':text='\\"Lost a $2,400 fleet contract because':fontcolor=white:fontsize=38:x=70:y=164`,
    // Title Line 2
    `drawtext=fontfile='${fontBold}':text='my pressure washer was running...\\"':fontcolor=white:fontsize=38:x=70:y=218`,
    // Upvotes / Comments footer
    `drawtext=fontfile='${fontBold}':text='482 Upvotes  |  129 Comments':fontcolor=0x00E676:fontsize=24:x=70:y=292`,

    // --- CARD 2: High-Contrast Top Comment Card ---
    // Outer subtle border
    `drawbox=x=36:y=396:w=1008:h=238:color=0xFFB300@0.35:t=fill`,
    // Card Body (Deep Charcoal 98% opacity)
    `drawbox=x=40:y=400:w=1000:h=230:color=0x111620@0.98:t=fill`,
    // Comment Header
    `drawtext=fontfile='${fontBold}':text='TOP COMMENT  |  u/ServicePro_Dave':fontcolor=0xFFB300:fontsize=24:x=70:y=432`,
    // Comment Line 1
    `drawtext=fontfile='${fontBold}':text='\\"Clients do not care how hard you work.':fontcolor=white:fontsize=36:x=70:y=484`,
    // Comment Line 2 (Highlighted)
    `drawtext=fontfile='${fontBold}':text='They only care if you answer.\\"':fontcolor=0x00E676:fontsize=36:x=70:y=538`,

    // --- BOTTOM ENGAGEMENT CALLOUT ---
    `drawbox=x=36:y=1726:w=1008:h=138:color=0x00E676@0.4:t=fill`,
    `drawbox=x=40:y=1730:w=1000:h=130:color=0x080B10@0.96:t=fill`,
    `drawtext=fontfile='${fontBold}':text='WHAT IS THE BIGGEST JOB YOU HAVE EVER MISSED?':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=1760`,
    `drawtext=fontfile='${fontBold}':text='Share your story in the comments below':fontcolor=0x00E676:fontsize=24:x=(w-text_w)/2:y=1810`
  ].join(',');

  const cmd = `"${ffmpeg}" -y -i "${brollVideo}" -i "${audioPath}" -vf "${filterGraph}" -r 30 -c:v libx264 -preset fast -pix_fmt yuv420p -t ${totalSecs.toFixed(2)} -c:a aac -b:a 192k "${outVideo}"`;

  const t0 = Date.now();
  execSync(cmd, { stdio: 'inherit' });

  console.log(`\n🎉 LIVE-ACTION REDDIT BREAKDOWN REEL COMPLETE!`);
  console.log(`File: ${outVideo}`);
  console.log(`Duration: ${totalSecs.toFixed(1)}s (1080x1920 Vertical 9:16)`);
  console.log(`Render time: ${((Date.now() - t0)/1000).toFixed(1)}s`);

  // Clean up scratch audio
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
}

renderRedditBreakdownReel().catch(console.error);
