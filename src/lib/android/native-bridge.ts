// 桥缺失时调用一律失败/空结果，避免非 Android 误走桌面命令报错
import { isAndroid } from "@/lib/platform"

export type SafPickPayload = {
    ok: boolean
    cancelled?: boolean
    kind?: "folder" | "files"
    path?: string
    paths?: string[]
}

export type SafProgressPayload = {
    done: number
    total: number
}

export type AudioStatePayload = {
    playing: boolean
    prepared?: boolean
    positionMs?: number
    durationMs?: number
    ended?: boolean
    error?: string
}

export type NowPlayingPayload = {
    title: string
    artist: string
    album: string
    durationMs: number
    coverUrl: string
    playing: boolean
    positionMs: number
}

export type TransportCommandPayload = {
    command: "play" | "pause" | "next" | "previous" | "seek" | "stop"
    positionMs?: number
}

type NativeBridge = {
    pickFolder?: () => void
    pickFiles?: () => void
    download?: (url: string, name: string) => void
    prepareFile?: (path: string) => void
    startPlayback?: () => void
    pausePlayback?: () => void
    seekPlayback?: (positionMs: number, resume: boolean) => void
    setPlaybackVolume?: (volume: number) => void
    setPlaybackMuted?: (muted: boolean) => void
    stopPlayback?: () => void
    updateNowPlaying?: (
        title: string,
        artist: string,
        album: string,
        durationMs: number,
        coverUrl: string,
        playing: boolean,
        positionMs: number,
    ) => void
    clearNowPlaying?: () => void
}

function bridge(): NativeBridge {
    if (typeof window === "undefined") {
        return {}
    }
    return (
        (window as unknown as { musicStormNative?: NativeBridge }).musicStormNative ??
        {}
    )
}

function hasNativeBridge(): boolean {
    return isAndroid() && typeof bridge().pickFolder === "function"
}

function pickSafFolder(): Promise<string | null> {
    return new Promise((resolve) => {
        if (!hasNativeBridge()) {
            resolve(null)
            return
        }
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<SafPickPayload>).detail
            if (!detail) {
                return
            }
            window.removeEventListener("musicstorm:saf-picked", handler)
            if (detail.ok && detail.kind === "folder" && detail.path) {
                resolve(detail.path)
            } else {
                resolve(null)
            }
        }
        window.addEventListener("musicstorm:saf-picked", handler)
        bridge().pickFolder?.()
    })
}

function pickSafFiles(): Promise<string[]> {
    return new Promise((resolve) => {
        if (!hasNativeBridge()) {
            resolve([])
            return
        }
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<SafPickPayload>).detail
            if (!detail) {
                return
            }
            window.removeEventListener("musicstorm:saf-picked", handler)
            if (detail.ok && detail.kind === "files" && detail.paths) {
                resolve(detail.paths)
            } else {
                resolve([])
            }
        }
        window.addEventListener("musicstorm:saf-picked", handler)
        bridge().pickFiles?.()
    })
}

function downloadViaBridge(url: string, name: string): boolean {
    if (!isAndroid() || typeof bridge().download !== "function") {
        return false
    }
    bridge().download?.(url, name)
    return true
}

// ---- Android 系统 MediaPlayer ----

function hasAndroidAudio(): boolean {
    return isAndroid() && typeof bridge().prepareFile === "function"
}

function prepareAndroidFile(path: string): void {
    bridge().prepareFile?.(path)
}

function startAndroidPlayback(): void {
    bridge().startPlayback?.()
}

function pauseAndroidPlayback(): void {
    bridge().pausePlayback?.()
}

function seekAndroidPlayback(positionMs: number, resume: boolean): void {
    bridge().seekPlayback?.(positionMs, resume)
}

function setAndroidPlaybackVolume(volume: number): void {
    bridge().setPlaybackVolume?.(volume)
}

function setAndroidPlaybackMuted(muted: boolean): void {
    bridge().setPlaybackMuted?.(muted)
}

function stopAndroidPlayback(): void {
    bridge().stopPlayback?.()
}

function listenAndroidAudioState(
    handler: (payload: AudioStatePayload) => void,
): () => void {
    const listener = (event: Event) => {
        const detail = (event as CustomEvent<AudioStatePayload>).detail
        if (detail) {
            handler(detail)
        }
    }
    window.addEventListener("musicstorm:audio-state", listener)
    return () => window.removeEventListener("musicstorm:audio-state", listener)
}

// ---- 系统媒体通知（MediaStyle + MediaSession）----

function updateAndroidNowPlaying(payload: NowPlayingPayload): void {
    bridge().updateNowPlaying?.(
        payload.title,
        payload.artist,
        payload.album,
        payload.durationMs,
        payload.coverUrl,
        payload.playing,
        payload.positionMs,
    )
}

function clearAndroidNowPlaying(): void {
    bridge().clearNowPlaying?.()
}

function listenAndroidTransport(
    handler: (payload: TransportCommandPayload) => void,
): () => void {
    const listener = (event: Event) => {
        const detail = (event as CustomEvent<TransportCommandPayload>).detail
        if (detail && typeof detail.command === "string") {
            handler(detail)
        }
    }
    window.addEventListener("musicstorm:transport-command", listener)
    return () => window.removeEventListener("musicstorm:transport-command", listener)
}

export {
    clearAndroidNowPlaying,
    downloadViaBridge,
    hasAndroidAudio,
    hasNativeBridge,
    listenAndroidAudioState,
    listenAndroidTransport,
    pauseAndroidPlayback,
    pickSafFiles,
    pickSafFolder,
    prepareAndroidFile,
    seekAndroidPlayback,
    setAndroidPlaybackMuted,
    setAndroidPlaybackVolume,
    startAndroidPlayback,
    stopAndroidPlayback,
    updateAndroidNowPlaying,
}
export type { NativeBridge }