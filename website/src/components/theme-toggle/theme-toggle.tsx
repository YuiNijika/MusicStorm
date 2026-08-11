import { Moon, Sun } from "lucide-react"

import { useThemeToggle, type Theme } from "../../hooks/use-theme-toggle"

import "./theme-toggle.css"

// 单钮黑白切换：图标预示点击后的结果（亮色显月亮=点它变暗，暗色显太阳=点它变亮）
function ThemeToggle() {
    const { theme, setTheme } = useThemeToggle()
    const dark = theme === "dark"
    const next: Theme = dark ? "light" : "dark"

    return (
        <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme(next)}
            title={dark ? "切换到浅色" : "切换到深色"}
            aria-label={dark ? "切换到浅色" : "切换到深色"}
        >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
    )
}

export { ThemeToggle }
