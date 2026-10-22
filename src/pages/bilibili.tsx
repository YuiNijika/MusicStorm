import { RefreshCw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { MediaCard } from "@/components/music/media-card"
import {
    CardsRail,
    RailControls,
    useRailApi,
} from "@/components/music/media-rail"
import { Section } from "@/components/music/section"
import { PageTitle } from "@/components/music/page-title"
import { HeroRetryButton, StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { VirtualList } from "@/components/music/virtual-list"
import { usePlayer } from "@/hooks/use-player"
import {
 fetchBilibiliMusicRanking,
 type BilibiliMusicShelf,
} from "@/lib/bilibili/search"
import type { AppRoute } from "@/lib/routes"
import { isWebMode } from "@/lib/web-mode"

type BilibiliPageProps = {
 onNavigate: (route: AppRoute) => void
}

function MusicSkeleton() {
 return (
 <div
 role="status"
 aria-label="正在加载音乐…"
 className="space-y-8"
 >
 {Array.from({ length:2 }, (_, section) => (
 <section key={section} className="space-y-3">
 <div className="h-5 w-32 animate-pulse rounded bg-[var(--surface-fill)]" />
 <div className="apple-list-surface p-1.5">
 {Array.from({ length:6 }, (_, row) => (
 <div
 key={row}
 className="flex h-[58px] items-center gap-3 px-2.5"
 >
 <div className="size-10 shrink-0 animate-pulse rounded-lg bg-[var(--surface-fill)]" />
 <div className="min-w-0 flex-1 space-y-1.5">
 <div className="h-3.5 w-2/5 animate-pulse rounded bg-[var(--surface-fill)]" />
 <div className="h-3 w-1/4 animate-pulse rounded bg-[var(--surface-fill)]" />
 </div>
 </div>
 ))}
 </div>
 </section>
 ))}
 </div>
 )
}

function BilibiliPage({ onNavigate }: BilibiliPageProps) {
 const { playOrToggle, currentTrack, isPlaying } = usePlayer()
 const [shelves, setShelves] = useState<BilibiliMusicShelf[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [revision, setRevision] = useState(0)
 const featuredRail = useRailApi()

 useEffect(() => {
 let cancelled = false
 if (isWebMode()) {
 setLoading(false)
 setShelves([])
 setError("B站模式暂时只支持客户端")
 return
 }
 setLoading(true)
 setError(null)
 void fetchBilibiliMusicRanking()
 .then((items) => {
 if (cancelled) {
 return
 }
 setShelves(items)
 setLoading(false)
 })
 .catch((reason: unknown) => {
 if (cancelled) {
 return
 }
 setShelves([])
 setLoading(false)
 setError(
 reason instanceof Error
 ? reason.message
 : "暂时无法获取音乐内容",
 )
 })
 return () => {
 cancelled = true
 }
 }, [revision])

 const refresh = useCallback(() => {
 setRevision((value) => value +1)
 }, [])
 return (
 <div className="space-y-8">
 <h1 className="sr-only">哔哩哔哩</h1>
 {loading ? (
 <MusicSkeleton />
 ) : error ? (
 <StateHero
 variant="error"
 title="音乐内容暂时不可用"
 description={
 isWebMode()
 ? error
 : `${error}。检查网络后重试`
 }
 action={
 <HeroRetryButton onClick={refresh}>
重新加载
 </HeroRetryButton>
 }
 />
 ) : shelves.length ===0 ? (
 <StateHero
 variant="empty"
 title="暂时没有音乐内容"
 description="可以前往搜索页查找歌曲、翻唱或音乐现场"
 action={
 <HeroRetryButton onClick={() => onNavigate("search")}>
搜索音乐
 </HeroRetryButton>
 }
 />
 ) : (
 <>
 <PageTitle
 title="哔哩哔哩"
 subtitle="音乐 · 排行、翻唱与现场"
 trailing={
 <button
 type="button"
 disabled={loading}
 aria-busy={loading}
 onClick={refresh}
 className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-3.5 text-[12px] font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-ring"
 >
 <RefreshCw
 className={
 loading
 ? "size-3.5 animate-spin"
 : "size-3.5"
 }
 aria-hidden="true"
 />
刷新
 </button>
 }
 />

 {shelves.map((shelf, shelfIndex) =>
 shelfIndex ===0 ? (
 <Section
 key={shelf.id}
 title={shelf.title}
 description={`${shelf.tracks.length}首`}
 variant="listen"
 action={<RailControls api={featuredRail.api} />}
 >
 <CardsRail setApi={featuredRail.setApi}>
 {shelf.tracks.map((track) => (
 <MediaCard
 key={track.id}
 coverUrl={track.coverUrl}
 title={track.title}
 subtitle={track.artist}
 active={currentTrack?.id === track.id}
 onClick={() =>
 playOrToggle(track, shelf.tracks)
 }
 />
 ))}
 </CardsRail>
 </Section>
 ) : (
 <Section
 key={shelf.id}
 title={shelf.title}
 description={`${shelf.tracks.length}首`}
 variant="listen"
 >
 <div className="apple-list-surface p-1.5">
 <VirtualList
 items={shelf.tracks}
 itemHeight={58}
 getItemKey={(track) => track.id}
 renderItem={(track, index) => (
 <TrackRow
 track={track}
 index={index}
 showSource={false}
 isActive={currentTrack?.id === track.id}
 isPlaying={
 currentTrack?.id === track.id &&
 isPlaying
 }
 onPlay={(item) =>
 playOrToggle(item, shelf.tracks)
 }
 />
 )}
 />
 </div>
 </Section>
 ),
 )}
 </>
 )}
 </div>
 )
}

export { BilibiliPage }
