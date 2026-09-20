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
      // BUNDLE: Pro Lifetime ($149.99 One-Time) + 24/7 AI Voice Receptionist ($0.00 Today, 14-Day Free Trial, then $29/mo)
      postData = {
        'mode': 'subscription',
        'payment_method_types[0]': 'card',
        
        // Item 1: Pro Automation Lifetime License ($149.99 upfront)
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': '14999',
        'line_items[0][price_data][product_data][name]': 'Missed Call Auto SMS - Pro Automation Edition (Lifetime)',
        'line_items[0][price_data][product_data][description]': 'Lifetime Appliance License • Dual SIM Carrier Routing • Unlimited End-to-End™ Webhook Gateway (n8n/Zapier) • 100% A2P 10DLC Exempt',
        'line_items[0][quantity]': '1',

        // Item 2: 24/7 Turnkey AI Voice Receptionist ($29.00/mo with 14-day free trial)
        'line_items[1][price_data][currency]': 'usd',
        'line_items[1][price_data][unit_amount]': '2900',
        'line_items[1][price_data][recurring][interval]': 'month',
        'line_items[1][price_data][product_data][name]': '24/7 AI Voice Receptionist Add-On (Turnkey Managed)',
        'line_items[1][price_data][product_data][description]': '14-Day Free Trial ($0 today) • Auto-renews at $29/mo for 200 included mins • *71 Carrier Conditional Forwarding & Dedicated Local Line',
        'line_items[1][quantity]': '1',

        'subscription_data[trial_period_days]': '14',
        'subscription_data[metadata][tier]': 'pro_plus_voice',
        'subscription_data[metadata][business_name]': businessName,
        'metadata[tier]': 'pro_plus_voice',
        'metadata[include_voice]': 'true',
        'metadata[business_name]': businessName,
        'success_url': 'https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}&tier=pro_voice&bundle=true',
        'cancel_url': 'https://missedcallautosms.com/#checkout'
      };
    } else {
      // STANDALONE: Pro Lifetime ($149.99 One-Time)
      postData = {
        'mode': 'payment',
        'payment_method_types[0]': 'card',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': '14999',
        'line_items[0][price_data][product_data][name]': 'Missed Call Auto SMS - Pro Automation Edition (Lifetime)',
        'line_items[0][price_data][product_data][description]': 'Lifetime Appliance License • Dual SIM Carrier Routing • Unlimited End-to-End™ Webhook Gateway (n8n/Zapier) • 100% A2P 10DLC Exempt',
        'line_items[0][quantity]': '1',
        'metadata[tier]': 'pro_automation',
        'metadata[include_voice]': 'false',
        'metadata[business_name]': businessName,
        'success_url': 'https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}&tier=pro',
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
