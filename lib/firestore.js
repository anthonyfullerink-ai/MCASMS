/**
 * lib/firestore.js
 * Centralized Firestore abstraction layer for Missed Call Auto SMS.
 *
 * Reads credentials from environment variables:
 *   FIREBASE_PROJECT_ID         — e.g. "offgrid-saas-core-1e97a9"
 *   FIREBASE_SERVICE_ACCOUNT_KEY — full service account JSON as a string
 *
 * Collections:
 *   voice_pro_bindings  — per-subscriber voice line assignments
 *   master_licenses     — all issued license keys with metadata
 *   voice_settings      — singleton operational settings for Riley assistant
 *   voice_call_logs     — Vapi end-of-call report data
 *   registered_devices  — hardware-bound device IDs per license
 */

'use strict';

const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const safeFieldValue = FieldValue || (admin.firestore && admin.firestore.FieldValue) || {
  serverTimestamp: () => new Date(),
  increment: (n) => n
};

let _db = null;

function getDb() {
  if (_db) return _db;

  const projectId = process.env.FIREBASE_PROJECT_ID || 'offgrid-saas-core-1e97a9';
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountRaw) {
    // Local / offline dev mode without Firebase credentials
    return null;
  }

  const apps = admin.getApps ? admin.getApps() : (admin.apps || []);
  if (apps.length === 0) {
    const certFn = admin.cert || (admin.credential && admin.credential.cert);
    let credential = null;
    try {
      const serviceAccount = JSON.parse(serviceAccountRaw);
      credential = certFn ? certFn(serviceAccount) : null;
    } catch (e) {
      console.error('[Firestore] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', e.message);
      return null;
    }

    if (!credential) return null;

    try {
      admin.initializeApp({
        credential,
        projectId
      });
    } catch (initErr) {
      console.warn('[Firestore] admin.initializeApp notice:', initErr.message);
    }
  }

  try {
    _db = getFirestore();
    _db.settings({ ignoreUndefinedProperties: true });
  } catch (fsErr) {
    console.warn('[Firestore] getFirestore() notice:', fsErr.message);
    _db = null;
  }
  return _db;
}

// ─────────────────────────────────────────────────────────────────────────────
// voice_pro_bindings collection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save or update a voice subscriber binding.
 * @param {string} licenseKey  — MCAS-PRO-... key (document ID)
 * @param {object} data        — subscriber fields (email, forwardingNumber, etc.)
 */
async function saveVoiceBinding(licenseKey, data) {
  const db = getDb();
  if (!db) return;
  await db.collection('voice_pro_bindings').doc(licenseKey).set({
    licenseKey,
    ...data,
    updatedAt: safeFieldValue.serverTimestamp()
  }, { merge: true });
  console.log(`[Firestore] voice_pro_bindings saved: ${licenseKey}`);
}

/**
 * Retrieve a voice subscriber binding by license key.
 * @param {string} licenseKey
 * @returns {object|null}
 */
async function getVoiceBinding(keyOrNumber) {
  const db = getDb();
  if (!db || !keyOrNumber) return null;

  // 1. Direct doc lookup by license key
  const doc = await db.collection('voice_pro_bindings').doc(keyOrNumber).get();
  if (doc.exists) return doc.data();

  // 2. Query by vapiPhoneNumber or forwardingNumber
  try {
    const snap1 = await db.collection('voice_pro_bindings')
      .where('vapiPhoneNumber', '==', keyOrNumber)
      .limit(1)
      .get();
    if (!snap1.empty) return snap1.docs[0].data();

    const snapId = await db.collection('voice_pro_bindings')
      .where('vapiPhoneNumberId', '==', keyOrNumber)
      .limit(1)
      .get();
    if (!snapId.empty) return snapId.docs[0].data();

    const snapAsst = await db.collection('voice_pro_bindings')
      .where('vapiAssistantId', '==', keyOrNumber)
      .limit(1)
      .get();
    if (!snapAsst.empty) return snapAsst.docs[0].data();

    const snap2 = await db.collection('voice_pro_bindings')
      .where('forwardingNumber', '==', keyOrNumber)
      .limit(1)
      .get();
    if (!snap2.empty) return snap2.docs[0].data();

    // 3. Fallback: return the most recently updated active voice subscriber if exists
    const allActive = await db.collection('voice_pro_bindings')
      .where('voiceActive', '==', true)
      .limit(1)
      .get();
    if (!allActive.empty) return allActive.docs[0].data();
  } catch (err) {
    console.warn('[Firestore] getVoiceBinding secondary query error:', err.message);
  }

  return null;
}

/**
 * Deactivate a voice subscriber by Stripe subscription ID.
 * Sets voiceActive=false and status='CANCELLED' for the matching binding.
 * @param {string} stripeSubscriptionId
 * @returns {string|null} licenseKey that was deactivated, or null
 */
async function deactivateVoiceSubscriber(stripeSubscriptionId) {
  const db = getDb();
  if (!db) return null;
  const snapshot = await db.collection('voice_pro_bindings')
    .where('subscriptionId', '==', stripeSubscriptionId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    console.warn(`[Firestore] No voice binding found for subscriptionId: ${stripeSubscriptionId}`);
    return null;
  }

  const doc = snapshot.docs[0];
  await doc.ref.update({
    status: 'CANCELLED',
    voiceActive: false,
    cloudApiActive: false,
    cancelledAt: safeFieldValue.serverTimestamp()
  });

  const data = doc.data();
  if (data.licenseKey) {
    try {
      await db.collection('master_licenses').doc(data.licenseKey).set({
        status: 'CANCELLED',
        voiceActive: false,
        cloudApiActive: false,
        cancelledAt: safeFieldValue.serverTimestamp()
      }, { merge: true });
    } catch (mErr) {}
  }
  console.log(`[Firestore] Voice binding & Cloud Relay deactivated for key: ${data.licenseKey} (sub: ${stripeSubscriptionId})`);
  return data.licenseKey;
}

/**
 * Get all active voice subscribers.
 * @returns {object[]}
 */
async function getAllVoiceSubscribers() {
  const db = getDb();
  if (!db) return [];
  const snapshot = await db.collection('voice_pro_bindings')
    .where('status', '==', 'ACTIVE')
    .get();
  return snapshot.docs.map(d => d.data());
}

// ─────────────────────────────────────────────────────────────────────────────
// master_licenses collection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save a master license record.
 * @param {object} licenseData — { key, customer, email, tier, price, voiceActive, ... }
 */
async function saveMasterLicense(licenseData) {
  const db = getDb();
  if (!db) return;
  const { key } = licenseData;
  if (!key) throw new Error('[Firestore] saveMasterLicense: licenseData.key is required');

  await db.collection('master_licenses').doc(key).set({
    ...licenseData,
    createdAt: safeFieldValue.serverTimestamp()
  }, { merge: true });
  console.log(`[Firestore] master_licenses saved: ${key}`);
}

/**
 * Get a master license by key.
 * @param {string} key
 * @returns {object|null}
 */
async function getMasterLicense(key) {
  const db = getDb();
  if (!db) return null;
  const doc = await db.collection('master_licenses').doc(key).get();
  return doc.exists ? doc.data() : null;
}

/**
 * Get all master licenses.
 * @returns {object[]}
 */
async function getAllMasterLicenses() {
  const db = getDb();
  if (!db) return [];
  const snapshot = await db.collection('master_licenses')
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map(d => d.data());
}

// ─────────────────────────────────────────────────────────────────────────────
// voice_settings collection (singleton document: "default")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the global voice settings document.
 * @returns {object}
 */
async function getVoiceSettings() {
  const db = getDb();
  if (!db) {
    return {
      mode: 'OFF',
      status: 'INACTIVE',
      monthlyMinutesQuota: 250,
      minutesUsed: 0
    };
  }
  const doc = await db.collection('voice_settings').doc('default').get();
  return doc.exists ? doc.data() : {
    mode: 'OFF',
    status: 'INACTIVE',
    monthlyMinutesQuota: 250,
    minutesUsed: 0
  };
}

/**
 * Save (merge) voice settings.
 * @param {object} settings
 */
async function saveVoiceSettings(settings) {
  const db = getDb();
  if (!db) return;
  await db.collection('voice_settings').doc('default').set({
    ...settings,
    updatedAt: safeFieldValue.serverTimestamp()
  }, { merge: true });
  console.log('[Firestore] voice_settings updated');
}

// ─────────────────────────────────────────────────────────────────────────────
// voice_call_logs collection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a Vapi end-of-call report to the log.
 * @param {object} callData
 */
async function logVoiceCall(callData) {
  const db = getDb();
  if (!db) return;
  await db.collection('voice_call_logs').add({
    ...callData,
    loggedAt: safeFieldValue.serverTimestamp()
  });
}

/**
 * Increment the minutesUsed counter for the matched subscriber by their forwarding number.
 * Atomically computes billable call minutes, quota limits, and newly incurred overage increments.
 * @param {string} forwardingNumber — the DID the call came in on
 * @param {number} durationSeconds
 * @returns {object} { callMinutes, previousMinutes, newTotalMinutes, quotaMinutes, newOverageMinutes, subscriber }
 */
async function incrementMinutesUsed(forwardingNumber, durationSeconds) {
  const db = getDb();
  const callMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
  if (!db) {
    return {
      success: true,
      callMinutes,
      newOverageMinutes: 0,
      subscriber: null
    };
  }

  // 1. Try direct doc lookup by licenseKey
  let docRef = db.collection('voice_pro_bindings').doc(forwardingNumber);
  let docSnap = await docRef.get();

  // 2. Fall back to querying by forwardingNumber
  if (!docSnap.exists) {
    const snapshot = await db.collection('voice_pro_bindings')
      .where('forwardingNumber', '==', forwardingNumber)
      .limit(1)
      .get();
    if (!snapshot.empty) {
      docRef = snapshot.docs[0].ref;
      docSnap = snapshot.docs[0];
    } else {
      docRef = null;
    }
  }

  if (docRef && docSnap.exists) {
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      const data = doc.data() || {};
      const previousMinutes = data.minutesUsed || 0;
      const quotaMinutes = data.quotaMinutes || 250;
      const newTotalMinutes = previousMinutes + callMinutes;

      // Calculate if this call generated overage minutes beyond the included quota
      const previousOverage = Math.max(0, previousMinutes - quotaMinutes);
      const newTotalOverage = Math.max(0, newTotalMinutes - quotaMinutes);
      const newOverageMinutes = Math.max(0, newTotalOverage - previousOverage);

      transaction.update(docRef, {
        minutesUsed: newTotalMinutes,
        overageMinutesBilled: safeFieldValue.increment(newOverageMinutes),
        lastCallAt: safeFieldValue.serverTimestamp()
      });

      return {
        success: true,
        callMinutes,
        previousMinutes,
        newTotalMinutes,
        quotaMinutes,
        newOverageMinutes,
        subscriber: { ...data, id: doc.id }
      };
    });

    console.log(`[Firestore] Metered: ${callMinutes} mins for ${forwardingNumber} (Total: ${result.newTotalMinutes}/${result.quotaMinutes}m, Overage: +${result.newOverageMinutes}m)`);
    return result;
  } else {
    // Fallback: increment on global voice_settings
    const settingsRef = db.collection('voice_settings').doc('default');
    await settingsRef.set({
      minutesUsed: safeFieldValue.increment(callMinutes),
      lastCallAt: safeFieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`[Firestore] Incremented global minutesUsed by ${callMinutes} (no specific binding for ${forwardingNumber})`);
    return {
      success: true,
      callMinutes,
      newOverageMinutes: 0,
      subscriber: null
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// registered_devices collection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save or update a device-to-license binding.
 * @param {string} licenseKey
 * @param {string} deviceId
 * @param {object} metadata — { platform, appVersion, etc. }
 */
async function saveDeviceBinding(licenseKey, deviceId, metadata = {}) {
  const db = getDb();
  if (!db) return;
  try {
    await db.collection('registered_devices').doc(licenseKey).set({
      licenseKey,
      deviceId,
      ...metadata,
      boundAt: safeFieldValue.serverTimestamp()
    }, { merge: true });

    // Also link deviceId directly to master_licenses document for instant dashboard sync
    await db.collection('master_licenses').doc(licenseKey).set({
      deviceId,
      deviceModel: metadata.model || metadata.deviceModel || null,
      lastActiveAt: safeFieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`[Firestore] registered_devices: bound ${deviceId} to ${licenseKey}`);
  } catch (err) {
    console.warn('[Firestore] saveDeviceBinding warning:', err.message);
  }
}

/**
 * Get the device binding for a license key.
 * @param {string} licenseKey
 * @returns {object|null}
 */
async function getDeviceBinding(licenseKey) {
  const db = getDb();
  if (!db) return null;
  const doc = await db.collection('registered_devices').doc(licenseKey).get();
  return doc.exists ? doc.data() : null;
}

/**
 * Clear a device binding (hardware reset) for a license key.
 * @param {string} licenseKey
 */
async function clearDeviceBinding(licenseKey) {
  const db = getDb();
  if (!db) return;
  try {
    await db.collection('registered_devices').doc(licenseKey).delete();
    await db.collection('master_licenses').doc(licenseKey).set({
      deviceId: null,
      deviceModel: null,
      unboundAt: safeFieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[Firestore] registered_devices: cleared binding for ${licenseKey}`);
  } catch (err) {
    console.warn('[Firestore] clearDeviceBinding warning:', err.message);
  }
}

/**
 * Retrieve all registered device bindings as a map of licenseKey -> deviceData.
 * @returns {object}
 */
async function getAllDeviceBindings() {
  const db = getDb();
  if (!db) return {};
  try {
    const snap = await db.collection('registered_devices').get();
    const map = {};
    snap.docs.forEach(d => {
      const data = d.data();
      if (data && (data.deviceId || data.licenseKey)) {
        map[d.id] = data;
      }
    });
    return map;
  } catch (err) {
    console.warn('[Firestore] getAllDeviceBindings warning:', err.message);
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Number Multi-Tenant Routing (Ring Correlation & Call Sessions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record an active ringing call from a subscriber device for correlation.
 */
async function saveRingPulse(callerDigits, pulseData) {
  const db = getDb();
  if (!db || !callerDigits) return;
  try {
    await db.collection('active_ringing_calls').doc(callerDigits).set({
      ...pulseData,
      updatedAt: safeFieldValue.serverTimestamp(),
      expiresAt: Date.now() + 120_000 // 2-minute TTL
    }, { merge: true });
    console.log(`[Firestore] active_ringing_calls: pulse recorded for ${callerDigits} -> ${pulseData.licenseKey}`);
  } catch (err) {
    console.warn('[Firestore] saveRingPulse warning:', err.message);
  }
}

/**
 * Retrieve active ring pulse for caller digits.
 */
async function getRingPulse(callerDigits) {
  const db = getDb();
  if (!db || !callerDigits) return null;
  try {
    const doc = await db.collection('active_ringing_calls').doc(callerDigits).get();
    if (doc.exists) {
      const data = doc.data();
      if (data && (!data.expiresAt || data.expiresAt > Date.now())) {
        return data;
      }
    }
  } catch (err) {
    console.warn('[Firestore] getRingPulse warning:', err.message);
  }
  return null;
}

/**
 * Bind a Vapi callId to a specific subscriber license key for multi-tenant webhook routing.
 */
async function saveCallSession(callId, sessionData) {
  const db = getDb();
  if (!db || !callId) return;
  try {
    await db.collection('voice_call_sessions').doc(callId).set({
      ...sessionData,
      createdAt: safeFieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn('[Firestore] saveCallSession warning:', err.message);
  }
}

/**
 * Retrieve bound subscriber session for a Vapi callId.
 */
async function getCallSession(callId) {
  const db = getDb();
  if (!db || !callId) return null;
  try {
    const doc = await db.collection('voice_call_sessions').doc(callId).get();
    return doc.exists ? doc.data() : null;
  } catch (err) {
    console.warn('[Firestore] getCallSession warning:', err.message);
  }
  return null;
}

module.exports = {
  getDb,
  // voice_pro_bindings
  saveVoiceBinding,
  getVoiceBinding,
  deactivateVoiceSubscriber,
  getAllVoiceSubscribers,
  // master_licenses
  saveMasterLicense,
  getMasterLicense,
  getAllMasterLicenses,
  // voice_settings
  getVoiceSettings,
  saveVoiceSettings,
  // voice_call_logs
  logVoiceCall,
  incrementMinutesUsed,
  // registered_devices
  saveDeviceBinding,
  getDeviceBinding,
  clearDeviceBinding,
  getAllDeviceBindings,
  // shared number multi-tenant routing
  saveRingPulse,
  getRingPulse,
  saveCallSession,
  getCallSession
};
