const fs = require('fs');
const https = require('https');
const path = require('path');

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

function deleteObject(id) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/${id}?access_token=${TOKEN}`,
      method: 'DELETE'
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        console.log(`Delete ID ${id} -> HTTP ${res.statusCode}: ${b}`);
        resolve();
      });
    });
    req.on('error', e => {
      console.error(`Error deleting ID ${id}:`, e.message);
      resolve();
    });
    req.end();
  });
}

async function run() {
  console.log('Cleaning up previous posts from Meta...');
  const ids = [
    '122099417667483785', // FB Post
    '2247821452735731',   // FB Video
    '18132187918732804',  // IG Feed Post
    '17960256051207255',  // IG Reel
    '18102028118369279'   // IG Story
  ];
  for (const id of ids) {
    await deleteObject(id);
  }
  console.log('Cleanup finished.');
}

run();
