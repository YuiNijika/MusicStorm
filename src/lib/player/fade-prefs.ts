/** 播放淡入淡出偏好 */

const FADE_ENABLED_KEY = "musicstorm-player-fade-enabled"
const FADE_MS_KEY = "musicstorm-player-fade-ms"

const FADE_MS_MIN = 0
const FADE_MS_MAX = 2_000
const FADE_MS_DEFAULT = 300
const FADE_MS_STEP = 50

type FadePrefs = {
    enabled: boolean
    durationMs: number
}

function clampFadeMs(value: number): number {
    if (!Number.isFinite(value)) {
        return FADE_MS_DEFAULT
    }
    const stepped = Math.round(value / FADE_MS_STEP) * FADE_MS_STEP
    return Math.min(FADE_MS_MAX, Math.max(FADE_MS_MIN, stepped))
}

function getFadePrefs(): FadePrefs {
    if (typeof window === "undefined") {
        return { enabled: true, durationMs: FADE_MS_DEFAULT }
    }
    const enabledRaw = window.localStorage.getItem(FADE_ENABLED_KEY)
    const enabled = enabledRaw === null ? true : enabledRaw === "1" || enabledRaw === "true"
    const msRaw = window.localStorage.getItem(FADE_MS_KEY)
    const durationMs = clampFadeMs(msRaw ? Number(msRaw) : FADE_MS_DEFAULT)
    return { enabled, durationMs }
}

function setFadeEnabled(enabled: boolean): void {
    window.localStorage.setItem(FADE_ENABLED_KEY, enabled ? "1" : "0")
}

function setFadeDurationMs(durationMs: number): void {
    window.localStorage.setItem(FADE_MS_KEY, String(clampFadeMs(durationMs)))
}

/** 实际 ramp 时长，关闭或 0 为瞬时 */
function resolveFadeDurationMs(prefs: FadePrefs = getFadePrefs()): number {
    if (!prefs.enabled || prefs.durationMs <= 0) {
        return 0
    }
    return prefs.durationMs
}

export {
    FADE_ENABLED_KEY,
    FADE_MS_DEFAULT,
    FADE_MS_KEY,
    FADE_MS_MAX,
    FADE_MS_MIN,
    FADE_MS_STEP,
    clampFadeMs,
    getFadePrefs,
    resolveFadeDurationMs,
    setFadeDurationMs,
    setFadeEnabled,
}
export type { FadePrefs }