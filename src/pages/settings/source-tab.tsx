import { useEffect, useState } from "react"

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { notifyInfo, notifySuccess, notifyError } from "@/lib/notify"
import {
    API_SETTINGS_EVENT,
    DEFAULT_BASE_URL,
    DEFAULT_BILIBILI_BASE_URL,
    EXTERNAL_SOURCES,
    getApiSettings,
    getBilibiliBaseUrl,
    getNeteaseBaseUrl,
    resolveEffectiveBaseUrl,
    setApiMode,
    setApiSettings,
    setExternalSource,
    speedTestApi,
    type ApiMode,
    type ExternalSourceId,
} from "@/lib/netease/api-settings"
import { probeNativeApi } from "@/lib/netease/integrated-api"
import {
    QUALITY_OPTIONS,
    getNeteaseQualityBr,
    setNeteaseQualityBr,
    type QualityBr,
} from "@/lib/netease/quality"
import {
    ActionButton,
    ChoiceChip,
    ChipRow,
    SettingsGroup,
    TabHeader,
} from "@/pages/settings/settings-ui"
import { isWebMode } from "@/lib/web-mode"

function SourceTab() {
    const [settings, setSettings] = useState(() => getApiSettings())
    const [customDraft, setCustomDraft] = useState(
        () => getApiSettings().customUrl || DEFAULT_BASE_URL,
    )
    const [bilibiliDraft, setBilibiliDraft] = useState(
        () => getApiSettings().bilibiliBaseUrl || DEFAULT_BILIBILI_BASE_URL,
    )
    const [savedHint, setSavedHint] = useState<string | null>(null)
    const [nativeHint, setNativeHint] = useState<string | null>(null)
    const [speedHint, setSpeedHint] = useState<string | null>(null)
    const [speedLoading, setSpeedLoading] = useState(false)
    const [qualityBr, setQualityBr] = useState<QualityBr>(() =>
        getNeteaseQualityBr(),
    )
    const webMode = isWebMode()

    useEffect(() => {
        function sync() {
            const next = getApiSettings()
            setSettings(next)
            if (next.source === "custom" && next.customUrl) {
                setCustomDraft(next.customUrl)
            }
            setBilibiliDraft(
                next.bilibiliBaseUrl || DEFAULT_BILIBILI_BASE_URL,
            )
        }
        window.addEventListener(API_SETTINGS_EVENT, sync)
        return () => window.removeEventListener(API_SETTINGS_EVENT, sync)
    }, [])

    useEffect(() => {
        if (settings.mode !== "integrated") {
            setNativeHint(null)
            return
        }
        let cancelled = false
        setNativeHint("正在检测内置服务…")
        void probeNativeApi().then((status) => {
            if (!cancelled) {
                setNativeHint(status.message)
            }
        })
        return () => {
            cancelled = true
        }
    }, [settings.mode])

    function flash(text: string) {
        setSavedHint(text)
        window.setTimeout(() => setSavedHint(null), 1600)
    }

    function handleMode(mode: ApiMode) {
        const next = setApiMode(mode)
        setSettings(next)
        const title =
            mode === "integrated" ? "已使用内置服务" : "已使用外部服务"
        flash(title)
        notifySuccess(title, {
            description:
                mode === "integrated"
                    ? "无需额外配置"
                    : "将使用下方选择的服务",
        })
    }

    function handleSource(source: ExternalSourceId | null) {
        if (!source) {
            return
        }
        if (source === "custom") {
            const next = setExternalSource("custom", customDraft)
            setSettings(next)
            flash("已选自定义服务")
            notifyInfo("已选自定义服务", { description: "确认地址后点保存" })
            return
        }
        const next = setExternalSource(source)
        setSettings(next)
        flash("已切换外部服务")
        notifySuccess("已切换外部服务", {
            description:
                EXTERNAL_SOURCES.find((item) => item.id === source)?.label ??
                source,
        })
    }

    function handleSaveCustom() {
        const url = customDraft.trim() || DEFAULT_BASE_URL
        // 未变化时不重复落盘/弹提示，供失焦与回车的自动保存复用
        if (url === settings.customUrl) {
            return
        }
        const next = setExternalSource("custom", url)
        setSettings(next)
        const effective = resolveEffectiveBaseUrl(next)
        setCustomDraft(effective)
        flash("已保存自定义服务")
        notifySuccess("已保存自定义服务", { description: effective })
    }

    function handleSaveBilibili() {
        const url = bilibiliDraft.trim() || DEFAULT_BILIBILI_BASE_URL
        if (url === settings.bilibiliBaseUrl) {
            return
        }
        const next = setApiSettings({ bilibiliBaseUrl: url })
        setSettings(next)
        setBilibiliDraft(next.bilibiliBaseUrl)
        flash("已保存B站服务")
        notifySuccess("已保存B站服务", {
            description: next.bilibiliBaseUrl,
        })
    }

    async function handleSpeedTest() {
        setSpeedLoading(true)
        setSpeedHint(null)
        if (settings.mode === "integrated") {
            const status = await probeNativeApi()
            setSpeedLoading(false)
            setSpeedHint(status.ready ? "内置服务就绪" : status.message)
            if (!status.ready) {
                notifyError("内置服务未就绪", { description: status.message })
            }
            return
        }
        const result = await speedTestApi(getNeteaseBaseUrl())
        setSpeedLoading(false)
        setSpeedHint(result.ok ? `${result.ms} ms` : result.message)
        if (!result.ok) {
            notifyError("测速失败", { description: result.message })
        }
    }

    const sourceLabel =
        EXTERNAL_SOURCES.find((item) => item.id === settings.source)?.label ??
        "在线服务"
    return (
        <div className="space-y-3">
            <TabHeader
                title="音源"
                description={
                    webMode
                        ? "选择网易云服务与音质偏好"
                        : "使用内置服务，或连接外部网易云服务"
                }
            />

            <div className="space-y-3">
                {!webMode ? (
                    <SettingsGroup title="连接方式" description="默认使用应用内置">
                        <ChipRow>
                            <ChoiceChip
                                label="应用内置"
                                active={settings.mode === "integrated"}
                                onClick={() => handleMode("integrated")}
                            />
                            <ChoiceChip
                                label="外部服务"
                                active={settings.mode === "external"}
                                onClick={() => handleMode("external")}
                            />
                        </ChipRow>
                        {settings.mode === "integrated" ? (
                            <p className="text-[13px] text-muted-foreground">
                                {nativeHint ??
                                    "由应用直接连接，无需额外配置"}
                            </p>
                        ) : null}
                        <div className="flex min-h-11 flex-wrap items-center gap-2">
                            <ActionButton
                                disabled={speedLoading}
                                onClick={() => void handleSpeedTest()}
                            >
                                {speedLoading
                                    ? "检测中"
                                    : settings.mode === "integrated"
                                      ? "检测内置"
                                      : "测速"}
                            </ActionButton>
                            {speedHint ? (
                                <span className="text-[13px] text-muted-foreground">
                                    {speedHint}
                                </span>
                            ) : null}
                            {savedHint ? (
                                <span className="text-[13px] text-muted-foreground">
                                    {savedHint}
                                </span>
                            ) : null}
                        </div>
                    </SettingsGroup>
                ) : null}

                <SettingsGroup
                    title="外部服务"
                    description={
                        webMode
                            ? "官方 / 社区预设，或自定义服务地址"
                            : "切换到外部服务后在此选择"
                    }
                >
                    <Select
                        value={settings.source}
                        onValueChange={(value) =>
                            handleSource(value as ExternalSourceId | null)
                        }
                    >
                        <SelectTrigger className="h-9 w-full min-w-[240px] max-w-md rounded-xl">
                            <SelectValue placeholder={sourceLabel}>
                                {sourceLabel}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {EXTERNAL_SOURCES.map((preset) => (
                                <SelectItem key={preset.id} value={preset.id}>
                                    {preset.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {settings.source === "custom" ? (
                        <div className="space-y-2">
                            <p className="text-[13px] font-medium text-muted-foreground">
                                自定义服务地址
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <input
                                    value={customDraft}
                                    onChange={(event) =>
                                        setCustomDraft(event.currentTarget.value)
                                    }
                                    onBlur={handleSaveCustom}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.currentTarget.blur()
                                        }
                                    }}
                                    aria-label="自定义服务地址"
                                    autoComplete="off"
                                    spellCheck={false}
                                    placeholder={DEFAULT_BASE_URL}
                                    className="material-field h-9 min-w-0 flex-1 rounded-xl px-3 text-[13px] outline-none focus-visible:outline-2 focus-visible:outline-ring"
                                />
                                <ActionButton
                                    variant="primary"
                                    className="shrink-0"
                                    onClick={handleSaveCustom}
                                >
                                    保存
                                </ActionButton>
                            </div>
                            <p className="truncate text-[13px] text-muted-foreground">
                                {settings.customUrl
                                    ? `已保存：${settings.customUrl}`
                                    : "尚未保存，输入后回车或点保存"}
                            </p>
                        </div>
                    ) : (
                        <p className="truncate text-[13px] text-muted-foreground">
                            {getNeteaseBaseUrl()}
                        </p>
                    )}
                    {webMode ? (
                        <div className="flex min-h-11 flex-wrap items-center gap-2">
                            <ActionButton
                                disabled={speedLoading}
                                onClick={() => void handleSpeedTest()}
                            >
                                {speedLoading ? "检测中" : "测速"}
                            </ActionButton>
                            {speedHint ? (
                                <span className="text-[13px] text-muted-foreground">
                                    {speedHint}
                                </span>
                            ) : null}
                            {savedHint ? (
                                <span className="text-[13px] text-muted-foreground">
                                    {savedHint}
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                </SettingsGroup>

                <SettingsGroup
                    title="B站服务"
                    description="对接模式下用于搜索、播放和收藏夹"
                >
                    <div className="space-y-2">
                        <p className="text-[13px] font-medium text-muted-foreground">
                            对接服务地址
                        </p>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <input
                                value={bilibiliDraft}
                                onChange={(event) =>
                                    setBilibiliDraft(
                                        event.currentTarget.value,
                                    )
                                }
                                onBlur={handleSaveBilibili}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.currentTarget.blur()
                                    }
                                }}
                                aria-label="B站对接服务地址"
                                autoComplete="off"
                                spellCheck={false}
                                placeholder={DEFAULT_BILIBILI_BASE_URL}
                                className="material-field h-9 min-w-0 flex-1 rounded-xl px-3 text-[13px] outline-none focus-visible:outline-2 focus-visible:outline-ring"
                            />
                            <ActionButton
                                variant="primary"
                                className="shrink-0"
                                onClick={handleSaveBilibili}
                            >
                                保存
                            </ActionButton>
                        </div>
                        <p className="truncate text-[13px] text-muted-foreground">
                            {getBilibiliBaseUrl()}
                        </p>
                    </div>
                </SettingsGroup>

                <SettingsGroup
                    title="网易云音质"
                    description="不可用时自动降级"
                >
                    <ChipRow>
                        {QUALITY_OPTIONS.map((option) => (
                            <ChoiceChip
                                key={option.br}
                                label={option.label}
                                active={qualityBr === option.br}
                                onClick={() => {
                                    setNeteaseQualityBr(option.br)
                                    setQualityBr(option.br)
                                }}
                            />
                        ))}
                    </ChipRow>
                </SettingsGroup>
            </div>
        </div>
    )
}

export { SourceTab }
