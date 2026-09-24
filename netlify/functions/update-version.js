exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    let payload = {};
    if (event.body) {
      try { payload = JSON.parse(event.body); } catch (e) {}
    }

    const version = {
      versionCode: parseInt(payload.versionCode, 10) || 22,
      versionName: payload.versionName || '1.7.5',
      downloadUrl: payload.downloadUrl || 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS.apk',
      proDownloadUrl: payload.proDownloadUrl || 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/MissedCallAutoSMS.apk',
      releaseNotes: payload.releaseNotes || '• 💳 Seamless 1-Tap Credit Pack & Pro Upgrades with Instant Auto-Refresh\n• 🎛️ Dedicated Automations Tab with Full Integration Triggers\n• 🎨 Streamlined Single-Line Navigation Tabs & Responsive Badges\n• ⚡ Direct Carrier SIM Armor & 24/7 AI Voice Receptionist Ready',
      mandatory: Boolean(payload.mandatory !== undefined ? payload.mandatory : true),
      minSupportedVersion: parseInt(payload.minSupportedVersion, 10) || 21,
      updatedAt: new Date().toISOString()
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        mode: 'SERVERLESS_CLOUD',
        message: `Live OTA Version v${version.versionName} (build ${version.versionCode}) processed successfully!`,
        version: version
      })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: e.message })
    };
  }
};
