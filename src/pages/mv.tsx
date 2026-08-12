import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Download } from "lucide-react"

import { BackButton } from "@/components/music/back-button"
import { Cover } from "@/components/music/cover"
import { MvDetailSkeleton } from "@/components/music/loading-skeletons"
import { MvPlayer } from "@/components/music/mv-player"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import { formatDuration } from "@/lib/format"
import { fetchMvPlayable, type MvPlayable } from "@/lib/netease/mv"
import { formatError, notifyFromError, notifyInfo, notifySuccess } from "@/lib/notify"
import { cn } from "@/lib/utils"

type MvPageProps = {
    mvId: string
    onBack: () => void
}

function MvPage({ mvId, onBack }: MvPageProps) {
    const { openArtist } = useMusicNavigation()
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

    const profile = data?.profile

    // m3u8 为分片流，直链下载无意义
    function isHlsStream(url: string): boolean {
        return /\.m3u8(\?|$)/i.test(url)
    }

    async function handleDownload() {
        const url = data?.url
        if (!url) {
            return
        }
        if (isHlsStream(url)) {
            notifyInfo("该 MV 为分片流", {
                description: "暂不支持直接下载，可尝试在浏览器中打开",
            })
            return
        }
        const title = profile?.title || "MV"
        const name = `${title}.mp4`
        try {
            const saved = await invoke<string | null>("save_url_to_file", {
                url,
                defaultName: name,
            })
            if (!saved) {
                notifyInfo("已取消下载")
                return
            }
            notifySuccess("下载完成", { description: title })
        } catch (error) {
            notifyFromError("下载失败", error)
        }
    }

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
                            <MvPlayer
                                url={data.url}
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
                            <h1 className="line-clamp-2 text-[22px] leading-[1.2] font-semibold tracking-[-0.03em]">
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
                        {data?.url ? (
                            <button
                                type="button"
                                onClick={() => void handleDownload()}
                                className={cn(
                                    "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium",
                                    "bg-[var(--surface-fill)] text-foreground transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)]",
                                    "active:scale-[0.97] active:duration-[var(--duration-press)]",
                                )}
                                title={
                                    isHlsStream(data.url)
                                        ? "分片流暂不支持直接下载"
                                        : "下载 MV 视频"
                                }
                            >
                                <Download className="size-3.5" />
                                下载
                            </button>
                        ) : null}
                    </header>
                </>
            ) : null}
        </div>
    )
}

export { MvPage }