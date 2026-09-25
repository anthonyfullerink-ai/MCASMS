package com.missedcall.autotext.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.missedcall.autotext.App
import com.missedcall.autotext.data.AppSettings
import com.missedcall.autotext.ui.screens.MainScreen
import com.missedcall.autotext.ui.theme.MissedCallAutoTextTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val requiredPermissions: Array<String>
        get() {
            val list = mutableListOf(
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.READ_CALL_LOG,
                Manifest.permission.SEND_SMS,
                Manifest.permission.READ_SMS,
                Manifest.permission.RECEIVE_SMS,
                Manifest.permission.READ_CONTACTS
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                list.add(Manifest.permission.POST_NOTIFICATIONS)
            }
            return list.toTypedArray()
        }

    private var missingPermissions by mutableStateOf<List<String>>(emptyList())
    private var deepLinkLicenseKey by mutableStateOf<String?>(null)

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        checkPermissions()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        extractDeepLink(intent)
        checkPermissions()

        val app = application as App
        val settingsRepo = app.settingsRepository
        val devRegistry = app.developerLicenseRegistry
        val dao = app.database.callLogDao()
        val voiceDao = app.database.voiceCallDao()

        // Sync FCM token with Central Webhook Bridge
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().token
                .addOnCompleteListener { task ->
                    if (task.isSuccessful) {
                        val token = task.result
                        lifecycleScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                            settingsRepo.saveFcmToken(token)
                            val currentSettings = settingsRepo.getSettings()
                            if (currentSettings.licenseKey.isNotBlank()) {
                                com.missedcall.autotext.remote.FCMWebhookService.registerDeviceToken(
                                    this@MainActivity,
                                    token,
                                    currentSettings.licenseKey
                                )
                            }
                        }
                    }
                }
        } catch (e: Exception) {
            android.util.Log.w("MainActivity", "Firebase FCM init warning", e)
        }

        setContent {
            MissedCallAutoTextTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val settings by settingsRepo.settingsFlow.collectAsState(initial = AppSettings())
                    val logs by dao.getAllLogsFlow().collectAsState(initial = emptyList())
                    val voiceCalls by voiceDao.getAllVoiceCallsFlow().collectAsState(initial = emptyList())
                    val devRecords by devRegistry.recordsFlow.collectAsState(initial = emptyList())

                    val notifDao = app.database.appNotificationDao()
                    val notifications by notifDao.getAllNotificationsFlow().collectAsState(initial = emptyList())

                    if (settings.licenseKey.isBlank()) {
                        com.missedcall.autotext.ui.screens.LicenseGateScreen(
                            initialLicenseKey = deepLinkLicenseKey,
                            onActivationSuccess = { updater ->
                                lifecycleScope.launch {
                                    settingsRepo.updateSettings(settings.updater())
                                }
                            }
                        )
                    } else {
                        MainScreen(
                            settings = settings,
                            onSettingsChanged = { updatedSettings ->
                                val oldKey = settings.licenseKey
                            lifecycleScope.launch {
                                settingsRepo.updateSettings(updatedSettings)
                                if (updatedSettings.licenseKey.isNotBlank() && (updatedSettings.licenseKey != oldKey || updatedSettings.fcmDeviceToken.isNotBlank())) {
                                    com.missedcall.autotext.remote.FCMWebhookService.registerDeviceToken(
                                        this@MainActivity,
                                        updatedSettings.fcmDeviceToken,
                                        updatedSettings.licenseKey
                                    )
                                }
                            }
                        },
                        logs = logs,
                        onClearLogs = {
                            lifecycleScope.launch {
                                dao.clearLogs()
                            }
                        },
                        voiceCalls = voiceCalls,
                        onMarkVoiceCallRead = { callId ->
                            lifecycleScope.launch {
                                voiceDao.markAsRead(callId)
                            }
                        },
                        onClearVoiceCalls = {
                            lifecycleScope.launch {
                                voiceDao.clearAll()
                            }
                        },
                        devRecords = devRecords,
                        onAddDevRecord = { customerName, licenseKey ->
                            lifecycleScope.launch {
                                devRegistry.addRecord(customerName, licenseKey)
                            }
                        },
                        onToggleDevRevoke = { licenseKey ->
                            lifecycleScope.launch {
                                devRegistry.toggleRevokeRecord(licenseKey)
                            }
                        },
                        notifications = notifications,
                        onMarkAllNotificationsRead = {
                            lifecycleScope.launch {
                                notifDao.markAllAsRead()
                            }
                        },
                        onClearNotifications = {
                            lifecycleScope.launch {
                                notifDao.clearAll()
                            }
                        },
                        onMarkNotificationRead = { id ->
                            lifecycleScope.launch {
                                notifDao.markAsRead(id)
                            }
                        },
                        initialOpenNotifications = intent?.getBooleanExtra("OPEN_NOTIFICATIONS_PANEL", false) ?: false,
                        missingPermissions = missingPermissions,
                        onRequestPermissions = {
                            permissionLauncher.launch(requiredPermissions)
                        },
                        onRequestPermissionBatch = { batch ->
                            permissionLauncher.launch(batch.toTypedArray())
                        }
                    )
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        extractDeepLink(intent)
    }

    private fun extractDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        val key = data.getQueryParameter("key")?.trim()
        if (!key.isNullOrBlank()) {
            deepLinkLicenseKey = key
        }
    }

    override fun onResume() {
        super.onResume()
        checkPermissions()
    }

    private fun checkPermissions() {
        missingPermissions = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
    }

    companion object {
        fun openAppSettings(context: Context) {
            try {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.fromParts("package", context.packageName, null)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
