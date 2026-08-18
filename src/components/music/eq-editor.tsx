import {
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from "react"

import { Switch } from "@/components/ui/switch"
import { usePlayer } from "@/hooks/use-player"
import {
    EQ_BAND_LABELS,
    GAIN_MAX,
    GAIN_MIN,
    allEqPresets,
    isBuiltInPresetId,
    isCustomActive,
    resolveEqGains,
    resolveEqGainsForTrack,
    resolveEqName,
    resolveEqNameForTrack,
    resolveEqPresetIdForTrack,
} from "@/lib/player/eq-prefs"
import { cn } from "@/lib/utils"

type EqEditorProps = {
    /** 全屏播放器等窄容器内更紧凑 */
    compact?: boolean
    /** 传入当前歌曲 id 时，按歌曲独立 EQ 开启后为这首歌单独选预设 */
    trackId?: string | null
}

// 竖直拖拽的频段滑块：0 在中线，向上增益、向下衰减
function VerticalEqSlider({
    label,
    value,
    height,
    disabled,
    onChange,
}: {
    label: string
    value: number
    height: number
    disabled: boolean
    onChange: (gain: number) => void
}) {
    const trackRef = useRef<HTMLDivElement>(null)

    function gainFromY(clientY: number): number {
        const rect = trackRef.current?.getBoundingClientRect()
        if (!rect || rect.height <= 0) {
            return value
        }
        const ratio = 1 - (clientY - rect.top) / rect.height
        const raw = GAIN_MIN + ratio * (GAIN_MAX - GAIN_MIN)
        return Math.round(Math.min(GAIN_MAX, Math.max(GAIN_MIN, raw)))
    }

    function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
        if (disabled) {
            return
        }
        onChange(gainFromY(event.clientY))
        event.currentTarget.setPointerCapture(event.pointerId)
    }

    function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
        if (disabled || event.buttons <= 0) {
            return
        }
        onChange(gainFromY(event.clientY))
    }

    // 0 恰在中线，+12 顶部、-12 底部
    const handleTop = ((GAIN_MAX - value) / (GAIN_MAX - GAIN_MIN)) * 100
    const zeroTop = ((GAIN_MAX - 0) / (GAIN_MAX - GAIN_MIN)) * 100
    const fillTop = Math.min(handleTop, zeroTop)
    const fillHeight = Math.abs(handleTop - zeroTop)

    return (
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span
                className={cn(
                    "text-[10px] tabular-nums",
                    value > 0 ? "text-foreground" : "text-muted-foreground",
                )}
            >
                {value > 0 ? `+${value}` : value}
            </span>
            <div
                ref={trackRef}
                role="slider"
                aria-label={`${label} 增益`}
                aria-valuemin={GAIN_MIN}
                aria-valuemax={GAIN_MAX}
                aria-valuenow={value}
                aria-disabled={disabled || undefined}
                tabIndex={disabled ? -1 : 0}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                className={cn(
                    "relative w-4 touch-none rounded-full",
                    disabled ? "cursor-default opacity-40" : "cursor-pointer",
                )}
                style={{ height }}
            >
                <div className="absolute inset-0 rounded-full bg-[var(--surface-fill)]" />
                <div
                    className="absolute inset-x-0 rounded-full bg-[var(--primary)]"
                    style={{
                        top: `${fillTop}%`,
                        height: `${fillHeight}%`,
                        opacity: 0.85,
                    }}
                />
                <div
                    className="absolute inset-x-0 bg-[var(--separator)]"
                    style={{ top: `${zeroTop}%`, height: 1 }}
                />
                <div
                    className="absolute left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--primary)] bg-background shadow-sm"
                    style={{ top: `${handleTop}%` }}
                />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">
                {label}
            </span>
        </div>
    )
}

function EqEditor({ compact = false, trackId = null }: EqEditorProps) {
    const {
        eq,
        setEqEnabled,
        applyEqPreset,
        setEqBandGain,
        saveEqPreset,
        saveEqPresetForTrack,
        renameEqPreset,
        deleteEqPreset,
        setPerTrackEqEnabled,
        setTrackEqPreset,
        clearTrackEqPreset,
    } = usePlayer()
    const presets = allEqPresets(eq)
    // 开启按歌曲独立且传入 trackId 时，编辑目标切到这首歌
    const perTrack = eq.perTrackEnabled && Boolean(trackId)
    const targetPresetId = perTrack
        ? resolveEqPresetIdForTrack(eq, trackId)
        : eq.presetId
    const activeGains = perTrack
        ? resolveEqGainsForTrack(eq, trackId)
        : resolveEqGains(eq)
    const activeName = perTrack
        ? resolveEqNameForTrack(eq, trackId)
        : resolveEqName(eq)
    // 当前作用目标是否自定义（全局看 eq.presetId，per-track 看该歌覆盖）
    const customActive = perTrack
        ? !isBuiltInPresetId(targetPresetId)
        : isCustomActive(eq)
    const hasOverride = perTrack && Boolean(trackId && eq.perTrackOverrides[trackId])

    // "none" 无命名输入；"new" 保存为新预设；对象态为正在重命名某自定义
    const [naming, setNaming] = useState<
        "none" | "new" | { id: string; name: string }
    >("none")
    const [nameValue, setNameValue] = useState("")

    const sliderHeight = compact ? 96 : 148

    function selectPreset(presetId: string) {
        if (perTrack && trackId) {
            setTrackEqPreset(trackId, presetId)
        } else {
            applyEqPreset(presetId)
        }
    }

    function beginNew() {
        setNameValue(activeName)
        setNaming("new")
    }

    function beginRename(id: string, name: string) {
        setNameValue(name)
        setNaming({ id, name })
    }

    function commitName() {
        const name = nameValue.trim()
        if (!name) {
            setNaming("none")
            return
        }
        if (naming === "new") {
            if (perTrack && trackId) {
                // 按歌曲保存：以当前歌曲线建新自定义并设为该歌覆盖
                saveEqPresetForTrack(trackId, name)
            } else {
                saveEqPreset(name)
            }
        } else if (naming !== "none") {
            renameEqPreset(naming.id, name)
        }
        setNaming("none")
    }

    function handleDelete() {
        const id = perTrack ? targetPresetId : eq.presetId
        if (id && !isBuiltInPresetId(id)) {
            deleteEqPreset(id)
        }
    }

    function resetFlat() {
        selectPreset("flat")
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[13px] font-medium tracking-[-0.01em]">
                        均衡器
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        10 段参数均衡，对所有音频生效
                    </p>
                </div>
                <Switch
                    checked={eq.enabled}
                    onCheckedChange={setEqEnabled}
                    aria-label="均衡器开关"
                />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-fill)] px-3 py-2">
                <div className="min-w-0">
                    <p className="text-[12px] font-medium">按歌曲独立 EQ</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        为不同歌曲指定不同预设，未指定的跟随全局
                    </p>
                </div>
                <Switch
                    checked={eq.perTrackEnabled}
                    onCheckedChange={setPerTrackEqEnabled}
                    aria-label="按歌曲独立 EQ 开关"
                />
            </div>

            {perTrack ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-fill)] px-3 py-2">
                    <p className="text-[12px] font-medium">当前歌曲</p>
                    <p className="text-[12px] text-muted-foreground">
                        {hasOverride ? activeName : `跟随全局 · ${activeName}`}
                    </p>
                    {hasOverride && trackId ? (
                        <button
                            type="button"
                            disabled={!eq.enabled}
                            onClick={() => clearTrackEqPreset(trackId)}
                            className="ml-auto h-7 cursor-pointer rounded-full px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-[var(--surface-fill-hover)] disabled:opacity-40"
                        >
                            跟随全局
                        </button>
                    ) : null}
                </div>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
                {presets.map((preset) => (
                    <button
                        key={preset.id}
                        type="button"
                        disabled={!eq.enabled}
                        onClick={() => selectPreset(preset.id)}
                        className={cn(
                            "h-7 cursor-pointer rounded-full px-3 text-[12px] font-medium transition-colors disabled:opacity-40",
                            targetPresetId === preset.id
                                ? "bg-foreground text-background"
                                : "bg-[var(--surface-fill)] text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {preset.name}
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {naming === "none" ? (
                    <>
                        <button
                            type="button"
                            disabled={!eq.enabled}
                            onClick={beginNew}
                            className="h-7 cursor-pointer rounded-full bg-[var(--surface-fill)] px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-[var(--surface-fill-hover)] disabled:opacity-40"
                        >
                            {perTrack ? "存为这首歌的预设" : "保存当前为预设"}
                        </button>
                        {customActive ? (
                            <>
                                <button
                                    type="button"
                                    disabled={!eq.enabled}
                                    onClick={() =>
                                        beginRename(targetPresetId, activeName)
                                    }
                                    className="h-7 cursor-pointer rounded-full px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-[var(--surface-fill)] disabled:opacity-40"
                                >
                                    重命名
                                </button>
                                <button
                                    type="button"
                                    disabled={!eq.enabled}
                                    onClick={handleDelete}
                                    className="h-7 cursor-pointer rounded-full px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-[var(--surface-fill)] hover:text-rose-600 disabled:opacity-40"
                                >
                                    删除
                                </button>
                            </>
                        ) : null}
                        <button
                            type="button"
                            disabled={!eq.enabled}
                            onClick={resetFlat}
                            className="ml-auto h-7 cursor-pointer rounded-full px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-[var(--surface-fill)] disabled:opacity-40"
                        >
                            重置
                        </button>
                    </>
                ) : (
                    <div className="flex w-full items-center gap-2">
                        <input
                            autoFocus
                            value={nameValue}
                            onChange={(event) => setNameValue(event.currentTarget.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault()
                                    commitName()
                                } else if (event.key === "Escape") {
                                    setNaming("none")
                                }
                            }}
                            placeholder="预设名称"
                            maxLength={20}
                            className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--separator)] bg-[var(--surface-fill)] px-3 text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
                        />
                        <button
                            type="button"
                            onClick={commitName}
                            className="h-8 cursor-pointer rounded-full bg-foreground px-3.5 text-[12px] font-medium text-background"
                        >
                            保存
                        </button>
                        <button
                            type="button"
                            onClick={() => setNaming("none")}
                            className="h-8 cursor-pointer rounded-full px-3 text-[12px] font-medium text-muted-foreground hover:bg-[var(--surface-fill)]"
                        >
                            取消
                        </button>
                    </div>
                )}
            </div>

            <div className="flex items-end justify-between gap-1 pt-1">
                {EQ_BAND_LABELS.map((label, index) => (
                    <VerticalEqSlider
                        key={label}
                        label={label}
                        value={activeGains[index] ?? 0}
                        height={sliderHeight}
                        disabled={!eq.enabled}
                        onChange={(gain) => setEqBandGain(index, gain, trackId)}
                    />
                ))}
            </div>
        </div>
    )
}

export { EqEditor }
