/**
 * 会话级中国 realIP，对齐 CloudMusicAPI global.cnIp
 * - 启动抽一次，进程会话内复用
 * - 数据为 china_ip_ranges.txt 精简 CIDR 子集，避免全量 65KB 进 bundle
 */

type CidrRange = {
    start: number
    end: number
    count: number
    cidr: string
}

/** 精简 CN 段，覆盖电信联通移动常见前缀约 60 段 */
const CN_CIDR_SUBSET = [
    "1.80.0.0/12",
    "1.192.0.0/13",
    "14.16.0.0/12",
    "14.144.0.0/12",
    "14.208.0.0/12",
    "27.8.0.0/13",
    "27.16.0.0/12",
    "27.36.0.0/14",
    "36.96.0.0/11",
    "36.248.0.0/14",
    "39.128.0.0/10",
    "42.80.0.0/13",
    "42.176.0.0/13",
    "49.64.0.0/11",
    "58.16.0.0/13",
    "58.192.0.0/11",
    "59.32.0.0/11",
    "60.160.0.0/11",
    "61.128.0.0/10",
    "101.64.0.0/11",
    "106.80.0.0/12",
    "111.160.0.0/13",
    "112.64.0.0/11",
    "113.64.0.0/11",
    "114.64.0.0/11",
    "115.192.0.0/11",
    "116.0.0.0/12",
    "117.80.0.0/12",
    "118.112.0.0/13",
    "119.96.0.0/13",
    "120.192.0.0/10",
    "121.8.0.0/13",
    "122.64.0.0/11",
    "123.64.0.0/11",
    "124.64.0.0/11",
    "125.64.0.0/11",
    "139.208.0.0/13",
    "140.206.0.0/16",
    "140.207.0.0/16",
    "144.0.0.0/12",
    "163.0.0.0/16",
    "171.8.0.0/13",
    "171.104.0.0/13",
    "175.0.0.0/12",
    "180.96.0.0/11",
    "180.160.0.0/12",
    "182.32.0.0/12",
    "182.96.0.0/12",
    "183.0.0.0/10",
    "202.96.0.0/12",
    "210.21.0.0/16",
    "210.22.0.0/16",
    "211.90.0.0/16",
    "211.91.0.0/16",
    "211.136.0.0/13",
    "211.144.0.0/12",
    "218.0.0.0/12",
    "218.64.0.0/11",
    "219.128.0.0/11",
    "220.160.0.0/11",
    "221.176.0.0/13",
    "222.64.0.0/11",
    "223.64.0.0/11",
    "223.96.0.0/12",
] as const

const FALLBACK_IP = "211.161.244.70"

function ipToInt(ip: string): number {
    const parts = ip.split(".").map(Number)
    const a = (parts[0]! << 24) >>> 0
    const b = (parts[1]! << 16) >>> 0
    const c = (parts[2]! << 8) >>> 0
    const d = parts[3]! >>> 0
    return (a + b + c + d) >>> 0
}

function intToIp(int: number): string {
    return [
        (int >>> 24) & 0xff,
        (int >>> 16) & 0xff,
        (int >>> 8) & 0xff,
        int & 0xff,
    ].join(".")
}

function parseCidr(cidr: string): CidrRange | null {
    const [ipStr, prefixRaw] = cidr.split("/")
    if (!ipStr || prefixRaw == null) {
        return null
    }
    const prefixLength = Number(prefixRaw)
    if (!Number.isFinite(prefixLength) || prefixLength < 0 || prefixLength > 32) {
        return null
    }
    const ipInt = ipToInt(ipStr)
    const mask =
        prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0
    const start = (ipInt & mask) >>> 0
    const end = (start | (~mask >>> 0)) >>> 0
    const count = end - start + 1
    return { start, end, count, cidr }
}

function buildRanges(cidrs: readonly string[]): {
    ranges: CidrRange[]
    totalCount: number
} {
    const ranges: CidrRange[] = []
    let totalCount = 0
    for (const line of cidrs) {
        const range = parseCidr(line)
        if (!range) {
            continue
        }
        ranges.push(range)
        totalCount += range.count
    }
    ranges.sort((a, b) => b.count - a.count)
    return { ranges, totalCount }
}

const { ranges: CN_RANGES, totalCount: CN_TOTAL } = buildRanges(CN_CIDR_SUBSET)

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

/** 对齐 CloudMusicAPI generateRandomChineseIP */
function generateRandomChineseIp(): string {
    if (!CN_TOTAL || CN_RANGES.length === 0) {
        return `116.${randomInt(25, 94)}.${randomInt(1, 255)}.${randomInt(1, 255)}`
    }

    let offset = Math.floor(Math.random() * CN_TOTAL)
    let chosen: CidrRange | null = null
    for (const seg of CN_RANGES) {
        if (offset < seg.count) {
            chosen = seg
            break
        }
        offset -= seg.count
    }
    if (!chosen) {
        chosen = CN_RANGES[CN_RANGES.length - 1]!
    }

    const segSize = chosen.end - chosen.start + 1
    const ipInt = chosen.start + Math.floor(Math.random() * segSize)
    return intToIp(ipInt >>> 0)
}

let sessionRealIp: string | null = null

/** 会话内固定；对齐 global.cnIp */
function getSessionRealIp(): string {
    if (sessionRealIp) {
        return sessionRealIp
    }
    try {
        sessionRealIp = generateRandomChineseIp()
    } catch {
        sessionRealIp = FALLBACK_IP
    }
    if (!sessionRealIp) {
        sessionRealIp = FALLBACK_IP
    }
    return sessionRealIp
}

/** 测试或强制刷新会话 IP */
function resetSessionRealIp(): string {
    sessionRealIp = null
    return getSessionRealIp()
}

/**
 * query.realIP 优先，否则会话 IP。
 */
function resolveRealIp(override?: string | number | boolean): string {
    if (typeof override === "string" && override.trim()) {
        return override.trim()
    }
    return getSessionRealIp()
}

export {
    FALLBACK_IP,
    generateRandomChineseIp,
    getSessionRealIp,
    resetSessionRealIp,
    resolveRealIp,
}