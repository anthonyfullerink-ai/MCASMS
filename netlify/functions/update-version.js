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
      versionCode: parseInt(payload.versionCode, 10) || 4,
      versionName: payload.versionName || '1.1.2',
      downloadUrl: payload.downloadUrl || 'https://raw.githubusercontent.com/anthonyfullerink-ai/MCASMS/main/app-debug.apk',
      releaseNotes: payload.releaseNotes || 'Performance improvements and live Stripe diagnostics verification.',
      mandatory: Boolean(payload.mandatory),
      minSupportedVersion: parseInt(payload.minSupportedVersion, 10) || 1,
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
