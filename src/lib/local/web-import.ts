import { parseBlob } from "music-metadata"

import type { Track } from "@/lib/types"

// lib.dom 缺 File System Access API 的部分方法，补齐类型
declare global {
    interface Window {
        showDirectoryPicker(options?: {
            mode?: "read" | "readwrite"
        }): Promise<FileSystemDirectoryHandle>
    }
    interface FileSystemDirectoryHandle {
        values(): AsyncIterableIterator<FileSystemHandle>
        queryPermission(options?: {
            mode?: "read" | "readwrite"
        }): Promise<PermissionState>
        requestPermission(options?: {
            mode?: "read" | "readwrite"
        }): Promise<PermissionState>
    }
}

/**
 * 网页版本地音乐导入
 *
 * Chromium 系走 File System Access API 引用本地目录，不复制音频；
 * 其余浏览器降级 input 选择器，存 File 副本
 */

export type WebLocalTrack = Track & {
    file?: File
    /** FSA 目录句柄：存引用不复制音频，恢复时实时读本地文件 */
    directoryHandle?: FileSystemDirectoryHandle
    relativePath?: string
    /** 恢复时目录授权未授予：点击播放需先 requestPermission */
    needsAuth?: boolean
}

const AUDIO_EXT = /\.(mp3|flac|wav|m4a|aac|ogg|opus|wma|ape|dsf|dff)$/i
const MAX_SCAN_DEPTH = 6
const MAX_SCAN_FILES = 2000

// ---------- File System Access API：直接引用本地目录 ----------

function hasDirectoryPicker(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof window.showDirectoryPicker === "function"
    )
}

async function pickDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
    // mode read：只读授权，浏览器持久记住；用户可随时在站点设置里撤销
    return window.showDirectoryPicker({ mode: "read" })
}

type DirectoryEntry = {
    directoryHandle: FileSystemDirectoryHandle
    relativePath: string
    file: File
}

async function collectAudioEntries(
    root: FileSystemDirectoryHandle,
    dir: FileSystemDirectoryHandle,
    relativeDir: string,
    depth: number,
    out: DirectoryEntry[],
): Promise<void> {
    if (depth > MAX_SCAN_DEPTH || out.length >= MAX_SCAN_FILES) {
        return
    }
    for await (const entry of dir.values()) {
        if (out.length >= MAX_SCAN_FILES) {
            return
        }
        if (entry.kind === "directory") {
            await collectAudioEntries(
                root,
                entry as FileSystemDirectoryHandle,
                `${relativeDir}/${entry.name}`,
                depth + 1,
                out,
            )
        } else if (entry.kind === "file" && AUDIO_EXT.test(entry.name)) {
            try {
                const file = await (entry as FileSystemFileHandle).getFile()
                out.push({
                    directoryHandle: root,
                    relativePath: `${relativeDir}/${entry.name}`,
                    file,
                })
            } catch {
                // 个别文件读取失败不影响整体导入
            }
        }
    }
}

// input 文件选择器

function pickDirectoryInput(): Promise<File[]> {
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
        (file.name.startsWith(".") === false && AUDIO_EXT.test(file.name))
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

/** 选目录导入：无 FSA 环境降级 input 选择器 */
async function webImportDirectory(): Promise<WebLocalTrack[]> {
    if (hasDirectoryPicker()) {
        try {
            const root = await pickDirectoryHandle()
            const entries: DirectoryEntry[] = []
            await collectAudioEntries(root, root, "", 0, entries)
            const tracks: WebLocalTrack[] = []
            for (let i = 0; i < entries.length; i += 1) {
                const entry = entries[i]
                const track = await parseWebTrack(entry.file, i)
                track.directoryHandle = entry.directoryHandle
                track.relativePath = entry.relativePath
                tracks.push(track)
            }
            return tracks
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return []
            }
            // FSA 不可用/授权失败：降级 input 选择器
            console.warn("[web-local] directory picker failed, fallback input", error)
        }
    }
    const files = await pickDirectoryInput()
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
    MAX_SCAN_DEPTH,
    MAX_SCAN_FILES,
    revokeWebTrack,
    webImportAudioFiles,
    webImportDirectory,
}
