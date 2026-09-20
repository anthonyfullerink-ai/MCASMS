const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const path = require('path');

const target = path.join(__dirname, '../assets/ads/v150_ai_voice_launch_reel_9x16.mp4');
try {
  const out = execSync(`"${ffmpeg}" -i "${target}" 2>&1`).toString();
  console.log(out.split('\n').filter(l => l.includes('Duration:') || l.includes('Stream #')).join('\n'));
} catch (e) {
  const out = e.stdout.toString();
  console.log(out.split('\n').filter(l => l.includes('Duration:') || l.includes('Stream #')).join('\n'));
}
