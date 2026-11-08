import {
    searchNeteaseAll,
    type NeteaseSearchBundle,
} from "@/lib/netease/search"

type OnlineSearchBundle = NeteaseSearchBundle

async function searchOnline(keyword: string): Promise<OnlineSearchBundle> {
    const trimmed = keyword.trim()
    if (!trimmed) {
        return {
            tracks: [],
            artists: [],
            albums: [],
            playlists: [],
            radios: [],
        }
    }
    return searchNeteaseAll(trimmed)
}

export { searchOnline }
export type { OnlineSearchBundle }
