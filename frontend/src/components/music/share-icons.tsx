"use client"

import { FaEye } from "react-icons/fa6"
import {
    SiFacebook,
    SiQq,
    SiQzone,
    SiSinaweibo,
    SiTelegram,
    SiWechat,
    SiX,
} from "react-icons/si"
import type { IconType } from "react-icons"

import type { SharePlatformId } from "@/lib/share/share"

// 品牌图标统一走 react-icons（Simple Icons 官方图形），避免手绘失真。
// 朋友圈无官方品牌图标，用「眼」= 朋友圈/视线语义作占位镜像色。
const BRAND_ICONS: Record<SharePlatformId, IconType> = {
    qq: SiQq,
    qzone: SiQzone,
    wechat: SiWechat,
    moments: FaEye,
    facebook: SiFacebook,
    x: SiX,
    telegram: SiTelegram,
    weibo: SiSinaweibo,
}

const BRAND_COLORS: Record<SharePlatformId, string> = {
    qq: "#12B7F5",
    qzone: "#FFCB2E",
    wechat: "#07C160",
    moments: "#FFA94D",
    facebook: "#1877F2",
    x: "#111111",
    telegram: "#229ED9",
    weibo: "#E6162D",
}

function SharePlatformIcon({
    id,
    className,
}: {
    id: SharePlatformId
    className?: string
}) {
    const Icon = BRAND_ICONS[id]
    return (
        <span
            aria-hidden
            className={
                className ??
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm"
            }
            style={{ background: BRAND_COLORS[id] }}
        >
            <Icon
                size={20}
                color="#ffffff"
                style={{ display: "block", lineHeight: 1 }}
            />
        </span>
    )
}

export { SharePlatformIcon }