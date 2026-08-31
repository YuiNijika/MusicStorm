import { NETEASE_PATHS } from "@/lib/netease/paths"
import { md5Hex } from "@/lib/netease/native/md5"

export type CryptoKind = "weapi" | "eapi" | "api" | "local"

export type NativeModuleSpec = {
    /** 上游 /api 路径，可含已替换 id */
    uri: string
    data: Record<string, unknown>
    crypto: CryptoKind
    /** 本地合成响应，不发网，如二维码 URL */
    localBody?: unknown
}

type Query = Record<string, string | number | boolean | undefined>

function q(query: Query, key: string, fallback?: string): string {
    const value = query[key]
    if (value === undefined || value === null || value === "") {
        return fallback ?? ""
    }
    return String(value)
}

function qNum(query: Query, key: string, fallback: number): number {
    const raw = query[key]
    if (raw === undefined || raw === null || raw === "") {
        return fallback
    }
    const n = Number(raw)
    return Number.isFinite(n) ? n : fallback
}

function resolveNativeModule(path: string, query: Query): NativeModuleSpec {
    switch (path) {
        case NETEASE_PATHS.songUrl: {
            const ids = q(query, "id").split(",").filter(Boolean)
            return {
                uri: "/api/song/enhance/player/url",
                data: {
                    ids: JSON.stringify(ids),
                    br: qNum(query, "br", 999_000),
                },
                crypto: "eapi",
            }
        }
        case NETEASE_PATHS.songDetail: {
            const ids = q(query, "ids")
                .split(/[,\s]+/)
                .filter(Boolean)
            return {
                uri: "/api/v3/song/detail",
                data: {
                    c: `[${ids.map((id) => `{"id":${id}}`).join(",")}]`,
                },
                crypto: "eapi",
            }
        }
        case NETEASE_PATHS.songDetailV1:
            // 旧版 v1 接口才有 starredNum（红心量），v3 不返回；纯 POST 明文即可
            return {
                uri: "/api/song/detail",
                data: { ids: `[${q(query, "id")}]` },
                crypto: "api",
            }
        case NETEASE_PATHS.lyric:
            return {
                uri: "/api/song/lyric",
                data: {
                    id: q(query, "id"),
                    tv: -1,
                    lv: -1,
                    rv: -1,
                    kv: -1,
                    _nmclfl: 1,
                },
                crypto: "eapi",
            }
        case NETEASE_PATHS.search:
            return {
                uri: "/api/cloudsearch/pc",
                data: {
                    s: q(query, "keywords") || q(query, "s"),
                    type: qNum(query, "type", 1),
                    limit: qNum(query, "limit", 30),
                    offset: qNum(query, "offset", 0),
                    total: true,
                },
                crypto: "eapi",
            }
        case NETEASE_PATHS.playlistDetail:
            return {
                uri: "/api/v6/playlist/detail",
                data: {
                    id: q(query, "id"),
                    n: 100_000,
                    s: qNum(query, "s", 8),
                },
                crypto: "eapi",
            }
        case NETEASE_PATHS.playlistSubscribe: {
            const t = qNum(query, "t", 1)
            const sub = t === 1 ? "subscribe" : "unsubscribe"
            return {
                uri: `/api/playlist/${sub}`,
                data: { id: q(query, "id") },
                crypto: "eapi",
            }
        }
        case NETEASE_PATHS.playlistCreate:
            return {
                uri: "/api/playlist/create",
                data: {
                    name: q(query, "name"),
                    privacy: q(query, "privacy", "0"),
                    type: q(query, "type", "NORMAL"),
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.playlistUpdateName:
            return {
                uri: "/api/playlist/update/name",
                data: {
                    id: q(query, "id"),
                    name: q(query, "name"),
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.playlistDescUpdate:
            return {
                uri: "/api/playlist/desc/update",
                data: {
                    id: q(query, "id"),
                    desc: q(query, "desc"),
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.personalized:
            return {
                uri: "/api/personalized/playlist",
                data: {
                    limit: qNum(query, "limit", 30),
                    total: true,
                    n: 1000,
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.recommendSongs:
            return {
                uri: "/api/v3/discovery/recommend/songs",
                data: { afresh: query.afresh },
                crypto: "weapi",
            }
        case NETEASE_PATHS.loginQrKey:
            return {
                uri: "/api/login/qrcode/unikey",
                data: { type: 3 },
                crypto: "eapi",
            }
        case NETEASE_PATHS.loginQrCreate: {
            // 本地只合成 qrurl；qrimg 由 auth 层用 qrurl 生成 data-URL
            const key = q(query, "key")
            const qrurl = `https://music.163.com/login?codekey=${key}`
            return {
                uri: "",
                data: {},
                crypto: "local",
                localBody: {
                    code: 200,
                    data: {
                        qrurl,
                        qrimg: "",
                    },
                },
            }
        }
        case NETEASE_PATHS.loginQrCheck:
            return {
                uri: "/api/login/qrcode/client/login",
                data: {
                    key: q(query, "key"),
                    type: 3,
                },
                crypto: "eapi",
            }
        case NETEASE_PATHS.captchaSent:
            return {
                uri: "/api/sms/captcha/sent",
                data: {
                    ctcode: q(query, "ctcode", "86"),
                    secrete: "music_middleuser_pclogin",
                    cellphone: q(query, "phone"),
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.loginCellphone: {
            const captcha = q(query, "captcha")
            const password = q(query, "password")
            const md5Password = q(query, "md5_password")
            // 前端传 ctcode，上游字段是 countrycode
            const countrycode =
                q(query, "countrycode") || q(query, "ctcode", "86")
            const data: Record<string, unknown> = {
                type: "1",
                https: "true",
                phone: q(query, "phone"),
                countrycode,
                remember: "true",
                secureCaptcha: q(query, "sca"),
            }
            if (captcha) {
                data.captcha = captcha
            } else {
                data.password = md5Password || md5Hex(password)
            }
            return {
                uri: "/api/w/login/cellphone",
                data,
                crypto: "weapi",
            }
        }
        case NETEASE_PATHS.userAccount:
            // 对齐 Node 版 login_status.js：带 w/ 的网页端接口才会下发 __csrf，
            // 供创建歌单等需要 csrf_token 的 weapi 写接口使用
            return {
                uri: "/api/w/nuser/account/get",
                data: {},
                crypto: "weapi",
            }
        case NETEASE_PATHS.userPlaylist:
            return {
                uri: "/api/user/playlist",
                data: {
                    uid: q(query, "uid"),
                    limit: qNum(query, "limit", 30),
                    offset: qNum(query, "offset", 0),
                    includeVideo: true,
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.likelist:
            return {
                uri: "/api/song/like/get",
                data: { uid: q(query, "uid") },
                crypto: "eapi",
            }
        case NETEASE_PATHS.like: {
            const likeRaw = query.like
            const like =
                likeRaw === false || likeRaw === "false" ? false : true
            return {
                uri: "/api/radio/like",
                data: {
                    alg: "itembased",
                    trackId: q(query, "id"),
                    like,
                    time: "3",
                },
                crypto: "weapi",
            }
        }
        case NETEASE_PATHS.commentMusic:
            return {
                uri: `/api/v1/resource/comments/R_SO_4_${q(query, "id")}`,
                data: {
                    rid: q(query, "id"),
                    limit: qNum(query, "limit", 20),
                    offset: qNum(query, "offset", 0),
                    beforeTime: qNum(query, "before", 0),
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.comment: {
            const t = qNum(query, "t", 1)
            const data: Record<string, unknown> = {
                threadId: `R_SO_4_${q(query, "id")}`,
                type: qNum(query, "type", 1),
                t,
                content: q(query, "content"),
            }
            // 回复评论带上被回复的 commentId（普通评论不传）
            if (query.commentId != null) {
                data.commentId = qNum(query, "commentId", 0)
            }
            return {
                uri:
                    t === 1
                        ? "/api/resource/comments/add"
                        : "/api/resource/comments/delete",
                data,
                crypto: "weapi",
            }
        }
        case NETEASE_PATHS.artists:
            return {
                uri: `/api/v1/artist/${q(query, "id")}`,
                data: {},
                crypto: "weapi",
            }
        case NETEASE_PATHS.artistAlbum:
            return {
                uri: `/api/artist/albums/${q(query, "id")}`,
                data: {
                    limit: qNum(query, "limit", 30),
                    offset: qNum(query, "offset", 0),
                    total: true,
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.artistSongs:
            // 歌手全部歌曲分页：默认热门序，与 /artists 的 hotSongs 前段重叠，
            // 前端从 offset=hotSongs.length 起跳，正好错开热门重叠
            return {
                uri: "/api/v1/artist/songs",
                data: {
                    id: q(query, "id"),
                    limit: qNum(query, "limit", 50),
                    offset: qNum(query, "offset", 0),
                    order: q(query, "order", "hot"),
                    work: 1,
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.artistMv:
            return {
                uri: "/api/artist/mvs",
                data: {
                    artistId: q(query, "id"),
                    limit: query.limit,
                    offset: query.offset,
                    total: true,
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.artistDesc:
            return {
                uri: "/api/artist/introduction",
                data: { id: q(query, "id") },
                crypto: "weapi",
            }
        case NETEASE_PATHS.simiArtist:
            return {
                uri: "/api/discovery/simiArtist",
                data: { artistid: q(query, "id") },
                crypto: "weapi",
            }
        case NETEASE_PATHS.album:
            return {
                uri: `/api/v1/album/${q(query, "id")}`,
                data: {},
                crypto: "weapi",
            }
        case NETEASE_PATHS.playlistTracks:
            return {
                uri: "/api/playlist/manipulate/tracks",
                data: {
                    op: q(query, "op"),
                    pid: q(query, "pid"),
                    trackIds: JSON.stringify(
                        q(query, "tracks").split(",").filter(Boolean),
                    ),
                    imme: "true",
                },
                crypto: "eapi",
            }
        case NETEASE_PATHS.djHot:
            return {
                uri: "/api/djradio/hot/v1",
                data: {
                    limit: qNum(query, "limit", 30),
                    offset: qNum(query, "offset", 0),
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.djRecommend:
            return {
                uri: "/api/djradio/recommend/v1",
                data: {},
                crypto: "weapi",
            }
        case NETEASE_PATHS.djDetail:
            return {
                uri: "/api/djradio/v2/get",
                data: { id: q(query, "rid") || q(query, "id") },
                crypto: "weapi",
            }
        case NETEASE_PATHS.djProgram:
            return {
                uri: "/api/dj/program/byradio",
                data: {
                    radioId: q(query, "rid") || q(query, "id"),
                    limit: qNum(query, "limit", 30),
                    offset: qNum(query, "offset", 0),
                    asc: query.asc === true || query.asc === "true",
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.djProgramDetail:
            return {
                uri: "/api/dj/program/detail",
                data: { id: q(query, "id") },
                crypto: "weapi",
            }
        case NETEASE_PATHS.djSublist:
            return {
                uri: "/api/djradio/get/subed",
                data: {
                    limit: qNum(query, "limit", 1000),
                    offset: qNum(query, "offset", 0),
                    total: true,
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.djSub: {
            const t = qNum(query, "t", 1)
            return {
                uri: "/api/djradio/sub",
                data: {
                    id: q(query, "rid") || q(query, "id"),
                    t,
                },
                crypto: "weapi",
            }
        }
        case NETEASE_PATHS.albumSublist:
            return {
                uri: "/api/album/sublist",
                data: {
                    limit: qNum(query, "limit", 1000),
                    offset: qNum(query, "offset", 0),
                    total: true,
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.albumSub: {
            const t = qNum(query, "t", 1)
            return {
                uri: t === 1 ? "/api/album/sub" : "/api/album/unsub",
                data: { id: q(query, "id") },
                crypto: "weapi",
            }
        }
        case NETEASE_PATHS.mvUrl:
            return {
                uri: "/api/song/enhance/play/mv/url",
                data: {
                    id: q(query, "id"),
                    r: qNum(query, "r", 1080),
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.mvDetail:
            return {
                uri: "/api/v1/mv/detail",
                data: { id: q(query, "mvid") || q(query, "id") },
                crypto: "weapi",
            }
        case NETEASE_PATHS.toplist:
            return {
                uri: "/api/toplist",
                data: {},
                crypto: "eapi",
            }
        case NETEASE_PATHS.albumNew:
            return {
                uri: "/api/album/new",
                data: {
                    limit: qNum(query, "limit", 30),
                    offset: qNum(query, "offset", 0),
                    total: true,
                    area: q(query, "area", "ALL"),
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.topSong:
            return {
                uri: "/api/v1/discovery/new/songs",
                data: {
                    areaId: qNum(query, "type", 0),
                    total: true,
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.personalFm:
            return {
                uri: "/api/v1/radio/get",
                data: {},
                crypto: "weapi",
            }
        case NETEASE_PATHS.fmTrash:
            return {
                uri: "/api/radio/trash/add",
                data: {
                    songId: q(query, "id"),
                    alg: "RT",
                    time: qNum(query, "time", 25),
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.playmodeIntelligenceList: {
            const songId = q(query, "id")
            return {
                uri: "/api/playmode/intelligence/list",
                data: {
                    songId,
                    type: "fromPlayOne",
                    playlistId: q(query, "pid"),
                    startMusicId: q(query, "sid") || songId,
                    count: qNum(query, "count", 1),
                },
                crypto: "eapi",
            }
        }
        case NETEASE_PATHS.userCloud:
            return {
                uri: "/api/v1/cloud/get",
                data: {
                    limit: qNum(query, "limit", 50),
                    offset: qNum(query, "offset", 0),
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.userCloudDel:
            return {
                uri: "/api/cloud/del",
                data: { songIds: [q(query, "id")] },
                crypto: "weapi",
            }
        case NETEASE_PATHS.artistSublist:
            return {
                uri: "/api/artist/sublist",
                data: {
                    limit: qNum(query, "limit", 50),
                    offset: qNum(query, "offset", 0),
                    total: true,
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.artistSub: {
            const sub = qNum(query, "t", 1) === 1 ? "sub" : "unsub"
            return {
                uri: `/api/artist/${sub}`,
                data: {
                    artistId: q(query, "id"),
                    artistIds: `[${q(query, "id")}]`,
                },
                crypto: "weapi",
            }
        }
        case NETEASE_PATHS.mvSublist:
            return {
                uri: "/api/cloudvideo/allvideo/sublist",
                data: {
                    limit: qNum(query, "limit", 50),
                    offset: qNum(query, "offset", 0),
                    total: true,
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.mvSub: {
            const sub = qNum(query, "t", 1) === 1 ? "sub" : "unsub"
            const mvid = q(query, "mvid") || q(query, "id")
            return {
                uri: `/api/mv/${sub}`,
                data: {
                    mvId: mvid,
                    mvIds: `["${mvid}"]`,
                },
                crypto: "weapi",
            }
        }
        case NETEASE_PATHS.userRecord:
            return {
                uri: "/api/v1/play/record",
                data: {
                    uid: q(query, "uid"),
                    type: qNum(query, "type", 0),
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.topPlaylist:
            return {
                uri: "/api/playlist/list",
                data: {
                    cat: q(query, "cat", "全部"),
                    order: q(query, "order", "hot"),
                    limit: qNum(query, "limit", 50),
                    offset: qNum(query, "offset", 0),
                    total: true,
                },
                crypto: "weapi",
            }
        case NETEASE_PATHS.playlistHighqualityTags:
            return {
                uri: "/api/playlist/highquality/tags",
                data: {},
                crypto: "weapi",
            }
        case NETEASE_PATHS.simiMv:
            return {
                uri: "/api/discovery/simiMV",
                data: { mvid: q(query, "mvid") || q(query, "id") },
                crypto: "weapi",
            }
        case NETEASE_PATHS.playlistDelete:
            return {
                uri: "/api/playlist/remove",
                data: { ids: `[${q(query, "id")}]` },
                crypto: "weapi",
            }
        case NETEASE_PATHS.dailySignin:
            return {
                uri: "/api/point/dailyTask",
                data: { type: qNum(query, "type", 0) },
                crypto: "eapi",
            }
        case NETEASE_PATHS.dailySigninStatus:
            // 签到状态汇总：pcSign/mobileSign 标记两端当日是否已签
            return {
                uri: "/api/point/dailySummary",
                data: {},
                crypto: "weapi",
            }
        case NETEASE_PATHS.loginEmail: {
            const md5Password = q(query, "md5_password")
            const password = q(query, "password")
            return {
                uri: "/api/w/login",
                data: {
                    type: "0",
                    https: "true",
                    username: q(query, "email"),
                    password: md5Password || md5Hex(password),
                    rememberLogin: "true",
                },
                crypto: "eapi",
            }
        }
        default:
            throw new Error(`内置 API 未实现路径: ${path}`)
    }
}

export { resolveNativeModule }