// 旧 WebView（Chromium < 111）不支持 oklch / color-mix，桌面调色板在这些
// 设备上整段失效：运行时检测能力，让 appearance-prefs 注入兼容色板，
// 保证移动端（Android 系统 WebView 常滞后）与 PC 观感一致。
function colorCapability(): { oklch: boolean; colorMix: boolean } {
    if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
        return { oklch: false, colorMix: false }
    }
    return {
        oklch: CSS.supports("color", "oklch(0.5 0.1 250)"),
        colorMix: CSS.supports("color", "color-mix(in oklab, red, blue)"),
    }
}

function needsColorFallback(): boolean {
    const { oklch, colorMix } = colorCapability()
    return !oklch || !colorMix
}

// 色点预览（标题栏/设置），与 applyAppearanceToDom 的降级策略一致：
// 不支持 oklch 时用近似 HSL，保证色块不空
function accentSwatch(hue: number, neutral = false): string {
    if (needsColorFallback()) {
        return neutral ? `hsl(${hue} 12% 72%)` : `hsl(${hue} 55% 62%)`
    }
    return neutral ? `oklch(0.72 0.02 ${hue})` : `oklch(0.62 0.14 ${hue})`
}

export { accentSwatch, needsColorFallback }
