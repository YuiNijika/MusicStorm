import { listen } from "@tauri-apps/api/event"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

interface LyricLine {
  timeMs: number
  text: string
  translation?: string
}

interface DesktopLyricState {
  positionMs: number
  lines: LyricLine[]
  trackTitle: string
  trackArtist: string
}

function DesktopLyricApp() {
  const [state, setState] = useState<DesktopLyricState>({
    positionMs: 0,
    lines: [],
    trackTitle: "",
    trackArtist: "",
  })

  useEffect(() => {
    const unlisten = listen<DesktopLyricState>("musicstorm:desktop-lyric-update", (event) => {
      setState(event.payload)
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  const activeIndex = state.lines.findIndex((line, index) => {
    const nextLine = state.lines[index + 1]
    return state.positionMs >= line.timeMs && (!nextLine || state.positionMs < nextLine.timeMs)
  })

  if (state.lines.length === 0) {
    return (
      <div id="root">
        <div className="no-lyric">
          {state.trackTitle ? "暂无歌词" : "播放歌曲后显示歌词"}
        </div>
        {state.trackTitle && (
          <div className="track-info">
            {state.trackTitle} · {state.trackArtist}
          </div>
        )}
      </div>
    )
  }

  return (
    <div id="root">
      {state.lines.map((line, index) => (
        <div
          key={`${line.timeMs}-${index}`}
          className={`lyric-line ${index === activeIndex ? "active" : ""}`}
        >
          {line.text}
          {line.translation && index === activeIndex && (
            <div style={{ fontSize: "12px", marginTop: "4px", opacity: 0.7 }}>
              {line.translation}
            </div>
          )}
        </div>
      ))}
      <div className="track-info">
        {state.trackTitle} · {state.trackArtist}
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<DesktopLyricApp />)