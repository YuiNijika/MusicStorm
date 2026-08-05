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
            // 先显示主窗口，再关闭 splash，避免闪烁
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
function scheduleSplashHandoff(timeoutMs = 5_000): () => void {
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

    // 双 rAF 等首帧绘制后再 handoff，确保主窗口内容已渲染
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