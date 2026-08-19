import React from "react"
import ReactDOM from "react-dom/client"

import { isAndroid } from "@/lib/platform"

// 挂平台标记供 CSS 定向降级
if (isAndroid()) {
    document.documentElement.dataset.platform = "android"
}

function consoleLog(): void {
    console.log(`
                                                                                                    
/$$      /$$                     /$$            /$$$$$$   /$$                                      
| $$$    /$$$                    |__/           /$$__  $$ | $$                                      
| $$$$  /$$$$ /$$   /$$  /$$$$$$$ /$$  /$$$$$$$| $$  \__//$$$$$$    /$$$$$$   /$$$$$$  /$$$$$$/$$$$ 
| $$ $$/$$ $$| $$  | $$ /$$_____/| $$ /$$_____/|  $$$$$$|_  $$_/   /$$__  $$ /$$__  $$| $$_  $$_  $$
| $$  $$$| $$| $$  | $$|  $$$$$$ | $$| $$       \____  $$ | $$    | $$  \ $$| $$  \__/| $$ \ $$ \ $$
| $$\  $ | $$| $$  | $$ \____  $$| $$| $$       /$$  \ $$ | $$ /$$| $$  | $$| $$      | $$ | $$ | $$
| $$ \/  | $$|  $$$$$$/ /$$$$$$$/| $$|  $$$$$$$|  $$$$$$/ |  $$$$/|  $$$$$$/| $$      | $$ | $$ | $$
|__/     |__/ \______/ |_______/ |__/ \_______/ \______/   \___/   \______/ |__/      |__/ |__/ |__/
                                                                                                    
        `)
}

async function mountApp(): Promise<void> {
    try {
        const { default: App } = await import("./App")
        consoleLog()
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
