import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// 官网独立端口：主应用（Tauri）固定 1420，避免 dev 时互相占用
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    // 沙箱 safe-delete 会拦截 emptyOutDir 的批量删除导致构建卡死（主应用同坑）
    emptyOutDir: false,
  },
})
