// Cookie 存取对齐 YesPlayMusic/src/utils/auth.js；CloudMusicAPI 跨域时通过 query.cookie 透传 MUSIC_U

type NeteaseCredentials = {
    musicU: string
    csrf: string | null
}

// 兼容两种上游格式：
// - CloudMusicAPI / 外部源：`a=1;;b=2`，双分号分隔整条 Set-Cookie
// - 仅 `;` 分隔的 `name=value` 列表
function setCookiesFromApi(cookieString: string): void {
    const raw = cookieString.trim()
    if (!raw) {
        return
    }

    const segments = raw.includes(";;")
        ? raw.split(";;")
        : raw.split(/;(?=\s*[\w-]+=)/)

    for (const segment of segments) {
        const pair = segment.split(";")[0]?.trim()
        if (!pair) {
            continue
        }
        const eq = pair.indexOf("=")
        if (eq <= 0) {
            continue
        }
        const key = pair.slice(0, eq).trim()
        const value = pair.slice(eq + 1).trim()
        if (!key) {
            continue
        }
        try {
            document.cookie = `${key}=${value}`
        } catch {
            // 非同源 document.cookie 可能写不进去，仍落 localStorage
        }
        window.localStorage.setItem(`cookie-${key}`, value)
    }
}

function getCookie(key: string): string | null {
    const fromStorage = window.localStorage.getItem(`cookie-${key}`)
    if (fromStorage) {
        return fromStorage
    }

    if (typeof document === "undefined") {
        return null
    }
    const match = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${key}=`))
    return match ? match.slice(key.length + 1) : null
}

function removeCookie(key: string): void {
    window.localStorage.removeItem(`cookie-${key}`)
    try {
        document.cookie = `${key}=; Max-Age=0; path=/`
    } catch {
        // localStorage 已兜底，cookie 删除失败可忽略
    }
}

function isNeteaseLoggedIn(): boolean {
    return Boolean(getCookie("MUSIC_U"))
}

function clearNeteaseSession(): void {
    removeCookie("MUSIC_U")
    removeCookie("__csrf")
}

function snapshotNeteaseCredentials(): NeteaseCredentials | null {
    const musicU = getCookie("MUSIC_U")
    if (!musicU) {
        return null
    }
    return {
        musicU,
        csrf: getCookie("__csrf"),
    }
}

function applyNeteaseCredentials(credentials: NeteaseCredentials): void {
    try {
        document.cookie = `MUSIC_U=${credentials.musicU}`
    } catch {
        // localStorage 已兜底，cookie 写入失败可忽略
    }
    window.localStorage.setItem("cookie-MUSIC_U", credentials.musicU)

    if (credentials.csrf) {
        try {
            document.cookie = `__csrf=${credentials.csrf}`
        } catch {
            // localStorage 已兜底，cookie 写入失败可忽略
        }
        window.localStorage.setItem("cookie-__csrf", credentials.csrf)
    } else {
        removeCookie("__csrf")
    }
}

// 对齐 CloudMusicAPI generateDeviceId：52 位大写 hex，UUID 会被网易云判设备异常
function generateDeviceId(): string {
    const chars = "0123456789ABCDEF"
    let out = ""
    for (let i = 0; i < 52; i += 1) {
        out += chars[Math.floor(Math.random() * chars.length)]
    }
    return out
}

function isCanonicalDeviceId(value: string | null): boolean {
    return Boolean(value && /^[0-9A-Fa-f]{52}$/.test(value))
}

function getNeteaseDeviceId(): string {
    const KEY = "musicstorm-netease-device-id"
    try {
        const cached = window.localStorage.getItem(KEY)
        if (isCanonicalDeviceId(cached)) {
            return cached as string
        }
        // 旧版 UUID 与 MUSIC_A 错位触发风控，重新生成覆盖
        const id = generateDeviceId()
        window.localStorage.setItem(KEY, id)
        return id
    } catch {
        // 存储不可用每次新值，扫码登录可能不绑定
        return generateDeviceId()
    }
}

function getNeteaseCookieParam(): string {
    // deviceId 恒带：扫码登录前就要与后端对齐设备标识，登录态才绑定
    const parts = [`deviceId=${getNeteaseDeviceId()}`]
    const musicU = getCookie("MUSIC_U")
    if (musicU) {
        const csrf = getCookie("__csrf")
        parts.push(`MUSIC_U=${musicU}`)
        if (csrf) {
            parts.push(`__csrf=${csrf}`)
        }
    }
    return `${parts.join("; ")};`
}

export {
    applyNeteaseCredentials,
    clearNeteaseSession,
    getCookie,
    getNeteaseCookieParam,
    getNeteaseDeviceId,
    isNeteaseLoggedIn,
    removeCookie,
    setCookiesFromApi,
    snapshotNeteaseCredentials,
}
export type { NeteaseCredentials }