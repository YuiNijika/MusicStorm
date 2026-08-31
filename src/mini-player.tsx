import { invoke } from "@tauri-apps/api/core"
import { emit, listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react"
import { createRoot } from "react-dom/client"

interface MiniPlayerState {
  title: string
  artist: string
  coverUrl: string | null
  isPlaying: boolean
  positionMs: number
  durationMs: number
}

// 播放控制复用主窗口的全局命令监听（use-tray-commands）：
// toggle / previous / next 直接发 action 字符串，seek 用 seek-to + positionMs
function sendPlayerCommand(
  action: string,
  positionMs?: number,
): void {
  const payload =
    typeof positionMs === "number" ? { action, positionMs } : action
  void emit("musicstorm:player-command", payload).catch(() => {})
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function MusicNotePlaceholder() {
  return (
    <div
      style={{
        width: "72px",
        height: "72px",
        borderRadius: "10px",
        background: "rgba(255, 255, 255, 0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="rgba(255, 255, 255, 0.5)"
      >
        <path d="M9 18.5a2.5 2.5 0 1 1-2.5-2.5c.54 0 1.05.17 1.46.46L8 6.5 18.5 4v10.5a2.5 2.5 0 1 1-2.5-2.5c.54 0 1.05.17 1.46.46V6.28L9.5 8.1v10.4z" />
      </svg>
    </div>
  )
}

function MiniPlayerApp() {
  const [state, setState] = useState<MiniPlayerState>({
    title: "",
    artist: "",
    coverUrl: null,
    isPlaying: false,
    positionMs: 0,
    durationMs: 0,
  })
  const barRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Windows 上以 visible(false) 创建的 WebView2 偶发不触发首帧渲染，
    // 透明窗口表现为完全不可见；挂载后重走一次 hide→show 强制上屏
    const win = getCurrentWindow()
    win.hide().then(() => win.show()).catch(() => {})
  }, [])

  useEffect(() => {
    // 刚打开时先拉 Rust 侧缓存的最近状态，避免等下一拍 tick 才有内容
    invoke<MiniPlayerState>("get_mini_player_state")
      .then(setState)
      .catch(() => {})

    const unlisten = listen<MiniPlayerState>(
      "musicstorm:mini-player-state",
      (event) => {
        setState(event.payload)
      },
    )

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  function handleSeek(event: ReactMouseEvent<HTMLDivElement>) {
    const bar = barRef.current
    if (!bar || state.durationMs <= 0) {
      return
    }
    const rect = bar.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    sendPlayerCommand("seek-to", Math.round(ratio * state.durationMs))
  }

  const progress =
    state.durationMs > 0
      ? Math.min(100, (state.positionMs / state.durationMs) * 100)
      : 0

  return (
    <div
      data-tauri-drag-region
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        width: "100%",
        height: "100%",
        padding: "0 12px",
      }}
    >
      <div data-tauri-drag-region style={{ flexShrink: 0 }}>
        {state.coverUrl ? (
          <img
            src={state.coverUrl}
            alt=""
            draggable={false}
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "10px",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <MusicNotePlaceholder />
        )}
      </div>

      <div
        data-tauri-drag-region
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <div data-tauri-drag-region style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "rgba(255, 255, 255, 0.92)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {state.title || "未在播放"}
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "rgba(255, 255, 255, 0.55)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: "2px",
            }}
          >
            {state.artist}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              fontSize: "10px",
              color: "rgba(255, 255, 255, 0.45)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatTime(state.positionMs)}
          </span>
          <div
            ref={barRef}
            onClick={handleSeek}
            style={{
              flex: 1,
              height: "12px",
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "3px",
                borderRadius: "2px",
                background: "rgba(255, 255, 255, 0.18)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  borderRadius: "2px",
                  background: "#fff",
                }}
              />
            </div>
          </div>
          <span
            style={{
              fontSize: "10px",
              color: "rgba(255, 255, 255, 0.45)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatTime(state.durationMs)}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            aria-label="上一首"
            onClick={() => sendPlayerCommand("previous")}
            style={controlButtonStyle}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255, 255, 255, 0.85)">
              <path d="M6 5h2v14H6V5zm12 .7v12.6L8.7 12 18 5.7z" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={state.isPlaying ? "暂停" : "播放"}
            onClick={() => sendPlayerCommand("toggle")}
            style={{ ...controlButtonStyle, width: "30px", height: "30px" }}
          >
            {state.isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                <path d="M7 5h3.5v14H7V5zm6.5 0H17v14h-3.5V5z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                <path d="M8 5.5v13l10.5-6.5L8 5.5z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            aria-label="下一首"
            onClick={() => sendPlayerCommand("next")}
            style={controlButtonStyle}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255, 255, 255, 0.85)">
              <path d="M16 5h2v14h-2V5zM6 5.7 15.3 12 6 18.3V5.7z" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          aria-label="关闭小播放器"
          onClick={() => {
            void invoke("hide_mini_player").catch(() => {})
          }}
          style={{ ...controlButtonStyle, width: "20px", height: "20px" }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="rgba(255, 255, 255, 0.6)">
            <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

const controlButtonStyle: CSSProperties = {
  width: "24px",
  height: "24px",
  borderRadius: "50%",
  border: "none",
  background: "rgba(255, 255, 255, 0.1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
}

createRoot(document.getElementById("root")!).render(<MiniPlayerApp />)
