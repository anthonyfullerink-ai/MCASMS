const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');

function getStripeSecretKey() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY;
  try {
    const envPath = path.resolve(__dirname, '../../.env');
    if (fs.existsSync(envPath)) {
      const match = fs.readFileSync(envPath, 'utf8').match(/STRIPE_SECRET_KEY=(.*)/);
      if (match && match[1]) return match[1].trim();
    }
  } catch (e) {}
  return '';
}

function getStripePublishableKey() {
  if (process.env.STRIPE_PUBLISHABLE_KEY) return process.env.STRIPE_PUBLISHABLE_KEY;
  try {
    const envPath = path.resolve(__dirname, '../../.env');
    if (fs.existsSync(envPath)) {
      const match = fs.readFileSync(envPath, 'utf8').match(/STRIPE_PUBLISHABLE_KEY=(.*)/);
      if (match && match[1]) return match[1].trim();
    }
  } catch (e) {}
  return '';
}

const CREDIT_TIERS = {
  '10': { id: 'pack_10', name: 'Starter Credit Pack (40 Mins)', amount: 1000, minutes: 40 },
  'pack_10': { id: 'pack_10', name: 'Starter Credit Pack (40 Mins)', amount: 1000, minutes: 40 },
  '25': { id: 'pack_25', name: 'Growth Credit Pack (115 Mins)', amount: 2500, minutes: 115 },
  'pack_25': { id: 'pack_25', name: 'Growth Credit Pack (115 Mins)', amount: 2500, minutes: 115 },
  '50': { id: 'pack_50', name: 'Pro Contractor Pack (250 Mins)', amount: 5000, minutes: 250 },
  'pack_50': { id: 'pack_50', name: 'Pro Contractor Pack (250 Mins)', amount: 5000, minutes: 250 },
  '100': { id: 'pack_100', name: 'Fleet Credit Pack (550 Mins)', amount: 10000, minutes: 550 },
  'pack_100': { id: 'pack_100', name: 'Fleet Credit Pack (550 Mins)', amount: 10000, minutes: 550 },
  'pro_upgrade': { id: 'pro_upgrade', name: 'Perpetual Pro Automation Gateway Upgrade', amount: 24999, minutes: 0 },
  'pro_gateway': { id: 'pro_upgrade', name: 'Perpetual Pro Automation Gateway Upgrade', amount: 24999, minutes: 0 },
  'pro': { id: 'pro_upgrade', name: 'Perpetual Pro Automation Gateway Upgrade', amount: 24999, minutes: 0 }
};

function stripeApiRequest(endpoint, method = 'GET', postData = null) {
  return new Promise((resolve, reject) => {
    const key = getStripeSecretKey();
    if (!key) return reject(new Error('STRIPE_SECRET_KEY is not configured'));

    const options = {
      hostname: 'api.stripe.com',
      port: 443,
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    let payload = '';
    if (postData) {
      payload = querystring.stringify(postData);
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

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
    if (payload) req.write(payload);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-stripe-key'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method Not Allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const tierKey = (body.tier || body.packTier || '10').toString().toLowerCase();
    const licenseKey = (body.licenseKey || '').trim().toUpperCase();
    const customerEmail = (body.email || '').trim();

    const tier = CREDIT_TIERS[tierKey] || CREDIT_TIERS['10'];
    const isProUpgrade = tier.id === 'pro_upgrade';

    const postData = {
      'amount': String(tier.amount),
      'currency': 'usd',
      'description': tier.name,
      'metadata[tier]': isProUpgrade ? 'pro_upgrade' : 'credit_pack',
      'metadata[pack_tier]': tier.id,
      'metadata[price_dollars]': String(tier.amount / 100),
      'metadata[license_key]': licenseKey,
      'metadata[service]': isProUpgrade ? 'pro_gateway_upgrade' : 'voice_credit_reload'
    };

    if (customerEmail) {
      postData['receipt_email'] = customerEmail;
      postData['metadata[customer_email]'] = customerEmail;
    }

    if (!isProUpgrade) {
      postData['metadata[minutes]'] = String(tier.minutes);
    }

    const pi = await stripeApiRequest('/v1/payment_intents', 'POST', postData);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        paymentIntent: pi.client_secret,
        publishableKey: getStripePublishableKey()
      })
    };
  } catch (err) {
    console.error('PaymentIntent creation error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: err.message
      })
    };
  }
};
