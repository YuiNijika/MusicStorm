import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { useAppUpdate } from "@/hooks/use-app-update"
import { useContributors } from "@/hooks/use-contributors"
import {
    IDLE_STATE,
    downloadAndInstall,
    isUpdaterSupported,
    subscribeUpdateProgress,
    type UpdateDownloadState,
} from "@/lib/app/auto-update"
import { CACHE_TTL_MS } from "@/lib/app/github-update"
import {
    DOWNLOAD_SOURCE_EVENT,
    UPDATE_SOURCE_EVENT,
    readDetectSource,
    readDownloadSource,
    setDetectSource,
    setDownloadSource,
    type UpdateSource,
} from "@/lib/app/update-source-prefs"
import {
    GITHUB_REPO_URL,
    openExternalUrl,
} from "@/lib/open-external"
import {
    notifyError,
    notifyInfo,
    notifySuccess,
} from "@/lib/notify"
import {
    ActionButton,
    ChoiceChip,
    ChoiceRow,
    SettingsGroup,
    TabHeader,
} from "@/pages/settings/settings-ui"

function formatCheckedAt(ts: number): string {
    try {
        return new Date(ts).toLocaleString("zh-CN", {
            hour12: false,
        })
    } catch {
        return "—"
    }
}

function formatCacheTtlLabel(): string {
    const hours = CACHE_TTL_MS / (60 * 60 * 1000)
    return Number.isInteger(hours)
        ? `${hours} 小时`
        : `${hours.toFixed(1)} 小时`
}

function formatSize(bytes: number): string {
    if (bytes <= 0) {
        return "—"
    }
    const mb = bytes / (1024 * 1024)
    return mb >= 1
        ? `${mb.toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function UpdateTab() {
    const { status, checking, refresh } = useAppUpdate()
    const [detectSource, setDetectSourceState] = useState<UpdateSource>(() =>
        readDetectSource(),
    )
    const [downloadSource, setDownloadSourceState] =
        useState<UpdateSource>(() => readDownloadSource())
    // Windows 桌面专属：应用内自动下载并静默安装
    const updaterSupported = isUpdaterSupported()
    const [updateState, setUpdateState] =
        useState<UpdateDownloadState>(IDLE_STATE)
    const [confirmOpen, setConfirmOpen] = useState(false)

    // 订阅 Rust 下载进度事件：downloaded 达 total 后进入安装阶段
    useEffect(() => {
        let unlisten: (() => void) | undefined
        let cancelled = false
        void subscribeUpdateProgress(({ downloaded, total }) => {
            if (cancelled) {
                return
            }
            setUpdateState((prev) => {
                const next: UpdateDownloadState = {
                    ...prev,
                    phase: "downloading",
                    downloaded,
                    total,
                }
                if (total > 0 && downloaded >= total) {
                    next.phase = "installing"
                }
                return next
            })
        }).then((un) => {
            if (cancelled) {
                un()
            } else {
                unlisten = un
            }
        })
        return () => {
            cancelled = true
            unlisten?.()
        }
    }, [])

    // 打开设置页时若尚未检测（或上次检测失败无数据），自动拉取一次，
    // 保证版本相等时也能看到最新 release 内容，而不是空态
    useEffect(() => {
        if (!status && !checking) {
            void refresh(false)
        }
    }, [status, checking, refresh])

    // 切换更新源后立即用新源重查（检测源）；下载源仅同步状态
    useEffect(() => {
        function onUpdateSource() {
            setDetectSourceState(readDetectSource())
            void refresh(true)
        }
        function onDownloadSource() {
            setDownloadSourceState(readDownloadSource())
        }
        window.addEventListener(UPDATE_SOURCE_EVENT, onUpdateSource)
        window.addEventListener(DOWNLOAD_SOURCE_EVENT, onDownloadSource)
        return () => {
            window.removeEventListener(UPDATE_SOURCE_EVENT, onUpdateSource)
            window.removeEventListener(DOWNLOAD_SOURCE_EVENT, onDownloadSource)
        }
    }, [refresh])

    async function handleRefresh() {
        try {
            const result = await refresh(true)
            if (result.error && !result.latestVersion) {
                notifyError("检查更新失败", { description: result.error })
                return
            }
            if (result.hasUpdate) {
                notifySuccess("发现新版本", {
                    description: `${result.currentVersion} → ${result.latestVersion}`,
                })
                return
            }
            notifyInfo("已是最新版本", {
                description: result.currentVersion
                    ? `当前 ${result.currentVersion}`
                    : undefined,
            })
        } catch (error) {
            notifyError("检查更新失败", {
                description:
                    error instanceof Error ? error.message : "未知错误",
            })
        }
    }

    async function handleOpenRelease() {
        const url =
            status?.htmlUrl?.trim() ||
            "https://github.com/YuiNijika/MusicStorm/releases/latest"
        await openExternalUrl(url)
    }

    async function handleUpdate() {
        // 下载一律用「版本号构造的正式 tag」
        // 不直接用 latestTag：后者可能带 -android / -wsapi-fix 等后缀或来自旧缓存
        const tag = status?.latestVersion
            ? `v${status.latestVersion}`
            : status?.latestTag
        if (!tag) {
            return
        }
        setConfirmOpen(false)
        setUpdateState({ phase: "downloading", downloaded: 0, total: 0 })
        try {
            await downloadAndInstall(tag)
            // 安装启动后进程退出，此处仅兜底复位
            setUpdateState(IDLE_STATE)
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "更新失败"
            setUpdateState({ ...IDLE_STATE, phase: "error", error: message })
            notifyError("自动更新失败", { description: message })
        }
    }

    const current = status?.currentVersion || "—"
    const latest = status?.latestVersion || "—"
    const releaseTitle =
        status?.releaseName || status?.latestTag || "暂无 Release 信息"
    const body = status?.releaseBody?.trim() || ""

    return (
        <div className="space-y-3">
            <TabHeader
                title="更新"
                description="通过 GitHub Releases 检测；Windows 桌面支持一键自动更新"
            />

            <div className="space-y-3">
                <SettingsGroup
                    title="更新源"
                    description="检测与下载可分别选择镜像，访问受限时切换加速"
                >
                    <div className="space-y-3">
                        <ChoiceRow
                            label="检测源"
                            description="版本检测与更新日志拉取（随系统网络）"
                        >
                            <ChoiceChip
                                label="官方仓库"
                                active={detectSource === "github"}
                                onClick={() => setDetectSource("github")}
                            />
                            <ChoiceChip
                                label="镜像加速"
                                active={detectSource === "mirror"}
                                onClick={() => setDetectSource("mirror")}
                            />
                        </ChoiceRow>
                        <ChoiceRow
                            label="下载源"
                            description="安装包下载（直连失败自动切另一个源）"
                        >
                            <ChoiceChip
                                label="官方仓库"
                                active={downloadSource === "github"}
                                onClick={() => setDownloadSource("github")}
                            />
                            <ChoiceChip
                                label="镜像加速"
                                active={downloadSource === "mirror"}
                                onClick={() => setDownloadSource("mirror")}
                            />
                        </ChoiceRow>
                    </div>
                </SettingsGroup>

                <SettingsGroup title="版本状态">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="material-surface rounded-2xl px-3.5 py-3">
                            <p className="text-[13px] font-medium text-muted-foreground">
                                当前版本
                            </p>
                            <p className="mt-1 font-mono text-[18px] font-semibold tracking-[-0.02em]">
                                {current}
                            </p>
                        </div>
                        <div className="material-surface rounded-2xl px-3.5 py-3">
                            <p className="text-[13px] font-medium text-muted-foreground">
                                最新版本
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                <p className="font-mono text-[18px] font-semibold tracking-[-0.02em]">
                                    {latest}
                                </p>
                                {status?.hasUpdate ? (
                                    <span className="rounded-full bg-rose-500/90 px-1.5 py-px text-[13px] font-semibold uppercase tracking-[0.04em] text-white">
                                        new
                                    </span>
                                ) : status?.latestVersion ? (
                                    <span className="rounded-full bg-[var(--surface-fill)] px-1.5 py-px text-[13px] font-medium text-muted-foreground">
                                        最新
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                        {status?.checkedAt ? (
                            <span>
                                上次检测 {formatCheckedAt(status.checkedAt)}
                                {status.fromCache ? " · 缓存" : " · 实时"}
                            </span>
                        ) : (
                            <span>尚未检测</span>
                        )}
                        <span className="text-muted-foreground/50">·</span>
                        <span>缓存 {formatCacheTtlLabel()}</span>
                        {status?.publishedAt ? (
                            <>
                                <span className="text-muted-foreground/50">
                                    ·
                                </span>
                                <span>
                                    发布{" "}
                                    {formatCheckedAt(
                                        Date.parse(status.publishedAt) || 0,
                                    )}
                                </span>
                            </>
                        ) : null}
                    </div>

                    {status?.error ? (
                        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                            {status.error}
                            {status.latestVersion
                                ? "（已展示缓存结果）"
                                : ""}
                        </p>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                        <ActionButton
                            onClick={() => void handleRefresh()}
                            disabled={checking}
                        >
                            {checking ? "检测中…" : "刷新检测"}
                        </ActionButton>
                        {status?.hasUpdate && updaterSupported ? (
                            <ActionButton
                                variant="primary"
                                onClick={() => setConfirmOpen(true)}
                                disabled={
                                    updateState.phase === "downloading" ||
                                    updateState.phase === "installing"
                                }
                            >
                                {updateState.phase === "downloading"
                                    ? "下载中…"
                                    : updateState.phase === "installing"
                                      ? "安装中…"
                                      : "立即更新"}
                            </ActionButton>
                        ) : null}
                    </div>

                    {updateState.phase === "downloading" ? (
                        <div className="space-y-1">
                            <Progress
                                value={
                                    updateState.total > 0
                                        ? Math.min(
                                              100,
                                              Math.round(
                                                  (updateState.downloaded /
                                                      updateState.total) *
                                                      100,
                                              ),
                                          )
                                        : 0
                                }
                            >
                                <span className="text-[12px] tabular-nums text-muted-foreground">
                                    下载中…{" "}
                                    {formatSize(updateState.downloaded)} /{" "}
                                    {formatSize(updateState.total)}
                                </span>
                            </Progress>
                        </div>
                    ) : updateState.phase === "installing" ? (
                        <p className="text-sm text-muted-foreground">
                            正在打开安装程序，请按向导完成安装…
                        </p>
                    ) : null}
                </SettingsGroup>

                <SettingsGroup title={releaseTitle}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        {status?.latestTag ? (
                            <p className="font-mono text-[13px] text-muted-foreground">
                                tag {status.latestTag}
                            </p>
                        ) : null}
                        <ActionButton
                            variant="ghost"
                            onClick={() => void handleOpenRelease()}
                        >
                            在 GitHub 查看 Release
                        </ActionButton>
                    </div>
                    {body ? (
                        <pre className="material-surface max-h-[min(420px,50vh)] overflow-auto whitespace-pre-wrap break-words rounded-2xl px-3.5 py-3 text-sm leading-relaxed text-foreground/90">
                            {body}
                        </pre>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            暂无 Release 说明。可点「刷新检测」从 GitHub
                            拉取最新信息。
                        </p>
                    )}
                </SettingsGroup>

                <ContributorsPanel />
            </div>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="gap-4">
                    <DialogHeader>
                        <DialogTitle>更新到 v{latest}</DialogTitle>
                        <DialogDescription>
                            将下载安装包并打开安装程序，请按向导选择安装目录完成更新。
                            请保持网络连接。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex-row justify-end gap-2 sm:justify-end">
                        <Button
                            variant="ghost"
                            onClick={() => setConfirmOpen(false)}
                        >
                            取消
                        </Button>
                        <Button onClick={() => void handleUpdate()}>
                            立即更新
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

// 开源共建者头像墙
function ContributorsPanel() {
    const { contributors, loading } = useContributors()

    return (
        <SettingsGroup title="贡献者">
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-muted-foreground">
                    感谢每一位贡献者
                </p>
                <button
                    type="button"
                    onClick={() => void openExternalUrl(GITHUB_REPO_URL)}
                    className="cursor-pointer text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                    在 GitHub 上参与共建 →
                </button>
            </div>
            {loading && contributors.length === 0 ? (
                <div className="flex flex-wrap gap-3" aria-hidden="true">
                    {Array.from({ length: 4 }, (_, i) => (
                        <span
                            key={i}
                            className="size-10 animate-pulse rounded-full bg-[var(--surface-fill)]"
                        />
                    ))}
                </div>
            ) : contributors.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                    {contributors.map((contributor) => (
                        <button
                            key={contributor.login}
                            type="button"
                            title={`${contributor.login} · ${contributor.contributions} 次提交`}
                            onClick={() =>
                                void openExternalUrl(contributor.htmlUrl)
                            }
                            className="group flex w-16 cursor-pointer flex-col items-center gap-1.5"
                        >
                            <img
                                src={contributor.avatarUrl}
                                alt={contributor.login}
                                loading="lazy"
                                className="size-10 rounded-full ring-1 ring-black/[0.08] transition-transform group-hover:scale-105 dark:ring-white/[0.12]"
                            />
                            <span className="w-full truncate text-center text-[13px] text-muted-foreground transition-colors group-hover:text-foreground">
                                {contributor.login}
                            </span>
                        </button>
                    ))}
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">
                    暂时拉取不到贡献者列表，可稍后再试。
                </p>
            )}
        </SettingsGroup>
    )
}

export { UpdateTab }
