import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    clearLyricOverride,
    getLyricOverride,
    setLyricOverride,
} from "@/lib/lyric/overrides"
import { fetchLyricText } from "@/lib/netease/lyric"
import { notifyError, notifySuccess } from "@/lib/notify"
import type { Track } from "@/lib/types"

type LyricEditDialogProps = {
    track: Track | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

// 歌词在线编辑：保存后写入本地覆盖，优先于网易云 / 本地原歌词显示
function LyricEditDialog({ track, open, onOpenChange }: LyricEditDialogProps) {
    const [text, setText] = useState("")
    const [loading, setLoading] = useState(false)
    const [hasOverride, setHasOverride] = useState(false)

    useEffect(() => {
        if (!open || !track) {
            return
        }
        let cancelled = false
        setLoading(true)
        const override = getLyricOverride(track.id)
        setHasOverride(Boolean(override))
        if (override) {
            setText(override)
            setLoading(false)
            return
        }
        void (async () => {
            try {
                // 无覆盖：优先本地短文本，网易云曲目再拉接口
                let source = track.lyricText?.trim() ?? ""
                if (!source && track.source === "netease") {
                    source = await fetchLyricText(track.id)
                }
                if (!cancelled) {
                    setText(source)
                }
            } catch (error) {
                if (!cancelled) {
                    notifyError("歌词加载失败", {
                        description:
                            error instanceof Error ? error.message : "请重试",
                    })
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        })()
        return () => {
            cancelled = true
        }
    }, [open, track])

    function handleSave() {
        if (!track) {
            return
        }
        const trimmed = text.trim()
        if (!trimmed) {
            notifyError("歌词不能为空")
            return
        }
        setLyricOverride(track.id, trimmed)
        notifySuccess("歌词已保存", {
            description: "已覆盖原歌词，播放时优先显示",
        })
        onOpenChange(false)
    }

    function handleRestore() {
        if (!track) {
            return
        }
        clearLyricOverride(track.id)
        notifySuccess("已恢复原歌词")
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>编辑歌词</DialogTitle>
                    <DialogDescription>
                        {track
                            ? `${track.title} · ${track.artist || "未知艺人"}`
                            : ""}
                    </DialogDescription>
                </DialogHeader>

                <textarea
                    value={text}
                    onChange={(event) => setText(event.currentTarget.value)}
                    disabled={loading}
                    spellCheck={false}
                    placeholder={
                        loading
                            ? "正在加载歌词…"
                            : "[00:12.00] 歌词时间轴格式\n[00:15.50] 每行一个时间点"
                    }
                    className="h-64 w-full resize-none rounded-2xl bg-[var(--surface-fill)] p-3 font-mono text-[12.5px] leading-relaxed text-foreground outline-none ring-1 ring-black/[0.06] placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40 disabled:opacity-50 dark:ring-white/[0.08]"
                />

                <p className="-mt-2 text-[11px] text-muted-foreground">
                    编辑后的歌词保存在本地，优先于网易云歌词显示；支持 LRC
                    时间轴格式
                </p>

                <DialogFooter>
                    {hasOverride ? (
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleRestore}
                        >
                            恢复原歌词
                        </Button>
                    ) : null}
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => onOpenChange(false)}
                    >
                        取消
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={loading}
                    >
                        保存
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export { LyricEditDialog }
