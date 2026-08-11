import { useEffect, useState } from "react"

// hash 路由：`#/docs/slug` 走文档页，其余（含 #features 等页内锚点）都归首页，
// 与首页现有的锚点导航共存
type Route = { page: "home" } | { page: "docs"; slug: string | null }

function parseHash(): Route {
    const hash = window.location.hash
    if (hash.startsWith("#/docs")) {
        const slug = hash.replace(/^#\/docs\/?/, "") || null
        return { page: "docs", slug }
    }
    return { page: "home" }
}

function useHashRoute(): Route {
    const [route, setRoute] = useState<Route>(() => parseHash())

    useEffect(() => {
        function onHashChange() {
            setRoute(parseHash())
        }
        window.addEventListener("hashchange", onHashChange)
        return () => window.removeEventListener("hashchange", onHashChange)
    }, [])

    return route
}

export { useHashRoute }
export type { Route }
