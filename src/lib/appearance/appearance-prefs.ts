import { accentSwatch } from "@/lib/appearance/color-capability"

const STORAGE_KEY = "musicstorm-appearance"

type AccentTone =
    | "neutral"
    | "rose"
    | "blue"
    | "green"
    | "violet"
    | "orange"
    | "amber"
    | "cyan"
    | "teal"
    | "pink"
    | "indigo"
    | "custom"

type TintScope = "accent" | "global"

type AppearancePrefs = {
    accent: AccentTone
    tintScope: TintScope
    customHue: number
    glassOpacity: number
    glassBlur: number
    materialGlass: boolean
    backgroundUrl: string
    backgroundOpacity: number
    backgroundBlur: number
    bingWallpaper: boolean
}

type AccentOption = {
    id: Exclude<AccentTone, "custom">
    label: string
    hue: number
}

const ACCENT_OPTIONS: AccentOption[] = [
    { id: "neutral", label: "中性", hue: 250 },
    { id: "rose", label: "玫瑰", hue: 350 },
    { id: "pink", label: "粉彩", hue: 340 },
    { id: "orange", label: "橙橘", hue: 28 },
    { id: "amber", label: "琥珀", hue: 42 },
    { id: "green", label: "翠绿", hue: 145 },
    { id: "teal", label: "青绿", hue: 176 },
    { id: "cyan", label: "青蓝", hue: 194 },
    { id: "blue", label: "蓝色", hue: 216 },
    { id: "indigo", label: "靛蓝", hue: 236 },
    { id: "violet", label: "紫罗兰", hue: 272 },
]

const PRESET_IDS = new Set(ACCENT_OPTIONS.map((item) => item.id))
const DEFAULT_CUSTOM_HUE = 216

const DEFAULT_APPEARANCE: AppearancePrefs = {
    accent: "neutral",
    tintScope: "accent",
    customHue: DEFAULT_CUSTOM_HUE,
    glassOpacity: 0.58,
    glassBlur: 28,
    materialGlass: true,
    backgroundUrl: "",
    backgroundOpacity: 0.5,
    backgroundBlur: 0,
    bingWallpaper: false,
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function normalizeHue(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_CUSTOM_HUE
    }
    return ((Math.round(value) % 360) + 360) % 360
}

function isAccent(value: unknown): value is AccentTone {
    return (
        value === "custom" ||
        (typeof value === "string" &&
            PRESET_IDS.has(value as AccentOption["id"]))
    )
}

function readAppearancePrefs(): AppearancePrefs {
    if (typeof window === "undefined") {
        return DEFAULT_APPEARANCE
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) {
            return DEFAULT_APPEARANCE
        }
        const data = JSON.parse(raw) as Partial<AppearancePrefs>
        return {
            accent: isAccent(data.accent)
                ? data.accent
                : DEFAULT_APPEARANCE.accent,
            tintScope:
                data.tintScope === "global"
                    ? "global"
                    : DEFAULT_APPEARANCE.tintScope,
            customHue:
                typeof data.customHue === "number"
                    ? normalizeHue(data.customHue)
                    : DEFAULT_APPEARANCE.customHue,
            glassOpacity:
                typeof data.glassOpacity === "number"
                    ? clamp(data.glassOpacity, 0.35, 0.9)
                    : DEFAULT_APPEARANCE.glassOpacity,
            glassBlur:
                typeof data.glassBlur === "number"
                    ? clamp(data.glassBlur, 8, 48)
                    : DEFAULT_APPEARANCE.glassBlur,
            materialGlass:
                typeof data.materialGlass === "boolean"
                    ? data.materialGlass
                    : DEFAULT_APPEARANCE.materialGlass,
            backgroundUrl:
                typeof data.backgroundUrl === "string"
                    ? data.backgroundUrl
                    : DEFAULT_APPEARANCE.backgroundUrl,
            backgroundOpacity:
                typeof data.backgroundOpacity === "number"
                    ? clamp(data.backgroundOpacity, 0, 1)
                    : DEFAULT_APPEARANCE.backgroundOpacity,
            backgroundBlur:
                typeof data.backgroundBlur === "number"
                    ? clamp(data.backgroundBlur, 0, 40)
                    : DEFAULT_APPEARANCE.backgroundBlur,
            bingWallpaper:
                typeof data.bingWallpaper === "boolean"
                    ? data.bingWallpaper
                    : DEFAULT_APPEARANCE.bingWallpaper,
        }
    } catch {
        return DEFAULT_APPEARANCE
    }
}

function writeAppearancePrefs(prefs: AppearancePrefs): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch {
        // Keep the current session usable when storage is unavailable
    }
}

function resolveAccentHue(prefs: AppearancePrefs): number {
    if (prefs.accent === "custom") {
        return normalizeHue(prefs.customHue)
    }
    return (
        ACCENT_OPTIONS.find((item) => item.id === prefs.accent)?.hue ??
        DEFAULT_CUSTOM_HUE
    )
}

function isNeutralAccent(prefs: AppearancePrefs): boolean {
    return prefs.accent === "neutral"
}

export {
    ACCENT_OPTIONS,
    DEFAULT_APPEARANCE,
    DEFAULT_CUSTOM_HUE,
    accentSwatch,
    isNeutralAccent,
    normalizeHue,
    readAppearancePrefs,
    resolveAccentHue,
    writeAppearancePrefs,
}
export type { AccentOption, AccentTone, AppearancePrefs, TintScope }
