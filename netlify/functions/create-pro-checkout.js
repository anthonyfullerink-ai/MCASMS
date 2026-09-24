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
    const plan = (payload.plan || 'pro').toLowerCase().trim(); // 'flagship', 'pro', or 'pro_upgrade'
    const customerEmail = (payload.email || '').trim();
    const businessName = (payload.businessName || 'Apex Business').trim();
    const licenseKey = (payload.licenseKey || '').trim().toUpperCase();

    // Fallback direct payment links if no dynamic session or if no order bump
    const FLAGSHIP_DIRECT_LINK = "https://buy.stripe.com/3cI9AT49g2X07Q41ux2go0a";
    const PRO_DIRECT_LINK = "https://buy.stripe.com/6oU9ATbBIeFI8U86OR2go0g";
    const PRO_UPGRADE_DIRECT_LINK = "https://buy.stripe.com/bJe14neNU9loc6kehj2go0h";
    const VOICE_ONLY_LINK = "https://buy.stripe.com/4gMeVdcFMaps6M0b572go0f";

    // If no voice bump requested and standard flagship or pro plan, return direct Stripe links immediately
    if (!includeVoice && plan === 'flagship') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          checkoutUrl: FLAGSHIP_DIRECT_LINK,
          plan,
          includeVoice: false
        })
      };
    }

    if (!includeVoice && plan === 'pro') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          checkoutUrl: PRO_DIRECT_LINK,
          plan,
          includeVoice: false
        })
      };
    }

    // Custom stripe key header fallback (e.g. from local owner testing)
    const customKey = event.headers['x-stripe-key'];
    const activeStripeKey = customKey || STRIPE_SECRET_KEY;

    // Fallback if Stripe key is not configured in environment
    if (!activeStripeKey) {
      let fallbackUrl = plan === 'flagship' ? FLAGSHIP_DIRECT_LINK : PRO_DIRECT_LINK;
      if (includeVoice && plan === 'voice_only') fallbackUrl = VOICE_ONLY_LINK;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          checkoutUrl: fallbackUrl,
          fallback: true,
          plan,
          includeVoice
        })
      };
    }

    let postData = {};

    if (includeVoice) {
      // APPLIANCE + 24/7 AI VOICE RECEPTIONIST COMBO ($9.99/mo)
      // Combines one-time appliance license fee with recurring $9.99/mo voice subscription
      let applianceAmount = '29900';
      let applianceName = 'Missed Call Auto SMS - Pro Automation Gateway (Perpetual)';
      let applianceDesc = 'Lifetime Pro License • 1-Year Cloud Relay API Included • Unlimited n8n/Make Webhooks • Dual SIM Routing • 100% A2P 10DLC Carrier Exempt';
      let tierCode = 'pro_plus_voice';

      if (plan === 'flagship') {
        applianceAmount = '4999';
        applianceName = "Missed Call Auto SMS - Founder's Flagship Appliance (Lifetime)";
        applianceDesc = "Founder's Lifetime Appliance License • 1 Android Phone Bound • 100% A2P 10DLC Carrier Exempt";
        tierCode = 'flagship_plus_voice';
      } else if (plan === 'pro_upgrade') {
        applianceAmount = '24999';
        applianceName = 'Missed Call Auto SMS - Pro Gateway License Upgrade';
        applianceDesc = 'Existing Owner Upgrade to Lifetime Pro Gateway • 1-Year Cloud Relay API Included • Dual SIM Routing';
        tierCode = 'pro_upgrade_plus_voice';
      }

      postData = {
        'mode': 'subscription',
        'payment_method_types[0]': 'card',
        // Line Item 0: One-time Appliance License
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': applianceAmount,
        'line_items[0][price_data][product_data][name]': applianceName,
        'line_items[0][price_data][product_data][description]': applianceDesc,
        'line_items[0][quantity]': '1',
        // Line Item 1: Recurring $9.99/mo AI Voice Receptionist Add-On
        'line_items[1][price_data][currency]': 'usd',
        'line_items[1][price_data][unit_amount]': '999',
        'line_items[1][price_data][recurring][interval]': 'month',
        'line_items[1][price_data][product_data][name]': 'Missed Call Auto SMS - 24/7 AI Voice Receptionist Add-On ($9.99/mo)',
        'line_items[1][price_data][product_data][description]': '24/7 Conversational AI Voice Phone Receptionist • 15 Free Test Minutes on Activation • Metered Usage in Credit Packs • Instant Carrier SIM Confirmation SMS',
        'line_items[1][quantity]': '1',
        // Subscription Metadata
        'subscription_data[metadata][tier]': tierCode,
        'subscription_data[metadata][plan]': plan,
        'subscription_data[metadata][include_voice]': 'true',
        'subscription_data[metadata][monthly_fee]': '9.99',
        'subscription_data[metadata][business_name]': businessName,
        'subscription_data[metadata][license_key]': licenseKey,
        // Session Metadata
        'metadata[tier]': tierCode,
        'metadata[plan]': plan,
        'metadata[include_voice]': 'true',
        'metadata[monthly_fee]': '9.99',
        'metadata[business_name]': businessName,
        'metadata[license_key]': licenseKey,
        'success_url': `https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}&tier=${tierCode}`,
        'cancel_url': 'https://missedcallautosms.com/#checkout'
      };
    } else {
      // Standalone Pro Upgrade ($249.99 One-Time)
      postData = {
        'mode': 'payment',
        'payment_method_types[0]': 'card',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': '24999',
        'line_items[0][price_data][product_data][name]': 'Missed Call Auto SMS - Pro Gateway License Upgrade',
        'line_items[0][price_data][product_data][description]': 'Existing Owner Upgrade to Lifetime Pro Gateway • 1-Year Cloud Relay API Included • Dual SIM Routing',
        'line_items[0][quantity]': '1',
        'metadata[tier]': 'pro_upgrade',
        'metadata[plan]': 'pro_upgrade',
        'metadata[include_voice]': 'false',
        'metadata[business_name]': businessName,
        'metadata[license_key]': licenseKey,
        'success_url': 'https://missedcallautosms.com/success.html?session_id={CHECKOUT_SESSION_ID}&tier=pro_upgrade',
        'cancel_url': 'https://missedcallautosms.com/#checkout'
      };
    }

    if (customerEmail) {
      postData['customer_email'] = customerEmail;
    }
    if (licenseKey) {
      postData['client_reference_id'] = licenseKey;
    }

    const session = await stripeApiRequest('/v1/checkout/sessions', 'POST', postData);
    console.log(`💳 [STRIPE CHECKOUT CREATED] Session: ${session.id} (Plan: ${plan}, Include Voice: ${includeVoice})`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
        plan,
        includeVoice
      })
    };
  } catch (err) {
    console.error('Stripe checkout creation error:', err.message);
    const fallbackUrl = "https://buy.stripe.com/6oU9ATbBIeFI8U86OR2go0g";
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
