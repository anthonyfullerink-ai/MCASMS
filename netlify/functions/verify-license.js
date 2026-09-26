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
          voiceMinutesBalance = typeof binding.voiceMinutesBalance === 'number' ? Math.round(binding.voiceMinutesBalance) : 0.0;
          isPaused = binding.isVoicePaused === true || (voiceMinutesBalance <= 0);
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
            voiceMinutesBalance = typeof b.voiceMinutesBalance === 'number' ? Math.round(b.voiceMinutesBalance) : 0.0;
            isPaused = b.isVoicePaused === true || (voiceMinutesBalance <= 0);
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
      voiceForwardingNumber = voiceForwardingNumber || '+1 (732) 660-9121';
      voiceCarrierCode = voiceCarrierCode || '*717326609121';
      voiceMinutesBalance = 50.0;
      voiceActive = true;
      isPaused = false;
    }

    // Device Hardware Binding Check & Activation
    const incomingDeviceId = (payload.deviceId || payload.device_id || payload.hardwareId || event.queryStringParameters?.deviceId || '').trim();
    const incomingDeviceModel = (payload.deviceModel || payload.model || payload.device_model || event.queryStringParameters?.deviceModel || '').trim();
    const incomingAppVersion = (payload.appVersion || payload.app_version || '1.8.9').trim();

    let boundDeviceId = null;
    let boundDeviceModel = null;

    try {
      let _fsModule = null;
      try { _fsModule = require('../../lib/firestore'); } catch (e) {}

      if (_fsModule && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        const devBinding = await _fsModule.getDeviceBinding(key);
        if (devBinding && devBinding.deviceId) {
          boundDeviceId = devBinding.deviceId;
          boundDeviceModel = devBinding.model || devBinding.deviceModel || null;
        }
      }

      // Check local fallback cache if Firestore didn't find one
      if (!boundDeviceId) {
        const fs = require('fs');
        const path = require('path');
        const localCachePath = path.join(__dirname, '../../.device_tokens_cache.json');
        if (fs.existsSync(localCachePath)) {
          const cache = JSON.parse(fs.readFileSync(localCachePath, 'utf8') || '{}');
          if (cache[key] && (cache[key].device_id || cache[key].deviceId)) {
            boundDeviceId = cache[key].device_id || cache[key].deviceId;
            boundDeviceModel = cache[key].device_model || cache[key].model || null;
          }
        }
      }

      // Check master_licenses.json fallback
      if (!boundDeviceId) {
        const fs = require('fs');
        const path = require('path');
        const masterPath = path.join(__dirname, '../../data/master_licenses.json');
        if (fs.existsSync(masterPath)) {
          const ml = JSON.parse(fs.readFileSync(masterPath, 'utf8') || '[]');
          const item = ml.find(x => x.key === key);
          if (item && item.deviceId) {
            boundDeviceId = item.deviceId;
            boundDeviceModel = item.deviceModel || null;
          }
        }
      }

      // If incomingDeviceId provided, perform binding or lock verification
      if (incomingDeviceId) {
        const isDemo = key.includes('DEMO') || key.includes('TRIAL');
        if (boundDeviceId && boundDeviceId !== incomingDeviceId && !isDemo) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
              valid: false,
              error: `This license is hardware-bound to another device (${boundDeviceId}). Please reset device lock in your dashboard before activating on this phone.`,
              hardwareLocked: true,
              boundDeviceId
            })
          };
        }

        // Bind incoming device if not bound or if demo
        boundDeviceId = incomingDeviceId;
        boundDeviceModel = incomingDeviceModel || boundDeviceModel;

        if (_fsModule && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
          await _fsModule.saveDeviceBinding(key, incomingDeviceId, {
            model: boundDeviceModel,
            appVersion: incomingAppVersion
          });
        }

        // Persist to local .device_tokens_cache.json
        try {
          const fs = require('fs');
          const path = require('path');
          const localCachePath = path.join(__dirname, '../../.device_tokens_cache.json');
          let cache = {};
          if (fs.existsSync(localCachePath)) {
            cache = JSON.parse(fs.readFileSync(localCachePath, 'utf8') || '{}');
          }
          cache[key] = {
            license_key: key,
            device_id: incomingDeviceId,
            device_model: boundDeviceModel,
            app_version: incomingAppVersion,
            updatedAt: new Date().toISOString()
          };
          fs.writeFileSync(localCachePath, JSON.stringify(cache, null, 2), 'utf8');

          // Also update data/master_licenses.json if record exists
          const masterPath = path.join(__dirname, '../../data/master_licenses.json');
          if (fs.existsSync(masterPath)) {
            const list = JSON.parse(fs.readFileSync(masterPath, 'utf8') || '[]');
            const idx = list.findIndex(x => x.key === key);
            if (idx >= 0) {
              list[idx].deviceId = incomingDeviceId;
              list[idx].deviceModel = boundDeviceModel;
              fs.writeFileSync(masterPath, JSON.stringify(list, null, 2), 'utf8');
            }
          }
        } catch (localSaveErr) {
          console.warn('[verify-license] Local cache update notice:', localSaveErr.message);
        }
      }
    } catch (bindErr) {
      console.warn('[verify-license] Device binding check error:', bindErr.message);
    }

    let keyStatus = isPaused ? 'PAUSED' : 'ACTIVE';
    let activationPrompt = null;
    if (voiceEntitlement && (voiceMinutesBalance <= 0 || isPaused)) {
      keyStatus = 'PAUSED';
      activationPrompt = 'Voice & AI SMS minutes exhausted. Load a minute pack ($10 for 40 mins) to resume AI answering.';
    }

    const aiSmsActive = voiceEntitlement && (voiceMinutesBalance > 0) && !isPaused;

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
        aiSmsActive: aiSmsActive,
        voiceForwardingNumber: voiceForwardingNumber,
        carrierCode: voiceCarrierCode,
        voiceMinutesBalance: Math.round(voiceMinutesBalance),
        autoRebillEnabled: false,
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
        deviceId: boundDeviceId || null,
        deviceModel: boundDeviceModel || null,
        hardwareBound: !!boundDeviceId,
        features: {
          dualSim: true,
          n8nWebhook: isPro || voiceEntitlement,
          centralWebhookBridge: isPro || voiceEntitlement,
          aiVoiceReceptionist: voiceActive,
          aiConversationalSms: aiSmsActive,
          aiVoiceLiveTelephony: voiceActive,
          p2pSmsExempt: true // Native SIM auto-SMS remains 100% active
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
