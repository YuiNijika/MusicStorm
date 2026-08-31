import { useEffect, useState } from "react"

import { fetchFaqItems, type FaqItem } from "@/lib/netease/faq"
import { SettingsGroup, TabHeader } from "@/pages/settings/settings-ui"

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
        <div className="space-y-3">
            <TabHeader
                title="常见问题"
                description="内容由音源接口提供"
            />

            {loading ? (
                <SettingsGroup>
                    <p className="text-sm text-muted-foreground">加载中…</p>
                </SettingsGroup>
            ) : error ? (
                <SettingsGroup>
                    <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                        {error}
                    </p>
                </SettingsGroup>
            ) : items.length === 0 ? (
                <SettingsGroup>
                    <p className="text-sm text-muted-foreground">
                        暂无常见问题。
                    </p>
                </SettingsGroup>
            ) : (
                <SettingsGroup>
                    <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                        {items.map((item, index) => (
                            <li
                                key={`${item.question}-${index}`}
                                className="space-y-1.5 py-3 first:pt-0 last:pb-0"
                            >
                                <p className="text-[14px] font-medium tracking-[-0.01em]">
                                    {item.question}
                                </p>
                                <p className="text-sm leading-relaxed text-muted-foreground">
                                    {item.answer}
                                </p>
                            </li>
                        ))}
                    </ul>
                </SettingsGroup>
            )}
        </div>
    )
}

export { FaqTab }