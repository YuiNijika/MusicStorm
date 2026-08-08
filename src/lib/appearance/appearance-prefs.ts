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
    /** 强调色仅作用于交互，global 额外低彩度染色所有表面 */
    tintScope: TintScope
    /** 0–359，仅 accent === "custom" 时生效 */
    customHue: number
    /** 0.35 – 0.9，玻璃底不透明度倾向 */
    glassOpacity: number
    /** 8 – 48 px 模糊 */
    glassBlur: number
    /** 常驻毛玻璃（侧栏/底栏/面板），关闭可降低性能开销 */
    materialGlass: boolean
}

type AccentOption = {
    id: Exclude<AccentTone, "custom">
    label: string
    hue: number
}

// 默认色调，标题栏与设置共用
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
    tintScope: "accent",
    customHue: DEFAULT_CUSTOM_HUE,
    glassOpacity: 0.58,
    glassBlur: 28,
    materialGlass: true,
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
            tintScope:
                data.tintScope === "global" ? "global" : DEFAULT_APPEARANCE.tintScope,
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
        }
    } catch {
        return DEFAULT_APPEARANCE
    }
}

function writeAppearancePrefs(prefs: AppearancePrefs): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

function resolveAccentHue(prefs: AppearancePrefs): number {
    if (prefs.accent === "custom") {
        return normalizeHue(prefs.customHue)
    }
    return ACCENT_OPTIONS.find((item) => item.id === prefs.accent)?.hue ?? 260
}

// 中性预设：低 chroma；自定义 / 彩色预设：正常 chroma
function isNeutralAccent(prefs: AppearancePrefs): boolean {
    return prefs.accent === "neutral"
}

// 色点预览色，标题栏与设置共用
function accentSwatch(hue: number, neutral = false): string {
    return neutral ? `oklch(0.72 0.02 ${hue})` : `oklch(0.62 0.14 ${hue})`
}

// 日间必须给背景/玻璃/primary 上 chroma，否则色调看不出；浮层走高不透明度保证菜单可读
function applyAppearanceToDom(prefs: AppearancePrefs): void {
    const root = document.documentElement
    const hue = resolveAccentHue(prefs)
    const neutral = isNeutralAccent(prefs)
    const tintAllSurfaces = prefs.tintScope === "global" && !neutral
    const opacityPct = Math.round(prefs.glassOpacity * 100)
    const strongPct = Math.min(96, opacityPct + 16)

    // 常驻毛玻璃开关：关闭时挂 glass-disabled，CSS 降级为实色
    root.classList.toggle("glass-disabled", !prefs.materialGlass)
    root.style.setProperty("--accent-hue", String(hue))
    root.dataset.accent = prefs.accent
    root.dataset.tintScope = prefs.tintScope
    root.style.setProperty("--glass-opacity", String(prefs.glassOpacity))
    root.style.setProperty("--glass-blur", `${prefs.glassBlur}px`)

    const dark = root.classList.contains("dark")

    if (dark) {
        const accentChroma = neutral ? 0.025 : 0.15

        root.style.setProperty(
            "--background",
            tintAllSurfaces ? `oklch(0.145 0.012 ${hue})` : "oklch(0.145 0.004 260)",
        )
        root.style.setProperty("--foreground", "oklch(0.955 0.003 260)")
        root.style.setProperty(
            "--card",
            tintAllSurfaces
                ? `oklch(0.205 0.014 ${hue} / 88%)`
                : "oklch(0.205 0.005 260 / 84%)",
        )
        root.style.setProperty("--card-foreground", "oklch(0.955 0.003 260)")
        root.style.setProperty(
            "--popover",
            tintAllSurfaces
                ? `oklch(0.225 0.016 ${hue} / 97%)`
                : "oklch(0.225 0.005 260 / 97%)",
        )
        root.style.setProperty("--popover-foreground", "oklch(0.955 0.003 260)")
        root.style.setProperty(
            "--primary",
            neutral ? "oklch(0.72 0.025 260)" : `oklch(0.72 ${accentChroma} ${hue})`,
        )
        root.style.setProperty(
            "--primary-foreground",
            neutral ? "oklch(0.15 0.004 260)" : `oklch(0.14 0.02 ${hue})`,
        )
        root.style.setProperty(
            "--secondary",
            tintAllSurfaces
                ? `oklch(0.26 0.014 ${hue} / 82%)`
                : "oklch(0.26 0.006 260 / 78%)",
        )
        root.style.setProperty("--secondary-foreground", "oklch(0.955 0.003 260)")
        root.style.setProperty(
            "--muted",
            tintAllSurfaces
                ? `oklch(0.25 0.012 ${hue} / 80%)`
                : "oklch(0.25 0.006 260 / 76%)",
        )
        root.style.setProperty("--muted-foreground", "oklch(0.70 0.008 260)")
        root.style.setProperty(
            "--accent",
            neutral
                ? "oklch(0.29 0.008 260 / 82%)"
                : `color-mix(in oklab, var(--primary) 20%, oklch(0.24 0.006 260))`,
        )
        root.style.setProperty("--accent-foreground", "oklch(0.955 0.003 260)")
        root.style.setProperty("--border", "oklch(1 0 0 / 11%)")
        root.style.setProperty("--input", "oklch(1 0 0 / 14%)")
        root.style.setProperty(
            "--ring",
            neutral ? "oklch(0.62 0.025 260)" : `oklch(0.68 0.13 ${hue})`,
        )
        root.style.setProperty(
            "--sidebar",
            tintAllSurfaces
                ? `oklch(0.18 0.014 ${hue} / 90%)`
                : "oklch(0.18 0.005 260 / 86%)",
        )
        root.style.setProperty("--sidebar-foreground", "oklch(0.955 0.003 260)")
        root.style.setProperty("--sidebar-primary", "var(--primary)")
        root.style.setProperty("--sidebar-primary-foreground", "var(--primary-foreground)")
        root.style.setProperty(
            "--sidebar-accent",
            "color-mix(in oklab, var(--primary) 18%, transparent)",
        )
        root.style.setProperty("--sidebar-accent-foreground", "oklch(0.955 0.003 260)")
        root.style.setProperty("--sidebar-border", "oklch(1 0 0 / 8%)")
        root.style.setProperty("--sidebar-ring", "var(--ring)")
        root.style.setProperty("--chart-1", "var(--primary)")
        root.style.setProperty(
            "--chart-2",
            neutral ? "oklch(0.68 0.025 210)" : `oklch(0.72 0.13 ${(hue + 70) % 360})`,
        )
        root.style.setProperty(
            "--chart-3",
            neutral ? "oklch(0.72 0.025 120)" : `oklch(0.75 0.14 ${(hue + 140) % 360})`,
        )
        root.style.setProperty(
            "--chart-4",
            neutral ? "oklch(0.66 0.025 310)" : `oklch(0.70 0.14 ${(hue + 210) % 360})`,
        )
        root.style.setProperty(
            "--chart-5",
            neutral ? "oklch(0.70 0.025 40)" : `oklch(0.72 0.15 ${(hue + 285) % 360})`,
        )

        root.style.setProperty(
            "--glass-bg",
            tintAllSurfaces
                ? `color-mix(in oklab, oklch(0.22 0.018 ${hue}) ${opacityPct}%, transparent)`
                : `color-mix(in oklab, oklch(0.22 0.005 260) ${opacityPct}%, transparent)`,
        )
        root.style.setProperty(
            "--glass-bg-strong",
            tintAllSurfaces
                ? `color-mix(in oklab, oklch(0.25 0.02 ${hue}) ${strongPct}%, transparent)`
                : `color-mix(in oklab, oklch(0.25 0.005 260) ${strongPct}%, transparent)`,
        )
        root.style.setProperty(
            "--surface-raised",
            tintAllSurfaces
                ? `oklch(0.235 0.016 ${hue} / 92%)`
                : "oklch(0.235 0.005 260 / 90%)",
        )
        root.style.setProperty(
            "--surface-fill",
            tintAllSurfaces
                ? `color-mix(in oklab, var(--primary) 10%, rgb(255 255 255 / 6%))`
                : "rgb(255 255 255 / 7%)",
        )
        root.style.setProperty(
            "--surface-fill-hover",
            tintAllSurfaces
                ? `color-mix(in oklab, var(--primary) 14%, rgb(255 255 255 / 8%))`
                : "rgb(255 255 255 / 11%)",
        )
        root.style.setProperty(
            "--surface-fill-pressed",
            tintAllSurfaces
                ? `color-mix(in oklab, var(--primary) 18%, rgb(255 255 255 / 10%))`
                : "rgb(255 255 255 / 15%)",
        )
        root.style.setProperty("--glass-border", "rgb(255 255 255 / 10%)")
        root.style.setProperty("--glass-highlight", "rgb(255 255 255 / 9%)")
        root.style.setProperty(
            "--glass-shadow",
            "0 12px 38px rgb(0 0 0 / 34%), 0 1px 0 rgb(255 255 255 / 8%) inset",
        )
        return
    }

    const accentChroma = neutral ? 0.025 : 0.18

    root.style.setProperty(
        "--background",
        tintAllSurfaces ? `oklch(0.972 0.012 ${hue})` : "oklch(0.972 0.002 260)",
    )
    root.style.setProperty("--foreground", "oklch(0.205 0.006 260)")
    root.style.setProperty(
        "--card",
        tintAllSurfaces ? `oklch(0.995 0.01 ${hue} / 94%)` : "oklch(1 0 0 / 92%)",
    )
    root.style.setProperty("--card-foreground", "oklch(0.205 0.006 260)")
    root.style.setProperty(
        "--popover",
        tintAllSurfaces
            ? `oklch(0.992 0.012 ${hue} / 98%)`
            : "oklch(0.992 0.002 260 / 98%)",
    )
    root.style.setProperty("--popover-foreground", "oklch(0.205 0.006 260)")
    root.style.setProperty(
        "--primary",
        neutral ? "oklch(0.43 0.025 260)" : `oklch(0.50 ${accentChroma} ${hue})`,
    )
    root.style.setProperty("--primary-foreground", "oklch(0.99 0 0)")
    root.style.setProperty(
        "--secondary",
        tintAllSurfaces
            ? `oklch(0.94 0.014 ${hue} / 88%)`
            : "oklch(0.94 0.003 260 / 86%)",
    )
    root.style.setProperty("--secondary-foreground", "oklch(0.205 0.006 260)")
    root.style.setProperty(
        "--muted",
        tintAllSurfaces
            ? `oklch(0.94 0.012 ${hue} / 84%)`
            : "oklch(0.94 0.003 260 / 82%)",
    )
    root.style.setProperty("--muted-foreground", "oklch(0.49 0.008 260)")
    root.style.setProperty(
        "--accent",
        neutral
            ? "oklch(0.92 0.006 260 / 86%)"
            : `color-mix(in oklab, var(--primary) 12%, oklch(0.96 0.003 260))`,
    )
    root.style.setProperty("--accent-foreground", "oklch(0.205 0.006 260)")
    root.style.setProperty("--border", "oklch(0.80 0.004 260 / 42%)")
    root.style.setProperty("--input", "oklch(0.90 0.004 260 / 76%)")
    root.style.setProperty(
        "--ring",
        neutral ? "oklch(0.58 0.025 260)" : `oklch(0.58 0.15 ${hue})`,
    )
    root.style.setProperty(
        "--sidebar",
        tintAllSurfaces
            ? `oklch(0.955 0.014 ${hue} / 86%)`
            : "oklch(0.955 0.003 260 / 82%)",
    )
    root.style.setProperty("--sidebar-foreground", "oklch(0.205 0.006 260)")
    root.style.setProperty("--sidebar-primary", "var(--primary)")
    root.style.setProperty("--sidebar-primary-foreground", "var(--primary-foreground)")
    root.style.setProperty(
        "--sidebar-accent",
        "color-mix(in oklab, var(--primary) 12%, transparent)",
    )
    root.style.setProperty("--sidebar-accent-foreground", "oklch(0.205 0.006 260)")
    root.style.setProperty("--sidebar-border", "oklch(0.78 0.004 260 / 30%)")
    root.style.setProperty("--sidebar-ring", "var(--ring)")
    root.style.setProperty("--chart-1", "var(--primary)")
    root.style.setProperty(
        "--chart-2",
        neutral ? "oklch(0.62 0.025 210)" : `oklch(0.64 0.15 ${(hue + 70) % 360})`,
    )
    root.style.setProperty(
        "--chart-3",
        neutral ? "oklch(0.66 0.025 120)" : `oklch(0.68 0.15 ${(hue + 140) % 360})`,
    )
    root.style.setProperty(
        "--chart-4",
        neutral ? "oklch(0.60 0.025 310)" : `oklch(0.62 0.16 ${(hue + 210) % 360})`,
    )
    root.style.setProperty(
        "--chart-5",
        neutral ? "oklch(0.64 0.025 40)" : `oklch(0.65 0.17 ${(hue + 285) % 360})`,
    )

    root.style.setProperty(
        "--glass-bg",
        tintAllSurfaces
            ? `color-mix(in oklab, oklch(0.985 0.018 ${hue}) ${opacityPct}%, transparent)`
            : `color-mix(in oklab, white ${opacityPct}%, transparent)`,
    )
    root.style.setProperty(
        "--glass-bg-strong",
        tintAllSurfaces
            ? `color-mix(in oklab, oklch(0.99 0.018 ${hue}) ${strongPct}%, transparent)`
            : `color-mix(in oklab, white ${strongPct}%, transparent)`,
    )
    root.style.setProperty(
        "--surface-raised",
        tintAllSurfaces ? `oklch(0.995 0.01 ${hue} / 90%)` : "oklch(1 0 0 / 88%)",
    )
    root.style.setProperty(
        "--surface-fill",
        tintAllSurfaces
            ? "color-mix(in oklab, var(--primary) 7%, rgb(0 0 0 / 3%))"
            : "rgb(0 0 0 / 4.5%)",
    )
    root.style.setProperty(
        "--surface-fill-hover",
        tintAllSurfaces
            ? "color-mix(in oklab, var(--primary) 10%, rgb(0 0 0 / 4%))"
            : "rgb(0 0 0 / 7%)",
    )
    root.style.setProperty(
        "--surface-fill-pressed",
        tintAllSurfaces
            ? "color-mix(in oklab, var(--primary) 13%, rgb(0 0 0 / 6%))"
            : "rgb(0 0 0 / 10%)",
    )
    root.style.setProperty("--glass-border", "rgb(255 255 255 / 46%)")
    root.style.setProperty("--glass-highlight", "rgb(255 255 255 / 62%)")
    root.style.setProperty(
        "--glass-shadow",
        "0 8px 30px rgb(0 0 0 / 8%), 0 1px 0 rgb(255 255 255 / 52%) inset",
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
export type { AccentOption, AccentTone, AppearancePrefs, TintScope }