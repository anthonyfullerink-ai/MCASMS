/**
 * media_guard.js
 * Centralized, non-bypassable guard enforcing 100% media uniqueness
 * for all images and videos across Missed Call Auto SMS.
 *
 * Workspace Mandate: Zero Image & Video Reuse.
 * Every single post, reel, and asset must tell its own visual story.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const BLOG_POSTS_FILE = path.join(__dirname, '../blog/posts.json');
const PUB_HISTORY_FILE = path.join(DATA_DIR, 'published_history.json');
const SOCIAL_HISTORY_FILE = path.join(DATA_DIR, 'social_publish_history.json');
const CAMPAIGN_LOGS_FILE = path.join(DATA_DIR, 'campaign_logs.json');
const CE_QUEUE_FILE = path.join(DATA_DIR, 'content_engine_queue.json');

function cleanBasename(assetPathOrUrl) {
  if (!assetPathOrUrl || typeof assetPathOrUrl !== 'string') return '';
  try {
    const parsed = new URL(assetPathOrUrl);
    return path.basename(parsed.pathname).toLowerCase().trim();
  } catch {
    return path.basename(assetPathOrUrl).toLowerCase().trim();
  }
}

/**
 * Returns a Set of all video basenames that have ever been published or queued.
 */
function getAllUsedVideos(excludeId = null) {
  const used = new Set();

  // 1. Check published_history.json
  if (fs.existsSync(PUB_HISTORY_FILE)) {
    try {
      const history = JSON.parse(fs.readFileSync(PUB_HISTORY_FILE, 'utf8'));
      for (const item of history) {
        if (excludeId && item.id === excludeId) continue;
        const v = item.videoUrl || item.videoAsset;
        if (v) {
          const base = cleanBasename(v);
          if (base) used.add(base);
        }
      }
    } catch (e) {
      console.warn('[MediaGuard] Error reading published_history.json:', e.message);
    }
  }

  // 2. Check campaign_logs.json
  if (fs.existsSync(CAMPAIGN_LOGS_FILE)) {
    try {
      const logs = JSON.parse(fs.readFileSync(CAMPAIGN_LOGS_FILE, 'utf8'));
      for (const log of logs) {
        if (log.reelVideo) {
          const base = cleanBasename(log.reelVideo);
          if (base) used.add(base);
        }
      }
    } catch (e) {}
  }

  // 3. Check published items in content_engine_queue.json
  if (fs.existsSync(CE_QUEUE_FILE)) {
    try {
      const queue = JSON.parse(fs.readFileSync(CE_QUEUE_FILE, 'utf8'));
      for (const item of queue) {
        if (excludeId && item.id === excludeId) continue;
        if (item.status === 'published' && (item.videoAsset || item.videoUrl)) {
          const base = cleanBasename(item.videoAsset || item.videoUrl);
          if (base) used.add(base);
        }
      }
    } catch (e) {}
  }

  return used;
}

/**
 * Returns a Set of all image basenames that have ever been published.
 */
function getAllUsedImages(excludeSlugOrId = null) {
  const used = new Set();

  // 1. Check blog/posts.json
  if (fs.existsSync(BLOG_POSTS_FILE)) {
    try {
      const blogPosts = JSON.parse(fs.readFileSync(BLOG_POSTS_FILE, 'utf8'));
      for (const p of blogPosts) {
        if (excludeSlugOrId && p.slug === excludeSlugOrId) continue;
        const img = p.imageUrl || p.image;
        if (img) {
          const base = cleanBasename(img);
          if (base) used.add(base);
        }
      }
    } catch (e) {}
  }

  // 2. Check published_history.json
  if (fs.existsSync(PUB_HISTORY_FILE)) {
    try {
      const history = JSON.parse(fs.readFileSync(PUB_HISTORY_FILE, 'utf8'));
      for (const item of history) {
        if (excludeSlugOrId && (item.id === excludeSlugOrId || item.slug === excludeSlugOrId)) continue;
        const img = item.imageUrl || item.imageAsset || item.baseImage;
        if (img) {
          const base = cleanBasename(img);
          if (base) used.add(base);
        }
      }
    } catch (e) {}
  }

  return used;
}

/**
 * Strict guard: Returns true if the video has already been published.
 */
function isVideoAlreadyUsed(videoPathOrUrl, excludeId = null) {
  if (!videoPathOrUrl) return false;
  const target = cleanBasename(videoPathOrUrl);
  if (!target) return false;
  const used = getAllUsedVideos(excludeId);
  return used.has(target);
}

/**
 * Strict guard: Returns true if the image has already been published.
 */
function isImageAlreadyUsed(imagePathOrUrl, excludeSlugOrId = null) {
  if (!imagePathOrUrl) return false;
  const target = cleanBasename(imagePathOrUrl);
  if (!target) return false;
  const used = getAllUsedImages(excludeSlugOrId);
  return used.has(target);
}

/**
 * Throws a fatal Error if any media in the post object violates uniqueness.
 */
function assertUniqueMedia(post, excludeId = null) {
  if (!post) throw new Error('[MediaGuard] Post object is null or undefined.');

  // 1. Image Check
  const img = post.imageUrl || post.imageAsset;
  if (img) {
    const baseImg = cleanBasename(img);
    if (isImageAlreadyUsed(img, excludeId || post.id || post.slug)) {
      throw new Error(
        `[ZeroMediaReuseGuard] HARD BLOCK: Image "${baseImg}" has already been used in an existing article or social post. Recycling visuals is strictly prohibited.`
      );
    }
  }

  // 2. Video Check (For reels, video ads, vertical stories)
  const isVideoFormat = post.format === 'reel_video' || post.videoUrl || post.videoAsset;
  if (isVideoFormat) {
    const video = post.videoUrl || post.videoAsset;
    if (!video) {
      throw new Error(
        `[ZeroVideoReuseGuard] HARD BLOCK: Reel/Video "${post.title || post.id}" is missing a video asset. Every reel must have a 100% unique, bespoke video.`
      );
    }
    const baseVideo = cleanBasename(video);
    if (isVideoAlreadyUsed(video, excludeId || post.id)) {
      throw new Error(
        `[ZeroVideoReuseGuard] HARD BLOCK: Video "${baseVideo}" has already been published in a previous post/slot. Recycling video files is strictly prohibited per Workspace Guidelines.`
      );
    }
  }

  return true;
}

module.exports = {
  cleanBasename,
  getAllUsedVideos,
  getAllUsedImages,
  isVideoAlreadyUsed,
  isImageAlreadyUsed,
  assertUniqueMedia
};
