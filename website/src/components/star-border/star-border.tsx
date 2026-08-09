import type { ComponentPropsWithoutRef, CSSProperties, ElementType, ReactNode } from "react"

import "./star-border.css"

type StarBorderProps<T extends ElementType> = ComponentPropsWithoutRef<T> & {
    as?: T
    className?: string
    children?: ReactNode
    color?: string
    speed?: CSSProperties["animationDuration"]
    thickness?: number
}

function StarBorder<T extends ElementType = "button">({
    as,
    className = "",
    color = "white",
    speed = "6s",
    thickness = 1,
    children,
    ...rest
}: StarBorderProps<T>) {
    const Component = (as || "button") as ElementType

    return (
        <Component
            className={`star-border-container ${className}`}
            // 多态组件的透传 props 无法静态收窄，只能放行
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...(rest as any)}
            style={{
                padding: `${thickness}px 0`,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(rest as any).style,
            }}
        >
            <div
                className="border-gradient-bottom"
                style={{
                    background: `radial-gradient(circle, ${color}, transparent 10%)`,
                    animationDuration: speed,
                }}
            />
            <div
                className="border-gradient-top"
                style={{
                    background: `radial-gradient(circle, ${color}, transparent 10%)`,
                    animationDuration: speed,
                }}
            />
            <div className="inner-content">{children}</div>
        </Component>
    )
}

export { StarBorder }
export type { StarBorderProps }
