import React from "react"
import ReactDOM from "react-dom/client"

import {
    completeSplashHandoff,
    scheduleSplashHandoff,
} from "@/lib/app/splash-handoff"

// 先挂 handoff：即使后续 App 依赖链失败，超时仍能关 splash
const cancelSplashHandoff = scheduleSplashHandoff()

async function mountApp(): Promise<void> {
    try {
        const { default: App } = await import("./App")
        ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
            <React.StrictMode>
                <App />
            </React.StrictMode>,
        )
    } catch (error) {
        console.error("[boot] App 加载失败", error)
        cancelSplashHandoff()
        // 仍尝试露出主窗，避免永久停在 splash
        void completeSplashHandoff()
        const root = document.getElementById("root")
        if (root) {
            root.innerHTML =
                '<div style="padding:24px;font:14px/1.5 system-ui;color:#c00">应用加载失败，请查看控制台。Splash 已关闭。</div>'
        }
    }
}

void mountApp()