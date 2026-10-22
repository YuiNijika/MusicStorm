import { useEffect, useRef, useState } from "react"
import { Upload, X } from "lucide-react"
import "@fontsource-variable/geist"

import { useTheme } from "@/components/app/theme-provider"
import {
 FONT_PRESETS,
 sanitizeFamily,
 sanitizeFontUrl,
} from "@/lib/appearance/font-prefs"
import { notifyError, notifySuccess } from "@/lib/notify"
import {
 ActionButton,
 SwitchRow,
} from "@/pages/settings/settings-ui"

const MAX_FONT_BYTES = 3 * 1024 * 1024

function FontSettings() {
 const { fontPrefs, setFontPrefs } = useTheme()
 const [draftFamily, setDraftFamily] = useState(fontPrefs.customFamily)
 const inputRef = useRef<HTMLInputElement>(null)

 useEffect(() => {
 setDraftFamily(fontPrefs.customFamily)
 }, [fontPrefs.customFamily])

 function commitFamily() {
 const family = sanitizeFamily(draftFamily)
 if (family === fontPrefs.customFamily) {
 return
 }
 setFontPrefs({
 ...fontPrefs,
 customFamily: family,
 followThemeFont: family.length ===0,
 })
 notifySuccess(family ? "已启用自定义字体" : "已恢复主题字体", {
 description: family
 ? "仅在本机生效"
 : "新主题会继续切换字体",
 })
 }

 async function handlePickFont(file: File | undefined) {
 if (!file) {
 return
 }
 if (file.size > MAX_FONT_BYTES) {
 notifyError("字体文件过大", {
 description: "请选择不超过3 MB的字体",
 })
 return
 }
 try {
 const dataUrl = await readAsDataUrl(file)
 const fallbackFamily = file.name.replace(/\.[^.]+$/, "")
 const draft = sanitizeFamily(draftFamily)
 const family = draft && !draft.includes(",")
 ? draft
 : sanitizeFamily(fallbackFamily) || "MusicStorm Custom"
 setDraftFamily(family)
 setFontPrefs({
 customFamily: family,
 fontUrl: dataUrl,
 followThemeFont: false,
 })
 notifySuccess("字体已载入", { description: family })
 } catch {
 notifyError("字体载入失败", {
 description: "请换一个字体文件重试",
 })
 }
 }

 function handleClearFont() {
 setDraftFamily("")
 setFontPrefs({
 customFamily: "",
 fontUrl: "",
 followThemeFont: true,
 })
 if (inputRef.current) {
 inputRef.current.value = ""
 }
 notifySuccess("已恢复主题字体")
 }

 const hasCustom = Boolean(fontPrefs.customFamily)
 const canFollowTheme = hasCustom
 const activePreset =
 fontPrefs.customFamily.length >0
 ? FONT_PRESETS.find(
 (preset) =>
 preset.family.length >0 &&
 preset.family === fontPrefs.customFamily,
 )?.id ?? "custom"
 : "theme"

 function handlePreset(id: (typeof FONT_PRESETS)[number]["id"]) {
 const preset = FONT_PRESETS.find((item) => item.id === id)
 if (!preset) {
 return
 }
 setDraftFamily(preset.family)
 setFontPrefs({
 customFamily: preset.family,
 fontUrl: preset.fontUrl ?? "",
 followThemeFont: preset.family.length ===0,
 })
 notifySuccess(`已切换到${preset.label}`, {
 description: preset.description,
 })
 }

 return (
 <div className="min-w-0 space-y-3">
 <div className="flex flex-wrap gap-2" role="group" aria-label="内置字体">
 {FONT_PRESETS.map((preset) => (
 <button
 key={preset.id}
 type="button"
 aria-pressed={activePreset === preset.id}
 title={preset.description}
 onClick={() => handlePreset(preset.id)}
 className={
 activePreset === preset.id
 ? "min-h-11 cursor-pointer rounded-xl border border-primary bg-[var(--surface-fill-hover)] px-3 py-2 text-[13px] font-medium text-foreground"
 : "min-h-11 cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--surface-fill)] px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-[var(--surface-fill-hover)] hover:text-foreground"
 }
 style={{
 fontFamily: preset.family || undefined,
 }}
 >
 {preset.label}
 </button>
 ))}
 </div>
 <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
 <label className="min-w-0 space-y-1.5">
 <span className="text-[13px] font-medium text-muted-foreground">
自定义字体
 </span>
 <input
 value={draftFamily}
 name="font-family"
 onChange={(event) => setDraftFamily(event.currentTarget.value)}
 onBlur={commitFamily}
 onKeyDown={(event) => {
 if (event.key === "Enter") {
 event.currentTarget.blur()
 }
 }}
 placeholder="例如 HarmonyOS Sans SC…"
 autoComplete="off"
 spellCheck={false}
 className="material-field h-10 w-full min-w-0 rounded-xl px-3 text-[13px] outline-none focus-visible:outline-2 focus-visible:outline-ring"
 />
 </label>
 <div className="flex min-w-0 flex-wrap items-end gap-2">
 <ActionButton
 variant="primary"
 className="min-h-11"
 icon={<Upload aria-hidden="true" className="size-3.5" />}
 onClick={() => inputRef.current?.click()}
 >
导入字体
 </ActionButton>
 {hasCustom ? (
 <ActionButton
 variant="danger"
 className="min-h-11"
 icon={<X aria-hidden="true" className="size-3.5" />}
 onClick={handleClearFont}
 >
清除
 </ActionButton>
 ) : null}
 </div>
 </div>
 <input
 ref={inputRef}
 type="file"
 name="custom-font"
 tabIndex={-1}
 accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
 className="sr-only"
 aria-label="选择字体文件"
 onChange={(event) => {
 void handlePickFont(event.currentTarget.files?.[0])
 event.currentTarget.value = ""
 }}
 />
 <SwitchRow
 title="跟随主题切换字体"
 description={
 canFollowTheme
 ? fontPrefs.followThemeFont
 ? "更换主题时切换到该主题的字体"
 : "保留当前字体，不随主题变化"
 : "选择内置字体或自定义字体后可设置"
 }
 checked={canFollowTheme ? fontPrefs.followThemeFont : true}
 disabled={!canFollowTheme}
 onCheckedChange={(checked) =>
 setFontPrefs({
 ...fontPrefs,
 followThemeFont: checked,
 })
 }
 />
 <p className="text-[12px] leading-relaxed text-muted-foreground">
 {fontPrefs.fontUrl
 ? "字体文件仅保存在本机"
 : fontPrefs.customFamily
 ? "使用所选字体"
 : "当前使用所选主题的字体"}
 </p>
 </div>
 )
}

function readAsDataUrl(file: File): Promise<string> {
 return new Promise((resolve, reject) => {
 const reader = new FileReader()
 reader.onload = () => {
 const value = reader.result
 if (typeof value === "string" && sanitizeFontUrl(value)) {
 resolve(value)
 } else {
 reject(new Error("invalid font data"))
 }
 }
 reader.onerror = () => reject(reader.error ?? new Error("font read"))
 reader.readAsDataURL(file)
 })
}

export { FontSettings }
