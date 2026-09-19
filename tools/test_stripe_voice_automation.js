const http = require('http');
const fs = require('fs');
const path = require('path');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Starting Stripe Voice Pro ($29/mo) Automation & Deployment Audit...\n');
  let passed = 0;
  let total = 4;

  // TEST 1: Check Stripe Status Endpoint
  console.log('1. Checking GET /api/stripe-status for Voice Pro URL...');
  try {
    const res = await request({
      hostname: 'localhost',
      port: 8000,
      path: '/api/stripe-status',
      method: 'GET'
    });

    if (res.status === 200 && res.data.connected && res.data.checkoutVoiceProUrl) {
      console.log(`   ✔ PASS: Stripe connected (Livemode: ${res.data.livemode})`);
      console.log(`   ✔ Voice Pro Payment URL verified: ${res.data.checkoutVoiceProUrl}`);
      passed++;
    } else {
      console.log(`   ✖ FAIL: ${JSON.stringify(res.data)}`);
    }
  } catch (e) {
    console.log(`   ✖ FAIL: ${e.message}`);
  }

  // TEST 2: Trigger Simulated $29/mo Stripe Webhook Event
  console.log('\n2. Posting simulated $29/mo checkout.session.completed to /api/stripe-webhook...');
  let webhookResult = null;
  try {
    const webhookPayload = {
      id: 'evt_test_voice_auto_' + Date.now(),
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_voice_auto_' + Date.now(),
          amount_total: 2900,
          customer_details: {
            email: 'mike@apexhandyman.com',
            name: 'Mike Peterson',
            phone: '+1 (404) 987-6543'
          },
          subscription: 'sub_live_test_1UHQXP',
          metadata: {
            tier: 'managed_voice_pro',
            service: 'voice_receptionist'
          }
        }
      }
    };

    const res = await request({
      hostname: 'localhost',
      port: 8000,
      path: '/api/stripe-webhook',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, webhookPayload);

    webhookResult = res.data;
    if (res.status === 200 && webhookResult.received && webhookResult.tier === 'managed_voice_pro') {
      console.log(`   ✔ PASS: Webhook processed HTTP 200 OK`);
      console.log(`   ✔ Forwarding Line Provisioned: ${webhookResult.forwardingNumber}`);
      console.log(`   ✔ Carrier Dial Code: ${webhookResult.carrierCode}`);
      console.log(`   ✔ Voice Pro License Key: ${webhookResult.licenseKey}`);
      console.log(`   ✔ Deployment Status: ${webhookResult.status}`);
      passed++;
    } else {
      console.log(`   ✖ FAIL: Unexpected webhook response:`, res.status, webhookResult);
    }
  } catch (e) {
    console.log(`   ✖ FAIL: ${e.message}`);
  }

  // TEST 3: Inspect Voice Settings on Disk
  console.log('\n3. Inspecting data/voice_settings.json for post-payment state...');
  try {
    const settingsPath = path.join(__dirname, '..', 'data', 'voice_settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    const isManaged = settings.mode === 'MANAGED_PRO';
    const isActive = settings.status === 'ACTIVE';
    const hasSubscriber = settings.subscriberEmail === 'mike@apexhandyman.com';
    const hasQuota = settings.monthlyMinutesQuota === 200;

    if (isManaged && isActive && hasSubscriber && hasQuota) {
      console.log(`   ✔ PASS: voice_settings.json updated to MANAGED_PRO & ACTIVE`);
      console.log(`   ✔ Subscriber: ${settings.subscriberName} (${settings.subscriberEmail})`);
      console.log(`   ✔ Dedicated Line: ${settings.forwardingNumber} (Carrier: ${settings.carrierCode})`);
      console.log(`   ✔ Included Quota: ${settings.monthlyMinutesQuota} minutes / month`);
      passed++;
    } else {
      console.log(`   ✖ FAIL: Voice settings state invalid:`, settings);
    }
  } catch (e) {
    console.log(`   ✖ FAIL: ${e.message}`);
  }

  // TEST 4: Verify Delivery Email Archived in sent_emails/
  console.log('\n4. Verifying onboarding delivery email HTML in sent_emails/...');
  try {
    const sentEmailsDir = path.join(__dirname, '..', 'sent_emails');
    const files = fs.readdirSync(sentEmailsDir);
    const onboardingEmail = files.find(f => f.includes('voice_onboarding') && f.includes('mike_apexhandyman_com'));

    if (onboardingEmail) {
      const emailContent = fs.readFileSync(path.join(sentEmailsDir, onboardingEmail), 'utf8');
      const hasKey = emailContent.includes('MCAS-VOICE-PRO-');
      const hasCarrier = emailContent.includes('*71');
      if (hasKey && hasCarrier) {
        console.log(`   ✔ PASS: Onboarding email archived: sent_emails/${onboardingEmail}`);
        console.log(`   ✔ Contains hardware key and carrier dial instructions`);
        passed++;
      } else {
        console.log(`   ✖ FAIL: Onboarding email content missing expected markers`);
      }
    } else {
      console.log(`   ✖ FAIL: No voice onboarding email found in sent_emails/`);
    }
  } catch (e) {
    console.log(`   ✖ FAIL: ${e.message}`);
  }

  console.log('\n==================================================');
  console.log(`RESULTS: ${passed}/${total} TESTS PASSED`);
  if (passed === total) {
    console.log('🎉 ALL STRIPE AUTOMATIONS & DEPLOYMENT SYSTEMS OPERATIONAL!');
    process.exit(0);
  } else {
    console.log('⚠️ Some tests failed. Please review above output.');
    process.exit(1);
  }
}

runTests();
