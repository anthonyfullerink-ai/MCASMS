# Turnkey AI Voice Receptionist ($29/mo) & BYOK Engine — Integration & Telephony Guide

## Overview

The **Turnkey AI Voice Receptionist** adds an autonomous conversational voice layer to Missed Call Auto SMS.

While the native Android app continues sending instant text auto-replies over the phone's physical SIM card, unanswered incoming calls automatically forward to an AI-powered voice assistant (powered by Vapi / Twilio SIP) after ringing the contractor's handset for 15 seconds.

Contractors can choose between:
1. **Managed Pro ($29/mo with 14-Day Free Trial)**: Turnkey setup with dedicated forwarding number, 200 included monthly minutes, and automated provisioning.
2. **BYOK ($0/mo)**: Free Bring-Your-Own-Key integration for power users supplying their own Vapi API Key and Assistant ID.

---

## 1. Dual-Track Auto-Responder Architecture

```
                                  [ Incoming Call ]
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │    Contractor's Cell Rings (0–15s)    │
                      └───────────────────┬───────────────────┘
                                          │
                        ┌─────────────────┴─────────────────┐
                        │                                   │
                 [ Contractor Answers ]             [ Unanswered / Busy ]
                        │                                   │
                        ▼                                   ▼
             Normal phone conversation            Carrier Conditional
              at $0 additional cost             Forwarding (*71 / *004*)
                                                            │
                                                            ▼
                                                [ Dedicated Vapi Number ]
                                                            │
                                                            ▼
                                                [ POST /api/vapi/webhook ]
                                                            │
                                              Dynamic Prompt & Greeting Injected
                                              - Contractor Status Dial aware
                                              - After-Hours / Emergency aware
                                                            │
                                                            ▼
                                                [ AI Receptionist Triage ]
                                                 - Brevity: max 20 words/sentence
                                                 - Phonetic address confirmation
                                                 - 3-min conversation safety cap
                                                            │
                                                            ▼
                                                [ End of Call Dispatch ]
                                                 - Full audio transcript logged
                                                 - FCM push notification to phone
                                                 - Genuine context-aware SMS via
                                                   native phone SIM (SmsManager)
```

1. **Cell Ring Window (0–15s)**: Calls ring the contractor's personal phone first. If answered, zero AI minutes or fees are consumed.
2. **Conditional Forwarding**: If missed, busy, or rejected, the carrier switches audio to the dedicated AI receptionist number.
3. **Context Injection**: The Vapi server contacts `/api/vapi/webhook`, fetching the contractor's business name, status dial selection, technician name, and custom greeting.
4. **Conversational Guardrails**: Spoken brevity (under 20 words/sentence), mandatory phonetic street address read-back, and emergency triage.
5. **Post-Call Dispatch**: Immediate lead text sent to the contractor, push notification posted to the app inbox, and a personalized follow-up SMS dispatched from the contractor's own SIM card.

---

## 2. Contractor Status Dial & Business Hours Auto-Sync

Located in the **AI Voice** tab of the Android app, the **Contractor Status Dial** allows tradespeople to dynamically adjust their receptionist's behavior without editing complex prompts:

| Status Mode | Receptionist Behavior | Post-Call Action |
|---|---|---|
| **Available** | Informs caller contractor will return call promptly. | Collects job details, quotes, & schedules. |
| **On a Job** | Explains hands are currently tied on a service call. | Takes emergency notes & confirms arrival window. |
| **In Meeting** | Professional conference demeanor; sets expectation of delay. | Offers booking link or afternoon callback. |
| **After Hours** | Strict emergency screening; alerts caller of after-hours rates. | Escalates critical leaks/hazards or queues morning text. |
| **Do Not Disturb** | Direct lead capture with promise of next-day priority dispatch. | Transcribes voicemail summary to Android inbox. |

### Business Hours Automatic Sync
When the contractor configures **Operating Hours** in their Core SMS Settings (e.g. 8:00 AM – 6:00 PM), the Status Dial automatically links:
- Outside operating hours, the dial switches to **AFTER_HOURS** mode automatically.
- During work hours, it reverts to the contractor's daytime preference.
- A visual "Linked to Business Hours" pill banner in the UI informs the contractor of the active schedule.

---

## 3. Carrier Conditional Call Forwarding Matrix & Contact Filtering

Android security prevents apps from silently modifying carrier call forwarding rules without user consent. The app utilizes Android's `Intent.ACTION_DIAL` with `Uri.encode` to launch the phone dialer pre-populated with the exact MMI/USSD code. The contractor simply taps the green **Call** button once.

| Carrier | Activation Code (15s Ring) | Deactivation / Rollback Code | Technical Description |
|---|---|---|---|
| **Verizon / Visible / US Cellular** | `*71<10-digit-number>` | `*73` | Rings cell for 15s; forwards unanswered or busy calls. |
| **AT&T / Cricket / Consumer Cellular** | `*004*<10-digit-number>#` | `##004#` | Conditional forwarding for no-reply, unreachable, or busy. |
| **T-Mobile / Mint Mobile / Metro** | `**61*<10-digit-number>**15#` | `##004#` (or `##61#`) | Explicit 15-second delay before routing to forwarding target. |
| **Generic US Mobile / Landline** | `*71<10-digit-number>` | `*73` | Standard North American CDMA/LTE conditional prefix. |

### Note on Saved Contacts Exclusion
- **Carrier Tower Limitation**: US cellular carriers (Verizon, AT&T, T-Mobile) do not support contact-selective conditional call forwarding at the cell tower level. When `*71` is active, any call that rings past 15 seconds without being answered will route to the forwarding line.
- **Smart App Handling**: To protect personal contacts, the native Android app screens incoming numbers against the device's Contacts directory. Personal contacts receive no automated sales follow-up texts, and contractors can answer known family/friends directly during the 15-second ring window.

---

## 4. Webhook Endpoints & API Reference

### 1. 14-Day Free Trial Stripe Checkout
- **Method**: `POST`
- **Path**: `/api/create-voice-pro-checkout`
- **Payload**:
  ```json
  {
    "businessName": "Apex Field Services",
    "customerEmail": "contractor@example.com",
    "licenseKey": "MCAS-PRO-DEMO-2026"
  }
  ```
- **Behavior**: Creates a Stripe Checkout Session with `subscription_data[trial_period_days] = 14`. $0 is billed at checkout; auto-bills $29/mo after 14 days.

### 2. Dynamic Call Routing & Context Injection
- **Method**: `POST`
- **Path**: `/api/vapi/webhook`
- **Invoked By**: Vapi Inbound Assistant Webhook
- **Event Types**:
  - `assistant-request`: Dynamically injects business profile, status dial instructions, and trade parameters.
  - `end-of-call-report`: Delivers transcript, audio recording URI, structured lead summary, and triggers native SIM follow-up SMS queue.

### 3. Developer Web-to-SMS Live Chat Gateway (Anthony / Owner Sales)
- **GET `/api/support/gateway-settings`**: Fetches active gateway mode (`LIVE_SMS` vs `AI_SUPPORT`).
- **POST `/api/support/gateway-settings`**: Toggles live chat routing between Anthony's phone (0 AI credits) and 24/7 AI Voice/Text Assistant.
- **POST `/api/support/visitor-message`**: Ingests visitor messages and queues live notification.
- **POST `/api/support/developer-reply`**: Delivers developer reply directly to the website visitor.

---

## 5. Security, Revocation & TCPA Compliance

- **No Unauthorized Porting**: The contractor retains 100% ownership of their telephone number.
- **Immediate Instant Fallback**: Contractors can disable forwarding instantly via the in-app toggle or by dialing `*73` from their phone dialer. The app immediately falls back to core SIM missed-call text back.
- **1-Click Subscription Termination**: Voice Pro subscriptions can be cancelled with one tap in the Customer Account Portal, stopping all Stripe rebilling and generating carrier rollback instructions.
