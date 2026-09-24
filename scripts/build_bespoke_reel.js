/**
 * build_bespoke_reel.js
 * Generates an automated, 100% unique 9:16 vertical video reel
 * using ffmpeg-static, Edge TTS narration, and dynamic cinematic branding.
 *
 * Enforces Zero Video Reuse by ensuring every post/slot receives
 * its own distinct bespoke MP4 asset.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const VOICES = [
  'en-US-ChristopherNeural',
  'en-US-BrianNeural',
  'en-US-GuyNeural',
  'en-US-EricNeural'
];

function sanitizeForDrawText(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '')
    .replace(/'/g, '')
    .replace(/"/g, '')
    .replace(/%/g, ' percent')
    .replace(/:/g, ' - ')
    .replace(/;/g, ' - ')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function wrapLines(text, maxChars = 32) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';

  for (const w of words) {
    if ((current + ' ' + w).trim().length <= maxChars) {
      current = (current + ' ' + w).trim();
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function buildBespokeReel(options = {}) {
  const {
    id = `reel_${Date.now()}`,
    title = 'Never Lose Another Client to a Missed Call',
    hook = 'When your hands are full on the job, who answers your phone?',
    narrativeBody = 'Most callers hire the first business that responds. Missed Call Auto SMS replies in 15 seconds directly from your real SIM.',
    trade = 'Service Contractor',
    imageAsset = null,
    outputRelativePath = null
  } = options;

  console.log(`\n🎬 [BespokeReel] Rendering unique 9:16 reel for: "${title}" (${trade})`);

  const tempDir = path.join(__dirname, '../temp_reel_build', id);
  fs.mkdirSync(tempDir, { recursive: true });

  const finalRelative = (outputRelativePath || `assets/ads/reels/reel_${id}_9x16.mp4`).replace(/\\/g, '/');
  const finalFullPath = path.join(__dirname, '..', finalRelative);
  fs.mkdirSync(path.dirname(finalFullPath), { recursive: true });

  // 1. Synthesize Voice Audio
  const cleanHook = sanitizeForDrawText(hook);
  const cleanBody = sanitizeForDrawText(narrativeBody).slice(0, 160);
  const script = `${cleanHook}. ${cleanBody}. Never lose another job to voicemail. Try Missed Call Auto SMS free for three days at missed call auto sms dot com.`;

  const tts = new MsEdgeTTS();
  const selectedVoice = VOICES[Math.floor(Math.random() * VOICES.length)];
  await tts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const audioPath = path.join(tempDir, 'audio.mp3').replace(/\\/g, '/');
  await tts.toFile(tempDir, script, { rate: '+4%' });
  console.log(`  🎙️ Narration synthesized with ${selectedVoice}`);

  // Duration probe
  let audioDuration = 12.0;
  try {
    const probe = execSync(`"${ffmpeg}" -i "${audioPath}" 2>&1`).toString();
    const match = probe.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    if (match) {
      audioDuration = parseFloat(match[1]) * 3600 + parseFloat(match[2]) * 60 + parseFloat(match[3]);
    }
  } catch (e) {
    const out = e.stdout ? e.stdout.toString() : '';
    const match = out.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    if (match) audioDuration = parseFloat(match[1]) * 3600 + parseFloat(match[2]) * 60 + parseFloat(match[3]);
  }
  const totalDuration = Math.max(10, Math.ceil(audioDuration + 1.0));
  console.log(`  ⏱️ Duration: ${totalDuration}s`);

  // 2. Select Image
  let bgImage = imageAsset;
  if (!bgImage || !fs.existsSync(path.join(__dirname, '..', bgImage))) {
    const candidates = [
      'assets/social/contractor-speed-rule.jpg',
      'assets/social/bathroom-leak-90s-rule.jpg',
      'assets/social/voicemail-dead-ceiling-leak.jpg',
      'assets/social/contractor-jobsite.jpg',
      'assets/social/hvac-speed-to-lead.jpg',
      'assets/social/answering-service-cost.jpg'
    ];
    for (const c of candidates) {
      if (fs.existsSync(path.join(__dirname, '..', c))) {
        bgImage = c;
        break;
      }
    }
  }
  const fullImgPath = path.join(__dirname, '..', bgImage).replace(/\\/g, '/');

  // 3. Construct Clean 1080x1920 Filters
  const safeTitle = sanitizeForDrawText(title).toUpperCase();
  const safeTrade = sanitizeForDrawText(trade).toUpperCase();
  const hookLines = wrapLines(cleanHook, 30).map(sanitizeForDrawText);

  // Scaled & centered 1080x1080 graphic with top & bottom banners
  const vfList = [
    'scale=1080:1080',
    'pad=1080:1920:0:420:color=0x080B10',
    // Top Hook Banner
    "drawtext=text='MISSED CALL AUTO SMS':fontcolor=0x00E676:fontsize=46:x=(w-text_w)/2:y=180",
    `drawtext=text='${safeTrade}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=250`,
    `drawtext=text='${safeTitle}':fontcolor=0x00E676:fontsize=32:x=(w-text_w)/2:y=320`
  ];

  // Bottom Hook & Call To Action
  let bY = 1530;
  for (let i = 0; i < hookLines.length && i < 2; i++) {
    vfList.push(`drawtext=text='${hookLines[i]}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=${bY + (i * 50)}`);
  }
  vfList.push("drawtext=text='100 PERCENT CARRIER SIM - NO MONTHLY FEES':fontcolor=0x00E676:fontsize=36:x=(w-text_w)/2:y=1660");
  vfList.push("drawtext=text='Start 3-Day Free Trial at MissedCallAutoSMS.com':fontcolor=0x8892B0:fontsize=30:x=(w-text_w)/2:y=1730");

  const vf = vfList.join(',');

  const cmd = `"${ffmpeg}" -y -loop 1 -t ${totalDuration} -i "${fullImgPath}" -i "${audioPath}" -vf "${vf}" -c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "${finalFullPath.replace(/\\/g, '/')}"`;

  console.log(`  ⚙️ Rendering 1080x1920 vertical video reel...`);
  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(`  🎉 SUCCESS: Bespoke 9:16 Reel saved to ${finalRelative}`);
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    console.error(`  ❌ ffmpeg render error:`, stderr.slice(-400));
    throw new Error(`ffmpeg render failed: ${stderr.slice(-200)}`);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
  }

  return {
    relative: finalRelative,
    fullPath: finalFullPath,
    duration: totalDuration
  };
}

module.exports = { buildBespokeReel };

if (require.main === module) {
  buildBespokeReel({
    id: `test_${Date.now()}`,
    title: 'Never Lose Another High-Ticket Job to Voicemail',
    hook: '78 percent of customers book with the first contractor who texts back.',
    narrativeBody: 'Missed Call Auto SMS replies in 15 seconds from your real carrier SIM.',
    trade: 'HVAC and Plumbing'
  }).then(r => console.log('✓ RESULT:', r)).catch(console.error);
}
