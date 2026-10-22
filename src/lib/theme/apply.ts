import type {
    AccentTone,
    AppearancePrefs,
} from "@/lib/appearance/appearance-prefs"
import { resolveAccentHue } from "@/lib/appearance/appearance-prefs"
import { getThemeDefinition } from "@/lib/theme/themes"
import type {
    ResolvedThemeMode,
    ThemeDefinition,
    ThemePalette,
    ThemeStyle,
} from "@/lib/theme/types"

type ThemeApplyInput = {
    style: ThemeStyle
    mode: ResolvedThemeMode
    appearance: AppearancePrefs
}

function resolvePrimary(
    theme: ThemeDefinition,
    palette: ThemePalette,
    accent: AccentTone,
    hue: number,
): string {
    if (accent === "neutral") {
        return palette.primary
    }
    return `hsl(${hue} 62% ${theme.id === "minecraft" ? 38 : 48}%)`
}

function tintSurface(base: string, hue: number, ratio: number): string {
    return `color-mix(in srgb, ${base} ${100 - ratio}%, hsl(${hue} 48% 50%))`
}

function setPalette(input: {
    root: HTMLElement
    theme: ThemeDefinition
    palette: ThemePalette
    prefs: AppearancePrefs
}): void {
    const { root, theme, palette, prefs } = input
    const set = (name: string, value: string) => {
        root.style.setProperty(name, value)
    }
    const hue = resolveAccentHue(prefs)
    const globalTint =
        prefs.accent !== "neutral" &&
        prefs.tintScope === "global"
    const background = globalTint
        ? tintSurface(palette.background, hue, theme.id === "minecraft" ? 8 : 4)
        : palette.background
    const card = globalTint
        ? tintSurface(palette.card, hue, theme.id === "minecraft" ? 7 : 3)
        : palette.card
    const sidebar = globalTint
        ? tintSurface(palette.sidebar, hue, theme.id === "minecraft" ? 8 : 4)
        : palette.sidebar
    const primary = resolvePrimary(theme, palette, prefs.accent, hue)
    const ring =
        prefs.accent === "neutral"
            ? palette.ring
            : `hsl(${hue} 68% ${theme.id === "minecraft" ? 42 : 55}%)`

    set("--background", background)
    set("--foreground", palette.foreground)
    set("--card", card)
    set("--card-foreground", palette.foreground)
    set("--popover", palette.popover)
    set("--popover-foreground", palette.foreground)
    set("--primary", primary)
    set("--primary-foreground", palette.primaryForeground)
    set("--secondary", palette.secondary)
    set("--secondary-foreground", palette.foreground)
    set("--muted", palette.muted)
    set("--muted-foreground", palette.mutedForeground)
    set("--accent", palette.accent)
    set("--accent-foreground", palette.foreground)
    set("--destructive", palette.destructive)
    set("--border", palette.border)
    set("--input", palette.input)
    set("--ring", ring)
    set("--sidebar", sidebar)
    set("--sidebar-foreground", palette.foreground)
    set("--sidebar-primary", primary)
    set("--sidebar-primary-foreground", palette.primaryForeground)
    set("--sidebar-accent", palette.sidebarAccent)
    set("--sidebar-accent-foreground", palette.foreground)
    set("--sidebar-border", palette.border)
    set("--sidebar-ring", ring)
    set("--chart-1", palette.chart[0])
    set("--chart-2", palette.chart[1])
    set("--chart-3", palette.chart[2])
    set("--chart-4", palette.chart[3])
    set("--chart-5", palette.chart[4])
    set("--surface-raised", palette.surfaceRaised)
    set("--surface-fill", palette.surfaceFill)
    set("--surface-fill-hover", palette.surfaceFillHover)
    set("--surface-fill-pressed", palette.surfaceFillPressed)
    set("--separator", palette.border)
    set("--shadow-card", palette.shadowCard)
    set("--shadow-float", palette.shadowFloat)
    set("--glass-surface", palette.glass)
    set("--glass-bg", palette.glass)
    set("--glass-bg-strong", palette.glassStrong)
    set("--glass-border", palette.glassBorder)
    set("--glass-highlight", palette.glassHighlight)
    set("--glass-shadow", palette.shadowFloat)
    set("--glass-blur", `${prefs.glassBlur}px`)
    set("--glass-opacity", String(prefs.glassOpacity))
    set("--scrollbar-thumb", palette.scrollbarThumb)
    set("--scrollbar-thumb-hover", palette.scrollbarThumbHover)
    set("--theme-glow-primary", palette.glowPrimary)
    set("--theme-glow-secondary", palette.glowSecondary)
    set("--theme-full-player-bg", palette.fullPlayerBackground)
    set("--theme-full-player-wash", palette.fullPlayerWash)
    set("--theme-panel-radius", theme.id === "default" ? "20px" : "8px")
    set("--theme-control-radius", theme.radius)
    set("--theme-border-width", theme.pixelated ? "2px" : "1px")
    set("--theme-pixelated", theme.pixelated ? "1" : "0")
    set("--radius", theme.radius)
}

function applyThemeToDom(input: ThemeApplyInput): void {
    const { style, mode, appearance } = input
    const root = document.documentElement
    const theme = getThemeDefinition(style)
    const palette = mode === "dark" ? theme.dark : theme.light
    const supportsGlass = theme.capabilities.includes("glass")
    const supportsBackground = theme.capabilities.includes("backgroundImage")

    root.dataset.themeStyle = style
    root.classList.toggle("theme-style-minecraft", style === "minecraft")
    root.classList.toggle("theme-style-material", style === "material")
    root.classList.toggle("theme-style-windows", style === "windows")
    root.classList.toggle("theme-style-default", style === "default")
    root.classList.toggle(
        "glass-disabled",
        !appearance.materialGlass || !supportsGlass,
    )
    root.style.colorScheme = mode
    setPalette({ root, theme, palette, prefs: appearance })

    if (supportsBackground && appearance.backgroundUrl) {
        root.style.setProperty(
            "--app-bg-image",
            `url("${appearance.backgroundUrl}")`,
        )
    } else {
        root.style.removeProperty("--app-bg-image")
    }
    root.style.setProperty("--app-bg-opacity", String(appearance.backgroundOpacity))
    root.style.setProperty("--app-bg-blur", `${appearance.backgroundBlur}px`)

    const meta = document.querySelector<HTMLMetaElement>(
        'meta[name="theme-color"]',
    )
    meta?.setAttribute("content", palette.background)
}

export { applyThemeToDom }
export type { ThemeApplyInput }
