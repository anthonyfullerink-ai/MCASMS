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
      // 24/7 AI VOICE RECEPTIONIST: $9.99/mo (15 Free Test Minutes + Metered $0.25/min Usage)
      postData = {
        'mode': 'subscription',
        'payment_method_types[0]': 'card',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': '999',
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][price_data][product_data][name]': 'Missed Call Auto SMS - 24/7 AI Voice Receptionist ($9.99/mo)',
        'line_items[0][price_data][product_data][description]': '24/7 Conversational AI Voice Phone Receptionist • 15 Free Test Minutes on Signup • Metered $0.25/min Usage in $10 Credit Packs • Native SIM Confirmation SMS • 1-Tap *71 Carrier Transfer',
        'line_items[0][quantity]': '1',
        'subscription_data[metadata][tier]': 'voice_receptionist',
        'subscription_data[metadata][monthly_fee]': '9.99',
        'subscription_data[metadata][business_name]': businessName,
        'metadata[tier]': 'voice_receptionist',
        'metadata[monthly_fee]': '9.99',
        'metadata[include_voice]': 'true',
        'metadata[business_name]': businessName,
        'success_url': 'https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}&tier=voice_receptionist',
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
