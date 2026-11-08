import { CircleLoader } from "react-spinners"

/**
 * 全局加载指示器：react-spinners 的 CircleLoader，color 用 currentColor
 * 继承文本色，自动跟随明暗主题与强调色。属功能性 loading 提示，
 * 不受外观「载入动画」（路由切换动画）开关影响。
 */
function LoadingSpinner({
    size = 24,
    className,
}: {
    /** 直径（px） */
    size?: number
    className?: string
}) {
    return (
        <CircleLoader color="currentColor" size={size} className={className} />
    )
}

export { LoadingSpinner }
