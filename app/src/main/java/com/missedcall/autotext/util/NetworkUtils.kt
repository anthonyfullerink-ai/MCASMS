package com.missedcall.autotext.util

import java.net.NetworkInterface
import java.util.Collections

object NetworkUtils {

    fun getLocalIpAddress(): String? {
        try {
            val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
            for (intf in interfaces) {
                val addrs = Collections.list(intf.inetAddresses)
                for (addr in addrs) {
                    if (!addr.isLoopbackAddress) {
                        val hostAddr = addr.hostAddress ?: continue
                        val isIPv4 = hostAddr.indexOf(':') < 0
                        if (isIPv4 && (hostAddr.startsWith("192.168.") || hostAddr.startsWith("10.") || hostAddr.startsWith("172."))) {
                            return hostAddr
                        }
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }
}
