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
const FB_PAGE_ID = process.env.FB_PAGE_ID || '1248332278370968';
const IG_USER_ID = process.env.IG_USER_ID || '17841428781387416';

function getSocialImageUrl(article = {}) {
  if (article.imageUrl && article.imageUrl.startsWith('http')) {
    return article.imageUrl;
  }
  
  const titleAndTags = `${article.title || ''} ${(article.tags || []).join(' ')} ${article.category || ''}`.toLowerCase();
  
  if (titleAndTags.includes('contractor') || titleAndTags.includes('job') || titleAndTags.includes('plumb') || titleAndTags.includes('roof') || titleAndTags.includes('hvac') || titleAndTags.includes('solo') || titleAndTags.includes('ladder') || titleAndTags.includes('sink')) {
    return 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/social/contractor-jobsite.jpg';
  }
  
  if (titleAndTags.includes('speed') || titleAndTags.includes('lead') || titleAndTags.includes('ad') || titleAndTags.includes('google') || titleAndTags.includes('competitor') || titleAndTags.includes('roi') || titleAndTags.includes('decay')) {
    return 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/social/speed-to-lead.jpg';
  }
  
  if (titleAndTags.includes('saas') || titleAndTags.includes('a2p') || titleAndTags.includes('carrier') || titleAndTags.includes('appliance') || titleAndTags.includes('hardware') || titleAndTags.includes('fee') || titleAndTags.includes('twilio') || titleAndTags.includes('filter')) {
    return 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/social/appliance-vs-saas.jpg';
  }
  
  return 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/facebook-banner.jpg';
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
        publishToSocial(posts[0]);
      } else {
        console.log('No articles found in blog/posts.json');
      }
    } catch (e) {
      console.error('Error reading blog/posts.json:', e.message);
    }
  }
}

module.exports = { publishToSocial, getSocialImageUrl };