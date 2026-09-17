const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#') && line.includes('=')) {
        const parts = line.split('=');
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
        env[key] = val;
      }
    });
  }
  return env;
}

function stripeRequest(endpoint, postData, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = querystring.stringify(postData);
    const options = {
      hostname: 'api.stripe.com',
      port: 443,
      path: endpoint,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, res => {
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
    req.write(payload);
    req.end();
  });
}

async function createAgencyLinks() {
  const env = loadEnv();
  const apiKey = (process.env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY || '').trim();

  if (!apiKey) {
    console.error('❌ Missing STRIPE_SECRET_KEY in environment.');
    process.exit(1);
  }

  console.log('⚡ Creating Agency Stripe Products and Payment Links...');

  try {
    // 1. Agency 5-Pack ($399)
    console.log('Creating Agency 5-Pack Product ($399)...');
    const prod5 = await stripeRequest('/v1/products', {
      name: 'Missed Call Auto SMS - Agency 5-Pack (Fleet License)',
      description: '5 Pro Android Appliance Licenses + Agency Fleet Management Dashboard. 100% A2P 10DLC Exempt, Zero Monthly Fees.',
      'metadata[tier]': 'agency_5',
      'metadata[seats]': '5'
    }, apiKey);

    const price5 = await stripeRequest('/v1/prices', {
      product: prod5.id,
      unit_amount: 39900,
      currency: 'usd',
      'metadata[tier]': 'agency_5'
    }, apiKey);

    const link5 = await stripeRequest('/v1/payment_links', {
      'line_items[0][price]': price5.id,
      'line_items[0][quantity]': 1,
      'metadata[tier]': 'agency_5',
      'metadata[seats]': '5',
      'after_completion[type]': 'hosted_confirmation'
    }, apiKey);

    console.log(`✅ Agency 5-Pack Link: ${link5.url}`);

    // 2. Agency 10-Pack ($799)
    console.log('Creating Agency 10-Pack Product ($799)...');
    const prod10 = await stripeRequest('/v1/products', {
      name: 'Missed Call Auto SMS - Agency 10-Pack (Fleet License)',
      description: '10 Pro Android Appliance Licenses + Agency Fleet Management Dashboard. 100% A2P 10DLC Exempt, Zero Monthly Fees.',
      'metadata[tier]': 'agency_10',
      'metadata[seats]': '10'
    }, apiKey);

    const price10 = await stripeRequest('/v1/prices', {
      product: prod10.id,
      unit_amount: 79900,
      currency: 'usd',
      'metadata[tier]': 'agency_10'
    }, apiKey);

    const link10 = await stripeRequest('/v1/payment_links', {
      'line_items[0][price]': price10.id,
      'line_items[0][quantity]': 1,
      'metadata[tier]': 'agency_10',
      'metadata[seats]': '10',
      'after_completion[type]': 'hosted_confirmation'
    }, apiKey);

    console.log(`✅ Agency 10-Pack Link: ${link10.url}`);

    const result = {
      agency5: {
        productId: prod5.id,
        priceId: price5.id,
        url: link5.url,
        amount: 399.00
      },
      agency10: {
        productId: prod10.id,
        priceId: price10.id,
        url: link10.url,
        amount: 799.00
      }
    };

    fs.writeFileSync(path.join(__dirname, 'agency_stripe_links.json'), JSON.stringify(result, null, 2));
    console.log('✅ Links saved to tools/agency_stripe_links.json');

  } catch (err) {
    console.error(`❌ Error creating Stripe links: ${err.message}`);
    process.exit(1);
  }
}

createAgencyLinks();
