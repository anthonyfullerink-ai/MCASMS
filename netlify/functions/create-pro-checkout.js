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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-stripe-key'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method Not Allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const includeVoice = Boolean(payload.includeVoice);
    const customerEmail = (payload.email || '').trim();
    const businessName = (payload.businessName || 'Pro Business').trim();

    // Custom stripe key header fallback (e.g. from local owner testing)
    const customKey = event.headers['x-stripe-key'];
    const activeStripeKey = customKey || STRIPE_SECRET_KEY;

    // Fallback if Stripe key is not set in environment: return direct Stripe payment links
    if (!activeStripeKey) {
      const fallbackUrl = includeVoice
        ? "https://buy.stripe.com/4gMeVdcFMaps6M0b572go0f" // Direct voice link fallback
        : "https://buy.stripe.com/cNi5kDdJQ558c6k2yB2go0b"; // Direct Pro link fallback
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          checkoutUrl: fallbackUrl,
          fallback: true,
          includeVoice
        })
      };
    }

    let postData = {};

    if (includeVoice) {
      // AUTONOMOUS FRONT DESK BUNDLE: $99.00/mo (Hardware SIM Auto SMS + 24/7 AI Voice, 250 mins)
      postData = {
        'mode': 'subscription',
        'payment_method_types[0]': 'card',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': '9900',
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][price_data][product_data][name]': 'Missed Call Auto SMS - Autonomous Front Desk Bundle ($99/mo)',
        'line_items[0][price_data][product_data][description]': 'All-in-One Autonomous Front Desk • 250 Monthly Pooled Minutes ($0.20/min overage) • Dual SIM Outbound Confirmation SMS • Dedicated Local AI Line (*71 Carrier Transfer)',
        'line_items[0][quantity]': '1',
        'subscription_data[metadata][tier]': 'autonomous_front_desk',
        'subscription_data[metadata][quotaMinutes]': '250',
        'subscription_data[metadata][overageRate]': '0.20',
        'subscription_data[metadata][business_name]': businessName,
        'metadata[tier]': 'autonomous_front_desk',
        'metadata[quotaMinutes]': '250',
        'metadata[overageRate]': '0.20',
        'metadata[include_voice]': 'true',
        'metadata[business_name]': businessName,
        'success_url': 'https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}&tier=autonomous_front_desk',
        'cancel_url': 'https://missedcallautosms.com/#checkout'
      };
    } else {
      // PRO AUTOMATION GATEWAY: $299.00 Perpetual (A2P 10DLC Bypass Gateway + 1-Year Cloud Relay API)
      postData = {
        'mode': 'payment',
        'payment_method_types[0]': 'card',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': '29900',
        'line_items[0][price_data][product_data][name]': 'Missed Call Auto SMS - Pro Automation Gateway (Perpetual)',
        'line_items[0][price_data][product_data][description]': 'Lifetime Pro License • 1-Year Cloud Relay API Included • Unlimited n8n/Make Webhooks • Dual SIM Routing • 100% A2P 10DLC Carrier Exempt',
        'line_items[0][quantity]': '1',
        'metadata[tier]': 'pro_gateway',
        'metadata[include_voice]': 'false',
        'metadata[business_name]': businessName,
        'success_url': 'https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}&tier=pro_gateway',
        'cancel_url': 'https://missedcallautosms.com/#checkout'
      };
    }

    if (customerEmail) {
      postData['customer_email'] = customerEmail;
    }

    const session = await stripeApiRequest('/v1/checkout/sessions', 'POST', postData);
    console.log(`💳 [STRIPE PRO CHECKOUT] Created session: ${session.id} (Include Voice: ${includeVoice})`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
        includeVoice
      })
    };
  } catch (err) {
    console.error('Stripe Pro checkout creation error:', err.message);
    // Graceful fallback to static link so user is never blocked from buying
    const fallbackUrl = "https://buy.stripe.com/cNi5kDdJQ558c6k2yB2go0b";
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        checkoutUrl: fallbackUrl,
        fallback: true,
        notice: err.message
      })
    };
  }
};
