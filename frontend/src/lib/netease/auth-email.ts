import { setCookiesFromApi } from "@/lib/netease/auth-cookie"
import { NETEASE_PATHS, neteaseRequest } from "@/lib/netease/client"
import { md5Hex } from "@/lib/netease/native/md5"

type EmailLoginData = {
    code?: number
    message?: string
    msg?: string
    cookie?: string
}

// 邮箱登录：密码本地 md5 后再传，避免明文进 URL query
async function loginWithEmail(input: {
    email: string
    password: string
}): Promise<void> {
    const data = await neteaseRequest<EmailLoginData>({
        path: NETEASE_PATHS.loginEmail,
        params: {
            email: input.email.trim(),
            md5_password: md5Hex(input.password),
            timestamp: Date.now(),
        },
    })

    const code = data.code ?? 0
    if (code !== 200) {
        throw new Error(data.message ?? data.msg ?? "登录失败")
    }

    if (data.cookie) {
        setCookiesFromApi(data.cookie)
    }
}

export { loginWithEmail }
