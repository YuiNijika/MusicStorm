export type MusicSource = "local" | "netease"

export type TrackArtist = {
    id: string
    name: string
}

export type Track = {
    id: string
    title: string
    artist: string
    album: string
    coverUrl: string
    durationMs: number
    source: MusicSource
    /** 可直接播放的 URL；网易云后续由 API 解析写入 */
    url?: string
    /** 本地绝对路径；播放时 convertFileSrc */
    filePath?: string
    /** 码率 kbps，扫描写入后用于高音质判定 */
    bitrateKbps?: number
    /** 网易云艺人列表 */
    artists?: TrackArtist[]
    /** 网易云专辑 id */
    albumId?: string
    /** 本地内嵌或 sidecar 歌词全文 */
    lyricText?: string
    /** 本地 sidecar lrc 绝对路径 */
    lrcPath?: string
    /** 本地无扩展名文件名，统计归类 */
    fileName?: string
    /** 本地内容 MD5，统计归类 */
    contentHash?: string
}

export type Playlist = {
    id: string
    title: string
    coverUrl: string
    trackIds: string[]
    source: MusicSource
    description?: string
    trackCount?: number
}

export type Radio = {
    id: string
    title: string
    coverUrl: string
    description?: string
    /** 节目数 */
    programCount?: number
    /** 主播名 */
    djName?: string
    category?: string
}

export type RadioProgram = {
    id: string
    title: string
    coverUrl: string
    description?: string
    durationMs: number
    radioId?: string
    radioTitle?: string
    djName?: string
    listenerCount?: number
    createTime?: number
    /** 可播放曲目 */
    track: Track
}

export type RepeatMode = "off" | "all" | "one"

export type PlayerSnapshot = {
    queue: Track[]
    currentIndex: number
    isPlaying: boolean
    positionMs: number
    durationMs: number
    volume: number
    isMuted: boolean
    shuffle: boolean
    repeat: RepeatMode
}