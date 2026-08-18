function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

function isMacOS(): boolean {
    if (typeof navigator === "undefined") {
        return false
    }
    return /Macintosh|Mac OS X/i.test(navigator.userAgent)
}

function isNativeMacOS(): boolean {
    return isTauriRuntime() && isMacOS()
}

// Android WebView 的 UA 带 Android，区别于桌面浏览器/网页版
function isAndroid(): boolean {
    if (typeof navigator === "undefined") {
        return false
    }
    return /Android/i.test(navigator.userAgent)
}

export { isAndroid, isMacOS, isNativeMacOS, isTauriRuntime }
