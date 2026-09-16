const fs = require('fs');
const path = require('path');
const https = require('https');
const { publishToSocial } = require('./publish_social_blog');

// Load .env if present locally
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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

async function callGeminiSingle(model, prompt) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.7,
        max_output_tokens: 4096
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${model}:generateContent`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const rawText = json.candidates[0].content.parts[0].text;
            const parsedArticle = JSON.parse(rawText);
            resolve(parsedArticle);
          } else {
            reject(new Error(`Gemini API Error (${res.statusCode}): ` + (json.error ? json.error.message : body)));
          }
        } catch (e) {
          reject(new Error('Failed to parse Gemini API response: ' + e.message + ' | Body: ' + body.substring(0, 300)));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function callGemini(prompt) {
  const candidateModels = process.env.GEMINI_MODEL 
    ? [process.env.GEMINI_MODEL]
    : ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-pro', 'gemini-pro-latest'];

  let lastError = null;
  for (const model of candidateModels) {
    try {
      console.log(`🤖 Attempting generation with model: ${model}...`);
      const result = await callGeminiSingle(model, prompt);
      console.log(`✔ Generation succeeded with model: ${model}`);
      return result;
    } catch (err) {
      console.warn(`⚠️ Model ${model} returned error: ${err.message}. Trying fallback...`);
      lastError = err;
    }
  }
  throw lastError;
}

async function run() {
  console.log('====================================================');
  console.log('🤖 AUTONOMOUS GOOGLE GEMINI BLOG GENERATOR');
  console.log('====================================================');

  const postsJsonPath = path.join(__dirname, '../blog/posts.json');
  const templatePath = path.join(__dirname, '../blog/template.html');
  const sitemapPath = path.join(__dirname, '../sitemap.xml');

  let existingPosts = [];
  if (fs.existsSync(postsJsonPath)) {
    try {
      existingPosts = JSON.parse(fs.readFileSync(postsJsonPath, 'utf8'));
    } catch (e) {
      existingPosts = [];
    }
  }

  const existingTitles = existingPosts.map(p => `- ${p.title} (slug: ${p.slug})`).join('\n');

  if (!GEMINI_API_KEY) {
    console.warn('⚠️ No GEMINI_API_KEY detected in environment or .env.');
    console.warn('👉 Please set GEMINI_API_KEY in your .env or GitHub Secrets to run live generation.');
    console.log('Performing dry-run validation of templates and paths...');
    if (fs.existsSync(templatePath)) console.log('✔ template.html is valid');
    if (fs.existsSync(postsJsonPath)) console.log(`✔ posts.json is valid (${existingPosts.length} posts loaded)`);
    return;
  }

  console.log(`📡 Querying Google Gemini API with ${existingPosts.length} existing topics to avoid duplicates...`);

  const prompt = `
You are the lead marketing strategist and editorial director for "Missed Call Auto SMS".
Product Concept:
- A standalone Android hardware appliance application that automatically detects missed calls and texts the caller back in 15 seconds.
- It uses the phone's physical SIM card and regular carrier plan (AT&T, Verizon, T-Mobile).
- Key Advantages:
  1. 100% exempt from A2P 10DLC registration, carrier compliance delays, and per-text fees.
  2. Replaces expensive monthly SaaS stacks like GoHighLevel ($297/mo) or Twilio ($0.0079/text + carrier fees).
  3. One-time $49.99 lifetime license with a 3-day free trial ($0 charged upfront).
  4. Human Jitter Delay (15 seconds) so messages feel personal and authentic, not like automated spam.
  5. Recovers lost revenue from expensive Google Local Services Ads (LSA), Google Ads, and Facebook Ads where missed calls result in burned ad spend.

Existing Published Articles (DO NOT duplicate these topics or angles):
${existingTitles}

Generate a brand new, highly authoritative, SEO-rich, educational article for local service business owners, contractors (plumbers, HVAC, roofers, mechanics, locksmiths), and solo operators.

Return your response strictly as a JSON object matching this schema:
{
  "title": "Compelling, high-CTR article headline (50-70 characters)",
  "slug": "url-friendly-slug-with-hyphens-only",
  "category": "One of: Paid Ads & ROI, Appliance vs. SaaS, Contractor Playbooks, Speed-to-Lead",
  "readTime": 5,
  "tags": ["Keyword1", "Keyword2", "Keyword3"],
  "excerpt": "Compelling 2-sentence summary hook explaining what the reader will learn.",
  "metaDescription": "SEO meta description under 160 characters designed for high search click-through rate.",
  "takeaways": [
    "Punchy actionable takeaway 1",
    "Punchy actionable takeaway 2",
    "Punchy actionable takeaway 3",
    "Punchy actionable takeaway 4"
  ],
  "contentHtml": "Full article HTML (800-1200 words) using <h2>, <h3>, <p>, <ul>, <li>, <strong>, <blockquote>, and a formatted <table class=\\"comparison-table\\"> with real numbers or cost comparisons. Keep tone conversational, practical, data-driven, and focused on ROI."
}
`;

  try {
    const article = await callGemini(prompt);
    console.log(`✨ Generated Article: "${article.title}"`);
    console.log(`🔗 Slug: ${article.slug}`);

    const template = fs.readFileSync(templatePath, 'utf8');
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const isoDate = now.toISOString();

    let postHtml = template;
    postHtml = postHtml.replace(/{{TITLE}}/g, article.title);
    postHtml = postHtml.replace(/{{SLUG}}/g, article.slug);
    postHtml = postHtml.replace(/{{DESCRIPTION}}/g, article.metaDescription);
    postHtml = postHtml.replace(/{{CATEGORY}}/g, article.category);
    postHtml = postHtml.replace(/{{DATE}}/g, formattedDate);
    postHtml = postHtml.replace(/{{ISO_DATE}}/g, isoDate);
    postHtml = postHtml.replace(/{{READ_TIME}}/g, article.readTime || 5);
    postHtml = postHtml.replace(/{{TAGS}}/g, (article.tags || []).join(', '));

    const takeawaysHtml = (article.takeaways || []).map(t => `<li>${t}</li>`).join('\n');
    postHtml = postHtml.replace(/{{TAKEAWAYS_HTML}}/g, takeawaysHtml);
    postHtml = postHtml.replace(/{{CONTENT_HTML}}/g, article.contentHtml);

    // Write article HTML
    const articleFile = path.join(__dirname, `../blog/posts/${article.slug}.html`);
    fs.writeFileSync(articleFile, postHtml, 'utf8');
    console.log(`📁 Saved article to: blog/posts/${article.slug}.html`);

    // Update posts.json
    const newPostMeta = {
      slug: article.slug,
      title: article.title,
      category: article.category,
      date: formattedDate,
      isoDate: isoDate,
      readTime: article.readTime || 5,
      tags: article.tags || [],
      excerpt: article.excerpt,
      metaDescription: article.metaDescription
    };

    existingPosts.unshift(newPostMeta);
    fs.writeFileSync(postsJsonPath, JSON.stringify(existingPosts, null, 2), 'utf8');
    console.log(`📚 Updated blog/posts.json (Total articles: ${existingPosts.length})`);

    // Update sitemap.xml
    let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://missedcallautosms.com/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://missedcallautosms.com/blog</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
`;

    existingPosts.forEach(p => {
      sitemapXml += `  <url>
    <loc>https://missedcallautosms.com/blog/${p.slug}</loc>
    <lastmod>${(p.isoDate || new Date().toISOString()).split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
`;
    });

    sitemapXml += `</urlset>\n`;
    fs.writeFileSync(sitemapPath, sitemapXml, 'utf8');
    console.log(`🗺️ Updated sitemap.xml with ${existingPosts.length + 2} total indexed URLs`);

    // Cross-post to Facebook & Instagram if configured
    if (process.env.AUTO_POST_SOCIAL === 'true') {
      try {
        await publishToSocial(newPostMeta);
      } catch (socialErr) {
        console.warn('⚠️ Social media publishing notice:', socialErr.message);
      }
    }

    console.log('====================================================');
    console.log('🎉 DAILY BLOG POST PUBLISHED SUCCESSFULLY!');
    console.log('====================================================');
    return newPostMeta;

  } catch (err) {
    console.error('❌ Error generating daily blog:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
