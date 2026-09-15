const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

// Load .env file
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

async function run() {
  const env = loadEnv();
  const apiKey = (process.argv[2] || env.STRIPE_SECRET_KEY || '').trim();

  if (!apiKey || !apiKey.startsWith('sk_') || apiKey.includes('your_secret_key_here')) {
    console.error('❌ Error: Missing or invalid STRIPE_SECRET_KEY in .env file.');
    console.error('👉 Open .env and set: STRIPE_SECRET_KEY=sk_test_...');
    process.exit(1);
  }

  console.log(`⚡ Connecting to Stripe API with key (${apiKey.substring(0, 7)}...)...`);

  try {
    // 1. Create Product
    console.log('1. Creating Stripe Product...');
    const product = await stripeRequest('/v1/products', {
      name: 'Missed Call Auto SMS - Lifetime License',
      description: 'Standalone Android Appliance License. 0 Monthly Fees, 100% A2P 10DLC Exempt.'
    }, apiKey);
    console.log(`✅ Product Created: ${product.id}`);

    // 2. Create Price ($49.99 USD)
    console.log('2. Creating $49.99 Price...');
    const price = await stripeRequest('/v1/prices', {
      product: product.id,
      unit_amount: 4999, // $49.99 in cents
      currency: 'usd'
    }, apiKey);
    console.log(`✅ Price Created: ${price.id}`);

    // 3. Create Payment Link
    console.log('3. Generating Payment Link...');
    const paymentLink = await stripeRequest('/v1/payment_links', {
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': 1,
      'after_completion[type]': 'hosted_confirmation'
    }, apiKey);

    console.log(`\n🎉 SUCCESS! Stripe Payment Link Generated:\n👉 ${paymentLink.url}\n`);

    // 4. Update sales_landing_page.html
    const landingPath = path.join(__dirname, '..', 'sales_landing_page.html');
    if (fs.existsSync(landingPath)) {
      let html = fs.readFileSync(landingPath, 'utf8');
      const replacement = `function initiateStripeCheckout() {\n        window.location.href = "${paymentLink.url}";\n    }`;
      html = html.replace(/function initiateStripeCheckout\(\)\s*\{[^}]*\}/g, replacement);
      fs.writeFileSync(landingPath, html, 'utf8');
      console.log(`✅ Updated sales_landing_page.html with your live Stripe Payment Link!`);
    }
  } catch (err) {
    console.error(`❌ Stripe API Error: ${err.message}`);
  }
}

run();
