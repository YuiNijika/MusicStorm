import { parseBlob } from "music-metadata"

import type { Track } from "@/lib/types"

/**
 * 网页版本地音乐导入。
 *
 * 桌面版走 Rust 扫描（路径 + 落盘缓存）；网页版没有文件系统访问，
 * 用浏览器 File API 选目录/文件，music-metadata 在内存解析标签，
 * 音频与封面以 blob URL 播放；持久化由 web-library（IndexedDB）负责，
 * 刷新后从库中恢复并重建 URL。
 */

export type WebLocalTrack = Track & {
    /** 原始 File 引用，保留以便删除时 revoke blob URL */
    file: File
}

const AUDIO_EXT = /\.(mp3|flac|wav|m4a|aac|ogg|opus|wma|ape|dsf|dff)$/i

/** 文件对话框：选择整个目录（webkitdirectory，Chromium 系浏览器可用） */
function pickDirectory(): Promise<File[]> {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input")
        input.type = "file"
        input.setAttribute("webkitdirectory", "")
        input.setAttribute("directory", "")
        input.multiple = true
        input.onchange = () => {
            const files = input.files ? Array.from(input.files) : []
            resolve(files)
        }
        input.oncancel = () => resolve([])
        input.onerror = () => reject(new Error("文件选择失败"))
        input.click()
    })
}

/** 文件对话框：多选音频文件 */
function pickFiles(): Promise<File[]> {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input")
        input.type = "file"
        input.multiple = true
        input.accept = "audio/*"
        input.onchange = () => {
            const files = input.files ? Array.from(input.files) : []
            resolve(files)
        }
        input.oncancel = () => resolve([])
        input.onerror = () => reject(new Error("文件选择失败"))
        input.click()
    })
}

function isAudioFile(file: File): boolean {
    return (
        file.type.startsWith("audio/") ||
        file.name.startsWith(".") === false && AUDIO_EXT.test(file.name)
    )
}

function fileNameWithoutExt(name: string): string {
    return name.replace(/\.[^.]+$/, "")
}

function pictureToDataUrl(picture: { data: Uint8Array; format: string }): string {
    const bytes = new Uint8Array(picture.data)
    let binary = ""
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return `data:${picture.format};base64,${btoa(binary)}`
}

async function parseWebTrack(file: File, index: number): Promise<WebLocalTrack> {
    const fallbackName = fileNameWithoutExt(file.name)
    try {
        const meta = await parseBlob(file, { duration: true })
        const common = meta.common
        const durationMs = meta.format.duration
            ? Math.round(meta.format.duration * 1000)
            : 0
        const picture = common.picture?.[0]

        return {
            id: `web-local-${Date.now()}-${index}`,
            title: common.title?.trim() || fallbackName,
            artist: common.artist?.trim() || "未知艺人",
            album: common.album?.trim() || "",
            coverUrl: picture ? pictureToDataUrl(picture) : "",
            durationMs,
            source: "local",
            filePath: URL.createObjectURL(file),
            fileName: fallbackName,
            file,
        }
    } catch {
        // 标签解析失败不阻塞导入：按文件名兜底，仍可播放
        return {
            id: `web-local-${Date.now()}-${index}`,
            title: fallbackName,
            artist: "未知艺人",
            album: "",
            coverUrl: "",
            durationMs: 0,
            source: "local",
            filePath: URL.createObjectURL(file),
            fileName: fallbackName,
            file,
        }
    }
}

async function webImportFiles(files: File[]): Promise<WebLocalTrack[]> {
    const audioFiles = files.filter(isAudioFile)
    const tracks: WebLocalTrack[] = []
    for (let i = 0; i < audioFiles.length; i += 1) {
        tracks.push(await parseWebTrack(audioFiles[i], i))
    }
    return tracks
}

async function webImportDirectory(): Promise<WebLocalTrack[]> {
    const files = await pickDirectory()
    return webImportFiles(files)
}

async function webImportAudioFiles(): Promise<WebLocalTrack[]> {
    const files = await pickFiles()
    return webImportFiles(files)
}

function revokeWebTrack(track: WebLocalTrack): void {
    if (track.filePath?.startsWith("blob:")) {
        URL.revokeObjectURL(track.filePath)
    }
}

export {
    revokeWebTrack,
    webImportAudioFiles,
    webImportDirectory,
}
