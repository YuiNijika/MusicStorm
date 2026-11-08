import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import {
    fetchReleaseAssets,
    type GithubReleaseAsset,
} from "@/lib/app/github-update"
import { downloadSourceCandidates } from "@/lib/app/update-source-prefs"
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
 * 流程：缓存已有匹配安装包（大小 + sha256 校验）则直接拉起，否则按下载源
 * 候选逐个下载（首选失败自动切兜底源，如直连 GitHub 失败 → 镜像）。
 */
async function downloadAndInstall(tag: string): Promise<void> {
    const assets = await fetchReleaseAssets(tag)
    const asset = findWindowsSetupAsset(assets)
    // 本地已下载过且完整（大小/哈希一致）→ 不再重复下载，直接进入安装
    const existing = await invoke<string | null>("find_local_setup", {
        expectedSize: asset.size > 0 ? asset.size : null,
        expectedSha256: asset.sha256 ?? null,
    })
    if (existing) {
        await invoke("install_update", { path: existing })
        return
    }
    const urls = downloadSourceCandidates(asset.url)
    let path: string | null = null
    let lastError: Error | null = null
    for (const url of urls) {
        try {
            path = await invoke<string>("download_update", {
                url,
                sha256: asset.sha256 ?? null,
            })
            break
        } catch (error) {
            lastError =
                error instanceof Error ? error : new Error("下载安装包失败")
        }
    }
    if (!path) {
        throw lastError ?? new Error("下载安装包失败")
    }
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
