import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// 官网独立端口：主应用（Tauri）固定 1420，避免 dev 时互相占用
// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 项目站部署在 /MusicStorm/ 子路径下，CI 传 WEBSITE_BASE；
  // 本地 dev / 自定义域名 / 用户页（username.github.io）保持 "/"
  base: process.env.WEBSITE_BASE ?? "/",
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
