// 10 段均衡器：频段定义、内置预设、多自定义预设与 localStorage 持久化

const EQ_BAND_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

const EQ_BAND_LABELS = ["31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"]

const GAIN_MIN = -12
const GAIN_MAX = 12

const FLAT_GAINS: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

const FLAT_PRESET_ID = "flat"

type EqPreset = {
    id: string
    name: string
    gains: number[]
}

// 内置预设不可改名/删除，只能作为自定义的起点
const EQ_PRESETS: EqPreset[] = [
    { id: "flat", name: "平直", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: "pop", name: "流行", gains: [-1, 2, 3, 4, 2, -1, -1, 1, 2, 1] },
    { id: "rock", name: "摇滚", gains: [4, 3, 1, -1, -2, 1, 3, 4, 4, 3] },
    { id: "jazz", name: "爵士", gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
    { id: "classical", name: "古典", gains: [4, 3, 2, 0, -1, -1, 0, 2, 3, 4] },
    { id: "electronic", name: "电子", gains: [4, 3, 0, -2, -2, 1, 1, 3, 4, 5] },
    { id: "vocal", name: "人声", gains: [-1, -1, 0, 2, 4, 4, 3, 1, 0, -1] },
    { id: "bass", name: "低音", gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
    { id: "treble", name: "高音", gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
]

type EqPrefs = {
    enabled: boolean
    presetId: string
    /** 用户创建的自定义预设，按名称增删改 */
    customPresets: EqPreset[]
    /** 按歌曲独立 EQ：开启后可为单曲指定不同预设，覆盖全局 */
    perTrackEnabled: boolean
    /** trackId -> presetId 的覆盖映射 */
    perTrackOverrides: Record<string, string>
}

const STORAGE_KEY = "musicstorm-eq"

const DEFAULT_EQ: EqPrefs = {
    enabled: false,
    presetId: FLAT_PRESET_ID,
    customPresets: [],
    perTrackEnabled: false,
    perTrackOverrides: {},
}

function clampGain(value: number): number {
    if (!Number.isFinite(value)) {
        return 0
    }
    return Math.min(GAIN_MAX, Math.max(GAIN_MIN, Math.round(value)))
}

function normalizeGains(value: unknown): number[] {
    if (!Array.isArray(value)) {
        return [...FLAT_GAINS]
    }
    const gains = value.slice(0, EQ_BAND_FREQUENCIES.length)
    while (gains.length < EQ_BAND_FREQUENCIES.length) {
        gains.push(0)
    }
    return gains.map((item) => clampGain(typeof item === "number" ? item : 0))
}

function makeCustomPresetId(): string {
    const rand =
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID().slice(0, 8)
            : Math.random().toString(36).slice(2, 10)
    return `custom-${Date.now().toString(36)}-${rand}`
}

function isBuiltInPresetId(id: string): boolean {
    return EQ_PRESETS.some((preset) => preset.id === id)
}

// 兼容旧版（presetId === "custom" + gains）迁移：折成一条「自定义」预设
function migrateLegacy(parsed: {
    enabled?: unknown
    presetId?: unknown
    gains?: unknown
}): EqPrefs {
    const prefs: EqPrefs = {
        enabled: parsed.enabled === true,
        presetId:
            typeof parsed.presetId === "string" ? parsed.presetId : FLAT_PRESET_ID,
        customPresets: [],
        perTrackEnabled: false,
        perTrackOverrides: {},
    }
    if (prefs.presetId === "custom") {
        const gains = normalizeGains(parsed.gains)
        const preset: EqPreset = {
            id: makeCustomPresetId(),
            name: "自定义",
            gains,
        }
        prefs.customPresets = [preset]
        prefs.presetId = preset.id
    }
    return prefs
}

function normalizeOverrides(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {}
    }
    const out: Record<string, string> = {}
    for (const [key, presetId] of Object.entries(value)) {
        if (typeof presetId === "string" && presetId) {
            out[key] = presetId
        }
    }
    return out
}

function readEqPrefs(): EqPrefs {
    if (typeof window === "undefined") {
        return { ...DEFAULT_EQ, customPresets: [] }
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) {
            return { ...DEFAULT_EQ, customPresets: [] }
        }
        const data = JSON.parse(raw) as {
            enabled?: unknown
            presetId?: unknown
            gains?: unknown
            customPresets?: unknown
            perTrackEnabled?: unknown
            perTrackOverrides?: unknown
        }
        // 旧数据结构没有 customPresets，走迁移
        if (!Array.isArray(data.customPresets)) {
            const migrated = migrateLegacy(data)
            writeEqPrefs(migrated)
            return migrated
        }
        const customPresets = data.customPresets
            .map((item) => {
                const preset = item as {
                    id?: unknown
                    name?: unknown
                    gains?: unknown
                }
                const id =
                    typeof preset.id === "string" && preset.id
                        ? preset.id
                        : makeCustomPresetId()
                return {
                    id,
                    name:
                        typeof preset.name === "string" && preset.name.trim()
                            ? preset.name.trim()
                            : "自定义",
                    gains: normalizeGains(preset.gains),
                }
            })
            .filter((preset, index, all) => {
                return all.findIndex((p) => p.id === preset.id) === index
            })
        return {
            enabled: data.enabled === true,
            presetId:
                typeof data.presetId === "string"
                    ? data.presetId
                    : FLAT_PRESET_ID,
            customPresets,
            perTrackEnabled: data.perTrackEnabled === true,
            perTrackOverrides: normalizeOverrides(data.perTrackOverrides),
        }
    } catch {
        return { ...DEFAULT_EQ, customPresets: [] }
    }
}

function writeEqPrefs(prefs: EqPrefs): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

// 合并内置 + 自定义预设，供 UI 按顺序展示
function allEqPresets(prefs: EqPrefs): EqPreset[] {
    return [...EQ_PRESETS, ...prefs.customPresets]
}

// 按 presetId 查增益：先内置，再自定义，兜底平直
function resolveGainsByPresetId(prefs: EqPrefs, presetId: string): number[] {
    const builtIn = EQ_PRESETS.find((preset) => preset.id === presetId)
    if (builtIn) {
        return [...builtIn.gains]
    }
    const custom = prefs.customPresets.find((preset) => preset.id === presetId)
    return custom ? [...custom.gains] : [...FLAT_GAINS]
}

// 实际生效的增益曲线（全局预设）
function resolveEqGains(prefs: EqPrefs): number[] {
    return resolveGainsByPresetId(prefs, prefs.presetId)
}

// 按歌曲独立 EQ：解析某首歌实际生效的预设 id（歌曲覆盖优先，否则全局）
function resolveEqPresetIdForTrack(
    prefs: EqPrefs,
    trackId: string | null | undefined,
): string {
    if (prefs.perTrackEnabled && trackId) {
        const override = prefs.perTrackOverrides[trackId]
        if (override) {
            return override
        }
    }
    return prefs.presetId
}

function resolveEqGainsForTrack(
    prefs: EqPrefs,
    trackId: string | null | undefined,
): number[] {
    return resolveGainsByPresetId(prefs, resolveEqPresetIdForTrack(prefs, trackId))
}

function resolveEqNameForTrack(
    prefs: EqPrefs,
    trackId: string | null | undefined,
): string {
    const presetId = resolveEqPresetIdForTrack(prefs, trackId)
    const builtIn = EQ_PRESETS.find((preset) => preset.id === presetId)
    if (builtIn) {
        return builtIn.name
    }
    const custom = prefs.customPresets.find((preset) => preset.id === presetId)
    return custom?.name ?? "平直"
}

function resolveEqName(prefs: EqPrefs): string {
    const builtIn = EQ_PRESETS.find((preset) => preset.id === prefs.presetId)
    if (builtIn) {
        return builtIn.name
    }
    const custom = prefs.customPresets.find(
        (preset) => preset.id === prefs.presetId,
    )
    return custom?.name ?? "平直"
}

function setPerTrackEnabled(prefs: EqPrefs, enabled: boolean): EqPrefs {
    return { ...prefs, perTrackEnabled: enabled }
}

function setPerTrackOverride(
    prefs: EqPrefs,
    trackId: string,
    presetId: string,
): EqPrefs {
    return {
        ...prefs,
        perTrackOverrides: { ...prefs.perTrackOverrides, [trackId]: presetId },
    }
}

function clearPerTrackOverride(prefs: EqPrefs, trackId: string): EqPrefs {
    const overrides = { ...prefs.perTrackOverrides }
    delete overrides[trackId]
    return { ...prefs, perTrackOverrides: overrides }
}

function isCustomActive(prefs: EqPrefs): boolean {
    return !isBuiltInPresetId(prefs.presetId)
}

// 保存当前曲线为新自定义预设并切换到它
function saveCustomPreset(prefs: EqPrefs, name: string, gains: number[]): EqPrefs {
    const trimmed = name.trim() || "自定义"
    const preset: EqPreset = {
        id: makeCustomPresetId(),
        name: trimmed,
        gains: normalizeGains(gains),
    }
    return {
        ...prefs,
        presetId: preset.id,
        customPresets: [...prefs.customPresets, preset],
    }
}

function renameCustomPreset(prefs: EqPrefs, id: string, name: string): EqPrefs {
    const trimmed = name.trim()
    if (!trimmed) {
        return prefs
    }
    return {
        ...prefs,
        customPresets: prefs.customPresets.map((preset) =>
            preset.id === id ? { ...preset, name: trimmed } : preset,
        ),
    }
}

function deleteCustomPreset(prefs: EqPrefs, id: string): EqPrefs {
    const customPresets = prefs.customPresets.filter(
        (preset) => preset.id !== id,
    )
    const presetId =
        prefs.presetId === id ? FLAT_PRESET_ID : prefs.presetId
    // 同步清理所有指向该预设的歌曲覆盖，避免悬空引用遗留脏数据
    const perTrackOverrides = { ...prefs.perTrackOverrides }
    for (const [trackId, presetIdOfTrack] of Object.entries(perTrackOverrides)) {
        if (presetIdOfTrack === id) {
            delete perTrackOverrides[trackId]
        }
    }
    return { ...prefs, presetId, customPresets, perTrackOverrides }
}

// 就地改写某自定义预设的增益（不换 id，避免拖动时预设漂移）
function updateCustomPresetGains(
    prefs: EqPrefs,
    id: string,
    gains: number[],
): EqPrefs {
    return {
        ...prefs,
        customPresets: prefs.customPresets.map((preset) =>
            preset.id === id ? { ...preset, gains: normalizeGains(gains) } : preset,
        ),
    }
}

// 拖动某预设曲线到目标增益：内置预设克隆为新自定义再改（不污染内置），
// 自定义则就地改写。返回新 prefs 及（必要时的）目标预设 id，供歌曲覆盖/全局切换。
function applyGainToPreset(
    prefs: EqPrefs,
    presetId: string,
    index: number,
    gainDb: number,
): { prefs: EqPrefs; presetId: string } {
    const base = resolveGainsByPresetId(prefs, presetId)
    const gains = base.map((gain, i) =>
        i === index
            ? Math.min(GAIN_MAX, Math.max(GAIN_MIN, Math.round(gainDb)))
            : gain,
    )
    let next: EqPrefs
    let targetId = presetId
    if (isBuiltInPresetId(presetId)) {
        // 内置预设拖动：克隆为新自定义预设再改，不污染内置
        const preset: EqPreset = {
            id: makeCustomPresetId(),
            name: `${resolvePresetName(prefs, presetId)} 自定义`,
            gains: normalizeGains(gains),
        }
        next = {
            ...prefs,
            customPresets: [...prefs.customPresets, preset],
        }
        targetId = preset.id
    } else {
        // 自定义预设拖动：就地改写当前预设
        next = updateCustomPresetGains(prefs, presetId, gains)
    }
    return { prefs: next, presetId: targetId }
}

// 解析某个 presetId 的显示名（内置/自定义兜底）
function resolvePresetName(prefs: EqPrefs, presetId: string): string {
    const builtIn = EQ_PRESETS.find((preset) => preset.id === presetId)
    if (builtIn) {
        return builtIn.name
    }
    const custom = prefs.customPresets.find((preset) => preset.id === presetId)
    return custom?.name ?? "平直"
}

export {
    DEFAULT_EQ,
    EQ_BAND_FREQUENCIES,
    EQ_BAND_LABELS,
    EQ_PRESETS,
    FLAT_GAINS,
    FLAT_PRESET_ID,
    GAIN_MAX,
    GAIN_MIN,
    allEqPresets,
    applyGainToPreset,
    clearPerTrackOverride,
    deleteCustomPreset,
    isBuiltInPresetId,
    isCustomActive,
    readEqPrefs,
    renameCustomPreset,
    resolveEqGains,
    resolveEqGainsForTrack,
    resolveEqName,
    resolveEqNameForTrack,
    resolveEqPresetIdForTrack,
    resolvePresetName,
    saveCustomPreset,
    setPerTrackEnabled,
    setPerTrackOverride,
    updateCustomPresetGains,
    writeEqPrefs,
}
export type { EqPrefs, EqPreset }
