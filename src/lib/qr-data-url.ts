/**
 * 轻量 QR 转 SVG data URL，Byte 模式 ECC M。
 * 仅服务登录 qrurl 等短文本，不引入外部依赖。
 */

type EccLevel = 0 | 1 | 2 | 3 // L M Q H

// ECC M：各 version 的 [ecPerBlock, block1Count, dataPerBlock1, block2Count, dataPerBlock2]
const ECC_M_TABLE: Array<[number, number, number, number, number]> = [
    [0, 0, 0, 0, 0],
    [10, 1, 16, 0, 0],
    [16, 1, 28, 0, 0],
    [26, 1, 44, 0, 0],
    [18, 2, 32, 0, 0],
    [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0],
    [18, 4, 31, 0, 0],
    [22, 4, 38, 0, 0],
    [22, 5, 36, 0, 0],
    [26, 5, 43, 0, 0],
]

const ALIGNMENT_PATTERNS: number[][] = [
    [],
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
]

const FORMAT_INFO = [
    0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976, // L
    0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0, // M
    0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed, // Q
    0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b, // H
]

function gfMul(a: number, b: number): number {
    if (a === 0 || b === 0) {
        return 0
    }
    let p = 0
    let aa = a
    let bb = b
    while (bb > 0) {
        if (bb & 1) {
            p ^= aa
        }
        aa <<= 1
        if (aa & 0x100) {
            aa ^= 0x11d
        }
        bb >>= 1
    }
    return p & 0xff
}

function rsGenerator(ecLen: number): number[] {
    // 逐次乘 (x - α^i)，α = 2 in GF(256)
    let poly = [1]
    let root = 1
    for (let i = 0; i < ecLen; i++) {
        const next = new Array(poly.length + 1).fill(0)
        for (let j = 0; j < poly.length; j++) {
            next[j] ^= poly[j]
            next[j + 1] ^= gfMul(poly[j], root)
        }
        poly = next
        root = gfMul(root, 2)
    }
    return poly
}

function rsEncode(data: number[], ecLen: number): number[] {
    const gen = rsGenerator(ecLen)
    const msg = data.concat(new Array(ecLen).fill(0))
    for (let i = 0; i < data.length; i++) {
        const coef = msg[i]
        if (coef === 0) {
            continue
        }
        for (let j = 0; j < gen.length; j++) {
            msg[i + j] ^= gfMul(gen[j], coef)
        }
    }
    return msg.slice(data.length)
}

function bitBuffer(): {
    bits: number[]
    put: (val: number, len: number) => void
    toBytes: () => number[]
} {
    const bits: number[] = []
    return {
        bits,
        put(val: number, len: number) {
            for (let i = len - 1; i >= 0; i--) {
                bits.push((val >>> i) & 1)
            }
        },
        toBytes() {
            const out: number[] = []
            for (let i = 0; i < bits.length; i += 8) {
                let b = 0
                for (let j = 0; j < 8; j++) {
                    b = (b << 1) | (bits[i + j] ?? 0)
                }
                out.push(b)
            }
            return out
        },
    }
}

function capacityBytes(version: number): number {
    const [ecPer, b1, d1, b2, d2] = ECC_M_TABLE[version]
    void ecPer
    return b1 * d1 + b2 * d2
}

function chooseVersion(byteLen: number): number {
    for (let v = 1; v <= 10; v++) {
        // mode(4) + len(8 for v<10) + data + terminator
        const needBits = 4 + 8 + byteLen * 8 + 4
        const cap = capacityBytes(v) * 8
        if (needBits <= cap) {
            return v
        }
    }
    throw new Error("二维码内容过长")
}

function buildDataCodewords(text: string, version: number): number[] {
    const bytes = Array.from(new TextEncoder().encode(text))
    const buf = bitBuffer()
    buf.put(0b0100, 4) // byte mode
    buf.put(bytes.length, version < 10 ? 8 : 16)
    for (const b of bytes) {
        buf.put(b, 8)
    }
    const totalData = capacityBytes(version)
    const maxBits = totalData * 8
    // terminator
    const remain = maxBits - buf.bits.length
    buf.put(0, Math.min(4, remain))
    while (buf.bits.length % 8 !== 0) {
        buf.bits.push(0)
    }
    const data = buf.toBytes()
    const pad = [0xec, 0x11]
    let pi = 0
    while (data.length < totalData) {
        data.push(pad[pi % 2])
        pi++
    }
    return data
}

function interleave(version: number, data: number[]): number[] {
    const [ecPer, b1, d1, b2, d2] = ECC_M_TABLE[version]
    const blocks: { data: number[]; ec: number[] }[] = []
    let offset = 0
    for (let i = 0; i < b1; i++) {
        const blockData = data.slice(offset, offset + d1)
        offset += d1
        blocks.push({ data: blockData, ec: rsEncode(blockData, ecPer) })
    }
    for (let i = 0; i < b2; i++) {
        const blockData = data.slice(offset, offset + d2)
        offset += d2
        blocks.push({ data: blockData, ec: rsEncode(blockData, ecPer) })
    }
    const out: number[] = []
    const maxData = Math.max(d1, d2)
    for (let i = 0; i < maxData; i++) {
        for (const block of blocks) {
            if (i < block.data.length) {
                out.push(block.data[i])
            }
        }
    }
    for (let i = 0; i < ecPer; i++) {
        for (const block of blocks) {
            out.push(block.ec[i])
        }
    }
    return out
}

function matrixSize(version: number): number {
    return 17 + 4 * version
}

function placeFinders(mod: number[][], size: number): void {
    const draw = (r0: number, c0: number) => {
        for (let r = -1; r <= 7; r++) {
            for (let c = -1; c <= 7; c++) {
                const rr = r0 + r
                const cc = c0 + c
                if (rr < 0 || cc < 0 || rr >= size || cc >= size) {
                    continue
                }
                const on =
                    (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                    (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                    (r >= 2 && r <= 4 && c >= 2 && c <= 4)
                mod[rr][cc] = on ? 1 : 0
            }
        }
    }
    draw(0, 0)
    draw(0, size - 7)
    draw(size - 7, 0)
}

function placeTiming(mod: number[][], size: number): void {
    for (let i = 8; i < size - 8; i++) {
        const v = i % 2 === 0 ? 1 : 0
        if (mod[6][i] < 0) {
            mod[6][i] = v
        }
        if (mod[i][6] < 0) {
            mod[i][6] = v
        }
    }
}

function placeAlignment(mod: number[][], version: number): void {
    const pos = ALIGNMENT_PATTERNS[version] ?? []
    for (const r of pos) {
        for (const c of pos) {
            // 避开 finder
            if (
                (r < 9 && c < 9) ||
                (r < 9 && c > matrixSize(version) - 10) ||
                (r > matrixSize(version) - 10 && c < 9)
            ) {
                continue
            }
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const on =
                        Math.max(Math.abs(dr), Math.abs(dc)) === 2 ||
                        (dr === 0 && dc === 0)
                    mod[r + dr][c + dc] = on ? 1 : 0
                }
            }
        }
    }
}

function placeFormat(mod: number[][], size: number, mask: number, ecc: EccLevel): void {
    const bits = FORMAT_INFO[ecc * 8 + mask]
    const coords: Array<[number, number]> = []
    for (let i = 0; i <= 5; i++) {
        coords.push([8, i])
    }
    coords.push([8, 7], [8, 8], [7, 8])
    for (let i = 5; i >= 0; i--) {
        coords.push([i, 8])
    }
    for (let i = 0; i < 15; i++) {
        const bit = (bits >> (14 - i)) & 1
        const [r, c] = coords[i]
        mod[r][c] = bit
    }
    // 副本
    for (let i = 0; i < 8; i++) {
        mod[size - 1 - i][8] = (bits >> (14 - i)) & 1
    }
    for (let i = 0; i < 7; i++) {
        mod[8][size - 7 + i] = (bits >> (6 - i)) & 1
    }
    mod[size - 8][8] = 1 // dark module
}

function maskFn(mask: number, r: number, c: number): boolean {
    switch (mask) {
        case 0:
            return (r + c) % 2 === 0
        case 1:
            return r % 2 === 0
        case 2:
            return c % 3 === 0
        case 3:
            return (r + c) % 3 === 0
        case 4:
            return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
        case 5:
            return ((r * c) % 2) + ((r * c) % 3) === 0
        case 6:
            return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
        default:
            return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
    }
}

function placeData(mod: number[][], size: number, data: number[], mask: number): void {
    const bits: number[] = []
    for (const b of data) {
        for (let i = 7; i >= 0; i--) {
            bits.push((b >> i) & 1)
        }
    }
    let bi = 0
    let direction = -1
    let col = size - 1
    while (col > 0) {
        if (col === 6) {
            col--
        }
        for (let i = 0; i < size; i++) {
            const r = direction < 0 ? size - 1 - i : i
            for (let dc = 0; dc < 2; dc++) {
                const c = col - dc
                if (mod[r][c] !== -1) {
                    continue
                }
                let bit = bits[bi] ?? 0
                bi++
                if (maskFn(mask, r, c)) {
                    bit ^= 1
                }
                mod[r][c] = bit
            }
        }
        direction = -direction
        col -= 2
    }
}

function buildMatrix(text: string): number[][] {
    const bytes = new TextEncoder().encode(text)
    const version = chooseVersion(bytes.length)
    const dataCw = buildDataCodewords(text, version)
    const finalCw = interleave(version, dataCw)
    const size = matrixSize(version)
    const reserved = Array.from({ length: size }, () =>
        new Array(size).fill(-1),
    )

    placeFinders(reserved, size)
    placeTiming(reserved, size)
    placeAlignment(reserved, version)
    // 预留 format
    for (let i = 0; i < 9; i++) {
        if (reserved[8][i] < 0 && i !== 6) {
            reserved[8][i] = 0
        }
        if (reserved[i][8] < 0 && i !== 6) {
            reserved[i][8] = 0
        }
    }
    for (let i = 0; i < 8; i++) {
        if (reserved[8][size - 1 - i] < 0) {
            reserved[8][size - 1 - i] = 0
        }
        if (reserved[size - 1 - i][8] < 0) {
            reserved[size - 1 - i][8] = 0
        }
    }
    reserved[size - 8][8] = 1

    // 登录 URL 用 mask 0 即可扫
    const mask = 0
    const mod = reserved.map((row) => row.slice())
    placeData(mod, size, finalCw, mask)
    placeFormat(mod, size, mask, 1) // M
    // 填剩余
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (mod[r][c] < 0) {
                mod[r][c] = 0
            }
        }
    }
    return mod
}

function matrixToSvgDataUrl(mod: number[][], modulePx = 6, margin = 2): string {
    const size = mod.length
    const dim = (size + margin * 2) * modulePx
    const parts: string[] = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">`,
        `<rect width="100%" height="100%" fill="#fff"/>`,
    ]
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (mod[r][c] === 1) {
                const x = (c + margin) * modulePx
                const y = (r + margin) * modulePx
                parts.push(
                    `<rect x="${x}" y="${y}" width="${modulePx}" height="${modulePx}" fill="#000"/>`,
                )
            }
        }
    }
    parts.push("</svg>")
    const svg = parts.join("")
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** 将文本编码为可放入 <img src> 的 QR data URL */
function qrTextToDataUrl(text: string): string {
    const value = text.trim()
    if (!value) {
        throw new Error("二维码内容为空")
    }
    return matrixToSvgDataUrl(buildMatrix(value))
}

export { qrTextToDataUrl }