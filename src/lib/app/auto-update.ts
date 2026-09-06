import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import {
    fetchReleaseAssets,
    type GithubReleaseAsset,
} from "@/lib/app/github-update"
import { resolveUpdateUrl } from "@/lib/app/update-source-prefs"
import { isAndroid, isMacOS, isTauriRuntime } from "@/lib/platform"

const PROGRESS_EVENT = "musicstorm:update-progress"

// 仅 Windows 桌面支持应用内自动更新：
// macOS 无正式发布包，Android 走系统下载器，网页版无本地版本可更新
function isUpdaterSupported(): boolean {
    return isTauriRuntime() && !isAndroid() && !isMacOS()
}

// NSIS 安装包命名：MusicStorm_<版本>_x64-setup.exe
function findWindowsSetupAsset(
    assets: GithubReleaseAsset[],
): GithubReleaseAsset {
    const found = assets.find((asset) => asset.name.endsWith("-setup.exe"))
    if (!found) {
        throw new Error("当前平台没有可用安装包")
    }
    return found
}

type UpdateDownloadState = {
    phase: "idle" | "downloading" | "installing" | "error"
    downloaded: number
    total: number
    error?: string
}

const IDLE_STATE: UpdateDownloadState = {
    phase: "idle",
    downloaded: 0,
    total: 0,
}

/**
 * 下载并静默安装最新版。
 * 安装启动后应用进程退出、由 NSIS 接管，invoke 一般不会正常返回。
 */
async function downloadAndInstall(tag: string): Promise<void> {
    const assets = await fetchReleaseAssets(tag)
    const asset = findWindowsSetupAsset(assets)
    const url = resolveUpdateUrl(asset.url)
    const path = await invoke<string>("download_update", {
        url,
        sha256: asset.sha256 ?? null,
    })
    await invoke("install_update", { path })
}

/** 订阅下载进度事件（Rust emit），返回卸载函数 */
function subscribeUpdateProgress(
    listener: (state: { downloaded: number; total: number }) => void,
): Promise<() => void> {
    return listen<{ downloaded: number; total: number }>(
        PROGRESS_EVENT,
        (event) => {
            const payload = event.payload
            if (typeof payload?.downloaded === "number") {
                listener({
                    downloaded: payload.downloaded,
                    total: payload.total ?? 0,
                })
            }
        },
    )
}

export {
    IDLE_STATE,
    downloadAndInstall,
    findWindowsSetupAsset,
    isUpdaterSupported,
    subscribeUpdateProgress,
}
export type { UpdateDownloadState }
