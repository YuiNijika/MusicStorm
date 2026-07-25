import { ImagePlus, Loader2, RotateCcw, Search } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import { Cover } from "@/components/music/cover"
import { NeteaseAlbumPickerDialog } from "@/components/music/netease-album-picker"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { fetchImageAsDataUrl, pickImageAsDataUrl } from "@/lib/local/cover"
import type { AlbumDraft } from "@/lib/local/library-store"
import type { NeteaseAlbumHit } from "@/lib/netease/search"
import { notifyError, notifySuccess } from "@/lib/notify"
import { cn } from "@/lib/utils"

export type LocalAlbumDrawerMode = "create" | "folder"

export type LocalAlbumDrawerProps = {
    open: boolean
    mode: LocalAlbumDrawerMode
    initial: AlbumDraft
    submitting?: boolean
    onOpenChange: (open: boolean) => void
    onSubmit: (draft: AlbumDraft) => void | Promise<void>
}

function LocalAlbumDrawer({
    open,
    mode,
    initial,
    submitting = false,
    onOpenChange,
    onSubmit,
}: LocalAlbumDrawerProps) {
    const [title, setTitle] = useState(initial.title)
    const [artist, setArtist] = useState(initial.artist)
    const [coverDataUrl, setCoverDataUrl] = useState(initial.coverDataUrl)
    const [folderPath, setFolderPath] = useState(initial.folderPath)
    const [pickerOpen, setPickerOpen] = useState(false)
    const [coverBusy, setCoverBusy] = useState(false)

    useEffect(() => {
        if (!open) {
            return
        }
        setTitle(initial.title)
        setArtist(initial.artist)
        setCoverDataUrl(initial.coverDataUrl)
        setFolderPath(initial.folderPath)
    }, [open, initial])

    async function handlePickCover() {
        setCoverBusy(true)
        try {
            const dataUrl = await pickImageAsDataUrl()
            if (dataUrl) {
                setCoverDataUrl(dataUrl)
                notifySuccess("已选择封面")
            }
        } catch (error) {
            notifyError("选择封面失败", {
                description: error instanceof Error ? error.message : "请重试",
            })
        } finally {
            setCoverBusy(false)
        }
    }

    async function handleNeteasePick(hit: NeteaseAlbumHit) {
        setCoverBusy(true)
        try {
            setTitle(hit.title)
            setArtist(hit.artistName)
            if (hit.coverUrl) {
                const dataUrl = await fetchImageAsDataUrl(hit.coverUrl)
                setCoverDataUrl(dataUrl)
            }
            notifySuccess("已应用网易云专辑信息")
            setPickerOpen(false)
        } catch (error) {
            // 名称艺人仍写入，封面失败单独提示
            setTitle(hit.title)
            setArtist(hit.artistName)
            notifyError("封面下载失败", {
                description: error instanceof Error ? error.message : "名称与艺人已填入",
            })
            setPickerOpen(false)
        } finally {
            setCoverBusy(false)
        }
    }

    function handleSubmit() {
        void onSubmit({
            title: title.trim() || "未命名专辑",
            artist: artist.trim(),
            coverDataUrl,
            folderPath,
        })
    }

    return (
        <>
            <Drawer open={open} onOpenChange={onOpenChange}>
                <DrawerContent className="w-full max-w-none rounded-t-[28px] border-border/60 bg-background/96 px-0 pb-0 shadow-[0_30px_120px_rgba(15,23,42,0.22)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#10131a]/96">
                    <div className="px-4 pt-3">
                        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-black/10 dark:bg-white/15" />
                    </div>

                    <DrawerHeader className="px-4 pb-3 text-left">
                        <DrawerTitle className="text-[20px] font-semibold tracking-[-0.03em]">
                            {mode === "folder" ? "导入本地专辑" : "创建专辑"}
                        </DrawerTitle>
                        <DrawerDescription className="text-[13px] leading-relaxed">
                            {mode === "folder"
                                ? "确认专辑信息后开始扫描文件夹。将解析内嵌封面与歌词，也可手动指定封面。"
                                : "创建专辑元数据，可稍后关联文件夹。支持手动封面或从网易云填入信息。"}
                        </DrawerDescription>
                    </DrawerHeader>

                    <div className="max-h-[min(58vh,520px)] space-y-5 overflow-y-auto px-4 pb-4">
                        {folderPath ? (
                            <div className="rounded-2xl bg-black/[0.04] px-3.5 py-2.5 dark:bg-white/[0.05]">
                                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                    文件夹
                                </p>
                                <p className="mt-0.5 break-all text-[13px] text-foreground/90">
                                    {folderPath}
                                </p>
                            </div>
                        ) : null}

                        <div className="grid gap-4 sm:grid-cols-[132px_minmax(0,1fr)]">
                            <div className="space-y-2">
                                <Cover
                                    src={coverDataUrl}
                                    alt={title || "封面"}
                                    className="size-[132px] rounded-[22px]"
                                />
                                <div className="flex flex-col gap-1.5">
                                    <button
                                        type="button"
                                        disabled={coverBusy}
                                        onClick={() => void handlePickCover()}
                                        className={cn(
                                            "flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl",
                                            "bg-black/[0.05] text-[12px] font-medium active:scale-[0.98]",
                                            "disabled:opacity-50 dark:bg-white/[0.08]",
                                        )}
                                    >
                                        {coverBusy ? (
                                            <Loader2 className="size-3.5 animate-spin" />
                                        ) : (
                                            <ImagePlus className="size-3.5" />
                                        )}
                                        选择图片
                                    </button>
                                    {coverDataUrl ? (
                                        <button
                                            type="button"
                                            disabled={coverBusy}
                                            onClick={() => setCoverDataUrl("")}
                                            className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-black/[0.05] text-[12px] font-medium active:scale-[0.98] dark:bg-white/[0.08]"
                                        >
                                            <RotateCcw className="size-3.5" />
                                            清除封面
                                        </button>
                                    ) : null}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Field label="专辑名称">
                                    <Input
                                        value={title}
                                        onChange={(event) => setTitle(event.currentTarget.value)}
                                        placeholder="例如：一周音乐精选"
                                        className="h-11 rounded-2xl border-border/70 bg-background/70"
                                    />
                                </Field>
                                <Field label="艺人 / 作者">
                                    <Input
                                        value={artist}
                                        onChange={(event) => setArtist(event.currentTarget.value)}
                                        placeholder="可选"
                                        className="h-11 rounded-2xl border-border/70 bg-background/70"
                                    />
                                </Field>
                                <button
                                    type="button"
                                    disabled={coverBusy}
                                    onClick={() => setPickerOpen(true)}
                                    className={cn(
                                        "flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl",
                                        "bg-foreground text-[13px] font-medium text-background",
                                        "active:scale-[0.98] disabled:opacity-50",
                                    )}
                                >
                                    <Search className="size-4" />
                                    从网易云获取信息
                                </button>
                            </div>
                        </div>
                    </div>

                    <DrawerFooter className="border-t border-border/60 bg-background/90 px-4 py-4 backdrop-blur dark:border-white/10">
                        <div className="flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                disabled={submitting}
                                onClick={() => onOpenChange(false)}
                                className="h-10 cursor-pointer rounded-full bg-black/[0.05] px-4 text-[13px] font-medium active:scale-[0.97] dark:bg-white/[0.08]"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                disabled={submitting || (mode === "folder" && !folderPath)}
                                onClick={handleSubmit}
                                className={cn(
                                    "flex h-10 cursor-pointer items-center gap-2 rounded-full bg-foreground px-5 text-[13px] font-medium text-background",
                                    "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
                                )}
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="size-4 animate-spin" />
                                        {mode === "folder" ? "扫描中…" : "保存中…"}
                                    </>
                                ) : mode === "folder" ? (
                                    "确认导入"
                                ) : (
                                    "创建专辑"
                                )}
                            </button>
                        </div>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>

            <NeteaseAlbumPickerDialog
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                seedQuery={title}
                onPick={(hit) => void handleNeteasePick(hit)}
            />
        </>
    )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
            {children}
        </label>
    )
}

export { LocalAlbumDrawer }