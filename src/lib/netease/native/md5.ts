/**
 * RFC 1321 MD5，零依赖实现，仅用于网易云登录密码摘要。
 * 独立成文件：登录模块需同步调用，不能随 node-forge/crypto-js 一起懒加载。
 */

const S = new Int32Array([
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
])

const K = new Int32Array(64)
for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0
}

function rotl(x: number, n: number): number {
    return ((x << n) | (x >>> (32 - n))) >>> 0
}

function md5Hex(text: string): string {
    const bytes = new TextEncoder().encode(text)
    const bitLen = bytes.length * 8
    // 填充到 56 mod 64 字节，末 8 字节存 64 位位长（小端）
    const paddedLen = (((bytes.length + 8) >> 6) + 1) << 6
    const buf = new Uint8Array(paddedLen)
    buf.set(bytes)
    buf[bytes.length] = 0x80
    const dv = new DataView(buf.buffer)
    dv.setUint32(paddedLen - 8, bitLen >>> 0, true)
    dv.setUint32(paddedLen - 4, Math.floor(bitLen / 2 ** 32), true)

    let a0 = 0x67452301
    let b0 = 0xefcdab89
    let c0 = 0x98badcfe
    let d0 = 0x10325476

    for (let off = 0; off < paddedLen; off += 64) {
        const m = new Int32Array(16)
        for (let i = 0; i < 16; i++) {
            m[i] = dv.getInt32(off + i * 4, true)
        }
        let a = a0
        let b = b0
        let c = c0
        let d = d0
        for (let i = 0; i < 64; i++) {
            let f: number
            let g: number
            if (i < 16) {
                f = (b & c) | (~b & d)
                g = i
            } else if (i < 32) {
                f = (d & b) | (~d & c)
                g = (5 * i + 1) % 16
            } else if (i < 48) {
                f = b ^ c ^ d
                g = (3 * i + 5) % 16
            } else {
                f = c ^ (b | ~d)
                g = (7 * i) % 16
            }
            f = (f + a + K[i] + m[g]) >>> 0
            a = d
            d = c
            c = b
            b = (b + rotl(f, S[i])) >>> 0
        }
        a0 = (a0 + a) >>> 0
        b0 = (b0 + b) >>> 0
        c0 = (c0 + c) >>> 0
        d0 = (d0 + d) >>> 0
    }

    const out = new DataView(new ArrayBuffer(16))
    out.setUint32(0, a0, true)
    out.setUint32(4, b0, true)
    out.setUint32(8, c0, true)
    out.setUint32(12, d0, true)
    let hex = ""
    for (let i = 0; i < 16; i++) {
        hex += out.getUint8(i).toString(16).padStart(2, "0")
    }
    return hex
}

export { md5Hex }
