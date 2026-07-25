/** 网易云音质 br（bps）偏好 */

const QUALITY_BR_KEY = "musicstorm-netease-quality-br"

const QUALITY_OPTIONS = [
    { br: 128_000, label: "标准 128k" },
    { br: 192_000, label: "较高 192k" },
    { br: 320_000, label: "极高 320k" },
    { br: 999_000, label: "无损优先" },
] as const

type QualityBr = (typeof QUALITY_OPTIONS)[number]["br"]

function isQualityBr(value: number): value is QualityBr {
    return QUALITY_OPTIONS.some((item) => item.br === value)
}

function getNeteaseQualityBr(): QualityBr {
    if (typeof window === "undefined") {
        return 320_000
    }
    const raw = window.localStorage.getItem(QUALITY_BR_KEY)
    const parsed = raw ? Number(raw) : NaN
    return isQualityBr(parsed) ? parsed : 320_000
}

function setNeteaseQualityBr(br: QualityBr): void {
    window.localStorage.setItem(QUALITY_BR_KEY, String(br))
}

function labelForQualityBr(br: number): string {
    return QUALITY_OPTIONS.find((item) => item.br === br)?.label ?? `${Math.round(br / 1000)}k`
}

export {
    QUALITY_BR_KEY,
    QUALITY_OPTIONS,
    getNeteaseQualityBr,
    labelForQualityBr,
    setNeteaseQualityBr,
}
export type { QualityBr }