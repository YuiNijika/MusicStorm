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
            <div className="flex items-end justify-between gap-3 px-0.5">
                <div className="min-w-0">
                    <h2
                        className={cn(
                            "font-bold tracking-[-0.03em] text-foreground md:font-semibold",
                            isListen ? "text-[22px]" : "text-[20px]",
                        )}
                    >
                        {title}
                    </h2>
                    {description ? (
                        <p className="mt-0.5 text-[13px] text-muted-foreground">
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