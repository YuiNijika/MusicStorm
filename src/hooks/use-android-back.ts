import { invoke } from "@tauri-apps/api/core"
import { useEffect } from "react"

const BACK_EVENT = "android:back"

// Android 返回手势处理链：全屏播放器 → 详情页 → 顶层退出。
// 事件由 MainActivity 的 OnBackPressedCallback 转发（evaluateJavascript）。
function useAndroidBack(handlers: {
    /** 返回 true 表示消费了本次返回（不退出应用） */
    onBack: () => boolean
}): void {
    useEffect(() => {
        function handleBack() {
            const consumed = handlers.onBack()
            if (!consumed) {
                void invoke("exit_app")
            }
        }
        window.addEventListener(BACK_EVENT, handleBack)
        return () => window.removeEventListener(BACK_EVENT, handleBack)
    }, [handlers])
}

export { useAndroidBack }
