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

  if (!apiKey || apiKey.includes('your_secret_key_here')) {
    console.error('❌ Error: Missing STRIPE_SECRET_KEY in .env file.');
    console.error('👉 Open .env and set: STRIPE_SECRET_KEY=<your_stripe_secret_key>');
    process.exit(1);
  }

  console.log(`⚡ Connecting to Stripe API with key (${apiKey.substring(0, 7)}...)...`);

  try {
    // 1. Create Standard Product & Price ($49.99 USD)
    console.log('1. Creating Standard Stripe Product ($49.99)...');
    const stdProduct = await stripeRequest('/v1/products', {
      name: 'Missed Call Auto SMS - Lifetime License',
      description: 'Standalone Android Appliance License. 0 Monthly Fees, 100% A2P 10DLC Exempt.'
    }, apiKey);
    console.log(`✅ Standard Product Created: ${stdProduct.id}`);

    const stdPrice = await stripeRequest('/v1/prices', {
      product: stdProduct.id,
      unit_amount: 4999, // $49.99 in cents
      currency: 'usd'
    }, apiKey);
    console.log(`✅ Standard Price Created: ${stdPrice.id}`);

    const stdPaymentLink = await stripeRequest('/v1/payment_links', {
      'line_items[0][price]': stdPrice.id,
      'line_items[0][quantity]': 1,
      'after_completion[type]': 'hosted_confirmation'
    }, apiKey);
    console.log(`🎉 Standard Payment Link Generated: ${stdPaymentLink.url}`);

    // 2. Create Pro Automation Product & Price ($149.99 USD)
    console.log('\n2. Creating Pro Automation Stripe Product ($149.99)...');
    const proProduct = await stripeRequest('/v1/products', {
      name: 'Missed Call Auto SMS - Pro Automation Edition',
      description: 'Unlimited n8n Webhook Automations, FCM Cloud Push, Dual SIM Outbound Line Selector, 100% A2P 10DLC Exempt.',
      'metadata[tier]': 'pro_automation'
    }, apiKey);
    console.log(`✅ Pro Product Created: ${proProduct.id}`);

    const proPrice = await stripeRequest('/v1/prices', {
      product: proProduct.id,
      unit_amount: 14999, // $149.99 in cents
      currency: 'usd'
    }, apiKey);
    console.log(`✅ Pro Price Created: ${proPrice.id}`);

    const proPaymentLink = await stripeRequest('/v1/payment_links', {
      'line_items[0][price]': proPrice.id,
      'line_items[0][quantity]': 1,
      'metadata[tier]': 'pro_automation',
      'after_completion[type]': 'hosted_confirmation'
    }, apiKey);
    console.log(`🎉 Pro Payment Link Generated: ${proPaymentLink.url}`);

    // 3. Update HTML files
    const htmlFiles = ['sales_landing_page.html', 'index.html'];
    htmlFiles.forEach(file => {
      const filePath = path.join(__dirname, '..', file);
      if (fs.existsSync(filePath)) {
        let html = fs.readFileSync(filePath, 'utf8');
        const replacementStd = `function initiateStripeCheckout() {\n        window.location.href = "${stdPaymentLink.url}";\n    }`;
        const replacementTrial = `function initiateFreeTrialCheckout() {\n        window.location.href = "${stdPaymentLink.url}?trial_period_days=3";\n    }`;
        const replacementPro = `function initiateProStripeCheckout() {\n        window.location.href = "${proPaymentLink.url}";\n    }`;
        html = html.replace(/function initiateStripeCheckout\(\)\s*\{[^}]*\}/g, replacementStd);
        html = html.replace(/function initiateFreeTrialCheckout\(\)\s*\{[^}]*\}/g, replacementTrial);
        html = html.replace(/function initiateProStripeCheckout\(\)\s*\{[^}]*\}/g, replacementPro);
        fs.writeFileSync(filePath, html, 'utf8');
        console.log(`✅ Updated ${file} with live Standard ($49.99) & Pro ($149.99) Payment Links!`);
      }
    });
  } catch (err) {
    console.error(`❌ Stripe API Error: ${err.message}`);
  }
}

run();
