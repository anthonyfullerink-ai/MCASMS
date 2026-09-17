package com.missedcall.autotext.remote

import android.content.Context
import android.util.Log
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.gson.Gson
import com.missedcall.autotext.App
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.worker.SendAutoTextWorker
import fi.iki.elonen.NanoHTTPD
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

class RemoteAccessServer(
    private val context: Context,
    port: Int = 8080
) : NanoHTTPD(port) {

    companion object {
        private const val TAG = "RemoteAccessServer"
    }

    private val gson = Gson()
    private val app = context.applicationContext as App
    private val scope = CoroutineScope(Dispatchers.IO)

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri
        val method = session.method

        Log.d(TAG, "Request: ${method.name} $uri")

        return try {
            when {
                uri == "/" && method == Method.GET -> serveDashboardHtml()
                uri == "/api/status" && method == Method.GET -> serveStatus()
                uri == "/api/settings" && method == Method.GET -> serveSettings()
                uri == "/api/settings" && method == Method.POST -> handleUpdateSettings(session)
                uri == "/api/logs" && method == Method.GET -> serveLogs()
                uri == "/api/test-trigger" && method == Method.POST -> handleTestTrigger(session)
                uri == "/api/send-sms" && method == Method.POST -> handleSendSms(session)
                else -> newFixedLengthResponse(Response.Status.NOT_FOUND, "application/json", "{\"error\":\"Endpoint not found\"}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling remote HTTP request", e)
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json", "{\"error\":\"${e.localizedMessage}\"}")
        }
    }

    private fun serveDashboardHtml(): Response {
        val html = """
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Missed Call Auto-Text | Remote Dashboard</title>
                <style>
                    :root { --bg: #121418; --card: #1E222A; --accent: #00E676; --text: #FFFFFF; --muted: #9E9E9E; }
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; }
                    .container { max-width: 900px; margin: 0 auto; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #2A2F3A; padding-bottom: 15px; margin-bottom: 20px; }
                    .card { background: var(--card); border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
                    h2 { margin-top: 0; color: var(--accent); }
                    label { display: block; margin-top: 12px; font-weight: 500; }
                    input[type="text"], input[type="number"], textarea, select { width: 100%; box-sizing: border-box; background: #121418; color: #fff; border: 1px solid #333; padding: 10px; border-radius: 8px; margin-top: 4px; }
                    .btn { background: var(--accent); color: #000; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 15px; }
                    .btn:hover { opacity: 0.9; }
                    .log-item { background: #121418; border-left: 4px solid var(--accent); padding: 12px; border-radius: 6px; margin-bottom: 10px; }
                    .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; background: #333; }
                    .badge-SENT { background: #1B5E20; color: #A5D6A7; }
                    .badge-SKIPPED { background: #4A148C; color: #E1BEE7; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📱 Missed Call Auto-Text Appliance</h1>
                        <div><span class="badge badge-SENT">REMOTE CONNECTED</span></div>
                    </div>
                    
                    <div class="card">
                        <h2>Remote Configuration Control</h2>
                        <form id="settingsForm">
                            <label><input type="checkbox" id="masterEnabled"> Enable Master Service</label>
                            
                            <label>Business Name:</label>
                            <input type="text" id="businessName">
                            
                            <label>Message Template ({business_name}, {name}):</label>
                            <textarea id="messageTemplate" rows="3"></textarea>
                            
                            <label>Jitter Delay (seconds):</label>
                            <input type="number" id="jitterDelaySeconds" min="5" max="60">
                            
                            <label>Cooldown Window (hours):</label>
                            <input type="number" id="cooldownHours" min="1" max="24">
                            
                            <label><input type="checkbox" id="excludeSavedContacts"> Exclude Saved Contacts</label>
                            
                            <button type="button" class="btn" onclick="saveSettings()">Save Configuration Remotely</button>
                        </form>
                    </div>

                    <div class="card">
                        <h2>Trigger Test Auto-Text Pipeline</h2>
                        <input type="text" id="testPhone" placeholder="+17325550199">
                        <button type="button" class="btn" onclick="triggerTest()">Trigger Remote Test</button>
                    </div>

                    <div class="card">
                        <h2>Remote Activity Log</h2>
                        <div id="logContainer">Loading logs...</div>
                    </div>
                </div>

                <script>
                    async function loadDashboard() {
                        const settingsRes = await fetch('/api/settings');
                        const settings = await settingsRes.json();
                        document.getElementById('masterEnabled').checked = settings.masterEnabled;
                        document.getElementById('businessName').value = settings.businessName;
                        document.getElementById('messageTemplate').value = settings.messageTemplate;
                        document.getElementById('jitterDelaySeconds').value = settings.jitterDelaySeconds;
                        document.getElementById('cooldownHours').value = settings.cooldownHours;
                        document.getElementById('excludeSavedContacts').checked = settings.excludeSavedContacts;

                        loadLogs();
                    }

                    async function saveSettings() {
                        const payload = {
                            masterEnabled: document.getElementById('masterEnabled').checked,
                            businessName: document.getElementById('businessName').value,
                            messageTemplate: document.getElementById('messageTemplate').value,
                            jitterDelaySeconds: parseInt(document.getElementById('jitterDelaySeconds').value),
                            cooldownHours: parseInt(document.getElementById('cooldownHours').value),
                            excludeSavedContacts: document.getElementById('excludeSavedContacts').checked
                        };
                        const res = await fetch('/api/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        alert('Remote Configuration Saved!');
                    }

                    async function triggerTest() {
                        const phone = document.getElementById('testPhone').value;
                        if (!phone) return alert('Enter phone number');
                        await fetch('/api/test-trigger', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ phone_number: phone })
                        });
                        alert('Test pipeline triggered!');
                        setTimeout(loadLogs, 2000);
                    }

                    async function loadLogs() {
                        const res = await fetch('/api/logs');
                        const logs = await res.json();
                        const container = document.getElementById('logContainer');
                        if (!logs.length) { container.innerHTML = '<p>No call events recorded yet.</p>'; return; }
                        container.innerHTML = logs.map(l => `
                            <div class="log-item">
                                <strong>${'$'}{l.phoneNumber}</strong> 
                                <span class="badge badge-${'$'}{l.status}">${'$'}{l.status}</span><br>
                                <small>${'$'}{new Date(l.timestamp).toLocaleString()}</small>
                                ${'$'}{l.messageSent ? `<p>"${'$'}{l.messageSent}"</p>` : ''}
                            </div>
                        `).join('');
                    }

                    loadDashboard();
                </script>
            </body>
            </html>
        """.trimIndent()
        return newFixedLengthResponse(Response.Status.OK, "text/html", html)
    }

    private fun serveStatus(): Response {
        val settings = runBlocking { app.settingsRepository.getSettings() }
        val statusMap = mapOf(
            "status" to "ONLINE",
            "master_enabled" to settings.masterEnabled,
            "version" to "1.0.0",
            "device_time" to System.currentTimeMillis()
        )
        return newFixedLengthResponse(Response.Status.OK, "application/json", gson.toJson(statusMap))
    }

    private fun serveSettings(): Response {
        val settings = runBlocking { app.settingsRepository.getSettings() }
        return newFixedLengthResponse(Response.Status.OK, "application/json", gson.toJson(settings))
    }

    private fun handleUpdateSettings(session: IHTTPSession): Response {
        val body = HashMap<String, String>()
        session.parseBody(body)
        val postData = body["post"] ?: return newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", "{\"error\":\"Empty body\"}")
        val updated = gson.fromJson(postData, AppSettings::class.java)

        scope.launch {
            val current = app.settingsRepository.getSettings()
            app.settingsRepository.updateSettings(
                current.copy(
                    masterEnabled = updated.masterEnabled,
                    businessName = updated.businessName,
                    messageTemplate = updated.messageTemplate,
                    jitterDelaySeconds = updated.jitterDelaySeconds,
                    cooldownHours = updated.cooldownHours,
                    excludeSavedContacts = updated.excludeSavedContacts
                )
            )
        }
        return newFixedLengthResponse(Response.Status.OK, "application/json", "{\"success\":true}")
    }

    private fun serveLogs(): Response {
        val logs = runBlocking { app.database.callLogDao().getAllLogsFlow().first() }
        return newFixedLengthResponse(Response.Status.OK, "application/json", gson.toJson(logs))
    }

    private fun handleTestTrigger(session: IHTTPSession): Response {
        val body = HashMap<String, String>()
        session.parseBody(body)
        val postData = body["post"] ?: ""
        val inputMap = gson.fromJson(postData, Map::class.java)
        val phoneNumber = inputMap["phone_number"] as? String ?: return newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", "{\"error\":\"Missing phone_number\"}")

        val inputData = Data.Builder()
            .putString(SendAutoTextWorker.KEY_PHONE_NUMBER, phoneNumber)
            .build()

        val workRequest = OneTimeWorkRequestBuilder<SendAutoTextWorker>()
            .setInputData(inputData)
            .build()

        WorkManager.getInstance(context).enqueue(workRequest)

        return newFixedLengthResponse(Response.Status.OK, "application/json", "{\"success\":true,\"enqueued_for\":\"$phoneNumber\"}")
    }

    private fun handleSendSms(session: IHTTPSession): Response {
        val settings = runBlocking { app.settingsRepository.getSettings() }
        if (!settings.webhookEnabled) {
            return newFixedLengthResponse(Response.Status.FORBIDDEN, "application/json", "{\"error\":\"Webhook processing disabled in app settings\"}")
        }

        val body = HashMap<String, String>()
        session.parseBody(body)
        val postData = body["post"] ?: ""
        val inputMap = try {
            gson.fromJson(postData, Map::class.java) ?: emptyMap<String, Any>()
        } catch (e: Exception) {
            emptyMap<String, Any>()
        }

        val secret = (inputMap["secret"] as? String) ?: (inputMap["api_secret"] as? String) ?: ""
        val targetPhone = (inputMap["phone"] as? String) ?: (inputMap["phone_number"] as? String) ?: (inputMap["recipientPhone"] as? String) ?: ""
        val customMessage = (inputMap["message"] as? String) ?: (inputMap["message_text"] as? String) ?: (inputMap["text"] as? String) ?: ""
        val callbackUrl = (inputMap["callback_url"] as? String) ?: (inputMap["callbackUrl"] as? String) ?: ""

        // Validate Security Key
        if (settings.webhookApiSecret.isNotBlank() && secret != settings.webhookApiSecret) {
            Log.e(TAG, "Unauthorized Local Webhook attempt! Secret does not match configured API secret.")
            scope.launch {
                app.database.callLogDao().insertLog(
                    com.missedcall.autotext.data.db.CallLogEvent(
                        phoneNumber = if (targetPhone.isNotBlank()) targetPhone else "UNKNOWN",
                        status = com.missedcall.autotext.data.db.LogStatus.REMOTE_REJECTED,
                        failureReason = "Unauthorized Local Webhook Payload (Invalid Secret Key)",
                        messageSent = customMessage
                    )
                )
            }
            return newFixedLengthResponse(Response.Status.UNAUTHORIZED, "application/json", "{\"error\":\"Unauthorized: Invalid secret key\"}")
        }

        if (targetPhone.isBlank()) {
            return newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", "{\"error\":\"Missing phone or phone_number parameter\"}")
        }

        Log.i(TAG, "Valid Local Webhook received! Dispatching SMS to $targetPhone")

        val inputData = Data.Builder()
            .putString(SendAutoTextWorker.KEY_PHONE_NUMBER, targetPhone.trim())
            .putString(SendAutoTextWorker.KEY_OVERRIDE_MESSAGE, customMessage.trim())
            .putBoolean(SendAutoTextWorker.KEY_IS_REMOTE_TRIGGER, true)
            .putString(SendAutoTextWorker.KEY_CALLBACK_URL, callbackUrl.trim())
            .build()

        val workRequest = OneTimeWorkRequestBuilder<SendAutoTextWorker>()
            .setInputData(inputData)
            .build()

        WorkManager.getInstance(context).enqueue(workRequest)

        val responseMap = mapOf(
            "success" to true,
            "status" to "QUEUED",
            "phone" to targetPhone.trim(),
            "has_callback" to callbackUrl.isNotBlank()
        )
        return newFixedLengthResponse(Response.Status.OK, "application/json", gson.toJson(responseMap))
    }
}
