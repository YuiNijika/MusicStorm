import { useCallback, useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import "./lightbox.css"

interface LightboxItem {
    image: string
    label?: string
}

interface LightboxProps {
    items: LightboxItem[]
    index: number
    onClose: () => void
    onNavigate: (index: number) => void
}

function Lightbox({ items, index, onClose, onNavigate }: LightboxProps) {
    const closeRef = useRef<HTMLButtonElement>(null)
    // 关闭后把焦点还给触发元素，键盘/读屏用户不丢上下文
    const restoreRef = useRef<Element | null>(null)
    const count = items.length

    const prev = useCallback(
        () => onNavigate((index - 1 + count) % count),
        [index, count, onNavigate],
    )
    const next = useCallback(
        () => onNavigate((index + 1) % count),
        [index, count, onNavigate],
    )

    useEffect(() => {
        restoreRef.current = document.activeElement
        // 灯箱打开期间锁定背景滚动
        const { overflow } = document.body.style
        document.body.style.overflow = "hidden"
        closeRef.current?.focus()

        const onKey = (e: globalThis.KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose()
            } else if (e.key === "ArrowLeft") {
                prev()
            } else if (e.key === "ArrowRight") {
                next()
            }
        }
        window.addEventListener("keydown", onKey)
        return () => {
            document.body.style.overflow = overflow
            window.removeEventListener("keydown", onKey)
            ;(restoreRef.current as HTMLElement | null)?.focus?.()
        }
    }, [onClose, prev, next])

    const item = items[index]
    if (!item) {
        return null
    }

    return createPortal(
        <div
            className="lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={item.label ?? "截图预览"}
            onClick={onClose}
        >
            <figure
                className="lightbox__figure"
                onClick={(e) => e.stopPropagation()}
            >
                <img
                    className="lightbox__image"
                    src={item.image}
                    alt={item.label ?? ""}
                />
                {item.label ? (
                    <figcaption className="lightbox__caption">
                        {item.label}
                        <span className="lightbox__counter">
                            {index + 1} / {count}
                        </span>
                    </figcaption>
                ) : null}
            </figure>
            <button
                ref={closeRef}
                type="button"
                className="lightbox__close"
                onClick={onClose}
                aria-label="关闭预览"
            >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                        d="m3 3 10 10M13 3 3 13"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                    />
                </svg>
            </button>
            {count > 1 ? (
                <>
                    <button
                        type="button"
                        className="lightbox__nav lightbox__nav--prev"
                        onClick={(e) => {
                            e.stopPropagation()
                            prev()
                        }}
                        aria-label="上一张"
                    >
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                            <path
                                d="M11.5 3.5 6 9l5.5 5.5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                    <button
                        type="button"
                        className="lightbox__nav lightbox__nav--next"
                        onClick={(e) => {
                            e.stopPropagation()
                            next()
                        }}
                        aria-label="下一张"
                    >
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                            <path
                                d="m6.5 3.5L12 9l-5.5 5.5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                </>
            ) : null}
        </div>,
        document.body,
    )
}

export { Lightbox }
export type { LightboxItem, LightboxProps }
