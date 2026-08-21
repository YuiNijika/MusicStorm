import { useEffect, useState } from "react"

import { Section } from "@/components/music/section"
import { fetchFaqItems, type FaqItem } from "@/lib/netease/faq"
import { SettingsGroup } from "@/pages/settings/settings-ui"

function FaqTab() {
    const [items, setItems] = useState<FaqItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")

    useEffect(() => {
        let cancelled = false
        fetchFaqItems()
            .then((data) => {
                if (cancelled) {
                    return
                }
                setItems(data)
                setLoading(false)
            })
            .catch((err: unknown) => {
                if (cancelled) {
                    return
                }
                setError(err instanceof Error ? err.message : "加载失败")
                setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    return (
        <Section
            title="常见问题"
            description="常见问题的解答，内容由音源接口提供"
        >
            {loading ? (
                <SettingsGroup>
                    <p className="text-[13px] text-muted-foreground">加载中…</p>
                </SettingsGroup>
            ) : error ? (
                <SettingsGroup>
                    <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
                        {error}
                    </p>
                </SettingsGroup>
            ) : items.length === 0 ? (
                <SettingsGroup>
                    <p className="text-[13px] text-muted-foreground">
                        暂无常见问题。
                    </p>
                </SettingsGroup>
            ) : (
                <div className="space-y-2.5">
                    {items.map((item, index) => (
                        <SettingsGroup key={`${item.question}-${index}`}>
                            <p className="text-[14px] font-medium tracking-[-0.01em]">
                                {item.question}
                            </p>
                            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                                {item.answer}
                            </p>
                        </SettingsGroup>
                    ))}
                </div>
            )}
        </Section>
    )
}

export { FaqTab }