import {useState, useEffect} from 'react'

/**
 * ScoreBox
 * --------
 * Score tracking button.
 *
 * Props:
 * - id: string
 *     Unique identifier for the component.
 *
 * - label: string
 *     Display label shown before the current value (e.g., "L1 ▷ 3").
 *
 * - value: number
 *     Current value displayed and controlled by this component.
 *
 * - onChange: (newValue: number) => void
 *     Required callback to update the value externally.
 *
 * - onValueUpdate?: (newValue: number, triggered: boolean) => void
 *     Optional callback that is called after each change with an optional trigger condition.
 *
 * - step?: number (default: 1)
 *     How much the value should increment or decrement per click.
 *
 * - min?: number (default: 0)
 *     Minimum allowed value. Component clamps below this.
 *
 * - max?: number (default: Infinity)
 *     Maximum allowed value. Component clamps above this.
 *
 * - showPulse?: boolean (default: true)
 *     Enables/disables the brief background color flash when value changes.
 *
 * - pulseDuration?: number (default: 150)
 *     Duration of the pulse effect in milliseconds.
 *
 * - upColor?: string (default: 'bg-green-700')
 *     Tailwind class applied when incrementing.
 *
 * - downColor?: string (default: 'bg-red-700')
 *     Tailwind class applied when decrementing.
 *
 * - baseColor?: string (default: 'bg-zinc-800')
 *     Default background color when idle.
 *
 * - triggerPulseCondition?: (label: string, delta: number) => boolean
 *     Optional function to determine whether onValueUpdate should be triggered as `true` (e.g., movement trigger).
 *
 * --------
 * Example:
 * ```ts
 * <ScoreBox
 *   id="auto-l1"
 *   label="L1"
 *   value={data.auto.l1}
 *   onChange={(v) => setData(d => ({ ...d, auto: { ...d.auto, l1: v } }))}
 *   onValueUpdate={(v, move) => patchData("auto", "l1", v)}
 * />
 * ```
 */

export default function ScoreBox({
                                     id,
                                     label,
                                     value,
                                     onChange,
                                     onValueUpdate,
                                     step = 1,
                                     min = 0,
                                     max = Infinity,
                                     showPulse = true,
                                     pulseDuration = 150,
                                     upColor = 'bg-green-700',
                                     downColor = 'bg-red-700',
                                     baseColor = 'bg-zinc-800',
                                     triggerPulseCondition,
                                 }: {
    id: string
    label: string
    value: number
    onChange: (newValue: number) => void
    onValueUpdate?: (newValue: number, triggered: boolean) => void
    step?: number
    min?: number
    max?: number
    showPulse?: boolean
    pulseDuration?: number
    upColor?: string
    downColor?: string
    baseColor?: string
    triggerPulseCondition?: (label: string, delta: number) => boolean
}) {
    const [pulse, setPulse] = useState<'' | 'up' | 'down'>('')

    useEffect(() => {
        if (pulse === '' || !showPulse) return
        const timeout = setTimeout(() => setPulse(''), pulseDuration)
        return () => clearTimeout(timeout)
    }, [pulse, pulseDuration, showPulse])

    const handleClick = (delta: number) => {
        const raw = value + delta * step
        const newValue = Math.max(min, Math.min(max, raw))
        if (newValue === value) return

        if (showPulse) setPulse(delta > 0 ? 'up' : 'down')
        onChange(newValue)

        if (onValueUpdate) {
            const triggered = triggerPulseCondition
                ? triggerPulseCondition(label, delta)
                : delta > 0
            onValueUpdate(newValue, triggered)
        }
    }

    const pulseClass =
        pulse === 'up' ? upColor : pulse === 'down' ? downColor : baseColor

    return (
        <div
            id={id}
            className={`relative w-full h-10 rounded ${pulseClass} text-white flex items-center justify-center overflow-hidden transition-colors duration-150`}
        >
            <button
                className="absolute left-0 w-1/2 h-full flex items-center justify-start px-3 text-xl transition-colors hover:bg-gradient-to-r hover:from-red-700/50 hover:to-transparent"
                onClick={() => handleClick(-1)}
                aria-label={`Decrease ${label}`}
            >
                ▼
            </button>
            <button
                className="absolute right-0 w-1/2 h-full flex items-center justify-end px-3 text-xl transition-colors hover:bg-gradient-to-l hover:from-green-700/50 hover:to-transparent"
                onClick={() => handleClick(+1)}
                aria-label={`Increase ${label}`}
            >
                ▲
            </button>

            <div className="pointer-events-none uppercase tracking-wide text-sm z-10">
                {label} ▷ {value}
            </div>
        </div>
    )
}
