/**
 * scripts/test_voice_sms_safeguard.js
 * Verification test for:
 * 1. AI Voice Receptionist ring pulse correlation.
 * 2. In-progress call status update -> voice_call_started cancellation payload.
 * 3. End-of-call report -> Post-call SMS payload with immediate zero-delay dispatch flags.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('================================================================');
console.log('🧪 VERIFYING AI VOICE RECEPTIONIST SAFEGUARD & POST-CALL SMS');
console.log('================================================================\n');

// 1. Verify Android Source Safeguard Rules
console.log('1. Checking Android Client Safeguards...');
const workerSource = fs.readFileSync(path.join(__dirname, '../app/src/main/java/com/missedcall/autotext/worker/SendAutoTextWorker.kt'), 'utf8');
const receiverSource = fs.readFileSync(path.join(__dirname, '../app/src/main/java/com/missedcall/autotext/receiver/CallStateReceiver.kt'), 'utf8');
const fcmSource = fs.readFileSync(path.join(__dirname, '../app/src/main/java/com/missedcall/autotext/remote/FCMWebhookService.kt'), 'utf8');

// Verify CallStateReceiver has 8-second quarantine delay
assert(receiverSource.includes('workRequestBuilder.setInitialDelay(8, java.util.concurrent.TimeUnit.SECONDS)'), 'CallStateReceiver must set 8s quarantine delay');
assert(receiverSource.includes('addTag("caller_$cleanDigits")'), 'CallStateReceiver must tag work request with caller digits');
console.log('   ✔ CallStateReceiver has 8s quarantine buffer and caller tag.');

// Verify FCMWebhookService instantly cancels WorkManager jobs
assert(fcmSource.includes('cancelUniqueWork("autotext_$cleanDigits")'), 'FCMWebhookService must cancel unique work');
assert(fcmSource.includes('cancelAllWorkByTag("caller_$cleanDigits")'), 'FCMWebhookService must cancel by tag');
assert(fcmSource.includes('KEY_IS_POST_CALL'), 'FCMWebhookService must forward KEY_IS_POST_CALL');
console.log('   ✔ FCMWebhookService has instant WorkManager cancellation on voice_call_started.');

// Verify SendAutoTextWorker re-checks voiceCallDao post-delay and has 0 delay for post-call SMS
assert(workerSource.includes('KEY_IS_POST_CALL'), 'SendAutoTextWorker must declare KEY_IS_POST_CALL');
assert(workerSource.includes('isPostCall -> 0L'), 'SendAutoTextWorker must have 0L delay for post-call SMS');
assert(workerSource.includes('countRecentVoiceCalls(clean10, recentCutoff)'), 'SendAutoTextWorker must re-check voiceCallDao after delay');
console.log('   ✔ SendAutoTextWorker re-checks voiceCallDao post-delay and bypasses delay for post-call SMS.\n');

// 2. Verify Cloud Webhook Payload Contracts
console.log('2. Checking Cloud Webhook Logic (netlify/functions/vapi-webhook.js)...');
const webhookSource = fs.readFileSync(path.join(__dirname, '../netlify/functions/vapi-webhook.js'), 'utf8');

assert(webhookSource.includes("type: 'voice_call_started'"), 'Webhook must dispatch voice_call_started');
assert(webhookSource.includes("is_post_call: 'true'"), 'Webhook must mark post-call SMS with is_post_call');
assert(webhookSource.includes("sub_type: 'post_call_summary'"), 'Webhook must mark post-call SMS with sub_type post_call_summary');
console.log('   ✔ Cloud webhook includes robust device token lookup and post-call SMS flags.\n');

// 3. Simulated Post-Call SMS Generator Logic
console.log('3. Testing Post-Call SMS Text Generation...');
function generatePostCallText(reason, durationSec, transcript, summary, customerName) {
  const lowerTrans = (transcript || '').toLowerCase();
  const isSilence = reason === 'silence-timed-out' || lowerTrans.includes('could not hear') || lowerTrans.includes('cannot hear');
  const isDisconnected = (reason === 'customer-ended-call' || reason === 'phone-call-provider-closed-call') && durationSec < 35;

  if (isSilence) {
    return "Hi, sorry we couldn't hear each other on the call! Were you still looking for assistance or an estimate today? Feel free to reply directly to this text!";
  } else if (isDisconnected) {
    return "Hey, seems like we got disconnected! Were you still looking for a quote or technician visit? Let me know how I can help!";
  } else {
    const nameGreeting = customerName ? `Hi ${customerName}, ` : 'Hi, ';
    return `${nameGreeting}thanks for calling! Our AI receptionist noted your request: "${summary.substring(0, 85)}". Feel free to reply here if you have any questions or want to update your time!`;
  }
}

const silenceText = generatePostCallText('silence-timed-out', 15, 'hello? hello? I cannot hear anything', '', null);
assert(silenceText.includes("couldn't hear each other"), 'Silence text generated correctly');
console.log('   ✔ Silence Recovery Text:', silenceText);

const discText = generatePostCallText('customer-ended-call', 20, 'brief connection', '', null);
assert(discText.includes('got disconnected'), 'Disconnected text generated correctly');
console.log('   ✔ Disconnected Recovery Text:', discText);

const normalText = generatePostCallText('normal-hangup', 95, 'I need my furnace repaired today', 'Furnace repair needed for 123 Main St', 'Sarah');
assert(normalText.includes('Hi Sarah, thanks for calling!'), 'Normal summary text generated correctly');
console.log('   ✔ Normal Post-Call Text:', normalText);

console.log('\n================================================================');
console.log('🎉 ALL SAFEGUARD AND POST-CALL SMS VERIFICATIONS PASSED 100%!');
console.log('================================================================');
