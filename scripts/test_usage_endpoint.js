// Test script: test_usage_endpoint.js
const http = require('http');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('🧪 Testing /api/vapi/usage endpoints...\n');

  // Test 1: Front Desk Bundle key (Dr. Apex Dental, 250 minutes)
  const key1 = 'MCAS-PRO-44722E20417065782044656E74616C7C307C31373839383735313736-B8CA10BA';
  const t1 = await fetchJson(`http://localhost:8000/api/vapi/usage?key=${key1}`);
  console.log('Test 1 (Front Desk Bundle Key):', t1.status, t1.data);
  if (t1.status !== 200 || !t1.data.success || t1.data.quotaMinutes !== 250) {
    throw new Error('Test 1 failed!');
  }

  // Test 2: Standard Key
  const t2 = await fetchJson('http://localhost:8000/api/vapi/usage?key=MCAS-DEMO-FLAGSHIP-KEY');
  console.log('\nTest 2 (Flagship Standard Key):', t2.status, t2.data);
  if (t2.status !== 200 || !t2.data.success) {
    throw new Error('Test 2 failed!');
  }

  // Test 3: Missing Key Validation
  const t3 = await fetchJson('http://localhost:8000/api/vapi/usage');
  console.log('\nTest 3 (Missing Key 400 Validation):', t3.status, t3.data);
  if (t3.status !== 400 || t3.data.success) {
    throw new Error('Test 3 failed!');
  }

  console.log('\n✅ All /api/vapi/usage backend tests passed successfully!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
