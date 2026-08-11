import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/**
 * 网页版独立构建
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // 相对路径资源：产物可部署在域名根或仓库子路径，均可用
  base: "./",
  build: {
    outDir: "dist",
    // 与主构建共存于 dist/，不互相清空
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, "player.html"),
    },
    // 网页版静态资源独立目录：/assets/player/*
    assetsDir: "assets/player",
  },
});
