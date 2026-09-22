const fs = require('fs');
const path = require('path');
const https = require('https');

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

function getSocialImageUrl(article = {}) {
  const postsPath = path.join(__dirname, '../blog/posts.json');
  
  let existingPosts = [];
  if (fs.existsSync(postsPath)) {
    try {
      existingPosts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
    } catch (e) {}
  }

  // If article already has a valid verified GitHub imageUrl, use it
  if (article.imageUrl && article.imageUrl.startsWith('https://raw.githubusercontent.com/')) {
    const baseName = path.basename(article.imageUrl);
    if (VERIFIED_GITHUB_SOCIAL_IMAGES.includes(baseName)) {
      return article.imageUrl;
    }
  }

  // Find a verified image that was least recently used
  const usedImages = existingPosts.map(p => path.basename(p.imageUrl || ''));
  const unusedAsset = VERIFIED_GITHUB_SOCIAL_IMAGES.find(img => !usedImages.includes(img));
  const chosenAsset = unusedAsset || VERIFIED_GITHUB_SOCIAL_IMAGES[Math.floor(Math.random() * VERIFIED_GITHUB_SOCIAL_IMAGES.length)];

  const resolvedUrl = `https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/social/${chosenAsset}`;
  article.imageUrl = resolvedUrl;
  return resolvedUrl;
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

async function publishToSocial(article) {
  if (!TOKEN) {
    console.warn('⚠️ META_PAGE_ACCESS_TOKEN not found. Skipping social media distribution.');
    return { skipped: true, reason: 'No access token' };
  }

  const results = { facebook: null, instagram: null };
  const articleUrl = `https://missedcallautosms.com/blog/${article.slug}`;

  console.log('====================================================');
  console.log('📢 CROSS-POSTING TO FACEBOOK & INSTAGRAM');
  console.log('====================================================');
  console.log(`Article: "${article.title}"`);
  console.log(`URL: ${articleUrl}`);
  console.log('----------------------------------------------------');

  // 1. Post to Facebook Page
  console.log('\n🔵 [1/2] Publishing to Facebook Page...');
  try {
    const fbMessage = `📢 New Article Published!\n\n${article.title}\n\n${article.excerpt || ''}\n\n👉 Read the full breakdown: ${articleUrl}\n\n#missedcallautosms #smallbusiness #contractorlife #speedtolead`;
    
    const fbRes = await postGraphApi(`/v20.0/${FB_PAGE_ID}/feed`, {
      message: fbMessage,
      link: articleUrl,
      access_token: TOKEN
    });
    
    results.facebook = { success: true, id: fbRes.id };
    console.log(`🎉 Facebook Post LIVE! ID: ${fbRes.id}`);
    console.log(`🔗 https://facebook.com/${FB_PAGE_ID}`);
  } catch (err) {
    results.facebook = { success: false, error: err.message };
    console.error('❌ Facebook Publishing Failed:', err.message);
  }

  // 2. Post to Instagram Feed
  console.log('\n🟣 [2/2] Publishing to Instagram Feed...');
  try {
    const hashTags = (article.tags || [])
      .map(t => '#' + t.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(t => t.length > 1)
      .join(' ');

    const igCaption = `🚀 ${article.title}\n\n${article.excerpt || ''}\n\nRead the full guide at missedcallautosms.com/blog/${article.slug} (Link in bio!)\n\n#missedcallautosms #speedtolead #contractors #smallbusiness ${hashTags}`.trim();

    const activeImageUrl = getSocialImageUrl(article);
    console.log(`🖼️ Using contextual social image: ${activeImageUrl}`);

    console.log('Step 2a: Creating media container...');
    const containerRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
      image_url: activeImageUrl,
      caption: igCaption,
      access_token: TOKEN
    });
    console.log(`✔ Container created (ID: ${containerRes.id})`);

    console.log('Waiting 3 seconds for Meta image rendering...');
    await new Promise(r => setTimeout(r, 3000));

    console.log('Step 2b: Publishing to Instagram feed...');
    const publishRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
      creation_id: containerRes.id,
      access_token: TOKEN
    });

    results.instagram = { success: true, id: publishRes.id };
    console.log(`🎉 Instagram Post LIVE! ID: ${publishRes.id}`);
    console.log('🔗 https://instagram.com/missedcallautosms');
  } catch (err) {
    results.instagram = { success: false, error: err.message };
    console.error('❌ Instagram Publishing Failed:', err.message);
  }

  console.log('\n====================================================');
  console.log('🏁 SOCIAL CROSS-POSTING FINISHED');
  console.log('====================================================');
  return results;
}

// Standalone execution: publish latest blog article
if (require.main === module) {
  const postsJsonPath = path.join(__dirname, '../blog/posts.json');
  if (fs.existsSync(postsJsonPath)) {
    try {
      const posts = JSON.parse(fs.readFileSync(postsJsonPath, 'utf8'));
      if (posts.length > 0) {
        publishToSocial(posts[0]).then(res => {
          if (res && res.facebook && !res.facebook.success && res.instagram && !res.instagram.success) {
            console.error('❌ Social cross-posting failed for both platforms.');
            process.exit(1);
          }
        });
      } else {
        console.log('No articles found in blog/posts.json');
      }
    } catch (e) {
      console.error('Error reading blog/posts.json:', e.message);
      process.exit(1);
    }
  }
}

module.exports = { publishToSocial, getSocialImageUrl };