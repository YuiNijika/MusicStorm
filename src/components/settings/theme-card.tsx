import type {
 ResolvedThemeMode,
 ThemeDefinition,
} from "@/lib/theme/types"
import { cn } from "@/lib/utils"

type ThemeCardProps = {
 theme: ThemeDefinition
 mode: ResolvedThemeMode
 active: boolean
 compact?: boolean
 onSelect: () => void
}

function ThemeCard({
 theme,
 mode,
 active,
 compact = false,
 onSelect,
}: ThemeCardProps) {
 const palette = mode === "dark" ? theme.dark : theme.light
 const square = theme.id === "minecraft" || theme.id === "windows"
 return (
 <button
 type="button"
 aria-pressed={active}
 onClick={onSelect}
 className={cn(
 "group flex min-w-0 cursor-pointer flex-col overflow-hidden border p-3 text-left transition-[border-color,background-color,transform]",
 "active:scale-[0.985] active:duration-[var(--duration-press)]",
                "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
 active
 ? "border-primary bg-[var(--surface-fill-hover)]"
 : "border-[var(--border)] bg-[var(--surface-fill)] hover:bg-[var(--surface-fill-hover)]",
 compact ? "min-h-32 rounded-2xl" : "min-h-40 rounded-[18px]",
 )}
 >
 <div
 className="relative mb-3 overflow-hidden ring-1 ring-black/10 dark:ring-white/10"
 style={{
 height: compact ?48 :68,
 borderRadius: square ?4 :10,
 background: palette.background,
 }}
 >
 <span
 className="absolute left-2 top-2 h-[calc(100%-16px)] w-[46%]"
 style={{
 borderRadius: square ?3 :7,
 background: palette.card,
 border: `1px solid ${palette.border}`,
 boxShadow:
 palette.shadowCard,
 }}
 />
 <span
 className="absolute right-2 top-2 h-2.5 w-[32%] rounded-full"
 style={{ background: palette.mutedForeground, opacity:0.38 }}
 />
 <span
 className="absolute right-2 top-7 h-1.5 w-[24%] rounded-full"
 style={{ background: palette.mutedForeground, opacity:0.22 }}
 />
 <span
 className="absolute bottom-2 right-2 size-7"
 style={{
 borderRadius: square ?2 :999,
 background: palette.primary,
 }}
 />
 <span
 className="absolute bottom-3 right-4 h-1 w-[18%] rounded-full"
 style={{ background: palette.primaryForeground, opacity:0.9 }}
 />
 </div>
 <div className="flex min-w-0 items-center justify-between gap-2">
 <span className="truncate text-[14px] font-semibold">
 {theme.label}
 </span>
 {active ? (
 <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
使用中
 </span>
 ) : null}
 </div>
 <p
 className={cn(
 "mt-1 text-[12px] leading-snug text-muted-foreground",
 compact ? "line-clamp-2" : "line-clamp-3",
 )}
 >
 {theme.description}
 </p>
 </button>
 )
}

export { ThemeCard }
