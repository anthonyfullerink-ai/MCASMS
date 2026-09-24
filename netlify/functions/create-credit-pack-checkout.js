const https = require('https');
const querystring = require('querystring');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

const TIERS = {
  '10': { id: 'pack_10', name: 'Missed Call Auto SMS - Starter Credit Pack (40 Mins)', amount: 1000, minutes: 40, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
  'pack_10': { id: 'pack_10', name: 'Missed Call Auto SMS - Starter Credit Pack (40 Mins)', amount: 1000, minutes: 40, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
  '25': { id: 'pack_25', name: 'Missed Call Auto SMS - Growth Credit Pack (115 Mins - Includes 15 Bonus Mins)', amount: 2500, minutes: 115, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
  'pack_25': { id: 'pack_25', name: 'Missed Call Auto SMS - Growth Credit Pack (115 Mins - Includes 15 Bonus Mins)', amount: 2500, minutes: 115, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
  '50': { id: 'pack_50', name: 'Missed Call Auto SMS - Pro Contractor Pack (250 Mins - Includes 50 Bonus Mins)', amount: 5000, minutes: 250, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
  'pack_50': { id: 'pack_50', name: 'Missed Call Auto SMS - Pro Contractor Pack (250 Mins - Includes 50 Bonus Mins)', amount: 5000, minutes: 250, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
  '100': { id: 'pack_100', name: 'Missed Call Auto SMS - Fleet Credit Pack (550 Mins - Includes 150 Bonus Mins)', amount: 10000, minutes: 550, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
  'pack_100': { id: 'pack_100', name: 'Missed Call Auto SMS - Fleet Credit Pack (550 Mins - Includes 150 Bonus Mins)', amount: 10000, minutes: 550, fallbackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' }
};

function stripeApiRequest(endpoint, method = 'GET', postData = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.stripe.com',
      port: 443,
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-stripe-key'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    let tierKey = '10';
    let licenseKey = '';
    let customerEmail = '';
    let refCode = '';

    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      tierKey = (payload.packTier || payload.pack || payload.tier || '10').toString().toLowerCase();
      licenseKey = (payload.licenseKey || payload.key || '').trim().toUpperCase();
      customerEmail = (payload.email || '').trim();
      refCode = (payload.ref || payload.referral_code || '').trim();
    } else {
      const q = event.queryStringParameters || {};
      tierKey = (q.pack || q.packTier || q.tier || '10').toString().toLowerCase();
      licenseKey = (q.key || q.licenseKey || '').trim().toUpperCase();
      customerEmail = (q.email || '').trim();
      refCode = (q.ref || q.referral_code || '').trim();
    }

    const tier = TIERS[tierKey] || TIERS['10'];
    const host = (event.headers && event.headers.host) || 'missedcallautosms.com';

    if (!STRIPE_SECRET_KEY) {
      if (event.httpMethod === 'GET') {
        return {
          statusCode: 302,
          headers: { Location: tier.fallbackUrl }
        };
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          checkoutUrl: tier.fallbackUrl,
          fallback: true,
          tier: tier.id,
          minutes: tier.minutes
        })
      };
    }

    const postData = {
      'mode': 'payment',
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(tier.amount),
      'line_items[0][price_data][product_data][name]': tier.name,
      'line_items[0][price_data][product_data][description]': `Instant addition of +${tier.minutes} minutes to dedicated AI voice line. 100% P2P carrier exempt.`,
      'line_items[0][quantity]': '1',
      'metadata[tier]': 'credit_pack',
      'metadata[pack_tier]': tier.id,
      'metadata[minutes]': String(tier.minutes),
      'metadata[price_dollars]': String(tier.amount / 100),
      'metadata[license_key]': licenseKey,
      'metadata[referral_code]': refCode,
      'metadata[service]': 'voice_credit_reload',
      'success_url': `https://${host}/success.html?session_id={CHECKOUT_SESSION_ID}&type=credit_pack&minutes=${tier.minutes}`,
      'cancel_url': `https://${host}/voice.html`
    };

    if (licenseKey) {
      postData['client_reference_id'] = licenseKey;
    }

    if (customerEmail) {
      postData['customer_email'] = customerEmail;
    }

    const session = await stripeApiRequest('/v1/checkout/sessions', 'POST', postData);

    if (event.httpMethod === 'GET' && !event.headers['accept']?.includes('application/json')) {
      return {
        statusCode: 302,
        headers: { Location: session.url }
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        sessionId: session.id,
        checkoutUrl: session.url,
        tier: tier.id,
        minutes: tier.minutes,
        amount: tier.amount / 100
      })
    };

  } catch (err) {
    console.error('Error creating credit pack checkout session:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: err.message || 'Failed to initialize credit pack checkout'
      })
    };
  }
};
