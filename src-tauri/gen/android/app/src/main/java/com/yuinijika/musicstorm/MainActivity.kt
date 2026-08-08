package com.yuinijika.musicstorm

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
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
    super.onWebViewCreate(webView)
  }
}
