package com.missedcall.autotext.ui.screens

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun InAppPaymentDialog(
    url: String,
    title: String = "Secure In-App Checkout",
    onDismiss: () -> Unit,
    onPaymentSuccess: () -> Unit
) {
    var isLoading by remember { mutableStateOf(true) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var pageTitle by remember { mutableStateOf(title) }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = false
        )
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 28.dp, bottom = 10.dp, start = 8.dp, end = 8.dp),
            shape = RoundedCornerShape(16.dp),
            color = Color(0xFF0F172A),
            tonalElevation = 8.dp
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Top Header Bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF1E293B))
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Lock,
                            contentDescription = null,
                            tint = Color(0xFF00E676),
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(
                                text = pageTitle,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                maxLines = 1
                            )
                            Text(
                                text = "🔒 256-Bit SSL Encrypted • Direct Stripe Bridge",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFF94A3B8),
                                fontSize = 10.sp
                            )
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(
                            onClick = { webViewRef?.reload() },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = "Reload",
                                tint = Color(0xFF94A3B8),
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(4.dp))
                        IconButton(
                            onClick = onDismiss,
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Close",
                                tint = Color.White,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }
                }

                if (isLoading) {
                    LinearProgressIndicator(
                        modifier = Modifier.fillMaxWidth(),
                        color = Color(0xFF00E676),
                        trackColor = Color(0xFF334155)
                    )
                }

                // WebView Container
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f)
                        .background(Color(0xFF090D16))
                ) {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { ctx ->
                            WebView(ctx).apply {
                                webViewRef = this
                                layoutParams = ViewGroup.LayoutParams(
                                    ViewGroup.LayoutParams.MATCH_PARENT,
                                    ViewGroup.LayoutParams.MATCH_PARENT
                                )
                                settings.apply {
                                    javaScriptEnabled = true
                                    domStorageEnabled = true
                                    databaseEnabled = true
                                    loadWithOverviewMode = true
                                    useWideViewPort = true
                                    allowFileAccess = false
                                    allowContentAccess = false
                                    setSupportZoom(true)
                                    builtInZoomControls = false
                                    userAgentString = "${settings.userAgentString} MCASMS-Android-InApp/1.7.8"
                                }
                                webChromeClient = object : WebChromeClient() {
                                    override fun onReceivedTitle(view: WebView?, t: String?) {
                                        if (!t.isNullOrBlank() && !t.contains("http", ignoreCase = true)) {
                                            pageTitle = t
                                        }
                                    }
                                }
                                webViewClient = object : WebViewClient() {
                                    override fun onPageStarted(view: WebView?, pageUrl: String?, favicon: Bitmap?) {
                                        isLoading = true
                                        // Also check starting URL for fast intercept
                                        if (isSuccessUrl(pageUrl)) {
                                            onPaymentSuccess()
                                            onDismiss()
                                            return
                                        }
                                        super.onPageStarted(view, pageUrl, favicon)
                                    }

                                    override fun onPageFinished(view: WebView?, pageUrl: String?) {
                                        isLoading = false
                                        if (isSuccessUrl(pageUrl)) {
                                            onPaymentSuccess()
                                            onDismiss()
                                            return
                                        }
                                        super.onPageFinished(view, pageUrl)
                                    }

                                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                                        val reqUrl = request?.url?.toString() ?: ""
                                        
                                        if (isSuccessUrl(reqUrl)) {
                                            onPaymentSuccess()
                                            onDismiss()
                                            return true
                                        }

                                        if (reqUrl.contains("#pricing") || reqUrl.contains("cancel_url")) {
                                            onDismiss()
                                            return true
                                        }

                                        return false
                                    }

                                    private fun isSuccessUrl(u: String?): Boolean {
                                        if (u.isNullOrBlank()) return false
                                        return u.contains("success.html") ||
                                                u.contains("session_id=") ||
                                                u.contains("/success") ||
                                                u.contains("checkout_status=success")
                                    }
                                }
                                loadUrl(url)
                            }
                        }
                    )
                }
            }
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            webViewRef?.stopLoading()
            webViewRef?.destroy()
            webViewRef = null
        }
    }
}
