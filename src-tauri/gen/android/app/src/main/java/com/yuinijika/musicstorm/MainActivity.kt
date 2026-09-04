package com.yuinijika.musicstorm

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import org.json.JSONObject

class MainActivity : TauriActivity() {
  // launcher 属性初始化注册（早于 STARTED），webView 创建后再 attach
  private val bridge = MusicStormBridge(this)

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    // 已运行的实例收到 musicstorm:// 深链：转发给前端直达播放
    forwardDeepLink(intent?.data)
  }

  override fun onDestroy() {
    bridge.destroy()
    super.onDestroy()
  }

  // WryActivity.setWebView 末尾调用；父类的 back callback 此时已注册，
  // 这里再注册一个 → dispatcher 按 LIFO 优先走这里，
  // 把返回手势转发给前端决策（返回上一级/退出），而不是直接 finish 退出
  override fun onWebViewCreate(webView: WebView) {
    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          webView.post {
            webView.evaluateJavascript(
              "window.dispatchEvent(new CustomEvent('android:back'))",
              null
            )
          }
        }
      }
    )
    // launcher 注册须早于 STARTED（属性初始化时已完成），webView 引用只在此回调可得
    bridge.attach(webView)
    webView.addJavascriptInterface(bridge, "musicStormNative")
    // 冷启动即带 musicstorm:// 深链（从浏览器直接拉起）：等页面就绪后转发
    forwardDeepLink(intent?.data)
    super.onWebViewCreate(webView)
  }

  // 把 musicstorm:// 深链 payload 转发给前端（自定义事件 musicstorm:deep-link）
  private fun forwardDeepLink(uri: Uri?) {
    if (uri == null || uri.scheme != "musicstorm") {
      return
    }
    val payload = runCatching {
      JSONObject().put("url", uri.toString()).toString()
    }.getOrNull() ?: return
    bridge.postDeepLink(payload)
  }
}
