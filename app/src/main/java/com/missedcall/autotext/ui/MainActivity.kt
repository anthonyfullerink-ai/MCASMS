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

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        checkPermissions()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        checkPermissions()

        val app = application as App
        val settingsRepo = app.settingsRepository
        val devRegistry = app.developerLicenseRegistry
        val dao = app.database.callLogDao()

        setContent {
            MissedCallAutoTextTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val settings by settingsRepo.settingsFlow.collectAsState(initial = AppSettings())
                    val logs by dao.getAllLogsFlow().collectAsState(initial = emptyList())
                    val devRecords by devRegistry.recordsFlow.collectAsState(initial = emptyList())

                    MainScreen(
                        settings = settings,
                        onSettingsChanged = { updatedSettings ->
                            lifecycleScope.launch {
                                settingsRepo.updateSettings(updatedSettings)
                            }
                        },
                        logs = logs,
                        onClearLogs = {
                            lifecycleScope.launch {
                                dao.clearLogs()
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
