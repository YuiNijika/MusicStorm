import { useState } from "react"

import { ElasticSlider } from "@/components/ui/elastic-slider"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"

type SeekElasticSliderProps = {
    positionMs: number
    durationMs: number
    onSeek: (ms: number) => void
    disabled?: boolean
    className?: string
    showTime?: boolean
}

// 拖动只改 UI 预览，松手再 seek；本地原生引擎重解码 seek 很重，拖动中 thrash 会空 sink 误 ended
function SeekElasticSlider({
    positionMs,
    durationMs,
    onSeek,
    disabled = false,
    className,
    showTime = true,
}: SeekElasticSliderProps) {
    const total = durationMs > 0 ? durationMs : 1
    const external = Math.min(Math.max(0, positionMs), total)
    // 拖动中 displayMs 覆盖外部进度，松手清除让外部 tick 接管；避免 useEffect 二次同步
    const [dragMs, setDragMs] = useState<number | null>(null)
    const displayMs = dragMs ?? external

    return (
        <div className={cn("flex w-full min-w-0 items-center gap-2", className)}>
            {showTime ? (
                <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:w-10">
                    {formatDuration(displayMs)}
                </span>
            ) : null}
            <ElasticSlider
                fluid
                className="min-w-0 flex-1"
                value={displayMs}
                startingValue={0}
                maxValue={total}
                isStepped
                stepSize={100}
                disabled={disabled}
                showValue={false}
                aria-label="播放进度"
                onValueChange={(next) => {
                    setDragMs(next)
                }}
                onValueCommit={(next) => {
                    onSeek(next)
                    setDragMs(null)
                }}
            />
            {showTime ? (
                <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:w-10">
                    {formatDuration(durationMs > 0 ? durationMs : 0)}
                </span>
            ) : null}
        </div>
    )
}

export { SeekElasticSlider }
export type { SeekElasticSliderProps }
