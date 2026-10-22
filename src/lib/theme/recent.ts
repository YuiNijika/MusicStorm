import { getThemeDefinition, isThemeStyle } from "@/lib/theme/themes"
import type { ThemeStyle } from "@/lib/theme/types"

const STORAGE_KEY = "musicstorm-theme-recent"
const RECENT_LIMIT =4

function readRecentThemes(): ThemeStyle[] {
 if (typeof window === "undefined") {
 return []
 }
 try {
 const raw = window.localStorage.getItem(STORAGE_KEY)
 const parsed = raw ? (JSON.parse(raw) as unknown) : []
 return Array.isArray(parsed)
 ? parsed
 .filter(isThemeStyle)
 .filter(
 (id, index, list) =>
 list.indexOf(id) === index,
 )
 .slice(0, RECENT_LIMIT)
 : []
 } catch {
 return []
 }
}

function rememberTheme(style: ThemeStyle): ThemeStyle[] {
 const next = [
 style,
 ...readRecentThemes().filter((item) => item !== style),
 ].slice(0, RECENT_LIMIT)
 try {
 window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
 } catch {
 // Recent history is optional
 }
 return next
}

function recentThemeDefinitions(): ReturnType<typeof getThemeDefinition>[] {
 return readRecentThemes().map(getThemeDefinition)
}

export {
 RECENT_LIMIT,
 readRecentThemes,
 recentThemeDefinitions,
 rememberTheme,
}
