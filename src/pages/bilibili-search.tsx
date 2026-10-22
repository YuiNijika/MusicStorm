import {
 History as HistoryIcon,
 Search as SearchIcon,
 X,
} from "lucide-react"
import { useEffect, useState } from "react"

import { Section } from "@/components/music/section"
import { HeroRetryButton } from "@/components/music/state-hero"
import { StateHero } from "@/components/music/state-hero"
import { TrackRow } from "@/components/music/track-row"
import { VirtualList } from "@/components/music/virtual-list"
import { usePlayer } from "@/hooks/use-player"
import { searchBilibiliMusic } from "@/lib/bilibili/search"
import {
 SEARCH_HISTORY_EVENT,
 addSearchHistory,
 clearSearchHistory,
 getSearchHistory,
 removeSearchHistory,
} from "@/lib/search-history"
import type { Track } from "@/lib/types"
import { isWebMode } from "@/lib/web-mode"

function SearchSkeleton() {
 return (
 <div
 role="status"
 aria-label="正在搜索音乐…"
 className="apple-list-surface p-1.5"
 >
 {Array.from({ length:8 }, (_, index) => (
 <div
 key={index}
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
 )
}

function BilibiliSearchPage() {
 const { playOrToggle, currentTrack, isPlaying } = usePlayer()
 const [query, setQuery] = useState("")
 const [submitted, setSubmitted] = useState("")
 const [history, setHistory] = useState<string[]>(() =>
 getSearchHistory(),
 )
 const [inputFocused, setInputFocused] = useState(false)
 const [tracks, setTracks] = useState<Track[]>([])
 const [loading, setLoading] = useState(false)
 const [error, setError] = useState<string | null>(null)
 const [revision, setRevision] = useState(0)

 useEffect(() => {
 function onHistory() {
 setHistory(getSearchHistory())
 }
 window.addEventListener(SEARCH_HISTORY_EVENT, onHistory)
 return () =>
 window.removeEventListener(
 SEARCH_HISTORY_EVENT,
 onHistory,
 )
 }, [])

 useEffect(() => {
 const keyword = submitted.trim()
 if (!keyword) {
 setTracks([])
 setError(null)
 setLoading(false)
 return
 }
 if (isWebMode()) {
 setTracks([])
 setLoading(false)
 setError("B站模式暂时只支持客户端")
 return
 }

 let cancelled = false
 setLoading(true)
 setError(null)
 void searchBilibiliMusic(keyword,30)
 .then((items) => {
 if (cancelled) {
 return
 }
 setTracks(items)
 setLoading(false)
 })
 .catch((reason: unknown) => {
 if (cancelled) {
 return
 }
 setTracks([])
 setLoading(false)
 setError(
 reason instanceof Error
 ? reason.message
 : "搜索暂时不可用",
 )
 })
 return () => {
 cancelled = true
 }
 }, [revision, submitted])

 function runSearch() {
 const keyword = query.trim()
 if (!keyword) {
 return
 }
 addSearchHistory(keyword)
 if (keyword === submitted) {
 setRevision((value) => value +1)
 return
 }
 setSubmitted(keyword)
 }

 function runHistorySearch(keyword: string) {
 setQuery(keyword)
 setSubmitted(keyword)
 setInputFocused(false)
 }

 return (
 <div className="space-y-6">
 <h1 className="sr-only">搜索音乐</h1>
 <div className="relative">
 <div className="flex gap-2">
 <label className="material-field flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-3.5">
 <SearchIcon
 className="size-4 shrink-0 text-muted-foreground"
 aria-hidden="true"
 />
 <input
 type="search"
 name="bilibili-search"
 aria-label="搜索音乐"
 autoComplete="off"
 spellCheck={false}
 enterKeyHint="search"
 value={query}
 onFocus={() => setInputFocused(true)}
 onBlur={() =>
 window.setTimeout(
 () => setInputFocused(false),
120,
 )
 }
 onChange={(event) =>
 setQuery(event.currentTarget.value)
 }
 onKeyDown={(event) => {
 if (event.key === "Enter") {
 event.preventDefault()
 runSearch()
 }
 }}
 placeholder="歌曲、翻唱、音乐现场…"
 className="h-full w-full bg-transparent text-[14px] outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
 />
 </label>
 <button
 type="button"
 disabled={!query.trim() || loading}
 aria-busy={loading}
 onClick={runSearch}
 className="apple-primary-action h-11 shrink-0 cursor-pointer rounded-2xl px-4 text-[13px] font-medium transition-[transform,opacity] hover:opacity-92 active:scale-[0.97] active:duration-[var(--duration-press)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"
 >
 {loading ? "搜索中…" : "搜索"}
 </button>
 </div>

 {inputFocused && !query.trim() && history.length >0 ? (
 <div className="absolute inset-x-0 top-full z-40 mt-2 origin-top overflow-hidden rounded-2xl bg-popover/95 p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.16)] ring-1 ring-foreground/10 backdrop-blur-2xl animate-in fade-in-0 slide-in-from-top-1.5 zoom-in-98 duration-[var(--duration-enter)] ease-[var(--ease-enter)]">
 <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
最近搜索
 </p>
 {history.map((item) => (
 <div
 key={item}
 className="flex w-full items-center rounded-xl transition-colors hover:bg-[var(--surface-fill)]"
 >
 <button
 type="button"
 onClick={() => runHistorySearch(item)}
 className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-ring"
 >
 <HistoryIcon
 className="size-4 shrink-0 text-muted-foreground/50"
 aria-hidden="true"
 />
 <span className="min-w-0 flex-1 truncate text-[13px]">
 {item}
 </span>
 </button>
 <button
 type="button"
 aria-label={`删除 ${item}`}
 onClick={() => removeSearchHistory(item)}
 className="relative mr-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground/60 opacity-60 transition-[opacity,background-color] after:absolute after:-inset-2 after:content-[''] hover:bg-[var(--surface-fill-hover)] hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
 >
 <X
 className="size-3.5"
 aria-hidden="true"
 />
 </button>
 </div>
 ))}
 <button
 type="button"
 onClick={clearSearchHistory}
 className="w-full cursor-pointer py-1.5 text-center text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
 >
清空搜索记录
 </button>
 </div>
 ) : null}
 </div>

 {loading ? (
 <SearchSkeleton />
 ) : error ? (
 <StateHero
 variant="error"
 title="搜索失败"
 description={
 isWebMode()
 ? error
 : `${error}。检查网络后重试`
 }
 action={
 <HeroRetryButton
 onClick={() =>
 setRevision((value) => value +1)
 }
 >
重新搜索
 </HeroRetryButton>
 }
 />
 ) : !submitted ? (
 <StateHero
 variant="search"
 title="搜索音乐"
 description="输入歌曲名、翻唱、演奏或音乐现场"
 />
 ) : tracks.length ===0 ? (
 <StateHero
 variant="search"
 title="没有匹配的音乐"
 description="试试更短的歌曲名，或换一个关键词"
 />
 ) : (
 <Section
 title="歌曲"
 description={`${tracks.length}首`}
 variant="listen"
 >
 <div className="apple-list-surface p-1.5">
 <VirtualList
 items={tracks}
 itemHeight={58}
 getItemKey={(track) => track.id}
 renderItem={(track, index) => (
 <TrackRow
 track={track}
 index={index}
 showSource={false}
 isActive={currentTrack?.id === track.id}
 isPlaying={
 currentTrack?.id ===
 track.id && isPlaying
 }
 onPlay={(item) =>
 playOrToggle(item, tracks)
 }
 />
 )}
 />
 </div>
 </Section>
 )}
 </div>
 )
}

export { BilibiliSearchPage }
