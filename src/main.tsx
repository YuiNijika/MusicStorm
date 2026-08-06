import React from "react"
import ReactDOM from "react-dom/client"

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
        document.getElementById("boot-loading")?.remove()
        const root = document.getElementById("root")
        if (root) {
            root.innerHTML =
                '<div style="padding:24px;font:14px/1.5 system-ui;color:#c00">应用加载失败，请查看控制台。</div>'
        }
    }
}

void mountApp()
