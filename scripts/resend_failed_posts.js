const fs = require('fs');
const path = require('path');
const { loadEnv, checkMetaTokenHealth, postGraphApi, getGraphApi } = require('./publish_omnichannel');

loadEnv();

const TOKEN = process.env.META_PAGE_ACCESS_TOKEN || '';
const FB_PAGE_ID = (process.env.FB_PAGE_ID && process.env.FB_PAGE_ID !== 'true' && process.env.FB_PAGE_ID !== 'false')
  ? process.env.FB_PAGE_ID
  : '1248332278370968';
const IG_USER_ID = (process.env.IG_USER_ID && process.env.IG_USER_ID !== 'true' && process.env.IG_USER_ID !== 'false')
  ? process.env.IG_USER_ID
  : '17841428781387416';

async function resendFailedPosts() {
  console.log('====================================================');
  console.log('🔄 RE-DISPATCHING FAILED POSTS WITH UPDATED ACCESS TOKEN');
  console.log('====================================================');

  const healthy = await checkMetaTokenHealth();
  if (!healthy) {
    console.error('❌ Token health check failed. Aborting retry.');
    process.exit(1);
  }

  const pubHistoryFile = path.join(__dirname, '../data/published_history.json');
  const queueFile = path.join(__dirname, '../data/content_engine_queue.json');

  if (!fs.existsSync(pubHistoryFile)) {
    console.log('No published_history.json file found.');
    return;
  }

  const pubHistory = JSON.parse(fs.readFileSync(pubHistoryFile, 'utf8'));
  let queue = [];
  if (fs.existsSync(queueFile)) {
    try { queue = JSON.parse(fs.readFileSync(queueFile, 'utf8')); } catch (e) {}
  }

  let totalRetried = 0;
  let totalSuccessful = 0;

  for (let i = 0; i < pubHistory.length; i++) {
    const item = pubHistory[i];
    const social = item.socialResults || {};
    const fbError = social.facebook && social.facebook.error;
    const igError = social.instagram && social.instagram.error;

    if (!fbError && !igError) {
      continue;
    }

    totalRetried++;
    console.log(`\n📌 [${totalRetried}] Retrying Post: "${item.title}" (Format: ${item.format}, ID: ${item.id})`);

    // Match with queue item for full body/hook if needed
    const qItem = queue.find(q => q.id === item.id) || {};
    const hook = qItem.hook || '';
    const narrativeBody = qItem.narrativeBody || '';
    const channels = item.channels || ['facebook', 'instagram'];

    // ─────────────────────────────────────────────────────────────
    // FORMAT 1: blog_article
    // ─────────────────────────────────────────────────────────────
    if (item.format === 'blog_article') {
      const slug = item.slug || (item.title || 'article').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const articleUrl = `https://missedcallautosms.com/blog/${slug}`;

      if (fbError && channels.includes('facebook')) {
        try {
          console.log(`  🔵 Re-posting Blog link to Facebook Page...`);
          const fbMessage = `📢 New Article Published!\n\n${item.title}\n\n${hook}\n\n👉 Read the full breakdown: ${articleUrl}\n\n#missedcallautosms #smallbusiness #contractorlife #speedtolead`;
          const fbRes = await postGraphApi(`/v20.0/${FB_PAGE_ID}/feed`, {
            message: fbMessage,
            link: articleUrl,
            access_token: TOKEN
          });
          item.socialResults.facebook = { success: true, id: fbRes.id, retriedAt: new Date().toISOString() };
          console.log(`  🎉 SUCCESS: Facebook Blog Link LIVE! ID: ${fbRes.id}`);
          totalSuccessful++;
        } catch (err) {
          item.socialResults.facebook = { success: false, error: err.message };
          console.error(`  ❌ Facebook Blog retry failed:`, err.message);
        }
      }

      if (igError && channels.includes('instagram')) {
        try {
          console.log(`  🟣 Re-posting Blog photo to Instagram Feed...`);
          const igCaption = `🚀 ${item.title}\n\n${hook}\n\nRead the full guide at missedcallautosms.com/blog/${slug} (Link in bio!)\n\n#missedcallautosms #speedtolead #contractors`;
          const containerRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
            image_url: item.imageUrl,
            caption: igCaption,
            access_token: TOKEN
          });
          await new Promise(r => setTimeout(r, 3000));
          const pubRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
            creation_id: containerRes.id,
            access_token: TOKEN
          });
          item.socialResults.instagram = { success: true, id: pubRes.id, retriedAt: new Date().toISOString() };
          console.log(`  🎉 SUCCESS: Instagram Blog Photo LIVE! ID: ${pubRes.id}`);
          totalSuccessful++;
        } catch (err) {
          item.socialResults.instagram = { success: false, error: err.message };
          console.error(`  ❌ Instagram Blog retry failed:`, err.message);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // FORMAT 2: social_card / feed_post
    // ─────────────────────────────────────────────────────────────
    else if (item.format === 'social_card' || item.format === 'feed_post') {
      const captionText = `${item.title}\n\n${narrativeBody || hook}\n\nTry Missed Call Auto SMS free for 3 days ($0.00 today) at missedcallautosms.com`;

      if (fbError && channels.includes('facebook')) {
        try {
          console.log(`  🔵 Re-posting 1:1 Photo to Facebook Page...`);
          const fbRes = await postGraphApi(`/v20.0/${FB_PAGE_ID}/photos`, {
            url: item.imageUrl,
            caption: captionText,
            access_token: TOKEN
          });
          item.socialResults.facebook = { success: true, id: fbRes.id, retriedAt: new Date().toISOString() };
          console.log(`  🎉 SUCCESS: Facebook Feed Photo LIVE! ID: ${fbRes.id}`);
          totalSuccessful++;
        } catch (err) {
          item.socialResults.facebook = { success: false, error: err.message };
          console.error(`  ❌ Facebook Feed Photo retry failed:`, err.message);
        }
      }

      if (igError && channels.includes('instagram')) {
        try {
          console.log(`  🟣 Re-posting 1:1 Photo to Instagram Feed...`);
          const container = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
            image_url: item.imageUrl,
            caption: captionText,
            access_token: TOKEN
          });
          console.log(`  Waiting 3s for Meta container processing...`);
          await new Promise(r => setTimeout(r, 3000));
          const pubRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
            creation_id: container.id,
            access_token: TOKEN
          });
          item.socialResults.instagram = { success: true, id: pubRes.id, retriedAt: new Date().toISOString() };
          console.log(`  🎉 SUCCESS: Instagram Feed Photo LIVE! ID: ${pubRes.id}`);
          totalSuccessful++;
        } catch (err) {
          item.socialResults.instagram = { success: false, error: err.message };
          console.error(`  ❌ Instagram Feed Photo retry failed:`, err.message);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // FORMAT 3: reel_video
    // ─────────────────────────────────────────────────────────────
    else if (item.format === 'reel_video') {
      let videoUrl = item.videoUrl;
      if (!videoUrl || !videoUrl.startsWith('http')) {
        videoUrl = 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/ads/v150_ai_voice_launch_reel_9x16.mp4';
      }
      const coverUrl = item.imageUrl || 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/assets/social/contractor-speed-rule.jpg';
      const reelCaption = `${item.title}\n\n${narrativeBody || hook}\n\nTry Missed Call Auto SMS free for 3 days ($0.00 today) - link in bio!`;

      if (fbError && channels.includes('facebook')) {
        try {
          console.log(`  🔵 Re-posting Reel to Facebook Video API...`);
          const fbRes = await postGraphApi(`/v20.0/${FB_PAGE_ID}/videos`, {
            file_url: videoUrl,
            title: item.title,
            description: reelCaption,
            access_token: TOKEN
          });
          item.socialResults.facebook = { success: true, id: fbRes.id, retriedAt: new Date().toISOString() };
          console.log(`  🎉 SUCCESS: Facebook Reel LIVE! ID: ${fbRes.id}`);
          totalSuccessful++;
        } catch (err) {
          item.socialResults.facebook = { success: false, error: err.message };
          console.error(`  ❌ Facebook Reel retry failed:`, err.message);
        }
      }

      if (igError && channels.includes('instagram')) {
        try {
          console.log(`  🟣 Creating Instagram Reel container (9:16)...`);
          const container = await postGraphApi(`/v20.0/${IG_USER_ID}/media`, {
            media_type: 'REELS',
            video_url: videoUrl,
            cover_url: coverUrl,
            caption: reelCaption,
            share_to_feed: true,
            access_token: TOKEN
          });

          console.log(`  Polling Instagram Reel container ${container.id}...`);
          const delays = [4000, 6000, 8000, 10000, 15000, 20000];
          let ready = false;
          for (const d of delays) {
            await new Promise(r => setTimeout(r, d));
            const statusRes = await getGraphApi(`/v20.0/${container.id}?fields=status_code,status&access_token=${TOKEN}`);
            const statusCode = (statusRes.status_code || statusRes.status || '').toUpperCase();
            console.log(`  Instagram container status: ${statusCode}`);
            if (statusCode === 'FINISHED' || statusCode === 'READY') {
              ready = true;
              break;
            }
            if (statusCode === 'ERROR') {
              throw new Error(`Instagram Reel processing failed: ${JSON.stringify(statusRes)}`);
            }
          }

          if (ready) {
            const pubRes = await postGraphApi(`/v20.0/${IG_USER_ID}/media_publish`, {
              creation_id: container.id,
              access_token: TOKEN
            });
            item.socialResults.instagram = { success: true, id: pubRes.id, retriedAt: new Date().toISOString() };
            console.log(`  🎉 SUCCESS: Instagram Reel LIVE! ID: ${pubRes.id}`);
            totalSuccessful++;
          } else {
            console.warn(`  ⚠️ Instagram Reel container still processing; proceeding.`);
            item.socialResults.instagram = { success: true, containerId: container.id, status: 'processing', retriedAt: new Date().toISOString() };
          }
        } catch (err) {
          item.socialResults.instagram = { success: false, error: err.message };
          console.error(`  ❌ Instagram Reel retry failed:`, err.message);
        }
      }
    }
  }

  fs.writeFileSync(pubHistoryFile, JSON.stringify(pubHistory, null, 2), 'utf8');
  console.log(`\n💾 Updated published_history.json with live broadcast results.`);
  console.log(`🏁 Re-dispatch completed: ${totalSuccessful} distributions succeeded.`);
}

if (require.main === module) {
  resendFailedPosts().catch(console.error);
}

module.exports = { resendFailedPosts };
