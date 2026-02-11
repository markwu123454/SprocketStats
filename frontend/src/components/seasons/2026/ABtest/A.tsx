import React, {useEffect, useRef, useState, useCallback} from "react"
import {getSettingSync} from "@/db/settingsDb"

// ---------------------------------------------------------------------------
// Decoupled Types
// ---------------------------------------------------------------------------
export type Alliance = "red" | "blue"

export interface StartingAction {
    type: "starting"
    x: number
    y: number
}

export interface ZoneAction {
    type: "zone_change"
    zone: string
    timestamp: number
    phase: MatchPhase
    subPhase: SubPhaseName | null
}

export interface ScoreAction {
    type: "score"
    zone: string
    timestamp: number
    phase: MatchPhase
    subPhase: SubPhaseName | null
}

export type MatchAction = StartingAction | ZoneAction | ScoreAction

export interface MatchScoutingState {
    alliance: Alliance
    teamNumber: string
    matchNumber: string
    startPosition: { x: number; y: number } | null
    actions: MatchAction[]
}

type MatchPhase = "prestart" | "auto" | "between" | "teleop" | "post"

type SubPhaseName =
    | "auto"
    | "transition"
    | "shift_1"
    | "shift_2"
    | "shift_3"
    | "shift_4"
    | "endgame"

interface SubPhaseConfig {
    phase: SubPhaseName
    duration: number
}

// ---------------------------------------------------------------------------
// Sub-phase sequence for teleop
// ---------------------------------------------------------------------------
const TELEOP_SEQUENCE: SubPhaseConfig[] = [
    {phase: "transition", duration: 10000},
    {phase: "shift_1", duration: 25000},
    {phase: "shift_2", duration: 2500000},
    {phase: "shift_3", duration: 25000},
    {phase: "shift_4", duration: 25000},
    {phase: "endgame", duration: 30000},
]

// ---------------------------------------------------------------------------
// Zone definitions (normalized 0..1 coordinates)
// ---------------------------------------------------------------------------
type Rect = { x1: number; y1: number; x2: number; y2: number }

const ZONES = {
    neutral: {x1: 0.322, y1: 0.020, x2: 0.674, y2: 0.978},
    transitionLeft: {x1: 0.247, y1: 0.020, x2: 0.323, y2: 0.978},
    transitionRight: {x1: 0.673, y1: 0.020, x2: 0.756, y2: 0.978},
    intakeTop: {x1: 0.009, y1: 0.206, x2: 0.054, y2: 0.331},
    intakeBottom: {x1: 0.004, y1: 0.826, x2: 0.025, y2: 0.972},
    climb: {x1: 0.012, y1: 0.467, x2: 0.083, y2: 0.597},
    shootingFull: {x1: 0.013, y1: 0.020, x2: 0.246, y2: 0.978},
} as const

// Mirror a rect horizontally around x=0.5
function mirrorRect(r: Rect): Rect {
    return {x1: 1 - r.x2, y1: r.y1, x2: 1 - r.x1, y2: r.y2}
}

// Flip a rect both axes (180° rotation around center)
function flipRect(r: Rect): Rect {
    return {x1: 1 - r.x2, y1: 1 - r.y2, x2: 1 - r.x1, y2: 1 - r.y1}
}

// Defense zone = mirrored shootingFull (simple box on opposite side)
const DEFENSE_RECT: Rect = mirrorRect(ZONES.shootingFull)

// ---------------------------------------------------------------------------
// Build SVG path for a rect with cutout holes (evenodd fill)
// ---------------------------------------------------------------------------
function buildCutoutPath(outer: Rect, cutouts: Rect[]): string {
    // Outer rect clockwise
    let d = `M${outer.x1} ${outer.y1} L${outer.x2} ${outer.y1} L${outer.x2} ${outer.y2} L${outer.x1} ${outer.y2}Z`
    // Each cutout counter-clockwise (creates holes with evenodd)
    for (const c of cutouts) {
        d += ` M${c.x1} ${c.y1} L${c.x1} ${c.y2} L${c.x2} ${c.y2} L${c.x2} ${c.y1}Z`
    }
    return d
}

// Flip every coordinate in an SVG path through (1-x, 1-y)
function flipPath(path: string): string {
    return path.replace(/([ML])([\d.]+)\s+([\d.]+)/g, (_m, cmd, xStr, yStr) => {
        return `${cmd}${(1 - parseFloat(xStr)).toFixed(4)} ${(1 - parseFloat(yStr)).toFixed(4)}`
    })
}

// Pre-compute both orientations
const SHOOTING_PATH = buildCutoutPath(ZONES.shootingFull, [
    ZONES.intakeTop,
    ZONES.climb,
    ZONES.intakeBottom,
])
const SHOOTING_PATH_FLIPPED = flipPath(SHOOTING_PATH)

// ---------------------------------------------------------------------------
// Phase duration helper
// ---------------------------------------------------------------------------
function getPhaseDuration(phase: MatchPhase): number {
    if (phase === "auto") return 20000
    if (phase === "between") return 5000
    if (phase === "teleop") return TELEOP_SEQUENCE.reduce((s, c) => s + c.duration, 0)
    return 0
}

// ---------------------------------------------------------------------------
// Header Strip
// ---------------------------------------------------------------------------
function HeaderStrip({
                         phase,
                         subPhase,
                         subPhaseElapsed,
                         subPhaseTotal,
                         phaseRemaining,
                         flashing,
                     }: {
    phase: MatchPhase
    subPhase: SubPhaseConfig | null
    subPhaseElapsed: number
    subPhaseTotal: number
    phaseRemaining: number
    flashing: boolean
}) {
    const getPhaseColor = () => {
        if (phase === "prestart") return "bg-zinc-700"
        if (phase === "auto") return "bg-blue-700"
        if (phase === "between") return "bg-yellow-700 animate-pulse"
        if (phase === "teleop") {
            if (subPhase?.phase === "endgame") return "bg-red-700"
            return "bg-green-700"
        }
        if (phase === "post") return "bg-zinc-700"
        return "bg-zinc-800"
    }

    const getPhaseLabel = () => {
        if (phase === "prestart") return "PRE-MATCH"
        if (phase === "auto") return "AUTONOMOUS"
        if (phase === "between") return "TRANSITION"
        if (phase === "teleop") {
            if (!subPhase) return "TELEOP"
            const labels: Record<SubPhaseName, string> = {
                auto: "AUTO",
                transition: "TELEOP — TRANSITION",
                shift_1: "TELEOP — SHIFT 1",
                shift_2: "TELEOP — SHIFT 2",
                shift_3: "TELEOP — SHIFT 3",
                shift_4: "TELEOP — SHIFT 4",
                endgame: "TELEOP — ENDGAME",
            }
            return labels[subPhase.phase] ?? "TELEOP"
        }
        if (phase === "post") return "POST-MATCH"
        return ""
    }

    const fmt = (ms: number) => {
        const s = Math.floor(ms / 1000)
        const t = Math.floor((ms % 1000) / 100)
        return `${s}.${t}s`
    }

    return (
        <div
            className={`w-full p-3 transition-colors duration-300 ${getPhaseColor()}`}
            style={{
                transition: "filter 0.15s ease-out, background-color 0.3s",
                filter: flashing ? "brightness(1.6)" : "brightness(1)",
            }}
        >
            <div className="flex justify-between items-center">
                <span className="text-white font-bold text-lg">{getPhaseLabel()}</span>
                {phase !== "prestart" && phase !== "post" && (
                    <div className="flex gap-4 items-center">
                        <span className="text-white font-mono text-base">
                            {fmt(subPhaseElapsed)} / {fmt(subPhaseTotal)}
                        </span>
                        <span className="text-white font-mono text-xl font-bold">
                            {fmt(phaseRemaining)}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// ZoneButton — unified component for simple rects AND complex SVG shapes
// ---------------------------------------------------------------------------
// Simple rect: just pass `zone`. Renders as a positioned <button>.
// Complex shape: pass `zone` (bounding box) + `svgPath`. Renders as SVG.
// Label text is NEVER flipped — always upright regardless of `flip`.
// ---------------------------------------------------------------------------
function ZoneButton({
                        zone,
                        svgPath,
                        label,
                        color,
                        onClick,
                        active,
                        flip,
                    }: {
    zone: Rect
    svgPath?: string
    label: string
    color: string
    onClick: () => void
    active?: boolean
    flip: boolean
}) {
    // Compute displayed bounding box
    const displayed = flip ? flipRect(zone) : zone
    const left = displayed.x1
    const top = displayed.y1
    const width = displayed.x2 - displayed.x1
    const height = displayed.y2 - displayed.y1
    const centerX = left + width / 2
    const centerY = top + height / 2

    // --- SVG path mode (complex shape with cutouts) ---
    if (svgPath) {
        const colorMap: Record<string, string> = {
            "bg-green-600": "rgb(22 163 74)",
            "bg-red-600": "rgb(220 38 38)",
            "bg-blue-600": "rgb(37 99 235)",
            "bg-orange-600": "rgb(234 88 12)",
            "bg-purple-600": "rgb(147 51 234)",
        }
        const fillColor = colorMap[color] ?? "rgb(100 100 100)"

        return (
            <svg
                className="absolute inset-0 w-full h-full"
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                style={{pointerEvents: "none"}}
            >
                <path
                    d={svgPath}
                    fillRule="evenodd"
                    fill={fillColor}
                    onClick={onClick}
                    className={`cursor-pointer transition-all duration-200
                    ${active
                        ? "[fill-opacity:0.6] hover:[fill-opacity:0.8]"
                        : "[fill-opacity:0.2] hover:[fill-opacity:0.4]"
                    }
                    `}
                    style={{pointerEvents: "auto"}}
                />

                {/* Label — always upright at bounding box center */}
                <text
                    x={centerX}
                    y={centerY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontWeight="bold"
                    className="pointer-events-none select-none"
                    style={{fontSize: "0.04px"}}
                >
                    {label}
                </text>
            </svg>
        )
    }

    // --- Simple rect mode ---
    return (
        <button
            onClick={onClick}
            className={`absolute border-2 rounded transition-all duration-200 flex items-center justify-center text-sm font-bold ${
                active
                    ? `${color} border-transparent opacity-60`
                    : `${color} border-transparent opacity-20 hover:opacity-40`
            }`}
            style={{
                left: `${left * 100}%`,
                top: `${top * 100}%`,
                width: `${width * 100}%`,
                height: `${height * 100}%`,
            }}
        >
            <span className="text-white">{label}</span>
        </button>
    )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function MatchScouting({
                                          data,
                                          setData,
                                      }: {
    data: MatchScoutingState
    setData: React.Dispatch<React.SetStateAction<MatchScoutingState>>
}) {
    const deviceType = getSettingSync("match_scouting_device_type") ?? "mobile"
    const fieldRef = useRef<HTMLDivElement>(null)

    // Phase & timing
    const [matchPhase, setMatchPhase] = useState<MatchPhase>("prestart")
    const [subPhase, setSubPhase] = useState<SubPhaseConfig | null>(null)
    const [subPhaseStartTime, setSubPhaseStartTime] = useState(0)
    const [phaseStartTime, setPhaseStartTime] = useState(0)
    const [matchStartTime, setMatchStartTime] = useState(0)
    const [, forceUpdate] = useState(0)

    // Flash state
    const [flashing, setFlashing] = useState(false)
    const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Actions
    const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(data.startPosition)
    const [actions, setActions] = useState<MatchAction[]>(data.actions)
    const [currentZone, setCurrentZone] = useState<string | null>(null)

    // Score slider
    const [score, setScore] = useState(0)
    const sliderRef = useRef<HTMLDivElement>(null)
    const [sliderActive, setSliderActive] = useState(false)
    const [sliderY, setSliderY] = useState(0.5) // 0=top(max add), 1=bottom(max subtract), 0.5=neutral
    const sliderYRef = useRef(0.5)             // ref mirror so rAF loop reads live value
    const scoreRafRef = useRef<number | null>(null)

    // Field interaction
    const [dragging, setDragging] = useState(false)

    // Flip is ONLY based on the setting, NOT alliance
    const flip = getSettingSync("field_orientation") === "180"

    // ---------------------------------------------------------------------------
    // Flash trigger
    // ---------------------------------------------------------------------------
    const triggerFlash = useCallback(() => {
        if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
        setFlashing(true)
        flashTimeoutRef.current = setTimeout(() => setFlashing(false), 350)
    }, [])

    useEffect(() => {
        return () => {
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
        }
    }, [])

    // ---------------------------------------------------------------------------
    // Logarithmic ms/point curve
    // magnitude 0 → MAX_MS (slow), magnitude 1 → MIN_MS (fast)
    // Uses exponential interpolation so the *perceived* speed change is even.
    // ---------------------------------------------------------------------------
    const SLIDER_MAX_MS = 300
    const SLIDER_MIN_MS = 30
    const SLIDER_DEAD_ZONE = 0.05

    const msFromMagnitude = (magnitude: number): number => {
        // Clamp just in case
        const m = Math.min(1, Math.max(0, magnitude))
        // Exponential: MIN * (MAX/MIN)^(1-m)
        // At m=0 → MAX_MS, at m=1 → MIN_MS, logarithmic curve in between
        return SLIDER_MIN_MS * Math.pow(SLIDER_MAX_MS / SLIDER_MIN_MS, 1 - m)
    }

    // ---------------------------------------------------------------------------
    // Score slider — rAF accumulator loop
    // Reads sliderYRef every frame so dragging never interrupts scoring.
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (!sliderActive) {
            if (scoreRafRef.current) {
                cancelAnimationFrame(scoreRafRef.current)
                scoreRafRef.current = null
            }
            console.log("[ScoreSlider] Slider released, loop stopped. Current score via state.")
            return
        }

        const DEAD_ZONE = SLIDER_DEAD_ZONE
        let accumulator = 0
        let lastTime = performance.now()

        const loop = (now: number) => {
            const dt = now - lastTime
            lastTime = now

            const y = sliderYRef.current
            const displacement = y - 0.5

            if (Math.abs(displacement) > DEAD_ZONE) {
                const direction = displacement < 0 ? 1 : -1
                const magnitude = (Math.abs(displacement) - DEAD_ZONE) / (0.5 - DEAD_ZONE)
                const msPerPoint = msFromMagnitude(magnitude)

                accumulator += dt

                // Drain as many whole ticks as accumulated
                let ticks = 0
                while (accumulator >= msPerPoint) {
                    accumulator -= msPerPoint
                    ticks += direction
                }

                if (ticks !== 0) {
                    setScore((prev) => {
                        const next = prev + ticks
                        console.log(
                            `[ScoreSlider] Tick | ${ticks > 0 ? "+" : ""}${ticks} → score: ${next} ` +
                            `(msPerPoint: ${msPerPoint.toFixed(0)}ms, y: ${y.toFixed(3)})`
                        )
                        return next
                    })
                }
            } else {
                // In dead zone — reset accumulator so we don't burst when leaving it
                accumulator = 0
            }

            scoreRafRef.current = requestAnimationFrame(loop)
        }

        console.log("[ScoreSlider] Loop started")
        scoreRafRef.current = requestAnimationFrame(loop)

        return () => {
            if (scoreRafRef.current) {
                cancelAnimationFrame(scoreRafRef.current)
                scoreRafRef.current = null
            }
        }
    }, [sliderActive])

    // ---------------------------------------------------------------------------
    // Field pointer handlers
    // ---------------------------------------------------------------------------
    function getFieldPos(e: React.PointerEvent) {
        if (!fieldRef.current) return {x: 0, y: 0}
        const rect = fieldRef.current.getBoundingClientRect()
        let x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        let y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
        // Convert screen coords back to un-flipped normalized coords
        if (flip) {
            x = 1 - x
            y = 1 - y
        }
        return {x, y}
    }

    function handlePointerDown(e: React.PointerEvent) {
        if (matchPhase !== "prestart") return
        setStartPos(getFieldPos(e))
        setDragging(true)
    }

    function handlePointerMove(e: React.PointerEvent) {
        if (!dragging || matchPhase !== "prestart") return
        setStartPos(getFieldPos(e))
    }

    function handlePointerUp() {
        setDragging(false)
    }

    // ---------------------------------------------------------------------------
    // Zone click handler
    // ---------------------------------------------------------------------------
    const handleZoneClick = useCallback(
        (zoneName: string) => {
            setCurrentZone(zoneName)
            const now = Date.now()
            setActions((prev) => [
                ...prev,
                {
                    type: "zone_change",
                    zone: zoneName,
                    timestamp: matchStartTime > 0 ? now - matchStartTime : 0,
                    phase: matchPhase,
                    subPhase: subPhase?.phase ?? null,
                },
            ])
        },
        [matchStartTime, matchPhase, subPhase],
    )

    // ---------------------------------------------------------------------------
    // Smooth timer (60 fps)
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (matchPhase === "prestart" || matchPhase === "post") return
        const id = setInterval(() => forceUpdate((n) => n + 1), 1000 / 60)
        return () => clearInterval(id)
    }, [matchPhase])

    // ---------------------------------------------------------------------------
    // Phase transition logic
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (matchPhase === "prestart" || matchPhase === "post") return

        const id = setInterval(() => {
            const now = Date.now()
            const elapsed = now - subPhaseStartTime

            if (matchPhase === "auto" && elapsed >= 20000) {
                setMatchPhase("between")
                setPhaseStartTime(now)
                setSubPhaseStartTime(now)
                setSubPhase(null)
                triggerFlash()
                return
            }

            if (matchPhase === "between" && elapsed >= 5000) {
                setMatchPhase("teleop")
                setPhaseStartTime(now)
                setSubPhaseStartTime(now)
                setSubPhase(TELEOP_SEQUENCE[0])
                triggerFlash()
                return
            }

            if (matchPhase === "teleop" && subPhase && elapsed >= subPhase.duration) {
                const idx = TELEOP_SEQUENCE.findIndex((s) => s.phase === subPhase.phase)
                if (idx >= 0 && idx < TELEOP_SEQUENCE.length - 1) {
                    setSubPhase(TELEOP_SEQUENCE[idx + 1])
                    setSubPhaseStartTime(now)
                    triggerFlash()
                } else {
                    setMatchPhase("post")
                    setSubPhase(null)
                    triggerFlash()
                }
            }
        }, 100)

        return () => clearInterval(id)
    }, [matchPhase, subPhase, subPhaseStartTime, triggerFlash])

    // ---------------------------------------------------------------------------
    // Start match
    // ---------------------------------------------------------------------------
    const handleStartMatch = () => {
        const now = Date.now()
        setMatchStartTime(now)
        setPhaseStartTime(now)
        setSubPhaseStartTime(now)
        setMatchPhase("auto")
        setSubPhase({phase: "auto", duration: 20000})
        if (startPos) {
            setActions([{type: "starting", x: startPos.x, y: startPos.y}])
        }
    }

    // ---------------------------------------------------------------------------
    // Sync to parent
    // ---------------------------------------------------------------------------
    useEffect(() => {
        setData((d) => ({...d, startPosition: startPos, actions}))
    }, [startPos, actions, setData])

    // ---------------------------------------------------------------------------
    // Timer calculations
    // ---------------------------------------------------------------------------
    const now = Date.now()
    const subPhaseElapsed = subPhaseStartTime > 0 ? now - subPhaseStartTime : 0
    const subPhaseTotal = subPhase?.duration ?? (matchPhase === "between" ? 5000 : 0)
    const phaseElapsed = phaseStartTime > 0 ? now - phaseStartTime : 0
    const phaseDuration = getPhaseDuration(matchPhase)
    const phaseRemaining = Math.max(0, phaseDuration - phaseElapsed)

    // View helpers — convert normalized coords to screen coords for the start dot
    const viewX = (v: number) => (flip ? 1 - v : v)
    const viewY = (v: number) => (flip ? 1 - v : v)

    // Pick correct pre-computed SVG path for current orientation
    const shootingPath = flip ? SHOOTING_PATH_FLIPPED : SHOOTING_PATH

    const showZones = matchPhase === "auto" || matchPhase === "teleop"

    // ---------------------------------------------------------------------------
    // Render: Field
    // ---------------------------------------------------------------------------
    const renderField = () => (
        <div
            ref={fieldRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => setDragging(false)}
            className="relative w-full aspect-2/1 rounded-xl overflow-hidden touch-none"
            // Container is NEVER rotated — only the image and zone positions flip
        >
            {/* Field image flips via CSS when setting says 180 */}
            <img
                src="/seasons/2026/field-lovat.png"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                alt="field"
                style={{transform: flip ? "rotate(180deg)" : "none"}}
            />

            {/* Zone overlays — positions computed with flip, text always upright */}
            {showZones && (
                <>
                    <ZoneButton
                        zone={ZONES.neutral}
                        label="INTAKE"
                        color="bg-blue-600"
                        onClick={() => handleZoneClick("neutral")}
                        active={currentZone === "neutral"}
                        flip={flip}
                    />
                    <ZoneButton
                        zone={ZONES.transitionLeft}
                        label="TRANS"
                        color="bg-purple-600"
                        onClick={() => handleZoneClick("transitionLeft")}
                        active={currentZone === "transitionLeft"}
                        flip={flip}
                    />
                    <ZoneButton
                        zone={ZONES.transitionRight}
                        label="TRANS"
                        color="bg-purple-600"
                        onClick={() => handleZoneClick("transitionRight")}
                        active={currentZone === "transitionRight"}
                        flip={flip}
                    />
                    <ZoneButton
                        zone={ZONES.intakeTop}
                        label="IN"
                        color="bg-blue-600"
                        onClick={() => handleZoneClick("intakeTop")}
                        active={currentZone === "intakeTop"}
                        flip={flip}
                    />
                    <ZoneButton
                        zone={ZONES.intakeBottom}
                        label="IN"
                        color="bg-blue-600"
                        onClick={() => handleZoneClick("intakeBottom")}
                        active={currentZone === "intakeBottom"}
                        flip={flip}
                    />
                    <ZoneButton
                        zone={ZONES.climb}
                        label="CLIMB"
                        color="bg-orange-600"
                        onClick={() => handleZoneClick("climb")}
                        active={currentZone === "climb"}
                        flip={flip}
                    />

                    {/* Shooting zone — SVG path with cutouts for intake/climb */}
                    <ZoneButton
                        zone={ZONES.shootingFull}
                        svgPath={shootingPath}
                        label="SHOOT"
                        color="bg-green-600"
                        onClick={() => handleZoneClick("shooting")}
                        active={currentZone === "shooting"}
                        flip={flip}
                    />

                    {/* Defense zone — simple rect on opposite side, teleop only */}
                    {matchPhase === "teleop" && (
                        <ZoneButton
                            zone={DEFENSE_RECT}
                            label="DEFENSE"
                            color="bg-red-600"
                            onClick={() => handleZoneClick("defense")}
                            active={currentZone === "defense"}
                            flip={flip}
                        />
                    )}
                </>
            )}

            {/* Starting position indicator */}
            {matchPhase === "prestart" && startPos && (
                <div
                    className="absolute"
                    style={{
                        width: "3.75%",
                        height: "7.5%",
                        left: `${viewX(startPos.x) * 100}%`,
                        top: `${viewY(startPos.y) * 100}%`,
                        transform: "translate(-50%, -50%)",
                    }}
                >
                    <div className="absolute inset-0 bg-zinc-600/50 border-2 rounded-xs border-zinc-800"/>
                </div>
            )}
        </div>
    )

    // ---------------------------------------------------------------------------
    // Render: Controls
    // ---------------------------------------------------------------------------
    const renderControls = () => {
        if (matchPhase === "prestart") {
            return (
                <div className="flex flex-col gap-4">
                    <div className="text-zinc-500 text-center py-4 text-sm">
                        Set starting position on field
                    </div>
                    <button
                        onClick={handleStartMatch}
                        disabled={!startPos}
                        className={`h-20 rounded-xl text-2xl font-bold transition-colors ${
                            startPos
                                ? "bg-green-700 hover:bg-green-600"
                                : "bg-zinc-800 opacity-40 cursor-not-allowed"
                        }`}
                    >
                        {startPos ? "START MATCH ▶" : "Set starting position first"}
                    </button>
                </div>
            )
        }

        if (matchPhase === "post") {
            return (
                <div className="flex flex-col gap-4">
                    <div className="text-zinc-400 text-center py-8">
                        Match complete! Review and submit data.
                    </div>
                    <button
                        onClick={() => {/* Navigate to post-match */
                        }}
                        className="h-16 bg-green-700 rounded-xl text-xl font-bold"
                    >
                        FINISH & SUBMIT →
                    </button>
                </div>
            )
        }

        return (
            <div className="flex flex-col gap-3 items-center h-full">
                {/* Score display */}
                <div className="text-white text-3xl font-bold font-mono">
                    Score: {score}
                </div>

                {/* Slider container */}
                <div className="relative flex flex-col items-center select-none flex-1 w-full max-w-[16rem]">
                    {/* Labels */}
                    <span className="text-green-400 text-xs font-bold mb-1">+ ADD</span>

                    <div
                        ref={sliderRef}
                        className="relative w-full flex-1 bg-zinc-800 rounded-2xl border-2 border-zinc-600 overflow-hidden touch-none"
                        onPointerDown={(e) => {
                            e.preventDefault()
                            ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
                            const rect = sliderRef.current!.getBoundingClientRect()
                            const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
                            sliderYRef.current = y
                            setSliderY(y)

                            // Instant score change based on initial direction
                            const displacement = y - 0.5
                            if (Math.abs(displacement) > 0.05) { // Outside dead zone
                                const direction = displacement < 0 ? 1 : -1
                                setScore((prev) => {
                                    const next = prev + direction
                                    console.log(`[ScoreSlider] INSTANT ${direction > 0 ? '+' : ''}${direction} → score: ${next}`)
                                    return next
                                })
                            }

                            setSliderActive(true)
                            console.log("[ScoreSlider] Pointer down at y:", y.toFixed(3))
                        }}
                        onPointerMove={(e) => {
                            if (!sliderActive) return
                            const rect = sliderRef.current!.getBoundingClientRect()
                            const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
                            sliderYRef.current = y   // ref updates instantly for the rAF loop
                            setSliderY(y)             // state updates for visual rendering
                        }}
                        onPointerUp={() => {
                            setSliderActive(false)
                            sliderYRef.current = 0.5
                            setSliderY(0.5)
                            console.log("[ScoreSlider] Pointer up — reset to center")
                        }}
                        onPointerLeave={() => {
                            if (sliderActive) {
                                setSliderActive(false)
                                sliderYRef.current = 0.5
                                setSliderY(0.5)
                                console.log("[ScoreSlider] Pointer left — reset to center")
                            }
                        }}
                    >

                        {/* Center dead zone line */}
                        <div
                            className="absolute left-0 right-0 border-t-2 border-dashed border-zinc-400/50"
                            style={{top: "50%"}}
                        />

                        {/* Thumb */}
                        <div
                            className={`absolute left-1 right-1 h-10 rounded-xl transition-colors duration-100 flex items-center justify-center ${
                                sliderActive
                                    ? sliderY < 0.45
                                        ? "bg-green-500 shadow-lg shadow-green-500/30"
                                        : sliderY > 0.55
                                            ? "bg-red-500 shadow-lg shadow-red-500/30"
                                            : "bg-zinc-400"
                                    : "bg-zinc-500"
                            }`}
                            style={{
                                top: `${sliderY * 100}%`,
                                transform: "translateY(-50%)",
                                pointerEvents: "none",
                            }}
                        >
                            <span className="text-white text-xs font-bold">
                                {(() => {
                                    if (!sliderActive) return "▲▼"
                                    const disp = Math.abs(sliderY - 0.5)
                                    if (disp < SLIDER_DEAD_ZONE) return "—"
                                    const mag = (disp - SLIDER_DEAD_ZONE) / (0.5 - SLIDER_DEAD_ZONE)
                                    const ms = Math.round(msFromMagnitude(mag))
                                    return sliderY < 0.5 ? `+${ms}ms` : `−${ms}ms`
                                })()}
                            </span>
                        </div>
                    </div>

                    <span className="text-red-400 text-xs font-bold mt-1">− SUB</span>
                </div>

                {/* Current zone indicator */}
                <span className="text-xs text-zinc-500">
                    Current zone: {currentZone || "none"}
                </span>
            </div>
        )
    }

    // ---------------------------------------------------------------------------
    // Layout
    // ---------------------------------------------------------------------------
    if (deviceType === "tablet") {
        return (
            <div className="w-screen h-max flex flex-col select-none text-sm">
                <HeaderStrip
                    phase={matchPhase}
                    subPhase={subPhase}
                    subPhaseElapsed={subPhaseElapsed}
                    subPhaseTotal={subPhaseTotal}
                    phaseRemaining={phaseRemaining}
                    flashing={flashing}
                />
                <div className="flex-1 flex gap-3 p-3 overflow-hidden">
                    <div className="flex-3 flex flex-col gap-3">{renderField()}</div>
                    <div className="flex-1 flex flex-col gap-3 overflow-y-auto">{renderControls()}</div>
                </div>
            </div>
        )
    }

    return (
        <div className="w-screen h-max flex flex-col select-none text-sm">
            <HeaderStrip
                phase={matchPhase}
                subPhase={subPhase}
                subPhaseElapsed={subPhaseElapsed}
                subPhaseTotal={subPhaseTotal}
                phaseRemaining={phaseRemaining}
                flashing={flashing}
            />
            <div className="flex-1 flex flex-col p-2 gap-4 overflow-y-auto">
                {renderField()}
                {renderControls()}
            </div>
        </div>
    )
}