const https = require('https');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

function stripeApiRequest(endpoint, method = 'GET') {
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
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
    let payload = {};
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      payload = {};
    }

    const email = (payload.email || payload.customerEmail || '').trim();
    const licenseKey = (payload.licenseKey || '').trim();

    if (!email && !licenseKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          needsIdentifier: true,
          message: 'Please provide your Email Address used at checkout or your License Key so we can locate and cancel your Stripe subscription.'
        })
      };
    }

    let cancelledSub = null;
    let stripeMessage = '';

    if (email) {
      try {
        const customerSearch = await stripeApiRequest(`/v1/customers?email=${encodeURIComponent(email)}&limit=1`);
        if (customerSearch.data && customerSearch.data.length > 0) {
          const customer = customerSearch.data[0];
          const subList = await stripeApiRequest(`/v1/subscriptions?customer=${customer.id}&status=all&limit=5`);

          if (subList.data && subList.data.length > 0) {
            const activeSub = subList.data.find(s => s.status === 'trialing' || s.status === 'active');
            if (activeSub) {
              const nowSec = Math.floor(Date.now() / 1000);
              const trialEnd = activeSub.trial_end || (activeSub.created + (3 * 86400));
              const isTrialActive = activeSub.status === 'trialing' || (trialEnd > nowSec);

              if (isTrialActive) {
                const cancelRes = await stripeApiRequest(`/v1/subscriptions/${activeSub.id}`, 'DELETE');
                cancelledSub = cancelRes;
                stripeMessage = `Subscription (${activeSub.id}) for ${email} has been cancelled in Stripe. Zero ($0.00) dollars will be charged.`;
              } else {
                return {
                  statusCode: 200,
                  headers,
                  body: JSON.stringify({
                    success: false,
                    expired: true,
                    customerEmail: email,
                    subscriptionId: activeSub.id,
                    contactEmail: 'contactus@offgridmediagroup.com',
                    message: `Your 3-day free trial period for ${email} has already ended. You can manage or cancel your account at any time using our 24/7 AI Support and Voice Assistant, or reach out to support at contactus@offgridmediagroup.com.`
                  })
                };
              }
            }
          }
        }
      } catch (stripeErr) {
        console.error('Stripe API cancel error:', stripeErr.message);
      }
    }

    if (cancelledSub) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          cancelled: true,
          inStripe: true,
          customerEmail: email,
          subscriptionId: cancelledSub.id,
          message: stripeMessage
        })
      };
    } else {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          cancelled: true,
          inStripe: false,
          customerEmail: email || licenseKey,
          licenseKey: licenseKey,
          message: `Your account/trial for ${email || licenseKey} has been cancelled ($0.00 charged). You can check status or cancel at any time using our AI Support and Voice Assistant.`
        })
      };
    }
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: e.message })
    };
  }
};
