import { invoke } from "@tauri-apps/api/core"

import { downloadViaBridge } from "@/lib/android/native-bridge"
import { resolvePlayableUrl } from "@/lib/music/resolve-url"
import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { setLyricOverride } from "@/lib/lyric/overrides"
import { isAndroid } from "@/lib/platform"
import { notifyInfo, notifySuccess } from "@/lib/notify"
import type { Track } from "@/lib/types"

function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

async function removeTracksFromPlaylist(
    playlistId: string,
    trackIds: string[],
): Promise<void> {
    const ids = trackIds.filter((id) => /^\d+$/.test(id))
    if (!ids.length) {
        throw new Error("无效歌曲 id")
    }
    const data = await neteaseRequest<{ code?: number; message?: string }>({
        path: NETEASE_PATHS.playlistTracks,
        method: "POST",
        params: {
            op: "del",
            pid: playlistId,
            tracks: ids.join(","),
            timestamp: Date.now(),
        },
        skipCache: true,
    })
    if (data.code != null && data.code !== 200) {
        throw new Error(data.message || `移出失败 code=${data.code}`)
    }
}

async function addTrackToPlaylist(
    playlistId: string,
    trackIds: string[],
): Promise<void> {
    const ids = trackIds.filter((id) => /^\d+$/.test(id))
    if (!ids.length) {
        throw new Error("无效歌曲 id")
    }
    const data = await neteaseRequest<{ code?: number; message?: string }>({
        path: NETEASE_PATHS.playlistTracks,
        method: "POST",
        params: {
            op: "add",
            pid: playlistId,
            tracks: ids.join(","),
            timestamp: Date.now(),
        },
        skipCache: true,
    })
    if (data.code != null && data.code !== 200) {
        throw new Error(data.message || `添加失败 code=${data.code}`)
    }
}

function guessExtFromUrl(url: string): string {
    try {
        const path = new URL(url).pathname
        const match = /\.([a-z0-9]{2,5})$/i.exec(path)
        if (match) {
            return match[1].toLowerCase()
        }
    } catch {
        // URL 非法时回落默认扩展名
    }
    return "mp3"
}

async function downloadNeteaseTrack(track: Track): Promise<void> {
    if (track.source !== "netease" || !/^\d+$/.test(track.id)) {
        throw new Error("仅支持网易云歌曲下载")
    }
    if (!isTauriRuntime()) {
        throw new Error("请在桌面应用中下载")
    }

    const resolved = await resolvePlayableUrl(track)
    if (!resolved.ok) {
        throw new Error(resolved.reason)
    }

    const ext = guessExtFromUrl(resolved.url)
    const base = `${track.artist || "未知"} - ${track.title || track.id}`.slice(0, 80)
    if (isAndroid()) {
        // Android 无桌面另存对话框，交给系统 DownloadManager
        if (!downloadViaBridge(resolved.url, `${base}.${ext}`)) {
            throw new Error("下载不可用")
        }
        notifyInfo("已开始下载", { description: "可在系统通知栏查看进度" })
        return
    }
    const saved = await invoke<string | null>("save_url_to_file", {
        url: resolved.url,
        defaultName: `${base}.${ext}`,
    })
    if (!saved) {
        notifyInfo("已取消下载")
        return
    }
    notifySuccess("下载完成", { description: track.title })
}

async function overrideTrackLyric(track: Track): Promise<void> {
    if (!isTauriRuntime()) {
        throw new Error("请在桌面应用中选择歌词文件")
    }
    const text = await invoke<string | null>("pick_text_file")
    if (text == null) {
        notifyInfo("已取消")
        return
    }
    if (!text.trim()) {
        throw new Error("歌词文件为空")
    }
    setLyricOverride(track.id, text)
    notifySuccess("已覆盖歌词", { description: track.title })
}

export {
    addTrackToPlaylist,
    downloadNeteaseTrack,
    overrideTrackLyric,
    removeTracksFromPlaylist,
}