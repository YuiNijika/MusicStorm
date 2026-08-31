import { useEffect, useState } from "react"

import { useAppUpdate } from "@/hooks/use-app-update"
import { useContributors } from "@/hooks/use-contributors"
import { CACHE_TTL_MS } from "@/lib/app/github-update"
import {
    UPDATE_SOURCE_EVENT,
    readUpdateSource,
    setUpdateSource,
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

function UpdateTab() {
    const { status, checking, refresh } = useAppUpdate()
    const [updateSource, setUpdateSourceState] = useState<UpdateSource>(() =>
        readUpdateSource(),
    )

    // 切换更新源后立即用新源重查
    useEffect(() => {
        function onUpdateSource() {
            setUpdateSourceState(readUpdateSource())
            void refresh(true)
        }
        window.addEventListener(UPDATE_SOURCE_EVENT, onUpdateSource)
        return () => {
            window.removeEventListener(UPDATE_SOURCE_EVENT, onUpdateSource)
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

    const current = status?.currentVersion || "—"
    const latest = status?.latestVersion || "—"
    const releaseTitle =
        status?.releaseName || status?.latestTag || "暂无 Release 信息"
    const body = status?.releaseBody?.trim() || ""

    return (
        <div className="space-y-3">
            <TabHeader title="更新" description="通过 GitHub Releases 检测，不自动安装" />

            <div className="space-y-3">
                <SettingsGroup
                    title="更新源"
                    description="默认 GitHub 官方仓库；访问受限时可切换镜像加速"
                >
                    <div className="flex flex-wrap gap-2">
                        <ChoiceChip
                            label="官方仓库"
                            active={updateSource === "github"}
                            onClick={() => setUpdateSource("github")}
                        />
                        <ChoiceChip
                            label="镜像加速"
                            active={updateSource === "mirror"}
                            onClick={() => setUpdateSource("mirror")}
                        />
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                        {updateSource === "mirror"
                            ? "当前走 https://gh-proxy.com/ 镜像，接口 403 时自动重试（最多 5 次）"
                            : "当前直连 api.github.com，匿名额度受限时会自动重试（最多 5 次）"}
                    </p>
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
                        <ActionButton
                            variant="primary"
                            onClick={() => void handleOpenRelease()}
                        >
                            前往更新
                        </ActionButton>
                    </div>
                </SettingsGroup>

                <SettingsGroup title={releaseTitle}>
                    {status?.latestTag ? (
                        <p className="font-mono text-[13px] text-muted-foreground">
                            tag {status.latestTag}
                        </p>
                    ) : null}
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
