package com.missedcall.autotext.service

import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log
import com.missedcall.autotext.App
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class AutoTextTileService : TileService() {

    companion object {
        private const val TAG = "AutoTextTileService"
    }

    private val serviceScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun onStartListening() {
        super.onStartListening()
        updateTileState()
    }

    override fun onClick() {
        super.onClick()
        val app = application as App
        serviceScope.launch {
            val settings = app.settingsRepository.getSettings()
            val newStatus = !settings.masterEnabled
            app.settingsRepository.setMasterEnabled(newStatus)
            updateTileUi(newStatus)
            Log.d(TAG, "Quick Settings Tile toggled masterEnabled to $newStatus")
        }
    }

    private fun updateTileState() {
        val app = application as App
        serviceScope.launch {
            val settings = app.settingsRepository.getSettings()
            updateTileUi(settings.masterEnabled)
        }
    }

    private fun updateTileUi(isEnabled: Boolean) {
        val tile = qsTile ?: return
        tile.state = if (isEnabled) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = "Auto-Text"
        tile.subtitle = if (isEnabled) "Active" else "Paused"
        tile.updateTile()
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }
}
