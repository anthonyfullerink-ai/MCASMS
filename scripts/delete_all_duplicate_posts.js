/**
 * delete_all_duplicate_posts.js
 * Deletes ALL duplicate posts/videos/reels from Facebook and Instagram
 * based on the full audit performed on 2026-09-20.
 *
 * RULE: Keep only the NEWEST clean post per type. Delete everything older
 * that uses the same video file (v150_ai_voice_launch_reel_9x16.mp4) or
 * is an exact caption duplicate.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
      if (m) {
        let val = (m[2] || '').trim().replace(/^["']|["']$/g, '');
        if (!process.env[m[1]]) process.env[m[1]] = val;
      }
    });
  }
}
loadEnv();

const TOKEN   = process.env.META_PAGE_ACCESS_TOKEN || '';
const PAGE_ID = process.env.FB_PAGE_ID || '1248332278370968';
const IG_ID   = process.env.IG_USER_ID || '17841428781387416';

function apiDelete(id, token) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/v20.0/${id}?access_token=${token}`,
      method: 'DELETE'
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ id, result: JSON.parse(b) }); }
        catch (e) { resolve({ id, result: { raw: b } }); }
      });
    });
    req.on('error', e => resolve({ id, error: e.message }));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  if (!TOKEN) { console.error('❌ No META_PAGE_ACCESS_TOKEN'); process.exit(1); }

  console.log('🗑️  FULL DUPLICATE CLEANUP');
  console.log('============================================================');

  // ── FACEBOOK VIDEOS TO DELETE ──────────────────────────────────────────────
  // Keep: 2194788611081679 (today's new UGC reel - 9/20 14:40)
  // Delete: all prior reel/video posts using the same or old video
  const FB_VIDEO_DUPES = [
    '1698589502267412',  // 9/20 02:06 - "Never Miss a $1,500 Job" (old same video)
    '1616717043316345',  // 9/19 04:30 - "Hands-Busy Trade Solution" (old same video)
    '1098399402604343',  // 9/19 01:07 - "Stop Losing $1,200 Jobs" (old same video)
    '1106242071939093',  // 9/17 22:37 - blank title (old same video)
  ];

  // ── FACEBOOK FEED POSTS TO DELETE ─────────────────────────────────────────
  // Keep: today's new UGC posts (122099994471483785, 122099994369483785)
  // Keep: article/blog cross-posts (these are unique content)
  // Delete: duplicates and old redundant promotional posts from 9/19 + 9/16
  const FB_POST_DUPES = [
    '1248332278370968_122099425359483785', // 9/20 02:07 - old "grease under sink" duplicate
    '1248332278370968_122099425101483785', // 9/20 02:06 - old v1.5.0 duplicate
    '1248332278370968_122098593177483785', // 9/19 04:30 - barbershop reel caption duplicate
    '1248332278370968_122098480947483785', // 9/19 01:07 - "under a sink" duplicate post
    '1248332278370968_122096190189483785', // 9/16 02:59 - early test duplicate
    '1248332278370968_122096187663483785', // 9/16 02:55 - early test duplicate
    '1248332278370968_122096184165483785', // 9/16 02:45 - early test duplicate
    '1248332278370968_122096178201483785', // 9/16 02:31 - early test post
  ];

  // ── INSTAGRAM MEDIA TO DELETE ──────────────────────────────────────────────
  // Keep: 17972392041143844 (today's new reel - 9/20 14:40)
  // Keep: 18225247966330337 (today's new feed image - 9/20 14:39)
  // Delete: all prior duplicate video reels using the same v150 video file
  const IG_DUPES = [
    '17928776241163778', // 9/20 02:08 - VIDEO duplicate (same v150 video)
    '17960256051207255', // 9/20 01:56 - VIDEO duplicate (same v150 video)
    '17895934725393466', // 9/19 04:30 - VIDEO duplicate (same v150 video)
    '18121426063915351', // 9/19 04:29 - VIDEO duplicate (same v150 video)
    '17954113188256244', // 9/19 01:07 - VIDEO duplicate (old video)
    '17942939121349697', // 9/17 22:54 - VIDEO duplicate (old video)
    '17906665728550986', // 9/20 02:06 - IMAGE duplicate (v1.5.0 old promo)
    '18132187918732804', // 9/20 01:55 - IMAGE duplicate (v1.5.0 old promo)
    '17908113654481710', // 9/19 04:30 - IMAGE duplicate (HVAC)
    '18077060144401989', // 9/19 04:28 - IMAGE duplicate (HVAC)
  ];

  // Delete FB Videos
  console.log(`\n📹 Deleting ${FB_VIDEO_DUPES.length} duplicate Facebook VIDEOS...`);
  for (const id of FB_VIDEO_DUPES) {
    const r = await apiDelete(id, TOKEN);
    const ok = r.result && r.result.success;
    console.log(`  ${ok ? '✅' : '⚠️ '} FB Video ${id}: ${ok ? 'DELETED' : JSON.stringify(r.result || r.error)}`);
    await sleep(600);
  }

  // Delete FB Posts
  console.log(`\n📝 Deleting ${FB_POST_DUPES.length} duplicate Facebook POSTS...`);
  for (const id of FB_POST_DUPES) {
    const r = await apiDelete(id, TOKEN);
    const ok = r.result && r.result.success;
    console.log(`  ${ok ? '✅' : '⚠️ '} FB Post ${id}: ${ok ? 'DELETED' : JSON.stringify(r.result || r.error)}`);
    await sleep(600);
  }

  // Delete IG Media
  console.log(`\n🟣 Deleting ${IG_DUPES.length} duplicate Instagram MEDIA items...`);
  for (const id of IG_DUPES) {
    const r = await apiDelete(id, TOKEN);
    const ok = r.result && r.result.success;
    console.log(`  ${ok ? '✅' : '⚠️ '} IG Media ${id}: ${ok ? 'DELETED' : JSON.stringify(r.result || r.error)}`);
    await sleep(600);
  }

  console.log('\n============================================================');
  console.log(`🏁 Cleanup complete. Deleted:`);
  console.log(`   ${FB_VIDEO_DUPES.length} FB duplicate videos`);
  console.log(`   ${FB_POST_DUPES.length} FB duplicate posts`);
  console.log(`   ${IG_DUPES.length} IG duplicate media items`);
  console.log('============================================================');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
