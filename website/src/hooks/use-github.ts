import { useEffect, useState } from "react"

import { loadContributors, loadLatestRelease } from "../lib/github"
import type { Contributor, ReleaseInfo } from "../lib/github"

interface AsyncValue<T> {
    data: T | null
    /** true = 没有任何可展示的数据（无缓存且回源未返回） */
    loading: boolean
}

/** SWR 接线：有缓存立即展示（可能过期），后台回源完成后静默更新 */
function useLatestRelease(): AsyncValue<ReleaseInfo> {
    const [release, setRelease] = useState<ReleaseInfo | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        const { cached, refreshed } = loadLatestRelease()
        if (cached) {
            setRelease(cached)
            setLoading(false)
        }
        void refreshed.then((info) => {
            if (cancelled) {
                return
            }
            if (info) {
                setRelease(info)
            }
            setLoading(false)
        })
        return () => {
            cancelled = true
        }
    }, [])

    return { data: release, loading }
}

function useContributors(): AsyncValue<Contributor[]> {
    const [contributors, setContributors] = useState<Contributor[] | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        const { cached, refreshed } = loadContributors()
        if (cached) {
            setContributors(cached)
            setLoading(false)
        }
        void refreshed.then((list) => {
            if (cancelled) {
                return
            }
            if (list) {
                setContributors(list)
            }
            setLoading(false)
        })
        return () => {
            cancelled = true
        }
    }, [])

    return { data: contributors, loading }
}

export { useLatestRelease, useContributors }
