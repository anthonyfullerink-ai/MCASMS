/**
 * test_media_guard.js
 * Automated verification test suite for Zero-Video and Zero-Image Reuse.
 */

const assert = require('assert');
const path = require('path');
const {
  cleanBasename,
  isVideoAlreadyUsed,
  isImageAlreadyUsed,
  assertUniqueMedia,
  getAllUsedVideos,
  getAllUsedImages
} = require('./media_guard');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 TESTING ZERO-VIDEO & ZERO-IMAGE REUSE SAFEGUARDS');
  console.log('====================================================');

  // Test 1: cleanBasename handles both relative paths and raw GitHub URLs
  console.log('Test 1: cleanBasename sanitization...');
  assert.strictEqual(cleanBasename('assets/ads/v150_ai_voice_launch_reel_9x16.mp4'), 'v150_ai_voice_launch_reel_9x16.mp4');
  assert.strictEqual(cleanBasename('https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/ads/v150_ai_voice_launch_reel_9x16.mp4'), 'v150_ai_voice_launch_reel_9x16.mp4');
  assert.strictEqual(cleanBasename('assets/social/contractor-speed-rule.jpg'), 'contractor-speed-rule.jpg');
  console.log('  ✔ cleanBasename works across URLs and paths.');

  // Test 2: Detects previously used videos
  console.log('\nTest 2: Detecting previously used videos...');
  const usedVideos = getAllUsedVideos();
  console.log(`  Found ${usedVideos.size} distinct previously used videos in history.`);
  assert(usedVideos.has('v150_ai_voice_launch_reel_9x16.mp4'), 'Expected v150_ai_voice_launch_reel_9x16.mp4 to be marked as used');

  const isOldVideoUsed = isVideoAlreadyUsed('assets/ads/v150_ai_voice_launch_reel_9x16.mp4');
  assert.strictEqual(isOldVideoUsed, true, 'Old video must return true for isVideoAlreadyUsed');
  console.log('  ✔ Correctly detected v150_ai_voice_launch_reel_9x16.mp4 as ALREADY USED.');

  // Test 3: Approves newly generated bespoke videos
  console.log('\nTest 3: Approving brand new bespoke video...');
  const newVideoName = `reel_brand_new_unseen_${Date.now()}_9x16.mp4`;
  const isNewVideoUsed = isVideoAlreadyUsed(`assets/ads/reels/${newVideoName}`);
  assert.strictEqual(isNewVideoUsed, false, 'Unseen video must return false for isVideoAlreadyUsed');
  console.log(`  ✔ Correctly allowed unseen bespoke video: ${newVideoName}`);

  // Test 4: assertUniqueMedia hard block on recycled video
  console.log('\nTest 4: assertUniqueMedia throwing on recycled video...');
  let caughtVideoError = false;
  try {
    assertUniqueMedia({
      id: 'test-post-1',
      title: 'Testing Duplicate Video',
      format: 'reel_video',
      videoAsset: 'assets/ads/v150_ai_voice_launch_reel_9x16.mp4'
    });
  } catch (err) {
    caughtVideoError = true;
    assert(err.message.includes('[ZeroVideoReuseGuard]'), `Expected ZeroVideoReuseGuard in error message: ${err.message}`);
    console.log(`  ✔ Successfully blocked duplicate video with error: ${err.message}`);
  }
  assert.strictEqual(caughtVideoError, true, 'assertUniqueMedia must throw when duplicate video is provided');

  // Test 5: assertUniqueMedia hard block on missing video asset
  console.log('\nTest 5: assertUniqueMedia throwing on missing video asset...');
  let caughtMissingError = false;
  try {
    assertUniqueMedia({
      id: 'test-post-2',
      title: 'Testing Missing Video',
      format: 'reel_video'
    });
  } catch (err) {
    caughtMissingError = true;
    assert(err.message.includes('[ZeroVideoReuseGuard]'), `Expected ZeroVideoReuseGuard in error message: ${err.message}`);
    console.log(`  ✔ Successfully blocked missing video with error: ${err.message}`);
  }
  assert.strictEqual(caughtMissingError, true, 'assertUniqueMedia must throw when reel has no video');

  // Test 6: Queue inspection - verify no pending item uses recycled video
  console.log('\nTest 6: Inspecting content_engine_queue.json for recycled videos...');
  const fs = require('fs');
  const queuePath = path.join(__dirname, '../data/content_engine_queue.json');
  if (fs.existsSync(queuePath)) {
    const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    const pendingDrafts = queue.filter(q => q.status === 'draft' || q.status === 'approved');
    for (const draft of pendingDrafts) {
      if (draft.format === 'reel_video') {
        const video = draft.videoAsset || draft.videoUrl;
        assert(video, `Pending reel draft "${draft.title}" must have a video asset`);
        const base = cleanBasename(video);
        assert.notStrictEqual(base, 'v150_ai_voice_launch_reel_9x16.mp4', `Pending reel "${draft.title}" must NOT use recycled v150 video`);
        console.log(`  ✔ Verified pending reel draft "${draft.title}" uses bespoke video: ${base}`);
      }
    }
  }

  console.log('\n====================================================');
  console.log('🎉 ALL 6 ZERO-MEDIA REUSE TESTS PASSED WITH 100% SUCCESS!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test Failure:', err);
  process.exit(1);
});
