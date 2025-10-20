import {useState, useRef, useLayoutEffect} from "react"
import {HelpCircle} from "lucide-react"

export default function TooltipButton({
    label,
    tooltip,
    onClick,
    disabled = false,
    className,
    overrideClass = false, // NEW: allow full override
}: {
    label: string
    tooltip?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    className?: string
    overrideClass?: boolean
}) {
    const [showTooltip, setShowTooltip] = useState(false)
    const [pos, setPos] = useState({top: 0, left: 0})
    const tooltipRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const recalc = () => {
        const tip = tooltipRef.current
        const box = containerRef.current
        if (!tip || !box) return

        const tipRect = tip.getBoundingClientRect()
        const boxRect = box.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        const margin = 4

        let top = -tipRect.height - 8
        let left = (boxRect.width - tipRect.width) / 2

        const absLeft = boxRect.left + left
        if (absLeft < margin) left += margin - absLeft
        if (absLeft + tipRect.width > vw - margin)
            left -= absLeft + tipRect.width - (vw - margin)

        if (boxRect.top + top < margin) top = boxRect.height + 8
        if (boxRect.top + top + tipRect.height > vh - margin)
            top = vh - margin - boxRect.top - tipRect.height

        setPos({top, left})
    }

    useLayoutEffect(() => {
        if (!showTooltip) return

        const handleClose = () => {
            setTimeout(() => setShowTooltip(false), 1)
        }

        recalc()
        window.addEventListener("resize", recalc)
        window.addEventListener("scroll", recalc, true)
        document.addEventListener("mousedown", handleClose)

        return () => {
            window.removeEventListener("resize", recalc)
            window.removeEventListener("scroll", recalc, true)
            document.removeEventListener("mousedown", handleClose)
        }
    }, [showTooltip])

    // --- Button base classes ---
    const base =
        "w-full flex items-center justify-between px-3 py-2 rounded transition text-sm"

    const defaultEnabled = "bg-zinc-700 hover:bg-zinc-600 text-white"
    const defaultDisabled = "bg-zinc-800 text-zinc-500 cursor-not-allowed"

    const classes = overrideClass
        ? `${base} ${className ?? ""}` // fully custom override
        : `${base} ${
              disabled ? defaultDisabled : defaultEnabled
          } ${className ?? ""}` // normal additive

    return (
        <div ref={containerRef} className="relative w-full">
            {showTooltip && tooltip && (
                <div
                    ref={tooltipRef}
                    style={{top: pos.top, left: pos.left}}
                    className="absolute z-10 w-64 text-xs text-zinc-300 bg-zinc-800 rounded px-3 py-2 shadow-lg border border-zinc-600"
                    onClick={() => setShowTooltip(false)}
                >
                    {tooltip}
                </div>
            )}

            <div className="relative">
                <button
                    type="button"
                    disabled={disabled}
                    onClick={onClick}
                    className={classes}
                >
                    <span>{label}</span>
                    {tooltip && !disabled && <div className="w-6 h-6" />}
                </button>

                {tooltip && (
                    <div
                        onClick={() => setShowTooltip((v) => !v)}
                        className="absolute top-0 right-0 h-full w-10 flex items-center justify-center cursor-pointer group"
                    >
                        <HelpCircle className="w-4 h-4 text-zinc-300 group-hover:text-white" />
                    </div>
                )}
            </div>
        </div>
    )
}
