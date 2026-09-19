const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

const scenes = [
  {
    id: 1,
    dur: 4.2,
    frames: 126,
    sub: "MISSED CALLS COST YOU THOUSANDS IN LOST JOBS",
    zp: "zoompan=z='min(zoom+0.0006,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=126:s=1920x1080:fps=30"
  },
  {
    id: 2,
    dur: 4.2,
    frames: 126,
    sub: "HOMEOWNERS CALL YOUR COMPETITOR INSTEAD",
    zp: "zoompan=z='min(zoom+0.0005,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=126:s=1920x1080:fps=30"
  },
  {
    id: 3,
    dur: 5.2,
    frames: 156,
    sub: "AUTONOMOUS DEDICATED APPLIANCE • DIRECT SIM",
    zp: "zoompan=z='min(zoom+0.0006,1.09)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=156:s=1920x1080:fps=30"
  },
  {
    id: 4,
    dur: 5.0,
    frames: 150,
    sub: "INSTANT AUTO-TEXT FROM YOUR REAL NUMBER",
    zp: "zoompan=z='min(zoom+0.0005,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=150:s=1920x1080:fps=30"
  },
  {
    id: 5,
    dur: 5.2,
    frames: 156,
    sub: "80%+ RESPONSE RATE • JOBS WON ON AUTOPILOT",
    zp: "zoompan=z='min(zoom+0.0006,1.09)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=156:s=1920x1080:fps=30"
  },
  {
    id: 6,
    dur: 6.2,
    frames: 186,
    sub: null, // Scene 6 is the custom brand CTA card with integrated graphics
    zp: "zoompan=z='min(zoom+0.0004,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=186:s=1920x1080:fps=30"
  }
];

const tempDir = path.join(__dirname, '../temp_ad_build');
fs.mkdirSync(tempDir, { recursive: true });

console.log("=== STEP 1: Rendering 6 Spliced Commercial Scenes ===");
const clipPaths = [];

for (const s of scenes) {
  const imgPath = path.join(__dirname, `../assets/ads/scenes/scene_${s.id}.jpg`).replace(/\\/g, '/');
  const audioPath = path.join(tempDir, `scene_${s.id}/audio.mp3`).replace(/\\/g, '/');
  const clipPath = path.join(tempDir, `clip_${s.id}.mp4`).replace(/\\/g, '/');
  clipPaths.push(clipPath);

  let vf = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,${s.zp}`;
  if (s.sub) {
    vf += `,drawtext=text='${s.sub}':fontcolor=white:fontsize=36:box=1:boxcolor=black@0.75:boxborderw=14:x=(w-text_w)/2:y=h-130`;
  }

  const cmd = `"${ffmpeg}" -y -loop 1 -i "${imgPath}" -i "${audioPath}" -vf "${vf}" -af "apad,atrim=0:${s.dur}" -c:v libx264 -preset fast -pix_fmt yuv420p -t ${s.dur} -c:a aac -b:a 192k "${clipPath}"`;

  console.log(`Rendering Scene ${s.id} (${s.dur}s, ${s.frames} frames)...`);
  const t0 = Date.now();
  execSync(cmd, { stdio: 'inherit' });
  console.log(`✓ Scene ${s.id} completed in ${((Date.now() - t0)/1000).toFixed(1)}s`);
}

console.log("\n=== STEP 2: Concatenating Scenes into Master 30s Video ===");
const concatListPath = path.join(tempDir, 'concat_list.txt');
const concatContent = clipPaths.map(p => `file '${p}'`).join('\n');
fs.writeFileSync(concatListPath, concatContent, 'utf8');

const finalOutputPath = path.join(__dirname, '../assets/ads/missed_call_auto_sms_ad.mp4').replace(/\\/g, '/');

const concatCmd = `"${ffmpeg}" -y -f concat -safe 0 -i "${concatListPath.replace(/\\/g, '/')}" -c copy "${finalOutputPath}"`;
console.log("Stitching scenes...");
execSync(concatCmd, { stdio: 'inherit' });
console.log(`✓ Master commercial generated at: ${finalOutputPath}`);

console.log("\n=== STEP 3: Verifying Video Metadata ===");
try {
  const probe = execSync(`"${ffmpeg}" -i "${finalOutputPath}" 2>&1`).toString();
  const durMatch = probe.match(/Duration: (\d+:\d+:\d+\.\d+)/);
  const streamMatch = probe.match(/Stream #0:0.*: Video: .*, (\d+x\d+)/);
  console.log(`Final Video Duration: ${durMatch ? durMatch[1] : 'Unknown'}`);
  console.log(`Final Video Resolution: ${streamMatch ? streamMatch[1] : 'Unknown'}`);
} catch (e) {
  const probe = e.stdout ? e.stdout.toString() : '';
  const durMatch = probe.match(/Duration: (\d+:\d+:\d+\.\d+)/);
  const streamMatch = probe.match(/Stream #0:0.*: Video: .*, (\d+x\d+)/);
  console.log(`Final Video Duration: ${durMatch ? durMatch[1] : 'Unknown'}`);
  console.log(`Final Video Resolution: ${streamMatch ? streamMatch[1] : 'Unknown'}`);
}

console.log("\n🎬 30-Second Commercial Build Complete!");
