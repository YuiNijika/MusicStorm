import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react"

import { cn } from "@/lib/utils"

import "./elastic-slider.css"

/** 弹性仅在轨道内部表现，不向外撑破布局 */
const MAX_SQUISH = 0.22

type ElasticSliderProps = {
    /** 受控值；不传则为非受控 */
    value?: number
    defaultValue?: number
    onValueChange?: (value: number) => void
    /** 拖拽结束时提交，适合 seek */
    onValueCommit?: (value: number) => void
    startingValue?: number
    maxValue?: number
    className?: string
    isStepped?: boolean
    stepSize?: number
    leftIcon?: ReactNode
    rightIcon?: ReactNode
    showValue?: boolean
    formatValue?: (value: number) => string
    disabled?: boolean
    /** 铺满父宽，进度条用 */
    fluid?: boolean
    /** 底栏紧凑音量 */
    compact?: boolean
    "aria-label"?: string
}

type Region = "left" | "middle" | "right"

/**
 * 轨道内压扁回弹，不向容器外溢出。
 */
function ElasticSlider({
    value: valueProp,
    defaultValue = 50,
    onValueChange,
    onValueCommit,
    startingValue = 0,
    maxValue = 100,
    className = "",
    isStepped = false,
    stepSize = 1,
    leftIcon,
    rightIcon,
    showValue = false,
    formatValue = (v) => String(Math.round(v)),
    disabled = false,
    fluid = false,
    compact = false,
    "aria-label": ariaLabel = "滑块",
}: ElasticSliderProps) {
    const isControlled = valueProp !== undefined
    const [uncontrolled, setUncontrolled] = useState(defaultValue)
    const [dragging, setDragging] = useState(false)
    const [dragValue, setDragValue] = useState(defaultValue)
    const [hovered, setHovered] = useState(false)
    const [region, setRegion] = useState<Region>("middle")
    /** 0–1 越界拉力，仅用于 scaleY 压扁 */
    const [pull, setPull] = useState(0)
    const [springing, setSpringing] = useState(false)

    const sliderRef = useRef<HTMLDivElement>(null)
    const draggingRef = useRef(false)
    const dragValueRef = useRef(defaultValue)

    const baseValue = isControlled ? valueProp : uncontrolled
    const value = dragging ? dragValue : baseValue

    useEffect(() => {
        if (!isControlled) {
            setUncontrolled(defaultValue)
        }
    }, [defaultValue, isControlled])

    const updatePullFromClientX = useCallback((clientX: number) => {
        const el = sliderRef.current
        if (!el) {
            return
        }
        const { left, right, width } = el.getBoundingClientRect()
        if (width <= 0) {
            setPull(0)
            setRegion("middle")
            return
        }
        let overflowRaw = 0
        let nextRegion: Region = "middle"
        if (clientX < left) {
            nextRegion = "left"
            overflowRaw = left - clientX
        } else if (clientX > right) {
            nextRegion = "right"
            overflowRaw = clientX - right
        }
        // 归一化到 0–1，sigmoid 衰减
        const entry = overflowRaw / Math.max(width * 0.35, 1)
        const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5)
        setRegion(nextRegion)
        setPull(Math.min(1, Math.max(0, sigmoid)))
    }, [])

    function resolveValueFromClientX(x: number): number {
        const el = sliderRef.current
        if (!el) {
            return value
        }
        const { left, width } = el.getBoundingClientRect()
        if (width <= 0) {
            return value
        }
        let next =
            startingValue + ((x - left) / width) * (maxValue - startingValue)
        if (isStepped && stepSize > 0) {
            next = Math.round(next / stepSize) * stepSize
        }
        return Math.min(Math.max(next, startingValue), maxValue)
    }

    function commitValue(next: number) {
        dragValueRef.current = next
        if (!isControlled) {
            setUncontrolled(next)
        }
        onValueChange?.(next)
    }

    function endDrag(commit: boolean) {
        if (disabled || !draggingRef.current) {
            return
        }
        draggingRef.current = false
        const next = dragValueRef.current
        setDragging(false)
        // pointerup / lostpointercapture 谁先到都要能提交，避免 seek 丢提交
        if (commit) {
            onValueCommit?.(next)
        }
        setSpringing(true)
        setPull(0)
        setRegion("middle")
    }

    function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
        if (disabled || e.buttons <= 0 || !sliderRef.current) {
            return
        }
        setSpringing(false)
        const next = resolveValueFromClientX(e.clientX)
        setDragValue(next)
        commitValue(next)
        updatePullFromClientX(e.clientX)
    }

    function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
        if (disabled) {
            return
        }
        setSpringing(false)
        draggingRef.current = true
        setDragging(true)
        const next = resolveValueFromClientX(e.clientX)
        setDragValue(next)
        commitValue(next)
        updatePullFromClientX(e.clientX)
        e.currentTarget.setPointerCapture(e.pointerId)
    }

    const rangePct = (() => {
        const total = maxValue - startingValue
        if (total === 0) {
            return 0
        }
        return ((value - startingValue) / total) * 100
    })()

    const baseH = compact ? 4 : 6
    const hoverH = compact ? 9 : 11
    const trackH = hovered || dragging ? hoverH : baseH
    // 越界时在轨道内部压扁，不 scaleX 外扩
    const scaleY = 1 - pull * MAX_SQUISH
    const transformOrigin =
        region === "left" ? "left center" : region === "right" ? "right center" : "center center"

    const trackStyle: CSSProperties = {
        height: trackH,
        transform: `scaleY(${scaleY})`,
        transformOrigin,
        transition: springing
            ? "transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1), height 160ms ease"
            : dragging
              ? "height 120ms ease"
              : "transform 140ms ease-out, height 160ms ease",
    }

    return (
        <div
            className={cn(
                "ms-elastic-slider",
                fluid && "ms-elastic-slider--fluid",
                compact && "ms-elastic-slider--compact",
                disabled && "ms-elastic-slider--disabled",
                className,
            )}
            role="group"
            aria-label={ariaLabel}
        >
            <div
                className="ms-elastic-slider__wrapper"
                style={{
                    opacity: hovered || dragging ? 1 : 0.82,
                    transition: "opacity 160ms ease",
                }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onTouchStart={() => setHovered(true)}
                onTouchEnd={() => setHovered(false)}
            >
                {leftIcon != null ? (
                    <div
                        className={cn(
                            "ms-elastic-slider__icon",
                            region === "left" && pull > 0.05 && "ms-elastic-slider__icon--pulse",
                        )}
                    >
                        {leftIcon}
                    </div>
                ) : null}

                <div
                    ref={sliderRef}
                    className="ms-elastic-slider__root"
                    role="slider"
                    tabIndex={disabled ? -1 : 0}
                    aria-valuemin={startingValue}
                    aria-valuemax={maxValue}
                    aria-valuenow={Math.round(value)}
                    aria-label={ariaLabel}
                    aria-disabled={disabled || undefined}
                    onPointerMove={handlePointerMove}
                    onPointerDown={handlePointerDown}
                    onPointerUp={() => endDrag(true)}
                    onPointerCancel={() => endDrag(true)}
                    // 与 pointerup 二选一触发；都走 commit，endDrag 幂等
                    onLostPointerCapture={() => endDrag(true)}
                    onKeyDown={(event) => {
                        if (disabled) {
                            return
                        }
                        const step = isStepped
                            ? stepSize
                            : (maxValue - startingValue) / 100
                        let next = value
                        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                            next = Math.min(maxValue, value + step)
                        } else if (
                            event.key === "ArrowLeft" ||
                            event.key === "ArrowDown"
                        ) {
                            next = Math.max(startingValue, value - step)
                        } else if (event.key === "Home") {
                            next = startingValue
                        } else if (event.key === "End") {
                            next = maxValue
                        } else {
                            return
                        }
                        event.preventDefault()
                        commitValue(next)
                        setDragValue(next)
                        onValueCommit?.(next)
                    }}
                >
                    <div className="ms-elastic-slider__track-clip">
                        <div
                            className="ms-elastic-slider__track-wrapper"
                            style={trackStyle}
                        >
                            <div className="ms-elastic-slider__track">
                                <div
                                    className="ms-elastic-slider__range"
                                    style={{ width: `${rangePct}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {rightIcon != null ? (
                    <div
                        className={cn(
                            "ms-elastic-slider__icon",
                            region === "right" && pull > 0.05 && "ms-elastic-slider__icon--pulse",
                        )}
                    >
                        {rightIcon}
                    </div>
                ) : null}
            </div>

            {showValue ? (
                <p className="ms-elastic-slider__value" aria-hidden>
                    {formatValue(value)}
                </p>
            ) : null}
        </div>
    )
}

export { ElasticSlider }
export type { ElasticSliderProps }