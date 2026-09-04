import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path"
import tailwindcss from "@tailwindcss/vite"

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

const buildVersion =
  process.env.VITE_APP_VERSION ?? "";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    // 跳过构建前清空 dist：沙箱安全层会拦截批量删除导致 vite 挂起。
    // 构建产物带 hash，新旧文件共存无害；彻底清理用 scripts/clean-dist.py 手动执行。
    emptyOutDir: false,
    // 多页入口：主窗口 + 桌面歌词窗口（打包版缺入口会 404，桌面歌词白屏）
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        "desktop-lyric": path.resolve(__dirname, "desktop-lyric.html"),
        "mini-player": path.resolve(__dirname, "mini-player.html"),
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
