import path from "node:path"
import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const frontendRoot = path.dirname(fileURLToPath(import.meta.url))
const sourceRoot = path.join(frontendRoot, "src")
const buildVersion = process.env.VITE_APP_VERSION ?? ""

export default defineConfig({
    root: frontendRoot,
    plugins: [react(), tailwindcss()],
    define: {
        __APP_BUILD_VERSION__: JSON.stringify(buildVersion),
    },
    resolve: {
        alias: {
            "@": sourceRoot,
            "@tauri-apps/api/core": path.join(sourceRoot, "lib/tauri/core.ts"),
            "@tauri-apps/api/event": path.join(sourceRoot, "lib/tauri/event.ts"),
            "@tauri-apps/api/window": path.join(sourceRoot, "lib/tauri/window.ts"),
            "@tauri-apps/api/app": path.join(sourceRoot, "lib/tauri/app.ts"),
            "@tauri-apps/plugin-opener": path.join(sourceRoot, "lib/tauri/opener.ts"),
        },
    },
    server: {
        host: "127.0.0.1",
        port: 5173,
        strictPort: true,
    },
    build: {
        outDir: path.join(frontendRoot, "dist"),
        emptyOutDir: true,
        chunkSizeWarningLimit: 800,
        rollupOptions: {
            input: {
                main: path.join(frontendRoot, "index.html"),
                "desktop-lyric": path.join(frontendRoot, "desktop-lyric.html"),
                "mini-player": path.join(frontendRoot, "mini-player.html"),
                player: path.join(frontendRoot, "player.html"),
            },
        },
    },
})
