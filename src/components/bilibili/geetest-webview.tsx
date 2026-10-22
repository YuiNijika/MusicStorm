import { useEffect, useMemo, useRef } from "react"
import { X } from "lucide-react"

import { ActionButton } from "@/pages/settings/settings-ui"
import type { BilibiliGeetestChallenge } from "@/lib/bilibili/auth"

type GeetestResult = {
    geetest_challenge: string
    geetest_validate: string
    geetest_seccode: string
}

type GeetestMessage =
    | { type: "success"; result: GeetestResult }
    | { type: "error"; message: string }
    | { type: "close" }

type GeetestWebViewProps = {
    challenge: BilibiliGeetestChallenge
    onSuccess: (result: GeetestResult) => void
    onCancel: () => void
    onError: (message: string) => void
}

function buildGeetestHtml(challenge: BilibiliGeetestChallenge): string {
    const gt = JSON.stringify(challenge.gt).replace(/</g, "\\u003c")
    const value = JSON.stringify(challenge.challenge).replace(/</g, "\\u003c")
    const callback = `geetest_${Date.now()}`
    const callbackName = JSON.stringify(callback)
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body{margin:0;min-height:100%;font-family:system-ui,sans-serif;background:transparent;color:#202124;overscroll-behavior:contain}
body{display:grid;place-items:center;min-height:260px;padding:16px;box-sizing:border-box}
#status{font-size:14px;color:#687078;text-align:center}
#captcha{width:min(100%,320px)}
</style>
</head>
<body>
<div id="captcha"></div>
<div id="status" role="status">正在载入安全验证…</div>
<script>
const gt=${gt};
const challenge=${value};
const callbackName=${callbackName};
const send=(message)=>window.parent.postMessage(message,"*");
let captcha;
window[callbackName]=(response)=>{
  if(!response||response.status!=="success"||!response.data){
    send({type:"error",message:"极验验证参数加载失败"});
    return;
  }
  const config=Object.assign({
    gt,
    challenge,
    offline:false,
    new_captcha:true,
    product:"bind",
    width:"100%",
    https:true,
    protocol:"https://"
  },response.data);
  captcha=new Geetest(config)
    .onSuccess(()=>send({type:"success",result:captcha.getValidate()}))
    .onError(()=>send({type:"error",message:"极验验证失败，请重试"}))
    .onClose(()=>send({type:"close"}));
  captcha.onReady(()=>captcha.verify());
};
const script=document.createElement("script");
script.src="https://static.geetest.com/static/js/fullpage.0.0.0.js";
script.onload=()=>{
  const config=document.createElement("script");
  config.src="https://api.geetest.com/gettype.php?gt="+encodeURIComponent(gt)+"&callback="+encodeURIComponent(callbackName);
  config.onerror=()=>send({type:"error",message:"极验验证服务暂不可用"});
  document.head.appendChild(config);
};
script.onerror=()=>send({type:"error",message:"极验验证组件载入失败"});
document.head.appendChild(script);
</script>
</body>
</html>`
}

function GeetestWebView({
    challenge,
    onSuccess,
    onCancel,
    onError,
}: GeetestWebViewProps) {
    const frameRef = useRef<HTMLIFrameElement>(null)
    const srcDoc = useMemo(() => buildGeetestHtml(challenge), [challenge])

    useEffect(() => {
        function handleMessage(event: MessageEvent<unknown>) {
            if (event.source !== frameRef.current?.contentWindow) {
                return
            }
            const message = event.data as Partial<GeetestMessage> | null
            if (!message || typeof message !== "object") {
                return
            }
            if (
                message.type === "success" &&
                "result" in message &&
                message.result &&
                typeof message.result.geetest_challenge === "string" &&
                typeof message.result.geetest_validate === "string" &&
                typeof message.result.geetest_seccode === "string"
            ) {
                onSuccess(message.result)
                return
            }
            if (message.type === "error" && "message" in message) {
                onError(
                    typeof message.message === "string"
                        ? message.message
                        : "极验验证失败，请重试",
                )
                return
            }
            if (message.type === "close") {
                onCancel()
            }
        }

        window.addEventListener("message", handleMessage)
        return () => window.removeEventListener("message", handleMessage)
    }, [onCancel, onError, onSuccess])

    return (
        <section
            aria-label="极验安全验证"
            className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-fill)]"
        >
            <header className="flex min-h-10 items-center justify-between border-b border-[var(--border)] px-3">
                <span className="text-[13px] font-medium">安全验证</span>
                <ActionButton
                    variant="default"
                    className="min-h-11 min-w-11"
                    icon={<X aria-hidden="true" className="size-3.5" />}
                    onClick={onCancel}
                    aria-label="关闭安全验证"
                />
            </header>
            <iframe
                ref={frameRef}
                title="哔哩哔哩极验安全验证"
                srcDoc={srcDoc}
                sandbox="allow-scripts allow-forms"
                referrerPolicy="no-referrer"
                className="block h-[300px] w-full border-0 bg-transparent [overscroll-behavior:contain] [touch-action:manipulation]"
            />
        </section>
    )
}

export { GeetestWebView }
export type { GeetestResult }
