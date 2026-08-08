// 网易云 weapi/eapi 加密，移植自 CloudMusicAPI/util/crypto.js；浏览器+Tauri 共用，HTTP 由 Rust 代理绕开 CORS

import CryptoJS from "crypto-js"
import forge from "node-forge"

const IV = "0102030405060708"
const PRESET_KEY = "0CoJUm6Qyw8W8jud"
const LINUX_API_KEY = "rFgB&h#%2?^eDg:Q"
const EAPI_KEY = "e82ckenh8dichen8"
const BASE62 =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`

function aesEncrypt(
    text: string,
    mode: "cbc" | "ecb",
    key: string,
    iv: string,
    format: "base64" | "hex" = "base64",
): string {
    const encrypted = CryptoJS.AES.encrypt(
        CryptoJS.enc.Utf8.parse(text),
        CryptoJS.enc.Utf8.parse(key),
        {
            iv: CryptoJS.enc.Utf8.parse(iv),
            mode:
                mode === "cbc" ? CryptoJS.mode.CBC : CryptoJS.mode.ECB,
            padding: CryptoJS.pad.Pkcs7,
        },
    )
    if (format === "base64") {
        return encrypted.toString()
    }
    return encrypted.ciphertext.toString().toUpperCase()
}

function rsaEncrypt(str: string, keyPem: string): string {
    const publicKey = forge.pki.publicKeyFromPem(keyPem)
    // CloudMusicAPI 使用 NONE 填充，与官方客户端一致
    const encrypted = publicKey.encrypt(str, "NONE")
    return forge.util.bytesToHex(encrypted)
}

function weapi(object: Record<string, unknown>): {
    params: string
    encSecKey: string
} {
    const text = JSON.stringify(object)
    let secretKey = ""
    for (let i = 0; i < 16; i += 1) {
        secretKey += BASE62.charAt(Math.round(Math.random() * 61))
    }
    return {
        params: aesEncrypt(
            aesEncrypt(text, "cbc", PRESET_KEY, IV),
            "cbc",
            secretKey,
            IV,
        ),
        encSecKey: rsaEncrypt(
            secretKey.split("").reverse().join(""),
            PUBLIC_KEY,
        ),
    }
}

function linuxapi(object: Record<string, unknown>): { eparams: string } {
    const text = JSON.stringify(object)
    return {
        eparams: aesEncrypt(text, "ecb", LINUX_API_KEY, "", "hex"),
    }
}

function eapi(
    url: string,
    object: Record<string, unknown> | string,
): { params: string } {
    const text =
        typeof object === "object" ? JSON.stringify(object) : object
    const message = `nobody${url}use${text}md5forencrypt`
    const digest = CryptoJS.MD5(message).toString()
    const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`
    return {
        params: aesEncrypt(data, "ecb", EAPI_KEY, "", "hex"),
    }
}

export { eapi, linuxapi, weapi }