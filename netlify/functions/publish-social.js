const https = require('https');
const fs = require('fs');
const path = require('path');

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
          reject(new Error(`Parse error: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-meta-token'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const reqHeaders = event.headers || {};
  const activeToken = reqHeaders['x-meta-token'] || TOKEN;

  if (!activeToken) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: 'META_PAGE_ACCESS_TOKEN is not configured.' })
    };
  }

  let article = {};
  if (event.body) {
    try { article = JSON.parse(event.body); } catch (e) {}
  }

  if (!article.title) {
    try {
      const postsPath = path.resolve(__dirname, '../../blog/posts.json');
      if (fs.existsSync(postsPath)) {
        const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
        if (posts.length > 0) article = posts[0];
      }
    } catch (e) {}
  }

  if (!article.title) {
    article = {
      title: 'How Solo Contractors Win $5,000 Jobs Without Answering Phone',
      slug: 'how-solo-contractors-win-jobs-without-answering-phone',
      excerpt: 'Learn how sending an authentic auto-reply in 15 seconds stops prospects from dialing your competitors.',
      tags: ['SpeedToLead', 'Contractors', 'SmallBusiness']
    };
  }

  const articleUrl = `https://missedcallautosms.com/blog/${article.slug}`;
  const results = { facebook: null, instagram: null };

  try {
    const fbMessage = `📢 New Article Published!\n\n${article.title}\n\n${article.excerpt || ''}\n\n👉 Read the full breakdown: ${articleUrl}\n\n#missedcallautosms #smallbusiness #contractorlife #speedtolead`;
    const fbRes = await postGraphApi(`/v20.0/${FB_PAGE_ID}/feed`, {
      message: fbMessage,
      link: articleUrl,
      access_token: activeToken
    });
    results.facebook = { success: true, id: fbRes.id };
  } catch (err) {
    results.facebook = { success: false, error: err.message };
  }

  try {
    const hashTags = (article.tags || [])
      .map(t => '#' + t.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(t => t.length > 1)
      .join(' ');
    const igCaption = `🚀 ${article.title}\n\n${article.excerpt || ''}\n\nRead the full guide at missedcallautosms.com/blog/${article.slug} (Link in bio!)\n\n#missedcallautosms #speedtolead #contractors #smallbusiness ${hashTags}`.trim();

    const activeImageUrl = getSocialImageUrl(article);
    const containerRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
      image_url: activeImageUrl,
      caption: igCaption,
      access_token: activeToken
    });

    await new Promise(r => setTimeout(r, 3000));

    const publishRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
      creation_id: containerRes.id,
      access_token: activeToken
    });
    results.instagram = { success: true, id: publishRes.id };
  } catch (err) {
    results.instagram = { success: false, error: err.message };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      results,
      articleTitle: article.title,
      articleUrl: articleUrl
    })
  };
};
