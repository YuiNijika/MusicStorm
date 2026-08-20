---
title: API
description: 网易云数据接入：双模式、统一请求入口、加密链与模块调用示例。
order: 5
---

# 网易云 API 层

> 理解网易云数据如何进入应用：两种接入模式、统一请求入口的行为契约、加密链路，以及每个模块怎么调用。

## 本页边界

覆盖：`src/lib/netease/` 全部模块的职责与调用方式。

**不**覆盖：本地曲库（见 [本地曲库](#/docs/dev/local-library)）、播放引擎（见 [播放引擎](#/docs/dev/player)）、Rust 代理实现（见 [Tauri 命令](#/docs/dev/tauri)）。

## 两种接入模式

| 模式 | 说明 | 入口 |
|---|---|---|
| `integrated`（默认） | 内置 TS 直连 `music.163.com`：TS 完成 weapi/eapi 加密，经 Rust 代理发 POST | `src/lib/netease/native/request.ts` |
| `external` | 对接第三方 NCM API 服务（官方源 / 锦木祈杰源 / 自定义 URL） | `src/lib/netease/client.ts` |

模式与来源统一存于 localStorage `musicstorm-api-settings`，`src/lib/netease/api-settings.ts` 是唯一读写入口，变更广播事件 `musicstorm-api-settings-change`。

## 统一请求入口

所有网易云数据都走 `neteaseRequest`（`src/lib/netease/client.ts`），**新增接口禁止绕过它**。

```ts
import { neteaseRequest } from "@/lib/netease/client"
import { NETEASE_PATHS } from "@/lib/netease/paths"

// 歌曲详情：params 走加密体，query 走 URL 参数
const detail = await neteaseRequest<{ songs: Track[] }>({
    path: NETEASE_PATHS.songDetail,
    params: { ids: "1,2" },
})

// 搜索：query 走明文查询串
const search = await neteaseRequest<{ result: { songs: Track[] } }>({
    path: NETEASE_PATHS.search,
    query: { s: "万能青年旅店", type: 1, limit: 30 },
})

// 写操作（红心）：显式跳过缓存
await neteaseRequest({
    path: NETEASE_PATHS.like,
    params: { id: 123, like: true },
    skipCache: true,
})
```

内建行为契约：

- **磁盘缓存**：默认读缓存写缓存，TTL 由偏好 `musicstorm-api-cache-ttl` 控制（仅 Tauri 桌面端，浏览器无缓存）
- **不落缓存的路径**：登录、写操作、时效 URL（`src/lib/netease/client.ts` 的 `NO_CACHE_PATHS`）
- **写操作失效缓存**：`WRITE_PATHS` 里的写操作（改名 / 删除 / 收藏 / 红心等）成功后自动 `apiCacheClear`，避免 `playlistDetail` / `userPlaylist` / `sublist` 等读接口命中旧数据
- **in-flight 去重**：同 key 并发请求只发一次，其余共享结果
- **错误断言**：响应 `code !== 200` 直接抛错（`loginQrCheck` 除外，其 code 是轮询状态码）

新增接口时先查 `src/lib/netease/paths.ts` 的 `NETEASE_PATHS` 是否已有路径；没有再加，并同步确认是否要进 `NO_CACHE_PATHS`。

## 加密链（integrated 模式）

```txt
native/request.ts         请求组装（UA / deviceId / realIp / cookie）
  ├─ native/crypto.ts     weapi/eapi 加密 —— 首个加密请求时才动态 import（约 288 kB）
  ├─ native/md5.ts        零依赖手写 MD5（登录同步上下文需要）
  ├─ native/device-cookie 设备 ID 与 MUSIC_A 游客凭证
  ├─ native/modules.ts    API 路径 → 加密模块映射
  └─ native/real-ip.ts    真实 IP 注入
netease_http_post (Rust)  绕过 CORS 的无状态 POST 代理
```

**禁止静态 import `native/crypto.ts`**，否则加密库会进启动包；只能经 `native/request.ts` 的 `loadCrypto()` 动态加载。

新增接口的加密模式（weapi/eapi）与 `data` 字段，一律对照官方 Node 版 `CloudMusicAPI_Node/module/*.js` 的 `createOption` 与 `data` 构造；不要凭 URL 前缀（如 `/api/v1/`）猜加密模式。

## 模块清单与调用示例

| 模块 | 主要导出 | 用途 |
|---|---|---|
| `auth.ts` | `createQrSession`、`fetchQrKey`、`pollQrLogin`、`checkQrLogin` | 扫码登录 |
| `auth-phone.ts` | `loginWithCellphone`、`sendCaptcha` | 手机号 / 验证码登录 |
| `auth-email.ts` | `loginWithEmail` | 邮箱登录 |
| `track.ts` | `fetchSongDetail`、`fetchSongUrl` | 歌曲详情、播放 URL |
| `playlist.ts` | `fetchPlaylistDetail`、`fetchRecommendPlaylists`、`fetchTopPlaylists`、`subscribePlaylist`、`createPlaylist`、`updatePlaylistName`、`updatePlaylistDesc`、`deletePlaylist` | 歌单：详情 / 推荐 / 分类 / 收藏 / 创建 / 改名 / 介绍 / 删除 |
| `search.ts` | `searchNeteaseTracks` / `Albums` / `Artists` / `Playlists` / `Radios` / `All` | 全局搜索 |
| `album.ts` | `fetchAlbumDetail`、`fetchAlbumSublist`、`subscribeAlbum` | 专辑与收藏 |
| `artist.ts` | `fetchArtistDetail`、`fetchArtistDesc`、`fetchArtistMvs`、`fetchSimiArtists`、`fetchArtistSublist`、`subscribeArtist` | 艺人页与收藏 |
| `user.ts` | `fetchUserAccount`、`fetchUserPlaylists`、`fetchUserPlaylistsDetailed`、`resolveVipTier`、`dailySignin` | 账号、歌单、VIP 等级、签到 |
| `like.ts` | `fetchLikelist`、`setTrackLiked` | 红心 |
| `recommend.ts` | `fetchDailyRecommendSongs` | 每日推荐 |
| `toplist.ts` | `fetchToplists` | 官方排行榜 |
| `discover.ts` | `fetchNewAlbums`、`fetchTopSongs` | 新碟上架、新歌速递 |
| `fm.ts` | `fetchPersonalFm`、`fmTrash`、`fetchIntelligencePlaylist` | 私人 FM、心动模式 |
| `cloud.ts` | `fetchCloudTracks`、`deleteCloudTrack` | 云盘列表与删除 |
| `record.ts` | `fetchUserRecord` | 最近播放（听歌排行） |
| `dj.ts` | `fetchDjDetail`、`fetchDjPrograms`、`fetchDjSublist`、`subscribeDjRadio`、`fetchHomeRadios` 等 | 电台 |
| `mv.ts` | `fetchMvDetail`、`fetchMvPlayable`、`fetchMvUrl`、`fetchMvSublist`、`subscribeMv`、`fetchSimiMvs` | MV 与收藏 |
| `lyric.ts` | `fetchLyricLines`、`fetchLyricText` | 歌词 |
| `comment.ts` | `fetchSongComments`、`fetchSongStats`、`postSongComment` | 歌曲评论列表、红心量/播放量、发布/回复评论 |
| `quality.ts` | `getNeteaseQualityBr`、`setNeteaseQualityBr`、`QUALITY_OPTIONS` | 音质偏好（标准 128k / 较高 192k / 极高 320k / 无损优先） |
| `song-privilege.ts` | `isSongUrlPlayable`、`pickRicherSongUrlEntry`、`describeSongUrlFailure` | 播放 URL 校验与降级 |
| `track-actions.ts` | `downloadNeteaseTrack`、`overrideTrackLyric`、`removeTracksFromPlaylist` | 下载 / 歌词覆写 / 移除 |
| `account-vault.ts` | 账号库读写 | 多账号切换 |

### 评论与歌曲统计

```ts
import {
    fetchSongComments,
    fetchSongStats,
    postSongComment,
} from "@/lib/netease/comment"

const { comments, hotComments, total, more } = await fetchSongComments(id, {
    limit: 20,
})
const { likedCount, playCount } = await fetchSongStats(id)   // 需登录才带量
const comment = await postSongComment(id, "好听的", replyTo)
```

- 评论列表走 `comment/music`（weapi），写评论走 `comment`（eapi，需登录态）
- `postSongComment` 固定发 `t:1`、`type:1`（歌曲）；带 `replyTo` 时附 `commentId` 走回复
- external 模式需对接的后端支持 `/comment` 写路径（CloudMusicAPI 已实现）

### 扫码登录

```ts
import { createQrSession, pollQrLogin } from "@/lib/netease/auth"
import { qrTextToDataUrl } from "@/lib/qr-data-url"

const session = await createQrSession()          // { key, qrimg, qrurl }
const dataUrl = qrTextToDataUrl(session.qrurl)   // 二维码图片，可直接渲染

// 轮询返回网易云原始 code：800 过期 / 801 待扫 / 802 已扫待确认 / 803 成功
const code = await pollQrLogin(session.key)
if (code === 803) {
    // 已登录：cookie 已由 auth-cookie 持久化，账号写入 account-vault
}
```

### 搜索 → 播放 URL 完整链路

```ts
import { searchNeteaseTracks } from "@/lib/netease/search"
import { fetchSongUrl } from "@/lib/netease/track"
import { isSongUrlPlayable } from "@/lib/netease/song-privilege"

const hits = await searchNeteaseTracks("石家庄人", 10)   // (keywords, limit) → Track[]
const first = hits[0]
if (!first) {
    return
}

// fetchSongUrl(id, br?) 默认 320k，返回 { data: SongUrlItem[] }；播放地址必须实时所以 skipCache
const { data } = await fetchSongUrl(first.id)
const playable = data?.find((entry) => isSongUrlPlayable(entry))
if (!playable) {
    // 无可用 URL：调用 describeSongUrlFailure 给用户可读的失败原因
}
```

### 音质偏好

```ts
import { getNeteaseQualityBr, setNeteaseQualityBr } from "@/lib/netease/quality"

const current = getNeteaseQualityBr()   // 如 320_000
setNeteaseQualityBr(999_000)            // 无损优先；变更会持久化并广播
```

### 歌单创建 / 编辑 / 删除

```ts
import {
    createPlaylist,
    deletePlaylist,
    updatePlaylistDesc,
    updatePlaylistName,
} from "@/lib/netease/playlist"

// 创建（介绍可选）：create 接口只收 name，介绍会在创建后单独写
const id = await createPlaylist("我的歌单", "周末循环的轻音乐")

// 改名 / 改介绍：各自独立，值变了才调用
await updatePlaylistName(id, "新的名字")
await updatePlaylistDesc(id, "新的介绍")

// 删除（自己的歌单）
await deletePlaylist(id)
```

### 发现页 / 私人 FM / 云盘 / 最近播放

```ts
import { fetchToplists } from "@/lib/netease/toplist"
import { fetchNewAlbums, fetchTopSongs } from "@/lib/netease/discover"
import { fetchPersonalFm, fetchIntelligencePlaylist } from "@/lib/netease/fm"
import { fetchCloudTracks, deleteCloudTrack } from "@/lib/netease/cloud"
import { fetchUserRecord } from "@/lib/netease/record"

const toplists = await fetchToplists()                 // ToplistItem[] → 官方榜单
const albums = await fetchNewAlbums("ALL", 30)         // 新碟，地区 ALL/ZH/EA/KR/JP
const songs = await fetchTopSongs(0)                   // 新歌，type 0 全部
const next = await fetchPersonalFm()                   // 私人 FM 下一首
const smart = await fetchIntelligencePlaylist(seedId, playlistId) // 心动模式队列
const cloud = await fetchCloudTracks()                 // 云盘歌曲
await deleteCloudTrack(trackId)                        // 云盘删除
const recent = await fetchUserRecord(uid, 1)           // 最近播放（一周听歌排行）
```

## 常见错误

| 现象 | 原因与处理 |
|---|---|
| 抛错「内置 API 需在桌面应用中运行」 | 浏览器环境调了 integrated 模式；浏览器调试请切「对接 API」或 mock |
| 接口返回 code 非 200 | `neteaseRequest` 已抛错；查看 `msg` 字段定位（未登录 / 参数错） |
| 播放 URL 拿不到 / 全不可播 | 走 `song-privilege` 的 `describeSongUrlFailure` 区分版权 / 登录 / 音质原因 |
| 登录后接口仍报未登录 | 确认走 `neteaseRequest`（它负责携带 cookie），且 deviceId 与登录时一致 |
| 登录后收藏歌手 / MV / 云盘返回 301 / 未登录 / 系统错误 | 多为登录态与 deviceId 不一致：`auth-cookie.ts` 与 `native/device-cookie.ts` 必须共用同一枚 deviceId，否则旧凭证绑定旧 deviceId 被判风险；退出重新扫码登录即可 |

## 排查路径

1. 确认调用走了 `neteaseRequest` 而非裸 fetch
2. 确认 `NETEASE_PATHS` 存在该路径、拼写一致
3. 确认 `musicstorm-api-settings` 的模式与来源符合预期（integrated 需桌面运行时）
4. 确认路径是否应进 `NO_CACHE_PATHS`（登录 / 写操作缓存了会返回旧数据）
5. 看 Rust 侧 `netease_http_post` 是否返回错误（CORS 代理仅放行 music.163.com 域）
