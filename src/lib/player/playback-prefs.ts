const STORAGE_KEY = "musicstorm-player-preferences"
const PLAYER_PREFS_EVENT = "musicstorm:player-preferences"

// 倍速档位，UI 循环/选单共用
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

type PlayerPreferences = {
    volume: number
    isMuted: boolean
    autoPlayOnStartup: boolean
    showLyricTranslation: boolean
    playbackRate: number
}

const DEFAULT_PLAYER_PREFERENCES: PlayerPreferences = {
    volume: 0.8,
    isMuted: false,
    autoPlayOnStartup: false,
    showLyricTranslation: true,
    playbackRate: 1,
}

function clampVolume(value: number): number {
    return Math.min(1, Math.max(0, value))
}

function clampRate(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_PLAYER_PREFERENCES.playbackRate
    }
    return Math.min(2, Math.max(0.5, value))
}

function getPlayerPreferences(): PlayerPreferences {
    if (typeof window === "undefined") {
        return { ...DEFAULT_PLAYER_PREFERENCES }
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) {
            return { ...DEFAULT_PLAYER_PREFERENCES }
        }
        const data = JSON.parse(raw) as Partial<PlayerPreferences>
        return {
            volume:
                typeof data.volume === "number" && Number.isFinite(data.volume)
                    ? clampVolume(data.volume)
                    : DEFAULT_PLAYER_PREFERENCES.volume,
            isMuted:
                typeof data.isMuted === "boolean"
                    ? data.isMuted
                    : DEFAULT_PLAYER_PREFERENCES.isMuted,
            autoPlayOnStartup: data.autoPlayOnStartup === true,
            showLyricTranslation: data.showLyricTranslation !== false,
            playbackRate:
                typeof data.playbackRate === "number"
                    ? clampRate(data.playbackRate)
                    : DEFAULT_PLAYER_PREFERENCES.playbackRate,
        }
    } catch {
        return { ...DEFAULT_PLAYER_PREFERENCES }
    }
}

function setPlayerPreferences(patch: Partial<PlayerPreferences>): PlayerPreferences {
    const current = getPlayerPreferences()
    const next: PlayerPreferences = {
        ...current,
        ...patch,
        volume:
            typeof patch.volume === "number"
                ? clampVolume(patch.volume)
                : current.volume,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    // 音量/静音随播放频繁落盘，与界面消费者无关；仅在行为类偏好变化时广播，
    // 避免调音量触发歌词等面板无意义地重新拉取
    if (
        next.showLyricTranslation !== current.showLyricTranslation ||
        next.autoPlayOnStartup !== current.autoPlayOnStartup
    ) {
        window.dispatchEvent(new Event(PLAYER_PREFS_EVENT))
    }
    return next
}

function setStartupAutoPlay(enabled: boolean): void {
    setPlayerPreferences({ autoPlayOnStartup: enabled })
}

function setShowLyricTranslation(enabled: boolean): void {
    setPlayerPreferences({ showLyricTranslation: enabled })
}

export {
    DEFAULT_PLAYER_PREFERENCES,
    PLAYBACK_RATES,
    PLAYER_PREFS_EVENT,
    getPlayerPreferences,
    setPlayerPreferences,
    setShowLyricTranslation,
    setStartupAutoPlay,
}
export type { PlayerPreferences }