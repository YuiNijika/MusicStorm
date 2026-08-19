const STORAGE_KEY = "musicstorm-player-preferences"
const PLAYER_PREFS_EVENT = "musicstorm:player-preferences"

type PlayerPreferences = {
    volume: number
    isMuted: boolean
    autoPlayOnStartup: boolean
    showLyricTranslation: boolean
}

const DEFAULT_PLAYER_PREFERENCES: PlayerPreferences = {
    volume: 0.8,
    isMuted: false,
    autoPlayOnStartup: false,
    showLyricTranslation: true,
}

function clampVolume(value: number): number {
    return Math.min(1, Math.max(0, value))
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
    window.dispatchEvent(new Event(PLAYER_PREFS_EVENT))
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
    PLAYER_PREFS_EVENT,
    getPlayerPreferences,
    setPlayerPreferences,
    setShowLyricTranslation,
    setStartupAutoPlay,
}
export type { PlayerPreferences }