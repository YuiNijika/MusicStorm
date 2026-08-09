import { useRef } from "react"
import type { MouseEventHandler, ReactNode } from "react"

import "./spotlight-card.css"

interface SpotlightCardProps {
    children: ReactNode
    className?: string
    /** 默认走全局 token --color-spotlight，亮暗主题自动切换 */
    spotlightColor?: string
}

function SpotlightCard({ children, className = "", spotlightColor }: SpotlightCardProps) {
    const divRef = useRef<HTMLDivElement>(null)

    const handleMouseMove: MouseEventHandler<HTMLDivElement> = (e) => {
        const el = divRef.current
        if (!el) {
            return
        }
        const rect = el.getBoundingClientRect()
        el.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`)
        el.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`)
        if (spotlightColor) {
            el.style.setProperty("--spotlight-color", spotlightColor)
        }
    }

    return (
        <div
            ref={divRef}
            onMouseMove={handleMouseMove}
            className={`card-spotlight ${className}`}
        >
            {children}
        </div>
    )
}

export { SpotlightCard }
export type { SpotlightCardProps }
