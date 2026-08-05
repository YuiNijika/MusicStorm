import { useEffect, useRef, useState } from "react"

import { BackButton } from "@/components/music/back-button"
import { Cover } from "@/components/music/cover"
import { MvDetailSkeleton } from "@/components/music/loading-skeletons"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { formatDuration } from "@/lib/format"
import { fetchMvPlayable, type MvPlayable } from "@/lib/netease/mv"
import { formatError, notifyFromError } from "@/lib/notify"
import { cn } from "@/lib/utils"

type MvPageProps = {
    mvId: string
    onBack: () => void
}

function MvPage({ mvId, onBack }: MvPageProps) {
    const { openArtist } = useMusicNavigation()
    const videoRef = useRef<HTMLVideoElement>(null)
    const [data, setData] = useState<MvPlayable | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retry, setRetry] = useState(0)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        void fetchMvPlayable(mvId)
            .then((result) => {
                if (cancelled) {
                    return
                }
                setData(result)
                setLoading(false)
            })
            .catch((err: unknown) => {
                if (cancelled) {
                    return
                }
                setData(null)
                setLoading(false)
                const message = formatError(err)
                setError(message)
                notifyFromError("MV 加载失败", err)
            })
        return () => {
            cancelled = true
        }
    }, [mvId, retry])

    // 切 MV 时停掉上一个
    useEffect(() => {
        return () => {
            const el = videoRef.current
            if (el) {
                el.pause()
                el.removeAttribute("src")
                el.load()
            }
        }
    }, [mvId])

    const profile = data?.profile

    return (
        <div className="space-y-5 pb-2">
            <BackButton onClick={onBack} />

            {loading ? (
                <MvDetailSkeleton />
            ) : error ? (
                <StateHero
                    variant="error"
                    title="MV 加载失败"
                    description={error}
                    action={
                        <HeroRetryButton onClick={() => setRetry((n) => n + 1)} />
                    }
                />
            ) : profile ? (
                <>
                    <div
                        className={cn(
                            "relative overflow-hidden rounded-[22px]",
                            "bg-black shadow-[0_20px_48px_rgba(0,0,0,0.35)]",
                            "ring-1 ring-white/10",
                        )}
                    >
                        {data?.url ? (
                            <video
                                ref={videoRef}
                                key={data.url}
                                className="aspect-video w-full bg-black"
                                src={data.url}
                                controls
                                playsInline
                                autoPlay
                                poster={profile.coverUrl || undefined}
                            />
                        ) : (
                            <div className="relative aspect-video w-full">
                                {profile.coverUrl ? (
                                    <img
                                        src={profile.coverUrl}
                                        alt=""
                                        className="size-full object-cover opacity-50"
                                    />
                                ) : null}
                                <div className="absolute inset-0 flex items-center justify-center p-6">
                                    <p className="text-center text-[14px] text-white/80">
                                        暂无可用播放地址（版权或地区限制）
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    <header className="flex gap-4">
                        <Cover
                            src={profile.coverUrl}
                            alt={profile.title}
                            size="md"
                            className="size-20 shrink-0 rounded-2xl"
                        />
                        <div className="min-w-0 flex-1 space-y-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                MV
                                {data?.br ? ` · ${data.br}p` : ""}
                            </p>
                            <h1 className="line-clamp-2 text-[22px] font-semibold tracking-[-0.03em]">
                                {profile.title}
                            </h1>
                            <p className="text-[13px] text-muted-foreground">
                                {profile.artistId ? (
                                    <button
                                        type="button"
                                        onClick={() => openArtist(profile.artistId!)}
                                        className="cursor-pointer font-medium text-foreground/90 underline-offset-2 hover:underline"
                                    >
                                        {profile.artistName}
                                    </button>
                                ) : (
                                    profile.artistName
                                )}
                                {profile.durationMs > 0 ? (
                                    <>
                                        <span className="mx-1 opacity-40">·</span>
                                        {formatDuration(profile.durationMs)}
                                    </>
                                ) : null}
                                {profile.playCount != null ? (
                                    <>
                                        <span className="mx-1 opacity-40">·</span>
                                        {profile.playCount.toLocaleString()} 次播放
                                    </>
                                ) : null}
                            </p>
                            {profile.description ? (
                                <p className="line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">
                                    {profile.description}
                                </p>
                            ) : null}
                        </div>
                    </header>
                </>
            ) : null}
        </div>
    )
}

export { MvPage }