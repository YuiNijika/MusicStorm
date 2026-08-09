import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import {
    motion,
    useAnimationFrame,
    useMotionValue,
    useReducedMotion,
    useTransform,
} from "motion/react"

import "./shiny-text.css"

interface ShinyTextProps {
    text: string
    disabled?: boolean
    speed?: number
    className?: string
    color?: string
    shineColor?: string
    spread?: number
    yoyo?: boolean
    pauseOnHover?: boolean
    direction?: "left" | "right"
    delay?: number
}

function ShinyText({
    text,
    disabled = false,
    speed = 2,
    className = "",
    color = "#b5b5b5",
    shineColor = "#ffffff",
    spread = 120,
    yoyo = false,
    pauseOnHover = false,
    direction = "left",
    delay = 0,
}: ShinyTextProps) {
    const [isPaused, setIsPaused] = useState(false)
    const progress = useMotionValue(0)
    const elapsedRef = useRef(0)
    const lastTimeRef = useRef<number | null>(null)
    const directionRef = useRef(direction === "left" ? 1 : -1)

    // 减少动态偏好：扫光停在画外，文字保持基色静止
    const shouldReduceMotion = useReducedMotion()

    const animationDuration = speed * 1000
    const delayDuration = delay * 1000

    useAnimationFrame((time) => {
        if (disabled || isPaused || shouldReduceMotion) {
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
            const cycleDuration = animationDuration + delayDuration
            const fullCycle = cycleDuration * 2
            const cycleTime = elapsedRef.current % fullCycle

            if (cycleTime < animationDuration) {
                const p = (cycleTime / animationDuration) * 100
                progress.set(directionRef.current === 1 ? p : 100 - p)
            } else if (cycleTime < cycleDuration) {
                progress.set(directionRef.current === 1 ? 100 : 0)
            } else if (cycleTime < cycleDuration + animationDuration) {
                const reverseTime = cycleTime - cycleDuration
                const p = 100 - (reverseTime / animationDuration) * 100
                progress.set(directionRef.current === 1 ? p : 100 - p)
            } else {
                progress.set(directionRef.current === 1 ? 0 : 100)
            }
        } else {
            const cycleDuration = animationDuration + delayDuration
            const cycleTime = elapsedRef.current % cycleDuration

            if (cycleTime < animationDuration) {
                const p = (cycleTime / animationDuration) * 100
                progress.set(directionRef.current === 1 ? p : 100 - p)
            } else {
                progress.set(directionRef.current === 1 ? 100 : 0)
            }
        }
    })

    useEffect(() => {
        directionRef.current = direction === "left" ? 1 : -1
        elapsedRef.current = 0
        progress.set(0)
    }, [direction, progress])

    // p=0 扫光在右侧画外，p=100 在左侧画外
    const backgroundPosition = useTransform(progress, (p) => `${150 - p * 2}% center`)

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

    const gradientStyle: CSSProperties = {
        backgroundImage: `linear-gradient(${spread}deg, ${color} 0%, ${color} 35%, ${shineColor} 50%, ${color} 65%, ${color} 100%)`,
        backgroundSize: "200% auto",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
    }

    return (
        <motion.span
            className={`shiny-text ${className}`}
            style={{ ...gradientStyle, backgroundPosition }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {text}
        </motion.span>
    )
}

export { ShinyText }
export type { ShinyTextProps }
