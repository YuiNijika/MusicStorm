import React from "react"
import ReactDOM from "react-dom/client"

import { FatalErrorScreen } from "@/components/app/fatal-error-screen"
import { isAndroid } from "@/lib/platform"

// 挂平台标记供 CSS 定向降级
if (isAndroid()) {
    document.documentElement.dataset.platform = "android"
}

function consoleLog(): void {
    console.log(`
                                                                                                    
/$$      /$$                     /$$            /$$$$$$   /$$                                      
| $$$    /$$$                    |__/           /$$__  $$ | $$                                      
| $$$$  /$$$$ /$$   /$$  /$$$$$$$ /$$  /$$$$$$$| $$  \__//$$$$$$    /$$$$$$   /$$$$$$/$$$$ 
| $$ $$/$$ $$| $$  | $$ /$$_____/| $$ /$$_____/|  $$$$$$|_  $$_/   /$$__  $$ /$$__  $$| $$_  $$_  $$
| $$  $$$| $$| $$  | $$|  $$$$$$ | $$| $$       \____  $$ | $$ /$$| $$  | $$| $$      | $$ | $$ | $$
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
                <FatalErrorScreen variant="boundary">
                    <App />
                </FatalErrorScreen>
            </React.StrictMode>,
        )
    } catch (error) {
        // 兜底：App 代码包加载失败（chunk 404/网络中断等），React 还没接管
        console.error("[boot] App 加载失败", error)
        document.getElementById("boot-loading")?.remove()
        const root = document.getElementById("root")
        if (root) {
            ReactDOM.createRoot(root).render(<FatalErrorScreen error={error} />)
        }
    }
}

void mountApp()
