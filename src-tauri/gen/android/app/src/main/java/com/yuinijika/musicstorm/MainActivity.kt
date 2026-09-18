package com.yuinijika.musicstorm

import android.content.ComponentCallbacks2
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import org.json.JSONObject

class MainActivity : TauriActivity() {
  // launcher 属性初始化注册（早于 STARTED），webView 创建后再 attach
  private val bridge = MusicStormBridge(this)
  // onWebViewCreate 后持有，供 onPause 决定是否保持 JS 活跃
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    // 已运行的实例收到 musicstorm:// 深链：转发给前端直达播放
    forwardDeepLink(intent.data)
  }

  // 父类 WryActivity 在 onPause 里同步调用 mWebView.onPause 暂停 JS；
  // 播放中若照做，锁屏/后台媒体小组件的切歌命令会被 WebView 冻结而无法驱动前端，
  // 故播放期间保持 WebView JS 可调度，仅无播放时由系统正常暂停
  override fun onPause() {
    super.onPause()
    val wv = webView
    if (wv != null && bridge.isMediaPlaying()) {
      wv.post { wv.onResume() }
    }
  }

  // 界面隐藏或系统内存吃紧时回收 WebView 的内存级资源缓存。
  // 长期驻留的渲染进程是应用内存大头；clearCache(false) 只清内存缓存不动磁盘，封面不会重复下载。
  // 低内存档位在 API 34 起不再下发，统一从 UI_HIDDEN 起算，旧档位数值更大同样命中
  override fun onTrimMemory(level: Int) {
    super.onTrimMemory(level)
    val wv = webView ?: return
    if (level >= ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN) {
      wv.clearCache(false)
    }
  }

  override fun onDestroy() {
    bridge.destroy()
    super.onDestroy()
  }

  // WryActivity.setWebView 末尾调用；父类的 back callback 此时已注册，
  // 这里再注册一个 → dispatcher 按 LIFO 优先走这里，
  // 把返回手势转发给前端决策（返回上一级/退出），而不是直接 finish 退出
  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
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
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // 渲染进程标记为重要且不可见时也不降级：后台/锁屏仍调度 JS，
      // 否则媒体小组件的 transport 命令经 evaluateJavascript 注入后无人执行
      webView.setRendererPriorityPolicy(
        WebView.RENDERER_PRIORITY_IMPORTANT,
        false,
      )
    }
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
