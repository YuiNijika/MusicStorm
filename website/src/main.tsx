import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "./App"
import "./styles/global.css"

try {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (err) {
  // 首帧渲染失败：移除启动动画避免白屏盖死，并上报
  console.error("[website] 首帧渲染失败，已移除启动动画", err)
  document.getElementById("boot-loading")?.remove()
}
