// Netlify Function: vapi-usage.js
// Returns real-time minute quota, usage, overage, and subscription status for a license key

const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-License-Key'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const licenseKey = (event.queryStringParameters?.licenseKey || event.queryStringParameters?.key || '').trim().toUpperCase();

  if (!licenseKey) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: 'License key is required.' })
    };
  }

  try {
    let subscriber = null;

    // Check Cloud Firestore first
    try {
      let _fsModule = null;
      try { _fsModule = require('../../lib/firestore'); } catch (e) {}
      if (_fsModule && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        subscriber = await _fsModule.getVoiceBinding(licenseKey);
      }
    } catch (e) {
      console.warn('[vapi-usage] Firestore lookup note:', e.message);
    }

    // Fallback to local bindings file
    if (!subscriber) {
      try {
        const filePath = path.join(__dirname, '../../.voice_pro_bindings.json');
        if (fs.existsSync(filePath)) {
          const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          subscriber = raw[licenseKey] || null;
        }
      } catch (e) {
        console.warn('[vapi-usage] Local fallback note:', e.message);
      }
    }

    // If no subscriber document exists yet, check license type heuristics
    const isPro = licenseKey.startsWith('MCAS-PRO-') || licenseKey.startsWith('MCAT-PRO-') || licenseKey.includes('PRO-DEMO');
    const isDev = licenseKey.includes('DEV') || licenseKey.includes('MASTER');

    const plan = subscriber?.plan || (isPro ? 'PRO_GATEWAY' : 'AUTONOMOUS_FRONT_DESK');
    const planName = subscriber?.planName || (
      plan === 'AUTONOMOUS_FRONT_DESK' ? 'Autonomous Front Desk Bundle' :
      plan === 'VOICE_BUSINESS' ? 'Voice Business' :
      plan === 'VOICE_STARTER' ? 'Voice Starter' :
      plan === 'PRO_GATEWAY' ? 'Pro Automation Gateway' : 'Flagship Appliance'
    );

    const quotaMinutes = Number(subscriber?.quotaMinutes ?? (
      plan === 'AUTONOMOUS_FRONT_DESK' ? 250 :
      plan === 'VOICE_BUSINESS' ? 300 :
      plan === 'VOICE_STARTER' ? 45 :
      plan === 'PRO_GATEWAY' ? 0 : 0
    ));

    const minutesUsed = Number(subscriber?.minutesUsed ?? 0);
    let overageRatePerMinute = Number(subscriber?.overageRatePerMinute ?? (plan === 'VOICE_STARTER' ? 0.25 : 0.20));

    const isPremiumModel = subscriber?.hasPremiumModel === true ||
      (subscriber?.model && subscriber.model.toLowerCase().includes('gpt-4o') && !subscriber.model.toLowerCase().includes('mini'));
    if (isPremiumModel) {
      overageRatePerMinute = Number((overageRatePerMinute * 1.015).toFixed(4));
    }

    const remainingMinutes = Math.max(0, quotaMinutes - minutesUsed);
    const overageMinutes = Math.max(0, minutesUsed - quotaMinutes);
    const overageAmount = Number((overageMinutes * overageRatePerMinute).toFixed(2));

    // Resolve accurate membership tier & voice state
    const isAgency = licenseKey.startsWith('MCAS-AGENCY-') || licenseKey.startsWith('MCAT-AGENCY-');
    const isTrial = licenseKey.includes('TRIAL') || subscriber?.status === 'TRIAL' || subscriber?.type === 'TRIAL';
    const tier = isAgency ? 'AGENCY' : (isPro ? 'PRO' : (isTrial ? 'TRIAL' : 'FLAGSHIP'));
    const tierName = isAgency ? 'Agency Fleet Edition' : (isPro ? 'Pro Automation Gateway ($299 Perpetual)' : (isTrial ? '3-Day Free Trial ($0 Today)' : 'Founder\'s Flagship ($49.99 Lifetime)'));

    const voiceMinutesBalance = Number(subscriber?.voiceMinutesBalance ?? (isPro ? 50 : 40));
    const voiceSubWaived = !!(subscriber?.voiceSubWaived || subscriber?.type === 'FREE_VOICE_COMP');
    const voiceSubActive = subscriber ? (subscriber.voiceSubActive !== false && subscriber.voiceActive !== false) : true;
    const forwardingNumber = subscriber?.forwardingNumber || '+1 (732) 660-9121';
    const cleanDigits = forwardingNumber.replace(/\D/g, '');
    const carrierCode = subscriber?.carrierCode || `*71${cleanDigits.slice(-10)}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        licenseKey,
        status: subscriber?.status || (isDev ? 'ACTIVE' : 'ACTIVE'),
        tier,
        tierName,
        voiceActive: subscriber ? subscriber.voiceActive !== false : true,
        voiceSubActive,
        voiceSubWaived,
        voiceMinutesBalance,
        plan,
        planName,
        quotaMinutes,
        minutesUsed,
        remainingMinutes,
        overageMinutes,
        overageRatePerMinute,
        overageAmount,
        modelTier: isPremiumModel ? 'PREMIUM (+1.5% Overage Markup)' : 'STANDARD (Included)',
        hasPremiumModel: isPremiumModel,
        billingCycleEnd: subscriber?.billingCycleEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        forwardingNumber,
        carrierCode,
        carrierDeactivateCode: '*73',
        isUnlimitedGateway: plan === 'PRO_GATEWAY' || isPro,
        upgradeOptions: {
          proUpgradeAvailable: !isPro && !isAgency,
          proUpgradePrice: 249.99,
          proUpgradeUrl: 'https://buy.stripe.com/cNi5kDdJQ558c6k2yB2go0b',
          voiceSubscriptionPrice: 9.99,
          voiceSubscriptionUrl: 'https://buy.stripe.com/4gMeVdcFMaps6M0b572go0f',
          creditPacks: [
            { pack: 10, minutes: 40, price: 10.00, label: '$10 Starter (40m)' },
            { pack: 25, minutes: 115, price: 25.00, label: '$25 Growth (115m)' },
            { pack: 50, minutes: 250, price: 50.00, label: '$50 Pro (250m)' },
            { pack: 100, minutes: 550, price: 100.00, label: '$100 Fleet (550m)' }
          ]
        }
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
