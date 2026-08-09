import { useEffect, useMemo, useRef, useState } from "react"
import type { ElementType } from "react"
import { motion, useReducedMotion } from "motion/react"
import type { Transition } from "motion/react"

interface BlurTextProps {
    text?: string
    delay?: number
    className?: string
    animateBy?: "words" | "letters"
    direction?: "top" | "bottom"
    threshold?: number
    rootMargin?: string
    animationFrom?: Record<string, string | number>
    animationTo?: Array<Record<string, string | number>>
    easing?: (t: number) => number
    onAnimationComplete?: () => void
    stepDuration?: number
    /** 官方只渲染 p，标题场景需要 h1~h6 语义标签 */
    tag?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span"
}

function buildKeyframes(
    from: Record<string, string | number>,
    steps: Array<Record<string, string | number>>,
): Record<string, Array<string | number>> {
    const keys = new Set<string>([
        ...Object.keys(from),
        ...steps.flatMap((s) => Object.keys(s)),
    ])

    const keyframes: Record<string, Array<string | number>> = {}
    keys.forEach((k) => {
        keyframes[k] = [from[k]!, ...steps.map((s) => s[k]!)]
    })
    return keyframes
}

function BlurText({
    text = "",
    delay = 200,
    className = "",
    animateBy = "words",
    direction = "top",
    threshold = 0.1,
    rootMargin = "0px",
    animationFrom,
    animationTo,
    easing = (t: number) => t,
    onAnimationComplete,
    stepDuration = 0.35,
    tag = "p",
}: BlurTextProps) {
    const elements = animateBy === "words" ? text.split(" ") : text.split("")
    const [inView, setInView] = useState(false)
    const ref = useRef<HTMLElement>(null)

    const shouldReduceMotion = useReducedMotion()

    useEffect(() => {
        const el = ref.current
        if (!el) {
            return
        }
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) {
                    setInView(true)
                    observer.unobserve(el)
                }
            },
            { threshold, rootMargin },
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [threshold, rootMargin])

    const defaultFrom = useMemo(
        () =>
            direction === "top"
                ? { filter: "blur(10px)", opacity: 0, y: -50 }
                : { filter: "blur(10px)", opacity: 0, y: 50 },
        [direction],
    )

    const defaultTo = useMemo(
        () => [
            {
                filter: "blur(5px)",
                opacity: 0.5,
                y: direction === "top" ? 5 : -5,
            },
            { filter: "blur(0px)", opacity: 1, y: 0 },
        ],
        [direction],
    )

    const fromSnapshot = animationFrom ?? defaultFrom
    const toSnapshots = animationTo ?? defaultTo
    // 减少动态偏好：直接呈现终态，不做模糊浮入
    const finalSnapshot = toSnapshots[toSnapshots.length - 1]!

    const stepCount = toSnapshots.length + 1
    const totalDuration = stepDuration * (stepCount - 1)
    const times = Array.from({ length: stepCount }, (_, i) =>
        stepCount === 1 ? 0 : i / (stepCount - 1),
    )

    const Tag = tag as ElementType

    return (
        <Tag ref={ref} className={className} style={{ display: "flex", flexWrap: "wrap" }}>
            {elements.map((segment, index) => {
                const animateKeyframes = buildKeyframes(fromSnapshot, toSnapshots)

                const spanTransition: Transition = shouldReduceMotion
                    ? { duration: 0 }
                    : {
                          duration: totalDuration,
                          times,
                          delay: (index * delay) / 1000,
                          ease: easing,
                      }

                return (
                    <motion.span
                        key={`${segment}-${index}`}
                        initial={shouldReduceMotion ? finalSnapshot : fromSnapshot}
                        animate={
                            shouldReduceMotion
                                ? finalSnapshot
                                : inView
                                  ? animateKeyframes
                                  : fromSnapshot
                        }
                        transition={spanTransition}
                        onAnimationComplete={
                            index === elements.length - 1
                                ? onAnimationComplete
                                : undefined
                        }
                        style={{
                            display: "inline-block",
                            willChange: "transform, filter, opacity",
                        }}
                    >
                        {segment === " " ? " " : segment}
                        {animateBy === "words" && index < elements.length - 1
                            ? " "
                            : ""}
                    </motion.span>
                )
            })}
        </Tag>
    )
}

export { BlurText }
export type { BlurTextProps }
