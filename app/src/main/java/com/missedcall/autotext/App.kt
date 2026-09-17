package com.missedcall.autotext

import android.app.Application
import android.util.Log
import com.missedcall.autotext.data.SettingsRepository
import com.missedcall.autotext.data.db.AppDatabase
import com.missedcall.autotext.data.license.DeveloperLicenseRegistry
import com.missedcall.autotext.remote.RemoteAccessServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

class App : Application() {

    lateinit var database: AppDatabase
        private set

    lateinit var settingsRepository: SettingsRepository
        private set

    lateinit var developerLicenseRegistry: DeveloperLicenseRegistry
        private set

    private var remoteServer: RemoteAccessServer? = null
    private val applicationScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun onCreate() {
        super.onCreate()
        instance = this
        database = AppDatabase.getDatabase(this)
        settingsRepository = SettingsRepository(this)
        developerLicenseRegistry = DeveloperLicenseRegistry(this)

        observeRemoteAccessSettings()
    }

    private fun observeRemoteAccessSettings() {
        applicationScope.launch {
            settingsRepository.settingsFlow
                .map { Pair(it.remoteAccessEnabled || it.webhookEnabled, it.remoteAccessPort) }
                .distinctUntilChanged()
                .collect { (shouldRun, port) ->
                    if (shouldRun) {
                        startRemoteServer(port)
                    } else {
                        stopRemoteServer()
                    }
                }
        }
    }

    @Synchronized
    fun startRemoteServer(port: Int) {
        stopRemoteServer()
        try {
            remoteServer = RemoteAccessServer(this, port).apply {
                start(fi.iki.elonen.NanoHTTPD.SOCKET_READ_TIMEOUT, false)
            }
            Log.i("App", "RemoteAccessServer started successfully on port $port")
        } catch (e: Exception) {
            Log.e("App", "Failed to start RemoteAccessServer on port $port", e)
        }
    }

    @Synchronized
    fun stopRemoteServer() {
        try {
            remoteServer?.stop()
            remoteServer = null
            Log.i("App", "RemoteAccessServer stopped")
        } catch (e: Exception) {
            Log.e("App", "Error stopping RemoteAccessServer", e)
        }
    }

    companion object {
        lateinit var instance: App
            private set
    }
}
