# Turnkey AI Voice Receptionist ($29/mo) — Integration & Telephony Guide

## Overview

The **Turnkey AI Voice Receptionist** adds an autonomous conversational voice layer to Missed Call Auto SMS. 

While the native Android app continues sending instant text auto-replies over the phone's physical SIM card, unanswered incoming calls automatically forward to an AI-powered voice assistant (powered by Vapi / Twilio SIP) after ringing the contractor's handset for 15 seconds.

---

## 1. Dual-Track Auto-Responder Architecture

```
                                  [ Incoming Call ]
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │    Contractor's Cell Rings (0–15s)     │
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
                                                            │
                                                            ▼
                                                [ AI Receptionist Triage ]
                                                 - Max 20 words/sentence
                                                 - Phonetic address confirm
                                                 - 3-min conversation cap
                                                            │
                                                            ▼
                                                [ End of Call Dispatch ]
                                                 - Transcript logged
                                                 - SMS confirmation sent
```

1. **Cell Ring Window (0–15s)**: Calls ring the contractor's personal phone first. If answered, zero AI minutes or fees are consumed.
2. **Conditional Forwarding**: If missed, busy, or rejected, the carrier switches audio to the dedicated AI receptionist number.
3. **Context Injection**: The Vapi server contacts `/api/vapi/webhook`, fetching the contractor's business name, technician name, and custom greeting.
4. **Conversational Guardrails**: Spoken brevity (under 20 words/sentence), mandatory phonetic street address read-back, and emergency triage.
5. **Post-Call Dispatch**: Immediate lead text sent to the contractor and booking acknowledgment sent to the homeowner.

---

## 2. Carrier Conditional Call Forwarding Matrix

Android security prevents apps from silently modifying carrier call forwarding rules without user consent. The app utilizes Android's `Intent.ACTION_DIAL` with `Uri.encode` to launch the phone dialer pre-populated with the exact MMI/USSD code. The contractor simply taps the green **Call** button once.

| Carrier | Activation Code (15s Ring) | Deactivation / Rollback Code | Technical Description |
|---|---|---|---|
| **Verizon / Visible / US Cellular** | `*71<10-digit-number>` | `*73` | Rings cell for 15s; forwards unanswered or busy calls. |
| **AT&T / Cricket / Consumer Cellular** | `*004*<10-digit-number>#` | `##004#` | Conditional forwarding for no-reply, unreachable, or busy. |
| **T-Mobile / Mint Mobile / Metro** | `**61*<10-digit-number>**15#` | `##004#` (or `##61#`) | Explicit 15-second delay before routing to forwarding target. |
| **Generic US Mobile / Landline** | `*71<10-digit-number>` | `*73` | Standard North American CDMA/LTE conditional prefix. |

---

## 3. Webhook Endpoints & API Reference

### 1. Dynamic Call Routing & Context Injection
- **Method**: `POST`
- **Path**: `/api/vapi/webhook`
- **Invoked By**: Vapi Inbound Assistant Webhook
- **Event Types**:
  - `assistant-request`: Vapi queries server before answering the call. Server responds with dynamically assembled system prompt:
    ```json
    {
      "assistant": {
        "model": {
          "provider": "openai",
          "model": "gpt-4o-mini",
          "messages": [
            {
              "role": "system",
              "content": "You are the professional AI voice receptionist for 'Apex Plumbing'..."
            }
          ]
        },
        "firstMessage": "Thanks for calling Apex Plumbing! How can I help you today?"
      }
    }
    ```
  - `end-of-call-report`: Fired when call disconnects. Delivers complete audio transcript, summary, structured caller details, and cost metrics.

### 2. Custom Greeting & Trade Profile API
- **Method**: `POST`
- **Path**: `/api/vapi/custom-greeting`
- **Payload**:
  ```json
  {
    "businessName": "Apex Plumbing & Heating",
    "ownerName": "Dave Miller",
    "serviceTrade": "Emergency Pipe Burst & Water Heaters",
    "customGreeting": "Thanks for calling Apex Plumbing! Our crew is on a job. How can we help you right now?"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "Custom greeting and voice receptionist profile updated successfully!"
  }
  ```

### 3. 1-Click Self-Service Subscription Cancellation
- **Method**: `POST`
- **Path**: `/api/vapi/cancel-subscription`
- **Payload**:
  ```json
  {
    "email": "contractor@example.com"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "cancelled": true,
    "carrierDeactivateCode": "*73",
    "mode": "OFF",
    "message": "Voice Pro subscription successfully cancelled in Stripe ($0 future charges)."
  }
  ```

---

## 4. In-App Setup & Management

### For the Contractor:
1. **Enable Forwarding**:
   - On the **Dashboard**, flip the **AI Voice Receptionist** switch to **ON**.
   - The native dialer opens with `*71<number>`.
   - Tap **Call**. Carrier responds with confirmation tone or *"Call forwarding confirmed"*.
2. **Customize AI Greeting**:
   - Tap **Manage Account & Subscription** ➔ **AI Voice Receptionist Greeting**.
   - Enter your business opening line and tap **Save Greeting**.
3. **Disable / Revert Forwarding**:
   - Flip the switch to **OFF**.
   - Dialer opens with `*73` or `##004#`.
   - Tap **Call** to restore normal carrier voicemail.
4. **Cancel Subscription**:
   - Open **Account Portal** ➔ **Voice Pro ($29/mo)** ➔ Tap **Cancel Voice Pro**.
   - Subscription is terminated in Stripe, and carrier rollback dialer launches automatically.

---

## 5. Security & TCPA Compliance

- **No Unauthorized Porting**: The contractor retains complete ownership of their phone number. Only unanswered audio streams forward via standard carrier telephony.
- **Immediate Revocation**: The contractor can disconnect the AI assistant at any second by dialing `*73` or `##004#` directly from their phone dialer.
- **Address Confirmation**: The AI agent is strictly instructed to read back street addresses phonetically to prevent dispatch errors on emergency calls.
