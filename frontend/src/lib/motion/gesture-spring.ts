type PointerSample = {
    time: number
    x: number
    y: number
}

type SpringState = {
    damping: number
    frame: number | null
    lastTime: number | undefined
    response: number
    value: number
    velocity: number
    target: number
}

type SpringRelease = {
    target: number
    velocity: number
    damping?: number
    response?: number
}

const SAMPLE_WINDOW_MS = 90
const MIN_SAMPLE_GAP_MS = 16
const FRAME_LIMIT_MS = 32
const MS_PER_SECOND = 1000

function recordPointerSample(
    samples: PointerSample[],
    x: number,
    y: number,
): void {
    const time = performance.now()
    const last = samples[samples.length - 1]
    if (last && time - last.time < MIN_SAMPLE_GAP_MS) {
        last.x = x
        last.y = y
        return
    }
    samples.push({ time, x, y })
    const oldest = samples.findIndex(
        (item) => time - item.time <= SAMPLE_WINDOW_MS,
    )
    if (oldest > 0) {
        samples.splice(0, oldest)
    }
}

function readPointerVelocity(
    samples: PointerSample[],
    axis: "x" | "y",
): number {
    const newest = samples[samples.length - 1]
    const oldest = samples[0]
    if (!newest || !oldest || newest === oldest) {
        return 0
    }
    const distance = newest[axis] - oldest[axis]
    const elapsed = Math.max(1, newest.time - oldest.time)
    return distance / elapsed
}

function createGestureSpring(
    readValue: () => number,
    writeValue: (value: number) => void,
    onSettled?: () => void,
) {
    const state: SpringState = {
        damping: 1,
        frame: null,
        lastTime: undefined,
        response: 0.34,
        value: readValue(),
        velocity: 0,
        target: readValue(),
    }

    function stop(): void {
        if (state.frame != null) {
            cancelAnimationFrame(state.frame)
            state.frame = null
        }
    }

    function step(now: number): void {
        const elapsed =
            Math.min(FRAME_LIMIT_MS, now - (state.lastTime ?? now)) /
            MS_PER_SECOND
        state.lastTime = now
        const angularFrequency = (2 * Math.PI) / state.response
        const acceleration =
            angularFrequency * angularFrequency * (state.target - state.value) -
            2 * state.damping * angularFrequency * state.velocity
        state.velocity += acceleration * elapsed
        state.value += state.velocity * elapsed
        writeValue(state.value)

        if (
            Math.abs(state.target - state.value) < 0.5 &&
            Math.abs(state.velocity) < 8
        ) {
            state.value = state.target
            writeValue(state.value)
            state.frame = null
            state.lastTime = undefined
            onSettled?.()
            return
        }
        state.frame = requestAnimationFrame(step)
    }

    return {
        grab(): void {
            stop()
            state.value = readValue()
            state.target = state.value
            state.velocity = 0
        },
        move(next: number): void {
            stop()
            state.value = next
            state.target = next
            state.velocity = 0
            writeValue(next)
        },
        release(input: SpringRelease): void {
            stop()
            state.value = readValue()
            state.target = input.target
            state.velocity = input.velocity
            state.damping = input.damping ?? 1
            state.response = input.response ?? 0.34
            state.lastTime = undefined
            state.frame = requestAnimationFrame(step)
        },
        stop,
    }
}

export { createGestureSpring, readPointerVelocity, recordPointerSample }
export type { PointerSample }
