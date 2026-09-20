// scripts/test_live_server_endpoints.js
const http = require('http');

function postJson(path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: 'localhost',
      port: 8000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:8000${path}`, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('====================================================');
  console.log('🧪 PHASE 4: LOCAL SERVER & ADMIN API ENDPOINTS AUDIT');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  // 1. Health check
  total++;
  try {
    const status = await getJson('/api/stripe-status');
    if (status.status === 200 && status.data.success) {
      console.log('✅ 1. Stripe Status API 200 OK');
      passed++;
    } else {
      console.error('❌ 1. Stripe Status API failed:', status);
    }
  } catch (e) {
    console.error('❌ 1. Stripe Status unreachable:', e.message);
  }

  // 2. Webhook: Front Desk Bundle ($99/mo)
  total++;
  try {
    const res = await postJson('/api/stripe-webhook', {
      id: 'evt_test_frontdesk_' + Date.now(),
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_frontdesk_' + Date.now(),
          amount_total: 9900,
          customer_details: { email: 'test-frontdesk@company.com', name: 'Dr. Apex Dental' },
          metadata: { tier: 'front_desk_bundle' }
        }
      }
    });
    if (res.status === 200 && res.data.received && res.data.licenseKey && res.data.licenseKey.startsWith('MCAS-PRO-')) {
      console.log(`✅ 2. Autonomous Front Desk ($99/mo) Webhook: Generated ${res.data.licenseKey} (PRO)`);
      passed++;
    } else {
      console.error('❌ 2. Front Desk Webhook failed:', res);
    }
  } catch (e) {
    console.error('❌ 2. Front Desk Webhook error:', e.message);
  }

  // 3. Webhook: Pro Gateway ($299)
  total++;
  try {
    const res = await postJson('/api/stripe-webhook', {
      id: 'evt_test_pro_' + Date.now(),
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_pro_' + Date.now(),
          amount_total: 29900,
          customer_details: { email: 'test-pro@automation.com', name: 'Dev Solutions' },
          metadata: { tier: 'pro_gateway' }
        }
      }
    });
    if (res.status === 200 && res.data.received && res.data.licenseKey && res.data.licenseKey.startsWith('MCAS-PRO-')) {
      console.log(`✅ 3. Pro Automation Gateway ($299) Webhook: Generated ${res.data.licenseKey} (PRO)`);
      passed++;
    } else {
      console.error('❌ 3. Pro Gateway Webhook failed:', res);
    }
  } catch (e) {
    console.error('❌ 3. Pro Gateway Webhook error:', e.message);
  }

  // 4. Webhook: Flagship Appliance ($49.99)
  total++;
  try {
    const res = await postJson('/api/stripe-webhook', {
      id: 'evt_test_flagship_' + Date.now(),
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_flagship_' + Date.now(),
          amount_total: 4999,
          customer_details: { email: 'test-flagship@plumbing.com', name: 'Bob Plumbing' },
          metadata: { tier: 'standard_lifetime' }
        }
      }
    });
    if (res.status === 200 && res.data.received && res.data.licenseKey && !res.data.licenseKey.startsWith('MCAS-PRO-')) {
      console.log(`✅ 4. Flagship Appliance ($49.99) Webhook: Generated ${res.data.licenseKey} (STANDARD)`);
      passed++;
    } else {
      console.error('❌ 4. Flagship Webhook failed:', res);
    }
  } catch (e) {
    console.error('❌ 4. Flagship Webhook error:', e.message);
  }

  // 5. Verification API
  total++;
  try {
    const ver = await getJson('/api/verify-license?key=MCAS-PRO-DEMO-89F2');
    if (ver.status === 200 && ver.data.valid && ver.data.tier === 'PRO') {
      console.log('✅ 5. License Verification API: MCAS-PRO-DEMO-89F2 verified valid PRO');
      passed++;
    } else {
      console.error('❌ 5. License Verification API failed:', ver);
    }
  } catch (e) {
    console.error('❌ 5. License Verification API error:', e.message);
  }

  console.log('\n----------------------------------------------------');
  if (passed === total) {
    console.log(`🎉 ALL ${passed}/${total} PHASE 4 TESTS PASSED!`);
    process.exit(0);
  } else {
    console.error(`🚨 ${passed}/${total} Tests passed. ${total - passed} failed.`);
    process.exit(1);
  }
}

run();
