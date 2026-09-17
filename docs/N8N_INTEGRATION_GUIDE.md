# Missed Call Auto-SMS Pro — n8n Workflow Integration Guide

Connect your Android phone as a high-speed, direct-carrier SMS gateway for **n8n**, **Zapier**, **Make**, or custom CRMs.

---

## ⚡ What's Included

The pre-built template **MissedCallAutoSMS_n8n_Workflow.json** includes:
1. **Outbound SMS Dispatcher**: Ingests new leads from webforms, calendars, or CRMs and dispatches SMS directly through your phone's carrier SIM.
2. **Dual SIM Line Routing**: Easily specify sim_slot: 1 (personal) or sim_slot: 2 (business eSIM).
3. **Two-Way Delivery Receipt Callback**: The phone reports back HTTP 200 with { status: "SENT", timestamp: ... } when the carrier confirms dispatch.
4. **Hardware Appliance Health Check**: Hourly automated heartbeat to verify the Android phone is online and active.

---

## 🚀 3-Minute Quick Start

### Step 1: Get Your Phone's Connection Details
1. Open **MissedCallAuto-SMS Pro** on your Android phone.
2. Go to **Settings (⚙️) ➔ Integrations ➔ Webhooks & n8n Automation**.
3. Toggle **Enable Webhook Trigger** to **ON**.
4. Tap **Generate / Copy** to copy your **App API Secret** (e.g. 1b2c3d4e5f67890).
5. Check your phone's IP address:
   - **Local Wi-Fi**: Shown on the Remote Access card (e.g., 192.168.1.150:8080).
   - **Anywhere in the World (Recommended)**: Install free [Tailscale](https://tailscale.com) on your phone and n8n server to reach your phone on any cellular/LTE network (e.g., 100.x.y.z:8080).

### Step 2: Import Workflow into n8n
1. In your **n8n** dashboard, click **Workflows** ➔ **Add workflow**.
2. Click the **three dots (⋮)** in the top right ➔ **Import from File...**
3. Select **MissedCallAutoSMS_n8n_Workflow.json**.

### Step 3: Configure Variables
1. Double-click the node labeled **Configure SMS & Device Target**.
2. Replace:
   - secret: Paste your 16-character Webhook Secret from the app.
   - device_ip_or_host: Enter your phone's IP (e.g. 192.168.1.150:8080 or Tailscale IP).
   - callback_url: Set to your n8n delivery callback webhook URL.
3. Save and click **Activate**!

---

## 📡 API Reference

### 1. Dispatch SMS
- **Endpoint**: POST http://<PHONE-IP>:8080/api/send-sms
- **Headers**: Content-Type: application/json
- **JSON Payload**:
`json
{
  "secret": "YOUR_16_CHAR_SECRET",
  "phone": "+15551234567",
  "message": "Hi John! Thanks for reaching out to Apex Plumbing. We received your request and will call you right back.",
  "sim_slot": 1,
  "callback_url": "https://your-n8n.com/webhook/sms-delivery-callback"
}
`

#### Field Details:
| Field | Type | Description |
|---|---|---|
| secret | string | **Required**. Matches the API Secret configured in the app. |
| phone | string | **Required**. Target destination phone number. |
| message | string | **Optional**. Custom message text. If omitted, uses default template. |
| sim_slot | integer | **Optional**. 1 for SIM 1, 2 for SIM 2. Defaults to app preferred SIM. |
| callback_url | string | **Optional**. Webhook URL to receive delivery receipt. |

### 2. Delivery Receipt Callback Payload
When the carrier confirms dispatch, your Android phone makes an HTTP POST to your callback_url:
`json
{
  "status": "SENT",
  "phone": "+15551234567",
  "sim_slot": 1,
  "message": "Hi John! Thanks for reaching out...",
  "timestamp": 1789658400000
}
`

---

## 🛡️ SIM Burn Safeguard™ (Carrier Anti-Spam)
Every Pro build includes hardware-level rate limiting:
- **3.5s Sequential Spacing**: Prevents rapid-fire bursts that trigger carrier spam filters.
- **20 SMS / minute ceiling**: Protects your personal/business SIM card from carrier throttling or suspension.
- **Conversational Only**: Engineered for 1-to-1 lead responses, appointment confirmations, and quotes—never bulk blast marketing.
