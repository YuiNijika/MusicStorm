import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { PLAYBACK_RATES } from "@/lib/player/playback-prefs"
import { cn } from "@/lib/utils"

type SpeedPopoverProps = {
    rate: number
    onSpeed: (rate: number) => void
    /** 播放条紧凑形态：文字胶囊，不占满格 */
    compact?: boolean
}

function formatRate(rate: number): string {
    return `${rate % 1 === 0 ? rate.toFixed(1) : rate}x`
}

function SpeedPopover({ rate, onSpeed, compact = false }: SpeedPopoverProps) {
    return (
        <Popover>
            <PopoverTrigger
                title="播放速度"
                aria-label="播放速度"
                className={cn(
                    "cursor-pointer tabular-nums text-muted-foreground",
                    "transition-[color,background-color,transform] hover:bg-[var(--surface-fill)] hover:text-foreground",
                    "active:scale-[0.96] active:duration-[var(--duration-press)]",
                    compact
                        ? "flex h-8 items-center rounded-full px-2.5 text-[11px] font-medium"
                        : "flex size-10 items-center justify-center rounded-full text-[12px] font-semibold",
                )}
            >
                {formatRate(rate)}
            </PopoverTrigger>
            <PopoverContent side="top" className="w-36 gap-1 p-1.5">
                {PLAYBACK_RATES.map((option) => (
                    <button
                        key={option}
                        type="button"
                        onClick={() => onSpeed(option)}
                        className={cn(
                            "w-full cursor-pointer rounded-lg px-2.5 py-2 text-left text-[12px] font-medium",
                            rate === option
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:bg-[var(--surface-fill)] hover:text-foreground",
                        )}
                    >
                        {formatRate(option)}
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    )
}

export { SpeedPopover }