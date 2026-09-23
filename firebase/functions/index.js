/**
 * MissedCallAutoSMS.com - Firebase Cloud Functions & Stripe Backend
 * Automated $49.99 Self-Checkout, License Issuance, Hardware Device Binding, OTA App Updates & Owner API
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

admin.initializeApp();
const db = admin.firestore();

const SECRET_KEY = "MCAT_SECRET_PROD_KEY_2026";
const KEY_PREFIX = "MCAS-";

/**
 * Generate HMAC-SHA256 Signed License Key
 */
function generateKey(customerName, daysValid = 0) {
    const expiryTimestamp = daysValid === 0 ? 0 : Math.floor(Date.now() / 1000) + (daysValid * 86400);
    const payloadStr = `${customerName}|${expiryTimestamp}|${Math.floor(Date.now() / 1000)}`;
    const payloadHex = Buffer.from(payloadStr, "utf-8").toString("hex").toUpperCase();
    
    const hmac = crypto.createHmac("sha256", SECRET_KEY);
    hmac.update(payloadHex);
    const sigShort = hmac.digest("hex").substring(0, 8).toUpperCase();
    
    return `${KEY_PREFIX}${payloadHex}-${sigShort}`;
}

/**
 * 1. Stripe Checkout Webhook Handler
 * Listens for checkout.session.completed ($49.99 purchase)
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.rawBody,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET || ""
        );
    } catch (err) {
        console.error("Stripe Webhook Signature Verification Failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const customerEmail = session.customer_details ? session.customer_details.email : session.customer_email;
        const customerName = session.customer_details ? session.customer_details.name : "Valued Customer";
        const amountPaid = (session.amount_total / 100).toFixed(2);

        console.log(`Processing $${amountPaid} purchase for ${customerEmail} (${customerName})`);

        // Generate $49.99 License Key
        const licenseKey = generateKey(customerName, 0);

        // Write to Firestore Database
        await db.collection("licenses").doc(licenseKey).set({
            licenseKey: licenseKey,
            customerName: customerName,
            customerEmail: customerEmail,
            deviceId: null, // Unbound until first activation on device
            status: "ACTIVE",
            amountPaid: parseFloat(amountPaid),
            stripeSessionId: session.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`License ${licenseKey} successfully issued and stored in Firestore for ${customerEmail}`);
    }

    res.status(200).json({ received: true });
});

/**
 * 2. Device Hardware Binding Activation Endpoint
 * Binds Settings.Secure.ANDROID_ID to license key (1 device per key policy)
 */
exports.activateLicense = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") return res.status(204).send("");

    const { licenseKey, deviceId } = req.body;
    if (!licenseKey || !deviceId) {
        return res.status(400).json({ success: false, error: "Missing licenseKey or deviceId" });
    }

    const docRef = db.collection("licenses").doc(licenseKey.trim().toUpperCase());
    const doc = await docRef.get();

    if (!doc.exists) {
        return res.status(404).json({ success: false, error: "Invalid License Key" });
    }

    const data = doc.data();
    if (data.status === "REVOKED") {
        return res.status(403).json({ success: false, error: "License key has been revoked" });
    }

    // Check device binding
    if (!data.deviceId) {
        // First activation -> Bind device ID
        await docRef.update({ deviceId: deviceId, activatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return res.status(200).json({ success: true, message: "License bound to device successfully", customerName: data.customerName });
    } else if (data.deviceId === deviceId) {
        // Re-activation on same device
        return res.status(200).json({ success: true, message: "License valid for this device", customerName: data.customerName });
    } else {
        // Attempting to activate on a 2nd device
        return res.status(403).json({
            success: false,
            error: "This license key is locked to another physical device. Contact support to transfer your license."
        });
    }
});

/**
 * 3. In-App OTA Update Endpoint
 * Returns latest app version details for sideloaded APK auto-update checker
 */
exports.getLatestAppVersion = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.status(200).json({
        versionCode: 15,
        versionName: "1.6.1",
        downloadUrl: "https://missedcallautosms.com/downloads/missed-call-auto-sms.apk",
        releaseNotes: "In-App OTA update checking, enhanced business hours schedule, and performance updates.",
        mandatory: false,
        minSupportedVersion: 1
    });
});

/**
 * 4. Owner Admin Endpoint: Reset Device Binding (for phone transfers)
 */
exports.resetDeviceBinding = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    const { licenseKey, adminPassword } = req.body;
    if (adminPassword !== "2026") return res.status(401).json({ error: "Unauthorized" });

    await db.collection("licenses").doc(licenseKey.trim().toUpperCase()).update({ deviceId: null });
    res.status(200).json({ success: true, message: "Device lock cleared successfully" });
});

/**
 * 5. Owner Admin Endpoint: Revoke License (for refunds / chargebacks)
 */
exports.revokeLicense = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    const { licenseKey, adminPassword } = req.body;
    if (adminPassword !== "2026") return res.status(401).json({ error: "Unauthorized" });

    await db.collection("licenses").doc(licenseKey.trim().toUpperCase()).update({ status: "REVOKED" });
    res.status(200).json({ success: true, message: "License revoked successfully" });
});
