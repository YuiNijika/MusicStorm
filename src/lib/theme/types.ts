export type ThemeStyle =
 | "default"
 | "minecraft"
 | "material"
 | "windows"
 | "nord"
 | "sunset"
 | "forest"
 | "monochrome"

export type ResolvedThemeMode = "light" | "dark"

export type ThemeCapability = "glass" | "backgroundImage" | "bingWallpaper"

export type ThemePalette = {
    background: string
    foreground: string
    card: string
    popover: string
    primary: string
    primaryForeground: string
    secondary: string
    muted: string
    mutedForeground: string
    accent: string
    destructive: string
    border: string
    input: string
    ring: string
    sidebar: string
    sidebarAccent: string
    chart: [string, string, string, string, string]
    surfaceRaised: string
    surfaceFill: string
    surfaceFillHover: string
    surfaceFillPressed: string
    glass: string
    glassStrong: string
    glassBorder: string
    glassHighlight: string
    shadowCard: string
    shadowFloat: string
    glowPrimary: string
    glowSecondary: string
    fullPlayerBackground: string
    fullPlayerWash: string
    scrollbarThumb: string
    scrollbarThumbHover: string
}

export type ThemeDefinition = {
    id: ThemeStyle
    label: string
    description: string
    capabilities: ThemeCapability[]
    fontFamily: string
    radius: string
    pixelated: boolean
 category: "classic" | "immersive" | "minimal"
    light: ThemePalette
    dark: ThemePalette
}
