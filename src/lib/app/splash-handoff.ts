/** 主窗就绪后显示 main 并关闭 splash，仅 Tauri */

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

async function completeSplashHandoff(): Promise<void> {
    if (!isTauriRuntime()) {
        return
    }

    try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window")
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow")

        const main = getCurrentWindow()
        if (main.label === "main") {
            await main.show()
            await main.setFocus()
        }

        const splash = await WebviewWindow.getByLabel("splashscreen")
        if (splash) {
            await splash.close()
        }
    } catch {
        // 非桌面 / 权限缺失时忽略
    }
}

/** 挂载后 handoff；超时兜底防卡 splash */
function scheduleSplashHandoff(timeoutMs = 8_000): () => void {
    if (!isTauriRuntime()) {
        return () => {}
    }

    let done = false
    const run = () => {
        if (done) {
            return
        }
        done = true
        void completeSplashHandoff()
    }

    // 双 rAF：等首帧绘制
    requestAnimationFrame(() => {
        requestAnimationFrame(run)
    })

    const timer = window.setTimeout(run, timeoutMs)
    return () => {
        done = true
        window.clearTimeout(timer)
    }
}

export { completeSplashHandoff, scheduleSplashHandoff }