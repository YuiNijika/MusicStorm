import { ExternalLink, Play } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { AccountAvatar } from "@/components/bilibili/account-avatar"
import { BackButton } from "@/components/music/back-button"
import { Cover } from "@/components/music/cover"
import { ArtistDetailSkeleton } from "@/components/music/loading-skeletons"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMusicNavigation } from "@/hooks/use-music-navigation"
import {
    fetchBilibiliUpProfile,
    type BilibiliUpCollection,
    type BilibiliUpProfile,
} from "@/lib/bilibili/search"
import { openExternalUrl } from "@/lib/open-external"
import { formatError } from "@/lib/notify"
import { cn } from "@/lib/utils"

type BilibiliUpPageProps = {
    mid: string
    onBack: () => void
}

function formatFans(fans?: number): string {
    if (fans == null) {
        return "哔哩哔哩 UP"
    }
    if (fans >= 100_000_000) {
        const value = new Intl.NumberFormat("zh-CN", {
            maximumFractionDigits: 1,
        }).format(fans / 100_000_000)
        return `${value}亿粉丝`
    }
    if (fans >= 10_000) {
        const value = new Intl.NumberFormat("zh-CN", {
            maximumFractionDigits: 1,
        }).format(fans / 10_000)
        return `${value}万粉丝`
    }
    return `${new Intl.NumberFormat("zh-CN").format(fans)}粉丝`
}

function UpHeader({
    profile,
    onPlay,
}: {
    profile: BilibiliUpProfile
    onPlay: () => void
}) {
    return (
        <header className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-end sm:text-left">
            <AccountAvatar
                src={profile.avatarUrl}
                name={profile.name}
                pixels={144}
                eager
                className="shadow-md ring-1 ring-black/[0.06] dark:ring-white/[0.1]"
            />
            <div className="min-w-0 flex-1 space-y-2 pb-1">
                <p className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase sm:text-[12px]">
                    UP主
                </p>
                <h1 className="text-[26px] leading-[1.15] font-bold tracking-[-0.04em] sm:text-[28px] md:text-[32px] md:font-semibold">
                    {profile.name}
                </h1>
                <p className="text-[13px] text-muted-foreground">
                    {formatFans(profile.fans)}
                    {profile.collections.length > 0
                        ? ` · ${profile.collections.length}个合集与系列`
                        : ""}
                </p>
                {profile.description ? (
                    <p className="mx-auto max-w-[560px] text-[13px] leading-relaxed text-muted-foreground sm:mx-0">
                        {profile.description}
                    </p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <button
                        type="button"
                        onClick={onPlay}
                        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] apple-primary-action px-5 text-[13px] font-medium transition-transform duration-[var(--duration-press)] active:scale-[0.98]"
                    >
                        <Play className="size-3.5 fill-current" aria-hidden="true" />
                        播放合集
                    </button>
                    <button
                        type="button"
                        onClick={() => void openExternalUrl(profile.webUrl)}
                        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-4 text-[13px] font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-[0.97] active:duration-[var(--duration-press)]"
                    >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        在B站打开
                    </button>
                </div>
            </div>
        </header>
    )
}

function CollectionGrid({
    items,
    onOpen,
}: {
    items: BilibiliUpCollection[]
    onOpen: (item: BilibiliUpCollection) => void
}) {
    if (items.length === 0) {
        return (
            <StateHero
                variant="empty"
                title="暂无合集"
                description="该 UP主还没有公开合集或系列"
            />
        )
    }
    return (
        <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpen(item)}
                    className={cn(
                        "group flex w-full cursor-pointer flex-col gap-2 rounded-[14px] text-left transition-[transform,box-shadow] focus-visible:outline-2 focus-visible:outline-ring",
                    )}
                >
                    <Cover
                        src={item.coverUrl}
                        alt={item.title}
                        size="xl"
                        className="transition-transform duration-[var(--duration-hover)] group-hover:scale-[1.02]"
                    />
                    <span className="min-w-0 flex-1">
                        <span className="block line-clamp-2 text-[13px] font-semibold leading-[1.35]">
                            {item.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                            {item.kind === "season" ? "合集" : "系列"}
                            {item.count != null ? ` · ${item.count}个视频` : ""}
                        </span>
                    </span>
                </button>
            ))}
        </div>
    )
}

function BilibiliUpPage({ mid, onBack }: BilibiliUpPageProps) {
    const numericMid = Number(mid)
    const { openBilibiliCollection } = useMusicNavigation()
    const [profile, setProfile] = useState<BilibiliUpProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [revision, setRevision] = useState(0)

    useEffect(() => {
        if (!Number.isSafeInteger(numericMid) || numericMid <= 0) {
            setLoading(false)
            setError("UP主 UID无效")
            return
        }
        let active = true
        setLoading(true)
        setError("")
        void fetchBilibiliUpProfile(numericMid)
            .then((next) => {
                if (active) {
                    setProfile(next)
                }
            })
            .catch((reason: unknown) => {
                if (active) {
                    setProfile(null)
                    setError(formatError(reason))
                }
            })
            .finally(() => {
                if (active) {
                    setLoading(false)
                }
            })
        return () => {
            active = false
        }
    }, [numericMid, revision])

    const seasons = useMemo(
        () =>
            profile?.collections.filter((item) => item.kind === "season") ?? [],
        [profile],
    )
    const series = useMemo(
        () =>
            profile?.collections.filter((item) => item.kind === "series") ?? [],
        [profile],
    )

    const handlePlayCollection = () => {
        const selected =
            profile?.collections.find((item) => item.kind === "season") ??
            profile?.collections[0]
        if (selected) {
            openBilibiliCollection({
                mid: selected.mid.toString(),
                collectionId: selected.collectionId.toString(),
                kind: selected.kind,
            })
        }
    }

    return (
        <div className="space-y-5">
            <BackButton onClick={onBack} />
            {loading ? (
                <ArtistDetailSkeleton />
            ) : error && !profile ? (
                <StateHero
                    variant="error"
                    title="UP主加载失败"
                    description={error}
                    action={
                        <HeroRetryButton
                            onClick={() => setRevision((value) => value + 1)}
                        />
                    }
                />
            ) : profile ? (
                <>
                    <UpHeader
                        profile={profile}
                        onPlay={handlePlayCollection}
                    />
                    <Tabs
                        className="gap-4"
                    >
                        <TabsList
                            variant="line"
                            className="h-auto w-full max-w-full flex-wrap justify-start gap-0 overflow-x-auto"
                        >
                            <TabsTrigger value="collections" className="px-3">
                                合集
                            </TabsTrigger>
                            <TabsTrigger value="series" className="px-3">
                                系列
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="collections" className="outline-none">
                            <CollectionGrid
                                items={seasons}
                                onOpen={(item) =>
                                    openBilibiliCollection({
                                        mid: item.mid.toString(),
                                        collectionId: item.collectionId.toString(),
                                        kind: item.kind,
                                    })
                                }
                            />
                        </TabsContent>
                        <TabsContent value="series" className="outline-none">
                            <CollectionGrid
                                items={series}
                                onOpen={(item) =>
                                    openBilibiliCollection({
                                        mid: item.mid.toString(),
                                        collectionId: item.collectionId.toString(),
                                        kind: item.kind,
                                    })
                                }
                            />
                        </TabsContent>
                    </Tabs>
                </>
            ) : null}
        </div>
    )
}

export { BilibiliUpPage }
