const https = require('https');
const querystring = require('querystring');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method Not Allowed' }) };
  }

  if (!STRIPE_SECRET_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'STRIPE_SECRET_KEY is not configured in Netlify environment variables.'
      })
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const customerEmail = (payload.email || '').trim();
    const businessName = (payload.businessName || 'Apex Trade Services').trim();
    const licenseKey = (payload.licenseKey || '').trim();

    const postData = {
      'mode': 'subscription',
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': '24/7 AI Voice Receptionist (Turnkey Managed)',
      'line_items[0][price_data][product_data][description]': '14-Day Free Trial ($0 today) • Auto-renews at $29/mo for 200 included minutes & carrier forwarding',
      'line_items[0][price_data][unit_amount]': '2900', // $29.00
      'line_items[0][price_data][recurring][interval]': 'month',
      'subscription_data[trial_period_days]': '14',      // 14-Day Auto-Billing Free Trial
      'subscription_data[metadata][tier]': 'managed_voice_pro',
      'subscription_data[metadata][business_name]': businessName,
      'subscription_data[metadata][license_key]': licenseKey,
      'success_url': 'https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}&tier=managed_voice_pro',
      'cancel_url': 'https://missedcallautosms.com/#pricing'
    };

    if (customerEmail) {
      postData['customer_email'] = customerEmail;
    }

    const session = await stripeApiRequest('/v1/checkout/sessions', 'POST', postData);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
        trialPeriodDays: 14
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
