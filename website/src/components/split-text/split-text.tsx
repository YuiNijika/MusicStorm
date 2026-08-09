import { useEffect, useRef, useState } from "react"
import type { CSSProperties, ElementType } from "react"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { SplitText as GsapSplitText } from "gsap/SplitText"
import { useGSAP } from "@gsap/react"

gsap.registerPlugin(ScrollTrigger, GsapSplitText, useGSAP)

interface SplitTextProps {
    text: string
    className?: string
    delay?: number
    duration?: number
    ease?: string | ((t: number) => number)
    splitType?: "chars" | "words" | "lines" | "words, chars"
    from?: gsap.TweenVars
    to?: gsap.TweenVars
    threshold?: number
    rootMargin?: string
    tag?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span"
    textAlign?: CSSProperties["textAlign"]
    onLetterAnimationComplete?: () => void
}

function SplitText({
    text,
    className = "",
    delay = 50,
    duration = 1.25,
    ease = "power3.out",
    splitType = "chars",
    from = { opacity: 0, y: 40 },
    to = { opacity: 1, y: 0 },
    threshold = 0.1,
    rootMargin = "-100px",
    textAlign = "center",
    tag = "p",
    onLetterAnimationComplete,
}: SplitTextProps) {
    const ref = useRef<HTMLParagraphElement>(null)
    const animationCompletedRef = useRef(false)
    const onCompleteRef = useRef(onLetterAnimationComplete)
    const [fontsLoaded, setFontsLoaded] = useState(false)

    useEffect(() => {
        onCompleteRef.current = onLetterAnimationComplete
    }, [onLetterAnimationComplete])

    // 等字体就绪再切分，避免按未加载字体的字形量宽导致断行错位
    useEffect(() => {
        if (document.fonts.status === "loaded") {
            setFontsLoaded(true)
        } else {
            document.fonts.ready.then(() => setFontsLoaded(true))
        }
    }, [])

    useGSAP(
        () => {
            if (!ref.current || !text || !fontsLoaded) {
                return
            }
            if (animationCompletedRef.current) {
                return
            }

            const el = ref.current as HTMLElement & {
                _rbsplitInstance?: GsapSplitText
            }

            if (el._rbsplitInstance) {
                try {
                    el._rbsplitInstance.revert()
                } catch {
                    // revert 已销毁实例会抛错，吞掉即可
                }
                el._rbsplitInstance = undefined
            }

            const startPct = (1 - threshold) * 100
            const marginMatch = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)?$/.exec(rootMargin)
            const marginValue = marginMatch ? parseFloat(marginMatch[1]!) : 0
            const marginUnit = marginMatch ? marginMatch[2] || "px" : "px"
            const sign =
                marginValue === 0
                    ? ""
                    : marginValue < 0
                      ? `-=${Math.abs(marginValue)}${marginUnit}`
                      : `+=${marginValue}${marginUnit}`
            const start = `top ${startPct}%${sign}`

            // 减少动态偏好：拆分后直接落到终态，不做逐字动画
            const reduceMotion = window.matchMedia(
                "(prefers-reduced-motion: reduce)",
            ).matches

            let targets: Element[] = []
            const assignTargets = (self: GsapSplitText) => {
                if (splitType.includes("chars") && self.chars.length) {
                    targets = self.chars
                }
                if (!targets.length && splitType.includes("words") && self.words.length) {
                    targets = self.words
                }
                if (!targets.length && splitType.includes("lines") && self.lines.length) {
                    targets = self.lines
                }
                if (!targets.length) {
                    targets = self.chars || self.words || self.lines
                }
            }
            const splitInstance = new GsapSplitText(el, {
                type: splitType,
                smartWrap: true,
                autoSplit: splitType === "lines",
                linesClass: "split-line",
                wordsClass: "split-word",
                charsClass: "split-char",
                reduceWhiteSpace: false,
                onSplit: (self: GsapSplitText) => {
                    assignTargets(self)
                    if (reduceMotion) {
                        gsap.set(targets, { ...to })
                        animationCompletedRef.current = true
                        onCompleteRef.current?.()
                        return
                    }
                    return gsap.fromTo(
                        targets,
                        { ...from },
                        {
                            ...to,
                            duration,
                            ease,
                            stagger: delay / 1000,
                            scrollTrigger: {
                                trigger: el,
                                start,
                                once: true,
                                fastScrollEnd: true,
                                anticipatePin: 0.4,
                            },
                            onComplete: () => {
                                animationCompletedRef.current = true
                                onCompleteRef.current?.()
                            },
                            willChange: "transform, opacity",
                            force3D: true,
                        },
                    )
                },
            })
            el._rbsplitInstance = splitInstance
            return () => {
                ScrollTrigger.getAll().forEach((st) => {
                    if (st.trigger === el) {
                        st.kill()
                    }
                })
                try {
                    splitInstance.revert()
                } catch {
                    // 同上
                }
                el._rbsplitInstance = undefined
            }
        },
        {
            dependencies: [
                text,
                delay,
                duration,
                ease,
                splitType,
                JSON.stringify(from),
                JSON.stringify(to),
                threshold,
                rootMargin,
                fontsLoaded,
            ],
            scope: ref,
        },
    )

    const style: CSSProperties = {
        textAlign,
        overflow: "hidden",
        display: "inline-block",
        whiteSpace: "normal",
        wordWrap: "break-word",
        willChange: "transform, opacity",
    }
    const Tag = (tag || "p") as ElementType

    return (
        <Tag ref={ref} style={style} className={`split-parent ${className}`}>
            {text}
        </Tag>
    )
}

export { SplitText }
export type { SplitTextProps }
