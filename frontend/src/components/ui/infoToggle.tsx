import { useState, useRef, useLayoutEffect } from "react"
import { HelpCircle } from "lucide-react"

export default function InfoToggle({
    value,
    onToggle,
    label,
    infoBox,
    trueLabel = "Yes",
    falseLabel = "No",
    className = ""
}: {
    value: boolean
    onToggle: () => void
    label: string
    infoBox?: React.ReactNode
    trueLabel?: string
    falseLabel?: string
    className?: string
}) {
    const [showInfo, setShowInfo] = useState(false)
    const [pos, setPos] = useState({ top: 0, left: 0 })
    const tooltipRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    /* ── keep tooltip inside viewport ─────────────────────────────── */
    const recalc = () => {
        const tip = tooltipRef.current
        const box = containerRef.current
        if (!tip || !box) return

        const tipRect = tip.getBoundingClientRect()
        const boxRect = box.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        const margin = 4

        // default position: above, centered
        let top = -tipRect.height - 8
        let left = (boxRect.width - tipRect.width) / 2

        // horizontal clamp
        const absLeft = boxRect.left + left
        if (absLeft < margin) left += margin - absLeft
        if (absLeft + tipRect.width > vw - margin)
            left -= absLeft + tipRect.width - (vw - margin)

        // vertical fallback (place below if not enough space above)
        if (boxRect.top + top < margin) top = boxRect.height + 8
        // clamp bottom (rare)
        if (boxRect.top + top + tipRect.height > vh - margin)
            top = vh - margin - boxRect.top - tipRect.height

        setPos({ top, left })
    }

    useLayoutEffect(() => {
        if (showInfo) {
            recalc()
            window.addEventListener("resize", recalc)
            window.addEventListener("scroll", recalc, true)
            return () => {
                window.removeEventListener("resize", recalc)
                window.removeEventListener("scroll", recalc, true)
            }
        }
    }, [showInfo])

    return (
        <div ref={containerRef} className={`relative w-max ${className}`}>
            {showInfo && (
                <div
                    ref={tooltipRef}
                    style={{ top: pos.top, left: pos.left }}
                    onClick={() => setShowInfo(false)}
                    className="absolute z-10 w-64 text-xs text-zinc-300 bg-zinc-800 rounded px-3 py-2 shadow-lg"
                >
                    {infoBox}
                </div>
            )}

            <button
                onClick={onToggle}
                className={`flex items-center justify-center gap-1 px-2 py-1 rounded text-sm w-28 ${
                    value ? "bg-green-600" : "bg-red-600"
                }`}
            >
                <span className="truncate">
                    {label}: {value ? trueLabel : falseLabel}
                </span>
                {infoBox && (
                    <HelpCircle
                        className="w-4 h-4 text-zinc-200 hover:text-white"
                        onClick={(e) => {
                            e.stopPropagation()
                            setShowInfo((prev) => !prev)
                        }}
                    />
                )}
            </button>
        </div>
    )
}
