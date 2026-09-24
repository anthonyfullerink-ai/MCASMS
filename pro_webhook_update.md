# MissedCallAutoSMS Webhook & API Infrastructure (Pro Feature)

## 1. Outbound Webhooks (Broadcaster)
The Android appliance now securely broadcasts real-time telephony events via the new `WebhookWorker`. This worker leverages Android's `WorkManager` to provide native **exponential backoff and automatic retries** if the receiving endpoint (n8n, Zapier, etc.) is temporarily offline.

**Events Supported:**
- `call.missed`: Triggers immediately when an incoming call goes to voicemail or is rejected.
- `call.completed`: Triggers when an answered call finishes.
- `sms.sent`: Dispatched when the engine successfully outputs an SMS.
- `sms.received`: Forwards incoming user texts (Phase 2).
- `opt_out.received`: A specialized hook fired automatically when A2P 10DLC STOP words (`STOP`, `UNSUBSCRIBE`, etc.) are detected from an inbound SMS.

**Security:**
Every webhook payload includes an `X-Signature` header calculated using HMAC-SHA256 and the user's `webhookApiSecret`. It also natively passes idempotency keys (`event_id`).

---

## 2. Inbound REST API (Listener)
The local server (`RemoteAccessServer.kt`) has been upgraded with standard `/v1` HTTP endpoints that integrate directly with external CRMs. 

All endpoints require strict authentication via either the `Authorization: Bearer <WebhookApiSecret>` header or the `x-api-key: <WebhookApiSecret>` header.

**Endpoints Deployed:**
- **`POST /v1/messages/send`**: Dispatches an outbound text by queueing a background worker. (Includes SIM slot selection and anti-spam pacing).
- **`POST /PATCH /v1/contacts`**: Syncs CRM contacts natively.
- **`PATCH /v1/settings/auto-reply`**: Remotely alters the appliance's templates and master switch.
- **`POST /v1/dnc`**: Remotely flags a number on the Do-Not-Call (DNC) list.

---

## 3. UI Implementation
- The app dashboard has been updated to include granular **Webhook Subscriptions**. 
- Users can toggle `call.missed`, `sms.sent`, `sms.received`, and `call.completed` on and off independently to reduce spam to their webhook URLs.
- As requested, **NO CODE** was pushed to GitHub. The changes only exist on your local environment for now.
