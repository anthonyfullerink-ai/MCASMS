const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const host1Src = 'C:/Users/AnthonyFuller/.gemini/antigravity/brain/c392b867-9594-446d-960e-5777e6492c52/podcast_host_female_1789784987363.jpg';
const host2Src = 'C:/Users/AnthonyFuller/.gemini/antigravity/brain/c392b867-9594-446d-960e-5777e6492c52/podcast_host_2_1789784453006.jpg';

const dialogue = [
  { speaker: 'host1', name: 'Ava', voice: 'en-US-AvaNeural', text: "Wait, hold on. Have you seen this post on r/Barber? This guy says: 'I am so tired of losing eighty-dollar haircut clients just because my hands are in someone's hair!' Is it really that bad?" },
  { speaker: 'host2', name: 'Brian', voice: 'en-US-BrianNeural', text: "Oh, one hundred percent! Look, when someone needs a cut for a Friday night, they call. You don't pick up? They're not leaving a voicemail, Ava. They literally just tap the next shop on Google." },
  { speaker: 'host1', name: 'Ava', voice: 'en-US-AvaNeural', text: "Right, because nobody waits around. But what's the barber supposed to do? Drop the clippers mid-fade to answer?" },
  { speaker: 'host2', name: 'Brian', voice: 'en-US-BrianNeural', text: "Never! You just let an automated text fire in fifteen seconds: 'Hey, cutting right now, what time do you need today?' That one text stops them from calling anyone else." },
  { speaker: 'host1', name: 'Ava', voice: 'en-US-AvaNeural', text: "Boom. Fifteen seconds and the client is locked in. Drop a comment below—how many bookings do you think you lose to voicemail every week?" }
];

async function generateDialogueAudio(tempDir) {
  console.log('🎙️ Synthesizing NotebookLM-style Ava & Brian conversational dialogue...');
  const audioClips = [];

  for (let i = 0; i < dialogue.length; i++) {
    const item = dialogue[i];
    const tts = new MsEdgeTTS();
    await tts.setMetadata(item.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const lineDir = path.join(tempDir, `line_${i}`);
    fs.mkdirSync(lineDir, { recursive: true });
    
    // Natural human speech rate
    await tts.toFile(lineDir, item.text, { rate: '+4%' });
    audioClips.push(path.join(lineDir, 'audio.mp3').replace(/\\/g, '/'));
    console.log(`✓ Line ${i + 1} synthesized (${item.name}: ${item.voice})`);
  }

  // Concatenate dialogue
  const concatTxt = path.join(tempDir, 'dialogue_concat.txt');
  fs.writeFileSync(concatTxt, audioClips.map(p => `file '${p}'`).join('\n'), 'utf8');

  const masterAudio = path.join(tempDir, 'podcast_dialogue_master.mp3').replace(/\\/g, '/');
  execSync(`"${ffmpeg}" -y -f concat -safe 0 -i "${concatTxt.replace(/\\/g, '/')}" -c copy "${masterAudio}"`, { stdio: 'ignore' });

  // Safely get exact master audio duration
  let probe = '';
  try {
    probe = execSync(`"${ffmpeg}" -i "${masterAudio}" 2>&1`).toString();
  } catch (e) {
    probe = e.stdout ? e.stdout.toString() : '';
  }
  const match = probe.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const totalSecs = match ? (parseFloat(match[1]) * 3600 + parseFloat(match[2]) * 60 + parseFloat(match[3])) : 32.0;
  console.log(`✓ Master conversational dialogue ready: ${totalSecs.toFixed(2)}s`);

  return { masterAudio, totalSecs };
}

async function renderPodcastReel() {
  console.log('====================================================');
  console.log('🎬 RENDERING NOTEBOOKLM-STYLE CO-HOST REEL (9:16)');
  console.log('====================================================');

  const tempDir = path.join(__dirname, '../data/podcast_build');
  fs.mkdirSync(tempDir, { recursive: true });

  const { masterAudio, totalSecs } = await generateDialogueAudio(tempDir);

  const outVideo = path.join(__dirname, '../assets/ads/prototype_podcast_reel_9x16.mp4').replace(/\\/g, '/');

  console.log('🎨 Compiling split-screen 1080x1920 podcast layout with Ava & Brian...');

  const filterGraph = [
    `[0:v]scale=1080:940:force_original_aspect_ratio=increase,crop=1080:940[top]`,
    `[1:v]scale=1080:940:force_original_aspect_ratio=increase,crop=1080:940[bot]`,
    `[top][bot]vstack=inputs=2[vstacked]`,
    `[vstacked]pad=1080:1920:0:20:color=0x090B0E,` +
    // Top Host Tag (Ava)
    `drawtext=text='HOST \\: AVA':fontcolor=0x00E676:fontsize=24:x=40:y=50:box=1:boxcolor=0x090B0E@0.8:boxborderw=10,` +
    // Center Divider Pill: Podcast Title + Reddit Topic
    `drawbox=x=0:y=910:w=1080:h=120:color=0x090B0E@0.96:t=fill,` +
    `drawtext=text='🎙️ TRADE SECRETS PODCAST':fontcolor=0x00E676:fontsize=32:x=(w-text_w)/2:y=925,` +
    `drawtext=text='r/Barber \\: \\"Losing $80 Haircuts to Voicemail\\"':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=970,` +
    // Bottom Host Tag (Brian)
    `drawtext=text='CO-HOST \\: BRIAN':fontcolor=0x00E676:fontsize=24:x=40:y=1050:box=1:boxcolor=0x090B0E@0.8:boxborderw=10,` +
    // Bottom Engagement Callout
    `drawbox=x=40:y=1760:w=1000:h=110:color=0x090B0E@0.92:t=fill,` +
    `drawtext=text='💬 HOW MANY CLIENTS DO YOU LOSE TO VOICEMAIL?':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=1785,` +
    `drawtext=text='Drop your thoughts below 👇':fontcolor=0x00E676:fontsize=22:x=(w-text_w)/2:y=1825[outv]`
  ].join(';');

  const cmd = `"${ffmpeg}" -y -loop 1 -i "${host1Src.replace(/\\/g, '/')}" -loop 1 -i "${host2Src.replace(/\\/g, '/')}" -i "${masterAudio}" -filter_complex "${filterGraph}" -map "[outv]" -map 2:a -c:v libx264 -preset fast -pix_fmt yuv420p -t ${totalSecs.toFixed(2)} -c:a aac -b:a 192k "${outVideo}"`;

  const t0 = Date.now();
  execSync(cmd, { stdio: 'inherit' });
  console.log(`\n🎉 NEW NOTEBOOKLM-STYLE PROTOTYPE COMPLETE!`);
  console.log(`File: ${outVideo}`);
  console.log(`Duration: ${totalSecs.toFixed(1)}s (1080x1920 Vertical 9:16)`);
  console.log(`Render time: ${((Date.now() - t0)/1000).toFixed(1)}s`);

  // Clean up scratch dialogue audio
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
}

renderPodcastReel().catch(console.error);
