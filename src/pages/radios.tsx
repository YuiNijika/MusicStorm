import { Podcast, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { MediaCard } from "@/components/music/media-card"
import { PageTitle } from "@/components/music/page-title"
import { Section } from "@/components/music/section"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { useLiked } from "@/hooks/use-liked"
import { useNeteaseSession } from "@/hooks/use-netease-session"
import { usePlaylistGrid } from "@/hooks/use-playlist-grid"
import { fetchDjSublist, fetchHomeRadios } from "@/lib/netease/dj"
import { formatError, notifyFromError } from "@/lib/notify"
import type { Radio } from "@/lib/types"
import { cn } from "@/lib/utils"

function RadiosPage() {
    const { openRadio } = useMusicNavigation()
    const { ready, loggedIn } = useNeteaseSession()
    const { subscribedRadioIds, refresh } = useLiked()
    const { gridClass, gridStyle, gridRef } = usePlaylistGrid()

    const [subscribed, setSubscribed] = useState<Radio[]>([])
    const [discover, setDiscover] = useState<Radio[]>([])
    const [loadingSub, setLoadingSub] = useState(false)
    const [loadingDiscover, setLoadingDiscover] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retry, setRetry] = useState(0)

    const load = useCallback(async () => {
        setError(null)
        setLoadingDiscover(true)
        setLoadingSub(Boolean(loggedIn))
        try {
            const discoverList = await fetchHomeRadios(24)
            setDiscover(discoverList)
        } catch (err) {
            setDiscover([])
            setError(formatError(err))
            notifyFromError("电台加载失败", err)
        } finally {
            setLoadingDiscover(false)
        }

        if (loggedIn) {
            try {
                const list = await fetchDjSublist()
                setSubscribed(list)
                void refresh()
            } catch {
                setSubscribed([])
            } finally {
                setLoadingSub(false)
            }
        } else {
            setSubscribed([])
            setLoadingSub(false)
        }
    }, [loggedIn, refresh])

    useEffect(() => {
        if (!ready) {
            return
        }
        void load()
    }, [ready, loggedIn, retry, load])

    return (
        <div className="space-y-6 pb-4">
            <div className="flex items-start justify-between gap-3">
                <PageTitle title="电台" subtitle="订阅同步 · 发现播客" />
                <button
                    type="button"
                    onClick={() => setRetry((n) => n + 1)}
                    className={cn(
                        "glass-chip inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3",
                        "text-[13px] font-medium active:scale-[0.97]",
                    )}
                    title="刷新"
                >
                    <RefreshCw className="size-3.5 opacity-70" />
                    刷新
                </button>
            </div>

            {error && !discover.length ? (
                <StateHero
                    variant="error"
                    title="电台加载失败"
                    description={error}
                    action={
                        <HeroRetryButton onClick={() => setRetry((n) => n + 1)} />
                    }
                />
            ) : (
                <>
                    <Section
                        title="我的订阅"
                        description={
                            loggedIn
                                ? `已同步 ${subscribed.length || subscribedRadioIds.size} 个`
                                : "登录后同步网易云订阅"
                        }
                    >
                        {!loggedIn ? (
                            <StateHero
                                variant="empty"
                                title="未登录"
                                description="登录网易云账号后可同步已订阅电台"
                                icon={Podcast}
                            />
                        ) : loadingSub ? (
                            <div className="material-panel h-28 animate-pulse rounded-[20px]" />
                        ) : subscribed.length === 0 ? (
                            <StateHero
                                variant="empty"
                                title="暂无订阅"
                                description="在电台详情页点收藏，或于网易云订阅后点刷新"
                                icon={Podcast}
                            />
                        ) : (
                            <div
                                ref={gridRef}
                                className={gridClass}
                                style={gridStyle}
                            >
                                {subscribed.map((radio) => (
                                    <MediaCard
                                        key={radio.id}
                                        title={radio.title}
                                        subtitle={
                                            radio.djName ||
                                            radio.category ||
                                            "电台"
                                        }
                                        coverUrl={radio.coverUrl}
                                        onClick={() => openRadio(radio.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </Section>

                    <Section title="发现" description="推荐与热门">
                        {loadingDiscover ? (
                            <div className="material-panel h-36 animate-pulse rounded-[20px]" />
                        ) : discover.length === 0 ? (
                            <StateHero
                                variant="empty"
                                title="暂无推荐"
                                description="稍后再试或检查网络"
                            />
                        ) : (
                            <div className={gridClass} style={gridStyle}>
                                {discover.map((radio) => (
                                    <MediaCard
                                        key={radio.id}
                                        title={radio.title}
                                        subtitle={
                                            radio.djName ||
                                            (radio.programCount != null
                                                ? `${radio.programCount} 期`
                                                : "电台")
                                        }
                                        coverUrl={radio.coverUrl}
                                        onClick={() => openRadio(radio.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </Section>
                </>
            )}
        </div>
    )
}

export { RadiosPage }