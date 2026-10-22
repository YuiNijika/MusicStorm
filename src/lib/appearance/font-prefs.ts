const STORAGE_KEY = "musicstorm-font"
const STYLE_ID = "musicstorm-custom-font"

type FontPresetId =
 | "theme"
 | "pingfang"
 | "geist"
 | "system"
 | "serif"
 | "mono"
 | "rounded"

type FontPreset = {
 id: FontPresetId
 label: string
 description: string
 family: string
 fontUrl?: string
}

type FontPrefs = {
 customFamily: string
 fontUrl: string
 followThemeFont: boolean
}

const FONT_PRESETS: FontPreset[] = [
 {
 id: "theme",
 label: "跟随主题",
 description: "跟随当前主题自带的字体",
 family: "",
 },
 {
 id: "pingfang",
 label: "苹方",
 description: "MusicStorm 内置的中文界面字体",
 family: "MusicStorm PingFang",
 fontUrl: "/fonts/PingFang-Medium-SC.ttf",
 },
 {
 id: "geist",
 label: "Geist",
 description: "清晰、紧凑的现代无衬线字体",
 family: '"Geist Variable", "Geist"',
 },
 {
 id: "system",
 label: "系统",
 description: "使用当前系统的默认界面字体",
 family:
 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei"',
 },
 {
 id: "serif",
 label: "衬线",
 description: "适合歌词与长时间阅读",
 family:
 '"Source Han Serif SC", "Songti SC", "SimSun", Georgia, serif',
 },
 {
 id: "mono",
 label: "等宽",
 description: "数字与代码感更强的字体",
 family:
 '"SFMono-Regular", "Cascadia Code", "JetBrains Mono", Consolas, monospace',
 },
 {
 id: "rounded",
 label: "圆体",
 description: "柔和、轻松的圆角字形",
 family:
 '"Nunito", "Quicksand", "PingFang SC", "Microsoft YaHei", sans-serif',
 },
]

const DEFAULT_FONT_PREFS: FontPrefs = {
 customFamily: "MusicStorm PingFang",
 fontUrl: "/fonts/PingFang-Medium-SC.ttf",
 followThemeFont: false,
}

function sanitizeFamily(value: string): string {
 const compact = value.replace(/\s+/g, " ").trim()
 if (compact.includes(",")) {
 return compact.replace(/[;{}`\\]/g, "").slice(0,240)
 }
 return compact.replace(/["'`{};\\]/g, "").slice(0,100)
}

function sanitizeFontUrl(value: string): string {
 const trimmed = value.trim()
 if (!trimmed) {
 return ""
 }
 if (/^data:font\//i.test(trimmed)) {
 return trimmed
 }
 if (/^\/fonts\/[A-Za-z0-9._/-]+$/.test(trimmed)) {
 return trimmed
 }
 try {
 const url = new URL(trimmed)
 return url.protocol === "https:" ? url.toString() : ""
 } catch {
 return ""
 }
}

function readFontPrefs(): FontPrefs {
 if (typeof window === "undefined") {
 return DEFAULT_FONT_PREFS
 }
 try {
 const raw = window.localStorage.getItem(STORAGE_KEY)
 if (!raw) {
 return DEFAULT_FONT_PREFS
 }
 const data = JSON.parse(raw) as Partial<FontPrefs>
 const customFamily =
 typeof data.customFamily === "string"
 ? sanitizeFamily(data.customFamily)
 : ""
 return {
 customFamily,
 fontUrl:
 typeof data.fontUrl === "string"
 ? sanitizeFontUrl(data.fontUrl)
 : "",
 followThemeFont:
 customFamily.length ===0
 ? true
 : typeof data.followThemeFont === "boolean"
 ? data.followThemeFont
 : false,
 }
 } catch {
 return DEFAULT_FONT_PREFS
 }
}

function writeFontPrefs(prefs: FontPrefs): FontPrefs {
 const customFamily = sanitizeFamily(prefs.customFamily)
 const next: FontPrefs = {
 customFamily,
 fontUrl: sanitizeFontUrl(prefs.fontUrl),
 followThemeFont:
 customFamily.length ===0 ? true : prefs.followThemeFont,
 }
 try {
 window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
 } catch {
 // Keep the current session usable when storage is unavailable
 }
 return next
}

function resolveFontFamily(
 prefs: FontPrefs,
 themeFontFamily: string,
): string {
 if (!prefs.customFamily || prefs.followThemeFont) {
 return themeFontFamily
 }
 const family = sanitizeFamily(prefs.customFamily)
 return `${family}, ${themeFontFamily}`
}

function applyFontToDom(input: {
 prefs: FontPrefs
 themeFontFamily: string
}): void {
 const root = document.documentElement
 const family = resolveFontFamily(input.prefs, input.themeFontFamily)
 root.style.setProperty("--font-sans", family)

 const customFamily = sanitizeFamily(input.prefs.customFamily)
 const fontUrl = sanitizeFontUrl(input.prefs.fontUrl)
 const existing = document.getElementById(STYLE_ID)
 if (!customFamily || !fontUrl || customFamily.includes(",")) {
 existing?.remove()
 return
 }

 const style =
 existing instanceof HTMLStyleElement
 ? existing
 : document.createElement("style")
 style.id = STYLE_ID
 style.textContent = `@font-face{font-family:"${customFamily}";src:url("${fontUrl.replace(/["\\\n\r]/g, "")}");font-display:swap}`
 if (!style.isConnected) {
 document.head.appendChild(style)
 }
}

export {
 DEFAULT_FONT_PREFS,
 FONT_PRESETS,
 applyFontToDom,
 readFontPrefs,
 resolveFontFamily,
 sanitizeFamily,
 sanitizeFontUrl,
 writeFontPrefs,
}
export type { FontPrefs, FontPreset, FontPresetId }
