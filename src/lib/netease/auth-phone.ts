/** 手机号验证码登录 */

import { setCookiesFromApi } from "@/lib/netease/auth-cookie"
import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"

type CaptchaSentData = {
    code?: number
    message?: string
}

type CellphoneLoginData = {
    code?: number
    message?: string
    msg?: string
    cookie?: string
    token?: string
}

async function sendCaptcha(phone: string, ctcode = "86"): Promise<void> {
    const data = await neteaseRequest<CaptchaSentData>({
        path: NETEASE_PATHS.captchaSent,
        params: {
            phone: phone.trim(),
            ctcode,
            timestamp: Date.now(),
        },
    })
    if (data.code !== undefined && data.code !== 200) {
        throw new Error(data.message ?? "验证码发送失败")
    }
}

async function loginWithCellphone(input: {
    phone: string
    captcha: string
    ctcode?: string
}): Promise<void> {
    const data = await neteaseRequest<CellphoneLoginData>({
        path: NETEASE_PATHS.loginCellphone,
        params: {
            phone: input.phone.trim(),
            captcha: input.captcha.trim(),
            ctcode: input.ctcode ?? "86",
            timestamp: Date.now(),
        },
    })

    const code = data.code ?? 0
    if (code !== 200) {
        throw new Error(data.message ?? data.msg ?? "登录失败")
    }

    if (data.cookie) {
        setCookiesFromApi(data.cookie)
        return
    }

    // 部分实现把 cookie 放在其它字段；无 cookie 则依赖 credentials
    if (!data.token) {
        // 允许仅靠 set-cookie；前端仍以 MUSIC_U 为准
    }
}

export { loginWithCellphone, sendCaptcha }