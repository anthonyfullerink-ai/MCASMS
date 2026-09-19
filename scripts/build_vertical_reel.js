const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const path = require('path');

const inputVideo = path.join(__dirname, '../assets/ads/missed_call_auto_sms_ad.mp4').replace(/\\/g, '/');
const outputVideo = path.join(__dirname, '../assets/ads/missed_call_auto_sms_reel_9x16.mp4').replace(/\\/g, '/');

console.log('Rendering 9:16 Vertical Reel & Story Commercial (1080x1920)...');

// Filter: scale input to 1080 wide, center vertically on 1080x1920 canvas, add top and bottom branded banners
const vf = [
  'scale=1080:608',
  'pad=1080:1920:0:656:color=0x090B0E',
  // Top Hook Banner
  "drawtext=text='NEVER LOSE ANOTHER $1,200 JOB':fontcolor=0x00E676:fontsize=48:x=(w-text_w)/2:y=380",
  "drawtext=text='HOMEOWNERS DO NOT WAIT FOR VOICEMAIL':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=450",
  // Bottom Call-to-Action Banner
  "drawtext=text='AUTONOMOUS HARDWARE APPLIANCE':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=1340",
  "drawtext=text='NO MONTHLY SUBSCRIPTIONS':fontcolor=0x00E676:fontsize=44:x=(w-text_w)/2:y=1400",
  "drawtext=text='Start 3-Day Free Trial at MissedCallAutoSMS.com':fontcolor=0x8B949E:fontsize=32:x=(w-text_w)/2:y=1470"
].join(',');

const cmd = `"${ffmpeg}" -y -i "${inputVideo}" -vf "${vf}" -c:v libx264 -preset fast -pix_fmt yuv420p -c:a copy "${outputVideo}"`;

const t0 = Date.now();
try {
  execSync(cmd, { stdio: 'inherit' });
  console.log(`✓ 9:16 Vertical Reel successfully generated at: ${outputVideo}`);
  console.log(`Render time: ${((Date.now() - t0)/1000).toFixed(1)}s`);
} catch (e) {
  console.error('Error creating vertical reel:', e);
}
