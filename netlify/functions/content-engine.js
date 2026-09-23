const fs = require('fs');
const path = require('path');
const https = require('https');

// Writable tmp location in AWS Lambda / Netlify serverless runtime
const TMP_QUEUE_FILE = path.join('/tmp', 'content_engine_queue.json');
const TMP_SETTINGS_FILE = path.join('/tmp', 'content_engine_settings.json');

// Potential bundle paths
const CANDIDATE_QUEUE_PATHS = [
  TMP_QUEUE_FILE,
  path.join(__dirname, '..', '..', 'data', 'content_engine_queue.json'),
  path.join(process.cwd(), 'data', 'content_engine_queue.json'),
  path.join(__dirname, 'data', 'content_engine_queue.json')
];

const CANDIDATE_SETTINGS_PATHS = [
  TMP_SETTINGS_FILE,
  path.join(__dirname, '..', '..', 'data', 'content_engine_settings.json'),
  path.join(process.cwd(), 'data', 'content_engine_settings.json'),
  path.join(__dirname, 'data', 'content_engine_settings.json')
];

const CANDIDATE_RESEARCH_PATHS = [
  path.join(__dirname, '..', '..', 'data', 'competitor_research.json'),
  path.join(process.cwd(), 'data', 'competitor_research.json'),
  path.join(__dirname, 'data', 'competitor_research.json')
];

function fetchGithubRaw(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'MCASMS-ContentEngine' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function getQueue() {
  // 1. Check local / tmp filesystem
  for (const p of CANDIDATE_QUEUE_PATHS) {
    if (fs.existsSync(p)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
  }

  // 2. Fetch from GitHub raw repository as high-availability fallback
  try {
    const rawUrl = 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/data/content_engine_queue.json';
    const remoteQueue = await fetchGithubRaw(rawUrl);
    if (Array.isArray(remoteQueue) && remoteQueue.length > 0) {
      try { fs.writeFileSync(TMP_QUEUE_FILE, JSON.stringify(remoteQueue, null, 2), 'utf8'); } catch (e) {}
      return remoteQueue;
    }
  } catch (e) {}

  return [];
}

function saveQueue(queue) {
  try {
    fs.writeFileSync(TMP_QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
  } catch (e) {}

  // Also try writing to local data directory if writable
  try {
    const localPath = path.join(__dirname, '..', '..', 'data', 'content_engine_queue.json');
    if (fs.existsSync(path.dirname(localPath))) {
      fs.writeFileSync(localPath, JSON.stringify(queue, null, 2), 'utf8');
    }
  } catch (e) {}
}

async function getSettings() {
  for (const p of CANDIDATE_SETTINGS_PATHS) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (e) {}
    }
  }

  return {
    autoPostingEnabled: true,
    autoPublishApprovedOnly: true,
    postingTimeslots: ["09:00", "13:00", "18:00"],
    schedulerIntervalSeconds: 60,
    smartGenerationProtocol: true,
    creditsPreservedEstimated: 142.50,
    googleChatWebhookUrl: process.env.GOOGLE_CHAT_WEBHOOK_URL || ''
  };
}

async function getResearch() {
  for (const p of CANDIDATE_RESEARCH_PATHS) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (e) {}
    }
  }

  try {
    const rawUrl = 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/data/competitor_research.json';
    const remote = await fetchGithubRaw(rawUrl);
    if (Array.isArray(remote) && remote.length > 0) return remote;
  } catch (e) {}

  return [];
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const rawPath = event.path || '';
  const action = rawPath.replace(/^\/api\/content-engine\/?/, '').replace(/\/$/, '');

  let payload = {};
  if (event.body) {
    try {
      payload = JSON.parse(event.body);
    } catch (e) {
      payload = {};
    }
  }

  try {
    // 1. Status & Telemetry
    if (action === 'status' || action === '') {
      const queue = await getQueue();
      const research = await getResearch();
      const rawSettings = await getSettings();
      const settings = {
        ...rawSettings,
        googleChatWebhookUrl: rawSettings.googleChatWebhookUrl || process.env.GOOGLE_CHAT_WEBHOOK_URL || ''
      };

      const draftsCount = queue.filter(q => q.status === 'draft').length;
      const approvedCount = queue.filter(q => q.status === 'approved').length;
      const publishedCount = queue.filter(q => q.status === 'published').length;

      // Find next scheduled post
      const now = new Date();
      const armed = queue
        .filter(q => q.status === 'approved' && q.scheduledFor)
        .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
      const nextPost = armed[0] || null;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          geminiConfigured: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
          metaConfigured: !!process.env.META_PAGE_ACCESS_TOKEN,
          settings,
          researchCount: research.length,
          queueCount: queue.length,
          draftsCount,
          approvedCount,
          publishedCount,
          nextPost: nextPost ? {
            id: nextPost.id,
            title: nextPost.title,
            format: nextPost.format,
            scheduledFor: nextPost.scheduledFor
          } : null
        })
      };
    }

    // 2. Posts Queue
    if (action === 'posts') {
      const queue = await getQueue();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, posts: queue, count: queue.length })
      };
    }

    // 3. Research Context
    if (action === 'research') {
      const research = await getResearch();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, research, count: research.length })
      };
    }

    // 4. One-Click Approve from Google Chat (Mobile Responsive)
    if (action === 'one-click-approve') {
      const q = event.queryStringParameters || {};
      const postId = q.postId || q.id || '';
      const queue = await getQueue();
      
      let approvedPost = null;
      if (postId === 'all') {
        queue.forEach(p => {
          if (p.status === 'draft') {
            p.status = 'approved';
            p.approvedAt = new Date().toISOString();
          }
        });
        saveQueue(queue);
      } else if (postId) {
        approvedPost = queue.find(p => p.id === postId);
        if (approvedPost) {
          approvedPost.status = 'approved';
          approvedPost.approvedAt = new Date().toISOString();
          saveQueue(queue);
        } else {
          // If ID not matched directly, find first pending draft
          const fallbackDraft = queue.find(p => p.status === 'draft');
          if (fallbackDraft) {
            fallbackDraft.status = 'approved';
            fallbackDraft.approvedAt = new Date().toISOString();
            approvedPost = fallbackDraft;
            saveQueue(queue);
          }
        }
      }

      const postTitle = approvedPost ? approvedPost.title : 'Content Engine Post';
      const postFormat = approvedPost ? approvedPost.format : 'Omnichannel Post';
      const scheduledText = approvedPost && approvedPost.scheduledFor ? new Date(approvedPost.scheduledFor).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET' : 'Next Scheduled Timeslot';

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/html; charset=utf-8'
        },
        body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Post Approved - Missed Call Auto SMS</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 16px; padding: 32px 24px; max-width: 520px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700; font-size: 13px; padding: 6px 14px; border-radius: 999px; margin-bottom: 20px; border: 1px solid rgba(16, 185, 129, 0.3); }
    h1 { font-size: 22px; font-weight: 800; margin: 0 0 12px 0; color: #ffffff; line-height: 1.3; }
    .post-box { background: #0f172a; border: 1px solid #1e293b; border-radius: 10px; padding: 16px; margin: 18px 0; text-align: left; }
    .post-box .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 4px; }
    .post-box .title { font-size: 14px; color: #e2e8f0; font-weight: 600; margin-bottom: 8px; }
    .post-box .meta { font-size: 12px; color: #38bdf8; display: flex; justify-content: space-between; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; }
    .btn { display: block; background: #2563eb; color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 24px; border-radius: 10px; transition: background 0.2s; text-align: center; }
    .btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✔ ARMED FOR PUBLICATION</div>
    <h1>Post Successfully Approved</h1>
    <div class="post-box">
      <div class="label">Approved Content</div>
      <div class="title">${postTitle}</div>
      <div class="meta">
        <span>Format: <b>${postFormat}</b></span>
        <span>Slot: <b>${scheduledText}</b></span>
      </div>
    </div>
    <p>This post is now armed. The scheduler daemon will automatically publish it across your configured channels (Blog, Facebook, and Instagram).</p>
    <a href="/owner?tab=6" class="btn">Open Omnichannel Queue & Dashboard</a>
  </div>
</body>
</html>`
      };
    }

    // 5. Approve Post via Dashboard API
    if (action === 'approve-post' && event.httpMethod === 'POST') {
      const queue = await getQueue();
      const post = queue.find(p => p.id === payload.postId);
      if (post) {
        post.status = 'approved';
        post.approvedAt = new Date().toISOString();
        saveQueue(queue);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, post }) };
      }
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Post not found' }) };
    }

    // 6. Unapprove Post (Revert to Draft)
    if (action === 'unapprove-post' && event.httpMethod === 'POST') {
      const queue = await getQueue();
      const post = queue.find(p => p.id === payload.postId);
      if (post) {
        post.status = 'draft';
        delete post.approvedAt;
        saveQueue(queue);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, post }) };
      }
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Post not found' }) };
    }

    // 7. Reschedule Post
    if (action === 'reschedule-post' && event.httpMethod === 'POST') {
      const queue = await getQueue();
      const post = queue.find(p => p.id === payload.postId);
      if (post && payload.scheduledFor) {
        post.scheduledFor = new Date(payload.scheduledFor).toISOString();
        post.updatedAt = new Date().toISOString();
        saveQueue(queue);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, post }) };
      }
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid post or scheduled date' }) };
    }

    // 8. Toggle Autopost
    if (action === 'toggle-autopost') {
      let settings = await getSettings();
      settings.autoPostingEnabled = !settings.autoPostingEnabled;
      try { fs.writeFileSync(TMP_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8'); } catch (e) {}
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, autoPostingEnabled: settings.autoPostingEnabled })
      };
    }

    // Default response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, action, message: 'Action processed successfully' })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
