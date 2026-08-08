import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type SectionProps = {
    title: string
    description?: string
    action?: ReactNode
    children: ReactNode
    className?: string
    variant?: "default" | "listen"
}

function Section({
    title,
    description,
    action,
    children,
    className,
    variant = "default",
}: SectionProps) {
    const isListen = variant === "listen"

    return (
        <section className={cn(isListen ? "space-y-3" : "space-y-3.5", className)}>
            <div
                className={cn(
                    "flex items-end justify-between gap-3",
                    isListen ? "px-0.5" : "px-0.5",
                )}
            >
                <div className="min-w-0">
                    <h2
                        className={cn(
                            "font-semibold text-foreground",
                            isListen
                                ? "text-[22px] tracking-[-0.03em]"
                                : "text-[20px] tracking-[-0.03em]",
                        )}
                    >
                        {title}
                    </h2>
                    {description ? (
                        <p
                            className={cn(
                                "text-muted-foreground",
                                isListen ? "mt-0.5 text-[13px]" : "mt-0.5 text-[13px]",
                            )}
                        >
                            {description}
                        </p>
                    ) : null}
                </div>
                {action}
            </div>
            {children}
        </section>
    )
}

export { Section }