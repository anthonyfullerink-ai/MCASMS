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
    const licenseKey = (payload.licenseKey || '').trim().toUpperCase();

    // Enforce Pro License Requirement: Voice Receptionist is strictly an add-on for Pro ($149)
    const isProKey = licenseKey && (
      licenseKey.startsWith('MCAS-PRO-') ||
      licenseKey.startsWith('MCAT-PRO-') ||
      licenseKey.includes('PRO-DEMO')
    );

    if (!isProKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'The AI Voice Receptionist is an exclusive add-on requiring MissedCallAutoSMS Pro. Please provide your active Pro License Key (e.g. MCAS-PRO-...) or choose our Autonomous Front Desk Bundle.'
        })
      };
    }

    const tier = (payload.tier || 'starter').toLowerCase();
    const isBusiness = tier.includes('biz') || tier.includes('business') || tier.includes('300');
    const unitAmount = isBusiness ? '8900' : '2900';
    const quotaMinutes = isBusiness ? 300 : 45;
    const overageRate = isBusiness ? '0.20' : '0.25';
    const tierName = isBusiness ? 'voice_business' : 'voice_starter';
    const planTitle = isBusiness ? 'Business AI Voice Receptionist ($89/mo)' : 'Starter AI Voice Receptionist ($29/mo)';

    const postData = {
      'mode': 'subscription',
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `24/7 ${planTitle}`,
      'line_items[0][price_data][product_data][description]': `${quotaMinutes} Included Monthly Pooled Minutes ($${overageRate}/min overage) • *71 Carrier Conditional Forwarding (Bound to Pro Key ${licenseKey})`,
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
        licenseKey: licenseKey,
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
