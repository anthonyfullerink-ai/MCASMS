const https = require('https');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

function stripeApiRequest(endpoint, overrideKey = '') {
  const activeKey = overrideKey || STRIPE_SECRET_KEY;
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.stripe.com',
      port: 443,
      path: endpoint,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${activeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error ? parsed.error.message : body));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-stripe-key'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const reqHeaders = event.headers || {};
  const providedKey = reqHeaders['x-stripe-key'] || (reqHeaders['authorization'] ? reqHeaders['authorization'].replace(/^Bearer\s+/i, '') : '');
  const activeKey = providedKey || STRIPE_SECRET_KEY;

  if (!activeKey) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        connected: false,
        error: "STRIPE_SECRET_KEY is not set in Netlify environment variables.",
        message: "Please enter your Stripe key in the dashboard below or add STRIPE_SECRET_KEY to your Netlify dashboard under Site configuration > Environment variables."
      })
    };
  }

  const start = Date.now();
  try {
    const balance = await stripeApiRequest('/v1/balance', activeKey);
    const latencyMs = Date.now() - start;
    const isLive = balance.livemode !== undefined ? balance.livemode : true;
    const currency = (balance.available || []).map(a => a.currency.toUpperCase()).join(', ') || 'USD';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        connected: true,
        livemode: isLive,
        mode: isLive ? 'LIVE PRODUCTION' : 'TEST MODE',
        currency: currency,
        latencyMs: latencyMs,
        checkoutTrialUrl: 'https://buy.stripe.com/3cI9AT49g2X07Q41ux2go0a?trial_period_days=3',
        checkoutLifetimeUrl: 'https://buy.stripe.com/3cI9AT49g2X07Q41ux2go0a',
        message: 'Stripe API connection verified and active'
      })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        connected: false,
        error: err.message,
        message: 'Stripe API error: ' + err.message
      })
    };
  }
};
