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

function stripeApi(endpoint, method = 'GET', postData = null, apiKey) {
  return new Promise((resolve, reject) => {
    let payload = null;
    if (postData) {
      payload = querystring.stringify(postData);
    }
    const options = {
      hostname: 'api.stripe.com',
      port: 443,
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    };
    if (payload) {
      options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

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
    if (payload) req.write(payload);
    req.end();
  });
}

async function setupVoiceProSubscription() {
  const env = loadEnv();
  const apiKey = (process.env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY || '').trim();

  if (!apiKey) {
    console.error('❌ Missing STRIPE_SECRET_KEY in environment.');
    process.exit(1);
  }

  console.log('⚡ Connecting to Stripe to setup Managed AI Voice Receptionist ($29/month)...');

  try {
    // 1. Check existing products
    const existingProducts = await stripeApi('/v1/products?limit=50', 'GET', null, apiKey);
    let voiceProduct = existingProducts.data.find(p => 
      p.name.toLowerCase().includes('voice receptionist') || 
      (p.metadata && p.metadata.tier === 'managed_voice_pro')
    );

    if (!voiceProduct) {
      console.log('Creating Stripe Product: Missed Call Auto SMS - Managed AI Voice Receptionist...');
      voiceProduct = await stripeApi('/v1/products', 'POST', {
        name: 'Missed Call Auto SMS - Managed AI Voice Receptionist',
        description: 'Turnkey AI Voice Receptionist with dedicated local forwarding line, 200 included voice minutes/month, and instant SIM SMS follow-up.',
        'metadata[tier]': 'managed_voice_pro',
        'metadata[service]': 'voice_receptionist',
        'metadata[monthly_minutes]': '200'
      }, apiKey);
      console.log(`✅ Product created: ${voiceProduct.id}`);
    } else {
      console.log(`✅ Found existing Product: ${voiceProduct.id} (${voiceProduct.name})`);
    }

    // 2. Check existing $29/mo recurring price for this product
    const existingPrices = await stripeApi(`/v1/prices?product=${voiceProduct.id}&limit=10`, 'GET', null, apiKey);
    let voicePrice = existingPrices.data.find(pr => 
      pr.unit_amount === 2900 && 
      pr.currency === 'usd' && 
      pr.recurring && 
      pr.recurring.interval === 'month' &&
      pr.active
    );

    if (!voicePrice) {
      console.log('Creating $29.00/month recurring price in Stripe...');
      voicePrice = await stripeApi('/v1/prices', 'POST', {
        product: voiceProduct.id,
        unit_amount: 2900, // $29.00
        currency: 'usd',
        'recurring[interval]': 'month',
        'metadata[tier]': 'managed_voice_pro',
        'metadata[plan]': 'voice_receptionist_monthly'
      }, apiKey);
      console.log(`✅ Price created: ${voicePrice.id} ($29.00/month)`);
    } else {
      console.log(`✅ Found existing Price: ${voicePrice.id} ($29.00/month)`);
    }

    // 3. Create or find payment link
    const existingLinks = await stripeApi('/v1/payment_links?limit=30', 'GET', null, apiKey);
    let paymentLink = existingLinks.data.find(l => 
      l.active && 
      l.line_items && 
      l.line_items.data && 
      l.line_items.data.some(item => item.price && item.price.id === voicePrice.id)
    );

    if (!paymentLink) {
      console.log('Creating Stripe Payment Link for $29/month subscription...');
      paymentLink = await stripeApi('/v1/payment_links', 'POST', {
        'line_items[0][price]': voicePrice.id,
        'line_items[0][quantity]': 1,
        'metadata[tier]': 'managed_voice_pro',
        'metadata[service]': 'voice_receptionist',
        'after_completion[type]': 'hosted_confirmation'
      }, apiKey);
      console.log(`🎉 Payment Link created: ${paymentLink.url}`);
    } else {
      console.log(`🎉 Found active Payment Link: ${paymentLink.url}`);
    }

    // 4. Save to JSON config file
    const resultData = {
      productId: voiceProduct.id,
      productName: voiceProduct.name,
      priceId: voicePrice.id,
      amount: 29.00,
      currency: 'usd',
      interval: 'month',
      paymentLinkUrl: paymentLink.url,
      updatedAt: new Date().toISOString()
    };

    const outPath = path.join(__dirname, 'voice_pro_stripe_link.json');
    fs.writeFileSync(outPath, JSON.stringify(resultData, null, 2), 'utf8');
    console.log(`💾 Saved Stripe Voice Pro Link metadata to ${outPath}`);

    return resultData;
  } catch (err) {
    console.error(`❌ Error setting up Stripe subscription: ${err.message}`);
    throw err;
  }
}

setupVoiceProSubscription().then(data => {
  console.log('\n======================================================');
  console.log('🚀 STRIPE MANAGED PRO SUBSCRIPTION READY:');
  console.log('Product ID:   ', data.productId);
  console.log('Price ID:     ', data.priceId);
  console.log('Checkout URL: ', data.paymentLinkUrl);
  console.log('======================================================\n');
}).catch(() => process.exit(1));
