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

export { isMacOS, isNativeMacOS, isTauriRuntime }
