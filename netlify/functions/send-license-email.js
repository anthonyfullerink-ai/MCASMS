exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    const { customerName, customerEmail, licenseKey, licenseType, price } = payload;
    if (!customerEmail || !licenseKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'customerEmail and licenseKey are required.' })
      };
    }

    const host = event.headers.host || 'missedcallautosms.com';
    const proto = event.headers['x-forwarded-proto'] || 'https';
    const apkDownloadUrl = `${proto}://${host}/MissedCallAutoSMS.apk`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Email with License Key & APK Download Link sent to ${customerEmail}`,
        sentTo: customerEmail,
        licenseKey: licenseKey,
        apkDownloadUrl: apkDownloadUrl
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
