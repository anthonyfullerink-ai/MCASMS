# Missed Call Auto-SMS & Pro Automation — Live Launch Checklist

This master checklist covers everything needed to take the website, Stripe billing, Resend email automation, and the Android APK live.

---

## 📋 Phase 1: Netlify Environment Variables
In your **Netlify Dashboard** ➔ Select Site ➔ **Site configuration** ➔ **Environment variables** ➔ **Add variable**:

| Variable Name | Value Description | Example |
|---|---|---|
| STRIPE_SECRET_KEY | Secret key from Stripe Dashboard | (Your Stripe Secret Key) |
| STRIPE_WEBHOOK_SECRET | Signing secret from Stripe Webhook endpoint | (Your Stripe Webhook Secret) |
| RESEND_API_KEY | API Key from Resend.com | (Your Resend API Key) |
| FROM_EMAIL | Branded sender address | Missed Call Auto SMS <support@missedcallautosms.com> |
| OWNER_EMAIL | Your alert address for new purchase pings | contactus@offgridmediagroup.com |

---

## 💳 Phase 2: Stripe Dashboard Setup

### Option A: One-Command Automated Setup
If you want Stripe products and payment links automatically created and wired into index.html and sales_landing_page.html, run:
```bash
node tools/setup_stripe.js <STRIPE_SECRET_KEY>
```
This script will:
1. Create the **.99 Standard Lifetime** Product & Payment Link.
2. Create the **.99 Pro Automation Lifetime** Product & Payment Link.
3. Automatically update initiateStripeCheckout(), initiateFreeTrialCheckout(), and initiateProStripeCheckout() in your HTML files.

### Option B: Manual Stripe Setup
If setting up manually in your Stripe Dashboard:
1. **Standard Product**:
   - Name: Missed Call Auto SMS - Lifetime Appliance
   - Price: $49.99 USD (One-time)
2. **Pro Automation Product**:
   - Name: Missed Call Auto SMS - Pro Automation Edition
   - Price: $149.99 USD (One-time)
   - Metadata key: tier = pro_automation
3. **Turnkey Voice Pro ($29/mo Recurring)**:
   - Run automated setup: `node tools/setup_voice_pro_subscription.js`
   - Or configure manually:
     - Name: Missed Call Auto SMS — Turnkey AI Voice Receptionist
     - Price: $29.00 USD / month recurring
     - Metadata key: tier = voice_receptionist_pro
4. **Configure Stripe Webhook Endpoint**:
   - Go to: **Developers ➔ Webhooks ➔ Add destination**.
   - Endpoint URL: https://missedcallautosms.com/api/stripe-webhook (or https://<YOUR-NETLIFY-SUBDOMAIN>.netlify.app/api/stripe-webhook)
   - Select events to listen to:
     - `checkout.session.completed`
     - `invoice.payment_succeeded`
     - `customer.subscription.deleted`
   - Click **Add endpoint**, then click **Reveal** under **Signing secret**.
   - Add this signing secret value to your Netlify STRIPE_WEBHOOK_SECRET.

---

## 📧 Phase 3: Resend Email Delivery
1. Log into [Resend.com](https://resend.com) and copy your API key into Netlify as RESEND_API_KEY.
2. **Domains**:
   - For live production: Add and verify missedcallautosms.com (add the 3 DNS TXT/MX records in your domain registrar).
   - For rapid testing: FROM_EMAIL will work with onboarding@resend.dev to your registered Resend account email.
3. **Email Verification**:
   - Submit a test purchase or use the Stripe CLI / test mode.
   - Check that the email arrives with:
     - Signed hardware license key (MCAS-... or MCAS-PRO-...)
     - Direct APK download link (MissedCallAutoSMS.apk or MissedCallAutoSMS-Pro.apk)
     - Direct n8n template download button (MissedCallAutoSMS_n8n_Workflow.json) for Pro buyers.

---

## 📱 Phase 4: Android Device Hardware Verification
Before deploying to real business lines:
1. **Install Release APK**: Sideload MissedCallAutoSMS.apk or MissedCallAutoSMS-Pro.apk on an Android phone.
2. **Permissions**: Grant SMS, Phone, and Call Log permissions when prompted.
3. **Battery Optimization**:
   - Go to **Android Settings ➔ Apps ➔ Missed Call Auto-SMS ➔ Battery**.
   - Set to **Unrestricted** (prevents Android Doze mode from putting the background listener to sleep).
4. **Dual SIM Setup (Pro)**:
   - If using dual SIM cards, go to **Settings ➔ Preferred Outbound SIM** and select SIM 1 or SIM 2.
5. **n8n / Webhook Test (Pro)**:
   - Toggle **Webhooks & n8n Automation** ON.
   - Note the API Secret.
   - Send test POST to http://<phone-ip>:8080/api/send-sms.
   - Verify carrier dispatch and confirm that the **SIM Burn Safeguard™** paces consecutive messages by $\ge$ 3.5 seconds.

---

## 🎙️ Phase 5: Turnkey AI Voice Receptionist Verification
1. **Carrier Activation Test**:
   - On the Dashboard, flip **AI Voice Receptionist** ON.
   - Verify the dialer opens with your carrier's code (`*71...`, `*004*...`, or `**61*...`).
   - Tap Call once and confirm the carrier activation tone.
2. **Unanswered Call Test**:
   - Call your phone from a second number. Let it ring for 15 seconds without answering.
   - Confirm that the call forwards to the Vapi assistant and speaks your custom intro greeting.
3. **Carrier Deactivation / Rollback Test**:
   - Flip **AI Voice Receptionist** OFF.
   - Verify dialer opens with `*73` or `##004#`.
   - Tap Call once and confirm forwarding is cancelled. Calls now go to your normal carrier voicemail.
4. **Self-Service Cancellation in App**:
   - Open **Customer Account Portal** ➔ **Voice Pro ($29/mo)** ➔ Tap **Cancel Voice Pro**.
   - Verify Stripe subscription is cancelled and dialer immediately opens with the rollback code.
