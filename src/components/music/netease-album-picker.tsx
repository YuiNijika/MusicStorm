import { Loader2, Search } from "lucide-react"
import { useEffect, useState } from "react"

import { Cover } from "@/components/music/cover"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
    searchNeteaseAlbums,
    type NeteaseAlbumHit,
} from "@/lib/netease/search"
import { notifyError } from "@/lib/notify"
import { cn } from "@/lib/utils"

type NeteaseAlbumPickerDialogProps = {
    open: boolean
    seedQuery?: string
    onOpenChange: (open: boolean) => void
    onPick: (album: NeteaseAlbumHit) => void
}

function NeteaseAlbumPickerDialog({
    open,
    seedQuery = "",
    onOpenChange,
    onPick,
}: NeteaseAlbumPickerDialogProps) {
    const [query, setQuery] = useState(seedQuery)
    const [results, setResults] = useState<NeteaseAlbumHit[]>([])
    const [loading, setLoading] = useState(false)
    const [searched, setSearched] = useState(false)

    useEffect(() => {
        if (!open) {
            return
        }
        setQuery(seedQuery)
        setResults([])
        setSearched(false)
        setLoading(false)
    }, [open, seedQuery])

    async function runSearch() {
        const keyword = query.trim()
        if (!keyword) {
            return
        }
        setLoading(true)
        setSearched(true)
        try {
            const albums = await searchNeteaseAlbums(keyword)
            setResults(albums)
        } catch (error) {
            setResults([])
            notifyError("专辑搜索失败", {
                description: error instanceof Error ? error.message : "请稍后重试",
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    // 限制高度，内部滚动，避免内容溢出视口；盖过底部 Drawer
                    "z-[60] flex max-h-[min(85vh,560px)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
                )}
            >
                <DialogHeader className="shrink-0 space-y-1 border-b border-border/50 px-4 py-4 pr-12 text-left">
                    <DialogTitle className="text-[17px] font-semibold tracking-[-0.02em]">
                        网易云专辑
                    </DialogTitle>
                    <DialogDescription className="text-[13px]">
                        搜索并选择专辑，自动填入名称、艺人与封面
                    </DialogDescription>
                </DialogHeader>

                <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                    <div className="flex shrink-0 gap-2">
                        <div className="material-field flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-3">
                            <Search className="size-3.5 shrink-0 text-muted-foreground" />
                            <Input
                                value={query}
                                onChange={(event) => setQuery(event.currentTarget.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault()
                                        void runSearch()
                                    }
                                }}
                                placeholder="专辑名 / 艺人"
                                className="h-full border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
                            />
                        </div>
                        <button
                            type="button"
                            disabled={!query.trim() || loading}
                            onClick={() => void runSearch()}
                            className={cn(
                                "h-10 shrink-0 cursor-pointer rounded-xl bg-foreground px-3.5 text-[13px] font-medium text-background",
                                "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
                            )}
                        >
                            {loading ? "搜索中…" : "搜索"}
                        </button>
                    </div>

                    <div className="apple-scroll min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5">
                        {loading ? (
                            <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-muted-foreground">
                                <Loader2 className="size-4 animate-spin" />
                                搜索中…
                            </div>
                        ) : results.length > 0 ? (
                            results.map((album) => (
                                <button
                                    key={album.id}
                                    type="button"
                                    onClick={() => onPick(album)}
                                    className={cn(
                                        "flex w-full cursor-pointer items-center gap-3 rounded-2xl px-2 py-2 text-left",
                                        "hover:bg-black/[0.04] active:scale-[0.995] dark:hover:bg-white/[0.06]",
                                    )}
                                >
                                    <Cover
                                        src={album.coverUrl}
                                        alt={album.title}
                                        size="md"
                                        className="size-12 shrink-0 rounded-xl"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[14px] font-medium">
                                            {album.title}
                                        </p>
                                        <p className="truncate text-[12px] text-muted-foreground">
                                            {album.artistName}
                                            {album.year ? ` · ${album.year}` : ""}
                                            {album.trackCount
                                                ? ` · ${album.trackCount} 首`
                                                : ""}
                                        </p>
                                    </div>
                                </button>
                            ))
                        ) : (
                            <p className="py-10 text-center text-[13px] text-muted-foreground">
                                {searched ? "没有匹配的专辑" : "输入关键词后搜索"}
                            </p>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export { NeteaseAlbumPickerDialog }