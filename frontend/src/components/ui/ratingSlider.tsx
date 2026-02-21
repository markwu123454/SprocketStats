import React, {useState, useRef, useEffect} from "react"
import * as Slider from "@radix-ui/react-slider"
import {HelpCircle} from "lucide-react"

export default function RatingSlider({
                                         value,
                                         onChange,
                                         title,
                                         min = 0,
                                         max = 1,
                                         step = 0.25,
                                         leftLabel = "Low",
                                         rightLabel = "High",
                                         invertColor = false,
                                         infoBox
                                     }: {
    value: number
    onChange: (val: number) => void
    title?: string
    step?: number
    min?: number
    max?: number
    leftLabel?: string
    rightLabel?: string
    invertColor?: boolean
    infoBox?: React.ReactNode
}) {
    const [showInfo, setShowInfo] = useState(false)
    const infoRef = useRef<HTMLDivElement | null>(null)
    const toggleRef = useRef<HTMLButtonElement | null>(null)


    // Outside click handler
    useEffect(() => {
        if (!showInfo) return

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node
            if (
                infoRef.current &&
                !infoRef.current.contains(target) &&
                toggleRef.current &&
                !toggleRef.current.contains(target)
            ) {
                setShowInfo(false)
            }
        }

        document.addEventListener("pointerdown", handlePointerDown)
        return () => document.removeEventListener("pointerdown", handlePointerDown)
    }, [showInfo])


    const getColor = (v: number) => {
        // Normalize value between 0 and 1 based on min/max props
        let ratio = (v - min) / (max - min);
        ratio = Math.max(0, Math.min(1, ratio));

        // If invertColor is true: 0 = Green, 1 = Red
        // If invertColor is false: 0 = Red, 1 = Green
        const colorValue = invertColor ? 1 - ratio : ratio;

        let r, g, b;
        if (colorValue < 0.5) {
            // 0.0 to 0.5: Red (220, 38, 38) to Yellow (234, 179, 8)
            const t = colorValue / 0.5;
            r = 220 + (234 - 220) * t;
            g = 38 + (179 - 38) * t;
            b = 38 + (8 - 38) * t;
        } else {
            // 0.5 to 1.0: Yellow (234, 179, 8) to Green (34, 197, 94)
            const t = (colorValue - 0.5) / 0.5;
            r = 234 + (34 - 234) * t;
            g = 179 + (197 - 179) * t;
            b = 8 + (94 - 8) * t;
        }

        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }

    return (
        <div className="w-full px-6 py-2 mx-auto flex flex-col gap-2 relative">
            <div className="flex items-center justify-between">
                {title && <div className="text-sm font-medium text-zinc-200">{title}</div>}
                {infoBox && (
                    <button ref={toggleRef} onClick={() => setShowInfo(prev => !prev)}>
                        <HelpCircle className="w-4 h-4 text-zinc-400 hover:text-white"/>
                    </button>
                )}
            </div>

            {showInfo && (
                <div
                    ref={infoRef}
                    className="absolute top-0 right-0 z-10 mt-8 w-64 text-left text-xs text-zinc-300 bg-zinc-800 rounded px-3 py-2 shadow-lg"
                >
                    {infoBox}
                </div>
            )}

            <Slider.Root
                className="relative flex w-full touch-none select-none items-center"
                min={min}
                max={max}
                step={step}
                value={[value]}
                onValueChange={([val]) => onChange(val)}
            >
                <Slider.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-zinc-700">
                    <Slider.Range
                        className="absolute h-full"
                        style={{backgroundColor: getColor(value)}}
                    />
                </Slider.Track>
                <Slider.Thumb
                    className="block h-5 w-5 rounded-full border-2 border-white shadow"
                    style={{backgroundColor: getColor(value)}}
                />
            </Slider.Root>

            <div className="flex justify-between text-sm text-zinc-400 px-1">
                <span>{leftLabel}</span>
                <span>{rightLabel}</span>
            </div>
        </div>
    )
}
