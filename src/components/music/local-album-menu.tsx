import { FilePlus2, MoreHorizontal, Pencil, RefreshCw, Trash2 } from "lucide-react"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { LocalAlbum } from "@/lib/local/library-store"
import { cn } from "@/lib/utils"

type LocalAlbumMenuProps = {
    album: LocalAlbum
    busy?: boolean
    overlay?: boolean
    onAddTracks?: (album: LocalAlbum) => void
    onEdit: (album: LocalAlbum) => void
    onRescan: (album: LocalAlbum) => void
    onDelete: (album: LocalAlbum) => void
}

function LocalAlbumMenu({
    album,
    busy = false,
    overlay = false,
    onAddTracks,
    onEdit,
    onRescan,
    onDelete,
}: LocalAlbumMenuProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                type="button"
                title="更多操作"
                aria-label={`${album.title} 更多操作`}
                onClick={(event) => event.stopPropagation()}
                className={cn(
                    "flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors active:scale-[0.95]",
                    overlay
                        ? "bg-black/55 text-white opacity-100 backdrop-blur-md sm:opacity-0 sm:group-hover:opacity-100 data-popup-open:opacity-100"
                        : "bg-black/[0.05] text-foreground hover:bg-black/[0.08] dark:bg-white/[0.1] dark:hover:bg-white/[0.14]",
                )}
            >
                <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="min-w-40">
                {onAddTracks ? (
                    <DropdownMenuItem
                        disabled={busy}
                        onClick={() => onAddTracks(album)}
                    >
                        <FilePlus2 />
                        添加音乐
                    </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => onEdit(album)}>
                    <Pencil />
                    编辑专辑
                </DropdownMenuItem>
                <DropdownMenuItem
                    disabled={!album.folderPath || busy}
                    onClick={() => onRescan(album)}
                >
                    <RefreshCw className={cn(busy && "animate-spin")} />
                    重新扫描
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(album)}
                >
                    <Trash2 />
                    删除专辑
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export { LocalAlbumMenu }