import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react"
import { flushSync } from "react-dom"

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
    setBackgroundUrl: (url: string) => void
    setBackgroundOpacity: (value: number) => void
    setBackgroundBlur: (value: number) => void
}

const STORAGE_KEY = "musicstorm-theme"

const ThemeContext = createContext<ThemeContextValue | null>(null)

// 扩散圆心取最近一次点击位置，键盘或程序触发时落在视口中心
let themeOriginX = -1
let themeOriginY = -1
if (typeof window !== "undefined") {
    window.addEventListener(
        "pointerdown",
        (event) => {
            themeOriginX = event.clientX
            themeOriginY = event.clientY
        },
        true,
    )
}

function runThemeTransition(mutate: () => void) {
    const root = document.documentElement
    if (
        typeof document === "undefined" ||
        !document.startViewTransition ||
        // 系统降低动态效果 / 应用内关闭过渡特效：都直接切，不建快照
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        root.classList.contains("performance-mode")
    ) {
        mutate()
        return
    }
    const x = themeOriginX >= 0 ? themeOriginX : window.innerWidth / 2
    const y = themeOriginY >= 0 ? themeOriginY : window.innerHeight / 2
    const radius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
    )
    root.style.setProperty("--theme-x", `${x}px`)
    root.style.setProperty("--theme-y", `${y}px`)
    root.style.setProperty("--theme-r", `${radius}px`)
    const transition = document.startViewTransition(() => {
        // flushSync 让 React 提交先行完成，截图才能捕捉到新主题
        flushSync(mutate)
    })
    // VT 期间压掉逐元素 transition 与玻璃 backdrop-filter：全树变量一次落地时，
    // 每个带过渡的元素各跑一轮动画、每层毛玻璃全量重采样重绘，才是黑切白卡顿的
    // 主源；视觉过渡完全交给 VT 圆扩散快照动画，结束后立即恢复原渲染路径
    root.classList.add("theme-switching")
    void transition.finished.finally(() => {
        root.classList.remove("theme-switching")
    })
}

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

    // 外观最新值镜像：render 期同步，保证过渡闭包能取到最新外观
    const appearanceRef = useRef(appearance)
    appearanceRef.current = appearance

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
        runThemeTransition(() => {
            // DOM 明暗 + 颜色变量必须在截帧前同步落地：applyTheme 切 class，
            // applyAppearanceToDom 注入 --background 等 inline 变量——两者留到
            // effect 再跑的话，startViewTransition 截到的新快照还是旧外观，
            // 动画空转，结束后才跳变（白切黑"黑了还闪一下"就是这么来的）
            applyTheme(resolveTheme(next))
            applyAppearanceToDom(appearanceRef.current)
            setThemeState(next)
        })
    }, [])

    const toggleTheme = useCallback(() => {
        runThemeTransition(() =>
            setThemeState((current) => {
                const resolved = resolveTheme(current)
                const next = resolved === "dark" ? "light" : "dark"
                applyTheme(next)
                applyAppearanceToDom(appearanceRef.current)
                return next
            }),
        )
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

    const setBackgroundUrl = useCallback((url: string) => {
        setAppearance((prev) => {
            const next = { ...prev, backgroundUrl: url }
            writeAppearancePrefs(next)
            return next
        })
    }, [])

    const setBackgroundOpacity = useCallback((value: number) => {
        setAppearance((prev) => {
            const next = {
                ...prev,
                backgroundOpacity: Math.min(1, Math.max(0, value)),
            }
            writeAppearancePrefs(next)
            return next
        })
    }, [])

    const setBackgroundBlur = useCallback((value: number) => {
        setAppearance((prev) => {
            const next = {
                ...prev,
                backgroundBlur: Math.min(40, Math.max(0, value)),
            }
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
            setBackgroundUrl,
            setBackgroundOpacity,
            setBackgroundBlur,
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
            setBackgroundUrl,
            setBackgroundOpacity,
            setBackgroundBlur,
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