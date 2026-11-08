"use client"

import { Check, Copy, QrCode, Share2 } from "lucide-react"
import { useEffect, useState } from "react"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { SharePlatformIcon } from "@/components/music/share-icons"
import { openExternalUrl } from "@/lib/open-external"
import { isWebMode } from "@/lib/web-mode"
import {
    SHARE_TARGETS,
    buildAppLink,
    buildPlayLink,
    buildShareSummary,
    buildShareTitle,
    copyText,
    isShareableTrack,
    type SharePlatformId,
    type ShareTarget,
} from "@/lib/share/share"
import type { Track } from "@/lib/types"
import { cn } from "@/lib/utils"

// 公开二维码生成接口：把分享链接编码成二维码，用于微信/朋友圈网页端无法直接拉起的场景
function qrUrl(link: string): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&bgcolor=ffffff&data=${encodeURIComponent(link)}`
}

const QR_DIM = cn("rounded-md bg-white p-1.5")

function ShareSheet({
    open,
    onOpenChange,
    track,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    track: Track | null
}) {
    const [active, setActive] = useState<SharePlatformId | null>(null)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (!open) {
            setActive(null)
            setCopied(false)
        }
    }, [open])

    if (!isShareableTrack(track)) {
        return null
    }

    const link = buildPlayLink(track!)
    if (!link) {
        return null
    }
    const title = buildShareTitle(track!)
    const summary = buildShareSummary(track!)
    const activeTarget = SHARE_TARGETS.find((target) => target.id === active)

    async function handleStart(target: ShareTarget) {
        // 面板型平台（微信/朋友圈）无公开网页分享接口：切到复制/扫码面板
        if (target.panel) {
            setActive(target.id)
            return
        }
        const url = target.buildUrl(link!, title, summary)
        if (url) {
            await openExternalUrl(url)
        }
    }

    async function handleCopy() {
        if (!link) {
            return
        }
        if (await copyText(link)) {
            setCopied(true)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="gap-4 overflow-hidden">
                <DialogHeader>
                    <DialogTitle>分享「{track?.title}」</DialogTitle>
                    <DialogDescription>
                        对方打开链接即可在线播放这首歌
                    </DialogDescription>
                </DialogHeader>

                {activeTarget ? (
                    <div className="flex flex-col items-center gap-2.5">
                        <div className="flex items-center gap-2.5 rounded-2xl bg-[var(--surface-fill)] px-4 py-3">
                            <SharePlatformIcon id={activeTarget.id} />
                            <span className="text-[13px] font-medium">
                                {activeTarget.label}
                            </span>
                        </div>
                        <p className="text-center text-[12px] text-muted-foreground">
                            网页端无法直接拉起，请扫码或复制链接后在应用内打开
                        </p>
                        <div className={QR_DIM}>
                            <img
                                src={qrUrl(link)}
                                alt={`${activeTarget.label} 二维码`}
                                loading="lazy"
                                decoding="async"
                                width={176}
                                height={176}
                                className="rounded-md"
                            />
                        </div>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setActive(null)}
                        >
                            返回选择平台
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                        {SHARE_TARGETS.map((target) => (
                            <button
                                key={target.id}
                                type="button"
                                onClick={() => void handleStart(target)}
                                className={cn(
                                    "flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl p-2",
                                    "transition-[background-color,transform] hover:bg-[var(--surface-fill)]",
                                    "active:scale-[0.97] active:duration-[var(--duration-press)]",
                                )}
                            >
                                <SharePlatformIcon id={target.id} />
                                <span className="text-[11px] text-muted-foreground">
                                    {target.label}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                {/* 仅网页端展示；已安装/正在使用应用内不提示（避免自指） */}
                {isWebMode() ? (
                    (() => {
                        const appLink = buildAppLink(track!)
                        return appLink ? (
                            <button
                                type="button"
                                onClick={() => {
                                    window.location.href = appLink
                                }}
                                className={cn(
                                    "flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2.5 py-2",
                                    "text-[12px] font-medium text-foreground/75",
                                    "border border-[var(--separator)] bg-[var(--surface-fill)] hover:text-foreground",
                                    "active:scale-[0.98] active:duration-[var(--duration-press)]",
                                )}
                            >
                                <Share2 className="size-3.5" />
                                在 MusicStorm 应用中打开
                            </button>
                        ) : null
                    })()
                ) : null}

                <div className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-[var(--separator)] bg-[var(--surface-fill)] px-3 py-2">
                    <QrCode className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                        {link}
                    </span>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCopy}
                        className="shrink-0 gap-1"
                    >
                        {copied ? (
                            <Check className="size-3.5" />
                        ) : (
                            <Copy className="size-3.5" />
                        )}
                        {copied ? "已复制" : "复制"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export { ShareSheet }
export type { SharePlatformId }