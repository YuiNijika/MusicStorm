import { RefreshCw } from "lucide-react"
import {
 useCallback,
 useEffect,
 useMemo,
 useState,
} from "react"

import { MediaCard } from "@/components/music/media-card"
import { PageTitle } from "@/components/music/page-title"
import {
 HeroRetryButton,
 StateHero,
} from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { VirtualGrid } from "@/components/music/virtual-grid"
import { VirtualList } from "@/components/music/virtual-list"
import { usePlayer } from "@/hooks/use-player"
import { usePlaylistGrid } from "@/hooks/use-playlist-grid"
import { fetchBilibiliAuthStatus, type BilibiliAccount } from "@/lib/bilibili/auth"
import {
 fetchBilibiliFavoriteFolders,
 fetchBilibiliFavoritePage,
 type BilibiliFavoriteFolder,
} from "@/lib/bilibili/favorites"
import { notifyFromError } from "@/lib/notify"
import type { Track } from "@/lib/types"

const MEDIA_ROW_HEIGHT =236

function BilibiliLibraryPage() {
 const { playOrToggle, currentTrack, isPlaying } = usePlayer()
 const { cols, gridRef } = usePlaylistGrid()
 const [account, setAccount] = useState<BilibiliAccount | null>(null)
 const [folders, setFolders] = useState<BilibiliFavoriteFolder[]>([])
 const [activeFolder, setActiveFolder] =
 useState<BilibiliFavoriteFolder | null>(null)
 const [tracks, setTracks] = useState<Track[]>([])
 const [loading, setLoading] = useState(true)
 const [tracksLoading, setTracksLoading] = useState(false)
 const [error, setError] = useState<string | null>(null)
 const [revision, setRevision] = useState(0)

useEffect(() => {
 let cancelled = false
 setLoading(true)
 setError(null)
 void fetchBilibiliAuthStatus()
 .then(async (status) => {
 if (cancelled) {
 return
 }
 setAccount(status.account)
 if (!status.account) {
 setFolders([])
 setLoading(false)
 return
 }
 const items = await fetchBilibiliFavoriteFolders(
 status.account.mid,
 )
 if (cancelled) {
 return
 }
 setFolders(items)
 setLoading(false)
 })
 .catch((reason: unknown) => {
 if (cancelled) {
 return
 }
 setLoading(false)
 setError(
 reason instanceof Error
 ? reason.message
 : "收藏夹暂时不可用",
 )
 })
 return () => {
 cancelled = true
 }
 }, [revision])

 const openFolder = useCallback(
 async (folder: BilibiliFavoriteFolder) => {
 setActiveFolder(folder)
 setTracksLoading(true)
 setError(null)
 try {
 const result = await fetchBilibiliFavoritePage({
 mediaId: folder.id,
 })
 setTracks(result.tracks)
 } catch (reason) {
 notifyFromError("收藏夹加载失败", reason)
 setTracks([])
 } finally {
 setTracksLoading(false)
 }
 },
 [],
 )

 const allTracks = useMemo(() => tracks, [tracks])

 if (loading) {
 return (
 <div
 role="status"
 aria-label="正在加载收藏夹…"
 className="space-y-4"
 >
 <div className="h-8 w-40 animate-pulse rounded bg-[var(--surface-fill)]" />
 <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
 {Array.from({ length:12 }, (_, index) => (
 <div
 key={index}
 className="aspect-square animate-pulse rounded-[14px] bg-[var(--surface-fill)]"
 />
 ))}
 </div>
 </div>
 )
 }

 if (error) {
 return (
 <StateHero
 variant="error"
 title="收藏夹暂时不可用"
 description={error}
 action={
 <HeroRetryButton
 onClick={() =>
 setRevision((value) => value +1)
 }
 >
重新加载
 </HeroRetryButton>
 }
 />
 )
 }

 if (!account) {
 return (
 <StateHero
 variant="auth"
 title="登录后查看收藏夹"
 description="登录后查看账号收藏夹"
 />
 )
 }

 if (activeFolder) {
 return (
 <div className="space-y-6">
 <button
 type="button"
 onClick={() => {
 setActiveFolder(null)
 setTracks([])
 }}
 className="cursor-pointer text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
 >
←返回收藏夹
 </button>
 <div>
 <h1 className="line-clamp-2 break-words text-[24px] font-bold tracking-[-0.03em]">
{activeFolder.title}
 </h1>
 <p className="mt-1 text-[13px] text-muted-foreground">
 {tracks.length}首 ·收藏夹
 </p>
 </div>
 {tracksLoading ? (
 <div className="apple-list-surface space-y-1 p-1.5">
 {Array.from({ length:8 }, (_, index) => (
 <div
 key={index}
 className="h-14 animate-pulse rounded-xl bg-[var(--surface-fill)]"
 />
 ))}
 </div>
 ) : tracks.length ===0 ? (
 <StateHero
 variant="empty"
 title="收藏夹里没有音频"
 description="选择包含音乐、翻唱或演奏的收藏夹"
 />
 ) : (
 <div className="apple-list-surface p-1.5">
 <VirtualList
 items={allTracks}
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
 playOrToggle(item, allTracks)
 }
 />
 )}
 />
 </div>
 )}
 </div>
 )
 }

 return (
 <div ref={gridRef} className="space-y-6">
 <PageTitle
 title="收藏夹"
 subtitle={`${account.name} · 收藏夹 ${folders.length}个`}
 trailing={
 <button
 type="button"
 onClick={() =>
 setRevision((value) => value +1)
 }
aria-busy={loading}
 className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-fill)] px-3.5 text-[12px] font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-[var(--surface-fill-hover)] hover:text-foreground active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-ring"
 >
 <RefreshCw className="size-3.5" aria-hidden="true" />
刷新
 </button>
 }
 />
 {folders.length ===0 ? (
 <StateHero
 variant="empty"
 title="还没有收藏夹"
 description="收藏音乐后会显示在这里"
 />
 ) : (
 <VirtualGrid
 items={folders}
 columns={cols}
 estimatedRowHeight={MEDIA_ROW_HEIGHT}
 getItemKey={(folder) => folder.id}
 renderItem={(folder) => (
 <MediaCard
 coverUrl={folder.coverUrl}
 title={folder.title}
 subtitle={`${folder.count}首 · ${folder.isPublic ? "公开" : "私密"}`}
 onClick={() => void openFolder(folder)}
 widthClassName="w-full"
 className="w-full"
 />
 )}
 />
 )}
 </div>
 )
}

export { BilibiliLibraryPage }
