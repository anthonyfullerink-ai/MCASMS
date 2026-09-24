const fs = require('fs');
const path = require('path');
const https = require('https');
const { generateDailyContentBundle } = require('./generate_daily_content');
const { isVideoAlreadyUsed, isImageAlreadyUsed, cleanBasename, assertUniqueMedia } = require('./media_guard');
const { buildBespokeReel } = require('./build_bespoke_reel');

// Load environment variables safely
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

const TOKEN = process.env.META_PAGE_ACCESS_TOKEN || '';
const FB_PAGE_ID = (process.env.FB_PAGE_ID && process.env.FB_PAGE_ID !== 'true' && process.env.FB_PAGE_ID !== 'false')
  ? process.env.FB_PAGE_ID
  : '1248332278370968';
const IG_USER_ID = (process.env.IG_USER_ID && process.env.IG_USER_ID !== 'true' && process.env.IG_USER_ID !== 'false')
  ? process.env.IG_USER_ID
  : '17841428781387416';

const VERIFIED_GITHUB_SOCIAL_IMAGES = [
  'contractor-jobsite.jpg',
  'contractor-speed-rule.jpg',
  'hvac-speed-to-lead.jpg',
  'appliance-vs-saas.jpg',
  'carrier-spam-filter-bypass.jpg',
  'answering-service-cost.jpg',
  'speed-to-lead.jpg',
  'v1-5-0-ai-voice-assistant-launch.jpg',
  'pro-automation-launch.jpg',
  'ghl-vs-appliance-ad.jpg'
];

function recordSlotExecution(slot, data) {
  try {
    const histPath = path.join(__dirname, '../data/social_publish_history.json');
    let hist = {};
    if (fs.existsSync(histPath)) {
      try { hist = JSON.parse(fs.readFileSync(histPath, 'utf8')); } catch (e) {}
    }
    const today = new Date().toISOString().split('T')[0];
    if (!hist[today]) hist[today] = {};
    hist[today][slot] = {
      timestamp: new Date().toISOString(),
      ...data
    };
    fs.mkdirSync(path.dirname(histPath), { recursive: true });
    fs.writeFileSync(histPath, JSON.stringify(hist, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to record slot execution history:', e.message);
  }
}

function postGraphApi(endpoint, postData) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(postData);
    const options = {
      hostname: 'graph.facebook.com',
      port: 443,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ` + (json.error ? json.error.message : body)));
          }
        } catch (e) {
          reject(new Error(`Parse error (${res.statusCode}): ` + body));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function getGraphApi(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'graph.facebook.com',
      port: 443,
      path: endpoint,
      method: 'GET'
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ` + (json.error ? json.error.message : body)));
          }
        } catch (e) {
          reject(new Error(`Parse error (${res.statusCode}): ` + body));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Pre-flight Meta Token Health Guard
 * Checks if the page access token is alive and has proper permissions before upload
 */
async function checkMetaTokenHealth() {
  if (!TOKEN) {
    console.warn('⚠️ [TokenGuard] META_PAGE_ACCESS_TOKEN is not defined in .env.');
    return false;
  }
  try {
    const res = await getGraphApi(`/v20.0/me?access_token=${TOKEN}`);
    console.log(`🔒 [TokenGuard] Verified Meta Access Token for Account: ${res.name || res.id} (Status: OK)`);
    return true;
  } catch (e) {
    console.warn(`⚠️ [TokenGuard] Meta Token Verification Warning: ${e.message}`);
    return false;
  }
}

function formatInlineMarkdown(str) {
  return str
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function markdownToHtml(markdown) {
  if (!markdown) return '';
  const text = markdown.replace(/\r\n/g, '\n').trim();
  const blocks = text.split(/\n{2,}/);

  const htmlBlocks = blocks.map(block => {
    block = block.trim();
    if (!block) return '';

    if (block.startsWith('#### ')) {
      return `<h4>${formatInlineMarkdown(block.slice(5))}</h4>`;
    }
    if (block.startsWith('### ')) {
      return `<h3>${formatInlineMarkdown(block.slice(4))}</h3>`;
    }
    if (block.startsWith('## ')) {
      return `<h2>${formatInlineMarkdown(block.slice(3))}</h2>`;
    }
    if (block.startsWith('# ')) {
      return `<h1>${formatInlineMarkdown(block.slice(2))}</h1>`;
    }

    if (block.startsWith('>')) {
      const quoteText = block.split('\n').map(l => l.replace(/^>\s?/, '').trim()).join(' ');
      return `<blockquote>${formatInlineMarkdown(quoteText)}</blockquote>`;
    }

    if (/^\d+\.\s+/.test(block)) {
      const items = block.split('\n').map(l => l.replace(/^\d+\.\s+/, '').trim()).filter(Boolean);
      return `<ol>\n${items.map(it => `  <li>${formatInlineMarkdown(it)}</li>`).join('\n')}\n</ol>`;
    }

    if (/^[-*]\s+/.test(block)) {
      const items = block.split('\n').map(l => l.replace(/^[-*]\s+/, '').trim()).filter(Boolean);
      return `<ul>\n${items.map(it => `  <li>${formatInlineMarkdown(it)}</li>`).join('\n')}\n</ul>`;
    }

    return `<p>${formatInlineMarkdown(block.replace(/\n/g, ' '))}</p>`;
  });

  return htmlBlocks.filter(Boolean).join('\n\n');
}

// 1. Morning Slot: Publish Blog to Website
async function publishMorningBlog(bundle, isDryRun) {
  console.log('\n====================================================');
  console.log('🌅 [MORNING SLOT: 8:00 AM] PUBLISHING DAILY BLOG');
  console.log('====================================================');
  console.log(`Trade: [${bundle.trade || 'All Trades'}]`);
  console.log(`Title: "${bundle.blog.title}"`);
  console.log(`Pillar: [${bundle.contentType}] ${bundle.pillar}`);

  if (isDryRun) {
    console.log('✔ [DRY RUN] Blog files would be updated in blog/posts.json and sitemap.xml');
    return { status: 'dry_run_success' };
  }

  const postsJsonPath = path.join(__dirname, '../blog/posts.json');
  const templatePath = path.join(__dirname, '../blog/template.html');
  const sitemapPath = path.join(__dirname, '../sitemap.xml');

  let posts = [];
  if (fs.existsSync(postsJsonPath)) {
    try { posts = JSON.parse(fs.readFileSync(postsJsonPath, 'utf8')); } catch (e) {}
  }

  const slug = bundle.blog.slug;
  const dateStr = bundle.date || new Date().toISOString().split('T')[0];
  const isoDate = bundle.blog.isoDate || `${dateStr}T08:00:00.000Z`;
  const readTimeStr = typeof bundle.blog.readTime === 'number'
    ? `${bundle.blog.readTime} min read`
    : (bundle.blog.readTime || '4 min read').includes('min')
      ? bundle.blog.readTime
      : `${bundle.blog.readTime} min read`;
  const tags = bundle.blog.tags || [bundle.trade || 'Field Services', 'Speed-to-Lead', 'Contractor ROI', 'No Monthly Fees'];
  const tagsStr = Array.isArray(tags) ? tags.join(', ') : tags;

  const defaultTakeaways = [
    `When hands are occupied on jobsites or with clients, picking up the phone is physically impossible.`,
    `Over 78% of customers hire or book with the first business that responds; missed calls default to competitors.`,
    `Direct-SIM auto-replies operate 100% compliant through your physical phone carrier, immune to A2P 10DLC spam filters.`,
    `One-time lifetime appliance model saves over $3,500/year compared to recurring SaaS or answering service fees.`
  ];
  const takeaways = (bundle.blog.takeaways && bundle.blog.takeaways.length) ? bundle.blog.takeaways : defaultTakeaways;
  const takeawaysHtml = takeaways.map(t => `<li>${t}</li>`).join('\n');

  const contentHtml = bundle.blog.contentHtml || markdownToHtml(bundle.blog.contentMarkdown);

  // ─── ZERO IMAGE REUSE SAFEGUARD ───
  let targetImageUrl = bundle.blog.imageUrl || bundle.blog.image;
  if (!targetImageUrl && bundle.feedPost && bundle.feedPost.imageAsset) {
    targetImageUrl = `https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/social/generated/${bundle.feedPost.imageAsset}`;
  }

  if (!targetImageUrl) {
    throw new Error(`[ZeroReuseGuard] Cannot publish blog post "${bundle.blog.title}". No bespoke image URL provided. Automatic fallback to generic recycled images is strictly prohibited.`);
  }

  const targetBase = path.basename(targetImageUrl).toLowerCase();
  const isDuplicate = posts.some(p => p.slug !== slug && path.basename(p.imageUrl || p.image || '').toLowerCase() === targetBase);
  if (isDuplicate) {
    throw new Error(`[ZeroReuseGuard] Image "${targetBase}" is already in use by another article in blog/posts.json! Every post must have a 100% unique bespoke visual.`);
  }

  const newPostEntry = {
    slug: slug,
    title: bundle.blog.title,
    category: bundle.blog.category || 'Speed-to-Lead',
    date: dateStr,
    isoDate: isoDate,
    readTime: readTimeStr,
    tags: tags,
    excerpt: bundle.blog.excerpt,
    metaDescription: bundle.blog.excerpt,
    imageUrl: targetImageUrl
  };

  const existingIdx = posts.findIndex(p => p.slug === slug);
  if (existingIdx >= 0) {
    posts[existingIdx] = newPostEntry;
    console.log(`✔ Updated existing blog post entry in posts.json: ${slug}`);
  } else {
    posts.unshift(newPostEntry);
    console.log(`✔ Added new blog post entry to posts.json: ${slug}`);
  }
  fs.writeFileSync(postsJsonPath, JSON.stringify(posts, null, 2), 'utf8');

  // Render HTML page
  if (fs.existsSync(templatePath)) {
    const template = fs.readFileSync(templatePath, 'utf8');
    const rendered = template
      .replace(/\{\{TITLE\}\}/g, bundle.blog.title)
      .replace(/\{\{DESCRIPTION\}\}/g, bundle.blog.excerpt || bundle.blog.title)
      .replace(/\{\{SLUG\}\}/g, slug)
      .replace(/\{\{ISO_DATE\}\}/g, isoDate)
      .replace(/\{\{CATEGORY\}\}/g, bundle.blog.category || 'Speed-to-Lead')
      .replace(/\{\{DATE\}\}/g, dateStr)
      .replace(/\{\{READ_TIME\}\}/g, readTimeStr)
      .replace(/\{\{TAGS\}\}/g, tagsStr)
      .replace(/\{\{IMAGE_URL\}\}/g, newPostEntry.imageUrl)
      .replace(/\{\{TAKEAWAYS_HTML\}\}/g, takeawaysHtml)
      .replace(/\{\{CONTENT_HTML\}\}/g, contentHtml);

    const outPostPath = path.join(__dirname, `../blog/posts/${slug}.html`);
    fs.mkdirSync(path.dirname(outPostPath), { recursive: true });
    fs.writeFileSync(outPostPath, rendered, 'utf8');
    console.log(`✔ Generated static article page: blog/posts/${slug}.html`);
  }

  // Update sitemap.xml
  let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://missedcallautosms.com/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>https://missedcallautosms.com/blog</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;

  posts.forEach(p => {
    sitemapXml += `  <url>\n    <loc>https://missedcallautosms.com/blog/${p.slug}</loc>\n    <lastmod>${(p.isoDate || p.date || new Date().toISOString()).split('T')[0]}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
  });

  sitemapXml += `</urlset>\n`;
  fs.writeFileSync(sitemapPath, sitemapXml, 'utf8');
  console.log(`✔ Updated sitemap.xml with ${posts.length + 2} URLs`);

  // Cross-post the new blog article to FB + IG immediately after publishing
  if (!isDryRun) {
    try {
      console.log('\n📣 Cross-posting morning blog to social media...');
      const { publishToSocial } = require('./publish_social_blog');
      await publishToSocial(newPostEntry);
    } catch (socialErr) {
      console.error('⚠️  Social cross-post error (non-fatal):', socialErr.message);
    }
  }

  return { status: 'published', slug };
}

// 2. Lunch Slot: Publish 1:1 Feed Post (FB & IG)
async function publishLunchFeedPost(bundle, isDryRun) {
  console.log('\n====================================================');
  console.log('☀️ [LUNCH SLOT: 12:30 PM] PUBLISHING 1:1 FEED POST');
  console.log('====================================================');
  console.log(`Trade Focus: ${bundle.trade}`);
  console.log(`Headline: ${bundle.feedPost.headline}`);
  console.log(`Asset: ${bundle.feedPost.imageAsset} (${bundle.feedPost.aspectRatio})`);

  // Resolve public image URL dynamically
  const assetName = bundle.feedPost.imageAsset ? path.basename(bundle.feedPost.imageAsset) : 'contractor-jobsite.jpg';
  const imageUrl = `https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/social/${assetName}`;

  if (isDryRun) {
    console.log('✔ [DRY RUN] Facebook Feed Post simulated with payload:');
    console.log(`   Message preview: ${bundle.feedPost.copyFacebook.slice(0, 100)}...`);
    console.log('✔ [DRY RUN] Instagram Feed Post simulated with image container:');
    console.log(`   Image URL: ${imageUrl}`);
    return { fb: 'dry_run', ig: 'dry_run' };
  }

  let fbResult = null;
  let igResult = null;

  // A. Facebook Page Feed
  try {
    console.log('🔵 Posting to Facebook Page Feed...');
    fbResult = await postGraphApi(`/v20.0/${FB_PAGE_ID}/photos`, {
      url: imageUrl,
      caption: bundle.feedPost.copyFacebook,
      access_token: TOKEN
    });
    console.log(`🎉 SUCCESS: Facebook Feed Post is LIVE! (ID: ${fbResult.id})`);
  } catch (e) {
    console.error(`❌ Facebook Feed Post Error:`, e.message);
  }

  // B. Instagram Feed
  try {
    console.log('🟣 Posting to Instagram Feed (1:1)...');
    const container = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
      image_url: imageUrl,
      caption: bundle.feedPost.copyInstagram,
      access_token: TOKEN
    });
    console.log(`✔ IG Container created (ID: ${container.id}). Waiting 3s...`);
    await new Promise(r => setTimeout(r, 3000));

    igResult = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
      creation_id: container.id,
      access_token: TOKEN
    });
    console.log(`🎉 SUCCESS: Instagram Feed Post is LIVE! (ID: ${igResult.id})`);
  } catch (e) {
    console.error(`❌ Instagram Feed Post Error:`, e.message);
  }

  return { fbResult, igResult };
}

// 3. Evening Slot: Publish 9:16 Vertical Reel & Story (FB & IG)
async function publishEveningReelAndStory(bundle, isDryRun) {
  console.log('\n====================================================');
  console.log('🌙 [EVENING SLOT: 5:30 PM] PUBLISHING 9:16 REEL & STORY');
  console.log('====================================================');
  console.log(`Trade Focus: ${bundle.trade}`);
  console.log(`Video Asset: ${bundle.reelStory.videoAsset} (${bundle.reelStory.aspectRatio})`);

  // ZERO-VIDEO-REUSE HARDCODED ENFORCEMENT
  let localVideoPath = path.join(__dirname, '..', bundle.reelStory.videoAsset || '');
  if (!bundle.reelStory.videoAsset || isVideoAlreadyUsed(bundle.reelStory.videoAsset) || !fs.existsSync(localVideoPath)) {
    console.log(`⚠️ [ZeroVideoReuseGuard] Video "${cleanBasename(bundle.reelStory.videoAsset)}" was previously used or is missing. Auto-generating bespoke unique 9:16 reel for ${bundle.trade}...`);
    const dateTag = new Date().toISOString().split('T')[0];
    const tradeSlug = bundle.trade.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const bespoke = await buildBespokeReel({
      id: `${tradeSlug}_${dateTag}_${Date.now()}`,
      title: bundle.feedPost?.headline || `Never Lose Another ${bundle.trade} Client`,
      hook: bundle.reelStory.hook,
      narrativeBody: bundle.reelStory.captionFacebook,
      trade: bundle.trade,
      imageAsset: bundle.reelStory.coverAsset
    });
    bundle.reelStory.videoAsset = bespoke.relative;
  }

  if (isVideoAlreadyUsed(bundle.reelStory.videoAsset)) {
    throw new Error(`[ZeroVideoReuseGuard] HARD BLOCK: Video "${cleanBasename(bundle.reelStory.videoAsset)}" has already been published. Aborting to protect media uniqueness mandate.`);
  }

  const videoUrl = bundle.reelStory.videoAsset.startsWith('http')
    ? bundle.reelStory.videoAsset
    : `https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/${bundle.reelStory.videoAsset}`;
  const coverUrl = bundle.reelStory.coverAsset.startsWith('http')
    ? bundle.reelStory.coverAsset
    : `https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/${bundle.reelStory.coverAsset}`;

  if (isDryRun) {
    console.log('✔ [DRY RUN] Instagram Reel simulated with 9:16 vertical video');
    console.log('✔ [DRY RUN] Instagram Story simulated with 9:16 container');
    console.log('✔ [DRY RUN] Facebook Video / Reel simulated');
    return { reel: 'dry_run', story: 'dry_run', fb: 'dry_run' };
  }

  let reelResult = null;
  let storyResult = null;
  let fbResult = null;

  // A. Facebook Page Video / Reel
  try {
    console.log('🔵 Posting Reel to Facebook Page...');
    fbResult = await postGraphApi(`/v20.0/${FB_PAGE_ID}/videos`, {
      file_url: videoUrl,
      title: `Hands-Busy Trade Solution: Missed Call Auto SMS`,
      description: bundle.reelStory.captionFacebook,
      access_token: TOKEN
    });
    console.log(`🎉 SUCCESS: Facebook Reel is LIVE! (ID: ${fbResult.id})`);
  } catch (e) {
    console.error(`❌ Facebook Reel Error:`, e.message);
  }

  // B. Instagram Reel with Adaptive Backoff Polling
  try {
    console.log('🟣 Creating Instagram Reel container (9:16)...');
    const container = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
      media_type: 'REELS',
      video_url: videoUrl,
      cover_url: coverUrl,
      caption: bundle.reelStory.captionInstagram,
      share_to_feed: true,
      access_token: TOKEN
    });

    console.log(`✔ Reel container created (ID: ${container.id}). Polling processing status with adaptive backoff...`);
    let isReady = false;
    const delays = [4000, 6000, 8000, 10000, 15000, 20000]; // Adaptive backoff intervals
    
    for (let i = 0; i < delays.length; i++) {
      await new Promise(r => setTimeout(r, delays[i]));
      const statusRes = await getGraphApi(`/v20.0/${container.id}?fields=status_code,status&access_token=${TOKEN}`);
      console.log(`Polling status (attempt ${i + 1}/${delays.length}): ${statusRes.status_code || statusRes.status}`);

      if (statusRes.status_code === 'FINISHED') {
        isReady = true;
        break;
      } else if (statusRes.status_code === 'ERROR') {
        throw new Error('Reel video encoding failed in Meta cloud');
      }
    }

    if (isReady) {
      reelResult = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
        creation_id: container.id,
        access_token: TOKEN
      });
      console.log(`🎉 SUCCESS: Instagram Reel is LIVE! (ID: ${reelResult.id})`);
    } else {
      console.warn('⚠️ Timed out waiting for Instagram Reel encoding.');
    }
  } catch (e) {
    console.error(`❌ Instagram Reel Error:`, e.message);
  }

  // C. Instagram Story (9:16 Vertical Video)
  try {
    console.log('🟣 Creating Instagram Story container (9:16)...');
    const storyContainer = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
      media_type: 'STORIES',
      video_url: videoUrl,
      access_token: TOKEN
    });

    console.log(`✔ Story container created (ID: ${storyContainer.id}). Polling status...`);
    let isStoryReady = false;
    const storyDelays = [4000, 6000, 8000, 10000];

    for (let i = 0; i < storyDelays.length; i++) {
      await new Promise(r => setTimeout(r, storyDelays[i]));
      const statusRes = await getGraphApi(`/v20.0/${storyContainer.id}?fields=status_code,status&access_token=${TOKEN}`);
      if (statusRes.status_code === 'FINISHED') {
        isStoryReady = true;
        break;
      } else if (statusRes.status_code === 'ERROR') {
        throw new Error('Story encoding failed in Meta cloud');
      }
    }

    if (isStoryReady) {
      storyResult = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
        creation_id: storyContainer.id,
        access_token: TOKEN
      });
      console.log(`🎉 SUCCESS: Instagram Story is LIVE! (ID: ${storyResult.id})`);
    }
  } catch (e) {
    console.error(`❌ Instagram Story Error:`, e.message);
  }

  return { fbResult, reelResult, storyResult };
}

async function run() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const slotArg = (args.find(a => a.startsWith('--slot=')) || '').replace('--slot=', '').toLowerCase();

  // Run Meta Token Guard check
  if (!isDryRun) {
    await checkMetaTokenHealth();
  } else {
    console.log('🔒 RUNNING IN SAFE DRY-RUN MODE (0 Meta API calls, conserving credits & quota)');
  }

  const bufferPath = path.join(__dirname, '../data/daily_content_buffer.json');
  const todayStr = new Date().toISOString().split('T')[0];
  let bundle = null;

  if (fs.existsSync(bufferPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(bufferPath, 'utf8'));
      if (raw && raw.date === todayStr) {
        bundle = raw;
        console.log(`✔ Using cached bundle for ${todayStr} (${raw.trade})`);
      } else {
        console.log(`⚠️  Stale buffer found (date: ${raw && raw.date}). Regenerating for ${todayStr}...`);
      }
    } catch (e) {}
  }

  if (!bundle) {
    console.log('Generating fresh daily multi-trade content bundle...');
    bundle = await generateDailyContentBundle({ offline: true });
    // Save fresh bundle for the other slots to reuse today
    try {
      fs.mkdirSync(path.dirname(bufferPath), { recursive: true });
      fs.writeFileSync(bufferPath, JSON.stringify(bundle, null, 2), 'utf8');
      console.log(`✔ Fresh bundle saved for ${todayStr}`);
    } catch (e) {}
  }

  if (slotArg === 'morning' || slotArg === 'blog') {
    await publishMorningBlog(bundle, isDryRun);
  } else if (slotArg === 'lunch' || slotArg === 'feed') {
    await publishLunchFeedPost(bundle, isDryRun);
  } else if (slotArg === 'evening' || slotArg === 'reel' || slotArg === 'story') {
    await publishEveningReelAndStory(bundle, isDryRun);
  } else {
    console.log(`No specific slot specified (--slot=morning|lunch|evening). Running full bundle test...`);
    await publishMorningBlog(bundle, isDryRun);
    await publishLunchFeedPost(bundle, isDryRun);
    await publishEveningReelAndStory(bundle, isDryRun);
  }

  // Also process any due approved posts from content_engine_queue.json
  await checkAndPublishContentEngineQueue(isDryRun);

  console.log('\n🏁 Omnichannel execution finished.');
}

async function checkAndPublishContentEngineQueue(isDryRun) {
  const queuePath = path.join(__dirname, '../data/content_engine_queue.json');
  const pubHistPath = path.join(__dirname, '../data/published_history.json');
  if (!fs.existsSync(queuePath)) return;

  try {
    let queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    const now = new Date();
    let updated = false;

    for (const post of queue) {
      const isApproved = post.status === 'approved';
      const isDue = post.scheduledFor && new Date(post.scheduledFor) <= now;
      const isNotPublished = post.status !== 'published' && !post.publishedAt;

      if (isApproved && isDue && isNotPublished) {
        console.log(`\n🚀 [CloudContentEngine] Publishing due approved post: "${post.title}"...`);
        if (isDryRun) {
          console.log(`   [DRY RUN] Simulated publish for: ${post.title}`);
          continue;
        }

        try {
          assertUniqueMedia(post);

          const channels = post.channelTargets || ['facebook', 'instagram'];
          let socialResults = { facebook: null, instagram: null };

          if (post.format === 'blog_article') {
            const slug = (post.title || 'article').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const articleUrl = `https://missedcallautosms.com/blog/${slug}`;
            if (channels.includes('facebook') && TOKEN) {
              const fbRes = await postGraphApi(`/v20.0/${FB_PAGE_ID}/feed`, {
                message: `📢 New Article Published!\n\n${post.title}\n\n${post.hook || ''}\n\n👉 Read the full breakdown: ${articleUrl}`,
                link: articleUrl,
                access_token: TOKEN
              });
              socialResults.facebook = { success: true, id: fbRes.id };
            }
          } else if (post.format === 'social_card' || post.format === 'feed_post') {
            const caption = `${post.title}\n\n${post.narrativeBody || post.hook}\n\nTry Missed Call Auto SMS free for 3 days ($0.00 today) at missedcallautosms.com`;
            if (channels.includes('facebook') && TOKEN) {
              const fbRes = await postGraphApi(`/v20.0/${FB_PAGE_ID}/photos`, {
                url: post.imageUrl,
                caption: caption,
                access_token: TOKEN
              });
              socialResults.facebook = { success: true, id: fbRes.id };
            }
            if (channels.includes('instagram') && TOKEN) {
              const container = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
                image_url: post.imageUrl,
                caption: caption,
                access_token: TOKEN
              });
              await new Promise(r => setTimeout(r, 3000));
              const igRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
                creation_id: container.id,
                access_token: TOKEN
              });
              socialResults.instagram = { success: true, id: igRes.id };
            }
          } else if (post.format === 'reel_video') {
            let videoUrl = post.videoUrl;
            if (!videoUrl && post.videoAsset) {
              videoUrl = post.videoAsset.startsWith('http')
                ? post.videoAsset
                : `https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/${post.videoAsset}`;
            }
            const coverUrl = post.imageUrl || 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/social/contractor-speed-rule.jpg';
            const reelCaption = `${post.title}\n\n${post.narrativeBody || post.hook}\n\nTry Missed Call Auto SMS free for 3 days ($0.00 today) - link in bio!`;

            if (channels.includes('facebook') && TOKEN) {
              const fbRes = await postGraphApi(`/v20.0/${FB_PAGE_ID}/videos`, {
                file_url: videoUrl,
                title: post.title,
                description: reelCaption,
                access_token: TOKEN
              });
              socialResults.facebook = { success: true, id: fbRes.id };
            }
            if (channels.includes('instagram') && TOKEN) {
              const container = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
                media_type: 'REELS',
                video_url: videoUrl,
                cover_url: coverUrl,
                caption: reelCaption,
                share_to_feed: true,
                access_token: TOKEN
              });
              const delays = [4000, 6000, 8000, 10000, 15000];
              let ready = false;
              for (const d of delays) {
                await new Promise(r => setTimeout(r, d));
                const s = await getGraphApi(`/v20.0/${container.id}?fields=status_code,status&access_token=${TOKEN}`);
                const sc = (s.status_code || s.status || '').toUpperCase();
                if (sc === 'FINISHED' || sc === 'READY') { ready = true; break; }
              }
              if (ready) {
                const igRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
                  creation_id: container.id,
                  access_token: TOKEN
                });
                socialResults.instagram = { success: true, id: igRes.id };
              }
            }
          }

          post.status = 'published';
          post.publishedAt = now.toISOString();
          post.publishedVia = 'cloud_actions_scheduler';
          updated = true;

          let pubHist = [];
          if (fs.existsSync(pubHistPath)) {
            try { pubHist = JSON.parse(fs.readFileSync(pubHistPath, 'utf8')); } catch (e) {}
          }
          pubHist.unshift({
            id: post.id,
            title: post.title,
            format: post.format,
            imageUrl: post.imageUrl,
            videoUrl: post.videoUrl || post.videoAsset,
            publishedAt: now.toISOString(),
            channels,
            niche: post.niche,
            socialResults
          });
          fs.writeFileSync(pubHistPath, JSON.stringify(pubHist, null, 2), 'utf8');
          console.log(`✅ [CloudContentEngine] Successfully published "${post.title}" to channels!`);
        } catch (postErr) {
          console.error(`❌ [CloudContentEngine] Failed to publish post "${post.title}":`, postErr.message);
        }
      }
    }

    if (updated) {
      fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2), 'utf8');
    }
  } catch (err) {
    console.warn(`[CloudContentEngine] Error checking queue: ${err.message}`);
  }
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = {
  loadEnv,
  checkMetaTokenHealth,
  postGraphApi,
  getGraphApi,
  publishMorningBlog,
  publishLunchFeedPost,
  publishEveningReelAndStory,
  run
};

