const { handler } = require('../netlify/functions/stripe-webhook.js');
const assert = require('assert');

async function runTests() {
  console.log('🧪 Starting Stripe Webhook Tier Verification Tests...\n');

  // Test 1: Autonomous Front Desk Bundle ($99/mo)
  console.log('--- Test 1: Autonomous Front Desk Bundle ($99/mo, 250 pooled minutes) ---');
  const payloadBundle = {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_front_desk_99',
        customer_email: 'frontdesk_test@example.com',
        customer_details: { name: 'Dr. Jane Smith', email: 'frontdesk_test@example.com' },
        amount_total: 9900,
        metadata: { tier: 'autonomous_front_desk' },
        subscription: 'sub_test_fd99'
      }
    }
  };

  const res1 = await handler({
    httpMethod: 'POST',
    headers: { host: 'missedcallautosms.com' },
    body: JSON.stringify(payloadBundle)
  });

  assert.strictEqual(res1.statusCode, 200);
  const body1 = JSON.parse(res1.body);
  console.log('Response 1:', body1);
  assert.strictEqual(body1.tier, 'autonomous_front_desk');
  assert.strictEqual(body1.quotaMinutes, 250);
  assert.strictEqual(body1.overageRate, 0.20);
  assert(body1.licenseKey.startsWith('MCAS-PRO-'), 'License key must be PRO for Front Desk Bundle');
  assert(body1.forwardingNumber, 'Dedicated forwarding number must be assigned');
  console.log('✅ Test 1 Passed!\n');

  // Test 2: Business AI Voice Standalone ($89/mo, 300 pooled minutes)
  console.log('--- Test 2: Business AI Voice Standalone ($89/mo, 300 pooled minutes) ---');
  const payloadBusinessVoice = {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_voice_biz_89',
        customer_email: 'bizvoice_test@example.com',
        customer_details: { name: 'Apex Law Group', email: 'bizvoice_test@example.com' },
        amount_total: 8900,
        metadata: { tier: 'voice_business' },
        subscription: 'sub_test_vb89'
      }
    }
  };

  const res2 = await handler({
    httpMethod: 'POST',
    headers: { host: 'missedcallautosms.com' },
    body: JSON.stringify(payloadBusinessVoice)
  });

  assert.strictEqual(res2.statusCode, 200);
  const body2 = JSON.parse(res2.body);
  console.log('Response 2:', body2);
  assert.strictEqual(body2.tier, 'voice_business');
  assert.strictEqual(body2.quotaMinutes, 300);
  assert.strictEqual(body2.overageRate, 0.20);
  assert(body2.licenseKey.startsWith('MCAS-PRO-'), 'License key must be PRO for Voice Business');
  console.log('✅ Test 2 Passed!\n');

  // Test 3: Starter AI Voice Standalone ($29/mo, 45 pooled minutes)
  console.log('--- Test 3: Starter AI Voice Standalone ($29/mo, 45 pooled minutes) ---');
  const payloadStarterVoice = {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_voice_starter_29',
        customer_email: 'startervoice_test@example.com',
        customer_details: { name: 'Solo Contractor', email: 'startervoice_test@example.com' },
        amount_total: 2900,
        metadata: { tier: 'voice_starter' },
        subscription: 'sub_test_vs29'
      }
    }
  };

  const res3 = await handler({
    httpMethod: 'POST',
    headers: { host: 'missedcallautosms.com' },
    body: JSON.stringify(payloadStarterVoice)
  });

  assert.strictEqual(res3.statusCode, 200);
  const body3 = JSON.parse(res3.body);
  console.log('Response 3:', body3);
  assert.strictEqual(body3.tier, 'voice_starter');
  assert.strictEqual(body3.quotaMinutes, 45);
  assert.strictEqual(body3.overageRate, 0.25);
  assert(body3.licenseKey.startsWith('MCAS-PRO-'), 'License key must be PRO for Voice Starter');
  console.log('✅ Test 3 Passed!\n');

  // Test 4: Pro Automation Gateway ($299 Perpetual)
  console.log('--- Test 4: Pro Automation Gateway ($299 Perpetual) ---');
  const payloadProGateway = {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_pro_gateway_299',
        customer_email: 'developer_test@example.com',
        customer_details: { name: 'n8n Automation Pro', email: 'developer_test@example.com' },
        amount_total: 29900,
        metadata: { tier: 'pro_gateway' }
      }
    }
  };

  const res4 = await handler({
    httpMethod: 'POST',
    headers: { host: 'missedcallautosms.com' },
    body: JSON.stringify(payloadProGateway)
  });

  assert.strictEqual(res4.statusCode, 200);
  const body4 = JSON.parse(res4.body);
  console.log('Response 4:', body4);
  assert.strictEqual(body4.tier, 'pro_gateway');
  assert(body4.licenseKey.startsWith('MCAS-PRO-'), 'License key must be PRO for Pro Gateway');
  assert(body4.apkUrl.includes('MissedCallAutoSMS.apk'), 'Must deliver Pro APK');
  console.log('✅ Test 4 Passed!\n');

  // Test 5: Founder\'s Flagship Appliance ($49.99 One-Time)
  console.log('--- Test 5: Founder\'s Flagship Appliance ($49.99 One-Time) ---');
  const payloadFounder = {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_flagship_founder_49',
        customer_email: 'founder_test@example.com',
        customer_details: { name: 'Early Adopter', email: 'founder_test@example.com' },
        amount_total: 4999,
        metadata: { tier: 'flagship_founder' }
      }
    }
  };

  const res5 = await handler({
    httpMethod: 'POST',
    headers: { host: 'missedcallautosms.com' },
    body: JSON.stringify(payloadFounder)
  });

  assert.strictEqual(res5.statusCode, 200);
  const body5 = JSON.parse(res5.body);
  console.log('Response 5:', body5);
  assert.strictEqual(body5.tier, 'flagship_founder');
  assert(body5.licenseKey.startsWith('MCAS-') && !body5.licenseKey.startsWith('MCAS-PRO-'), 'License key must be standard MCAS- for Founder Flagship');
  assert(body5.apkUrl.includes('MissedCallAutoSMS.apk'), 'Must deliver Standard APK');
  console.log('✅ Test 5 Passed!\n');

  // Test 6: Email Templates Content Verification
  console.log('--- Test 6: Email HTML Verification for Quotas & Copy ---');
  const { generateEmailHtml, generateProPlusVoiceEmailHtml, generateVoiceProEmailHtml } = require('../netlify/functions/stripe-webhook.js');
  
  // Pro Gateway email
  const proHtml = generateEmailHtml('Dev Partner', 'MCAS-PRO-1234', 'https://missedcallautosms.com/MissedCallAutoSMS.apk', '299.00', true);
  assert(proHtml.includes('PRO AUTOMATION GATEWAY (A2P 10DLC BYPASS)'), 'Pro email must have Pro badge');
  assert(proHtml.includes('1-Year Cloud Relay API Included'), 'Pro email must mention Cloud Relay API');

  // Founder Flagship email
  const founderHtml = generateEmailHtml('Early User', 'MCAS-1234', 'https://missedcallautosms.com/MissedCallAutoSMS.apk', '49.99', false);
  assert(founderHtml.includes("FOUNDER'S FLAGSHIP APPLIANCE"), 'Founder email must have Founder badge');

  // Autonomous Front Desk email
  const bundleHtml = generateProPlusVoiceEmailHtml('Clinic Owner', 'MCAS-PRO-5678', 'https://missedcallautosms.com/MissedCallAutoSMS.apk', '+17326609121', '*717326609121', '*73', 250, "AUTONOMOUS FRONT DESK BUNDLE ($99/MO)", "0.20");
  assert(bundleHtml.includes('AUTONOMOUS FRONT DESK BUNDLE ($99/MO)'), 'Bundle title missing in email');
  assert(bundleHtml.includes('250 monthly minutes'), 'Bundle minutes quota missing in email');
  assert(bundleHtml.includes('$0.20/min'), 'Bundle overage rate missing in email');

  // Starter Voice email
  const starterHtml = generateVoiceProEmailHtml('Solo Biz', 'MCAS-PRO-9999', '+17326609121', '*717326609121', '*73', 'Starter AI Voice Receptionist ($29/mo)', 45, '0.25');
  assert(starterHtml.includes('45 included minutes'), 'Starter minutes quota missing');
  assert(starterHtml.includes('$0.25/min'), 'Starter overage rate missing');

  // Business Voice email
  const bizHtml = generateVoiceProEmailHtml('Big Firm', 'MCAS-PRO-8888', '+17326609121', '*717326609121', '*73', 'Business AI Voice Receptionist ($89/mo)', 300, '0.20');
  assert(bizHtml.includes('300 included minutes'), 'Business minutes quota missing');
  assert(bizHtml.includes('$0.20/min'), 'Business overage rate missing');

  console.log('✅ Test 6 (Email HTML Generation) Passed!\n');

  console.log('🎉 ALL 6 STRIPE WEBHOOK TIER & EMAIL TESTS PASSED WITH 100% ACCURACY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
