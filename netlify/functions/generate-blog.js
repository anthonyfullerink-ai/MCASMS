const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

function callGeminiSingle(model, prompt, apiKey) {
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
        'x-goog-api-key': apiKey,
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
          reject(new Error('Failed to parse Gemini response: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function generateArticleWithGemini(apiKey) {
  const candidateModels = process.env.GEMINI_MODEL 
    ? [process.env.GEMINI_MODEL]
    : ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest', 'gemini-2.5-pro'];

  const prompt = `
You are the lead marketing strategist for "Missed Call Auto SMS".
Generate a brand new, highly authoritative, SEO-rich article for local service business owners and trade contractors.
Return your response strictly as a JSON object matching this schema:
{
  "title": "Compelling article headline (50-70 chars)",
  "slug": "url-friendly-slug-hyphens-only",
  "category": "One of: Paid Ads & ROI, Appliance vs. SaaS, Contractor Playbooks, Speed-to-Lead",
  "readTime": 5,
  "tags": ["Keyword1", "Keyword2"],
  "excerpt": "Compelling 2-sentence summary hook.",
  "metaDescription": "SEO description under 160 chars.",
  "takeaways": ["Takeaway 1", "Takeaway 2", "Takeaway 3"],
  "contentHtml": "Full article HTML with <h2>, <h3>, <p>, <ul>, <li>, <strong>, <blockquote>."
}
`;

  let lastErr = null;
  for (const model of candidateModels) {
    try {
      return await callGeminiSingle(model, prompt, apiKey);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('All Gemini models failed');
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-gemini-key'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const reqHeaders = event.headers || {};
  const activeKey = reqHeaders['x-gemini-key'] || GEMINI_API_KEY;

  if (!activeKey) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'GEMINI_API_KEY is not configured in environment variables or request headers. Please add GEMINI_API_KEY in Netlify Site Configuration > Environment Variables.'
      })
    };
  }

  try {
    const article = await generateArticleWithGemini(activeKey);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Blog article generated successfully!',
        latestPost: {
          title: article.title,
          slug: article.slug,
          category: article.category,
          date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          excerpt: article.excerpt,
          metaDescription: article.metaDescription
        }
      })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: err.message
      })
    };
  }
};
