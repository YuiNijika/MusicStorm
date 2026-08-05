import { invoke } from "@tauri-apps/api/core"

import { isTauriRuntime } from "@/lib/player/native-bridge"

type FfmpegStatus = {
    available: boolean
    path: string | null
    version: string | null
    source: "configured" | "environment" | "manual" | "missing"
    error: string | null
}

const browserStatus: FfmpegStatus = {
    available: false,
    path: null,
    version: null,
    source: "missing",
    error: "桌面端支持 FFmpeg 检测",
}

async function detectFfmpeg(): Promise<FfmpegStatus> {
    if (!isTauriRuntime()) {
        return browserStatus
    }
    return invoke<FfmpegStatus>("ffmpeg_detect")
}

async function validateFfmpeg(path: string): Promise<FfmpegStatus> {
    if (!isTauriRuntime()) {
        return browserStatus
    }
    return invoke<FfmpegStatus>("ffmpeg_validate", { path })
}

async function setFfmpegPath(path: string | null): Promise<FfmpegStatus> {
    if (!isTauriRuntime()) {
        return browserStatus
    }
    return invoke<FfmpegStatus>("ffmpeg_set_path", { path })
}

async function pickFfmpegExecutable(): Promise<string | null> {
    if (!isTauriRuntime()) {
        return null
    }
    return invoke<string | null>("pick_ffmpeg_executable")
}

function isFfmpegRequiredError(error: unknown): boolean {
    if (typeof error === "string") {
        return error.includes("FFMPEG_REQUIRED")
    }
    if (error instanceof Error) {
        return error.message.includes("FFMPEG_REQUIRED")
    }
    return false
}

export {
    detectFfmpeg,
    isFfmpegRequiredError,
    pickFfmpegExecutable,
    setFfmpegPath,
    validateFfmpeg,
}
export type { FfmpegStatus }