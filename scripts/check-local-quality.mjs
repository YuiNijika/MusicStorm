/** 路由矩阵 */
import assert from "node:assert/strict"

// 轻量复刻判定逻辑，避免拉 TS 路径别名
const HIGH = new Set(["flac", "wav", "aiff", "aif", "alac", "ape", "dsf", "dff", "wv"])

function ext(path) {
    const base = path.split(/[/\\]/).pop() ?? path
    const i = base.lastIndexOf(".")
    return i < 0 ? "" : base.slice(i + 1).toLowerCase()
}

function isLocalHQ(track) {
    if (track.source !== "local" || !track.filePath) return false
    const e = ext(track.filePath)
    if (HIGH.has(e)) return true
    if ((e === "m4a" || e === "mp4") && /alac/i.test(track.filePath)) return true
    if (e === "mp3" && typeof track.bitrateKbps === "number" && track.bitrateKbps >= 320) return true
    return false
}

function shouldWasapi(track, pref, tauri = true) {
    if (pref === "html5" || !tauri) return false
    if (!track.filePath || track.source === "netease") return false
    if (/^https?:\/\//i.test(track.filePath)) return false
    if (pref === "wasapi") return true
    return isLocalHQ(track)
}

const flac = { source: "local", filePath: "D:/music/a.flac" }
const mp3 = { source: "local", filePath: "D:/music/b.mp3" }
const mp3hq = { source: "local", filePath: "D:/music/c.mp3", bitrateKbps: 320 }
const netease = { source: "netease", filePath: undefined, url: "https://m.com/x.mp3" }
const remotePath = { source: "local", filePath: "https://cdn/x.flac" }

assert.equal(shouldWasapi(flac, "auto"), true)
assert.equal(shouldWasapi(mp3, "auto"), false)
assert.equal(shouldWasapi(mp3hq, "auto"), true)
assert.equal(shouldWasapi(netease, "auto"), false)
assert.equal(shouldWasapi(netease, "wasapi"), false)
assert.equal(shouldWasapi(mp3, "wasapi"), true)
assert.equal(shouldWasapi(flac, "html5"), false)
assert.equal(shouldWasapi(remotePath, "auto"), false)
assert.equal(shouldWasapi(flac, "auto", false), false)

console.log("local-quality matrix ok")