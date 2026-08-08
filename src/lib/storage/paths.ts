import { invoke } from "@tauri-apps/api/core"

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

// 与 G2M 一致：后端用 Tauri PathResolver.executable_dir() 得到 exe 目录，再拼 resources/config + cache
type StoragePaths = {
    /** exe 运行目录 */
    appDir: string
    /** <exe>/resources/config */
    configDir: string
    /** <exe>/cache */
    cacheDir: string
    /** <exe>/resources/config/musicstorm.db */
    databasePath: string
}

async function getStoragePaths(): Promise<StoragePaths | null> {
    if (!isTauriRuntime()) {
        return null
    }
    try {
        return await invoke<StoragePaths>("get_storage_paths")
    } catch {
        return null
    }
}

export { getStoragePaths, isTauriRuntime }
export type { StoragePaths }