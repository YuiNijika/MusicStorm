/**
 * Cookie 存取对齐 YesPlayMusic/src/utils/auth.js
 * CloudMusicAPI 跨域时通过 query.cookie 透传 MUSIC_U
 */

type NeteaseCredentials = {
    musicU: string
    csrf: string | null
}

function setCookiesFromApi(cookieString: string): void {
    const chunks = cookieString.split(";;")
    for (const chunk of chunks) {
        const pair = chunk.split(";")[0]?.trim()
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
            document.cookie = pair
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
        // ignore
    }
}

function isNeteaseLoggedIn(): boolean {
    return Boolean(getCookie("MUSIC_U"))
}

function clearNeteaseSession(): void {
    removeCookie("MUSIC_U")
    removeCookie("__csrf")
}

/** 当前活跃凭证快照（多账号切换用） */
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

/** 恢复某账号凭证为当前会话 */
function applyNeteaseCredentials(credentials: NeteaseCredentials): void {
    try {
        document.cookie = `MUSIC_U=${credentials.musicU}`
    } catch {
        // ignore
    }
    window.localStorage.setItem("cookie-MUSIC_U", credentials.musicU)

    if (credentials.csrf) {
        try {
            document.cookie = `__csrf=${credentials.csrf}`
        } catch {
            // ignore
        }
        window.localStorage.setItem("cookie-__csrf", credentials.csrf)
    } else {
        removeCookie("__csrf")
    }
}

/** 拼给 API 的 cookie 参数 */
function getNeteaseCookieParam(): string | undefined {
    const musicU = getCookie("MUSIC_U")
    if (!musicU) {
        return undefined
    }
    const csrf = getCookie("__csrf")
    return csrf
        ? `MUSIC_U=${musicU}; __csrf=${csrf};`
        : `MUSIC_U=${musicU};`
}

export {
    applyNeteaseCredentials,
    clearNeteaseSession,
    getCookie,
    getNeteaseCookieParam,
    isNeteaseLoggedIn,
    removeCookie,
    setCookiesFromApi,
    snapshotNeteaseCredentials,
}
export type { NeteaseCredentials }