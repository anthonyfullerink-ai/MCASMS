const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

/**
 * Dynamically stamps a bespoke trade tag, headline, and branded badge onto a base 1:1 image
 * Runs locally via ffmpeg in <0.5s, consuming $0.00 and 0 API credits!
 */
function personalizeSocialGraphic({
  baseImageName = 'hvac-speed-to-lead.jpg',
  tradeTag = '💈 BARBERSHOP & SALON SPEED-TO-LEAD',
  quote = 'Mid-fade with shears in hand? You cannot answer the phone.',
  ctaText = 'AUTOMATIC 15-SECOND SMS • NO MONTHLY FEES',
  outputFilename = 'daily_custom_graphic.jpg'
}) {
  const baseDir = path.join(__dirname, '../assets/social');
  const srcPath = path.join(baseDir, baseImageName).replace(/\\/g, '/');
  
  const outDir = path.join(__dirname, '../data/rendered_graphics');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, outputFilename).replace(/\\/g, '/');

  // Escape special ffmpeg drawtext characters
  const cleanTag = tradeTag.replace(/'/g, "\\'").replace(/:/g, '\\:');
  const cleanQuote = quote.replace(/'/g, "\\'").replace(/:/g, '\\:');
  const cleanCta = ctaText.replace(/'/g, "\\'").replace(/:/g, '\\:');

  // Filter chain: Scale/crop to 1080x1080 1:1, add top category pill and bottom glass banner
  const vf = [
    'scale=1080:1080:force_original_aspect_ratio=increase',
    'crop=1080:1080',
    // Top Trade Category Pill
    `drawtext=text='${cleanTag}':fontcolor=0x00E676:fontsize=28:box=1:boxcolor=0x090B0E@0.85:boxborderw=14:x=40:y=40`,
    // Bottom Gradient/Box Banner
    `drawbox=x=0:y=860:w=1080:h=220:color=0x090B0E@0.88:t=fill`,
    // Main Quote / Pain Point Hook
    `drawtext=text='${cleanQuote}':fontcolor=white:fontsize=36:x=40:y=890`,
    // Brand CTA Subtitle
    `drawtext=text='${cleanCta}':fontcolor=0x00E676:fontsize=24:x=40:y=950`,
    `drawtext=text='MissedCallAutoSMS.com':fontcolor=0x8B949E:fontsize=22:x=40:y=990`
  ].join(',');

  const cmd = `"${ffmpeg}" -y -i "${srcPath}" -vf "${vf}" -q:v 2 "${outPath}"`;
  
  try {
    execSync(cmd, { stdio: 'ignore' });
    console.log(`✓ [ImagePersonalizer] Generated custom branded graphic at: ${outPath}`);
    return outPath;
  } catch (e) {
    console.warn(`⚠️ FFmpeg graphic personalization error: ${e.message}. Using raw asset.`);
    return srcPath;
  }
}

module.exports = { personalizeSocialGraphic };

if (require.main === module) {
  const result = personalizeSocialGraphic({
    baseImageName: 'contractor-jobsite.jpg',
    tradeTag: '💈 BARBERSHOPS & SALONS',
    quote: 'Mid-fade with shears in hand? You cannot pick up the phone.',
    ctaText: 'REPLY IN 15 SECONDS ON AUTOPILOT • $49.99 LIFETIME',
    outputFilename: 'test_barber_graphic.jpg'
  });
  console.log('Result file:', result);
}
