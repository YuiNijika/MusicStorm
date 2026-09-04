// 探测本机是否已安装 MusicStorm（自定义协议 musicstorm://）。
// 原理：隐藏 iframe 指向协议 URL —— 若已安装，浏览器会尝试拉起应用并导致页面失焦；
// 超时仍无失焦则判定未安装。启发式探测，非 100% 精确，仅用于是否主动提示"打开应用"。
function probeMusicStormApp(timeoutMs = 1500): Promise<boolean> {
    return new Promise((resolve) => {
        if (typeof window === "undefined") {
            resolve(false)
            return
        }
        let settled = false
        let blurred = false
        let timer: number | undefined

        const onBlur = () => {
            blurred = true
        }

        const finish = (value: boolean) => {
            if (settled) {
                return
            }
            settled = true
            if (timer !== undefined) {
                clearTimeout(timer)
            }
            window.removeEventListener("blur", onBlur)
            try {
                el.parentNode?.removeChild(el)
            } catch {
                // 已卸载忽略
            }
            resolve(value)
        }

        window.addEventListener("blur", onBlur)
        timer = window.setTimeout(() => finish(blurred), timeoutMs)

        const el = document.createElement("iframe")
        el.setAttribute("aria-hidden", "true")
        el.style.cssText = "display:none;width:0;height:0;border:0"
        el.src = "musicstorm://"
        document.body.appendChild(el)
    })
}

export { probeMusicStormApp }