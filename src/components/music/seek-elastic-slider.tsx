import { useEffect, useRef, useState } from "react"

import { ElasticSlider } from "@/components/ui/elastic-slider"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"

type SeekElasticSliderProps = {
    positionMs: number
    durationMs: number
    onSeek: (ms: number) => void
    disabled?: boolean
    className?: string
    /** 两侧时间文案（默认开启） */
    showTime?: boolean
}

const SEEK_THROTTLE_MS = 64

/**
 * 播放进度：拖动中节流 seek + 松手精确 seek；左侧时间跟 displayMs
 */
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
    const draggingRef = useRef(false)
    const [displayMs, setDisplayMs] = useState(external)
    const lastSeekAtRef = useRef(0)
    const pendingSeekRef = useRef<number | null>(null)
    const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!draggingRef.current) {
            setDisplayMs(external)
        }
    }, [external])

    useEffect(() => {
        return () => {
            if (seekTimerRef.current) {
                clearTimeout(seekTimerRef.current)
            }
        }
    }, [])

    function flushSeek(ms: number) {
        lastSeekAtRef.current = Date.now()
        pendingSeekRef.current = null
        onSeek(ms)
    }

    function scheduleSeek(ms: number) {
        const now = Date.now()
        const elapsed = now - lastSeekAtRef.current
        if (elapsed >= SEEK_THROTTLE_MS) {
            flushSeek(ms)
            return
        }
        pendingSeekRef.current = ms
        if (seekTimerRef.current) {
            return
        }
        seekTimerRef.current = setTimeout(() => {
            seekTimerRef.current = null
            const pending = pendingSeekRef.current
            if (pending != null) {
                flushSeek(pending)
            }
        }, SEEK_THROTTLE_MS - elapsed)
    }

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
                    draggingRef.current = true
                    setDisplayMs(next)
                    scheduleSeek(next)
                }}
                onValueCommit={(next) => {
                    if (seekTimerRef.current) {
                        clearTimeout(seekTimerRef.current)
                        seekTimerRef.current = null
                    }
                    setDisplayMs(next)
                    flushSeek(next)
                    draggingRef.current = false
                }}
            />
            {showTime ? (
                <span className="w-9 shrink-0 text-[11px] tabular-nums text-muted-foreground sm:w-10">
                    {formatDuration(durationMs > 0 ? durationMs : 0)}
                </span>
            ) : null}
        </div>
    )
}

export { SeekElasticSlider }
export type { SeekElasticSliderProps }