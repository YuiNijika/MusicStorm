import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react"

import {
    applyAppearanceToDom,
    normalizeHue,
    readAppearancePrefs,
    writeAppearancePrefs,
    type AccentTone,
    type AppearancePrefs,
    type TintScope,
} from "@/lib/appearance/appearance-prefs"

type Theme = "light" | "dark" | "system"
type ResolvedTheme = "light" | "dark"

type ThemeContextValue = {
    theme: Theme
    resolvedTheme: ResolvedTheme
    setTheme: (theme: Theme) => void
    toggleTheme: () => void
    appearance: AppearancePrefs
    setAccent: (accent: AccentTone) => void
    setTintScope: (scope: TintScope) => void
    /** 切到自定义色调并写入色相 0–359 */
    setCustomHue: (hue: number) => void
    setGlassOpacity: (value: number) => void
    setGlassBlur: (value: number) => void
    setMaterialGlass: (enabled: boolean) => void
}

const STORAGE_KEY = "musicstorm-theme"

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): ResolvedTheme {
    if (typeof window === "undefined") {
        return "light"
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function resolveTheme(theme: Theme): ResolvedTheme {
    return theme === "system" ? getSystemTheme() : theme
}

function applyTheme(resolved: ResolvedTheme) {
    const root = document.documentElement
    root.classList.toggle("dark", resolved === "dark")
    root.dataset.theme = resolved
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window === "undefined") {
            return "system"
        }
        const stored = window.localStorage.getItem(STORAGE_KEY)
        if (stored === "light" || stored === "dark" || stored === "system") {
            return stored
        }
        return "system"
    })
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
        resolveTheme(theme),
    )
    const [appearance, setAppearance] = useState<AppearancePrefs>(() =>
        readAppearancePrefs(),
    )

    useEffect(() => {
        const next = resolveTheme(theme)
        setResolvedTheme(next)
        applyTheme(next)
        window.localStorage.setItem(STORAGE_KEY, theme)
        applyAppearanceToDom(appearance)
    }, [theme, appearance])

    useEffect(() => {
        if (theme !== "system") {
            return
        }
        const media = window.matchMedia("(prefers-color-scheme: dark)")
        const onChange = () => {
            const next = getSystemTheme()
            setResolvedTheme(next)
            applyTheme(next)
            applyAppearanceToDom(appearance)
        }
        media.addEventListener("change", onChange)
        return () => media.removeEventListener("change", onChange)
    }, [theme, appearance])

    const setTheme = useCallback((next: Theme) => {
        setThemeState(next)
    }, [])

    const toggleTheme = useCallback(() => {
        setThemeState((current) => {
            const resolved = resolveTheme(current)
            return resolved === "dark" ? "light" : "dark"
        })
    }, [])

    const setAccent = useCallback((accent: AccentTone) => {
        setAppearance((prev) => {
            const next = { ...prev, accent }
            writeAppearancePrefs(next)
            return next
        })
    }, [])

    const setTintScope = useCallback((tintScope: TintScope) => {
        setAppearance((prev) => {
            const next = { ...prev, tintScope }
            writeAppearancePrefs(next)
            return next
        })
    }, [])

    const setCustomHue = useCallback((hue: number) => {
        setAppearance((prev) => {
            const next = {
                ...prev,
                accent: "custom" as const,
                customHue: normalizeHue(hue),
            }
            writeAppearancePrefs(next)
            return next
        })
    }, [])

    const setGlassOpacity = useCallback((value: number) => {
        setAppearance((prev) => {
            const next = {
                ...prev,
                glassOpacity: Math.min(0.9, Math.max(0.35, value)),
            }
            writeAppearancePrefs(next)
            return next
        })
    }, [])

    const setGlassBlur = useCallback((value: number) => {
        setAppearance((prev) => {
            const next = {
                ...prev,
                glassBlur: Math.min(48, Math.max(8, value)),
            }
            writeAppearancePrefs(next)
            return next
        })
    }, [])

    const setMaterialGlass = useCallback((enabled: boolean) => {
        setAppearance((prev) => {
            const next = { ...prev, materialGlass: enabled }
            writeAppearancePrefs(next)
            return next
        })
    }, [])

    const value = useMemo(
        () => ({
            theme,
            resolvedTheme,
            setTheme,
            toggleTheme,
            appearance,
            setAccent,
            setTintScope,
            setCustomHue,
            setGlassOpacity,
            setGlassBlur,
            setMaterialGlass,
        }),
        [
            theme,
            resolvedTheme,
            setTheme,
            toggleTheme,
            appearance,
            setAccent,
            setTintScope,
            setCustomHue,
            setGlassOpacity,
            setGlassBlur,
            setMaterialGlass,
        ],
    )

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (!context) {
        throw new Error("useTheme must be used within ThemeProvider")
    }
    return context
}