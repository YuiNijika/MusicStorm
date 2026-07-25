import type { Track, TrackArtist } from "@/lib/types"

type NeteaseArtist = { id?: number | string; name?: string }
type NeteaseAlbum = { id?: number | string; name?: string; picUrl?: string }

type NeteaseSong = {
    id: number
    name: string
    ar?: NeteaseArtist[]
    artists?: NeteaseArtist[]
    al?: NeteaseAlbum
    album?: NeteaseAlbum
    dt?: number
    duration?: number
}

function mapArtists(song: NeteaseSong): TrackArtist[] {
    const raw = song.ar ?? song.artists ?? []
    return raw
        .map((item) => {
            const name = item.name?.trim()
            if (!name) {
                return null
            }
            const id = item.id != null ? String(item.id) : ""
            return { id, name }
        })
        .filter((item): item is TrackArtist => item != null)
}

function mapNeteaseSongToTrack(song: NeteaseSong): Track {
    const artists = mapArtists(song)
    const album = song.al ?? song.album
    const durationMs = song.dt ?? song.duration ?? 0
    const albumId = album?.id != null ? String(album.id) : undefined

    return {
        id: String(song.id),
        title: song.name,
        artist: artists.map((item) => item.name).join(" / ") || "未知艺人",
        album: album?.name ?? "未知专辑",
        coverUrl: album?.picUrl ? `${album.picUrl}?param=400y400` : "",
        durationMs,
        source: "netease",
        artists: artists.length > 0 ? artists : undefined,
        albumId,
    }
}

export { mapNeteaseSongToTrack }
export type { NeteaseSong }