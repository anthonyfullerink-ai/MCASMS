const http = require('http');

function postJson(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost',
      port: 8000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
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
    req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log("=== Testing /api/vapi/custom-greeting ===");
  const greetRes = await postJson('/api/vapi/custom-greeting', {
    businessName: 'Apex Plumbing & Heating',
    customGreeting: 'Thanks for calling Apex Plumbing! Our technicians are on a job. How can we help you right now?'
  });
  console.log("Greeting endpoint response:", greetRes);

  console.log("\n=== Testing /api/vapi/cancel-subscription ===");
  const cancelRes = await postJson('/api/vapi/cancel-subscription', {
    email: 'test-contractor@example.com'
  });
  console.log("Cancellation endpoint response:", cancelRes);

  if (greetRes.data && greetRes.data.success && cancelRes.data && cancelRes.data.success) {
    console.log("\n✅ ALL ENDPOINT TESTS PASSED!");
  } else {
    console.error("\n❌ TESTS FAILED");
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
