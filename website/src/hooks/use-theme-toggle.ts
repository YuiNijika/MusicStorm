import { useEffect, useState } from "react"

// 主题跟随系统（未手动设置时），点击切换写死 light/dark 覆盖；
// data-theme 由 index.html 内联脚本首帧前落定，这里只负责后续变更

const THEME_KEY = "musicstorm-web-theme"

type Theme = "light" | "dark"

function resolveTheme(): Theme {
    if (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
        return "dark"
    }
    return "light"
}

function readStoredTheme(): Theme | null {
    if (typeof window === "undefined") {
        return null
    }
    try {
        const raw = window.localStorage.getItem(THEME_KEY)
        return raw === "light" || raw === "dark" ? raw : null
    } catch {
        return null
    }
}

function useThemeToggle() {
    // 手动覆盖过一次后，不再跟随系统变化；未覆盖则跟随
    const [theme, setTheme] = useState<Theme>(
        () => readStoredTheme() ?? resolveTheme(),
    )

    useEffect(() => {
        const root = document.documentElement
        const apply = (next: Theme) => {
            root.dataset.theme = next
            setTheme(next)
        }

        // 无手动偏好时监听系统明暗切换
        const media = window.matchMedia("(prefers-color-scheme: dark)")
        function onSystemChange() {
            if (readStoredTheme() === null) {
                apply(media.matches ? "dark" : "light")
            }
        }
        media.addEventListener("change", onSystemChange)

        // 用户从其他标签页改过偏好，回到本站时同步
        function onStorage(event: StorageEvent) {
            if (event.key === THEME_KEY) {
                apply(readStoredTheme() ?? resolveTheme())
            }
        }
        window.addEventListener("storage", onStorage)

        return () => {
            media.removeEventListener("change", onSystemChange)
            window.removeEventListener("storage", onStorage)
        }
    }, [])

    const set = (next: Theme) => {
        try {
            window.localStorage.setItem(THEME_KEY, next)
        } catch {
            // 存储不可用时仅本次生效
        }
        document.documentElement.dataset.theme = next
        setTheme(next)
    }

    return { theme, setTheme: set }
}

export { useThemeToggle }
export type { Theme }
