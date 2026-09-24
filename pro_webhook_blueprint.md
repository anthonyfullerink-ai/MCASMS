# MissedCallAutoSMS Pro - Full Webhook & API Gateway Implementation Plan

## 1. Outbound Webhook Engine (Triggers)
**Goal:** Expand existing single-URL webhook into a robust multi-event webhook dispatcher.
**Events to Implement:**
* `call.missed`: (Already partially implemented, needs standardization)
* `sms.sent`: Fire when auto-SMS or API SMS successfully dispatches.
* `sms.received`: Fire when a text is received on the phone.
* `call.completed`: Fire when a call is answered and finishes.
* `voicemail.received`: Fire if voicemail recording/transcription is complete.

**Safeguards to Add:**
* **`event_id`**: Generate UUID for every event to guarantee idempotency.
* **HMAC-SHA256 Signature**: Compute a hash using the user's API Key as the secret and attach as `X-Signature`.
* **Retry Engine**: Use Android's `WorkManager` with exponential backoff for failed webhook deliveries.

## 2. Inbound REST API (Actions)
Since MissedCallAutoSMS relies on the local Android SIM, inbound requests from CRMs (n8n/Zapier) need to be proxied through the cloud backend (e.g., Firebase FCM or Cloud Relay API) down to the phone.
**Endpoints (Cloud Server to Android via FCM/Socket):**
* `POST /v1/messages/send`: Tells the Android device to dispatch an SMS via physical SIM.
* `POST / PATCH /v1/contacts`: Updates the Android local room database with CRM contact names.
* `PATCH /v1/settings/auto-reply`: Toggles settings remotely.
* `POST /v1/dnc`: Adds number to the DNC/Opt-Out list on the Android device.

## 3. User Dashboard Requirements (Android App)
**Settings UI Enhancements:**
* **API Key Generation**: A section to view/regenerate the `sk_live_...` secret key used for API auth and HMAC signing.
* **Webhook Subscription Manager**:
  * Allow configuring a single master URL (or multiple) with checkboxes for which events to subscribe to (`[x] call.missed`, `[x] sms.received`, etc.).
* **Delivery Logs / Test Ping**:
  * Expand the existing "Test Ping" to allow simulating specific payloads.
  * Add a "Webhook Delivery History" log view to show status codes and retry counts.

## 4. A2P 10DLC & Opt-Out Handling
* Update `SmsReceiver`: If incoming body contains `STOP`, `UNSUBSCRIBE`, or `CANCEL` (case-insensitive):
  * Instantly add the number to a local DNC database.
  * Fire an `opt_out.received` webhook.

---
### Execution Strategy
Since Phase 1 & 2 are partially implemented:
1. **First Step**: Refactor `AppSettings.kt` and `SettingsRepository.kt` to store the new Webhook Configuration (event checkboxes, API secret key, DNC list).
2. **Second Step**: Upgrade the Outbound Webhook dispatcher (`WebhookManager.kt` or `SendAutoTextWorker.kt`) to support signatures, idempotency, and WorkManager retry backoff.
3. **Third Step**: Implement the `SmsReceiver` triggers for `sms.received` and Opt-Out detection.
4. **Fourth Step**: Update the UI in `SettingsScreen.kt` to provide the Webhook Subscription Manager and API Key management.
5. **Fifth Step**: Ensure Cloud-to-Device REST commands (`/v1/messages/send`) are cleanly supported in the server and Android listener.
