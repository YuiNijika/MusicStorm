import { Volume1, Volume2, VolumeX } from "lucide-react"

import { ElasticSlider } from "@/components/ui/elastic-slider"
import { cn } from "@/lib/utils"

type VolumeElasticSliderProps = {
    /** 0–1 */
    volume: number
    muted?: boolean
    onVolume: (volume: number) => void
    onToggleMute?: () => void
    className?: string
    compact?: boolean
    fluid?: boolean
    showValue?: boolean
    /** 是否显示左右音量图标 */
    showIcons?: boolean
}

/**
 * 音量弹性滑条：内部 0–100 连续值，对外 0–1。
 * 静音时仍显示真实 volume，避免从 0 拖出时爆音。
 */
function VolumeElasticSlider({
    volume,
    muted = false,
    onVolume,
    onToggleMute,
    className,
    compact = false,
    fluid = false,
    showValue = !compact,
    showIcons = true,
}: VolumeElasticSliderProps) {
    const display = Math.min(100, Math.max(0, volume * 100))
    const iconMuted = muted || display <= 0.05

    return (
        <ElasticSlider
            className={cn(className)}
            value={display}
            startingValue={0}
            maxValue={100}
            compact={compact}
            fluid={fluid}
            showValue={showValue}
            formatValue={(v) => `${Math.round(v)}%`}
            aria-label="音量"
            leftIcon={
                showIcons ? (
                    <button
                        type="button"
                        className="flex cursor-pointer items-center justify-center text-inherit"
                        title={iconMuted ? "取消静音" : "静音"}
                        aria-label={iconMuted ? "取消静音" : "静音"}
                        onClick={(event) => {
                            event.stopPropagation()
                            onToggleMute?.()
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        {iconMuted ? (
                            <VolumeX />
                        ) : display < 40 ? (
                            <Volume1 />
                        ) : (
                            <Volume2 />
                        )}
                    </button>
                ) : undefined
            }
            rightIcon={showIcons && !compact ? <Volume2 /> : undefined}
            onValueChange={(next) => {
                onVolume(next / 100)
            }}
        />
    )
}

export { VolumeElasticSlider }
export type { VolumeElasticSliderProps }