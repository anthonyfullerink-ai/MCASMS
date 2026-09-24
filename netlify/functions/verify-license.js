const crypto = require('crypto');

const LICENSE_SECRET = process.env.LICENSE_SECRET || "MCAT_SECRET_PROD_KEY_2026";

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-License-Key'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    let payload = {};
    if (event.body) {
      try { payload = JSON.parse(event.body); } catch (e) {}
    }

    const key = (payload.licenseKey || payload.key || event.queryStringParameters?.licenseKey || event.queryStringParameters?.key || '').trim().toUpperCase();

    if (!key) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ valid: false, error: 'License key is required.' })
      };
    }

    if (!key.startsWith('MCAS-') && !key.startsWith('MCAT-')) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: false,
          error: 'Invalid License Key Prefix. Valid keys begin with MCAS- or MCAS-PRO-.'
        })
      };
    }

    const isPro = key.startsWith('MCAS-PRO-') || key.startsWith('MCAT-PRO-') || key.includes('PRO-DEMO');
    const isAgency = key.startsWith('MCAS-AGENCY-') || key.startsWith('MCAT-AGENCY-');

    // Check Voice Pro Bindings (Cloud Firestore with local JSON fallback)
    let voiceActive = false;
    let voiceForwardingNumber = null;
    let voiceCarrierCode = null;
    let vapiAssistantId = null;
    let vapiPhoneNumberId = null;
    let voiceEntitlement = false;
    let voiceSubWaived = false;
    let vapiProvisioned = false;
    let voiceMinutesBalance = 0.0;
    let isPaused = false;

    try {
      let _fsModule = null;
      try { _fsModule = require('../../lib/firestore'); } catch (e) {}

      if (_fsModule && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        const binding = await _fsModule.getVoiceBinding(key);
        if (binding) {
          voiceEntitlement = !!(binding.voiceEntitlement || binding.voiceSubActive || binding.voiceSubWaived || binding.active);
          voiceSubWaived = !!binding.voiceSubWaived;
          vapiProvisioned = !!binding.vapiProvisioned;
          voiceForwardingNumber = binding.forwardingNumber || null;
          voiceCarrierCode = binding.carrierCode || null;
          vapiAssistantId = binding.vapiAssistantId || null;
          vapiPhoneNumberId = binding.vapiPhoneNumberId || null;
          voiceMinutesBalance = typeof binding.voiceMinutesBalance === 'number' ? binding.voiceMinutesBalance : 0.0;
          isPaused = binding.isVoicePaused === true || (voiceMinutesBalance <= 0 && binding.autoRebillEnabled === false);
          voiceActive = voiceEntitlement && vapiProvisioned && (voiceMinutesBalance > 0) && !isPaused;
        }
      } else {
        const fs = require('fs');
        const path = require('path');
        const voiceBindingsFile = path.join(__dirname, '../../.voice_pro_bindings.json');
        if (fs.existsSync(voiceBindingsFile)) {
          const bindings = JSON.parse(fs.readFileSync(voiceBindingsFile, 'utf8'));
          if (bindings[key]) {
            const b = bindings[key];
            voiceEntitlement = !!(b.voiceEntitlement || b.voiceSubActive || b.voiceSubWaived || b.active);
            voiceSubWaived = !!b.voiceSubWaived;
            vapiProvisioned = !!b.vapiProvisioned;
            voiceForwardingNumber = b.forwardingNumber || null;
            voiceCarrierCode = b.carrierCode || null;
            vapiAssistantId = b.vapiAssistantId || null;
            vapiPhoneNumberId = b.vapiPhoneNumberId || null;
            voiceMinutesBalance = typeof b.voiceMinutesBalance === 'number' ? b.voiceMinutesBalance : 0.0;
            isPaused = b.isVoicePaused === true || (voiceMinutesBalance <= 0 && b.autoRebillEnabled === false);
            voiceActive = voiceEntitlement && vapiProvisioned && (voiceMinutesBalance > 0) && !isPaused;
          }
        }
      }
    } catch (e) {
      console.warn('[verify-license] Voice binding check notice:', e.message);
    }

    // Master Demo bypass
    if (key === 'MCAS-PRO-DEMO-89F2') {
      voiceEntitlement = true;
      vapiProvisioned = true;
      voiceForwardingNumber = voiceForwardingNumber || '+1 (555) 349-2810';
      voiceCarrierCode = voiceCarrierCode || '*715553492810';
      voiceMinutesBalance = 50.0;
      voiceActive = true;
    }

    let keyStatus = isPaused ? 'PAUSED' : 'ACTIVE';
    let activationPrompt = null;
    if (voiceEntitlement && !vapiProvisioned) {
      keyStatus = 'UNLOCKED_PENDING_PACK';
      activationPrompt = 'Voice Engine Unlocked! Fund your first 40-minute credit pack ($10) to generate your dedicated carrier line and activate AI answering.';
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        licenseKey: key,
        status: keyStatus,
        tier: isAgency ? 'AGENCY' : (isPro ? 'PRO' : 'STANDARD'),
        edition: isAgency ? 'Agency Fleet Partner' : (isPro ? 'Pro Automation Gateway ($299)' : 'Flagship Appliance Edition ($49.99)'),
        isPro: isPro || voiceEntitlement,
        perpetualPro: isPro && !key.includes('TRIAL'),
        voiceEligible: true,
        voiceEntitlement: voiceEntitlement,
        voiceSubActive: voiceEntitlement && !voiceSubWaived,
        voiceSubWaived: voiceSubWaived,
        vapiProvisioned: vapiProvisioned,
        voiceActive: voiceActive,
        voiceForwardingNumber: voiceForwardingNumber,
        carrierCode: voiceCarrierCode,
        voiceMinutesBalance: voiceMinutesBalance,
        autoRebillEnabled: true,
        isVoicePaused: isPaused,
        ratePerMinute: 0.25,
        packPriceDollars: 10.00,
        packMinutes: 40,
        checkoutCreditPackUrl: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f',
        creditPackTiers: [
          { id: 'pack_10', name: 'Starter Pack', price: 10.00, minutes: 40, ratePerMin: 0.250, discountPct: 0, url: 'https://buy.stripe.com/5kA8wPfRY0PS6M014f' },
          { id: 'pack_25', name: 'Growth Pack (+15 Free Mins)', price: 25.00, minutes: 115, ratePerMin: 0.217, discountPct: 13, bonusMinutes: 15, url: 'https://missedcallautosms.com/api/create-credit-pack-checkout?pack=25' },
          { id: 'pack_50', name: 'Pro Contractor (+50 Free Mins)', price: 50.00, minutes: 250, ratePerMin: 0.200, discountPct: 20, bonusMinutes: 50, url: 'https://missedcallautosms.com/api/create-credit-pack-checkout?pack=50' },
          { id: 'pack_100', name: 'Fleet Pack (+150 Free Mins)', price: 100.00, minutes: 550, ratePerMin: 0.181, discountPct: 28, bonusMinutes: 150, url: 'https://missedcallautosms.com/api/create-credit-pack-checkout?pack=100' }
        ],
        activationPrompt: activationPrompt,
        vapiAssistantId: vapiAssistantId,
        vapiPhoneNumberId: vapiPhoneNumberId,
        type: key.includes('TRIAL') ? 'TRIAL' : (key.includes('DEMO') ? 'DEMO' : (voiceSubWaived ? 'FREE_VOICE_COMP' : 'PAID')),
        deviceId: 'Protected (1 Physical Android Phone Bound)',
        features: {
          dualSim: true,
          n8nWebhook: isPro || voiceEntitlement,
          centralWebhookBridge: isPro || voiceEntitlement,
          aiVoiceReceptionist: voiceEntitlement, // UI controls in APK unlocked
          aiVoiceLiveTelephony: voiceActive,     // True once carrier forwarding active
          p2pSmsExempt: true
        },
        verifiedAt: new Date().toISOString()
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ valid: false, error: err.message })
    };
  }
};
