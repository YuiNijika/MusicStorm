import { ImagePlus, Loader2, RotateCcw } from "lucide-react"
import { useEffect, useState } from "react"

import { Cover } from "@/components/music/cover"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { pickImageAsDataUrl } from "@/lib/local/cover"
import { notifyError, notifySuccess } from "@/lib/notify"
import { cn } from "@/lib/utils"

export type ArtistDraft = {
    name: string
    coverDataUrl: string
}

export type LocalArtistDrawerProps = {
    open: boolean
    initial: ArtistDraft
    submitting?: boolean
    onOpenChange: (open: boolean) => void
    onSubmit: (draft: ArtistDraft) => void | Promise<void>
}

function LocalArtistDrawer({
    open,
    initial,
    submitting = false,
    onOpenChange,
    onSubmit,
}: LocalArtistDrawerProps) {
    const [name, setName] = useState(initial.name)
    const [coverDataUrl, setCoverDataUrl] = useState(initial.coverDataUrl)
    const [coverBusy, setCoverBusy] = useState(false)

    useEffect(() => {
        if (!open) {
            return
        }
        setName(initial.name)
        setCoverDataUrl(initial.coverDataUrl)
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

    function handleSubmit() {
        void onSubmit({
            name: name.trim() || "未命名艺人",
            coverDataUrl,
        })
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="w-full max-w-none rounded-t-[28px] border-border/60 bg-background/96 px-0 pb-0 shadow-[0_30px_120px_rgba(15,23,42,0.22)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#10131a]/96">
                <div className="px-4 pt-3">
                    <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-black/10 dark:bg-white/15" />
                </div>

                <DrawerHeader className="px-4 pb-3 text-left">
                    <DrawerTitle className="text-[20px] font-semibold tracking-[-0.03em]">
                        编辑艺人 / 合集
                    </DrawerTitle>
                    <DrawerDescription className="text-[13px] leading-relaxed">
                        修改艺人分组名称或封面。改名会同步更新其下专辑的艺人字段。
                    </DrawerDescription>
                </DrawerHeader>

                <div className="max-h-[min(58vh,520px)] space-y-5 overflow-y-auto px-4 pb-4">
                    <div className="grid gap-4 sm:grid-cols-[132px_minmax(0,1fr)]">
                        <div className="space-y-2">
                            <Cover
                                src={coverDataUrl}
                                alt={name || "封面"}
                                className="size-[132px] rounded-full"
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
                            <label className="block space-y-1.5">
                                <span className="text-[12px] font-medium text-muted-foreground">
                                    艺人 / 合集名称
                                </span>
                                <Input
                                    value={name}
                                    onChange={(event) =>
                                        setName(event.currentTarget.value)
                                    }
                                    placeholder="例如：Beyond"
                                    className="h-11 rounded-2xl border-border/70 bg-background/70"
                                />
                            </label>
                            <p className="text-[12px] leading-relaxed text-muted-foreground">
                                不填封面时，将自动使用其下第一张专辑的封面作为艺人头像。
                            </p>
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
                            disabled={submitting}
                            onClick={handleSubmit}
                            className={cn(
                                "flex h-10 cursor-pointer items-center gap-2 rounded-full bg-foreground px-5 text-[13px] font-medium text-background",
                                "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
                            )}
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" />
                                    保存中…
                                </>
                            ) : (
                                "保存"
                            )}
                        </button>
                    </div>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    )
}

export { LocalArtistDrawer }
