import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import {
    motion,
    useAnimationFrame,
    useMotionValue,
    useReducedMotion,
    useTransform,
} from "motion/react"

import "./gradient-text.css"

interface GradientTextProps {
    children: ReactNode
    className?: string
    colors?: string[]
    animationSpeed?: number
    showBorder?: boolean
    direction?: "horizontal" | "vertical" | "diagonal"
    pauseOnHover?: boolean
    yoyo?: boolean
}

function GradientText({
    children,
    className = "",
    colors = ["#5227FF", "#FF9FFC", "#B497CF"],
    animationSpeed = 8,
    showBorder = false,
    direction = "horizontal",
    pauseOnHover = false,
    yoyo = true,
}: GradientTextProps) {
    const [isPaused, setIsPaused] = useState(false)
    const progress = useMotionValue(0)
    const elapsedRef = useRef(0)
    const lastTimeRef = useRef<number | null>(null)

    const animationDuration = animationSpeed * 1000

    // 减少动态偏好：渐变静止在初始位置，仅保留配色不动
    const shouldReduceMotion = useReducedMotion()

    useAnimationFrame((time) => {
        if (isPaused || shouldReduceMotion) {
            lastTimeRef.current = null
            return
        }

        if (lastTimeRef.current === null) {
            lastTimeRef.current = time
            return
        }

        const deltaTime = time - lastTimeRef.current
        lastTimeRef.current = time
        elapsedRef.current += deltaTime

        if (yoyo) {
            const fullCycle = animationDuration * 2
            const cycleTime = elapsedRef.current % fullCycle

            if (cycleTime < animationDuration) {
                progress.set((cycleTime / animationDuration) * 100)
            } else {
                progress.set(
                    100 - ((cycleTime - animationDuration) / animationDuration) * 100,
                )
            }
        } else {
            // 首尾同色保证循环处无接缝
            progress.set((elapsedRef.current / animationDuration) * 100)
        }
    })

    useEffect(() => {
        elapsedRef.current = 0
        progress.set(0)
    }, [animationSpeed, yoyo, progress])

    const backgroundPosition = useTransform(progress, (p) => {
        if (direction === "vertical") {
            return `50% ${p}%`
        }
        // diagonal 也只走水平，避免双向移动产生干涉纹
        return `${p}% 50%`
    })

    const handleMouseEnter = useCallback(() => {
        if (pauseOnHover) {
            setIsPaused(true)
        }
    }, [pauseOnHover])

    const handleMouseLeave = useCallback(() => {
        if (pauseOnHover) {
            setIsPaused(false)
        }
    }, [pauseOnHover])

    const gradientAngle =
        direction === "horizontal"
            ? "to right"
            : direction === "vertical"
              ? "to bottom"
              : "to bottom right"
    const gradientColors = [...colors, colors[0]].join(", ")

    const gradientStyle = {
        backgroundImage: `linear-gradient(${gradientAngle}, ${gradientColors})`,
        backgroundSize:
            direction === "horizontal"
                ? "300% 100%"
                : direction === "vertical"
                  ? "100% 300%"
                  : "300% 300%",
        backgroundRepeat: "repeat",
    } as const

    return (
        <motion.div
            className={`animated-gradient-text ${showBorder ? "with-border" : ""} ${className}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {showBorder ? (
                <motion.div
                    className="gradient-overlay"
                    style={{ ...gradientStyle, backgroundPosition }}
                />
            ) : null}
            <motion.div
                className="text-content"
                style={{ ...gradientStyle, backgroundPosition }}
            >
                {children}
            </motion.div>
        </motion.div>
    )
}

export { GradientText }
export type { GradientTextProps }
