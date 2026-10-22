export type AppRoute =
    | "home"
    | "bilibili"
    | "discover"
    | "local"
    | "library"
    | "radios"
    | "search"
    | "stats"
    | "settings"
    | "feedback"

// 主内容详情栈，状态在 navigation hook
export type MusicDetail =
    | { type: "playlist"; id: string }
    | { type: "artist"; id: string }
    | { type: "album"; id: string }
    | { type: "radio"; id: string }
    | { type: "radio-program"; id: string; radioId?: string }
    | { type: "mv"; id: string }
    | { type: "comments"; id: string; title?: string; subtitle?: string }
