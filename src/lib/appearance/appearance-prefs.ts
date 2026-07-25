const STORAGE_KEY = "musicstorm-appearance"

/** 预设 id；`custom` 时使用 customHue */
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

type AppearancePrefs = {
    accent: AccentTone
    /** 0–359，仅 accent === "custom" 时生效 */
    customHue: number
    /** 0.35 – 0.9，玻璃底不透明度倾向 */
    glassOpacity: number
    /** 8 – 48 px 模糊 */
    glassBlur: number
}

type AccentOption = {
    id: Exclude<AccentTone, "custom">
    label: string
    hue: number
}

/** 默认色调（标题栏 / 设置共用） */
const ACCENT_OPTIONS: AccentOption[] = [
    { id: "neutral", label: "中性", hue: 260 },
    { id: "rose", label: "玫瑰", hue: 350 },
    { id: "pink", label: "粉彩", hue: 340 },
    { id: "orange", label: "橙橘", hue: 45 },
    { id: "amber", label: "琥珀", hue: 75 },
    { id: "green", label: "翠绿", hue: 155 },
    { id: "teal", label: "青绿", hue: 185 },
    { id: "cyan", label: "青蓝", hue: 205 },
    { id: "blue", label: "蓝色", hue: 230 },
    { id: "indigo", label: "靛蓝", hue: 265 },
    { id: "violet", label: "紫罗兰", hue: 300 },
]

const PRESET_IDS = new Set(ACCENT_OPTIONS.map((item) => item.id))

const DEFAULT_CUSTOM_HUE = 280

const DEFAULT_APPEARANCE: AppearancePrefs = {
    accent: "neutral",
    customHue: DEFAULT_CUSTOM_HUE,
    glassOpacity: 0.58,
    glassBlur: 28,
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function normalizeHue(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_CUSTOM_HUE
    }
    const wrapped = ((Math.round(value) % 360) + 360) % 360
    return wrapped
}

function isAccent(value: unknown): value is AccentTone {
    if (value === "custom") {
        return true
    }
    return typeof value === "string" && PRESET_IDS.has(value as AccentOption["id"])
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
            accent: isAccent(data.accent) ? data.accent : DEFAULT_APPEARANCE.accent,
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
        }
    } catch {
        return DEFAULT_APPEARANCE
    }
}

function writeAppearancePrefs(prefs: AppearancePrefs): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

/** 当前生效的色相角 */
function resolveAccentHue(prefs: AppearancePrefs): number {
    if (prefs.accent === "custom") {
        return normalizeHue(prefs.customHue)
    }
    return ACCENT_OPTIONS.find((item) => item.id === prefs.accent)?.hue ?? 260
}

/** 中性预设：低 chroma；自定义 / 彩色预设：正常 chroma */
function isNeutralAccent(prefs: AppearancePrefs): boolean {
    return prefs.accent === "neutral"
}

/** 色点预览色（标题栏 / 设置） */
function accentSwatch(hue: number, neutral = false): string {
    return neutral ? `oklch(0.72 0.02 ${hue})` : `oklch(0.62 0.14 ${hue})`
}

/**
 * 把色调 + 玻璃参数写到 :root。
 * 日间必须给背景 / 玻璃 / primary 上 chroma，否则「色调」几乎看不出来。
 * 浮层（popover）单独走高不透明度，保证菜单可读。
 */
function applyAppearanceToDom(prefs: AppearancePrefs): void {
    const root = document.documentElement
    const hue = resolveAccentHue(prefs)
    const neutral = isNeutralAccent(prefs)
    const opacityPct = Math.round(prefs.glassOpacity * 100)
    const strongPct = Math.min(96, opacityPct + 16)

    root.style.setProperty("--accent-hue", String(hue))
    root.dataset.accent = prefs.accent
    root.style.setProperty("--glass-opacity", String(prefs.glassOpacity))
    root.style.setProperty("--glass-blur", `${prefs.glassBlur}px`)

    const dark = root.classList.contains("dark")

    if (dark) {
        const c = neutral ? 0.018 : 0.035
        const glassC = neutral ? 0.02 : 0.04

        root.style.setProperty("--background", `oklch(0.14 ${c} ${hue})`)
        root.style.setProperty("--foreground", `oklch(0.97 0.008 ${hue})`)
        root.style.setProperty("--card", `oklch(0.2 ${glassC} ${hue} / 72%)`)
        root.style.setProperty("--card-foreground", `oklch(0.97 0.008 ${hue})`)
        // 菜单/浮层：接近实色，避免透底看不清
        root.style.setProperty("--popover", `oklch(0.2 ${glassC} ${hue} / 96%)`)
        root.style.setProperty("--popover-foreground", `oklch(0.97 0.008 ${hue})`)
        root.style.setProperty(
            "--primary",
            neutral ? `oklch(0.96 0.008 ${hue})` : `oklch(0.78 0.12 ${hue})`,
        )
        root.style.setProperty(
            "--primary-foreground",
            neutral ? `oklch(0.2 0.015 ${hue})` : `oklch(0.16 0.03 ${hue})`,
        )
        root.style.setProperty("--secondary", `oklch(0.24 ${glassC} ${hue} / 75%)`)
        root.style.setProperty("--secondary-foreground", `oklch(0.97 0.008 ${hue})`)
        root.style.setProperty("--muted", `oklch(0.24 ${glassC} ${hue} / 75%)`)
        root.style.setProperty("--muted-foreground", `oklch(0.72 0.02 ${hue})`)
        root.style.setProperty("--accent", `oklch(0.26 ${glassC + 0.01} ${hue} / 78%)`)
        root.style.setProperty("--accent-foreground", `oklch(0.97 0.008 ${hue})`)
        root.style.setProperty("--border", `oklch(1 0 0 / 10%)`)
        root.style.setProperty("--input", `oklch(1 0 0 / 12%)`)
        root.style.setProperty(
            "--ring",
            neutral ? `oklch(0.55 0.03 ${hue})` : `oklch(0.62 0.1 ${hue})`,
        )
        root.style.setProperty("--sidebar", `oklch(0.16 ${c} ${hue} / 70%)`)
        root.style.setProperty("--sidebar-foreground", `oklch(0.97 0.008 ${hue})`)
        root.style.setProperty(
            "--sidebar-primary",
            neutral ? `oklch(0.62 0.04 ${hue})` : `oklch(0.68 0.14 ${hue})`,
        )
        root.style.setProperty("--sidebar-primary-foreground", `oklch(0.985 0 0)`)
        root.style.setProperty("--sidebar-accent", `oklch(0.24 ${glassC} ${hue} / 78%)`)
        root.style.setProperty("--sidebar-accent-foreground", `oklch(0.97 0.008 ${hue})`)
        root.style.setProperty("--sidebar-border", `oklch(1 0 0 / 8%)`)
        root.style.setProperty(
            "--sidebar-ring",
            neutral ? `oklch(0.55 0.03 ${hue})` : `oklch(0.62 0.1 ${hue})`,
        )

        root.style.setProperty(
            "--glass-bg",
            `color-mix(in oklab, oklch(0.22 ${glassC} ${hue}) ${opacityPct}%, transparent)`,
        )
        root.style.setProperty(
            "--glass-bg-strong",
            `color-mix(in oklab, oklch(0.25 ${glassC} ${hue}) ${strongPct}%, transparent)`,
        )
        root.style.setProperty(
            "--glass-border",
            `color-mix(in oklab, white 12%, oklch(0.4 ${glassC} ${hue}))`,
        )
        root.style.setProperty("--glass-highlight", `color-mix(in oklab, white 10%, transparent)`)
        root.style.setProperty(
            "--glass-shadow",
            `0 12px 40px rgb(0 0 0 / 35%), 0 1px 0 rgb(255 255 255 / 8%) inset`,
        )
        return
    }

    // —— 日间：背景 / 玻璃 / 主色都带 chroma，色调才可见 ——
    const c = neutral ? 0.008 : 0.028
    const glassC = neutral ? 0.012 : 0.04
    const primaryC = neutral ? 0.02 : 0.13

    root.style.setProperty("--background", `oklch(0.97 ${c} ${hue})`)
    root.style.setProperty("--foreground", `oklch(0.18 0.025 ${hue})`)
    root.style.setProperty("--card", `oklch(0.995 ${c * 0.6} ${hue} / 92%)`)
    root.style.setProperty("--card-foreground", `oklch(0.18 0.025 ${hue})`)
    // 菜单实底：日间近乎不透明
    root.style.setProperty("--popover", `oklch(0.995 ${c * 0.5} ${hue} / 98%)`)
    root.style.setProperty("--popover-foreground", `oklch(0.18 0.025 ${hue})`)
    root.style.setProperty(
        "--primary",
        neutral ? `oklch(0.24 ${primaryC} ${hue})` : `oklch(0.48 ${primaryC} ${hue})`,
    )
    root.style.setProperty("--primary-foreground", `oklch(0.99 0.01 ${hue})`)
    root.style.setProperty("--secondary", `oklch(0.95 ${glassC} ${hue} / 88%)`)
    root.style.setProperty("--secondary-foreground", `oklch(0.24 0.03 ${hue})`)
    root.style.setProperty("--muted", `oklch(0.95 ${glassC * 0.8} ${hue} / 88%)`)
    root.style.setProperty("--muted-foreground", `oklch(0.46 0.03 ${hue})`)
    root.style.setProperty("--accent", `oklch(0.94 ${glassC + 0.01} ${hue} / 90%)`)
    root.style.setProperty(
        "--accent-foreground",
        neutral ? `oklch(0.22 0.02 ${hue})` : `oklch(0.32 0.08 ${hue})`,
    )
    root.style.setProperty("--border", `oklch(0.88 ${c} ${hue} / 58%)`)
    root.style.setProperty("--input", `oklch(0.92 ${c} ${hue} / 78%)`)
    root.style.setProperty(
        "--ring",
        neutral ? `oklch(0.68 0.03 ${hue})` : `oklch(0.58 0.1 ${hue})`,
    )
    root.style.setProperty("--sidebar", `oklch(0.98 ${c} ${hue} / 78%)`)
    root.style.setProperty("--sidebar-foreground", `oklch(0.18 0.025 ${hue})`)
    root.style.setProperty(
        "--sidebar-primary",
        neutral ? `oklch(0.24 ${primaryC} ${hue})` : `oklch(0.48 ${primaryC} ${hue})`,
    )
    root.style.setProperty("--sidebar-primary-foreground", `oklch(0.99 0.01 ${hue})`)
    root.style.setProperty("--sidebar-accent", `oklch(0.94 ${glassC} ${hue} / 88%)`)
    root.style.setProperty("--sidebar-accent-foreground", `oklch(0.24 0.03 ${hue})`)
    root.style.setProperty("--sidebar-border", `oklch(0.9 ${c} ${hue} / 48%)`)
    root.style.setProperty(
        "--sidebar-ring",
        neutral ? `oklch(0.68 0.03 ${hue})` : `oklch(0.58 0.1 ${hue})`,
    )

    // 日间玻璃：带色相的浅底，而不是纯白
    root.style.setProperty(
        "--glass-bg",
        `color-mix(in oklab, oklch(0.98 ${glassC} ${hue}) ${opacityPct}%, transparent)`,
    )
    root.style.setProperty(
        "--glass-bg-strong",
        `color-mix(in oklab, oklch(0.99 ${glassC * 0.85} ${hue}) ${strongPct}%, transparent)`,
    )
    root.style.setProperty(
        "--glass-border",
        `color-mix(in oklab, white 48%, oklch(0.78 ${glassC} ${hue}))`,
    )
    root.style.setProperty(
        "--glass-highlight",
        `color-mix(in oklab, white 70%, oklch(0.95 ${glassC * 0.5} ${hue}))`,
    )
    root.style.setProperty(
        "--glass-shadow",
        neutral
            ? `0 8px 32px rgb(15 23 42 / 8%), 0 1px 0 rgb(255 255 255 / 35%) inset`
            : `0 8px 32px oklch(0.45 ${glassC} ${hue} / 12%), 0 1px 0 rgb(255 255 255 / 40%) inset`,
    )
}

export {
    ACCENT_OPTIONS,
    DEFAULT_APPEARANCE,
    DEFAULT_CUSTOM_HUE,
    accentSwatch,
    applyAppearanceToDom,
    isNeutralAccent,
    normalizeHue,
    readAppearancePrefs,
    resolveAccentHue,
    writeAppearancePrefs,
}
export type { AccentOption, AccentTone, AppearancePrefs }