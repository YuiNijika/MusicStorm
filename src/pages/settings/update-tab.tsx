import { Section } from "@/components/music/section"
import { useAppUpdate } from "@/hooks/use-app-update"
import { useContributors } from "@/hooks/use-contributors"
import { CACHE_TTL_MS } from "@/lib/app/github-update"
import {
    GITHUB_REPO_URL,
    openExternalUrl,
} from "@/lib/open-external"
import {
    notifyError,
    notifyInfo,
    notifySuccess,
} from "@/lib/notify"
import { SettingsGroup } from "@/pages/settings/settings-ui"
import { cn } from "@/lib/utils"

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
        <Section
            title="版本更新"
            description="通过 GitHub Releases 检测，不自动安装"
        >
            <div className="space-y-3">
                <SettingsGroup>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="material-surface rounded-2xl px-3.5 py-3">
                            <p className="text-[11px] font-medium text-muted-foreground">
                                当前版本
                            </p>
                            <p className="mt-1 font-mono text-[18px] font-semibold tracking-[-0.02em]">
                                {current}
                            </p>
                        </div>
                        <div className="material-surface rounded-2xl px-3.5 py-3">
                            <p className="text-[11px] font-medium text-muted-foreground">
                                最新版本
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                <p className="font-mono text-[18px] font-semibold tracking-[-0.02em]">
                                    {latest}
                                </p>
                                {status?.hasUpdate ? (
                                    <span className="rounded-full bg-rose-500/90 px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.04em] text-white">
                                        new
                                    </span>
                                ) : status?.latestVersion ? (
                                    <span className="rounded-full bg-[var(--surface-fill)] px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                                        最新
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
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
                        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
                            {status.error}
                            {status.latestVersion
                                ? "（已展示缓存结果）"
                                : ""}
                        </p>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void handleRefresh()}
                            disabled={checking}
                            className={cn(
                                "h-9 cursor-pointer rounded-full bg-[var(--surface-fill)] px-4 text-[12px] font-medium",
                                "transition-[background-color,transform] hover:bg-[var(--surface-fill-hover)] active:scale-[0.97] active:duration-[var(--duration-press)] disabled:cursor-not-allowed disabled:opacity-45",
                            )}
                        >
                            {checking ? "检测中…" : "刷新检测"}
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleOpenRelease()}
                            className={cn(
                                "h-9 cursor-pointer rounded-full bg-foreground px-4 text-[12px] font-medium text-background",
                                "transition-[transform,opacity] hover:opacity-92 active:scale-[0.97] active:duration-[var(--duration-press)]",
                            )}
                        >
                            前往更新
                        </button>
                    </div>
                </SettingsGroup>

                <SettingsGroup title={releaseTitle}>
                    {status?.latestTag ? (
                        <p className="-mt-2 font-mono text-[11px] text-muted-foreground">
                            tag {status.latestTag}
                        </p>
                    ) : null}
                    {body ? (
                        <pre className="material-surface max-h-[min(420px,50vh)] overflow-auto whitespace-pre-wrap break-words rounded-2xl px-3.5 py-3 text-[12.5px] leading-relaxed text-foreground/90">
                            {body}
                        </pre>
                    ) : (
                        <p className="text-[13px] text-muted-foreground">
                            暂无 Release 说明。可点「刷新检测」从 GitHub
                            拉取最新信息。
                        </p>
                    )}
                </SettingsGroup>

                <ContributorsPanel />
            </div>
        </Section>
    )
}

// 开源共建者头像墙
function ContributorsPanel() {
    const { contributors, loading } = useContributors()

    return (
        <SettingsGroup title="贡献者">
            <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] text-muted-foreground">
                    感谢每一位贡献者
                </p>
                <button
                    type="button"
                    onClick={() => void openExternalUrl(GITHUB_REPO_URL)}
                    className="cursor-pointer text-[11px] text-muted-foreground transition-colors hover:text-foreground"
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
                            <span className="w-full truncate text-center text-[11px] text-muted-foreground transition-colors group-hover:text-foreground">
                                {contributor.login}
                            </span>
                        </button>
                    ))}
                </div>
            ) : (
                <p className="text-[12px] text-muted-foreground">
                    暂时拉取不到贡献者列表，可稍后再试。
                </p>
            )}
        </SettingsGroup>
    )
}

export { UpdateTab }
