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

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
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
    let customerEmail = '';
    let businessName = 'Apex Trade Services';
    let licenseKey = '';
    let tier = 'voice_starter';

    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      customerEmail = (payload.email || '').trim();
      businessName = (payload.businessName || 'Apex Trade Services').trim();
      licenseKey = (payload.licenseKey || payload.key || '').trim().toUpperCase();
      tier = (payload.tier || 'voice_starter').toLowerCase();
    } else {
      const q = event.queryStringParameters || {};
      customerEmail = (q.email || '').trim();
      businessName = (q.businessName || 'Apex Trade Services').trim();
      licenseKey = (q.key || q.licenseKey || '').trim().toUpperCase();
      tier = (q.tier || 'voice_starter').toLowerCase();
    }

    const isBusiness = tier.includes('biz') || tier.includes('business') || tier.includes('300') || tier.includes('89');
    const unitAmount = isBusiness ? '8900' : '999';
    const quotaMinutes = isBusiness ? 300 : 10;
    const overageRate = isBusiness ? '0.20' : '0.25';
    const tierName = isBusiness ? 'voice_business' : 'voice_addon';
    const planTitle = isBusiness ? 'Business AI Voice Receptionist ($89/mo)' : '24/7 AI Voice Receptionist ($9.99/mo)';

    const postData = {
      'mode': 'subscription',
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': planTitle,
      'line_items[0][price_data][product_data][description]': `Includes ${quotaMinutes} FREE Minutes on activation • *71 Carrier Conditional Forwarding (Bound to License ${licenseKey || 'Account'})`,
      'line_items[0][price_data][unit_amount]': unitAmount,
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][quantity]': '1',
      'subscription_data[metadata][tier]': tierName,
      'subscription_data[metadata][quotaMinutes]': String(quotaMinutes),
      'subscription_data[metadata][overageRate]': overageRate,
      'subscription_data[metadata][business_name]': businessName,
      'subscription_data[metadata][license_key]': licenseKey,
      'client_reference_id': licenseKey,
      'metadata[license_key]': licenseKey,
      'metadata[tier]': tierName,
      'metadata[quotaMinutes]': String(quotaMinutes),
      'metadata[overageRate]': overageRate,
      'success_url': `https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}&tier=${tierName}`,
      'cancel_url': 'https://missedcallautosms.com/#pricing'
    };

    if (customerEmail) {
      postData['customer_email'] = customerEmail;
    }

    const session = await stripeApiRequest('/v1/checkout/sessions', 'POST', postData);

    if (event.httpMethod === 'GET') {
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
        checkoutUrl: session.url,
        sessionId: session.id,
        licenseKey: licenseKey,
        minutes: quotaMinutes
      })
    };
  } catch (err) {
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 302,
        headers: { Location: 'https://buy.stripe.com/5kQ5kDbBI8hkdao8WZ2go0c' }
      };
    }
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
